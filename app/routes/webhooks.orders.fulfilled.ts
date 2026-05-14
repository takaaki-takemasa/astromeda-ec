/**
 * /webhooks/orders/fulfilled - Shopify Order Fulfilled Webhook
 *
 * 受信: 注文発送イベント
 * 動作:
 *  1. 注文の各商品が属するコレクションを取得
 *  2. 各コレクション handle にマッチする astromeda_review_email_config (enabled=true) を検索
 *  3. マッチした config の中で最も限定的なもの (ip_collection > product_collection > global) を選択
 *  4. astromeda_review_email_queue にエントリ追加 (scheduled_at = now + delay_days)
 *
 * Phase 4 / 2026-05-14
 */

import { data } from 'react-router';
import type { Route } from './+types/webhooks.orders.fulfilled';

const CONFIG_TYPE = 'astromeda_review_email_config';
const QUEUE_TYPE = 'astromeda_review_email_queue';

async function getAdmin(context: any) {
  const { getAdminClient, setAdminEnv } = await import('../../agents/core/shopify-admin.js');
  setAdminEnv(context.env);
  return getAdminClient();
}

async function verifyHmac(request: Request, secret: string): Promise<boolean> {
  const hmac = request.headers.get('x-shopify-hmac-sha256');
  if (!hmac || !secret) return false;
  const bodyText = await request.clone().text();
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(bodyText));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return expected === hmac;
}

export async function action({ request, context }: Route.ActionArgs) {
  // HMAC 検証
  const secret = (context.env as any).SHOPIFY_WEBHOOK_SECRET || '';
  if (secret) {
    const ok = await verifyHmac(request, secret);
    if (!ok) return data({ ok: false, error: 'INVALID_HMAC' }, { status: 401 });
  }

  let order: any;
  try { order = await request.json(); } catch { return data({ ok: false, error: 'INVALID_JSON' }, { status: 400 }); }

  const orderId = String(order.id || '');
  const email = String(order.email || order.contact_email || '');
  const customerName = order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : '';
  const fulfilledAt = order.fulfillments?.[0]?.created_at || new Date().toISOString();

  if (!orderId || !email) {
    return data({ ok: true, skipped: 'NO_ORDER_OR_EMAIL' });
  }

  const admin = await getAdmin(context);

  // すべての有効な email_config を取得
  const configsR = await admin.graphql(`{
    metaobjects(type:"${CONFIG_TYPE}",first:100){
      nodes{id fields{key value}}
    }
  }`);
  const configs = (configsR?.data?.metaobjects?.nodes || []).map((n: any) => {
    const o: any = { id: n.id };
    for (const f of n.fields) o[f.key] = f.value;
    return o;
  }).filter((c: any) => c.enabled === 'true');

  if (configs.length === 0) {
    return data({ ok: true, skipped: 'NO_ENABLED_CONFIG' });
  }

  // 注文商品の集合と、それぞれが属するコレクションを取得
  const lineItemProductIds = (order.line_items || [])
    .map((li: any) => li.product_id ? `gid://shopify/Product/${li.product_id}` : null)
    .filter(Boolean);
  if (lineItemProductIds.length === 0) {
    return data({ ok: true, skipped: 'NO_PRODUCTS' });
  }

  const productsR = await admin.graphql(
    `query($ids:[ID!]!){nodes(ids:$ids){...on Product{id collections(first:50){edges{node{handle}}}}}}`,
    { ids: lineItemProductIds },
  );
  const productCollections: { [pid: string]: string[] } = {};
  const allCollHandles = new Set<string>();
  for (const n of productsR?.data?.nodes || []) {
    if (!n) continue;
    const hs = (n.collections?.edges || []).map((e: any) => e.node.handle);
    productCollections[n.id] = hs;
    hs.forEach((h: string) => allCollHandles.add(h));
  }

  // 各 product に対し最適 config を選択 (specific > general)
  function pickConfig(productCollHandles: string[]) {
    // ip_collection match (handle exact)
    for (const c of configs) {
      if (c.target_type === 'ip_collection' && productCollHandles.includes(c.target_handle)) return c;
    }
    for (const c of configs) {
      if (c.target_type === 'product_collection' && productCollHandles.includes(c.target_handle)) return c;
    }
    for (const c of configs) {
      if (c.target_type === 'global') return c;
    }
    return null;
  }

  // 既存 queue 確認 (重複防止)
  const existingR = await admin.graphql(
    `query($q:String!){metaobjects(type:"${QUEUE_TYPE}",first:5,query:$q){nodes{id}}}`,
    { q: `fields.order_id:${orderId}` },
  );
  if ((existingR?.data?.metaobjects?.nodes || []).length > 0) {
    return data({ ok: true, skipped: 'ALREADY_QUEUED' });
  }

  // 商品ごとに最適 config を割当て、最も適合する config 1 つを採用 (注文単位で 1 通)
  let chosenConfig: any = null;
  for (const pid of lineItemProductIds) {
    const c = pickConfig(productCollections[pid] || []);
    if (c) { chosenConfig = c; break; }
  }
  if (!chosenConfig) {
    return data({ ok: true, skipped: 'NO_MATCHING_CONFIG' });
  }

  const delayDays = parseInt(chosenConfig.delay_days, 10) || 14;
  const scheduledAt = new Date(new Date(fulfilledAt).getTime() + delayDays * 24 * 60 * 60 * 1000).toISOString();

  // Queue エントリ作成
  const r = await admin.graphql(
    `mutation($mo:MetaobjectCreateInput!){metaobjectCreate(metaobject:$mo){metaobject{id} userErrors{message}}}`,
    {
      mo: {
        type: QUEUE_TYPE,
        fields: [
          { key: 'order_id', value: orderId },
          { key: 'email', value: email },
          { key: 'customer_name', value: customerName },
          { key: 'product_refs', value: JSON.stringify(lineItemProductIds) },
          { key: 'config_id', value: chosenConfig.id },
          { key: 'fulfilled_at', value: fulfilledAt },
          { key: 'scheduled_at', value: scheduledAt },
          { key: 'status', value: 'queued' },
        ],
      },
    },
  );
  const queueId = r?.data?.metaobjectCreate?.metaobject?.id;
  return data({ ok: true, queued: !!queueId, queueId, scheduledAt, configId: chosenConfig.id });
}
