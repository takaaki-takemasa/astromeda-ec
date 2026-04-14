/**
 * GA4 Events — 包括的なイベント追跡ユーティリティ
 *
 * CRO（Conversion Rate Optimization）用の詳細なGA4イベント。
 * 基本的なecommerce機能に加えて、プロモーション、ソーシャルシェア、リード生成など
 * マーケティング全体のファネル分析をサポート。
 *
 * SSR対応: 全関数は typeof window === 'undefined' をチェック。
 * エラーハンドリング: Analytics失敗はアプリをクラッシュさせない。
 *
 * @see https://developers.google.com/analytics/devguides/collection/ga4/events
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** GA4イベントの基本パラメータ型 */
interface GA4EventParams {
  [key: string]: unknown;
}

/** GA4 item構造体 */
interface GA4Item {
  item_id: string;
  item_name: string;
  price?: number;
  quantity?: number;
  item_brand?: string;
  item_category?: string;
  item_variant?: string;
  item_list_name?: string;
  index?: number;
  discount?: number;
  currency?: string;
}

/** gtagが利用可能か安全にチェック */
function isGtagAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
}

/** 安全にgtag送信 */
function sendEvent(eventName: string, params: GA4EventParams): void {
  if (!isGtagAvailable()) return;
  try {
    window.gtag!('event', eventName, params);
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[GA4] Event sent: ${eventName}`, params);
    }
  } catch (error) {
    // Analytics failure must never crash the app
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[GA4] Failed to send event: ${eventName}`, error);
    }
  }
}

/** Shopify Money → number変換 */
function toNumber(amount?: string | null): number | undefined {
  if (!amount) return undefined;
  const n = parseFloat(amount);
  return isNaN(n) ? undefined : n;
}

// ========================
// Ecommerce Events (既存互換)
// ========================

/**
 * view_item — 商品詳細ページ閲覧
 */
export function trackViewItem(product: {
  id: string;
  title: string;
  vendor?: string;
  productType?: string;
  variantPrice?: string;
  variantTitle?: string;
  currency?: string;
}): void {
  const item: GA4Item = {
    item_id: product.id.replace('gid://shopify/Product/', ''),
    item_name: product.title,
    item_brand: product.vendor || 'ASTROMEDA',
    item_category: product.productType || '',
    item_variant: product.variantTitle || '',
    price: toNumber(product.variantPrice),
    currency: product.currency || 'JPY',
  };
  sendEvent('view_item', {
    currency: item.currency,
    value: item.price,
    items: [item],
  });
}

/**
 * view_item_list — コレクション/検索結果一覧
 */
export function trackViewItemList(
  listName: string,
  products: Array<{
    id: string;
    title: string;
    price?: string;
    vendor?: string;
  }>,
): void {
  const items: GA4Item[] = products.slice(0, 20).map((p, i) => ({
    item_id: p.id.replace('gid://shopify/Product/', ''),
    item_name: p.title,
    item_brand: p.vendor || 'ASTROMEDA',
    price: toNumber(p.price),
    index: i,
    item_list_name: listName,
    currency: 'JPY',
  }));
  sendEvent('view_item_list', {
    item_list_name: listName,
    items,
  });
}

/**
 * select_item — 商品一覧から商品を選択
 */
export function trackSelectItem(
  listName: string,
  product: {id: string; title: string; price?: string; index?: number},
): void {
  sendEvent('select_item', {
    item_list_name: listName,
    items: [
      {
        item_id: product.id.replace('gid://shopify/Product/', ''),
        item_name: product.title,
        price: toNumber(product.price),
        index: product.index,
      },
    ],
  });
}

/**
 * add_to_cart — カート追加
 */
export function trackAddToCart(product: {
  id: string;
  title: string;
  price?: string;
  quantity?: number;
  variant?: string;
  currency?: string;
}): void {
  const item: GA4Item = {
    item_id: product.id.replace('gid://shopify/Product/', ''),
    item_name: product.title,
    item_brand: 'ASTROMEDA',
    price: toNumber(product.price),
    quantity: product.quantity || 1,
    item_variant: product.variant || '',
    currency: product.currency || 'JPY',
  };
  sendEvent('add_to_cart', {
    currency: item.currency,
    value: (item.price || 0) * (item.quantity || 1),
    items: [item],
  });
}

/**
 * remove_from_cart — カートから削除
 */
export function trackRemoveFromCart(product: {
  id: string;
  title: string;
  price?: string;
  quantity?: number;
}): void {
  sendEvent('remove_from_cart', {
    currency: 'JPY',
    value: toNumber(product.price),
    items: [
      {
        item_id: product.id.replace('gid://shopify/Product/', ''),
        item_name: product.title,
        price: toNumber(product.price),
        quantity: product.quantity || 1,
      },
    ],
  });
}

/**
 * view_cart — カート閲覧
 */
export function trackViewCart(cart: {
  totalAmount?: string;
  currency?: string;
  items: Array<{
    id: string;
    title: string;
    price?: string;
    quantity?: number;
  }>;
}): void {
  sendEvent('view_cart', {
    currency: cart.currency || 'JPY',
    value: toNumber(cart.totalAmount),
    items: cart.items.map((item) => ({
      item_id: item.id.replace('gid://shopify/Product/', ''),
      item_name: item.title,
      price: toNumber(item.price),
      quantity: item.quantity || 1,
    })),
  });
}

/**
 * begin_checkout — チェックアウト開始
 */
export function trackBeginCheckout(cart: {
  totalAmount?: string;
  currency?: string;
  lines?: Array<{
    id: string;
    title: string;
    price?: string;
    quantity?: number;
  }>;
}): void {
  sendEvent('begin_checkout', {
    currency: cart.currency || 'JPY',
    value: toNumber(cart.totalAmount),
    items:
      cart.lines?.map((line) => ({
        item_id: line.id,
        item_name: line.title,
        price: toNumber(line.price),
        quantity: line.quantity || 1,
      })) || [],
  });
}

/**
 * purchase — 購入完了（最重要イベント）
 * Shopifyチェックアウト完了後のサンクスページで発火。
 */
export function trackPurchase(order: {
  orderId: string;
  totalAmount: string;
  tax?: string;
  shipping?: string;
  currency?: string;
  coupon?: string;
  items: Array<{
    id: string;
    title: string;
    price?: string;
    quantity?: number;
    variant?: string;
    category?: string;
  }>;
}): void {
  const items: GA4Item[] = order.items.map((item) => ({
    item_id: item.id.replace('gid://shopify/Product/', '').replace('gid://shopify/ProductVariant/', ''),
    item_name: item.title,
    item_brand: 'ASTROMEDA',
    price: toNumber(item.price),
    quantity: item.quantity || 1,
    item_variant: item.variant || '',
    item_category: item.category || '',
    currency: order.currency || 'JPY',
  }));

  sendEvent('purchase', {
    transaction_id: order.orderId,
    value: toNumber(order.totalAmount),
    tax: toNumber(order.tax),
    shipping: toNumber(order.shipping),
    currency: order.currency || 'JPY',
    coupon: order.coupon || '',
    items,
  });
}

/**
 * search — サイト内検索
 */
export function trackSearch(searchTerm: string): void {
  sendEvent('search', {
    search_term: searchTerm,
  });
}

// ========================
// Promotion Events
// ========================

/**
 * view_promotion — バナー/プロモーション インプレッション
 */
export function trackViewPromotion(promotion: {
  promotion_id?: string;
  promotion_name: string;
  creative_name?: string;
  creative_slot?: string;
  location_id?: string;
}): void {
  sendEvent('view_promotion', {
    promotion_id: promotion.promotion_id || promotion.promotion_name,
    promotion_name: promotion.promotion_name,
    creative_name: promotion.creative_name,
    creative_slot: promotion.creative_slot,
    location_id: promotion.location_id,
  });
}

/**
 * select_promotion — バナー/プロモーション クリック
 */
export function trackSelectPromotion(promotion: {
  promotion_id?: string;
  promotion_name: string;
  creative_name?: string;
  creative_slot?: string;
  location_id?: string;
}): void {
  sendEvent('select_promotion', {
    promotion_id: promotion.promotion_id || promotion.promotion_name,
    promotion_name: promotion.promotion_name,
    creative_name: promotion.creative_name,
    creative_slot: promotion.creative_slot,
    location_id: promotion.location_id,
  });
}

// ========================
// Social & Engagement Events
// ========================

/**
 * share — ソーシャルメディア共有
 */
export function trackShare(params: {
  content_type: string;
  item_id?: string;
  method?: string;
}): void {
  sendEvent('share', {
    content_type: params.content_type,
    item_id: params.item_id,
    method: params.method || 'other',
  });
}

/**
 * generate_lead — リード生成（ニュースレター登録、お問い合わせなど）
 */
export function trackGenerateLead(params: {
  value?: number;
  currency?: string;
  lead_type?: string;
}): void {
  sendEvent('generate_lead', {
    value: params.value,
    currency: params.currency || 'JPY',
    lead_type: params.lead_type || 'newsletter',
  });
}

// ========================
// Utility Functions
// ========================

/**
 * Generic event tracker — カスタムイベント用
 */
export function trackCustomEvent(eventName: string, params: GA4EventParams): void {
  sendEvent(eventName, params);
}

/**
 * Check if analytics is enabled
 */
export function isAnalyticsEnabled(): boolean {
  return isGtagAvailable();
}

/**
 * Set user properties (e.g. customer_type: 'subscriber')
 */
export function setUserProperty(propertyName: string, value: unknown): void {
  if (!isGtagAvailable()) return;
  try {
    window.gtag!('config', {
      [propertyName]: value,
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[GA4] Failed to set user property: ${propertyName}`, error);
    }
  }
}

/**
 * Set user ID (for signed-in users)
 */
export function setUserId(userId: string): void {
  if (!isGtagAvailable()) return;
  try {
    window.gtag!('config', {
      user_id: userId,
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[GA4] Failed to set user ID', error);
    }
  }
}
