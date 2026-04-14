/**
 * Product Webhook受信エンドポイント
 *
 * POST /api/webhook/products
 *
 * 医学メタファー: 感覚神経 — 環境変化検知
 * 商品が作成/更新/削除されたとき、Shopifyが自動通知。
 * エージェントシステムが商品カタログの変化をリアルタイムで検知し、
 * キャッシュ無効化やUI更新をトリガーする。
 *
 * Shopify Webhook Topics:
 * - products/create: 新規商品
 * - products/update: 商品更新（価格変更、在庫変更等）
 * - products/delete: 商品削除
 *
 * セキュリティ: HMAC-SHA256署名検証必須
 */

import type { ActionFunctionArgs } from 'react-router';
import { verifyShopifyWebhook, extractWebhookMeta } from '~/lib/webhook-verify';

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Context.env is a dynamic runtime object provided by Oxygen with environment variables
  const env = context.env as unknown as {SHOPIFY_WEBHOOK_SECRET?: string};
  const secret = env.SHOPIFY_WEBHOOK_SECRET;

  if (!secret) {
    process.env.NODE_ENV === 'development' && console.error('[Webhook:Products] SHOPIFY_WEBHOOK_SECRET not configured');
    return new Response('Webhook not configured', { status: 500 });
  }

  const rawBody = await request.text();

  // HMAC-SHA256署名検証
  const hmacHeader = request.headers.get('X-Shopify-Hmac-Sha256');
  const isValid = await verifyShopifyWebhook(rawBody, hmacHeader, secret);

  if (!isValid) {
    process.env.NODE_ENV === 'development' && console.warn('[Webhook:Products] HMAC verification failed');
    return new Response('Unauthorized', { status: 401 });
  }

  const meta = extractWebhookMeta(request);

  try {
    const product = JSON.parse(rawBody) as Record<string, unknown>;

    process.env.NODE_ENV === 'development' && console.log(`[Webhook:Products] Received: ${meta.topic} | Product: ${product.title ?? product.id} | ${meta.shopDomain}`);

    // TODO: Phase 13以降でAgentBus連携
    // - products/update → KVキャッシュ無効化
    // - products/create → 新商品のカタログ追加
    // - products/delete → カタログから削除

    return new Response(JSON.stringify({
      received: true,
      topic: meta.topic,
      productId: product.id,
      timestamp: Date.now(),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    process.env.NODE_ENV === 'development' && console.error('[Webhook:Products] Parse error:', err);
    return new Response(JSON.stringify({ received: true, error: 'parse_failed' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function loader() {
  return new Response('Webhook endpoint - POST only', { status: 405 });
}
