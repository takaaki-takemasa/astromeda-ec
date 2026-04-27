import {useLoaderData} from 'react-router';
import type {Route} from './+types/_index';
import {Link} from 'react-router';
import {Image} from '@shopify/hydrogen';
import {Suspense} from 'react';
import {Await} from 'react-router';
// Note: Suspense/Await kept for BTF (recommendedProducts) only
import {T, al, MARQUEE_ITEMS, UGC, COLLABS, PAGE_WIDTH, STORE_URL} from '~/lib/astromeda-data';
import {ProductGridSkeleton} from '~/components/astro/Skeleton';
import {HeroSlider} from '~/components/astro/HeroSlider';
import type {MetaBanner} from '~/components/astro/HeroSlider';
import {CollabGrid} from '~/components/astro/CollabGrid';
import type {MetaCollab} from '~/components/astro/CollabGrid';
import {setAdminEnv, getAdminClient} from '../../agents/core/shopify-admin.js';
import {PCShowcase} from '~/components/astro/PCShowcase';
import type {MetaColorModel} from '~/components/astro/PCShowcase';
// patch 0167 (2026-04-27): セクション単位 HTML/CSS 上書き wrapper
import {SectionOverride} from '~/components/astro/SectionOverride';
// ScrollReveal removed: causes opacity:0 issues when CSS files return 503 from Shopify CDN
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {preloadImage, optimizeImageUrl} from '~/lib/cache-headers';
// patch 0012: CMS 絶対URLを内部パス正規化（新/旧サイト離脱防止）
import {toInternalPath} from '~/lib/cms-url';
import type {RecommendedProductsQuery, RecommendedProductFragment} from 'storefrontapi.generated';

export const meta: Route.MetaFunction = ({data}) => {
  // OGP画像: IPコレクションの最初の画像、もしくはShopifyストアのデフォルト画像
  const ogImage = (() => {
    if (data?.ipCollections?.collections?.nodes) {
      const firstWithImage = data.ipCollections.collections.nodes.find(
        (c: IPCollNode) => c?.image?.url,
      );
      if (firstWithImage?.image?.url) return firstWithImage.image.url;
    }
    return 'https://cdn.shopify.com/s/files/1/0756/0408/7268/files/astromeda-ogp.jpg?v=1';
  })();

  return [
    {title: 'ASTROMEDA | アニメ・ゲームIPコラボゲーミングPC'},
    {
      name: 'description',
      content:
        '株式会社マイニングベースが手掛けるゲーミングPCブランドASTROMEDA。ONE PIECE・ヒロアカ・呪術廻戦など25タイトル以上のコラボレーションモデルを展開。国内自社工場受注生産、全8色カラー、最長3年保証。',
    },
    // OGP
    {property: 'og:title', content: 'ASTROMEDA | アニメ・ゲームIPコラボゲーミングPC'},
    {property: 'og:description', content: '25タイトル以上のアニメ・ゲームIPコラボゲーミングPC。全8色カラー、国内自社工場受注生産。'},
    {property: 'og:type', content: 'website'},
    {property: 'og:site_name', content: 'ASTROMEDA'},
    {property: 'og:image', content: ogImage},
    {property: 'og:url', content: STORE_URL},
    // Twitter Card
    {name: 'twitter:card', content: 'summary_large_image'},
    {name: 'twitter:title', content: 'ASTROMEDA | アニメ・ゲームIPコラボゲーミングPC'},
    {name: 'twitter:image', content: ogImage},
    // Canonical
    {tagName: 'link', rel: 'canonical', href: STORE_URL},
  ];
};

// DG-03: Preload LCP image (hero banner)
export const links: Route.LinksFunction = (args) => {
  const heroImageUrl = (args as {data?: {firstHeroImageUrl?: string}} | undefined)?.data?.firstHeroImageUrl;
  if (!heroImageUrl) return [];

  return [
    preloadImage(heroImageUrl, 1400),
  ];
};

// Sprint 2 Part 3-2: astromeda_category_card Metaobject 用の型
interface MetaCategoryCard {
  id: string;
  handle: string;
  title: string;
  description: string | null;
  priceFrom: number | null;
  image: string | null;
  linkUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}

// Sprint 2 Part 3-4: astromeda_about_section Metaobject 用の型
// 注: image フィールドは現 UI (コンパクトバナー) では未使用。将来 UX 拡張時に採用予定。
interface MetaAboutSection {
  id: string;
  handle: string;
  title: string;
  bodyHtml: string;
  image: string | null;
  linkUrl: string;
  linkLabel: string;
  isActive: boolean;
}

// Sprint 2 Part 3-3 / Sprint 4 拡張: astromeda_product_shelf Metaobject 用の型
interface MetaProductShelf {
  id: string;
  handle: string;
  title: string;
  subtitle: string;
  productIds: string[]; // parsed from product_ids_json
  limit: number;
  sortKey: 'manual' | 'best_selling' | 'newest';
  sortOrder: number;
  isActive: boolean;
}

// シェルフ描画用の解決済み商品（Storefront API nodes(ids:...) 経由）
interface MetaShelfProduct {
  id: string;
  title: string;
  handle: string;
  featuredImage: {url: string; altText: string | null; width: number | null; height: number | null} | null;
  priceRange: {minVariantPrice: {amount: string; currencyCode: string}};
}

// Shape of each aliased collection field in the query response
interface IPCollNode {
  id: string;
  title: string;
  handle: string;
  image: {id?: string; url: string; altText?: string; width?: number; height?: number} | null;
  products?: {nodes?: Array<{featuredImage?: {id?: string; url?: string; altText?: string; width?: number; height?: number} | null}>};
}

export async function loader({context}: Route.LoaderArgs) {
  // ── ATF（Above The Fold）データ: Hydration安定のため必ずawait ──
  // 医学的比喩: 神経管閉鎖と同じ — SSR/Client間で同じ構造を保証する
  const aliasToColor: Record<string, string> = {
    colorWhite: 'ホワイト',
    colorBlack: 'ブラック',
    colorPink: 'ピンク',
    colorPurple: 'パープル',
    colorBlue: 'ライトブルー',
    colorRed: 'レッド',
    colorGreen: 'グリーン',
    colorOrange: 'オレンジ',
  };

  // Metaobject 取得準備（失敗しても Storefront フローは継続）
  try {
    setAdminEnv(context.env as unknown as Record<string, string | undefined>);
  } catch {
    // 取得失敗時はフォールバック
  }
  const adminClient = (() => {
    try {
      return getAdminClient();
    } catch {
      return null;
    }
  })();

  // 並列でATFデータを取得（Hero, CollabGrid, PCShowcase全てに必要）+ Metaobject（ip_banner, hero_banner, pc_color_model）
  const emptyMo = (): Promise<Array<{id: string; handle: string; fields: Array<{key: string; value: string}>}>> =>
    Promise.resolve([]);
  const [ipResult, pcResult, tierResult, catResult, ipBannerResult, heroBannerResult, pcColorModelResult, categoryCardResult, productShelfResult, aboutSectionResult, marqueeItemResult, ugcReviewResult, pcTierResult, campaignResult] = await Promise.allSettled([
    context.storefront
      .query(IP_COLLECTIONS_BY_HANDLE_QUERY as unknown as Parameters<typeof context.storefront.query>[0]),
    context.storefront
      .query(PC_COLOR_COLLECTIONS_QUERY as unknown as Parameters<typeof context.storefront.query>[0]),
    // 9-4: ティア別最安値をShopifyリアルデータから取得
    context.storefront
      .query(TIER_PRICES_QUERY as unknown as Parameters<typeof context.storefront.query>[0]),
    // 9-3: カテゴリ画像をShopify APIから動的取得
    context.storefront
      .query(CATEGORY_IMAGES_QUERY as unknown as Parameters<typeof context.storefront.query>[0]),
    // Metaobject: IP バナー（CollabGrid 用）
    adminClient ? adminClient.getMetaobjects('astromeda_ip_banner', 100) : emptyMo(),
    // Metaobject: ヒーローバナー（HeroSlider 用）
    adminClient ? adminClient.getMetaobjects('astromeda_hero_banner', 50) : emptyMo(),
    // Metaobject: PC カラーモデル（PCShowcase 用）
    adminClient ? adminClient.getMetaobjects('astromeda_pc_color', 100) : emptyMo(),
    // Metaobject: カテゴリカード（Category quick nav 用）
    adminClient ? adminClient.getMetaobjects('astromeda_category_card', 100) : emptyMo(),
    // Metaobject: 商品シェルフ（NEW ARRIVALS 代替用）
    adminClient ? adminClient.getMetaobjects('astromeda_product_shelf', 50) : emptyMo(),
    // Metaobject: ABOUT セクション
    adminClient ? adminClient.getMetaobjects('astromeda_about_section', 10) : emptyMo(),
    // patch 0017: Metaobject マーキーテキスト（トップ冒頭 Marquee 用）
    adminClient ? adminClient.getMetaobjects('astromeda_marquee_item', 30) : emptyMo(),
    // patch 0017: Metaobject UGC レビュー（REVIEWS セクション用）
    adminClient ? adminClient.getMetaobjects('astromeda_ugc_review', 30) : emptyMo(),
    // patch 0023: Metaobject PC ティア（PCShowcase TierCards 用）
    adminClient ? adminClient.getMetaobjects('astromeda_pc_tier', 10) : emptyMo(),
    // patch 0025 (P2-H): Metaobject キャンペーン（homepage top banner 用）
    adminClient ? adminClient.getMetaobjects('astromeda_campaign', 20) : emptyMo(),
  ]);

  const ipCollectionsRaw = ipResult.status === 'fulfilled' ? ipResult.value : null;
  const pcColorRaw = pcResult.status === 'fulfilled' ? pcResult.value : null;
  const tierPricesRaw = tierResult.status === 'fulfilled' ? tierResult.value : null;
  const catImagesRaw = catResult.status === 'fulfilled' ? catResult.value : null;
  const ipBannerRaw = ipBannerResult.status === 'fulfilled' ? ipBannerResult.value : [];
  const heroBannerRaw = heroBannerResult.status === 'fulfilled' ? heroBannerResult.value : [];
  const pcColorModelRaw = pcColorModelResult.status === 'fulfilled' ? pcColorModelResult.value : [];
  const categoryCardRaw = categoryCardResult.status === 'fulfilled' ? categoryCardResult.value : [];
  const productShelfRaw = productShelfResult.status === 'fulfilled' ? productShelfResult.value : [];
  const aboutSectionRaw = aboutSectionResult.status === 'fulfilled' ? aboutSectionResult.value : [];
  // patch 0017: marquee / ugc raw 取り出し
  const marqueeItemRaw = marqueeItemResult.status === 'fulfilled' ? marqueeItemResult.value : [];
  const ugcReviewRaw = ugcReviewResult.status === 'fulfilled' ? ugcReviewResult.value : [];
  // patch 0023: pc_tier raw 取り出し
  const pcTierRaw = pcTierResult.status === 'fulfilled' ? pcTierResult.value : [];
  // patch 0025 (P2-H): campaign raw 取り出し
  const campaignRaw = campaignResult.status === 'fulfilled' ? campaignResult.value : [];

  // Metaobject → MetaCollab / MetaBanner 整形
  const fieldsToMap = (fields: Array<{key: string; value: string}>): Record<string, string> => {
    const m: Record<string, string> = {};
    for (const f of fields) m[f.key] = f.value;
    return m;
  };

  // patch 0011: cms-seed が複数回走った痕跡で pc_color 16件 (8×2) / ip_banner 46件 (23×2)
  // のような重複が Metaobject 側に残り、storefront に直接流れて二重表示を起こすため、
  // ユーザ視点の一意キー (slug / shopHandle / title+linkUrl) で畳み込む。
  // 同 key なら display_order の小さい方を優先、key 空はそのまま素通し。
  const dedupByKey = <T,>(
    items: T[],
    keyFn: (item: T) => string,
    orderFn?: (item: T) => number,
  ): T[] => {
    const map = new Map<string, T>();
    const passthrough: T[] = [];
    items.forEach((item) => {
      const key = keyFn(item);
      if (!key) {
        passthrough.push(item);
        return;
      }
      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
        return;
      }
      if (orderFn && orderFn(item) < orderFn(existing)) {
        map.set(key, item);
      }
    });
    return [...map.values(), ...passthrough];
  };

  const metaCollabsRaw: MetaCollab[] = ipBannerRaw.map((mo) => {
    const f = fieldsToMap(mo.fields);
    return {
      id: mo.id,
      handle: mo.handle,
      name: f['name'] || '',
      shopHandle: f['collection_handle'] || '',
      image: f['image'] || null,
      tagline: f['tagline'] || null,
      label: f['label'] || null,
      sortOrder: parseInt(f['display_order'] || '0', 10),
      featured: f['is_active'] === 'true',
      // patch 0152 (2026-04-24): リンク先自由化。空のときは shopHandle から /collections/ を組む既存動作。
      linkUrl: f['link_url'] || null,
    };
  });

  const metaBannersRaw: MetaBanner[] = heroBannerRaw.map((mo) => {
    const f = fieldsToMap(mo.fields);
    return {
      id: mo.id,
      handle: mo.handle,
      title: f['title'] || '',
      subtitle: f['subtitle'] || null,
      image: f['image'] || null,
      linkUrl: f['link_url'] || null,
      ctaLabel: f['cta_label'] || null,
      sortOrder: parseInt(f['display_order'] || '0', 10),
      isActive: f['is_active'] === 'true',
      startAt: f['start_at'] || null,
      endAt: f['end_at'] || null,
    };
  });

  // patch 0174 (P0): hero_banner image=null の時、linkUrl から抽出したコレクション handle を
  // Storefront API で取得して image URL を埋める。
  // patch 0176 (P0): image が GID 形式 ('gid://shopify/MediaImage/...') の時も、Storefront
  // 側では URL に解決できないため fallback を発動。これで file_reference の MediaImage GID が
  // 残っていても storefront で画像が表示される。
  // image が http(s):// で始まる URL なら そのまま使う。それ以外 (空 or GID) は fallback 対象。
  const isResolvableUrl = (img: string | null | undefined): boolean =>
    !!img && (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('//'));
  const heroFallbackHandles = Array.from(new Set(
    metaBannersRaw
      .filter((b) => !isResolvableUrl(b.image) && b.linkUrl)
      .map((b) => b.linkUrl!.match(/\/collections\/([^/?#]+)/)?.[1])
      .filter((h): h is string => !!h && !IP_HANDLES.includes(h)),
  ));
  if (heroFallbackHandles.length > 0) {
    try {
      const aliases = heroFallbackHandles
        .map((h, i) => `c${i}: collectionByHandle(handle: "${h.replace(/"/g, '\\"')}") { handle image { url altText width height } products(first:1) { nodes { featuredImage { url altText width height } } } }`)
        .join('\n');
      const heroFbRes = (await context.storefront.query(
        `#graphql\nquery HeroFallbackImages { ${aliases} }`,
      )) as Record<string, {handle: string; image?: {url: string} | null; products?: {nodes: {featuredImage?: {url: string} | null}[]}} | null> | null;
      const handleToUrl = new Map<string, string>();
      if (heroFbRes) {
        for (const node of Object.values(heroFbRes)) {
          if (!node) continue;
          const url = node.image?.url || node.products?.nodes?.[0]?.featuredImage?.url;
          if (url) handleToUrl.set(node.handle, url);
        }
      }
      metaBannersRaw.forEach((b) => {
        // patch 0176: image が URL でない (空 or GID) なら fallback URL で上書き
        if (isResolvableUrl(b.image) || !b.linkUrl) return;
        const h = b.linkUrl.match(/\/collections\/([^/?#]+)/)?.[1];
        if (h && handleToUrl.has(h)) b.image = handleToUrl.get(h)!;
      });
    } catch {
      // Storefront 失敗時はそのまま — HeroSlider の gradient placeholder が最終フォールバック
    }
  }

  const metaColorsRaw: MetaColorModel[] = pcColorModelRaw.map((mo) => {
    const f = fieldsToMap(mo.fields);
    return {
      id: mo.id,
      handle: mo.handle,
      name: f['name'] || '',
      slug: f['slug'] || '',
      image: f['image_url'] || f['image'] || null,
      // patch 0026: Metaobject 定義は hex_color。旧コードは color_code を読んで常に fallback 落ちしていた。
      colorCode: f['hex_color'] || f['color_code'] || '#888888',
      sortOrder: parseInt(f['display_order'] || '0', 10),
      isActive: f['is_active'] === 'true',
    };
  });

  // patch 0011: storefront に渡す直前に dedup — Metaobject 側の重複状態に関係なく
  // storefront は常にユーザ視点の一意集合を受け取る。
  const metaCollabs: MetaCollab[] = dedupByKey(
    metaCollabsRaw,
    (m) => m.shopHandle.trim().toLowerCase(),
    (m) => m.sortOrder,
  );
  const metaBanners: MetaBanner[] = dedupByKey(
    metaBannersRaw,
    (b) => `${b.title.trim()}|${(b.linkUrl || '').trim().toLowerCase()}`,
    (b) => b.sortOrder,
  );
  const metaColors: MetaColorModel[] = dedupByKey(
    metaColorsRaw,
    (c) => c.slug.trim().toLowerCase(),
    (c) => c.sortOrder,
  );

  const metaCategoryCards: MetaCategoryCard[] = categoryCardRaw.map((mo) => {
    const f = fieldsToMap(mo.fields);
    const priceRaw = f['price_from'];
    return {
      id: mo.id,
      handle: mo.handle,
      title: f['title'] || '',
      description: f['description'] || null,
      priceFrom: priceRaw ? parseInt(priceRaw, 10) : null,
      image: f['image'] || null,
      linkUrl: f['link_url'] || null,
      sortOrder: parseInt(f['display_order'] || '0', 10),
      isActive: f['is_active'] === 'true',
    };
  });

  // Sprint 2 Part 3-4: ABOUT セクション整形
  const metaAboutSections: MetaAboutSection[] = aboutSectionRaw.map((mo) => {
    const f = fieldsToMap(mo.fields);
    return {
      id: mo.id,
      handle: mo.handle,
      title: f['title'] || '',
      bodyHtml: f['body_html'] || '',
      image: f['image'] || null,
      linkUrl: f['link_url'] || '',
      linkLabel: f['link_label'] || '',
      isActive: f['is_active'] === 'true',
    };
  });

  // Sprint 2 Part 3-3 / Sprint 4: 商品シェルフ整形 + 全 active shelf の productIds を nodes(ids) で一括取得
  const metaProductShelves: MetaProductShelf[] = productShelfRaw.map((mo) => {
    const f = fieldsToMap(mo.fields);
    let productIds: string[] = [];
    try {
      const parsed = JSON.parse(f['product_ids_json'] || '[]');
      if (Array.isArray(parsed)) {
        productIds = parsed.filter((x): x is string => typeof x === 'string' && x.startsWith('gid://shopify/Product/'));
      }
    } catch {
      productIds = [];
    }
    const rawLimit = parseInt(f['limit'] || '6', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit >= 1 && rawLimit <= 24 ? rawLimit : 6;
    const sk = f['sort_key'];
    const sortKey: 'manual' | 'best_selling' | 'newest' =
      sk === 'best_selling' || sk === 'newest' ? sk : 'manual';
    return {
      id: mo.id,
      handle: mo.handle,
      title: f['title'] || '',
      subtitle: f['subtitle'] || '',
      productIds,
      limit,
      sortKey,
      sortOrder: parseInt(f['display_order'] || '0', 10),
      isActive: f['is_active'] === 'true',
    };
  });

  // 全 active shelf の product IDs を flat + dedupe（将来の複数シェルフ拡張向け）
  const allShelfIds = Array.from(
    new Set(
      metaProductShelves
        .filter((s) => s.isActive && s.productIds.length > 0)
        .flatMap((s) => s.productIds),
    ),
  );

  // 収集した ID を Storefront API nodes(ids:...) で一括解決
  let metaShelfProducts: Record<string, MetaShelfProduct> = {};
  if (allShelfIds.length > 0) {
    try {
      const nodesResult = await context.storefront.query(
        PRODUCTS_BY_IDS_QUERY as unknown as Parameters<typeof context.storefront.query>[0],
        {variables: {ids: allShelfIds}} as Parameters<typeof context.storefront.query>[1],
      );
      const nodes = (nodesResult as unknown as {nodes?: Array<MetaShelfProduct | null>}).nodes || [];
      for (const node of nodes) {
        if (node && node.id) metaShelfProducts[node.id] = node;
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to fetch shelf products:', error);
      }
      metaShelfProducts = {};
    }
  }

  if (process.env.NODE_ENV === 'development') {
    if (ipResult.status === 'rejected') console.error('Failed to fetch IP collections:', ipResult.reason);
    if (pcResult.status === 'rejected') console.error('Failed to fetch PC color collections:', pcResult.reason);
    if (tierResult.status === 'rejected') console.error('Failed to fetch tier prices:', tierResult.reason);
    if (catResult.status === 'rejected') console.error('Failed to fetch category images:', catResult.reason);
  }

  // IPコレクション整形
  // コレクション画像が未設定の場合は、先頭商品の featuredImage にフォールバック
  const ipCollections = ipCollectionsRaw
    ? (() => {
        const data = ipCollectionsRaw as Record<string, IPCollNode | null>;
        const nodes = Object.values(data)
          .filter((c): c is IPCollNode => c !== null && typeof c === 'object' && 'handle' in c)
          .map((c) => {
            if (c.image?.url) return c;
            const fb = c.products?.nodes?.[0]?.featuredImage;
            if (fb?.url) {
              return {
                ...c,
                image: {
                  id: fb.id,
                  url: fb.url,
                  altText: fb.altText ?? c.title,
                  width: fb.width,
                  height: fb.height,
                },
              };
            }
            return c;
          });
        return {collections: {nodes}};
      })()
    : null;

  // PCカラー画像マップ整形
  // コレクション画像が未設定の場合は、コレクション内先頭商品のfeaturedImageにフォールバック
  const pcColorProducts: Record<string, string> = {};
  if (pcColorRaw) {
    type ColorCollNode = {
      image?: {url?: string};
      products?: {nodes?: Array<{featuredImage?: {url?: string}}>};
    };
    const data = pcColorRaw as unknown as Record<string, ColorCollNode | null>;
    for (const [alias, colorName] of Object.entries(aliasToColor)) {
      const col = data[alias];
      const imgUrl = col?.image?.url || col?.products?.nodes?.[0]?.featuredImage?.url;
      if (imgUrl) {
        pcColorProducts[colorName] = imgUrl;
      }
    }
  }

  // 9-4: ティア別最安値をShopifyデータから算出（フォールバック: PC_TIERS静的値）
  const tierPrices: Record<string, number> = {};
  if (tierPricesRaw) {
    const data = tierPricesRaw as unknown as Record<string, {nodes?: Array<{minPrice?: number}> | undefined}>;
    for (const tierKey of ['gamer', 'streamer', 'creator'] as const) {
      const products = (data[tierKey]?.nodes || []) as Array<{minPrice?: number}> | undefined;
      if (Array.isArray(products) && products.length > 0) {
        const minPrice = Math.min(
          ...products.map((p: {priceRange?: {minVariantPrice?: {amount?: string}}}) =>
            parseFloat(p.priceRange?.minVariantPrice?.amount ?? '999999'),
          ),
        );
        if (minPrice < 999999) tierPrices[tierKey.toUpperCase()] = Math.round(minPrice);
      }
    }
  }

  // 9-3: カテゴリ画像マップ整形（ゲーミングPC / ガジェット / グッズ）
  // gaming: GAMER商品のライトブルーバリアント → フォールバック: astromedaコレクション先頭商品
  // gadgets: 「宿儺 キーボード」商品検索結果
  // goods: ヒロアカ モバイルバッテリー 爆轟バリアント画像
  const categoryImages: Record<string, string> = {};
  if (catImagesRaw) {
    type CatVariant = {title?: string; image?: {url?: string}};
    type CatProduct = {
      title?: string;
      featuredImage?: {url?: string};
      variants?: {nodes?: CatVariant[]};
    };
    type CatData = {
      gaming?: {nodes?: CatProduct[]};
      gamingFallback?: {products?: {nodes?: CatProduct[]}};
      gadgets?: {nodes?: Array<{featuredImage?: {url?: string}}>};
      goods?: {nodes?: CatProduct[]};
    };
    const data = catImagesRaw as unknown as CatData;

    // ゲーミングPC: 検索結果からライトブルーバリアント画像を探す
    const gamingProducts = data.gaming?.nodes ?? [];
    let gamingFound = false;
    for (const gp of gamingProducts) {
      if (gamingFound) break;
      const variants = gp.variants?.nodes ?? [];
      const blueVariant = variants.find(
        (v) => v.title === 'ライトブルー' || v.title?.includes('ブルー') || v.title?.includes('Blue'),
      );
      if (blueVariant?.image?.url) {
        categoryImages['astromeda'] = blueVariant.image.url;
        gamingFound = true;
      }
    }
    // ライトブルーがなければ先頭商品のfeaturedImage
    if (!gamingFound && gamingProducts[0]?.featuredImage?.url) {
      categoryImages['astromeda'] = gamingProducts[0].featuredImage.url;
      gamingFound = true;
    }
    // それでもなければastromedaコレクションからフォールバック（ライトブルー優先）
    if (!gamingFound) {
      const fbProducts = data.gamingFallback?.products?.nodes ?? [];
      // まずコレクション商品のライトブルーバリアントを探す
      for (const fbp of fbProducts) {
        if (gamingFound) break;
        const fbVars = fbp.variants?.nodes ?? [];
        const fbBlue = fbVars.find(
          (v) => v.title === 'ライトブルー' || v.title?.includes('ブルー') || v.title?.includes('Blue'),
        );
        if (fbBlue?.image?.url) {
          categoryImages['astromeda'] = fbBlue.image.url;
          gamingFound = true;
        }
      }
      // ライトブルーがなければfeaturedImage
      if (!gamingFound && fbProducts[0]?.featuredImage?.url) {
        categoryImages['astromeda'] = fbProducts[0].featuredImage.url;
      }
    }

    // ガジェット: 宿儺キーボード商品
    const gadgetProduct = data.gadgets?.nodes?.[0];
    if (gadgetProduct?.featuredImage?.url) {
      categoryImages['gadgets'] = gadgetProduct.featuredImage.url;
    }

    // グッズ: ヒロアカ モバイルバッテリー 爆轟バリアント画像
    const goodsProduct = data.goods?.nodes?.[0];
    const goodsVariants = goodsProduct?.variants?.nodes ?? [];
    const bakugoVariant = goodsVariants.find(
      (v) => v.title?.includes('爆'),
    );
    if (bakugoVariant?.image?.url) {
      categoryImages['goods'] = bakugoVariant.image.url;
    } else if (goodsProduct?.featuredImage?.url) {
      categoryImages['goods'] = goodsProduct.featuredImage.url;
    }
  }

  // ── BTF（Below The Fold）データ: 遅延ロードでTTFB最適化 ──
  const recommendedProducts = context.storefront
    .query(RECOMMENDED_PRODUCTS_QUERY)
    .catch((error: Error) => {
      if (process.env.NODE_ENV === 'development') console.error(error);
      return null;
    });

  // I-06: LCP最適化 — ヒーロースライダー最初の画像URLを抽出
  const firstHeroImageUrl = ipCollections?.collections?.nodes?.[0]?.image?.url ?? null;

  // patch 0017: marquee / ugc を整形
  const metaMarqueeItems = marqueeItemRaw
    .map((mo) => {
      const f = fieldsToMap(mo.fields);
      return {
        id: mo.id,
        text: f['text'] || '',
        sortOrder: parseInt(f['display_order'] || '0', 10),
        isActive: f['is_active'] === 'true',
      };
    })
    .filter((m) => m.isActive && m.text)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const metaUgcReviews = ugcReviewRaw
    .map((mo) => {
      const f = fieldsToMap(mo.fields);
      return {
        id: mo.id,
        username: f['username'] || '',
        reviewText: f['review_text'] || '',
        accentColor: f['accent_color'] || '#F06292',
        rating: Math.max(1, Math.min(5, parseInt(f['rating'] || '5', 10) || 5)),
        dateLabel: f['date_label'] || '',
        likes: parseInt(f['likes'] || '0', 10) || 0,
        productName: f['product_name'] || '',
        sortOrder: parseInt(f['display_order'] || '0', 10),
        isActive: f['is_active'] === 'true',
      };
    })
    .filter((u) => u.isActive && u.username && u.reviewText)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // patch 0023: astromeda_pc_tier → metaPcTiers 整形（PCShowcase TierCards 用）
  const metaPcTiers = (pcTierRaw || [])
    .map((r) => {
      const f = fieldsToMap(r.fields);
      return {
        id: r.id,
        handle: r.handle,
        tier: (f['tier_name'] || '').toUpperCase(),
        tierName: f['tier_name'] || '',
        gpu: f['gpu_range'] || '',
        cpu: f['cpu_range'] || '',
        ram: f['ram'] || '',
        price: parseInt(f['base_price'] || '0', 10) || 0,
        pop: f['is_popular'] === 'true',
        sortOrder: parseInt(f['display_order'] || '0', 10),
      };
    })
    .filter((t) => t.tier && t.gpu && t.cpu)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // patch 0025 (P2-H): astromeda_campaign → アクティブな1件採用（homepage 最上部 promo banner 用）
  const now = Date.now();
  const metaCampaigns = (campaignRaw || [])
    .map((r) => {
      const f = fieldsToMap(r.fields);
      const startAt = f['start_at'] ? Date.parse(f['start_at']) : 0;
      const endAt = f['end_at'] ? Date.parse(f['end_at']) : Number.POSITIVE_INFINITY;
      return {
        id: r.id,
        handle: r.handle,
        title: f['title'] || '',
        description: f['description'] || '',
        discountCode: f['discount_code'] || '',
        discountPercent: parseInt(f['discount_percent'] || '0', 10) || 0,
        targetTags: f['target_tags'] || '',
        status: (f['status'] || '').toLowerCase(),
        startAt: Number.isFinite(startAt) ? startAt : 0,
        endAt: Number.isFinite(endAt) ? endAt : Number.POSITIVE_INFINITY,
      };
    })
    .filter(
      (c) =>
        c.title &&
        c.status === 'active' &&
        c.startAt <= now &&
        now <= c.endAt,
    )
    .sort((a, b) => b.startAt - a.startAt);
  const activeCampaign = metaCampaigns[0] || null;

  return {
    recommendedProducts,
    ipCollections,
    pcColorProducts,
    tierPrices,
    categoryImages,
    firstHeroImageUrl,
    metaCollabs,
    metaBanners,
    metaColors,
    metaCategoryCards,
    metaProductShelves,
    metaShelfProducts,
    metaAboutSections,
    metaMarqueeItems,
    metaUgcReviews,
    metaPcTiers,
    activeCampaign,
    isShopLinked: Boolean(context.env.PUBLIC_STORE_DOMAIN),
  };
}

// I-06: ヒーロー画像のLink preloadヘッダーでLCP改善
export const headers: Route.HeadersFunction = ({loaderHeaders, parentHeaders}) => {
  const headers = new Headers(parentHeaders);
  // loaderHeadersがあれば引き継ぎ
  for (const [key, value] of loaderHeaders.entries()) {
    headers.set(key, value);
  }
  return headers;
};

export default function Homepage() {
  const data = useLoaderData<typeof loader>();

  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        fontFamily: "'Outfit', 'Noto Sans JP', system-ui, sans-serif",
        color: T.tx,
      }}
    >
      <h1 style={{position:'absolute',width:'1px',height:'1px',padding:0,margin:'-1px',overflow:'hidden',clip:'rect(0,0,0,0)',whiteSpace:'nowrap',border:0}}>ASTROMEDA | アニメ・ゲームIPコラボゲーミングPC</h1>

      {/* F1+F2: トップページ FAQPage JSON-LD — AI検索エンティティ最適化 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            'mainEntity': [
              {
                '@type': 'Question',
                'name': 'ASTROMEDAとはどんなブランドですか？',
                'acceptedAnswer': {
                  '@type': 'Answer',
                  'text': 'ASTROMEDA（アストロメダ）は、株式会社マイニングベースが運営する日本発のゲーミングPCブランドです。25タイトル以上のアニメ・ゲームIPとの公式コラボレーションPCを展開し、国内自社工場で全台を組み立て・品質検査しています。',
                },
              },
              {
                '@type': 'Question',
                'name': 'ASTROMEDAのゲーミングPCの価格帯は？',
                'acceptedAnswer': {
                  '@type': 'Answer',
                  'text': 'GAMERモデル（RTX 5060〜5080搭載）が199,980円から、STREAMERモデル（RTX 5070Ti〜5090搭載）が405,440円から、CREATORモデル（RTX 5070Ti〜5090搭載）が455,840円から。全モデルDDR5メモリ標準搭載です。',
                },
              },
              {
                '@type': 'Question',
                'name': 'ASTROMEDAのPCはどこで買えますか？',
                'acceptedAnswer': {
                  '@type': 'Answer',
                  'text': 'ASTROMEDA公式オンラインストア（shop.mining-base.co.jp）で購入できます。送料無料で、8色のイルミネーションカラーから選べるカスタマイズにも対応しています。',
                },
              },
              {
                '@type': 'Question',
                'name': 'ASTROMEDAにはどんなIPコラボがありますか？',
                'acceptedAnswer': {
                  '@type': 'Answer',
                  'text': 'ONE PIECE、NARUTO、呪術廻戦、チェンソーマン、ぼっち・ざ・ろっく！、BLEACH、サンリオキャラクターズ、ストリートファイター6、ソニック、hololive Englishなど、25タイトル以上の公式ライセンスIPコラボレーションがあります。',
                },
              },
            ],
          }),
        }}
      />
      {/* J-SEO-01: Organization + WebSite JSON-LD — Google Knowledge Graph エンティティ認識 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Organization',
                '@id': `${STORE_URL}#organization`,
                'name': 'ASTROMEDA',
                'alternateName': 'アストロメダ',
                'url': STORE_URL,
                'logo': {
                  '@type': 'ImageObject',
                  'url': 'https://cdn.shopify.com/s/files/1/0756/0408/7268/files/astromeda-ogp.jpg?v=1',
                },
                'description': '株式会社マイニングベースが手掛ける日本発のゲーミングPCブランド。25タイトル以上のアニメ・ゲームIPコラボPC。',
                'foundingDate': '2018',
                'parentOrganization': {
                  '@type': 'Organization',
                  'name': '株式会社マイニングベース',
                  'url': 'https://mining-base.co.jp',
                },
                'sameAs': [
                  'https://x.com/astromedapc',
                  'https://line.me/R/ti/p/@astromeda',
                ],
                'contactPoint': {
                  '@type': 'ContactPoint',
                  'contactType': 'customer service',
                  'availableLanguage': 'Japanese',
                },
              },
              {
                '@type': 'WebSite',
                '@id': `${STORE_URL}#website`,
                'name': 'ASTROMEDA',
                'url': STORE_URL,
                'publisher': {'@id': `${STORE_URL}#organization`},
                'potentialAction': {
                  '@type': 'SearchAction',
                  'target': {
                    '@type': 'EntryPoint',
                    'urlTemplate': `${STORE_URL}/search?q={search_term_string}`,
                  },
                  'query-input': 'required name=search_term_string',
                },
                'inLanguage': 'ja',
              },
            ],
          }),
        }}
      />
      {/* patch 0025 (P2-H): キャンペーンバナー — astromeda_campaign がアクティブなら homepage 最上部に表示 */}
      {data.activeCampaign && (
        <div
          data-campaign-id={data.activeCampaign.id}
          data-campaign-handle={data.activeCampaign.handle}
          style={{
            background: `linear-gradient(90deg, ${T.c}, ${T.s})`,
            color: '#06060C',
            padding: '10px clamp(16px, 3vw, 32px)',
            textAlign: 'center',
            fontSize: 'clamp(13px, 1.6vw, 15px)',
            fontWeight: 700,
            letterSpacing: '0.02em',
            lineHeight: 1.4,
          }}
        >
          <span style={{fontWeight: 800, marginRight: 8}}>🔥 {data.activeCampaign.title}</span>
          {data.activeCampaign.discountPercent > 0 && (
            <span style={{marginRight: 8}}>{data.activeCampaign.discountPercent}% OFF</span>
          )}
          {data.activeCampaign.discountCode && (
            <span
              style={{
                display: 'inline-block',
                background: '#06060C',
                color: T.c,
                padding: '2px 10px',
                borderRadius: 4,
                fontWeight: 800,
                letterSpacing: '0.05em',
                marginLeft: 4,
              }}
            >
              CODE: {data.activeCampaign.discountCode}
            </span>
          )}
        </div>
      )}
      {/* Marquee strip */}
      <div
        style={{
          background: al(T.c, 0.03),
          borderTop: `1px solid ${al(T.c, 0.06)}`,
          borderBottom: `1px solid ${al(T.c, 0.06)}`,
          overflow: 'hidden',
          padding: '9px 0',
        }}
      >
        <div
          className="mq"
          style={{
            display: 'flex',
            gap: 'clamp(24px, 4vw, 48px)',
            whiteSpace: 'nowrap',
            width: 'max-content',
          }}
        >
          {/* patch 0017: Metaobject に有効エントリがあれば CMS 優先、無ければ定数フォールバック */}
          {(() => {
            const marqueeTexts = (data.metaMarqueeItems && data.metaMarqueeItems.length > 0)
              ? data.metaMarqueeItems.map((m) => m.text)
              : MARQUEE_ITEMS;
            return [0, 1].flatMap((r) =>
              marqueeTexts.map((t, i) => (
                <span
                  key={`${r}-${i}`}
                  style={{
                    fontSize: 'clamp(9px, 1.2vw, 11px)',
                    color: al(T.c, 0.55),
                    fontWeight: 700,
                  }}
                >
                  {t}
                </span>
              )),
            );
          })()}
        </div>
      </div>

      {/* Hero Slider — ATFデータはawait済みなので直接レンダリング（Hydration安定） */}
      {/* patch 0167: SectionOverride で包む — admin の「🎨 デザイン上書き」設定があれば差し替え */}
      <SectionOverride sectionKey="home_hero">
        <HeroSlider
          collections={data.ipCollections?.collections?.nodes ?? null}
          metaBanners={data.metaBanners}
        />
      </SectionOverride>

      {/* PC Showcase — ATFデータはawait済み */}
      {/* patch 0144 P0: id="colors" を付与して admin TagPipelineMap の /#colors link を実機能化 */}
      <div id="colors" style={{...PAGE_WIDTH, paddingTop: 'clamp(20px, 3vw, 32px)', scrollMarginTop: 80}}>
        {/* patch 0167: SectionOverride で包む — 8色カラー UI をデザイン会社が差し替え可能 */}
        <SectionOverride sectionKey="home_color_models">
          <PCShowcase
            colorImages={(data.pcColorProducts as Record<string, string>) ?? {}}
            metaColors={data.metaColors}
            metaPcTiers={data.metaPcTiers}
          />
        </SectionOverride>
        {/* PCTierCards（GAMER/STREAMER/CREATOR）は削除済み */}
      </div>

      {/* D1: ASTROMEDAとは — コンパクトバナー（Sprint 2 Part 3-4: Metaobject 優先） */}
      {(() => {
        // Metaobject 完全性チェック: 全フィールドが非空 かつ is_active=true な最初のエントリを採用
        const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').trim();
        const active = (data.metaAboutSections || []).find((a) =>
          a.isActive &&
          a.title.trim() !== '' &&
          stripTags(a.bodyHtml) !== '' &&
          a.linkUrl.trim() !== '' &&
          a.linkLabel.trim() !== ''
        );
        const title = active ? active.title : 'ASTROMEDAとは？';
        const subtitle = active ? stripTags(active.bodyHtml) : '日本発・25タイトル以上のIPコラボゲーミングPC';
        // patch 0012: CMS linkUrl が旧サイト絶対URLで入っていても内部パスに畳む
        const linkUrl = toInternalPath(active ? active.linkUrl : '/about');
        const linkLabel = active ? active.linkLabel : '詳しく見る →';
        return (
          <section style={{...PAGE_WIDTH, paddingTop: 'clamp(20px, 3vw, 32px)', paddingBottom: 'clamp(16px, 2vw, 24px)'}}>
            <Link
              to={linkUrl}
              className="hl"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'clamp(12px, 2vw, 24px)',
                padding: 'clamp(14px, 2vw, 20px) clamp(16px, 2.5vw, 28px)',
                borderRadius: 12,
                background: `linear-gradient(135deg, #0a0e1a 0%, #0f1a2e 50%, #162040 100%)`,
                border: `1px solid ${al(T.c, 0.15)}`,
                textDecoration: 'none',
                transition: 'border-color .2s',
              }}
            >
              <div style={{flex: 1, minWidth: 0}}>
                <div style={{fontSize: 9, fontWeight: 700, color: T.c, letterSpacing: 3, marginBottom: 4, opacity: 0.8}}>ABOUT</div>
                <div style={{fontSize: 'clamp(14px, 2vw, 20px)', fontWeight: 900, color: '#fff', lineHeight: 1.3}}>{title}</div>
                <div style={{fontSize: 'clamp(10px, 1.1vw, 12px)', color: T.t5, marginTop: 4}}>{subtitle}</div>
              </div>
              <div style={{fontSize: 'clamp(11px, 1.2vw, 13px)', fontWeight: 700, color: T.c, whiteSpace: 'nowrap', flexShrink: 0}}>{linkLabel}</div>
            </Link>
          </section>
        );
      })()}

      {/* Category quick nav */}
      <div
        style={{
          ...PAGE_WIDTH,
          paddingBottom: 'clamp(20px, 3vw, 32px)',
        }}
      >
        <div
          style={{
            fontSize: 'clamp(10px, 1.2vw, 12px)',
            fontWeight: 800,
            color: T.t4,
            letterSpacing: 2,
            marginBottom: 12,
          }}
        >
          CATEGORY
        </div>
        {(() => {
              // Storefront APIから取得した商品画像を使用（cdn.shopify.com経由で確実にロード）
              const catImgs = data.categoryImages || {};
              // Sprint 2 Part 3-2: Metaobject 優先表示（厳格完全性チェック）
              //   - isActive=true のエントリが1件以上 AND 全エントリが title+description+priceFrom を満たす場合のみ採用
              //   - 不完全なエントリが1件でもあれば既存ハードコードにフォールバック（破壊的変更ゼロ保証）
              const rawMetaCards = (data.metaCategoryCards || [])
                .filter((c) => c.isActive)
                .sort((a, b) => a.sortOrder - b.sortOrder);
              const allComplete = rawMetaCards.length > 0 && rawMetaCards.every((c) =>
                c.title.trim() !== '' &&
                (c.description?.trim() ?? '') !== '' &&
                c.priceFrom != null && c.priceFrom > 0 &&
                (c.linkUrl?.trim() ?? '') !== ''
              );
              const cats = allComplete
                ? rawMetaCards.map((c) => ({
                    name: c.title,
                    sub: c.description || '',
                    // patch 0012: CMS linkUrl を内部パス正規化（旧サイト絶対URL離脱防止）
                    to: toInternalPath(c.linkUrl || '#'),
                    pr: c.priceFrom != null ? `¥${c.priceFrom.toLocaleString('ja-JP')}〜` : '',
                    ac: T.c,
                    bg: '#0a0e1a',
                    img: c.image || '',
                  }))
                : [
                {name: 'ゲーミングPC', sub: 'GAMING PC', to: '/collections/astromeda', pr: '¥199,980〜', ac: '#3498DB', bg: '#0a1424',
                  img: catImgs['astromeda'] || ''},
                {name: 'ガジェット', sub: 'GADGETS', to: '/collections/gadgets', pr: '¥4,980〜', ac: '#FF3333', bg: '#1a0a0a',
                  img: catImgs['gadgets'] || ''},
                {name: 'グッズ', sub: 'GOODS', to: '/collections/goods', pr: '¥990〜', ac: '#00C853', bg: '#0a1a0e',
                  img: catImgs['goods'] || ''},
              ];
              const useAutoGrid = cats.length > 3;
              return (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: useAutoGrid
                      ? 'repeat(auto-fill, minmax(280px, 1fr))'
                      : 'repeat(3, 1fr)',
                    gap: 'clamp(8px, 1.2vw, 14px)',
                  }}
                  className="astro-cat-grid"
                >
                  {cats.map((c) => (
                    <Link
                      key={c.name}
                      to={c.to}
                      className="hl"
                      style={{
                        position: 'relative',
                        borderRadius: 'clamp(10px, 1.5vw, 16px)',
                        overflow: 'hidden',
                        aspectRatio: '5/4',
                        cursor: 'pointer',
                        textDecoration: 'none',
                        display: 'block',
                        border: `1px solid ${al(c.ac, 0.2)}`,
                        background: c.bg,
                      }}
                    >
                      {/* Product image — CSS background (壊れた画像アイコンが出ない) */}
                      {c.img && (
                        <div style={{
                          position: 'absolute',
                          right: '-5%',
                          top: '5%',
                          width: '70%',
                          height: '90%',
                          backgroundImage: `url(${c.img}${c.img.includes('?') ? '&' : '?'}width=600)`,
                          backgroundSize: 'contain',
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'center right',
                        }} />
                      )}
                      {/* Gradient overlay */}
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: `linear-gradient(90deg, ${c.bg} 0%, ${c.bg} 25%, ${c.bg}cc 45%, transparent 75%)`,
                      }} />
                      {/* Text - left side */}
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: 0,
                          width: '55%',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          padding: 'clamp(12px, 2.5vw, 28px)',
                        }}
                      >
                        <div
                          className="ph cat-sub"
                          style={{
                            fontSize: 'clamp(9px, 1.1vw, 12px)',
                            fontWeight: 700,
                            color: c.ac,
                            letterSpacing: 2,
                            marginBottom: 6,
                            opacity: 0.8,
                          }}
                        >
                          {c.sub}
                        </div>
                        <div
                          className="cat-name"
                          style={{
                            fontSize: 'clamp(15px, 2.2vw, 28px)',
                            fontWeight: 900,
                            color: '#fff',
                            lineHeight: 1.2,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {c.name}
                        </div>
                        <div
                          className="ph cat-price"
                          style={{
                            fontSize: 'clamp(12px, 1.4vw, 17px)',
                            fontWeight: 900,
                            color: c.ac,
                            marginTop: 8,
                          }}
                        >
                          {c.pr}
                        </div>
                        <div className="ph" style={{
                          marginTop: 'clamp(8px, 1.2vw, 14px)',
                          fontSize: 'clamp(9px, 1vw, 11px)',
                          fontWeight: 700,
                          color: al(c.ac, 0.7),
                        }}>
                          見る →
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              );
            })()}
      </div>

      {/* Collab Grid — ATFデータはawait済み */}
      {/* patch 0144 P0: id="collabs" を付与して admin TagPipelineMap の /#collabs link を実機能化 */}
      <div id="collabs" style={{scrollMarginTop: 80}}>
        {/* patch 0167: SectionOverride で包む — IP コラボグリッドをデザイン会社が差し替え可能 */}
        <SectionOverride sectionKey="home_ip_collabs">
          <CollabGrid
            collections={data.ipCollections?.collections?.nodes ?? null}
            metaCollabs={data.metaCollabs}
          />
        </SectionOverride>
      </div>

      {/* Featured products from Shopify — Sprint 2 Part 3-3: Metaobject product shelf 優先 */}
      {(() => {
        // 完全性チェック: active かつ title + productIds + 解決済み products を満たす最小 sortOrder の shelf を採用
        const shelves = (data.metaProductShelves || [])
          .filter((s) => s.isActive && s.title.trim() !== '' && s.productIds.length > 0)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const lookup = (data.metaShelfProducts || {}) as Record<string, MetaShelfProduct>;
        const chosen = shelves.find((s) => s.productIds.some((id) => lookup[id])) || null;
        if (!chosen) return null;
        const resolvedProducts = chosen.productIds
          .map((id) => lookup[id])
          .filter((p): p is MetaShelfProduct => p != null);
        if (resolvedProducts.length === 0) return null;
        // Metaobject モード: 既存フィルタ bypass、管理者選定をそのまま表示
        return (
          <section style={{...PAGE_WIDTH, paddingBottom: 'clamp(24px, 3vw, 40px)'}}>
            <div style={{display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 'clamp(14px, 2vw, 20px)'}}>
              <span className="ph" style={{fontSize: 'clamp(14px, 1.8vw, 18px)', fontWeight: 900, color: T.tx}}>
                {chosen.title}
              </span>
            </div>
            <div className="new-arrivals-grid">
              {resolvedProducts.map((product) => (
                <Link
                  key={product.id}
                  to={`/products/${product.handle}`}
                  className="astro-product-card"
                  style={{textDecoration: 'none'}}
                >
                  {product.featuredImage?.url && (
                    <div style={{aspectRatio: '4/3', overflow: 'hidden'}}>
                      <img
                        src={`${product.featuredImage.url}${product.featuredImage.url.includes('?') ? '&' : '?'}width=400`}
                        alt={product.featuredImage.altText || product.title}
                        loading="lazy"
                        decoding="async"
                        style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block'}}
                      />
                    </div>
                  )}
                  <div style={{padding: 'clamp(10px, 1.2vw, 14px)'}}>
                    <div style={{fontSize: 'clamp(10px, 1.2vw, 12px)', fontWeight: 800, color: T.tx, lineHeight: 1.3, marginBottom: 4}}>
                      {product.title}
                    </div>
                    {product.priceRange?.minVariantPrice && (
                      <div className="ph" style={{fontSize: 'clamp(13px, 1.6vw, 16px)', color: T.c, fontWeight: 900}}>
                        ¥{Number(product.priceRange.minVariantPrice.amount ?? '0').toLocaleString('ja-JP')}
                        <span style={{fontSize: 10, color: T.t4, fontWeight: 500}}>〜</span>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })() || (
      <Suspense fallback={<ProductGridSkeleton count={8} />}>
        <Await resolve={data.recommendedProducts}>
          {(products) => {
            const PARTS_KEYWORDS = /Wireless LAN|Wi-Fi|Bluetooth|SSD|HDD|NVMe|DDR[45]|^RAM |^CPU |^GPU |OPTION|PCIe|M\.2|USB Hub|Fan |Power Supply|PSU|Cooler|AIO/i;
            const visibleProducts = products?.products?.nodes?.filter((p: RecommendedProductFragment) => {
              const t = p.title ?? '';
              if (/【OPTION\s*\d*\s*】/.test(t) || t.includes('【OPTION')) return false;
              const minPrice = parseFloat(p.priceRange?.minVariantPrice?.amount ?? '0');
              if (minPrice === 0) return false;
              if (PARTS_KEYWORDS.test(t)) return false;
              return true;
            }) ?? [];
            return visibleProducts.length > 0 ? (
              <section
                style={{
                  ...PAGE_WIDTH,
                  paddingBottom: 'clamp(24px, 3vw, 40px)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 10,
                    marginBottom: 'clamp(14px, 2vw, 20px)',
                  }}
                >
                  <span
                    className="ph"
                    style={{
                      fontSize: 'clamp(14px, 1.8vw, 18px)',
                      fontWeight: 900,
                      color: T.tx,
                    }}
                  >
                    NEW ARRIVALS
                  </span>
                </div>
                <div className="new-arrivals-grid">
                  {visibleProducts.map((product: RecommendedProductFragment) => (
                    <Link
                      key={product.id}
                      to={`/products/${product.handle}`}
                      className="astro-product-card"
                      style={{textDecoration: 'none'}}
                    >
                      {product.featuredImage && (
                        <div style={{aspectRatio: '4/3', overflow: 'hidden'}}>
                          <Image
                            data={product.featuredImage}
                            sizes="(min-width: 768px) 25vw, 50vw"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              borderRadius: 0,
                            }}
                          />
                        </div>
                      )}
                      <div style={{padding: 'clamp(10px, 1.2vw, 14px)'}}>
                        <div
                          style={{
                            fontSize: 'clamp(10px, 1.2vw, 12px)',
                            fontWeight: 800,
                            color: T.tx,
                            lineHeight: 1.3,
                            marginBottom: 4,
                          }}
                        >
                          {product.title}
                        </div>
                        {product.priceRange?.minVariantPrice && (
                          <div
                            className="ph"
                            style={{
                              fontSize: 'clamp(13px, 1.6vw, 16px)',
                              color: T.c,
                              fontWeight: 900,
                            }}
                          >
                            ¥
                            {Number(
                              product.priceRange?.minVariantPrice?.amount ?? '0',
                            ).toLocaleString('ja-JP')}
                            <span
                              style={{
                                fontSize: 10,
                                color: T.t4,
                                fontWeight: 500,
                              }}
                            >
                              〜
                            </span>
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null;
          }}
        </Await>
      </Suspense>
      )}

      {/* UGC Reviews */}
      <section
        style={{
          ...PAGE_WIDTH,
          paddingBottom: 'clamp(32px, 4vw, 48px)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            marginBottom: 'clamp(14px, 2vw, 20px)',
          }}
        >
          <span
            className="ph"
            style={{
              fontSize: 'clamp(14px, 1.8vw, 18px)',
              fontWeight: 900,
              color: T.tx,
            }}
          >
            REVIEWS
          </span>
          <span style={{fontSize: 'clamp(10px, 1.2vw, 12px)', color: T.t4}}>
            ユーザーレビュー
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 12,
            overflowX: 'auto',
            paddingBottom: 8,
          }}
          className="fps-scroll"
        >
          {(() => {
            // patch 0017: CMS metaUgcReviews を優先、無い/空なら UGC 定数にフォールバック
            const ugcReviews = (data.metaUgcReviews && data.metaUgcReviews.length > 0)
              ? data.metaUgcReviews.map((m) => ({
                  id: m.id,
                  u: m.username,
                  t: m.reviewText,
                  c: m.accentColor || '#F06292',
                  s: m.rating,
                  d: m.dateLabel,
                  likes: m.likes,
                }))
              : UGC;
            return ugcReviews.map((u) => (
              <div
                key={u.id}
                className="ugc-card"
                style={{
                  flexShrink: 0,
                  background: T.bgC,
                  borderRadius: 16,
                  border: `1px solid ${al(u.c, 0.12)}`,
                  padding: 'clamp(14px, 1.5vw, 18px)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: `linear-gradient(135deg, ${u.c}, ${al(u.c, 0.4)})`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 900,
                      color: '#000',
                      flexShrink: 0,
                    }}
                  >
                    {(u.u || '?').slice(1, 2).toUpperCase() || (u.u || '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 'clamp(9px, 1.1vw, 11px)',
                        fontWeight: 700,
                        color: T.t5,
                      }}
                    >
                      {u.u}
                    </div>
                    <div style={{fontSize: 'clamp(8px, 1vw, 10px)', color: T.t3}}>
                      {u.d}
                    </div>
                  </div>
                </div>
                <div style={{fontSize: 'clamp(9px, 1.1vw, 11px)', color: T.t5, lineHeight: 1.5}}>
                  {u.t}
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10}}>
                  <div style={{display: 'flex', gap: 2}}>
                    {[...Array(u.s)].map((_, si) => (
                      <span key={si} style={{color: T.g, fontSize: 12}}>★</span>
                    ))}
                  </div>
                  <span style={{fontSize: 'clamp(8px, 1vw, 10px)', color: T.t3}}>
                    ♡ {u.likes}
                  </span>
                </div>
              </div>
            ));
          })()}
        </div>
      </section>

      {/* CSS animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes mq { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .mq { animation: mq 30s linear infinite; }
        .hl { transition: transform .2s, border-color .2s; }
        .hl:hover { transform: translateY(-3px); border-color: rgba(0,240,255,.2); }
        .fps-scroll::-webkit-scrollbar { display: none; }
        .fps-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        .ugc-card { min-width: 200px; }
        .new-arrivals-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: clamp(8px, 1.5vw, 16px);
        }
        .astro-cat-grid {
          grid-template-columns: repeat(3, 1fr) !important;
          gap: clamp(6px, 1.2vw, 14px) !important;
        }
        .astro-cat-grid > a {
          aspect-ratio: 1/1 !important;
        }
        @media (min-width:768px) {
          .ugc-card { min-width: 240px; }
          .new-arrivals-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
          .astro-cat-grid > a { aspect-ratio: 5/4 !important; }
        }
        @media (max-width:767px) {
          .hero-text-overlay { display: none !important; }
          .hero-gradient-overlay { background: none !important; }
          .collab-text-overlay { display: none !important; }
          .collab-gradient-overlay { background: none !important; }
          .cat-sub { display: none !important; }
          .cat-price { display: none !important; }
          .astro-cat-grid > a .cat-name { font-size: 10px !important; white-space: nowrap !important; }
        }
      `}} />
    </div>
  );
}

// ─── GraphQL Queries ─────────────────────────────

// Sprint 2 Part 3-3: 商品シェルフ用 — product GID 配列で一括取得
const PRODUCTS_BY_IDS_QUERY = `#graphql
  query ProductsByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        handle
        featuredImage { url altText width height }
        priceRange {
          minVariantPrice { amount currencyCode }
        }
      }
    }
  }
` as const;

const RECOMMENDED_PRODUCTS_QUERY = `#graphql
  fragment RecommendedProduct on Product {
    id
    title
    handle
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
    }
    featuredImage {
      id
      altText
      url
      width
      height
    }
  }
  query RecommendedProducts ($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    products(first: 12, sortKey: UPDATED_AT, reverse: true, query: "price:>0") {
      nodes {
        ...RecommendedProduct
      }
    }
  }
` as const;

// COLLABSのshopフィールドからハンドルを自動生成（DNA一元管理）
// 手動リストとの不整合を永久に防止する
const IP_HANDLES = COLLABS.map((c) => c.shop);

function buildAliasName(handle: string): string {
  return handle.replace(/[^a-zA-Z0-9]/g, '_');
}

// コレクション画像が未設定の場合に備えて、先頭商品の featuredImage もフォールバックとして取得
const IP_COLLECTIONS_BY_HANDLE_QUERY = `#graphql
  query IPCollections {
${IP_HANDLES.map(
  (h) => `    ${buildAliasName(h)}: collectionByHandle(handle: "${h}") {
      id
      title
      handle
      image { id url altText width height }
      products(first: 1) { nodes { featuredImage { id url altText width height } } }
    }`
).join('\n')}
  }
` as const;


// Shopify本番ハンドル: white/black/pink/purple/light-blue/red/green/orange
// コレクション画像が未設定の場合に備えて、先頭商品のfeaturedImageもフォールバックとして取得
const PC_COLOR_COLLECTIONS_QUERY = `#graphql
  fragment ColorColl on Collection {
    id title handle
    image { id url altText width height }
    products(first: 1) { nodes { featuredImage { id url altText width height } } }
  }
  query PCColorCollections {
    colorWhite: collectionByHandle(handle: "white") { ...ColorColl }
    colorBlack: collectionByHandle(handle: "black") { ...ColorColl }
    colorPink: collectionByHandle(handle: "pink") { ...ColorColl }
    colorPurple: collectionByHandle(handle: "purple") { ...ColorColl }
    colorBlue: collectionByHandle(handle: "light-blue") { ...ColorColl }
    colorRed: collectionByHandle(handle: "red") { ...ColorColl }
    colorGreen: collectionByHandle(handle: "green") { ...ColorColl }
    colorOrange: collectionByHandle(handle: "orange") { ...ColorColl }
  }
` as const;

/**
 * 9-4: ティア別最安値取得クエリ
 * タグ "gamer", "streamer", "creator" で商品をフィルタし、
 * 各ティアの最安値を動的に算出する。
 * sortKey: PRICE で1件取得すれば最安値が取れる。
 */
const TIER_PRICES_QUERY = `#graphql
  query TierPrices ($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    gamer: products(first: 1, sortKey: PRICE, query: "tag:gamer AND product_type:ゲーミングPC AND price:>0") {
      nodes {
        priceRange { minVariantPrice { amount currencyCode } }
      }
    }
    streamer: products(first: 1, sortKey: PRICE, query: "tag:streamer AND product_type:ゲーミングPC AND price:>0") {
      nodes {
        priceRange { minVariantPrice { amount currencyCode } }
      }
    }
    creator: products(first: 1, sortKey: PRICE, query: "tag:creator AND product_type:ゲーミングPC AND price:>0") {
      nodes {
        priceRange { minVariantPrice { amount currencyCode } }
      }
    }
  }
` as const;

// 9-3: カテゴリ画像をShopify APIから動的取得（ゲーミングPC/ガジェット/グッズ）
// gaming: GAMER商品を検索しライトブルーバリアント画像を取得（productByHandleは特定ハンドル依存で脆い）
// フォールバック: astromedaコレクションの先頭商品画像
const CATEGORY_IMAGES_QUERY = `#graphql
  query CategoryImages {
    gaming: products(first: 3, query: "ASTROMEDA GAMER product_type:ゲーミングPC") {
      nodes {
        title
        featuredImage { url altText width height }
        variants(first: 10) {
          nodes { title image { url altText width height } }
        }
      }
    }
    gamingFallback: collectionByHandle(handle: "astromeda") {
      products(first: 5) {
        nodes {
          featuredImage { url altText width height }
          variants(first: 10) {
            nodes { title image { url altText width height } }
          }
        }
      }
    }
    gadgets: products(first: 1, query: "宿儺 キーボード") {
      nodes { title featuredImage { url altText width height } }
    }
    goods: products(first: 1, query: "モバイルバッテリー ヒーローアカデミア") {
      nodes {
        title
        featuredImage { url altText width height }
        variants(first: 10) {
          nodes { title image { url altText width height } }
        }
      }
    }
  }
` as const;

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
