/**
 * EcommerceAnalytics — Eコマースイベント発火コンポーネント
 *
 * GA4 Enhanced Ecommerce + Meta Pixel Standard Events
 * 環境変数が設定されている場合のみ発火（dev環境では安全にスキップ）
 *
 * 使用方法:
 * - view_item: 商品詳細ページで <EcommerceViewItem product={product} />
 * - add_to_cart: カート追加時に trackAddToCart(product, quantity)
 * - purchase: 注文完了時にサーバーサイドでwebhook経由
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    dataLayer?: Record<string, unknown>[];
  }
}

// ── GA4 eコマースイベント ──

interface GA4Item {
  item_id: string;
  item_name: string;
  item_brand?: string;
  item_category?: string;
  price?: number;
  quantity?: number;
  currency?: string;
}

function buildGA4Item(product: {
  id: string;
  title: string;
  vendor?: string;
  productType?: string;
  priceRange?: { minVariantPrice?: { amount?: string; currencyCode?: string } };
}): GA4Item {
  const price = parseFloat(product.priceRange?.minVariantPrice?.amount ?? '0');
  return {
    item_id: product.id.replace('gid://shopify/Product/', ''),
    item_name: product.title,
    item_brand: product.vendor || 'ASTROMEDA',
    item_category: product.productType || '',
    price,
    quantity: 1,
    currency: product.priceRange?.minVariantPrice?.currencyCode || 'JPY',
  };
}

/** GA4 view_item イベント */
export function trackViewItem(product: Parameters<typeof buildGA4Item>[0]): void {
  if (typeof window === 'undefined') return;
  const item = buildGA4Item(product);

  // GA4
  window.gtag?.('event', 'view_item', {
    currency: item.currency,
    value: item.price,
    items: [item],
  });

  // Meta Pixel
  window.fbq?.('track', 'ViewContent', {
    content_ids: [item.item_id],
    content_name: item.item_name,
    content_type: 'product',
    value: item.price,
    currency: item.currency,
  });
}

/** GA4 add_to_cart イベント */
export function trackAddToCart(
  product: Parameters<typeof buildGA4Item>[0],
  quantity = 1,
): void {
  if (typeof window === 'undefined') return;
  const item = { ...buildGA4Item(product), quantity };

  // GA4
  window.gtag?.('event', 'add_to_cart', {
    currency: item.currency,
    value: (item.price ?? 0) * quantity,
    items: [item],
  });

  // Meta Pixel
  window.fbq?.('track', 'AddToCart', {
    content_ids: [item.item_id],
    content_name: item.item_name,
    content_type: 'product',
    value: (item.price ?? 0) * quantity,
    currency: item.currency,
  });

  // dataLayer push for GTM
  window.dataLayer?.push({
    event: 'add_to_cart',
    ecommerce: { currency: item.currency, value: (item.price ?? 0) * quantity, items: [item] },
  });
}

/** GA4 view_cart イベント */
export function trackViewCart(
  items: Array<Parameters<typeof buildGA4Item>[0] & { quantity?: number }>,
): void {
  if (typeof window === 'undefined') return;
  const ga4Items = items.map((p) => ({
    ...buildGA4Item(p),
    quantity: p.quantity ?? 1,
  }));
  const total = ga4Items.reduce((sum, i) => sum + (i.price ?? 0) * (i.quantity ?? 1), 0);

  window.gtag?.('event', 'view_cart', {
    currency: 'JPY',
    value: total,
    items: ga4Items,
  });
}

/** GA4 begin_checkout イベント */
export function trackBeginCheckout(
  items: Array<Parameters<typeof buildGA4Item>[0] & { quantity?: number }>,
): void {
  if (typeof window === 'undefined') return;
  const ga4Items = items.map((p) => ({
    ...buildGA4Item(p),
    quantity: p.quantity ?? 1,
  }));
  const total = ga4Items.reduce((sum, i) => sum + (i.price ?? 0) * (i.quantity ?? 1), 0);

  // GA4
  window.gtag?.('event', 'begin_checkout', {
    currency: 'JPY',
    value: total,
    items: ga4Items,
  });

  // Meta Pixel
  window.fbq?.('track', 'InitiateCheckout', {
    value: total,
    currency: 'JPY',
    num_items: ga4Items.length,
  });
}

/** GA4 purchase イベント（注文完了ページ用） */
export function trackPurchase(
  transactionId: string,
  items: GA4Item[],
  value: number,
  shipping = 0,
  tax = 0,
): void {
  if (typeof window === 'undefined') return;

  // GA4
  window.gtag?.('event', 'purchase', {
    transaction_id: transactionId,
    value,
    tax,
    shipping,
    currency: 'JPY',
    items,
  });

  // Meta Pixel
  window.fbq?.('track', 'Purchase', {
    value,
    currency: 'JPY',
    content_type: 'product',
    contents: items.map((i) => ({ id: i.item_id, quantity: i.quantity ?? 1 })),
  });

  // dataLayer push for GTM
  window.dataLayer?.push({
    event: 'purchase',
    ecommerce: {
      transaction_id: transactionId,
      value,
      tax,
      shipping,
      currency: 'JPY',
      items,
    },
  });
}

/** GA4 search イベント */
export function trackSearch(searchTerm: string): void {
  if (typeof window === 'undefined') return;
  window.gtag?.('event', 'search', { search_term: searchTerm });
  window.fbq?.('track', 'Search', { search_string: searchTerm });
}

/** GA4 view_item_list イベント（コレクションページ用） */
export function trackViewItemList(
  listId: string,
  listName: string,
  items: Array<Parameters<typeof buildGA4Item>[0]>,
): void {
  if (typeof window === 'undefined') return;
  const ga4Items = items.slice(0, 20).map((p, i) => ({
    ...buildGA4Item(p),
    index: i,
  }));

  window.gtag?.('event', 'view_item_list', {
    item_list_id: listId,
    item_list_name: listName,
    items: ga4Items,
  });
}
