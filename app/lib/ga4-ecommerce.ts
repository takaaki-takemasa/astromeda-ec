/**
 * GA4 Ecommerce イベントユーティリティ（社会ネットワーク層 — 外界認知系）
 *
 * EC売上分析に必須のGA4標準eコマースイベントを送信する。
 * 人体で言えば「社会との接触記録」— どの商品を見たか、
 * カートに入れたか、購入したか、全てを記録する。
 *
 * 環境変数 PUBLIC_GA_MEASUREMENT_ID が未設定の場合は何もしない（安全）。
 *
 * @see https://developers.google.com/analytics/devguides/collection/ga4/ecommerce
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
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
  discount?: number;
  currency?: string;
}

/** gtagが利用可能か安全にチェック */
function isGtagAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
}

/** 安全にgtag送信 */
function sendEvent(eventName: string, params: Record<string, unknown>) {
  if (!isGtagAvailable()) return;
  try {
    window.gtag!('event', eventName, params);
  } catch {
    // Analytics failure must never crash the app
  }
}

/** Shopify Money → number変換 */
function toNumber(amount?: string | null): number | undefined {
  if (!amount) return undefined;
  const n = parseFloat(amount);
  return isNaN(n) ? undefined : n;
}

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
}) {
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
) {
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
 * add_to_cart — カート追加
 */
export function trackAddToCart(product: {
  id: string;
  title: string;
  price?: string;
  quantity?: number;
  variant?: string;
  currency?: string;
}) {
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
}) {
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
}) {
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
 * search — サイト内検索
 */
export function trackSearch(searchTerm: string) {
  sendEvent('search', {search_term: searchTerm});
}

/**
 * purchase — 購入完了
 * Shopifyチェックアウト完了後のサンクスページで発火
 * 売上計測の最重要イベント — これがないとROI計算不可能
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
}) {
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
 * select_item — 商品一覧から商品を選択
 */
export function trackSelectItem(
  listName: string,
  product: {id: string; title: string; price?: string},
) {
  sendEvent('select_item', {
    item_list_name: listName,
    items: [
      {
        item_id: product.id.replace('gid://shopify/Product/', ''),
        item_name: product.title,
        price: toNumber(product.price),
      },
    ],
  });
}

/**
 * view_cart — カート閲覧（Enhanced Ecommerce推奨イベント）
 * コンバージョンファネル分析に必須
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
}) {
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
