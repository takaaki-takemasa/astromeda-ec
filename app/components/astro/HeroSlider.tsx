import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {Link} from 'react-router';
import {T, al, FEATURED} from '~/lib/astromeda-data';
import {optimizeImageUrl, generateSrcSet} from '~/lib/cache-headers';

interface ShopifyCollection {
  id: string;
  title: string;
  handle: string;
  image?: {
    url: string;
    altText?: string;
    width?: number;
    height?: number;
  } | null;
}

export interface MetaBanner {
  id: string;
  handle: string;
  title: string;
  subtitle?: string | null;
  image?: string | null;
  linkUrl?: string | null;
  ctaLabel?: string | null;
  sortOrder: number;
  isActive: boolean;
  startAt?: string | null;
  endAt?: string | null;
}

interface HeroSliderProps {
  collections?: ShopifyCollection[] | null;
  metaBanners?: MetaBanner[] | null;
}

function HeroSliderComponent({collections, metaBanners}: HeroSliderProps) {
  // SSR/Client共に初期値0で確定 — Hydration安定
  const [hi, setHi] = useState(0);
  // マウント完了フラグ — アニメーションをclient-onlyにしてSSR/Client差異を防止
  const [mounted, setMounted] = useState(false);

  // Sprint 6 Gap 3: merge (not replace)
  // Metaobject handle が fallback FEATURED.id と重複 → Metaobject 優先、未重複 → fallback 残す
  const activeMetaBanners = useMemo(() => {
    if (!metaBanners || metaBanners.length === 0) return [] as MetaBanner[];
    const now = Date.now();
    const filtered = metaBanners.filter((m) => {
      if (!m.isActive) return false;
      if (m.startAt) {
        const t = new Date(m.startAt).getTime();
        if (!Number.isNaN(t) && t > now) return false;
      }
      if (m.endAt) {
        const t = new Date(m.endAt).getTime();
        if (!Number.isNaN(t) && t < now) return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [metaBanners]);

  const mergedFallbacks = useMemo(() => {
    if (activeMetaBanners.length === 0) return FEATURED;
    const replacedIds = new Set(activeMetaBanners.map((m) => m.handle.trim().toLowerCase()));
    return FEATURED.filter((f) => !replacedIds.has(f.id.toLowerCase()));
  }, [activeMetaBanners]);

  const slidesCount = activeMetaBanners.length + mergedFallbacks.length;

  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => {
      setHi((p) => (p + 1) % slidesCount);
    }, 4500);
    return () => clearInterval(t);
  }, [slidesCount]);

  // Build handle → collection image URL map from Shopify collections
  const imageMap = useMemo(() => {
    const map = new Map<string, string>();
    if (collections) {
      for (const col of collections) {
        if (col.handle && col.image?.url) {
          map.set(col.handle, col.image.url);
        }
      }
    }
    return map;
  }, [collections]);

  return (
    <div className="hero-slider-wrap">
      {/* Slide container with rounded corners */}
      <div className="hero-slider-container">
        {activeMetaBanners.length > 0 &&
          activeMetaBanners.map((m, i) => {
              const collectionImgUrl = imageMap.get(m.handle) ?? null;
              const imgUrl = m.image || collectionImgUrl;
              const isActive = i === hi;
              const accent = T.c;
              const href = m.linkUrl || `/collections/${m.handle}`;
              return (
                <Link
                  key={m.id}
                  to={href}
                  aria-label={`${m.title} の詳細を見る`}
                  style={{
                    textDecoration: 'none',
                    display: 'block',
                    position: 'absolute',
                    inset: 0,
                    opacity: isActive ? 1 : 0,
                    transition: 'opacity .6s ease',
                    pointerEvents: isActive ? 'auto' : 'none',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      position: 'relative',
                      background: `linear-gradient(160deg, ${al(accent, 0.18)}, ${T.bg} 65%)`,
                    }}
                  >
                    {imgUrl && (
                      <img
                        src={optimizeImageUrl(imgUrl, 1400)}
                        srcSet={generateSrcSet(imgUrl, [640, 960, 1400, 1920])}
                        sizes="100vw"
                        alt={m.title}
                        width={1400}
                        height={788}
                        loading={i < 2 ? 'eager' : 'lazy'}
                        {...(i === 0 ? {fetchPriority: 'high' as const} : {})}
                        decoding={i === 0 ? 'sync' : 'async'}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          objectPosition: 'center center',
                          display: 'block',
                        }}
                      />
                    )}
                    {!imgUrl && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: `radial-gradient(circle at 35% 40%, ${al(accent, 0.35)}, transparent 55%)`,
                        }}
                      />
                    )}

                    <div
                      className="hero-gradient-overlay"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: imgUrl
                          ? `linear-gradient(0deg, ${al(T.bg, 0.85)} 0%, ${al(T.bg, 0.3)} 40%, transparent 70%)`
                          : `linear-gradient(0deg, ${al(T.bg, 0.65)} 0%, ${al(T.bg, 0.1)} 45%, transparent 100%)`,
                      }}
                    />

                    <div
                      className="hero-text-overlay"
                      style={{
                        position: 'absolute',
                        bottom: 'clamp(16px, 2.5vw, 32px)',
                        left: 'clamp(16px, 3vw, 36px)',
                        right: 'clamp(16px, 3vw, 36px)',
                        zIndex: 1,
                        overflow: 'hidden',
                      }}
                    >
                      {m.ctaLabel && (
                        <span
                          style={{
                            fontSize: 'clamp(8px, 1vw, 10px)',
                            fontWeight: 900,
                            color: T.tx,
                            padding: 'clamp(3px, 0.5vw, 5px) clamp(10px, 1.3vw, 14px)',
                            borderRadius: 4,
                            background: `linear-gradient(135deg, ${accent}, ${al(accent, 0.6)})`,
                            letterSpacing: 1,
                            display: 'inline-block',
                            marginBottom: 'clamp(6px, 0.9vw, 10px)',
                          }}
                        >
                          {m.ctaLabel}
                        </span>
                      )}
                      <div
                        style={{
                          fontSize: 'clamp(14px, 2.5vw, 28px)',
                          fontWeight: 900,
                          color: T.tx,
                          textShadow: '0 2px 12px rgba(0,0,0,.9)',
                          lineHeight: 1.2,
                        }}
                      >
                        {m.title}
                      </div>
                      {m.subtitle && (
                        <div
                          style={{
                            marginTop: 'clamp(6px, 0.9vw, 10px)',
                            fontSize: 'clamp(10px, 1.2vw, 12px)',
                            color: al(T.tx, 0.55),
                            lineHeight: 1.4,
                            maxWidth: '50%',
                          }}
                        >
                          {m.subtitle.length > 50 ? m.subtitle.slice(0, 50) + '…' : m.subtitle}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })
        }
        {mergedFallbacks.map((feat, idx) => {
          const i = activeMetaBanners.length + idx;
          const bannerUrl = feat.banner ?? null;
          const collectionImgUrl = imageMap.get(feat.shop) ?? null;
          const imgUrl = bannerUrl || collectionImgUrl;
          const isActive = i === hi;
          return (
            <Link
              key={feat.id}
              to={`/collections/${feat.shop}`}
              aria-label={`${feat.name} の詳細を見る`}
              style={{
                textDecoration: 'none',
                display: 'block',
                position: 'absolute',
                inset: 0,
                opacity: isActive ? 1 : 0,
                transition: 'opacity .6s ease',
                pointerEvents: isActive ? 'auto' : 'none',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  position: 'relative',
                  background: `linear-gradient(160deg, ${al(feat.accent, 0.18)}, ${T.bg} 65%)`,
                }}
              >
                {imgUrl && (
                  <img
                    src={optimizeImageUrl(imgUrl, 1400)}
                    srcSet={generateSrcSet(imgUrl, [640, 960, 1400, 1920])}
                    sizes="100vw"
                    alt={feat.name}
                    width={1400}
                    height={788}
                    loading={i < 2 ? 'eager' : 'lazy'}
                    // fetchPriorityはHTMLattr — React 18.3+でサポート
                    {...(i === 0 ? {fetchPriority: 'high' as const} : {})}
                    decoding={i === 0 ? 'sync' : 'async'}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      objectPosition: 'center center',
                      display: 'block',
                    }}
                  />
                )}
                {!imgUrl && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: `radial-gradient(circle at 35% 40%, ${al(feat.accent, 0.35)}, transparent 55%)`,
                    }}
                  />
                )}

                {/* Bottom gradient overlay */}
                <div
                  className="hero-gradient-overlay"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: imgUrl
                      ? `linear-gradient(0deg, ${al(T.bg, 0.85)} 0%, ${al(T.bg, 0.3)} 40%, transparent 70%)`
                      : `linear-gradient(0deg, ${al(T.bg, 0.65)} 0%, ${al(T.bg, 0.1)} 45%, transparent 100%)`,
                  }}
                />

                {/* Text overlay — PC only, hidden on mobile via CSS */}
                <div
                  className="hero-text-overlay"
                  style={{
                    position: 'absolute',
                    bottom: 'clamp(16px, 2.5vw, 32px)',
                    left: 'clamp(16px, 3vw, 36px)',
                    right: 'clamp(16px, 3vw, 36px)',
                    zIndex: 1,
                    overflow: 'hidden',
                  }}
                >
                  <span
                    style={{
                      fontSize: 'clamp(8px, 1vw, 10px)',
                      fontWeight: 900,
                      color: T.tx,
                      padding: 'clamp(3px, 0.5vw, 5px) clamp(10px, 1.3vw, 14px)',
                      borderRadius: 4,
                      background: `linear-gradient(135deg, ${feat.accent}, ${al(feat.accent, 0.6)})`,
                      letterSpacing: 1,
                      display: 'inline-block',
                      marginBottom: 'clamp(6px, 0.9vw, 10px)',
                    }}
                  >
                    {feat.tag || 'COLLAB'}
                  </span>
                  <div
                    style={{
                      fontSize: 'clamp(14px, 2.5vw, 28px)',
                      fontWeight: 900,
                      color: T.tx,
                      textShadow: '0 2px 12px rgba(0,0,0,.9)',
                      lineHeight: 1.2,
                    }}
                  >
                    {feat.name}
                  </div>
                  <div
                    style={{
                      marginTop: 'clamp(6px, 0.9vw, 10px)',
                      fontSize: 'clamp(10px, 1.2vw, 12px)',
                      color: al(T.tx, 0.55),
                      lineHeight: 1.4,
                      maxWidth: '50%',
                    }}
                  >
                    {feat.desc.length > 50
                      ? feat.desc.slice(0, 50) + '…'
                      : feat.desc}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}

        {/* Dot indicators */}
        <div className="hero-dots">
          {Array.from({length: slidesCount}).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setHi(i)}
              className={`hero-dot ${i === hi ? 'hero-dot-active' : ''}`}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .hero-slider-wrap {
          padding: 12px 12px 0;
        }
        @media (min-width: 768px) {
          .hero-slider-wrap {
            padding: clamp(16px, 2vw, 24px) clamp(16px, 4vw, 48px) 0;
          }
        }
        .hero-slider-container {
          position: relative;
          width: 100%;
          height: min(56.25vw, 240px);
          overflow: hidden;
          border-radius: 12px;
          border: 1px solid ${T.t2};
        }
        @media (min-width: 768px) {
          .hero-slider-container {
            height: min(56.25vw, 500px);
            border-radius: clamp(14px, 1.8vw, 20px);
          }
        }
        .hero-dots {
          position: absolute;
          bottom: 4px;
          right: 10px;
          display: flex;
          gap: 4px;
          z-index: 2;
        }
        @media (min-width: 768px) {
          .hero-dots {
            bottom: 10px;
            right: 20px;
            gap: 6px;
          }
        }
        /* タッチターゲット44px対応: padding+content-boxで視覚サイズは小さく、タッチ領域は大きく */
        .hero-dot {
          width: 44px;
          height: 44px;
          border-radius: 0;
          border: none;
          background: transparent;
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all .3s;
        }
        .hero-dot::after {
          content: '';
          display: block;
          width: 10px;
          height: 10px;
          border-radius: 5px;
          background: ${al(T.tx, 0.4)};
          transition: all .3s;
        }
        .hero-dot-active::after {
          width: 22px;
          background: ${T.tx};
        }
      `}} />
    </div>
  );
}

export const HeroSlider = React.memo(HeroSliderComponent);
HeroSlider.displayName = 'HeroSlider';
