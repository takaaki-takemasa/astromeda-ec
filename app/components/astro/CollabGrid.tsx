import React, {useMemo} from 'react';
import {Link} from 'react-router';
import {T, al, COLLABS, PAGE_WIDTH} from '~/lib/astromeda-data';
import {optimizeImageUrl, generateSrcSet} from '~/lib/cache-headers';

interface ShopifyCollection {
  id: string;
  title: string;
  handle: string;
  image?: {
    id?: string;
    url: string;
    altText?: string;
    width?: number;
    height?: number;
  } | null;
  products?: {
    nodes: Array<{id: string}>;
  };
}

export interface MetaCollab {
  id: string;
  handle: string;
  name: string;
  shopHandle: string;
  image?: string | null;
  tagline?: string | null;
  label?: string | null;
  sortOrder: number;
  featured: boolean;
  // patch 0152 (2026-04-24): リンク先自由化。空のときは shopHandle から /collections/<handle> を組む既存動作。
  // 記事 (/blog/...) や外部 URL も指定可能。
  linkUrl?: string | null;
}

interface CollabGridProps {
  collections?: ShopifyCollection[] | null;
  metaCollabs?: MetaCollab[] | null;
}

// Build a map of handle -> collection image from Shopify data
function buildImageMap(collections: ShopifyCollection[] | null | undefined): Map<string, ShopifyCollection> {
  const map = new Map<string, ShopifyCollection>();
  if (!collections) return map;
  for (const col of collections) {
    if (col.handle) {
      map.set(col.handle, col);
    }
  }
  return map;
}

function findShopifyCollection(
  shopHandle: string,
  imageMap: Map<string, ShopifyCollection>,
): ShopifyCollection | undefined {
  return imageMap.get(shopHandle);
}

function CollabGridComponent({collections, metaCollabs}: CollabGridProps) {
  const imageMap = useMemo(() => buildImageMap(collections), [collections]);

  // patch 0008: exclusive-or — Metaobject が存在する場合は CMS を優先し、
  // ハードコード fallback は一切表示しない（二重表示バグ防止）。
  // 理由: Metaobject handle='ip-onepiece' vs COLLABS.id='onepiece' の形式差で
  // 以前の replacedIds フィルタが効かず 26 → 47 の二重表示を発生させていた。
  // CMS が 1 件でもあれば CMS 全件を使い、fallback は空にする。
  const activeMetaCollabs = useMemo(() => {
    if (!metaCollabs || metaCollabs.length === 0) return [] as MetaCollab[];
    return [...metaCollabs].filter((m) => m.featured).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [metaCollabs]);

  const mergedFallbacks = useMemo(() => {
    if (activeMetaCollabs.length === 0) return COLLABS;
    return [] as typeof COLLABS;
  }, [activeMetaCollabs]);

  const renderMetaCard = useMemo(
    () => (m: MetaCollab, index: number) => {
      const shopifyCol = findShopifyCollection(m.shopHandle, imageMap);
      const imgUrl = m.image || shopifyCol?.image?.url || null;
      const hasImage = !!imgUrl;
      const accent = T.c;

      // patch 0152 (2026-04-24): リンク先優先順位 = linkUrl (記事/外部含む) > /collections/<shopHandle>
      const targetUrl = (m.linkUrl && m.linkUrl.trim().length > 0)
        ? m.linkUrl.trim()
        : `/collections/${m.shopHandle}`;
      return (
        <Link
          key={m.id}
          to={targetUrl}
          className="collab-card"
          aria-label={`${m.name} を見る`}
          style={{
            border: `1px solid ${al(accent, 0.12)}`,
            textDecoration: 'none',
          }}
        >
          <div
            style={{
              aspectRatio: '1/1',
              position: 'relative',
              overflow: 'hidden',
              background: hasImage
                ? T.bg
                : `linear-gradient(160deg, ${al(accent, 0.25)}, ${T.bg} 65%)`,
            }}
          >
            {hasImage ? (
              <img
                src={optimizeImageUrl(imgUrl ?? '', 300, 65)}
                srcSet={generateSrcSet(imgUrl ?? '', [200, 300, 480, 600], 65)}
                alt={m.name}
                width={300}
                height={300}
                loading={index < 6 ? 'eager' : 'lazy'}
                fetchPriority={index < 3 ? 'high' : 'auto'}
                decoding={index < 6 ? 'sync' : 'async'}
                sizes="(min-width: 1024px) 20vw, (min-width: 768px) 33vw, 50vw"
                style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block'}}
              />
            ) : (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `radial-gradient(circle at 35% 40%, ${al(accent, 0.3)}, transparent 55%)`,
                }}
              />
            )}
            <div
              className="collab-gradient-overlay"
              style={{
                position: 'absolute',
                inset: 0,
                background: hasImage
                  ? 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,.85))'
                  : 'linear-gradient(180deg, transparent 30%, rgba(0,0,0,.75))',
              }}
            />
            <div
              className="collab-text-overlay"
              style={{position: 'absolute', bottom: 10, left: 12, right: 12, zIndex: 1}}
            >
              {m.label && (
                <div
                  style={{
                    display: 'inline-block',
                    fontSize: 7,
                    fontWeight: 900,
                    padding: '2px 7px',
                    borderRadius: 4,
                    background: m.label === 'NEW' ? T.r : m.label === 'HOT' ? '#FF6B00' : '#FF9500',
                    color: T.tx,
                    letterSpacing: 1,
                    marginBottom: 4,
                  }}
                >
                  {m.label}
                </div>
              )}
              <div
                style={{
                  fontSize: 'clamp(10px, 1.4vw, 16px)',
                  fontWeight: 900,
                  color: T.tx,
                  textShadow: '0 2px 12px rgba(0,0,0,.8)',
                  lineHeight: 1.25,
                }}
              >
                {m.name}
              </div>
              {m.tagline && (
                <div
                  className="collab-category-count"
                  style={{fontSize: 10, color: al(T.tx, 0.5), marginTop: 3}}
                >
                  {m.tagline}
                </div>
              )}
            </div>
          </div>
        </Link>
      );
    },
    [imageMap],
  );

  const renderCard = useMemo(
    () => (cb: (typeof COLLABS)[0], index: number) => {
    const shopifyCol = findShopifyCollection(cb.shop, imageMap);
    const hasImage = shopifyCol?.image?.url;

    return (
      <Link
        key={cb.id}
        to={`/collections/${shopifyCol?.handle ?? cb.shop}`}
        className="collab-card"
        aria-label={`${cb.name} コレクションを見る`}
        style={{
          border: `1px solid ${al(cb.accent, 0.12)}`,
          textDecoration: 'none',
        }}
      >
        {/* Image area */}
        <div
          style={{
            aspectRatio: '1/1',
            position: 'relative',
            overflow: 'hidden',
            background: hasImage
              ? T.bg
              : `linear-gradient(160deg, ${al(cb.accent, 0.25)}, ${T.bg} 65%)`,
          }}
        >
          {hasImage ? (
            <img
              src={optimizeImageUrl(shopifyCol?.image?.url ?? '', 300, 65)}
              srcSet={generateSrcSet(shopifyCol?.image?.url ?? '', [200, 300, 480, 600], 65)}
              alt={shopifyCol?.image?.altText || cb.name}
              width={300}
              height={300}
              loading={index < 6 ? 'eager' : 'lazy'}
              fetchPriority={index < 3 ? 'high' : 'auto'}
              decoding={index < 6 ? 'sync' : 'async'}
              sizes="(min-width: 1024px) 20vw, (min-width: 768px) 33vw, 50vw"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          ) : (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `radial-gradient(circle at 35% 40%, ${al(cb.accent, 0.3)}, transparent 55%)`,
              }}
            />
          )}
          {/* Bottom gradient overlay — hidden on mobile via CSS */}
          <div
            className="collab-gradient-overlay"
            style={{
              position: 'absolute',
              inset: 0,
              background: hasImage
                ? 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,.85))'
                : 'linear-gradient(180deg, transparent 30%, rgba(0,0,0,.75))',
            }}
          />
          {/* Text overlay — hidden on mobile via CSS */}
          <div
            className="collab-text-overlay"
            style={{
              position: 'absolute',
              bottom: 10,
              left: 12,
              right: 12,
              zIndex: 1,
            }}
          >
            {cb.tag && (
              <div
                style={{
                  display: 'inline-block',
                  fontSize: 7,
                  fontWeight: 900,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: cb.tag === 'NEW' ? T.r : cb.tag === 'HOT' ? '#FF6B00' : '#FF9500',
                  color: T.tx,
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                {cb.tag}
              </div>
            )}
            <div
              style={{
                fontSize: 'clamp(10px, 1.4vw, 16px)',
                fontWeight: 900,
                color: T.tx,
                textShadow: '0 2px 12px rgba(0,0,0,.8)',
                lineHeight: 1.25,
              }}
            >
              {cb.name}
            </div>
            <div
              className="collab-category-count"
              style={{
                fontSize: 10,
                color: al(T.tx, 0.5),
                marginTop: 3,
              }}
            >
              {cb.cats.split(',').length}カテゴリ
            </div>
          </div>
        </div>
      </Link>
    );
    },
    [imageMap],
  );

  return (
    <section style={{...PAGE_WIDTH, paddingBottom: 'clamp(20px, 2.8vw, 32px)'}}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          marginBottom: 'clamp(16px, 1.8vw, 20px)',
        }}
      >
        <span
          className="ph"
          style={{fontSize: 'clamp(14px, 1.6vw, 18px)', fontWeight: 900, color: T.tx}}
        >
          IP COLLABS
        </span>
        <span style={{fontSize: 'clamp(10px, 1.2vw, 12px)', color: T.t4}}>
          {(activeMetaCollabs.length + mergedFallbacks.length)}タイトル
        </span>
      </div>

      <div className="collab-grid">
        {activeMetaCollabs.map((m, i) => renderMetaCard(m, i))}
        {mergedFallbacks.map((cb, i) => renderCard(cb, activeMetaCollabs.length + i))}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .collab-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: clamp(10px, 1.3vw, 14px);
        }
        .collab-card {
          border-radius: clamp(10px, 1.4vw, 14px);
          overflow: hidden;
          background: ${T.bgC};
          transition: transform .25s ease, border-color .25s ease, box-shadow .25s ease;
          display: block;
          content-visibility: auto;
          contain-intrinsic-size: auto 300px;
        }
        .collab-card:hover {
          transform: translateY(-3px);
          border-color: rgba(0, 240, 255, .2) !important;
          box-shadow: 0 8px 24px rgba(0, 0, 0, .4);
        }
        @media (min-width: 768px) {
          .collab-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        .collab-category-count {
          display: none;
        }
        @media (min-width: 768px) {
          .collab-category-count {
            display: block;
          }
        }
      `}} />
    </section>
  );
}

export const CollabGrid = React.memo(CollabGridComponent);
CollabGrid.displayName = 'CollabGrid';
