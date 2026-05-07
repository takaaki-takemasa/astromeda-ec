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
    // patch 0207-fu (2026-05-01): 真因究明 — AppError extends Error なので
    // React Router/Hydrogen は普通の Error を自動的に 500 として扱う。
    // Response オブジェクトを直接 throw しないと 404 にならない。
    // 旧 patch 0204/0207 で AppError.notFound を throw していたが、
    // CEO 実機検証で 500 残存を確認 → Response 直接 throw に修正。
    throw new Response('お探しの商品は見つかりませんでした', {
      status: 404,
      statusText: 'Not Found',
      headers: {'Content-Type': 'text/plain; charset=utf-8'},
    });
  }

  if (!product?.id) {
    // patch 0207-fu: Response 直接 throw で確実に 404 を返す
    throw new Response('お探しの商品は見つかりませんでした', {
      status: 404,
      statusText: 'Not Found',
      headers: {'Content-Type': 'text/plain; charset=utf-8'},
    });
  }

  const {redirectIfHandleIsLocalized} = await import('~/lib/redirect');
  redirectIfHandleIsLocalized(request, {handle, data: product});

  return {product, customizationVariants};
}

/**
 * patch 0208 (2026-05-01): IP keyword 抽出ヘルパー
 * 商品 handle / title から canonical IP slug を抽出する。
 * Shopify 側で banner-target: タグが付いていない商品でも、
 * handle や title (例: "pc-naruto-shippuden-gaara-amd") から
 * IP を推定して同 IP のみフィルタするための第 3 層 fallback。
 *
 * CEO 検証: NARUTO PC を見たら Palworld + NOEZ FOXX + 一般 GAMER が混入
 *  → 商品 tags に banner-target: 無し + 複数 *-collaboration collection に
 *    所属しているため collection ベースが Palworld を選んでしまっていた
 *  → handle keyword で確実に NARUTO 系のみを残す
 */
const IP_KEYWORD_MAP: Array<{kw: string; ip: string}> = [
  {kw: 'naruto', ip: 'naruto-shippuden'},
  {kw: 'one-piece', ip: 'one-piece-bountyrush'},
  {kw: 'onepiece', ip: 'one-piece-bountyrush'},
  {kw: 'bountyrush', ip: 'one-piece-bountyrush'},
  {kw: 'heroaca', ip: 'heroaca'},
  {kw: 'hero-academia', ip: 'heroaca'},
  {kw: 'jujutsu', ip: 'jujutsukaisen'},
  {kw: 'streetfighter', ip: 'streetfighter'},
  {kw: 'sanrio', ip: 'sanrio-characters'},
  {kw: 'sonic', ip: 'sega-sonic'},
  {kw: 'chainsaw', ip: 'chainsawman'},
  {kw: 'bocchi', ip: 'bocchi-rocks'},
  {kw: 'hololive', ip: 'hololive-english'},
  {kw: 'bleach', ip: 'bleach'},
  {kw: 'geass', ip: 'geass'},
  {kw: 'tokyoghoul', ip: 'tokyoghoul'},
  {kw: 'tokyo-ghoul', ip: 'tokyoghoul'},
  {kw: 'lovelive', ip: 'lovelive-nijigasaki'},
  {kw: 'nijigasaki', ip: 'lovelive-nijigasaki'},
  {kw: 'swordart', ip: 'swordart-online'},
  {kw: 'sao', ip: 'swordart-online'},
  {kw: 'yurucamp', ip: 'yurucamp'},
  {kw: 'pacmas', ip: 'pacmas-astromeda'},
  {kw: 'sumikko', ip: 'sumikko'},
  {kw: 'girls-und-panzer', ip: 'girls-und-panzer'},
  {kw: 'palworld', ip: 'palworld'},
  {kw: 'rilakkuma', ip: 'rilakkuma'},
  {kw: 'noez-foxx', ip: 'noez-foxx'},
  {kw: 'noez_foxx', ip: 'noez-foxx'},
  {kw: 'nitowai', ip: 'nitowai'},
];

function extractIpSlugFromText(text: string): string | null {
  const lower = (text || '').toLowerCase();
  for (const {kw, ip} of IP_KEYWORD_MAP) {
    if (lower.includes(kw)) return ip;
  }
  return null;
}

/**
 * Load deferred product data (non-blocking)
 * patch 0206 (2026-05-01): productTags パラメータ追加で IP tag-based filtering を有効化
 * patch 0208 (2026-05-01): productTitle/productHandle 追加で keyword fallback も有効化
 */
export function loadDeferredData(
  {context, params}: Route.LoaderArgs,
  productTags?: string[],
  productTitle?: string,
) {
  const {storefront} = context;
  const {handle} = params;
  const handleLc = (handle || '').toLowerCase();

  // patch 0206 (2026-05-01): CEO 実機検証で patch 0202 の collection ベース修正が
  // 不十分と判明 — NARUTO PC を見たら Palworld + NOEZ FOXX + 一般 GAMER PC が
  // 関連商品に混入していた。原因: 商品が複数の "*-collaboration" コレクションに
  // 所属している場合 (Shopify 設定ミスや横断分類)、ランダムに別 IP が選ばれる。
  //
  // 根本対策: 商品の tags から canonical IP tag (banner-target:xxx) を抽出し、
  // その tag を持つ他商品のみを Storefront API products query で fetch。
  // tag が無い商品は既存の collection ベース fallback。
  const ipTag = (productTags || []).find((t) =>
    t.toLowerCase().startsWith('banner-target:'),
  );

  if (ipTag) {
    const tagBasedPromise = storefront
      .query<{
        products: {
          nodes: Array<{
            id: string;
            handle: string;
            title: string;
            featuredImage?: {url: string};
            priceRange: {minVariantPrice: {amount: string}};
          }>;
        };
      }>(PRODUCTS_BY_TAG_QUERY, {
        variables: {tagQuery: `tag:'${ipTag.replace(/'/g, "")}'`, first: 8},
      })
      .then((data) =>
        (data?.products?.nodes || [])
          .filter((p) => p.handle !== handle)
          .slice(0, 6),
      )
      .catch((error) => {
        process.env.NODE_ENV === 'development' &&
          console.error('[products.$handle] tag-based related fetch failed:', error);
        return [];
      });
    return {relatedProducts: tagBasedPromise};
  }

  // patch 0202 (2026-05-01): 関連商品の IP マッチング改善
  // CEO 指摘:
  //   (1) 同じ IP の他商品が「関連商品」に表示されない (漏れ)
  //   (2) 関係ない IP の商品が「関連商品」に混ざる (誤混入)
  //
  // 旧実装: 商品の collections.nodes[0] から無条件に 6 件取得
  //   → ONE PIECE PC を見ても、最初の collection が "all-pcs" だと
  //     NARUTO や ヒロアカ の PC が混ざる
  //
  // 新実装: 商品の collections を「IP コラボ系優先 → 一般 fallback」で順序付け
  //   - 優先 1: handle に "-collaboration" を含む collection (ip-onepiece-collaboration 等)
  //   - 優先 2: handle に "collaboration" を含む collection
  //   - fallback: 元の最初の collection
  //   この優先順序で「同 IP のみ」関連商品を取得することで誤混入を排除する
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

      // patch 0202 + patch 0208-fu2 (2026-05-01): IP コラボ系コレクション選択を 3 段階優先順位で
      // (0) [patch 0208-fu2] 現在商品の handle/title に含まれる IP keyword を
      //     handle に含む collection を最優先 (例: NARUTO PC → naruto-shippuden を選ぶ。
      //     palworld-collaboration ではなく)
      // (1) "-collaboration" 完全一致を次点 (IP ピンポイント)
      // (2) "collaboration" 部分一致 (旧 IP 系コレクション)
      // (3) gaming-pc / gadget / goods / new-arrivals 等の汎用群を最後
      const GENERIC_HANDLES = new Set([
        'gaming-pc', 'gadgets', 'goods', 'new-arrivals',
        'all', 'all-products', 'frontpage',
      ]);
      // [patch 0208-fu2] 現在商品の IP keyword を抽出して collection 選別に使う
      const earlyIpSlug = extractIpSlugFromText(handleLc) || extractIpSlugFromText(productTitle || '');
      const earlySameIpKeywords = earlyIpSlug
        ? IP_KEYWORD_MAP.filter((m) => m.ip === earlyIpSlug).map((m) => m.kw)
        : [];
      const collectionMatchesIp = (h: string): boolean => {
        if (!earlySameIpKeywords.length) return false;
        const hLc = (h || '').toLowerCase();
        return earlySameIpKeywords.some((kw) => hLc.includes(kw));
      };
      const ranked = [...productCollections].sort((a, b) => {
        // (0) 同 IP keyword を含む collection を最優先 (palworld 混入根絶)
        const aIp = collectionMatchesIp(a.handle || '') ? 0 : 1;
        const bIp = collectionMatchesIp(b.handle || '') ? 0 : 1;
        if (aIp !== bIp) return aIp - bIp;
        // (1) "-collaboration" を含む collection
        const aHas = (a.handle || '').includes('-collaboration') ? 0 : 1;
        const bHas = (b.handle || '').includes('-collaboration') ? 0 : 1;
        if (aHas !== bHas) return aHas - bHas;
        // (2) generic handle を最後
        const aIsGeneric = GENERIC_HANDLES.has(a.handle || '') ? 1 : 0;
        const bIsGeneric = GENERIC_HANDLES.has(b.handle || '') ? 1 : 0;
        if (aIsGeneric !== bIsGeneric) return aIsGeneric - bIsGeneric;
        return 0;
      });

      const targetCollection = ranked[0];
      if (!targetCollection?.handle) return [];

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
        variables: {collectionHandle: targetCollection.handle, first: 24},
      });

      // patch 0208 (2026-05-01): collection ベース fallback でも IP keyword で
      // 厳格にフィルタ。NARUTO PC を見たら Palworld 等が混入する事故を防止。
      // - 現在商品の handle/title から IP slug を抽出
      // - 同 IP slug を含む product のみ残す (handle keyword OR title keyword)
      // - IP 抽出できない商品 (汎用 GAMER PC 等) はフィルタしない (素通し)
      const currentIpSlug = extractIpSlugFromText(handleLc) || extractIpSlugFromText(productTitle || '');
      const allRelated = (collectionData?.collection?.products?.nodes || []).filter((p) => p.handle !== handle);

      if (currentIpSlug) {
        // 同 IP keyword を含む商品のみ残す
        const sameIpKeywords = IP_KEYWORD_MAP
          .filter((m) => m.ip === currentIpSlug)
          .map((m) => m.kw);
        const filtered = allRelated.filter((p) => {
          const hLc = (p.handle || '').toLowerCase();
          const tLc = (p.title || '').toLowerCase();
          return sameIpKeywords.some((kw) => hLc.includes(kw) || tLc.includes(kw));
        });
        // patch 0208-fu (2026-05-01): keyword フィルタが厳しすぎて 0 件になる事故防止。
        // CEO 実機検証: NARUTO PC で混入は消えたが、NARUTO 系も全部消えて
        // 「関連商品」セクションが空白になる事故が発生。
        // 最低 3 件は表示する: フィルタ済 >= 3 件ならそれを使い、
        // 不足する場合は除外された商品を tail に追加して 6 件まで埋める。
        if (filtered.length >= 3) {
          return filtered.slice(0, 6);
        }
        // 不足分は handle/title に**他の登録 IP keyword を一切含まない**商品で埋める
        // (= 汎用 GAMER PC / CREATOR PC 等は OK、別 IP 商品は混入させない)
        const allOtherKeywords = IP_KEYWORD_MAP
          .filter((m) => m.ip !== currentIpSlug)
          .map((m) => m.kw);
        const neutralFill = allRelated.filter((p) => {
          if (filtered.find((f) => f.handle === p.handle)) return false; // 既に filtered に入ってる
          const hLc = (p.handle || '').toLowerCase();
          const tLc = (p.title || '').toLowerCase();
          // 他 IP keyword を含む商品は除外
          return !allOtherKeywords.some((kw) => hLc.includes(kw) || tLc.includes(kw));
        });
        return [...filtered, ...neutralFill].slice(0, 6);
      }
      return allRelated.slice(0, 6);
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

/**
 * patch 0206 (2026-05-01): tag-based 関連商品取得
 * IP canonical tag (banner-target:naruto-shippuden 等) で products を直接 query。
 * collection 横断で誤混入が発生しないため、IP マッチング精度が collection より高い。
 */
export const PRODUCTS_BY_TAG_QUERY = `#graphql
  query ProductsByTag(
    $tagQuery: String!
    $first: Int
  ) {
    products(query: $tagQuery, first: $first) {
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
` as const;
