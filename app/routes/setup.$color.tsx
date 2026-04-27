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

// patch 0180 (2026-04-27): CEO 指示「Shopify から随時取得をやめろ・ファイル保存
// データベースから繋ぎ込め」への対応。setup-manifest.json (git 永続) のみから読む。
// Shopify Storefront 3 クエリは完全廃止。
import setupManifest from '~/lib/setup-manifest.json';

/* ─── loader ─── */
export async function loader({params}: Route.LoaderArgs) {
  const {color: slug} = params;
  const colorData = findColor(slug ?? '');

  if (!colorData) {
    throw new Response('カラーが見つかりません', {status: 404});
  }

  // patch 0180: setup-manifest.json から直接読む。Shopify API 呼ばない。
  // manifest にエントリ無しでもエラーにせず graceful degradation
  const manifestEntry = (setupManifest.colors as Record<string, {lifestyle: string; products: string[]}>)[slug ?? ''] || null;

  const lifestyleImages: SetupImage[] = [];
  const productImages: SetupImage[] = [];

  if (manifestEntry) {
    if (manifestEntry.lifestyle) {
      lifestyleImages.push({
        url: manifestEntry.lifestyle,
        alt: `${colorData.n} 利用イメージ`,
      });
    }
    for (const url of manifestEntry.products) {
      productImages.push({
        url,
        alt: `${colorData.n} 製品画像`,
      });
    }
  } else if (colorData.img) {
    // 最終フォールバック: PC_COLORS 静的画像
    lifestyleImages.push({
      url: colorData.img,
      alt: `${colorData.n} セットアップイメージ`,
    });
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

/* ─── GraphQL queries (deleted patch 0180) ────────────────────────────────────
 * 旧コード:
 *   - COLOR_COLLECTION_QUERY (collectionByHandle 経由でカラー collection 画像取得)
 *   - PAGE_BY_HANDLE_QUERY   (Shopify ページ body から画像 URL regex 抽出)
 *   - COLLECTION_PRODUCTS_QUERY (collection 全商品 + variant 画像取得)
 * すべて削除。CEO 指示「Shopify から随時取得をやめろ」への構造的対応。
 * 新しい画像入手経路: app/lib/setup-manifest.json (git 永続)
 * 新しい画像配信経路: /images/pc-setup/{slug}.jpg (public/ 配下) +
 *                    .github/workflows/sync-setup-images.yml で download した /assets/setup/{color}/*.jpg
 * ─────────────────────────────────────────────────────────────────────────── */

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
