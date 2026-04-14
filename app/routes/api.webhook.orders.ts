/**
 * Order Webhook受信エンドポイント
 *
 * POST /api/webhook/orders
 *
 * 医学メタファー: 自律神経系 — 消化完了通知
 * 注文が作成/更新/キャンセルされたとき、Shopifyが自動通知。
 * エージェントシステムが注文データをリアルタイムで受信し、
 * Revenue追跡・Attribution計算に反映する。
 *
 * Shopify Webhook Topics:
 * - orders/create: 新規注文
 * - orders/updated: 注文更新
 * - orders/cancelled: 注文キャンセル
 * - orders/paid: 支払い完了
 *
 * セキュリティ: HMAC-SHA256署名検証必須
 */

import type { ActionFunctionArgs } from 'react-router';
import { verifyShopifyWebhook, extractWebhookMeta } from '~/lib/webhook-verify';
import { sendServerPurchaseEvent, buildPurchaseFromWebhook } from '~/lib/ga4-server';
import { parseOrderWebhook, type OrderEvent } from '~/lib/revenue-bridge';
import { isInitializedFlag } from '~/lib/agent-bridge';

export async function action({ request, context }: ActionFunctionArgs) {
  // POSTのみ受け付け
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Context.env is a dynamic runtime object provided by Oxygen with environment variables
  const env = context.env as unknown as {SHOPIFY_WEBHOOK_SECRET?: string};
  const secret = env.SHOPIFY_WEBHOOK_SECRET;

  if (!secret) {
    process.env.NODE_ENV === 'development' && console.error('[Webhook:Orders] SHOPIFY_WEBHOOK_SECRET not configured');
    return new Response('Webhook not configured', { status: 500 });
  }

  // リクエストボディを取得（HMAC検証のため生テキストで読む）
  const rawBody = await request.text();

  // HMAC-SHA256署名検証（免疫チェック）
  const hmacHeader = request.headers.get('X-Shopify-Hmac-Sha256');
  const isValid = await verifyShopifyWebhook(rawBody, hmacHeader, secret);

  if (!isValid) {
    process.env.NODE_ENV === 'development' && console.warn('[Webhook:Orders] HMAC verification failed');
    return new Response('Unauthorized', { status: 401 });
  }

  // メタデータ抽出
  const meta = extractWebhookMeta(request);

  try {
    const order = JSON.parse(rawBody) as Record<string, unknown>;

    // 注文データをログ + AgentBus/GA4連携
    const orderNum = order.order_number ?? order.id;
    process.env.NODE_ENV === 'development' && console.log(`[Webhook:Orders] Received: ${meta.topic} | Order #${orderNum} | ${meta.shopDomain}`);

    // RevenueBridge: Webhook→標準化OrderEvent変換（受容体変換）
    const orderEvent: OrderEvent = parseOrderWebhook(order, meta.topic ?? 'orders/create', meta.shopDomain ?? '');
    process.env.NODE_ENV === 'development' && console.log(`[Webhook:Orders] OrderEvent: ${orderEvent.type} | ¥${orderEvent.totalAmount} | ${orderEvent.lineItemCount} items`);

    // トピック別処理（生殖系: 受精→着床→出産の各段階）
    let ga4Sent = false;
    if (meta.topic === 'orders/paid' || meta.topic === 'orders/create') {
      // orders/paid: 出産完了 → GA4サーバーサイドで購入記録
      // orders/create: 受精確認 → 同様に記録（paid未対応ストア向けフォールバック）
      const ga4Payload = buildPurchaseFromWebhook(order, {
        measurementId: env.PUBLIC_GA_MEASUREMENT_ID as string | undefined,
        apiSecret: env.GA4_API_SECRET as string | undefined,
      });
      if (ga4Payload) {
        // non-blocking: GA4送信の失敗でWebhookレスポンスを遅延させない
        ga4Sent = await sendServerPurchaseEvent(ga4Payload).catch(() => false);
      }
      process.env.NODE_ENV === 'development' && console.log(`[Webhook:Orders] GA4 purchase event: ${ga4Sent ? 'sent' : 'skipped'} | Order #${orderNum}`);
    }

    if (meta.topic === 'orders/cancelled') {
      // orders/cancelled: 流産/死産 → 売上取消記録
      process.env.NODE_ENV === 'development' && console.log(`[Webhook:Orders] Order cancelled: #${orderNum} — revenue reversal logged`);
    }

    // AgentBusへイベント発行（神経伝達 — Webhookデータをエージェントシステムに伝搬）
    // パイプラインP13(データ分析)等のイベントトリガーと連携
    if (isInitializedFlag()) {
      try {
        const { getAgentBus } = await import('../../agents/registration/agent-registration.js');
        const bus = getAgentBus();
        if (bus) {
          await bus.publish({
            id: `webhook_order_${Date.now()}_${orderNum}`,
            type: `webhook.${(meta.topic ?? 'orders/create').replace('/', '.')}`,
            source: 'shopify-webhook',
            priority: 'high',
            payload: {
              orderId: order.id,
              orderNumber: orderNum,
              totalAmount: orderEvent.totalAmount,
              lineItemCount: orderEvent.lineItemCount,
              topic: meta.topic,
              shopDomain: meta.shopDomain,
            },
            timestamp: Date.now(),
          });
          process.env.NODE_ENV === 'development' && console.log(`[Webhook:Orders] AgentBus event published: webhook.${meta.topic?.replace('/', '.')}`);
        }
      } catch (busErr) {
        // AgentBus未初期化でもWebhookレスポンスに影響なし
        process.env.NODE_ENV === 'development' && console.warn('[Webhook:Orders] AgentBus publish failed (non-critical):', busErr instanceof Error ? busErr.message : busErr);
      }
    }

    // Shopifyは200レスポンスを期待（それ以外はリトライ）
    return new Response(JSON.stringify({
      received: true,
      topic: meta.topic,
      orderId: order.id,
      ga4Sent,
      timestamp: Date.now(),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    process.env.NODE_ENV === 'development' && console.error('[Webhook:Orders] Parse error:', err);
    // パースエラーでも200を返す（Shopifyの無限リトライを防止）
    return new Response(JSON.stringify({ received: true, error: 'parse_failed' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// GETは拒否
export async function loader() {
  return new Response('Webhook endpoint - POST only', { status: 405 });
}
