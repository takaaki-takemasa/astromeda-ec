import {useState, useEffect, useCallback, useRef} from 'react';
import {Link} from 'react-router';
import {T, al} from '~/lib/astromeda-data';
// patch 0184 Phase 2 (2026-04-27): vendor が gpc_* セクションを HTML/CSS 上書きできるよう wrap
import {SectionOverride} from './SectionOverride';

// ─── Types ───
interface RankingProduct {
  title: string;
  handle: string;
  price: string;
  image: string;
}

interface NewsItem {
  date: string;
  title: string;
  url: string;
}

// patch 0038: Metaobject 化用カード型。img は任意（無ければ画像なしで表示）
interface MetaCard {
  label: string;
  href: string;
  img?: string;
}

// patch 0039: Gaming Hero スライド型
interface GamingHeroSlide {
  alt_text: string;
  image_url: string;
  link_url: string;
}

// patch 0039: Gaming お問い合わせ情報型
interface GamingContactInfo {
  phone_number: string;
  phone_hours: string;
  line_url: string;
  line_label: string;
  line_hours: string;
}

interface GamingPCLandingProps {
  rankingProducts: RankingProduct[];
  newsItems: NewsItem[];
  // patch 0038: Metaobject 化セクション。空配列ならコード内 FALLBACK_* を使う（exclusive-OR merge）
  featureCards?: MetaCard[];
  cpuCards?: MetaCard[];
  gpuCards?: MetaCard[];
  priceRanges?: Array<{label: string; href: string}>;
  // patch 0039: Hero スライド/お問い合わせも Metaobject 化
  gamingHeroSlides?: GamingHeroSlide[];
  contactInfo?: GamingContactInfo;
}

// ─── Constants: Shopify CDN images (production store) ───
const CDN = 'https://shop.mining-base.co.jp/cdn/shop/files';

// patch 0039: フォールバックスライド（Metaobject astromeda_gaming_hero_slide が空のとき使用）
const FALLBACK_HERO_SLIDES = [
  {img: `${CDN}/2_830b8419-feed-446c-a267-a36b036f4a96.png`, href: 'https://lin.ee/vRLfEe0', alt: 'LINE相談バナー'},
  {img: `${CDN}/3_6ada8b33-56a9-4cc1-8843-0612112a8fa4.png`, href: '/collections/ranking', alt: 'ランキングバナー'},
  {img: `${CDN}/3_68c626f6-61b4-475e-a347-7771055c20ca.png`, href: '/pages/color', alt: 'カラーバナー'},
];

// patch 0039: フォールバックお問い合わせ情報
const FALLBACK_CONTACT_INFO: GamingContactInfo = {
  phone_number: '03-6903-5371',
  phone_hours: '営業時間：午前9時〜午後6時',
  line_url: 'https://lin.ee/v43hEUKX',
  line_label: '公式LINEを友達追加',
  line_hours: '営業時間：午前9時〜午後6時',
};

// patch 0038: フォールバック値（Metaobject が空のときに表示される。Metaobject に1件でも入れば
// Metaobject 側が完全に勝つ exclusive-OR merge）
const FALLBACK_FEATURE_CARDS: MetaCard[] = [
  {img: `${CDN}/19_54898356-8df0-49d1-b081-bc3e2862038a.png`, href: '/collections/ranking', label: '売上ランキング'},
  {img: `${CDN}/2_8fc598a4-fc71-45af-bb40-e9a419a84b6d.png`, href: '/collections/pc-collaboration', label: 'キャラクターコラボPC'},
  {img: `${CDN}/20_bd7bd8ac-7dd3-4cdb-a9fa-cff11559abac.png`, href: '/pages/color', label: '色から選ぶ'},
  {img: `${CDN}/21_c1da0635-9bf1-4e5e-bdd1-f583f37ff201.png`, href: '/collections/price', label: '価格から選ぶ'},
];

const FALLBACK_CPU_CARDS: MetaCard[] = [
  {img: `${CDN}/amd-logo.png`, href: '/collections/amd-ryzen', label: 'AMD Ryzen搭載'},
  {img: `${CDN}/intel-logo.png`, href: '/collections/intel-core', label: 'Intel Core搭載'},
];

const FALLBACK_GPU_CARDS: MetaCard[] = [
  {img: `${CDN}/nvidia-logo.png`, href: '/collections/nvidia-geforce', label: 'NVIDIA GeForce搭載'},
  {img: `${CDN}/radeon-logo.png`, href: '/collections/amd-radeon', label: 'AMD Radeon搭載'},
];

const FALLBACK_PRICE_RANGES = [
  {label: '～200,000円', href: '/collections/astromeda?price=0-200000'},
  {label: '200,001～250,000円', href: '/collections/astromeda?price=200001-250000'},
  {label: '250,001～300,000円', href: '/collections/astromeda?price=250001-300000'},
  {label: '300,001円～', href: '/collections/astromeda?price=300001'},
];

// ─── Section padding helper ───
const sectionPad = 'clamp(32px, 5vw, 64px) clamp(16px, 4vw, 48px)';
const maxW = 1200;
const accent = '#00e5ff';
// カード共通: 薄い白背景+明るいボーダーで視認性確保
const cardBg = 'rgba(255,255,255,0.07)';
const cardBorder = 'rgba(255,255,255,0.18)';

// ─── Hero Slider (トップページと同じstacked opacity方式) ───
// patch 0039: slides を props で受け取る (Metaobject 化対応)
function HeroSlider({slides}: {slides: Array<{img: string; href: string; alt: string}>}) {
  const [current, setCurrent] = useState(0);
  const total = slides.length;
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goTo = useCallback((i: number) => {
    setCurrent(((i % total) + total) % total);
  }, [total]);

  // Auto-play
  useEffect(() => {
    if (autoRef.current) clearInterval(autoRef.current);
    autoRef.current = setInterval(() => {
      setCurrent(p => (p + 1) % total);
    }, 5000);
    return () => { if (autoRef.current) clearInterval(autoRef.current); };
  }, [total]);

  const resetAuto = useCallback(() => {
    if (autoRef.current) clearInterval(autoRef.current);
    autoRef.current = setInterval(() => {
      setCurrent(p => (p + 1) % total);
    }, 5000);
  }, [total]);

  // Touch
  const touchX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goTo(current + 1); else goTo(current - 1);
      resetAuto();
    }
  };

  return (
    <div className="gpc-hero-wrap">
      {/* Slide container — stacked with opacity transition */}
      <div
        className="gpc-hero-container"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {slides.map((s, i) => {
          const isActive = i === current;
          return (
            <Link
              key={i}
              to={s.href}
              aria-label={s.alt}
              style={{
                display: 'block',
                position: 'absolute',
                inset: 0,
                opacity: isActive ? 1 : 0,
                transition: 'opacity 0.6s ease',
                pointerEvents: isActive ? 'auto' : 'none',
              }}
            >
              <img
                src={s.img.startsWith('http') ? `${s.img}?width=1400&format=webp` : s.img}
                alt={s.alt}
                loading={i === 0 ? 'eager' : 'lazy'}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  objectPosition: 'center center',
                  display: 'block',
                }}
              />
            </Link>
          );
        })}

        {/* Arrows */}
        <button
          className="gpc-hero-arrow gpc-hero-arrow-left"
          onClick={() => { goTo(current - 1); resetAuto(); }}
          aria-label="前のスライド"
        >
          ‹
        </button>
        <button
          className="gpc-hero-arrow gpc-hero-arrow-right"
          onClick={() => { goTo(current + 1); resetAuto(); }}
          aria-label="次のスライド"
        >
          ›
        </button>

        {/* Dot indicators (::after方式 — トップページと同じ) */}
        <div className="gpc-hero-dots">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { goTo(i); resetAuto(); }}
              className={`gpc-hero-dot ${i === current ? 'gpc-hero-dot-active' : ''}`}
              aria-label={`スライド ${i + 1}`}
            />
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .gpc-hero-wrap {
          padding: 12px 12px 0;
          max-width: ${maxW}px;
          margin: 0 auto;
        }
        @media (min-width: 768px) {
          .gpc-hero-wrap {
            padding: clamp(16px, 2vw, 24px) clamp(16px, 4vw, 48px) 0;
          }
        }
        .gpc-hero-container {
          position: relative;
          width: 100%;
          height: min(42vw, 220px);
          overflow: hidden;
          border-radius: 12px;
          border: 1px solid ${T.t2};
          background: ${T.bg};
        }
        @media (min-width: 768px) {
          .gpc-hero-container {
            height: min(42vw, 420px);
            border-radius: clamp(14px, 1.8vw, 20px);
          }
        }
        .gpc-hero-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          z-index: 5;
          width: clamp(36px, 4vw, 48px);
          height: clamp(36px, 4vw, 48px);
          border-radius: 50%;
          border: 1px solid ${al(accent, 0.3)};
          background: ${al(T.bg, 0.6)};
          backdrop-filter: blur(8px);
          color: ${T.tx};
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: clamp(16px, 2vw, 22px);
          transition: background .2s;
          padding: 0;
        }
        .gpc-hero-arrow:hover {
          background: ${al(T.bg, 0.85)};
        }
        .gpc-hero-arrow-left { left: 12px; }
        .gpc-hero-arrow-right { right: 12px; }
        .gpc-hero-dots {
          position: absolute;
          bottom: 8px;
          right: 14px;
          display: flex;
          gap: 6px;
          z-index: 2;
        }
        @media (min-width: 768px) {
          .gpc-hero-dots {
            bottom: 12px;
            right: 20px;
            gap: 8px;
          }
        }
        .gpc-hero-dot {
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
        }
        .gpc-hero-dot::after {
          content: '';
          display: block;
          width: 10px;
          height: 10px;
          border-radius: 5px;
          background: ${al(T.tx, 0.4)};
          transition: all .3s;
        }
        .gpc-hero-dot-active::after {
          width: 22px;
          background: ${accent};
        }
      `}} />
    </div>
  );
}

// ─── Section Title ───
function SectionTitle({ja, en}: {ja: string; en: string}) {
  return (
    <div style={{textAlign: 'center', marginBottom: 'clamp(20px, 3vw, 32px)'}}>
      <div style={{fontSize: 'clamp(18px, 3vw, 28px)', fontWeight: 900, color: T.tx, letterSpacing: 1}}>{ja}</div>
      <div style={{fontSize: 'clamp(9px, 1vw, 11px)', fontWeight: 800, color: al(accent, 0.5), letterSpacing: 4, marginTop: 4}}>{en}</div>
    </div>
  );
}

// ─── Main Component ───
export function GamingPCLanding({
  rankingProducts,
  newsItems,
  // patch 0038: Metaobject 化された4セクション。空配列ならフォールバックを使う。
  featureCards,
  cpuCards,
  gpuCards,
  priceRanges,
  // patch 0039: Metaobject 化された Hero スライドとお問い合わせ
  gamingHeroSlides,
  contactInfo,
}: GamingPCLandingProps) {
  const [isSP, setIsSP] = useState(false);
  useEffect(() => {
    const check = () => setIsSP(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const displayRanking = isSP ? rankingProducts.slice(0, 6) : rankingProducts;

  // patch 0038: exclusive-OR merge — Metaobject に 1 件でも入れば Metaobject が完全勝者
  const FEATURE_CARDS = (featureCards && featureCards.length > 0) ? featureCards : FALLBACK_FEATURE_CARDS;
  const CPU_CARDS = (cpuCards && cpuCards.length > 0) ? cpuCards : FALLBACK_CPU_CARDS;
  const GPU_CARDS = (gpuCards && gpuCards.length > 0) ? gpuCards : FALLBACK_GPU_CARDS;
  const PRICE_RANGES = (priceRanges && priceRanges.length > 0) ? priceRanges : FALLBACK_PRICE_RANGES;

  // patch 0039: exclusive-OR merge - Gaming Hero スライド
  const HERO_SLIDES = (gamingHeroSlides && gamingHeroSlides.length > 0)
    ? gamingHeroSlides.map(s => ({img: s.image_url, href: s.link_url, alt: s.alt_text}))
    : FALLBACK_HERO_SLIDES;
  // patch 0039: exclusive-OR merge - Gaming お問い合わせ情報
  const CONTACT = contactInfo ?? FALLBACK_CONTACT_INFO;

  return (
    <div>
      {/* patch 0185 (2026-04-27): セクション並び替え対応の flex container。
          各 SectionOverride が display_order > 0 の時 CSS order を付与し、
          flex の order spec に従って source 順を超えて並び替えできる。
          source 順 = order:0 (default) なので並び替え未指定セクションは元位置のまま。 */}
      <div style={{display: 'flex', flexDirection: 'column'}}>
      {/* ── Hero Slider ── */}
      <SectionOverride sectionKey="gpc_hero">
      <section>
        <HeroSlider slides={HERO_SLIDES} />
      </section>
      </SectionOverride>

      {/* ── 特集 FEATURE ── */}
      <SectionOverride sectionKey="gpc_feature_cards">
      <section style={{padding: sectionPad, maxWidth: maxW, margin: '0 auto'}}>
        <SectionTitle ja="特集" en="FEATURE" />
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))',
          gap: 'clamp(10px, 1.5vw, 16px)',
        }}>
          {FEATURE_CARDS.map((c, i) => (
            <Link
              key={i}
              to={c.href}
              style={{
                display: 'block', borderRadius: 'clamp(8px, 1vw, 12px)', overflow: 'hidden',
                border: `1px solid ${cardBorder}`, background: cardBg,
                transition: 'transform .2s, border-color .2s', textDecoration: 'none',
              }}
            >
              {c.img ? (
                <img
                  src={c.img.startsWith('http') ? `${c.img}?width=600&format=webp` : c.img}
                  alt={c.label}
                  loading="lazy"
                  style={{width: '100%', height: 'auto', display: 'block'}}
                />
              ) : (
                <div style={{
                  width: '100%', aspectRatio: '4/3',
                  background: `linear-gradient(135deg, ${al(accent, 0.25)}, ${al(T.bg, 0.6)})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: al(accent, 0.8), fontSize: 14, fontWeight: 700,
                }}>画像未設定</div>
              )}
              <div style={{
                padding: '10px 14px', background: 'rgba(255,255,255,0.05)',
                fontSize: 'clamp(11px, 1.3vw, 14px)', fontWeight: 700, color: T.tx, textAlign: 'center',
              }}>
                {c.label}
              </div>
            </Link>
          ))}
        </div>
      </section>
      </SectionOverride>

      {/* ── 人気ランキング RANKING ── */}
      <SectionOverride sectionKey="gpc_ranking">
      {rankingProducts.length > 0 && (
        <section style={{padding: sectionPad, maxWidth: maxW, margin: '0 auto'}}>
          <SectionTitle ja="人気ランキング" en="RANKING" />
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))',
            gap: 'clamp(10px, 1.5vw, 16px)',
          }}>
            {displayRanking.map((p, i) => (
              <Link
                key={p.handle}
                to={`/products/${p.handle}`}
                style={{
                  display: 'block', borderRadius: 'clamp(8px, 1vw, 12px)', overflow: 'hidden',
                  border: `1px solid ${cardBorder}`, background: cardBg,
                  transition: 'transform .2s, border-color .2s', textDecoration: 'none',
                  position: 'relative',
                }}
              >
                {/* Ranking badge for top 3 */}
                {i < 3 && (
                  <div style={{
                    position: 'absolute', top: 8, left: 8, zIndex: 2,
                    width: 'clamp(28px, 3vw, 36px)', height: 'clamp(28px, 3vw, 36px)',
                    borderRadius: '50%',
                    background: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : '#CD7F32',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 'clamp(12px, 1.5vw, 16px)', fontWeight: 900, color: '#000',
                    boxShadow: '0 2px 8px rgba(0,0,0,.3)',
                  }}>
                    {i + 1}
                  </div>
                )}
                <div style={{aspectRatio: '1/1', overflow: 'hidden', background: T.bg}}>
                  <img
                    src={p.image}
                    alt={p.title}
                    loading="lazy"
                    style={{width: '100%', height: '100%', objectFit: 'contain', display: 'block'}}
                  />
                </div>
                <div style={{padding: '10px 12px'}}>
                  <div style={{
                    fontSize: 'clamp(10px, 1.1vw, 12px)', color: T.t5, lineHeight: 1.4,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                  }}>
                    {p.title}
                  </div>
                  <div style={{
                    fontSize: 'clamp(13px, 1.5vw, 16px)', fontWeight: 800, color: accent, marginTop: 6,
                  }}>
                    ¥{Number(p.price).toLocaleString()}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      </SectionOverride>

      {/* ── パーツで選ぶ SEARCH ── */}
      <SectionOverride sectionKey="gpc_parts_cards">
      <section style={{padding: sectionPad, maxWidth: maxW, margin: '0 auto'}}>
        <SectionTitle ja="パーツで選ぶ" en="SEARCH" />
        {/* CPU */}
        <div style={{marginBottom: 'clamp(16px, 2vw, 24px)'}}>
          <div style={{fontSize: 'clamp(12px, 1.3vw, 14px)', fontWeight: 700, color: T.t5, marginBottom: 10}}>CPUから選択する</div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'clamp(10px, 1.5vw, 16px)'}}>
            {CPU_CARDS.map((c, i) => (
              <Link
                key={i}
                to={c.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: 'clamp(12px, 1.5vw, 20px)', borderRadius: 12,
                  border: `1px solid ${cardBorder}`, background: cardBg,
                  textDecoration: 'none', transition: 'border-color .2s',
                }}
              >
                {c.img ? (
                  <img
                    src={c.img.startsWith('http') ? `${c.img}?width=120&format=webp` : c.img}
                    alt={c.label}
                    loading="lazy"
                    style={{width: 'clamp(40px, 5vw, 60px)', height: 'auto'}}
                  />
                ) : (
                  <div style={{
                    width: 'clamp(40px, 5vw, 60px)', aspectRatio: '1/1', borderRadius: 8,
                    background: al(accent, 0.12), color: al(accent, 0.8),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, flexShrink: 0,
                  }}>CPU</div>
                )}
                <span style={{fontSize: 'clamp(12px, 1.3vw, 15px)', fontWeight: 700, color: T.tx}}>{c.label}</span>
              </Link>
            ))}
          </div>
        </div>
        {/* GPU */}
        <div>
          <div style={{fontSize: 'clamp(12px, 1.3vw, 14px)', fontWeight: 700, color: T.t5, marginBottom: 10}}>GPUから選択する</div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'clamp(10px, 1.5vw, 16px)'}}>
            {GPU_CARDS.map((c, i) => (
              <Link
                key={i}
                to={c.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: 'clamp(12px, 1.5vw, 20px)', borderRadius: 12,
                  border: `1px solid ${cardBorder}`, background: cardBg,
                  textDecoration: 'none', transition: 'border-color .2s',
                }}
              >
                {c.img ? (
                  <img
                    src={c.img.startsWith('http') ? `${c.img}?width=120&format=webp` : c.img}
                    alt={c.label}
                    loading="lazy"
                    style={{width: 'clamp(40px, 5vw, 60px)', height: 'auto'}}
                  />
                ) : (
                  <div style={{
                    width: 'clamp(40px, 5vw, 60px)', aspectRatio: '1/1', borderRadius: 8,
                    background: al(accent, 0.12), color: al(accent, 0.8),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, flexShrink: 0,
                  }}>GPU</div>
                )}
                <span style={{fontSize: 'clamp(12px, 1.3vw, 15px)', fontWeight: 700, color: T.tx}}>{c.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      </SectionOverride>

      {/* ── 値段で選ぶ PRICE RANGE ── */}
      <SectionOverride sectionKey="gpc_price_ranges">
      <section style={{padding: sectionPad, maxWidth: maxW, margin: '0 auto'}}>
        <SectionTitle ja="値段で選ぶ" en="PRICE RANGE" />
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))', gap: 'clamp(10px, 1.5vw, 16px)'}}>
          {PRICE_RANGES.map((pr, i) => (
            <Link
              key={i}
              to={pr.href}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 'clamp(16px, 2vw, 24px)', borderRadius: 12,
                border: `1px solid ${cardBorder}`, background: cardBg,
                fontSize: 'clamp(13px, 1.5vw, 16px)', fontWeight: 700, color: T.tx,
                textDecoration: 'none', transition: 'background .2s, border-color .2s',
                textAlign: 'center',
              }}
            >
              {pr.label}
            </Link>
          ))}
        </div>
      </section>
      </SectionOverride>

      {/* ── お問い合わせ CONTACT ── patch 0039: Metaobject 化 */}
      <SectionOverride sectionKey="gpc_contact">
      <section style={{padding: sectionPad, maxWidth: maxW, margin: '0 auto'}}>
        <SectionTitle ja="お問い合わせ" en="CONTACT" />
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 'clamp(10px, 1.5vw, 16px)'}}>
          {/* 電話 */}
          <a
            href={`tel:${CONTACT.phone_number}`}
            style={{
              display: 'block', padding: 'clamp(20px, 2.5vw, 32px)', borderRadius: 12,
              border: `1px solid ${cardBorder}`, background: cardBg,
              textDecoration: 'none', textAlign: 'center',
            }}
          >
            <div style={{fontSize: 'clamp(12px, 1.3vw, 14px)', fontWeight: 700, color: T.t5, marginBottom: 8}}>電話でのご相談</div>
            <div style={{fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 900, color: accent, marginBottom: 6}}>{CONTACT.phone_number}</div>
            <div style={{fontSize: 'clamp(10px, 1.1vw, 12px)', color: T.t4}}>{CONTACT.phone_hours}</div>
          </a>
          {/* LINE */}
          <a
            href={CONTACT.line_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', padding: 'clamp(20px, 2.5vw, 32px)', borderRadius: 12,
              border: `1px solid ${al('#06C755', 0.35)}`, background: 'rgba(6,199,85,0.1)',
              textDecoration: 'none', textAlign: 'center',
            }}
          >
            <div style={{fontSize: 'clamp(12px, 1.3vw, 14px)', fontWeight: 700, color: T.t5, marginBottom: 8}}>LINEでのご相談</div>
            <div style={{fontSize: 'clamp(16px, 2vw, 20px)', fontWeight: 800, color: '#06C755', marginBottom: 6}}>{CONTACT.line_label}</div>
            <div style={{fontSize: 'clamp(10px, 1.1vw, 12px)', color: T.t4}}>{CONTACT.line_hours}</div>
          </a>
        </div>
      </section>
      </SectionOverride>

      {/* ── お知らせ INFORMATION ── */}
      {/* patch 0186 (2026-04-27): SectionOverride wrap 外なので flex order=0 で最上部に来てしまう問題を
          ハードコード order:95 で末尾に固定 (旧サイト踏襲設計に準拠) */}
      {newsItems.length > 0 && (
        <section style={{padding: sectionPad, maxWidth: maxW, margin: '0 auto', order: 95}}>
          <SectionTitle ja="お知らせ" en="INFORMATION" />
          <div style={{borderTop: `1px solid ${cardBorder}`}}>
            {newsItems.map((news, i) => (
              <Link
                key={i}
                to={news.url}
                style={{
                  display: 'flex', gap: 'clamp(10px, 2vw, 20px)', alignItems: 'baseline',
                  padding: 'clamp(12px, 1.5vw, 16px) 0',
                  borderBottom: `1px solid ${cardBorder}`,
                  textDecoration: 'none', transition: 'background .2s',
                }}
              >
                <span style={{fontSize: 'clamp(10px, 1.1vw, 12px)', color: T.t4, flexShrink: 0, whiteSpace: 'nowrap'}}>{news.date}</span>
                <span style={{fontSize: 'clamp(12px, 1.3vw, 14px)', color: T.t5}}>{news.title}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* patch 0184 Phase 2: vendor が「セクション追加」で挿入できる予備スロット x3
          custom_html mode で SectionOverride に内容を入れない限り何も描画しない */}
      <SectionOverride sectionKey="gpc_extra_1">{null}</SectionOverride>
      <SectionOverride sectionKey="gpc_extra_2">{null}</SectionOverride>
      <SectionOverride sectionKey="gpc_extra_3">{null}</SectionOverride>
      </div>{/* /flex container — patch 0185 セクション並び替え用 */}

      {/* Divider before product grid */}
      <div style={{
        maxWidth: maxW, margin: '0 auto',
        padding: '0 clamp(16px, 4vw, 48px)',
        borderBottom: `1px solid ${al(accent, 0.15)}`,
      }} />
    </div>
  );
}
