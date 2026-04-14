import {useLoaderData, Link} from 'react-router';
import type {Route} from './+types/setup.$color';
import {T, al, PC_COLORS} from '~/lib/astromeda-data';
import {SetupSlider} from '~/components/astro/SetupSlider';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import type {SetupImage} from '~/components/astro/SetupSlider';

/* ─── helpers ─── */
function findColor(slug: string) {
  return PC_COLORS.find((c) => c.slug === slug);
}

/* ─── meta ─── */
export const meta: Route.MetaFunction = ({data}) => {
  const color = data?.colorData;
  return [
    {title: `ASTROMEDA | ${color?.n ?? ''} セットアップ`},
    {
      name: 'description',
      content: `Astromeda ${color?.n ?? ''}カラーの製品利用イメージギャラリー。設置例やセットアップパターンをご覧いただけます。`,
    },
  ];
};

/* ─── loader ─── */
export async function loader({params, context}: Route.LoaderArgs) {
  const {color: slug} = params;
  const colorData = findColor(slug ?? '');

  if (!colorData) {
    throw new Response('カラーが見つかりません', {status: 404});
  }

  // ── 上段・下段: 画像を並行取得 ──
  const lifestyleImages: SetupImage[] = [];
  const productImages: SetupImage[] = [];

  // 3クエリを並行実行（ページ + 製品 + カラーコレクション）
  const colorCollectionHandle = `astromeda-${slug}`;
  const kws = colorData.colorKw;

  const [pageResult, prodResult, colorCollResult] = await Promise.allSettled([
    context.storefront.query(PAGE_BY_HANDLE_QUERY as unknown as Parameters<typeof context.storefront.query>[0], {
      variables: {handle: colorData.pageHandle},
    }),
    context.storefront.query(COLLECTION_PRODUCTS_QUERY as unknown as Parameters<typeof context.storefront.query>[0], {
      variables: {handle: 'astromeda'},
    }),
    context.storefront.query(COLOR_COLLECTION_QUERY as unknown as Parameters<typeof context.storefront.query>[0], {
      variables: {handle: colorCollectionHandle},
    }),
  ]);

  // ── 上段: 製品利用イメージ（Shopifyページから抽出） ──
  if (pageResult.status === 'fulfilled') {
    try {
      const pageData = pageResult.value;
      const bodyHtml: string = (pageData as unknown as {page?: {body?: string}})?.page?.body ?? '';
      // HTMLからShopify CDN画像URLを抽出
      const imgRegex = /https:\/\/cdn\.shopify\.com\/s\/files\/[^"'\s>]+\.(jpg|jpeg|png|webp)(\?[^"'\s>]*)?/gi;
      const matches = bodyHtml.match(imgRegex) ?? [];
      const seen = new Set<string>();
      for (const url of matches) {
        // width パラメータなしのベースURLでdedup
        const base = url.replace(/[?&](width|height|crop|v)=[^&]*/g, '').replace(/\?$/, '');
        if (!seen.has(base) && lifestyleImages.length < 20) {
          seen.add(base);
          lifestyleImages.push({
            url: base,
            alt: `${colorData.n} 利用イメージ`,
          });
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error('Lifestyle images error:', e);
    }
  }

  // ── フォールバック1: カラーコレクション画像を製品利用イメージに追加 ──
  if (colorCollResult.status === 'fulfilled') {
    try {
      const collData = colorCollResult.value as unknown as {
        collectionByHandle?: {
          image?: {url: string; altText?: string; width?: number; height?: number};
          products?: {nodes?: Array<{featuredImage?: {url: string; altText?: string; width?: number; height?: number}; images?: {nodes?: Array<{url: string; altText?: string; width?: number; height?: number}>}}>};
        };
      };
      const coll = collData?.collectionByHandle;
      const existingUrls = new Set(lifestyleImages.map(i => i.url));

      // コレクションバナー画像
      if (coll?.image?.url && !existingUrls.has(coll.image.url)) {
        lifestyleImages.push({url: coll.image.url, alt: `${colorData.n} コレクション`, width: coll.image.width, height: coll.image.height});
        existingUrls.add(coll.image.url);
      }
      // コレクション内の商品画像（最大6枚）
      const collProducts = coll?.products?.nodes ?? [];
      for (const p of collProducts) {
        if (lifestyleImages.length >= 12) break;
        const imgs = [p.featuredImage, ...(p.images?.nodes ?? [])].filter(Boolean);
        for (const img of imgs) {
          if (img?.url && !existingUrls.has(img.url) && lifestyleImages.length < 12) {
            existingUrls.add(img.url);
            lifestyleImages.push({url: img.url, alt: img.altText || `${colorData.n} 製品`, width: img.width, height: img.height});
          }
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error('Color collection images error:', e);
    }
  }

  // ── 製品利用イメージ = バナー/部屋セットアップ写真のみ ──
  // 製品切り抜き画像（白背景のPC単体）は絶対に入れない。
  // フォールバック: PC_COLORSのローカル部屋写真（トップCOLOR EDITIONSと同じ画像）
  if (lifestyleImages.length === 0 && colorData.img) {
    lifestyleImages.push({
      url: colorData.img,
      alt: `${colorData.n} セットアップイメージ`,
    });
  }

  // ── 下段: カラー別 製品画像 ──
  // 各商品の画像はカラーグループ順に並んでいる。
  // バリアントのfeatured_image位置を基準に、次バリアント画像までの範囲が
  // そのカラーの全画像。これで商品ページと同じ画像セットを取得できる。
  if (prodResult.status === 'fulfilled') {
    try {
      const prodData = prodResult.value;
      const products = (prodData as unknown as {collectionByHandle?: {products?: {nodes?: unknown[]}}})?.collectionByHandle?.products?.nodes ?? [];
      const seenUrls = new Set<string>();

      for (const p of products as Array<{title?: string; images?: {nodes?: Array<{url: string; altText?: string; width?: number; height?: number}>}; variants?: {nodes?: Array<{selectedOptions?: Array<{name: string; value: string}>; image?: {url: string; altText?: string; width?: number; height?: number}}>}}>) {
        if (productImages.length >= 40) break;
        const allImages = p.images?.nodes ?? [];
        const variants = p.variants?.nodes ?? [];
        if (allImages.length === 0 || variants.length === 0) continue;

        // 各バリアントのfeatured_image URLと、全画像リスト内での位置を特定
        type VarPos = {color: string; idx: number; isTarget: boolean};
        const variantPositions: VarPos[] = [];

        for (const v of variants) {
          const opts = v.selectedOptions ?? [];
          const colorOpt = opts.find((o: {name: string; value: string}) =>
            o.name === 'カラー' || o.name === 'Color' || o.name === 'color',
          );
          const colorName = colorOpt?.value ?? '';
          const varImgUrl = v.image?.url;
          if (!varImgUrl) continue;

          // バリアント画像が全画像リストの何番目かを探す
          const idx = allImages.findIndex((img: {url: string}) => img.url === varImgUrl);
          if (idx >= 0) {
            const isTarget = kws.some((kw: string) => colorName.includes(kw));
            variantPositions.push({color: colorName, idx, isTarget});
          }
        }

        // 位置でソート
        variantPositions.sort((a, b) => a.idx - b.idx);

        // ターゲットカラーの画像範囲を抽出
        // 最大6枚/バリアント: 境界の画像混入（隣のカラー）を防止
        const MAX_IMAGES_PER_VARIANT = 6;
        for (let i = 0; i < variantPositions.length; i++) {
          if (!variantPositions[i].isTarget) continue;

          const startIdx = variantPositions[i].idx;
          const nextVariantIdx =
            i + 1 < variantPositions.length
              ? variantPositions[i + 1].idx
              : allImages.length;
          const endIdx = Math.min(nextVariantIdx, startIdx + MAX_IMAGES_PER_VARIANT);

          // この範囲の画像をすべて追加
          for (let j = startIdx; j < endIdx && productImages.length < 40; j++) {
            const img = allImages[j];
            if (img?.url && !seenUrls.has(img.url)) {
              seenUrls.add(img.url);
              productImages.push({
                url: img.url,
                alt: img.altText || `${p.title} ${colorData.n}`,
                width: img.width,
                height: img.height,
              });
            }
          }
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error('Product images error:', e);
    }
  }

  return {
    colorData,
    lifestyleImages,
    productImages,
    allColors: PC_COLORS,
  };
}

/* ─── component ─── */
export default function SetupPage() {
  const {colorData, lifestyleImages, productImages, allColors} =
    useLoaderData<typeof loader>();
  const accent = colorData.h;

  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        fontFamily: "'Outfit', 'Noto Sans JP', system-ui, sans-serif",
        color: T.tx,
      }}
    >
      {/* Hero header with color-specific gradient */}
      <div
        style={{
          position: 'relative',
          padding: 'clamp(24px, 4vw, 48px) clamp(16px, 4vw, 48px)',
          background: `linear-gradient(160deg, ${al(accent, 0.18)} 0%, ${al(accent, 0.04)} 40%, ${T.bg} 70%)`,
          borderBottom: `1px solid ${al(accent, 0.15)}`,
          overflow: 'hidden',
        }}
      >
        {/* Decorative glow */}
        <div
          style={{
            position: 'absolute',
            top: -60,
            right: -60,
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: al(accent, 0.08),
            filter: 'blur(80px)',
            pointerEvents: 'none',
          }}
        />

        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: T.t4,
            fontSize: 'clamp(11px, 1.2vw, 13px)',
            textDecoration: 'none',
            marginBottom: 'clamp(16px, 2vw, 24px)',
          }}
        >
          ← ホームに戻る
        </Link>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'clamp(12px, 1.5vw, 18px)',
          }}
        >
          <span
            style={{
              width: 'clamp(24px, 3.5vw, 40px)',
              height: 'clamp(24px, 3.5vw, 40px)',
              borderRadius: '50%',
              background: accent,
              boxShadow: `0 0 24px ${al(accent, 0.5)}, 0 0 60px ${al(accent, 0.2)}`,
              flexShrink: 0,
              border: `2px solid ${al(accent, 0.6)}`,
            }}
          />
          <div>
            <h1
              className="ph"
              style={{
                fontSize: 'clamp(24px, 4vw, 44px)',
                fontWeight: 900,
                margin: 0,
                letterSpacing: '-0.02em',
                background: `linear-gradient(135deg, ${accent}, #fff)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {colorData.n}
            </h1>
            <p
              style={{
                fontSize: 'clamp(11px, 1.2vw, 14px)',
                color: T.t5,
                margin: '2px 0 0',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              Setup Gallery
            </p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div
        style={{
          padding: 'clamp(20px, 3vw, 40px) clamp(16px, 4vw, 48px)',
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        {/* ── 上段: 製品利用イメージ ── */}
        <section style={{marginBottom: 'clamp(32px, 4vw, 48px)'}}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              marginBottom: 'clamp(12px, 1.5vw, 18px)',
            }}
          >
            <h2
              className="ph"
              style={{
                fontSize: 'clamp(15px, 1.8vw, 20px)',
                fontWeight: 800,
                margin: 0,
                color: accent,
              }}
            >
              製品利用イメージ
            </h2>
            <span
              style={{
                fontSize: 'clamp(10px, 1.1vw, 12px)',
                color: T.t4,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Lifestyle
            </span>
          </div>

          {lifestyleImages.length > 0 ? (
            <SetupSlider
              images={lifestyleImages}
              colorName={colorData.n}
              accentColor={accent}
            />
          ) : (
            <div
              style={{
                aspectRatio: '16/9',
                borderRadius: 'clamp(8px, 1.2vw, 16px)',
                border: `1px dashed ${al(accent, 0.25)}`,
                background: `linear-gradient(160deg, ${al(accent, 0.06)}, ${T.bg} 70%)`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
              }}
            >
              <span
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: al(accent, 0.15),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                }}
              >
                🖼
              </span>
              <p
                style={{
                  color: T.t4,
                  fontSize: 'clamp(12px, 1.3vw, 15px)',
                  textAlign: 'center',
                  margin: 0,
                }}
              >
                {colorData.n}カラーの利用イメージは準備中です
              </p>
              <Link
                to={`/collections/astromeda-${colorData.slug}`}
                style={{
                  marginTop: 8,
                  display: 'inline-block',
                  padding: '10px 24px',
                  background: al(accent, 0.15),
                  color: accent,
                  fontSize: 'clamp(11px, 1.2vw, 13px)',
                  fontWeight: 700,
                  borderRadius: 8,
                  textDecoration: 'none',
                  border: `1px solid ${al(accent, 0.25)}`,
                }}
              >
                {colorData.n}カラーの商品を見る →
              </Link>
            </div>
          )}
        </section>

        {/* ── 下段: 製品画像 ── */}
        <section style={{marginBottom: 'clamp(32px, 4vw, 48px)'}}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              marginBottom: 'clamp(12px, 1.5vw, 18px)',
            }}
          >
            <h2
              className="ph"
              style={{
                fontSize: 'clamp(15px, 1.8vw, 20px)',
                fontWeight: 800,
                margin: 0,
              }}
            >
              製品画像
            </h2>
            <span
              style={{
                fontSize: 'clamp(10px, 1.1vw, 12px)',
                color: T.t4,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Products
            </span>
          </div>

          {productImages.length > 0 ? (
            <SetupSlider
              images={productImages}
              colorName={colorData.n}
              accentColor={accent}
            />
          ) : (
            <div
              style={{
                aspectRatio: '16/9',
                borderRadius: 'clamp(8px, 1.2vw, 16px)',
                border: `1px dashed ${T.t2}`,
                background: T.bgC,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
              }}
            >
              <p
                style={{
                  color: T.t4,
                  fontSize: 'clamp(12px, 1.3vw, 15px)',
                }}
              >
                製品画像は準備中です
              </p>
            </div>
          )}
        </section>

        {/* CTA */}
        <div style={{textAlign: 'center', marginBottom: 'clamp(32px, 4vw, 48px)'}}>
          <Link
            to={`/collections/${colorData.shop}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: 'clamp(12px, 1.5vw, 16px) clamp(24px, 3vw, 40px)',
              background: `linear-gradient(135deg, ${accent}, ${al(accent, 0.7)})`,
              color: colorData.d ? '#fff' : '#000',
              fontWeight: 700,
              fontSize: 'clamp(13px, 1.4vw, 16px)',
              borderRadius: 'clamp(6px, 0.8vw, 10px)',
              textDecoration: 'none',
              transition: 'transform .2s, box-shadow .2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = `0 8px 24px ${al(accent, 0.35)}`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {colorData.n}カラーのゲーミングPCを見る →
          </Link>
        </div>

        {/* Color switcher */}
        <section>
          <h2
            className="ph"
            style={{
              fontSize: 'clamp(14px, 1.6vw, 18px)',
              fontWeight: 800,
              marginBottom: 'clamp(12px, 1.5vw, 18px)',
            }}
          >
            他のカラーを見る
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fill, minmax(clamp(80px, 12vw, 140px), 1fr))',
              gap: 'clamp(8px, 1vw, 12px)',
            }}
          >
            {allColors.map((c) => {
              const isActive = c.slug === colorData.slug;
              return (
                <Link
                  key={c.slug}
                  to={`/setup/${c.slug}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: 'clamp(8px, 1vw, 12px)',
                    borderRadius: 'clamp(6px, 0.8vw, 10px)',
                    border: isActive
                      ? `2px solid ${c.h}`
                      : `1px solid ${T.t2}`,
                    background: isActive
                      ? al(c.h, 0.12)
                      : T.bgC,
                    textDecoration: 'none',
                    transition: 'border-color .2s, background .2s',
                  }}
                >
                  <span
                    style={{
                      width: 'clamp(14px, 1.8vw, 20px)',
                      height: 'clamp(14px, 1.8vw, 20px)',
                      borderRadius: '50%',
                      background: c.h,
                      flexShrink: 0,
                      boxShadow: isActive
                        ? `0 0 8px ${al(c.h, 0.5)}`
                        : 'none',
                    }}
                  />
                  <span
                    style={{
                      fontSize: 'clamp(10px, 1.2vw, 13px)',
                      fontWeight: 600,
                      color: isActive ? '#fff' : T.t5,
                    }}
                  >
                    {c.n}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─── GraphQL ─── */

// カラーコレクションの画像を取得（バナー + 商品画像）
const COLOR_COLLECTION_QUERY = `#graphql
  query ColorCollection($handle: String!) {
    collectionByHandle(handle: $handle) {
      image { url altText width height }
      products(first: 6) {
        nodes {
          featuredImage { url altText width height }
          images(first: 3) { nodes { url altText width height } }
        }
      }
    }
  }
` as const;

// Shopifyページのbody HTMLからライフスタイル画像を抽出
const PAGE_BY_HANDLE_QUERY = `#graphql
  query PageByHandle($handle: String!) {
    page: pageByHandle(handle: $handle) {
      id
      title
      body
    }
  }
` as const;

// コレクション内の製品（全画像+バリアント画像付き）からカラー別にフィルタ
// 各商品は最大15枚の画像、最大10個のバリアント情報を取得
const COLLECTION_PRODUCTS_QUERY = `#graphql
  query CollectionProducts($handle: String!) {
    collectionByHandle(handle: $handle) {
      products(first: 20) {
        nodes {
          title
          handle
          images(first: 15) {
            nodes {
              url
              altText
              width
              height
            }
          }
          variants(first: 10) {
            nodes {
              selectedOptions {
                name
                value
              }
              image {
                url
                altText
                width
                height
              }
            }
          }
        }
      }
    }
  }
` as const;

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
