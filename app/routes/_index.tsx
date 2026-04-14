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
import {CollabGrid} from '~/components/astro/CollabGrid';
import {PCShowcase} from '~/components/astro/PCShowcase';
// ScrollReveal removed: causes opacity:0 issues when CSS files return 503 from Shopify CDN
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {preloadImage, optimizeImageUrl} from '~/lib/cache-headers';
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

  // 並列でATFデータを取得（Hero, CollabGrid, PCShowcase全てに必要）
  const [ipResult, pcResult, tierResult, catResult] = await Promise.allSettled([
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
  ]);

  const ipCollectionsRaw = ipResult.status === 'fulfilled' ? ipResult.value : null;
  const pcColorRaw = pcResult.status === 'fulfilled' ? pcResult.value : null;
  const tierPricesRaw = tierResult.status === 'fulfilled' ? tierResult.value : null;
  const catImagesRaw = catResult.status === 'fulfilled' ? catResult.value : null;

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

  return {
    recommendedProducts,
    ipCollections,
    pcColorProducts,
    tierPrices,
    categoryImages,
    firstHeroImageUrl,
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
          {[0, 1].flatMap((r) =>
            MARQUEE_ITEMS.map((t, i) => (
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
          )}
        </div>
      </div>

      {/* Hero Slider — ATFデータはawait済みなので直接レンダリング（Hydration安定） */}
      <HeroSlider
        collections={data.ipCollections?.collections?.nodes ?? null}
      />

      {/* PC Showcase — ATFデータはawait済み */}
      <div style={{...PAGE_WIDTH, paddingTop: 'clamp(20px, 3vw, 32px)'}}>
        <PCShowcase
          colorImages={(data.pcColorProducts as Record<string, string>) ?? {}}
        />
        {/* PCTierCards（GAMER/STREAMER/CREATOR）は削除済み */}
      </div>

      {/* D1: ASTROMEDAとは — コンパクトバナー（詳細は専用ページへ） */}
      <section style={{...PAGE_WIDTH, paddingTop: 'clamp(20px, 3vw, 32px)', paddingBottom: 'clamp(16px, 2vw, 24px)'}}>
        <Link
          to="/about"
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
            <div style={{fontSize: 'clamp(14px, 2vw, 20px)', fontWeight: 900, color: '#fff', lineHeight: 1.3}}>ASTROMEDAとは？</div>
            <div style={{fontSize: 'clamp(10px, 1.1vw, 12px)', color: T.t5, marginTop: 4}}>日本発・25タイトル以上のIPコラボゲーミングPC</div>
          </div>
          <div style={{fontSize: 'clamp(11px, 1.2vw, 13px)', fontWeight: 700, color: T.c, whiteSpace: 'nowrap', flexShrink: 0}}>詳しく見る →</div>
        </Link>
      </section>

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
              const cats = [
                {name: 'ゲーミングPC', sub: 'GAMING PC', to: '/collections/astromeda', pr: '¥199,980〜', ac: '#3498DB', bg: '#0a1424',
                  img: catImgs['astromeda'] || ''},
                {name: 'ガジェット', sub: 'GADGETS', to: '/collections/gadgets', pr: '¥4,980〜', ac: '#FF3333', bg: '#1a0a0a',
                  img: catImgs['gadgets'] || ''},
                {name: 'グッズ', sub: 'GOODS', to: '/collections/goods', pr: '¥990〜', ac: '#00C853', bg: '#0a1a0e',
                  img: catImgs['goods'] || ''},
              ];
              return (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
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
        <CollabGrid
          collections={data.ipCollections?.collections?.nodes ?? null}
        />

      {/* Featured products from Shopify */}
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
          {UGC.map((u) => (
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
                  {u.u.slice(1, 2).toUpperCase()}
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
          ))}
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
