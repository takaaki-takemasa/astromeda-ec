import React, {useMemo} from 'react';
import {Link} from 'react-router';
import {T, al, yen, PC_COLORS, PC_TIERS, PAGE_WIDTH} from '~/lib/astromeda-data';
import {optimizeImageUrl, generateSrcSet} from '~/lib/cache-headers';

export interface MetaColorModel {
  id: string;
  handle: string;
  name: string;
  slug: string;
  image?: string | null;
  colorCode: string;
  sortOrder: number;
  isActive: boolean;
}

interface PCShowcaseProps {
  colorImages: Record<string, string>; // カラー名 → 画像URL
  metaColors?: MetaColorModel[] | null;
}

// YIQ 輝度判定: R*299+G*587+B*114)/1000 > 128 なら明色
function isLightColor(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return false;
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

function PCShowcaseComponent({colorImages, metaColors}: PCShowcaseProps) {
  // Sprint 6 Gap 3: merge (not replace) — Metaobject 優先で fallback と重複しないものを追加表示
  const activeMetaColors = useMemo(() => {
    if (!metaColors || metaColors.length === 0) return [] as MetaColorModel[];
    return [...metaColors].filter((m) => m.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [metaColors]);

  const mergedFallbacks = useMemo(() => {
    if (activeMetaColors.length === 0) return PC_COLORS;
    const replacedSlugs = new Set(activeMetaColors.map((m) => m.slug.trim().toLowerCase()));
    return PC_COLORS.filter((pc) => !replacedSlugs.has(pc.slug.toLowerCase()));
  }, [activeMetaColors]);

  const titleCount = activeMetaColors.length + mergedFallbacks.length;

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
          全{titleCount}色カラー
        </span>
        <span style={{fontSize: 'clamp(10px, 1.2vw, 12px)', color: T.t4}}>
          COLOR EDITIONS
        </span>
      </div>

      <div className="pc-color-grid">
        {activeMetaColors.length > 0 &&
          activeMetaColors.map((c, i) => {
              const imgUrl = c.image || colorImages[c.name] || null;
              const isDark = !isLightColor(c.colorCode);
              return (
                <Link
                  key={c.id}
                  to={`/setup/${c.slug}`}
                  className="pc-color-card"
                  aria-label={`${c.name} Edition の詳細を見る`}
                  style={{
                    border: `1px solid ${al(c.colorCode, isDark ? 0.3 : 0.12)}`,
                    textDecoration: 'none',
                  }}
                >
                  <div
                    style={{
                      aspectRatio: '16/10',
                      position: 'relative',
                      overflow: 'hidden',
                      background: imgUrl
                        ? T.bg
                        : `linear-gradient(160deg, ${al(c.colorCode, 0.25)}, ${T.bg} 65%)`,
                    }}
                  >
                    {imgUrl ? (
                      <img
                        src={optimizeImageUrl(imgUrl, 600)}
                        srcSet={generateSrcSet(imgUrl, [300, 480, 600, 900, 1200])}
                        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                        alt={`${c.name} Edition`}
                        width={600}
                        height={375}
                        loading={i < 4 ? 'eager' : 'lazy'}
                        decoding="async"
                        {...(i < 2 ? {fetchPriority: 'high' as const} : {})}
                        style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block'}}
                      />
                    ) : (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: `radial-gradient(circle at 35% 40%, ${al(c.colorCode, 0.35)}, transparent 55%)`,
                        }}
                      />
                    )}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: imgUrl
                          ? 'linear-gradient(180deg, transparent 30%, rgba(0,0,0,.85))'
                          : 'linear-gradient(180deg, transparent 20%, rgba(0,0,0,.75))',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 'clamp(8px, 1.2vw, 14px)',
                        left: 'clamp(10px, 1.5vw, 16px)',
                        right: 'clamp(10px, 1.5vw, 16px)',
                        zIndex: 1,
                      }}
                    >
                      <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                        <span
                          style={{
                            width: 'clamp(10px, 1.2vw, 14px)',
                            height: 'clamp(10px, 1.2vw, 14px)',
                            borderRadius: '50%',
                            background: c.colorCode,
                            border: isLightColor(c.colorCode) ? `1px solid ${al(T.tx, 0.3)}` : 'none',
                            boxShadow: `0 0 20px ${c.colorCode}66`,
                            flexShrink: 0,
                            display: 'inline-block',
                          }}
                        />
                        <span
                          style={{
                            fontSize: 'clamp(11px, 1.4vw, 16px)',
                            fontWeight: 900,
                            color: T.tx,
                            textShadow: '0 2px 8px rgba(0,0,0,.8)',
                          }}
                        >
                          {c.name}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })
        }
        {mergedFallbacks.map((c, i) => {
          const imgUrl = colorImages[c.n] || c.img || null;
          return (
            <Link
              key={c.n}
              to={`/setup/${c.slug}`}
              className="pc-color-card"
              aria-label={`${c.n} Edition の詳細を見る`}
              style={{
                border: `1px solid ${al(c.h, c.d ? 0.3 : 0.12)}`,
                textDecoration: 'none',
              }}
            >
              {/* Image area */}
              <div
                style={{
                  aspectRatio: '16/10',
                  position: 'relative',
                  overflow: 'hidden',
                  background: imgUrl
                    ? T.bg
                    : `linear-gradient(160deg, ${al(c.h, 0.25)}, ${T.bg} 65%)`,
                }}
              >
                {imgUrl ? (
                  <img
                    src={optimizeImageUrl(imgUrl, 600)}
                    srcSet={generateSrcSet(imgUrl, [300, 480, 600, 900, 1200])}
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                    alt={`${c.n} Edition`}
                    width={600}
                    height={375}
                    loading={i < 4 ? 'eager' : 'lazy'}
                    decoding="async"
                    {...(i < 2 ? {fetchPriority: 'high' as const} : {})}
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
                      background: `radial-gradient(circle at 35% 40%, ${al(c.h, 0.35)}, transparent 55%)`,
                    }}
                  />
                )}
                {/* Bottom gradient overlay */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: imgUrl
                      ? 'linear-gradient(180deg, transparent 30%, rgba(0,0,0,.85))'
                      : 'linear-gradient(180deg, transparent 20%, rgba(0,0,0,.75))',
                  }}
                />
                {/* Text overlay */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 'clamp(8px, 1.2vw, 14px)',
                    left: 'clamp(10px, 1.5vw, 16px)',
                    right: 'clamp(10px, 1.5vw, 16px)',
                    zIndex: 1,
                  }}
                >
                  {/* Color dot + name */}
                  <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                    <span
                      style={{
                        width: 'clamp(10px, 1.2vw, 14px)',
                        height: 'clamp(10px, 1.2vw, 14px)',
                        borderRadius: '50%',
                        background: c.h,
                        border: c.d ? `1px solid ${al(T.tx, 0.3)}` : 'none',
                        boxShadow: `0 0 8px ${al(c.g, 0.4)}`,
                        flexShrink: 0,
                        display: 'inline-block',
                      }}
                    />
                    <span
                      style={{
                        fontSize: 'clamp(11px, 1.4vw, 16px)',
                        fontWeight: 900,
                        color: T.tx,
                        textShadow: '0 2px 8px rgba(0,0,0,.8)',
                      }}
                    >
                      {c.n}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          );
            })}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .pc-color-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: clamp(8px, 1.2vw, 14px);
        }
        @media (min-width: 768px) {
          .pc-color-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        @media (min-width: 1200px) {
          .pc-color-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }
        .pc-color-card {
          border-radius: clamp(10px, 1.4vw, 16px);
          overflow: hidden;
          transition: transform .2s, box-shadow .2s;
          display: block;
        }
        .pc-color-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 24px rgba(0,0,0,.4);
        }
      `}} />
    </section>
  );
}

export const PCShowcase = React.memo(PCShowcaseComponent);
PCShowcase.displayName = 'PCShowcase';

// Tier cards component — 9-4: Shopifyリアル価格対応（フォールバック: PC_TIERS静的値）
interface PCTierCardsProps {
  tierPrices?: Record<string, number>; // e.g. { GAMER: 199980, STREAMER: 405440 }
}

function PCTierCardsComponent({tierPrices = {}}: PCTierCardsProps) {
  return (
    <div className="pc-tier-grid">
      {PC_TIERS.map((t) => {
        const realPrice = tierPrices[t.tier] || t.price;
        return (
        <div
          key={t.tier}
          className="pc-tier-card"
          style={{
            background: T.bgC,
            borderRadius: 'clamp(14px, 1.6vw, 18px)',
            border: t.pop
              ? `2px solid ${al(T.c, 0.2)}`
              : `1px solid ${T.bd}`,
            padding: 'clamp(14px, 2vw, 22px)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {t.pop && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                background: T.c,
              }}
            />
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 'clamp(8px, 1.1vw, 10px)',
            }}
          >
            <span
              className="ph"
              style={{
                fontSize: 'clamp(11px, 1.3vw, 14px)',
                fontWeight: 900,
                color: t.pop ? T.c : T.t5,
              }}
            >
              {t.tier}
            </span>
            {t.pop && (
              <span
                style={{
                  fontSize: 7,
                  fontWeight: 900,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: al(T.c, 0.1),
                  color: T.c,
                }}
              >
                人気No.1
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 'clamp(9px, 1vw, 10px)',
              color: T.t4,
              marginBottom: 'clamp(8px, 1.1vw, 12px)',
            }}
          >
            {t.gpu} / {t.cpu} / {t.ram}
          </div>
          <div
            className="ph"
            style={{
              fontSize: 'clamp(18px, 2.5vw, 26px)',
              fontWeight: 900,
              color: T.c,
              marginBottom: 'clamp(8px, 1.1vw, 12px)',
            }}
          >
            {yen(realPrice)}
            <span style={{fontSize: 'clamp(9px, 1vw, 11px)', color: T.t4, fontWeight: 500}}>〜</span>
          </div>
          <Link
            to="/collections/astromeda"
            className="cta"
            aria-label={`${t.tier}ティアの詳細を見る`}
            style={{
              display: 'block',
              width: '100%',
              padding: 'clamp(10px, 1.3vw, 14px)',
              fontSize: 'clamp(10px, 1.2vw, 13px)',
              textDecoration: 'none',
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          >
            この構成で見る →
          </Link>
        </div>
        );
      })}

      <style dangerouslySetInnerHTML={{__html: `
        .pc-tier-grid {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          margin-bottom: 20px;
          padding-bottom: 4px;
        }
        .pc-tier-card {
          min-width: 180px;
          flex-shrink: 0;
        }
        @media (min-width: 768px) {
          .pc-tier-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
            margin-bottom: 28px;
            overflow-x: visible;
            padding-bottom: 0;
          }
          .pc-tier-card {
            min-width: unset;
          }
        }
        @media (min-width: 900px) {
          .pc-tier-grid {
            grid-template-columns: 1fr 1fr 1fr;
          }
        }
      `}} />
    </div>
  );
}

export const PCTierCards = React.memo(PCTierCardsComponent);
PCTierCards.displayName = 'PCTierCards';
