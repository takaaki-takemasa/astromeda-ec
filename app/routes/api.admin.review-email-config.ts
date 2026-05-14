/**
 * /api/admin/review-email-config - レビュー依頼メール設定の管理 (管理者向け)
 *
 * GET:    全 config (グローバル + IP/カテゴリ別) 一覧
 * POST:   action=create | update | toggle | delete
 *         target_type='global' | 'ip_collection' | 'product_collection'
 *
 * デフォルト: enabled=false (オプトイン制)
 * 1 クリック有効化: action=toggle で enabled を反転
 *
 * Phase 4 / 2026-05-14
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.review-email-config';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';

const CONFIG_TYPE = 'astromeda_review_email_config';

const DEFAULT_SUBJECT = 'ASTROMEDA をご利用ありがとうございました - ご感想をお聞かせください';
const DEFAULT_BODY = `{{customer_name}} 様

このたびは ASTROMEDA {{product_title}} をご購入いただき、誠にありがとうございました。

ご購入から {{delay_days}} 日が経ちましたが、使い心地はいかがでしょうか？
ぜひご感想をお聞かせください。

▼ レビューを投稿する (所要約 3 分)
{{review_url}}

ASTROMEDA カスタマーサポート
shop.mining-base.co.jp`;

async function getAdmin(context: any) {
  const { getAdminClient, setAdminEnv } = await import('../../agents/core/shopify-admin.js');
  setAdminEnv(context.env);
  return getAdminClient();
}

function flatten(node: any) {
  const obj: any = { id: node.id, handle: node.handle };
  for (const f of node.fields) obj[f.key] = f.value;
  return obj;
}

// === GET ===
export async function loader({ request, context }: Route.LoaderArgs) {
  const rl = await applyRateLimit(request, RATE_LIMIT_PRESETS.admin, 'review-email-config');
  if (rl) return rl;

  const session = await AppSession.init(request as any, context as any);
  if (!session.get('isAdmin')) return data({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });

  const admin = await getAdmin(context);
  const q = `query{
    metaobjects(type:"${CONFIG_TYPE}",first:200){
      nodes{id handle fields{key value}}
    }
  }`;
  const r = await admin.graphql(q);
  const items = (r?.data?.metaobjects?.nodes || []).map(flatten);

  // global 1 件が存在しない場合は空状態を明示
  const hasGlobal = items.some((i: any) => i.target_type === 'global');
  return data({ ok: true, items, has_global: hasGlobal, defaults: { subject: DEFAULT_SUBJECT, body_template: DEFAULT_BODY, delay_days: 14 } });
}

// === POST ===
export async function action({ request, context }: Route.ActionArgs) {
  const rl = await applyRateLimit(request, RATE_LIMIT_PRESETS.admin, 'review-email-config-w');
  if (rl) return rl;

  const session = await AppSession.init(request as any, context as any);
  if (!session.get('isAdmin')) return data({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  const csrf = await verifyCsrfForAdmin(request);
  if (csrf) return csrf;

  let body: any;
  try { body = await request.json(); } catch { return data({ ok: false, error: 'INVALID_JSON' }, { status: 400 }); }
  const action_ = body?.action;
  const issuer = String(session.get('adminUser') || 'unknown');
  const now = new Date().toISOString();
  const admin = await getAdmin(context);

  if (action_ === 'create') {
    const { target_type, target_handle, target_label, delay_days, subject, body_template, reply_to, incentive_text } = body;
    if (!['global', 'ip_collection', 'product_collection'].includes(target_type))
      return data({ ok: false, error: 'INVALID_TARGET_TYPE' }, { status: 400 });
    if (target_type !== 'global' && !target_handle)
      return data({ ok: false, error: 'HANDLE_REQUIRED' }, { status: 400 });
    const days = parseInt(delay_days, 10);
    if (isNaN(days) || days < 1 || days > 90)
      return data({ ok: false, error: 'INVALID_DELAY_DAYS' }, { status: 400 });

    const fields = [
      { key: 'target_type', value: target_type },
      { key: 'target_handle', value: String(target_handle || '') },
      { key: 'target_label', value: String(target_label || '') },
      { key: 'enabled', value: 'false' },  // ★ デフォルト無効
      { key: 'delay_days', value: String(days) },
      { key: 'subject', value: String(subject || DEFAULT_SUBJECT) },
      { key: 'body_template', value: String(body_template || DEFAULT_BODY) },
      { key: 'reply_to', value: String(reply_to || '') },
      { key: 'incentive_text', value: String(incentive_text || '') },
      { key: 'last_modified_at', value: now },
      { key: 'last_modified_by', value: issuer },
    ];
    const r = await admin.graphql(
      `mutation($mo:MetaobjectCreateInput!){metaobjectCreate(metaobject:$mo){metaobject{id} userErrors{message}}}`,
      { mo: { type: CONFIG_TYPE, fields } },
    );
    const created = r?.data?.metaobjectCreate?.metaobject;
    if (!created) return data({ ok: false, error: 'CREATE_FAILED', detail: r?.data?.metaobjectCreate?.userErrors }, { status: 500 });
    await auditLog({ actor: issuer, action: 'review_email_config.create', resource: created.id, details: { target_type, target_handle } });
    return data({ ok: true, id: created.id });
  }

  if (action_ === 'update') {
    const { id, delay_days, subject, body_template, reply_to, incentive_text, target_label } = body;
    if (!id) return data({ ok: false, error: 'ID_REQUIRED' }, { status: 400 });
    const fields: any[] = [{ key: 'last_modified_at', value: now }, { key: 'last_modified_by', value: issuer }];
    if (delay_days !== undefined) {
      const d = parseInt(delay_days, 10);
      if (isNaN(d) || d < 1 || d > 90) return data({ ok: false, error: 'INVALID_DELAY_DAYS' }, { status: 400 });
      fields.push({ key: 'delay_days', value: String(d) });
    }
    if (subject !== undefined) fields.push({ key: 'subject', value: String(subject) });
    if (body_template !== undefined) fields.push({ key: 'body_template', value: String(body_template) });
    if (reply_to !== undefined) fields.push({ key: 'reply_to', value: String(reply_to) });
    if (incentive_text !== undefined) fields.push({ key: 'incentive_text', value: String(incentive_text) });
    if (target_label !== undefined) fields.push({ key: 'target_label', value: String(target_label) });
    const r = await admin.graphql(
      `mutation($id:ID!,$mo:MetaobjectUpdateInput!){metaobjectUpdate(id:$id,metaobject:$mo){metaobject{id} userErrors{message}}}`,
      { id, mo: { fields } },
    );
    if (!r?.data?.metaobjectUpdate?.metaobject)
      return data({ ok: false, error: 'UPDATE_FAILED', detail: r?.data?.metaobjectUpdate?.userErrors }, { status: 500 });
    await auditLog({ actor: issuer, action: 'review_email_config.update', resource: id, details: { fields: fields.map(f => f.key) } });
    return data({ ok: true });
  }

  if (action_ === 'toggle') {
    const { id, enabled } = body;
    if (!id) return data({ ok: false, error: 'ID_REQUIRED' }, { status: 400 });
    const enableStr = enabled === true || enabled === 'true' ? 'true' : 'false';
    const fields: any[] = [
      { key: 'enabled', value: enableStr },
      { key: 'last_modified_at', value: now },
      { key: 'last_modified_by', value: issuer },
    ];
    if (enableStr === 'true') {
      fields.push({ key: 'enabled_at', value: now }, { key: 'enabled_by', value: issuer });
    }
    const r = await admin.graphql(
      `mutation($id:ID!,$mo:MetaobjectUpdateInput!){metaobjectUpdate(id:$id,metaobject:$mo){metaobject{id} userErrors{message}}}`,
      { id, mo: { fields } },
    );
    if (!r?.data?.metaobjectUpdate?.metaobject)
      return data({ ok: false, error: 'TOGGLE_FAILED', detail: r?.data?.metaobjectUpdate?.userErrors }, { status: 500 });
    await auditLog({ actor: issuer, action: `review_email_config.${enableStr === 'true' ? 'enable' : 'disable'}`, resource: id });
    return data({ ok: true, enabled: enableStr === 'true' });
  }

  if (action_ === 'delete') {
    const { id } = body;
    if (!id) return data({ ok: false, error: 'ID_REQUIRED' }, { status: 400 });
    const r = await admin.graphql(`mutation($id:ID!){metaobjectDelete(id:$id){deletedId userErrors{message}}}`, { id });
    if (!r?.data?.metaobjectDelete?.deletedId)
      return data({ ok: false, error: 'DELETE_FAILED', detail: r?.data?.metaobjectDelete?.userErrors }, { status: 500 });
    await auditLog({ actor: issuer, action: 'review_email_config.delete', resource: id });
    return data({ ok: true });
  }

  return data({ ok: false, error: 'UNKNOWN_ACTION' }, { status: 400 });
}
