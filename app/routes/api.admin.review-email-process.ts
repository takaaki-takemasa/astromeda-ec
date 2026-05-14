/**
 * /api/admin/review-email-process - 送信待ち queue を処理 (cron / scheduled task で実行)
 *
 * scheduled_at <= now のキューを取得 → トークン発行 → メール送信 → status=sent
 *
 * Phase 4 / 2026-05-14
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.review-email-process';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { auditLog } from '~/lib/audit-log';

const CONFIG_TYPE = 'astromeda_review_email_config';
const QUEUE_TYPE = 'astromeda_review_email_queue';
const TOKEN_TYPE = 'astromeda_review_token';

async function getAdmin(context: any) {
  const { getAdminClient, setAdminEnv } = await import('../../agents/core/shopify-admin.js');
  setAdminEnv(context.env);
  return getAdminClient();
}

function flatten(node: any) {
  const obj: any = { id: node.id };
  for (const f of node.fields) obj[f.key] = f.value;
  return obj;
}

function genToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID().replace(/-/g, '');
  }
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{([a-z_]+)\}\}/g, (_m, k) => vars[k] ?? '');
}

async function sendMail(context: any, to: string, subject: string, body: string, replyTo?: string) {
  // Shopify GraphQL に メール送信は無いため、外部 SMTP / Klaviyo / SendGrid 連携が必要
  // ここでは契約済の送信サービスを呼ぶ (環境変数 EMAIL_API_URL + EMAIL_API_KEY)
  const apiUrl = (context.env as any).EMAIL_API_URL || '';
  const apiKey = (context.env as any).EMAIL_API_KEY || '';
  if (!apiUrl || !apiKey) {
    // 開発時: コンソール出力のみ
    console.log('[Email] would send to:', to, '| subject:', subject);
    return { ok: true, dryRun: true };
  }
  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      to, subject, text: body, reply_to: replyTo || undefined,
      from: 'noreply@mining-base.co.jp',
      from_name: 'ASTROMEDA',
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    return { ok: false, error: t.slice(0, 300) };
  }
  return { ok: true };
}

export async function action({ request, context }: Route.ActionArgs) {
  // 内部呼出し or admin call。scheduled task からのトリガーを許可するため特別な ALLOWED_TOKEN を使用
  const auth = request.headers.get('authorization') || '';
  const allowed = (context.env as any).SCHEDULED_TASK_TOKEN || '';
  if (!auth.startsWith('Bearer ') || !allowed || auth.slice(7) !== allowed) {
    return data({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const rl = await applyRateLimit(request, RATE_LIMIT_PRESETS.admin, 'review-email-process');
  if (rl) return rl;

  const admin = await getAdmin(context);
  const now = new Date().toISOString();
  const origin = new URL(request.url).origin;

  // 取得: queued かつ scheduled_at <= now
  const qR = await admin.graphql(
    `{metaobjects(type:"${QUEUE_TYPE}",first:50,query:"fields.status:queued"){nodes{id fields{key value}}}}`,
  );
  const all = (qR?.data?.metaobjects?.nodes || []).map(flatten);
  const ready = all.filter((q: any) => q.scheduled_at && q.scheduled_at <= now);

  const results: any[] = [];
  for (const q of ready) {
    // config 取得
    const configR = await admin.graphql(`query($id:ID!){metaobject(id:$id){id fields{key value}}}`, { id: q.config_id });
    const cfg = configR?.data?.metaobject ? flatten(configR.data.metaobject) : null;
    if (!cfg || cfg.enabled !== 'true') {
      // 設定が無効化されていたらキャンセル
      await admin.graphql(
        `mutation($id:ID!,$mo:MetaobjectUpdateInput!){metaobjectUpdate(id:$id,metaobject:$mo){metaobject{id}}}`,
        { id: q.id, mo: { fields: [{ key: 'status', value: 'canceled' }] } },
      );
      results.push({ id: q.id, action: 'canceled' });
      continue;
    }

    // トークン発行
    const tokenValue = genToken();
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const productRefs = q.product_refs || '[]';
    const tR = await admin.graphql(
      `mutation($mo:MetaobjectCreateInput!){metaobjectCreate(metaobject:$mo){metaobject{id} userErrors{message}}}`,
      {
        mo: {
          type: TOKEN_TYPE,
          fields: [
            { key: 'token', value: tokenValue },
            { key: 'email', value: q.email },
            { key: 'customer_name', value: q.customer_name || '' },
            { key: 'order_id', value: q.order_id },
            { key: 'token_type', value: 'purchase' },
            { key: 'product_refs', value: productRefs },
            { key: 'expires_at', value: expiresAt },
            { key: 'issued_by', value: 'system_auto' },
          ],
        },
      },
    );
    const tokenId = tR?.data?.metaobjectCreate?.metaobject?.id;
    if (!tokenId) {
      await admin.graphql(
        `mutation($id:ID!,$mo:MetaobjectUpdateInput!){metaobjectUpdate(id:$id,metaobject:$mo){metaobject{id}}}`,
        { id: q.id, mo: { fields: [{ key: 'status', value: 'failed' }, { key: 'error_message', value: 'token_create_failed' }] } },
      );
      results.push({ id: q.id, action: 'failed', reason: 'token_create_failed' });
      continue;
    }

    // 商品タイトル取得 (1 件目)
    let productTitle = '';
    try {
      const pids = JSON.parse(productRefs);
      if (pids[0]) {
        const pR = await admin.graphql(`query($id:ID!){product(id:$id){title}}`, { id: pids[0] });
        productTitle = pR?.data?.product?.title || '';
      }
    } catch {}

    // テンプレート展開
    const reviewUrl = `${origin}/apps/reviews/submit?token=${tokenValue}`;
    const vars = {
      customer_name: q.customer_name || 'お客様',
      product_title: productTitle,
      review_url: reviewUrl,
      delay_days: cfg.delay_days || '14',
    };
    const subject = renderTemplate(cfg.subject || 'レビューのお願い', vars);
    const bodyText = renderTemplate(cfg.body_template || '', vars);

    // 送信
    const send = await sendMail(context, q.email, subject, bodyText, cfg.reply_to);
    if (!send.ok) {
      await admin.graphql(
        `mutation($id:ID!,$mo:MetaobjectUpdateInput!){metaobjectUpdate(id:$id,metaobject:$mo){metaobject{id}}}`,
        { id: q.id, mo: { fields: [{ key: 'status', value: 'failed' }, { key: 'error_message', value: String(send.error || 'send_failed').slice(0, 200) }] } },
      );
      results.push({ id: q.id, action: 'failed', reason: send.error });
      continue;
    }

    // 成功 → status=sent
    await admin.graphql(
      `mutation($id:ID!,$mo:MetaobjectUpdateInput!){metaobjectUpdate(id:$id,metaobject:$mo){metaobject{id}}}`,
      {
        id: q.id,
        mo: {
          fields: [
            { key: 'status', value: 'sent' },
            { key: 'sent_at', value: new Date().toISOString() },
            { key: 'token_id', value: tokenId },
          ],
        },
      },
    );
    results.push({ id: q.id, action: 'sent', tokenId, dryRun: send.dryRun });
  }

  await auditLog({
    actor: 'system_scheduler',
    action: 'review_email.batch_process',
    resource: 'astromeda_review_email_queue',
    details: { processed: results.length, sent: results.filter(r => r.action === 'sent').length },
  });

  return data({ ok: true, processed: results.length, results });
}
