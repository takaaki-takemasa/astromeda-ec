import type {Maybe, ProductOptionValueSwatch} from '@shopify/hydrogen/storefront-api-types';
import type {Route} from '~/routes/+types/products.$handle';
import {AppError} from '~/lib/app-error';

/**
 * Product-related helper functions
 * Extracted from app/routes/products.$handle.tsx to reduce file size
 */

// ═══════════════════════════════════════════════════
// Meta Description Generation
// ═══════════════════════════════════════════════════

interface ProductForMeta {
  title?: string;
  tags?: string[];
  selectedOrFirstAvailableVariant?: {price?: {amount?: string}};
}

/**
 * B8: meta description動的生成（KW最適化）
 * 商品タイプを自動判定し、検索意図に合致するdescriptionを生成。
 * ゲーミングPC → スペック・価格帯を含める
 * ガジェット → 対応IPと用途を含める
 * グッズ → IPコラボ訴求
 */
export function buildMetaDescription(product: ProductForMeta | null | undefined): string {
  if (!product) return '';
  const title = product.title || '';
  const tags: string[] = (product.tags || []).map((t: string) => t.toLowerCase());
  const price = product.selectedOrFirstAvailableVariant?.price?.amount;
  const priceStr = price ? `¥${Number(price).toLocaleString()}` : '';

  // GPU検出
  const gpuMatch = title.match(/RTX\s*\d{4}\s*(?:Ti|SUPER)?/i);
  const gpu = gpuMatch ? gpuMatch[0] : '';

  // カテゴリ判定
  const isPC = /ゲーミングPC|デスクトップ|RTX\s*\d{4}/i.test(title) ||
    tags.some(t => t.includes('gamer') || t.includes('streamer') || t.includes('creator'));
  const isGadget = /マウスパッド|キーボード|PCケース|パネル|着せ替え|ケースファン|ガジェット/i.test(title);

  if (isPC && gpu) {
    return `【ASTROMEDA】${title} — ${gpu}搭載ゲーミングPC${priceStr ? `（税込${priceStr}〜）` : ''}。国内自社工場で組立・検品、全8色カスタマイズ対応。送料無料・1年保証付き。`.slice(0, 160);
  }
  if (isGadget) {
    return `【ASTROMEDA】${title} — 人気IPコラボのゲーミングガジェット。公式ライセンス商品${priceStr ? `、税込${priceStr}` : ''}。ASTROMEDA公式ストアで購入可能。`.slice(0, 160);
  }
  // グッズ or その他
  return `【ASTROMEDA】${title} — 公式IPコラボグッズ${priceStr ? `（税込${priceStr}）` : ''}。25タイトル以上のアニメ・ゲームコラボ。ASTROMEDA公式オンラインストア。`.slice(0, 160);
}

// ═══════════════════════════════════════════════════
// Color Option Helpers
// ═══════════════════════════════════════════════════

/**
 * カラー名→CSSカラーマッピング（Shopify swatchが未設定でもビジュアル表示）
 */
export const COLOR_MAP: Record<string, string> = {
  'ブラック': '#1a1a1a',
  'ホワイト': '#f0f0f0',
  'ピンク': '#FF69B4',
  'パープル': '#9B59B6',
  'レッド': '#E74C3C',
  'ライトブルー': '#5DADE2',
  'グリーン': '#2ECC71',
  'オレンジ': '#F39C12',
  'Black': '#1a1a1a',
  'White': '#f0f0f0',
  'Pink': '#FF69B4',
  'Purple': '#9B59B6',
  'Red': '#E74C3C',
  'Light Blue': '#5DADE2',
  'Green': '#2ECC71',
  'Orange': '#F39C12',
};

/**
 * カラーオプション名かどうか判定
 */
export function isColorOption(optionName: string): boolean {
  const n = optionName.toLowerCase();
  return n === 'カラー' || n === 'color' || n === '色' || n === 'colour';
}

/**
 * カラー値を取得（swatch優先、なければカラーマップ）
 */
export function resolveColor(name: string, swatch?: Maybe<ProductOptionValueSwatch>): string | null {
  if (swatch?.color) return swatch.color;
  return COLOR_MAP[name] || null;
}

// ═══════════════════════════════════════════════════
// Data Loading
// ═══════════════════════════════════════════════════

/**
 * Load critical product data (blocking)
 */
export async function loadCriticalData({context, params, request}: Route.LoaderArgs) {
  const {handle} = params;
  const {storefront} = context;

  if (!handle) {
    throw AppError.validation('商品ハンドルが指定されていません', {param: 'handle'});
  }

  let product;
  let customizationVariants: {sku: string; id: string; price: string}[] = [];
  try {
    const {getSelectedProductOptions} = await import('@shopify/hydrogen');
    const [productResult, customResult] = await Promise.all([
      storefront.query(PRODUCT_QUERY, {
        variables: {handle, selectedOptions: getSelectedProductOptions(request)},
      }),
      // カスタマイズ費用商品のバリアント一覧を取得（SKU→variantIdマッピング用）
      storefront.query(CUSTOMIZATION_PRODUCT_QUERY, {
        variables: {handle: 'pcカスタマイズオプション'},
      }).catch(() => null),
    ]);
    product = productResult.product;
    if (customResult?.product?.variants?.nodes) {
      type VariantNode = {sku?: string | null; id: string; price?: {amount?: string} | null};
      customizationVariants = customResult.product.variants.nodes
        .filter((v: VariantNode) => v.sku)
        .map((v: VariantNode) => ({
          sku: v.sku as string,
          id: v.id,
          price: v.price?.amount || '0',
        }));
    }
  } catch (error) {
    process.env.NODE_ENV === 'development' && console.error('[products.$handle] Storefront API error:', error);
    throw AppError.externalApi('商品データの取得に失敗しました', {handle, source: 'Storefront API'});
  }

  if (!product?.id) {
    throw AppError.notFound('商品が見つかりません', {handle});
  }

  const {redirectIfHandleIsLocalized} = await import('~/lib/redirect');
  redirectIfHandleIsLocalized(request, {handle, data: product});

  return {product, customizationVariants};
}

/**
 * Load deferred product data (non-blocking)
 */
export function loadDeferredData({context, params}: Route.LoaderArgs) {
  const {storefront} = context;
  const {handle} = params;

  // Deferred promise for related products from the same collection
  // The main loader (loadCriticalData) has the product data, but we defer
  // fetching products from the same collection for streaming
  const relatedProductsPromise = storefront
    .query<{product?: {collections: {nodes: Array<{handle: string}>}}}>(
      PRODUCT_COLLECTIONS_QUERY,
      {
        variables: {handle},
      },
    )
    .then(async (data) => {
      const productCollections = data?.product?.collections?.nodes || [];
      if (productCollections.length === 0) return [];

      // Get the first collection and fetch 6 other products from it
      const firstCollection = productCollections[0];
      if (!firstCollection?.handle) return [];

      const collectionData = await storefront.query<{
        collection?: {
          products: {
            nodes: Array<{
              id: string;
              handle: string;
              title: string;
              featuredImage?: {url: string};
              priceRange: {minVariantPrice: {amount: string}};
            }>;
          };
        };
      }>(RELATED_PRODUCTS_QUERY, {
        variables: {collectionHandle: firstCollection.handle, first: 6},
      });

      // Filter out the current product
      return (collectionData?.collection?.products?.nodes || []).filter((p) => p.handle !== handle);
    })
    .catch((error) => {
      process.env.NODE_ENV === 'development' &&
        console.error('[products.$handle] Related products fetch failed:', error);
      return []; // Return empty array on error, don't break the page
    });

  return {
    relatedProducts: relatedProductsPromise,
  };
}

// ═══════════════════════════════════════════════════
// GraphQL Fragments & Queries
// ═══════════════════════════════════════════════════

export const PRODUCT_VARIANT_FRAGMENT = `#graphql
  fragment ProductVariant on ProductVariant {
    availableForSale
    compareAtPrice {
      amount
      currencyCode
    }
    id
    image {
      __typename
      id
      url
      altText
      width
      height
    }
    price {
      amount
      currencyCode
    }
    product {
      title
      handle
    }
    selectedOptions {
      name
      value
    }
    sku
    title
    unitPrice {
      amount
      currencyCode
    }
  }
` as const;

export const PRODUCT_FRAGMENT = `#graphql
  fragment Product on Product {
    id
    title
    vendor
    handle
    tags
    descriptionHtml
    description
    encodedVariantExistence
    encodedVariantAvailability
    options {
      name
      optionValues {
        name
        firstSelectableVariant {
          ...ProductVariant
        }
        swatch {
          color
          image {
            previewImage {
              url
            }
          }
        }
      }
    }
    selectedOrFirstAvailableVariant(selectedOptions: $selectedOptions, ignoreUnknownOptions: true, caseInsensitiveMatch: true) {
      ...ProductVariant
    }
    adjacentVariants (selectedOptions: $selectedOptions) {
      ...ProductVariant
    }
    metafield_rating_value: metafield(namespace: "reviews", key: "rating_value") {
      value
    }
    metafield_rating_count: metafield(namespace: "reviews", key: "rating_count") {
      value
    }
    seo {
      description
      title
    }
  }
  ${PRODUCT_VARIANT_FRAGMENT}
` as const;

export const PRODUCT_QUERY = `#graphql
  query Product(
    $country: CountryCode
    $handle: String!
    $language: LanguageCode
    $selectedOptions: [SelectedOptionInput!]!
  ) @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      ...Product
    }
  }
  ${PRODUCT_FRAGMENT}
` as const;

/**
 * カスタマイズ費用商品のバリアント一覧を取得するクエリ
 * SKU → variant ID マッピング構築用
 */
export const CUSTOMIZATION_PRODUCT_QUERY = `#graphql
  query CustomizationProduct(
    $country: CountryCode
    $handle: String!
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      id
      title
      variants(first: 100) {
        nodes {
          id
          sku
          title
          price {
            amount
            currencyCode
          }
        }
      }
    }
  }
` as const;

/**
 * Fetch the product's collections (used for related products deferred loading)
 */
export const PRODUCT_COLLECTIONS_QUERY = `#graphql
  query ProductCollections(
    $handle: String!
  ) {
    product(handle: $handle) {
      id
      collections(first: 3) {
        nodes {
          id
          handle
          title
        }
      }
    }
  }
` as const;

/**
 * Fetch products from a specific collection (used for related products deferred loading)
 */
export const RELATED_PRODUCTS_QUERY = `#graphql
  query RelatedProducts(
    $collectionHandle: String!
    $first: Int
  ) {
    collection(handle: $collectionHandle) {
      id
      products(first: $first) {
        nodes {
          id
          handle
          title
          featuredImage {
            url
            altText
          }
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
` as const;
