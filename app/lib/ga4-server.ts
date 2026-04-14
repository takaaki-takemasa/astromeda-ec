/**
 * GA4 Measurement Protocol — サーバーサイド購入トラッキング
 *
 * 医学メタファー: 出生証明書（サーバーサイドで確実に記録）
 * クライアントサイドのGA4イベントは広告ブロッカーで欠落するが、
 * サーバーサイドMeasurement Protocolなら確実に記録される。
 *
 * Webhook orders/paid → この関数でGA4にpurchaseイベント送信
 * = 出産が完了した瞬間に出生届を役所に提出するのと同じ。
 *
 * @see https://developers.google.com/analytics/devguides/collection/protocol/ga4
 */

interface GA4ServerItem {
  item_id: string;
  item_name: string;
  item_brand?: string;
  item_category?: string;
  item_variant?: string;
  price?: number;
  quantity?: number;
}

interface GA4PurchasePayload {
  /** GA4 Measurement ID (G-XXXXXXX) */
  measurementId: string;
  /** GA4 API Secret */
  apiSecret: string;
  /** クライアントID（Shopifyの顧客IDで代用） */
  clientId: string;
  /** 注文情報 */
  order: {
    orderId: string;
    orderName?: string;
    totalAmount: number;
    tax?: number;
    shipping?: number;
    currency?: string;
    coupon?: string;
    items: GA4ServerItem[];
  };
}

/**
 * GA4 Measurement ProtocolでPurchaseイベントを送信
 *
 * 成功/失敗に関わらず例外をスローしない（売上記録の失敗で注文処理を止めない）
 */
export async function sendServerPurchaseEvent(payload: GA4PurchasePayload): Promise<boolean> {
  const { measurementId, apiSecret, clientId, order } = payload;

  if (!measurementId || !apiSecret) {
    process.env.NODE_ENV === 'development' && console.warn('[GA4-Server] Missing measurementId or apiSecret, skipping');
    return false;
  }

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;

  const body = {
    client_id: clientId,
    events: [
      {
        name: 'purchase',
        params: {
          transaction_id: order.orderId,
          value: order.totalAmount,
          tax: order.tax ?? 0,
          shipping: order.shipping ?? 0,
          currency: order.currency ?? 'JPY',
          coupon: order.coupon ?? '',
          items: order.items.map((item) => ({
            item_id: item.item_id,
            item_name: item.item_name,
            item_brand: item.item_brand ?? 'ASTROMEDA',
            item_category: item.item_category ?? '',
            item_variant: item.item_variant ?? '',
            price: item.price ?? 0,
            quantity: item.quantity ?? 1,
          })),
        },
      },
    ],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000); // 10s for external API

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (response.ok) {
      process.env.NODE_ENV === 'development' && console.log(`[GA4-Server] Purchase event sent: ${order.orderId} (¥${order.totalAmount})`);
      return true;
    }

    process.env.NODE_ENV === 'development' && console.warn(`[GA4-Server] Failed: ${response.status} ${response.statusText}`);
    return false;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      process.env.NODE_ENV === 'development' && console.error('[GA4-Server] Request timeout');
    } else {
      process.env.NODE_ENV === 'development' && console.error('[GA4-Server] Network error:', err);
    }
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Shopify Webhook注文データからGA4ペイロードを構築
 *
 * 医学メタファー: 出生情報の標準化（母子手帳→出生届フォーマット変換）
 */
export function buildPurchaseFromWebhook(
  order: Record<string, unknown>,
  env: { measurementId?: string; apiSecret?: string },
): GA4PurchasePayload | null {
  if (!env.measurementId || !env.apiSecret) return null;

  const lineItems = (order.line_items as Array<Record<string, unknown>> | undefined) ?? [];
  const customer = order.customer as Record<string, unknown> | undefined;

  return {
    measurementId: env.measurementId,
    apiSecret: env.apiSecret,
    clientId: customer?.id
      ? String(customer.id)
      : `shopify_${String(order.id ?? Date.now())}`,
    order: {
      orderId: String(order.order_number ?? order.id ?? ''),
      orderName: String(order.name ?? ''),
      totalAmount: parseFloat(String(order.total_price ?? '0')),
      tax: parseFloat(String(order.total_tax ?? '0')),
      shipping: parseFloat(
        String(
          (order.total_shipping_price_set as Record<string, unknown>)
            ?.shopMoney
            ? ((order.total_shipping_price_set as Record<string, unknown>).shopMoney as Record<string, unknown>)?.amount
            : order.shipping_lines
              ? ((order.shipping_lines as Array<Record<string, unknown>>)[0]?.price ?? '0')
              : '0',
        ),
      ),
      currency: String(order.currency ?? 'JPY'),
      coupon: (order.discount_codes as Array<Record<string, unknown>> | undefined)?.[0]?.code
        ? String((order.discount_codes as Array<Record<string, unknown>>)[0].code)
        : '',
      items: lineItems.map((item) => ({
        item_id: String(item.product_id ?? ''),
        item_name: String(item.title ?? ''),
        item_brand: String(item.vendor ?? 'ASTROMEDA'),
        item_category: String(item.product_type ?? ''),
        item_variant: String(item.variant_title ?? ''),
        price: parseFloat(String(item.price ?? '0')),
        quantity: Number(item.quantity ?? 1),
      })),
    },
  };
}
