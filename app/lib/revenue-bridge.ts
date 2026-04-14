/**
 * Revenue Bridge — Webhook→AgentBus収益追跡ブリッジ
 *
 * 医学メタファー: 臍帯血管（胎盤→胎児への栄養供給路）
 * Shopify Webhookから受信した注文データを、
 * AgentBus互換のイベント形式に変換して内部システムに流す。
 *
 * 外界（Shopify）→ Bridge → AgentBus → AttributionEngine
 *                                    → RevenueWidget
 *                                    → FeedbackCollector
 *
 * Oxygen Workers環境で動作。AgentBusがない場合はログのみ（graceful degradation）。
 */

/** 標準化された注文イベント（AgentBus互換） */
export interface OrderEvent {
  /** イベント種別 */
  type: 'order.created' | 'order.paid' | 'order.cancelled' | 'order.updated';
  /** 注文ID（Shopify数値ID） */
  orderId: string;
  /** 注文番号（#1001など表示用） */
  orderName: string;
  /** 注文金額（JPY） */
  totalAmount: number;
  /** 税額 */
  tax: number;
  /** 配送料 */
  shipping: number;
  /** 通貨 */
  currency: string;
  /** 顧客ID */
  customerId?: string;
  /** 顧客メール */
  customerEmail?: string;
  /** ディスカウントコード */
  discountCodes: string[];
  /** 商品ライン数 */
  lineItemCount: number;
  /** 商品ライン詳細 */
  lineItems: Array<{
    productId: string;
    variantId: string;
    title: string;
    quantity: number;
    price: number;
  }>;
  /** UTMパラメータ（帰属用） */
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
  };
  /** Webhook受信タイムスタンプ */
  receivedAt: number;
  /** Shopifyショップドメイン */
  shopDomain: string;
}

/**
 * Shopify Webhook注文データ → OrderEvent変換
 *
 * 医学メタファー: 外部刺激の受容体変換（痛覚→電気信号）
 */
export function parseOrderWebhook(
  rawOrder: Record<string, unknown>,
  topic: string,
  shopDomain: string,
): OrderEvent {
  const lineItems = (rawOrder.line_items as Array<Record<string, unknown>> | undefined) ?? [];
  const customer = rawOrder.customer as Record<string, unknown> | undefined;
  const discountCodes = (rawOrder.discount_codes as Array<Record<string, unknown>> | undefined) ?? [];

  // UTMパラメータ抽出（landing_site or note_attributes から）
  const landingSite = String(rawOrder.landing_site ?? '');
  const utm = extractUTM(landingSite);

  // topic → type マッピング
  const typeMap: Record<string, OrderEvent['type']> = {
    'orders/create': 'order.created',
    'orders/paid': 'order.paid',
    'orders/cancelled': 'order.cancelled',
    'orders/updated': 'order.updated',
  };

  return {
    type: typeMap[topic] ?? 'order.created',
    orderId: String(rawOrder.id ?? ''),
    orderName: String(rawOrder.name ?? ''),
    totalAmount: parseFloat(String(rawOrder.total_price ?? '0')),
    tax: parseFloat(String(rawOrder.total_tax ?? '0')),
    shipping: extractShipping(rawOrder),
    currency: String(rawOrder.currency ?? 'JPY'),
    customerId: customer?.id ? String(customer.id) : undefined,
    customerEmail: customer?.email ? String(customer.email) : undefined,
    discountCodes: discountCodes.map((d) => String(d.code ?? '')).filter(Boolean),
    lineItemCount: lineItems.length,
    lineItems: lineItems.map((item) => ({
      productId: String(item.product_id ?? ''),
      variantId: String(item.variant_id ?? ''),
      title: String(item.title ?? ''),
      quantity: Number(item.quantity ?? 1),
      price: parseFloat(String(item.price ?? '0')),
    })),
    utm: utm.source ? utm : undefined,
    receivedAt: Date.now(),
    shopDomain,
  };
}

/**
 * 日次収益サマリー計算
 *
 * 医学メタファー: 血液検査（日次の健康指標）
 */
export function calculateDailyRevenue(events: OrderEvent[]): {
  totalRevenue: number;
  orderCount: number;
  averageOrderValue: number;
  cancelledRevenue: number;
  topProducts: Array<{ title: string; revenue: number; quantity: number }>;
} {
  const created = events.filter((e) => e.type === 'order.created' || e.type === 'order.paid');
  const cancelled = events.filter((e) => e.type === 'order.cancelled');

  const totalRevenue = created.reduce((sum, e) => sum + e.totalAmount, 0);
  const cancelledRevenue = cancelled.reduce((sum, e) => sum + e.totalAmount, 0);
  const orderCount = created.length;

  // 商品別集計
  const productMap = new Map<string, { title: string; revenue: number; quantity: number }>();
  for (const event of created) {
    for (const item of event.lineItems) {
      const existing = productMap.get(item.productId);
      if (existing) {
        existing.revenue += item.price * item.quantity;
        existing.quantity += item.quantity;
      } else {
        productMap.set(item.productId, {
          title: item.title,
          revenue: item.price * item.quantity,
          quantity: item.quantity,
        });
      }
    }
  }

  const topProducts = [...productMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    totalRevenue,
    orderCount,
    averageOrderValue: orderCount > 0 ? totalRevenue / orderCount : 0,
    cancelledRevenue,
    topProducts,
  };
}

// ── ヘルパー ──

function extractShipping(order: Record<string, unknown>): number {
  const shippingLines = order.shipping_lines as Array<Record<string, unknown>> | undefined;
  if (shippingLines?.[0]?.price) {
    return parseFloat(String(shippingLines[0].price));
  }
  return 0;
}

function extractUTM(landingSite: string): {
  source?: string;
  medium?: string;
  campaign?: string;
} {
  if (!landingSite) return {};
  try {
    const url = new URL(landingSite, 'https://placeholder.com');
    return {
      source: url.searchParams.get('utm_source') ?? undefined,
      medium: url.searchParams.get('utm_medium') ?? undefined,
      campaign: url.searchParams.get('utm_campaign') ?? undefined,
    };
  } catch {
    return {};
  }
}
