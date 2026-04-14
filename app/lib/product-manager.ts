/**
 * Product Manager Utilities — 商品管理機能
 *
 * 医学メタファー: 薬剤学（Pharmacology）
 * 各商品は「医薬品」。在庫状態・価格帯・バリアント数などを管理し、
 * 適切な供給状態（ステータス）を診断・分類する。
 */

/**
 * Product 型定義（Storefront API response）
 */
export interface ProductImage {
  url: string;
  altText?: string;
  width?: number;
  height?: number;
}

export interface MoneyValue {
  amount: string;
  currencyCode: string;
}

export interface ProductVariant {
  id: string;
  title: string;
  price: MoneyValue;
  availableForSale: boolean;
  sku?: string;
}

export interface PriceRange {
  minVariantPrice: MoneyValue;
  maxVariantPrice: MoneyValue;
}

export interface Product {
  id: string;
  title: string;
  handle: string;
  productType: string;
  vendor: string;
  availableForSale: boolean;
  totalInventory?: number;
  priceRange: PriceRange;
  images: ProductImage[];
  variants: ProductVariant[];
}

export type ProductStatus = 'active' | 'draft' | 'out_of_stock';

/**
 * Format price in Japanese yen
 * Examples:
 *   formatPrice('12345.00') => '¥12,345'
 *   formatPrice('99.99', 'JPY') => '¥100'
 */
export function formatPrice(amount: string, currencyCode?: string): string {
  try {
    const num = Math.round(parseFloat(amount));
    return '¥' + num.toLocaleString('ja-JP');
  } catch {
    return '¥0';
  }
}

/**
 * Get product status based on availability and inventory
 * active: 販売可能
 * out_of_stock: 在庫なし
 * draft: 販売不可（準備中/廃止）
 */
export function getProductStatus(product: {
  availableForSale: boolean;
  totalInventory?: number;
}): ProductStatus {
  if (!product.availableForSale) {
    return 'draft';
  }
  const inventory = product.totalInventory ?? 0;
  if (inventory <= 0) {
    return 'out_of_stock';
  }
  return 'active';
}

/**
 * Group products by type
 * Example:
 *   groupByType(products) => {
 *     'ゲーミングPC': [...],
 *     'マウスパッド': [...],
 *   }
 */
export function groupByType(products: Product[]): Record<string, Product[]> {
  return products.reduce(
    (acc, product) => {
      const type = product.productType || 'その他';
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(product);
      return acc;
    },
    {} as Record<string, Product[]>,
  );
}

/**
 * Client-side product search
 * Searches by title, vendor, and type (case-insensitive)
 */
export function searchProducts(products: Product[], query: string): Product[] {
  if (!query.trim()) {
    return products;
  }

  const q = query.toLowerCase();
  return products.filter((product) => {
    const title = (product.title || '').toLowerCase();
    const vendor = (product.vendor || '').toLowerCase();
    const type = (product.productType || '').toLowerCase();

    return title.includes(q) || vendor.includes(q) || type.includes(q);
  });
}

/**
 * Get price range display (min - max)
 * Example:
 *   getPriceRangeDisplay({
 *     minVariantPrice: { amount: '100', currencyCode: 'JPY' },
 *     maxVariantPrice: { amount: '500', currencyCode: 'JPY' },
 *   }) => '¥100 - ¥500'
 */
export function getPriceRangeDisplay(priceRange: PriceRange): string {
  const min = formatPrice(priceRange.minVariantPrice.amount);
  const max = formatPrice(priceRange.maxVariantPrice.amount);
  if (min === max) {
    return min;
  }
  return `${min} - ${max}`;
}

/**
 * Get thumbnail image URL with optimization
 * Falls back to null if no images available
 */
export function getThumbnail(images: ProductImage[]): string | null {
  if (!images || images.length === 0) {
    return null;
  }
  const url = images[0].url;
  if (!url) {
    return null;
  }
  // Add Shopify CDN optimization
  return url.includes('?')
    ? `${url}&width=200&format=webp`
    : `${url}?width=200&format=webp`;
}

/**
 * Get variant availability summary
 * Example: "3 / 5 in stock" or "5 available"
 */
export function getVariantAvailabilitySummary(variants: ProductVariant[]): string {
  if (!variants || variants.length === 0) {
    return 'No variants';
  }

  const available = variants.filter((v) => v.availableForSale).length;
  const total = variants.length;

  if (total === 1) {
    return available > 0 ? 'In stock' : 'Out of stock';
  }

  return `${available} / ${total} available`;
}
