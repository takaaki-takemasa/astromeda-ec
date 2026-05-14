/**
 * /api/admin/review-tokens - レビュー依頼トークンの一括発行 (管理者向け)
 *
 * GET:  発行履歴一覧
 * POST: { entries: [{email, customer_name, product_handles, token_type, gift_note?}], send_email? }
 *
 * セキュリティ: AdminAuth → RBAC (reviews.manage) → CSRF (POST) → RateLimit → AuditLog
 *
 * Phase 3 / 2026-05-14
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.review-tokens';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';

const TOKEN_TYPE = 'astromeda_review_token';
const EXPIRES_DAYS = 90;

function genToken(): string {
  // UUID v4-like (using crypto.randomUUID if available, else fallback)
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID().replace(/-/g, '');
  }
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

async function getAdmin(context: any) {
  const { getAdminClient, setAdminEnv } = await import('../../agents/core/shopify-admin.js');
  setAdminEnv(context.env);
  return getAdminClient();
}

// === GET: 発行履歴一覧 ===
export async function loader({ request, context }: Route.LoaderArgs) {
  const rl = await applyRateLimit(request, RATE_LIMIT_PRESETS.admin, 'review-tokens-list');
  if (rl) return rl;

  const session = await AppSession.init(request as any, context as any);
  if (!session.get('isAdmin')) return data({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });

  const admin = await getAdmin(context);
  const q = `query{
    metaobjects(type:"${TOKEN_TYPE}",first:100,sortKey:"id"){
      nodes{id handle fields{key value}}
    }
  }`;
  const r = await admin.graphql(q);
  const items = (r?.data?.metaobjects?.nodes || []).map((n: any) => {
    const obj: any = { id: n.id, handle: n.handle };
    for (const f of n.fields) obj[f.key] = f.value;
    return obj;
  });
  return data({ ok: true, items });
}

// === POST: トークン一括発行 ===
export async function action({ request, context }: Route.ActionArgs) {
  const rl = await applyRateLimit(request, RATE_LIMIT_PRESETS.admin, 'review-tokens-create');
  if (rl) return rl;

  const session = await AppSession.init(request as any, context as any);
  if (!session.get('isAdmin')) return data({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });

  const csrf = await verifyCsrfForAdmin(request);
  if (csrf) return csrf;

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return data({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
  }
  const entries = payload?.entries;
  if (!Array.isArray(entries) || entries.length === 0)
    return data({ ok: false, error: 'NO_ENTRIES' }, { status: 400 });
  if (entries.length > 1000)
    return data({ ok: false, error: 'TOO_MANY_ENTRIES', max: 1000 }, { status: 413 });

  const admin = await getAdmin(context);
  const issuer = session.get('adminUser') || 'unknown';
  const expiresAt = new Date(Date.now() + EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // 商品 handle → ID 解決
  const allHandles = new Set<string>();
  for (const e of entries) {
    const handles = String(e.product_handles || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    handles.forEach((h: string) => allHandles.add(h));
  }
  const handleToId: Record<string, string> = {};
  for (const h of allHandles) {
    const r = await admin.graphql(`query($h:String!){p:productByHandle(handle:$h){id status publishedAt}}`, { h });
    const p = r?.data?.p;
    if (p && p.status === 'ACTIVE' && p.publishedAt) handleToId[h] = p.id;
  }

  const results: any[] = [];
  for (const e of entries) {
    const email = String(e.email || '').trim();
    const customerName = String(e.customer_name || '').trim();
    const tokenType = e.token_type === 'gift' ? 'gift' : 'purchase';
    const giftNote = String(e.gift_note || '').trim();
    const orderId = String(e.order_id || '').trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      results.push({ email, ok: false, error: 'INVALID_EMAIL' });
      continue;
    }
    const handles = String(e.product_handles || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const productIds = handles.map((h: string) => handleToId[h]).filter(Boolean);
    if (productIds.length === 0) {
      results.push({ email, ok: false, error: 'NO_VALID_PRODUCTS' });
      continue;
    }

    const token = genToken();
    const fields: { key: string; value: string }[] = [
      { key: 'token', value: token },
      { key: 'email', value: email },
      { key: 'customer_name', value: customerName },
      { key: 'token_type', value: tokenType },
      { key: 'product_refs', value: JSON.stringify(productIds) },
      { key: 'expires_at', value: expiresAt },
      { key: 'issued_by', value: issuer },
    ];
    if (orderId) fields.push({ key: 'order_id', value: orderId });
    if (giftNote) fields.push({ key: 'gift_note', value: giftNote });

    const r = await admin.graphql(
      `mutation($mo:MetaobjectCreateInput!){metaobjectCreate(metaobject:$mo){metaobject{id} userErrors{message}}}`,
      { mo: { type: TOKEN_TYPE, fields } },
    );
    const created = r?.data?.metaobjectCreate?.metaobject;
    if (created) {
      results.push({
        email,
        ok: true,
        tokenId: created.id,
        url: `${new URL(request.url).origin}/apps/reviews/submit?token=${token}`,
      });
    } else {
      results.push({ email, ok: false, error: r?.data?.metaobjectCreate?.userErrors?.[0]?.message });
    }
  }

  await auditLog({
    actor: issuer,
    action: 'review_tokens.bulk_create',
    resource: 'astromeda_review_token',
    details: { count: results.length, success: results.filter((r) => r.ok).length },
  });

  return data({
    ok: true,
    total: results.length,
    success: results.filter((r) => r.ok).length,
    results,
  });
}
