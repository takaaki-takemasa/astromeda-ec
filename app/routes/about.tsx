import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/about';
import {T, al, PAGE_WIDTH, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

export const meta: Route.MetaFunction = () => {
  const url = `${STORE_URL}/about`;
  const title = 'ASTROMEDAとは？ | 日本発IPコラボゲーミングPCブランド';
  return [
    {title},
    {
      name: 'description',
      content:
        'ASTROMEDA（アストロメダ）は株式会社マイニングベースが運営する日本発のゲーミングPCブランド。国内自社工場で全台組立、25タイトル以上のアニメ・ゲームIPコラボ、全8色カラー展開。',
    },
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:title', content: title},
    {property: 'og:url', content: url},
    {property: 'og:type', content: 'website'},
    {name: 'twitter:card', content: 'summary'},
  ];
};

/* ─── GraphQL: 3分割でクエリ複雑度制限を回避 ─── */
const HERO_QUERY = `#graphql
  query AboutHero {
    heroPc: productByHandle(handle: "gamer-corei714700f-rtx5060ti-8gb") {
      title
      featuredImage { url altText width height }
      images(first: 6) { nodes { url altText width height } }
      variants(first: 10) { nodes { title image { url altText width height } } }
    }
  }
` as const;

const COLLABS_QUERY = `#graphql
  query AboutCollabs {
    onePiece: collectionByHandle(handle: "one-piece-bountyrush-collaboration") {
      title image { url altText width height }
    }
    bleach: collectionByHandle(handle: "bleach-rebirth-of-souls-collaboration") {
      title image { url altText width height }
    }
    jujutsu: collectionByHandle(handle: "jujutsukaisen-collaboration") {
      title image { url altText width height }
    }
    naruto: collectionByHandle(handle: "naruto-shippuden") {
      title image { url altText width height }
    }
    sf6: collectionByHandle(handle: "streetfighter-collaboration") {
      title image { url altText width height }
    }
    chainsaw: collectionByHandle(handle: "chainsawman-movie-reze") {
      title image { url altText width height }
    }
    sanrio: collectionByHandle(handle: "sanrio-characters-collaboration") {
      title image { url altText width height }
    }
    bocchi: collectionByHandle(handle: "bocchi-rocks-collaboration") {
      title image { url altText width height }
    }
    heroaca: collectionByHandle(handle: "heroaca-collaboration") {
      title image { url altText width height }
    }
    sonic: collectionByHandle(handle: "sega-sonic-astromeda-collaboration") {
      title image { url altText width height }
    }
    hololive: collectionByHandle(handle: "hololive-english-collaboration") {
      title image { url altText width height }
    }
    geass: collectionByHandle(handle: "geass-collaboration") {
      title image { url altText width height }
    }
  }
` as const;

const COLORS_QUERY = `#graphql
  query AboutColors {
    white: collectionByHandle(handle: "astromeda-white") {
      title image { url altText width height }
      products(first: 2) { nodes { title featuredImage { url altText width height } images(first: 3) { nodes { url altText width height } } } }
    }
    black: collectionByHandle(handle: "astromeda-black") {
      title image { url altText width height }
      products(first: 1) { nodes { featuredImage { url altText width height } } }
    }
    pink: collectionByHandle(handle: "astromeda-pink") {
      title image { url altText width height }
      products(first: 1) { nodes { featuredImage { url altText width height } } }
    }
    purple: collectionByHandle(handle: "astromeda-purple") {
      title image { url altText width height }
      products(first: 1) { nodes { featuredImage { url altText width height } } }
    }
    lightblue: collectionByHandle(handle: "astromeda-lightblue") {
      title image { url altText width height }
      products(first: 2) { nodes { featuredImage { url altText width height } images(first: 4) { nodes { url altText width height } } } }
    }
    red: collectionByHandle(handle: "astromeda-red") {
      title image { url altText width height }
      products(first: 1) { nodes { featuredImage { url altText width height } } }
    }
    green: collectionByHandle(handle: "astromeda-green") {
      title image { url altText width height }
      products(first: 1) { nodes { featuredImage { url altText width height } } }
    }
    orange: collectionByHandle(handle: "astromeda-orange") {
      title image { url altText width height }
      products(first: 1) { nodes { featuredImage { url altText width height } } }
    }
  }
` as const;

export async function loader(args: Route.LoaderArgs) {
  const {storefront} = args.context;

  const [heroRes, collabRes, colorRes] = await Promise.allSettled([
    storefront.query(HERO_QUERY),
    storefront.query(COLLABS_QUERY),
    storefront.query(COLORS_QUERY),
  ]);

  /* IMPORTANT: storefront.query() returns data directly, NOT {data: ...} */
  const heroData = heroRes.status === 'fulfilled' ? (heroRes.value as any) : null;
  const collabData = collabRes.status === 'fulfilled' ? (collabRes.value as any) : null;
  const colorData = colorRes.status === 'fulfilled' ? (colorRes.value as any) : null;

  /* ── Hero PC画像: ライトブルーバリアント優先 ── */
  const heroNode = heroData?.heroPc;
  const heroVariants = heroNode?.variants?.nodes ?? [];
  const blueVar = heroVariants.find(
    (v: {title?: string; image?: {url?: string}}) => v.title === 'ライトブルー',
  );
  const pcFeatured = blueVar?.image?.url || heroNode?.featuredImage?.url || '';
  const pcImages = heroNode?.images?.nodes?.map((n: {url: string}) => n.url) ?? [];

  /* ── IPコラボ画像（IPセクション専用） ── */
  const collabKeys = ['onePiece', 'bleach', 'jujutsu', 'naruto', 'sf6', 'chainsaw', 'sanrio', 'bocchi', 'heroaca', 'sonic', 'hololive', 'geass'];
  const collabNames = ['ONE PIECE', 'BLEACH', '呪術廻戦', 'NARUTO', 'ストリートファイター6', 'チェンソーマン', 'サンリオ', 'ぼっち・ざ・ろっく！', 'ヒロアカ', 'ソニック', 'hololive', 'コードギアス'];
  const collabs = collabKeys
    .map((key, i) => ({name: collabNames[i], url: collabData?.[key]?.image?.url || ''}))
    .filter(c => c.url) as {name: string; url: string}[];

  /* ── カラーPC画像（カラーセクション専用） ── */
  const getColorImg = (col: any) => {
    const colImg = col?.image?.url;
    const prodImg = col?.products?.nodes?.[0]?.featuredImage?.url;
    const prodImgs = col?.products?.nodes?.[0]?.images?.nodes?.map((n: {url: string}) => n.url) ?? [];
    return colImg || prodImg || prodImgs[0] || '';
  };

  const lbProds = colorData?.lightblue?.products?.nodes ?? [];
  const lbImages: string[] = [];
  for (const p of lbProds) {
    if (p.featuredImage?.url) lbImages.push(p.featuredImage.url);
    for (const img of p.images?.nodes ?? []) {
      if (img.url && !lbImages.includes(img.url)) lbImages.push(img.url);
    }
  }

  const colorKeys = ['white', 'black', 'pink', 'purple', 'lightblue', 'red', 'green', 'orange'];
  const colorNames2 = ['ホワイト', 'ブラック', 'ピンク', 'パープル', 'ライトブルー', 'レッド', 'グリーン', 'オレンジ'];
  const colorHexes = ['#F0EEF0', '#1C1C24', '#FF6B9D', '#9B59B6', '#3498DB', '#E74C3C', '#2ECC71', '#F39C12'];

  const colorPCs = colorKeys.map((key, i) => ({
    name: colorNames2[i],
    slug: key,
    color: colorHexes[i],
    url: key === 'lightblue' ? (lbImages[0] || getColorImg(colorData?.lightblue)) : getColorImg(colorData?.[key]),
  })).filter(c => c.url);

  return {pcFeatured, pcImages, lbImages, collabs, colorPCs};
}

/* ─── CSS Animations ─── */
const ANIMATIONS_CSS = `
@keyframes aboutFadeUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
@keyframes aboutGlow { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
@keyframes aboutFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
@keyframes aboutMarquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
@keyframes aboutPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(0,240,255,0.3); } 50% { box-shadow: 0 0 30px 10px rgba(0,240,255,0.08); } }
@keyframes aboutScaleIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
.about-fade { animation: aboutFadeUp 0.8s ease-out both; }
.about-fade-d1 { animation-delay: 0.1s; }
.about-fade-d2 { animation-delay: 0.2s; }
.about-fade-d3 { animation-delay: 0.3s; }
.about-fade-d4 { animation-delay: 0.4s; }
.about-float { animation: aboutFloat 4s ease-in-out infinite; }
.about-glow { animation: aboutGlow 3s ease-in-out infinite; }
.about-pulse { animation: aboutPulse 3s ease-in-out infinite; }
.about-scale { animation: aboutScaleIn 0.6s ease-out both; }
.about-marquee { display: flex; animation: aboutMarquee 30s linear infinite; }
.about-marquee:hover { animation-play-state: paused; }
.about-color-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
.about-color-card:hover { transform: translateY(-6px) scale(1.02); box-shadow: 0 12px 40px rgba(0,0,0,0.4); }
.about-collab-item { transition: transform 0.3s ease; }
.about-collab-item:hover { transform: scale(1.08); }
.about-cta-btn { transition: transform 0.2s ease, box-shadow 0.2s ease; }
.about-cta-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(0,240,255,0.25); }
`;

function shopImg(url: string, w: number) {
  if (!url) return '';
  return url.includes('?') ? `${url}&width=${w}` : `${url}?width=${w}`;
}

export default function AboutAstromeda() {
  const {pcFeatured, pcImages, lbImages, collabs, colorPCs} = useLoaderData<typeof loader>();

  /* ── Hero画像: PC商品のみ（コラボ画像は使わない） ── */
  const heroPC = pcFeatured || pcImages[0] || lbImages[0] || '';
  const showcasePC = lbImages[1] || lbImages[0] || pcImages[1] || '';

  return (
    <div style={{background: T.bg, minHeight: '100vh', fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif", color: T.tx, overflow: 'hidden'}}>
      <style dangerouslySetInnerHTML={{__html: ANIMATIONS_CSS}} />

      {/* ═══ HERO ═══ */}
      <section style={{position: 'relative', minHeight: heroPC ? '80vh' : '60vh', display: 'flex', alignItems: 'center', overflow: 'hidden'}}>
        <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #050810 0%, #0a1025 25%, #0d1832 50%, #080c18 100%)'}} />
        <div className="about-glow" style={{position: 'absolute', top: '10%', right: '5%', width: '40vw', height: '40vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,240,255,0.12) 0%, transparent 70%)', filter: 'blur(60px)', pointerEvents: 'none'}} />
        <div className="about-glow" style={{position: 'absolute', bottom: '0', left: '10%', width: '30vw', height: '30vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)', filter: 'blur(80px)', pointerEvents: 'none', animationDelay: '1.5s'}} />

        <div style={{...PAGE_WIDTH, position: 'relative', zIndex: 1, padding: 'clamp(80px,10vw,140px) clamp(16px,3vw,40px)', display: 'flex', alignItems: 'center', gap: 'clamp(20px,4vw,60px)', flexWrap: 'wrap' as const}}>
          <div className="about-fade" style={{flex: '1 1 360px', minWidth: 280}}>
            <div style={{fontSize: 'clamp(11px,1.3vw,14px)', fontWeight: 800, color: T.c, letterSpacing: 6, marginBottom: 16}}>ABOUT ASTROMEDA</div>
            <h1 style={{fontSize: 'clamp(32px,6vw,72px)', fontWeight: 900, color: '#fff', lineHeight: 1.05, margin: '0 0 24px 0', letterSpacing: '-0.02em'}}>
              未来を創る<br />ツルハシに
            </h1>
            <p className="about-fade about-fade-d1" style={{fontSize: 'clamp(14px,1.5vw,18px)', color: 'rgba(255,255,255,0.75)', lineHeight: 2, margin: '0 0 32px 0', maxWidth: 560}}>
              新市場の創造と消費に必要不可欠なハードウェアをユーザーに届け、「未来を創るツルハシ」を社会へ届け続ける。
            </p>
            <Link to="/collections" className="about-cta-btn about-fade about-fade-d2 cta" style={{display: 'inline-block', padding: '16px 40px', fontSize: 15, fontWeight: 900, borderRadius: 14, textDecoration: 'none', letterSpacing: 1}}>
              コレクションを見る →
            </Link>
          </div>
          {heroPC && (
            <div className="about-float about-fade about-fade-d2" style={{flex: '0 0 auto', width: 'clamp(200px,30vw,420px)'}}>
              <img src={shopImg(heroPC, 840)} alt="Astromeda Gaming PC" loading="eager" style={{width: '100%', height: 'auto', filter: 'drop-shadow(0 0 60px rgba(0,240,255,0.2)) drop-shadow(0 20px 40px rgba(0,0,0,0.5))'}} />
            </div>
          )}
        </div>
      </section>

      {/* ═══ IPコラボ 自動スクロールバナー（コラボ画像はここだけ！） ═══ */}
      {collabs.length > 3 && (
        <section style={{padding: 'clamp(32px,4vw,56px) 0', background: 'linear-gradient(180deg, rgba(255,107,157,0.04) 0%, transparent 100%)', borderTop: '1px solid rgba(255,107,157,0.08)', borderBottom: '1px solid rgba(255,107,157,0.08)'}}>
          <div style={{...PAGE_WIDTH, padding: '0 clamp(16px,3vw,40px)', marginBottom: 'clamp(16px,2vw,24px)'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <div>
                <div style={{fontSize: 'clamp(10px,1.1vw,12px)', fontWeight: 700, color: '#FF6B9D', letterSpacing: 3, marginBottom: 4}}>IP COLLABORATION</div>
                <h2 style={{fontSize: 'clamp(20px,3vw,36px)', fontWeight: 900, color: '#fff', margin: 0}}>25タイトル以上の公式IPコラボ</h2>
              </div>
              <Link to="/collections" style={{fontSize: 13, fontWeight: 700, color: '#FF6B9D', textDecoration: 'none', whiteSpace: 'nowrap' as const}}>すべて見る →</Link>
            </div>
          </div>
          <div style={{overflow: 'hidden', width: '100%'}}>
            <div className="about-marquee" style={{gap: 12, width: 'max-content'}}>
              {[...collabs, ...collabs].map((c, i) => (
                <Link key={i} to="/collections" className="about-collab-item" style={{flexShrink: 0, width: 'clamp(160px,18vw,240px)', borderRadius: 14, overflow: 'hidden', display: 'block', textDecoration: 'none', border: '1px solid rgba(255,107,157,0.12)', background: 'rgba(255,107,157,0.03)'}}>
                  <img src={shopImg(c.url, 480)} alt={c.name} loading="lazy" style={{width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block'}} />
                  <div style={{padding: '10px 14px', textAlign: 'center' as const}}>
                    <div style={{fontSize: 12, fontWeight: 800, color: '#fff'}}>{c.name}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ 全8色カラー展開（カラーコレクション画像のみ使用） ═══ */}
      {colorPCs.length > 0 && (
        <section style={{...PAGE_WIDTH, padding: 'clamp(56px,7vw,100px) clamp(16px,3vw,40px)'}}>
          <div className="about-fade" style={{textAlign: 'center' as const, marginBottom: 'clamp(24px,4vw,48px)'}}>
            <div style={{fontSize: 'clamp(10px,1.1vw,12px)', fontWeight: 700, color: T.c, letterSpacing: 3, marginBottom: 8}}>8 COLORS</div>
            <h2 style={{fontSize: 'clamp(24px,4vw,44px)', fontWeight: 900, color: '#fff', margin: '0 0 12px 0'}}>インテリアとして楽しめるPCを</h2>
            <p style={{fontSize: 'clamp(13px,1.3vw,16px)', color: 'rgba(255,255,255,0.6)', maxWidth: 600, margin: '0 auto'}}>
              従来の黒い箱ではなく、部屋を彩るインテリアとして。全8色のカラーバリエーション。
            </p>
          </div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(clamp(140px,15vw,200px), 1fr))', gap: 'clamp(10px,1.5vw,16px)'}}>
            {colorPCs.map((pc, i) => (
              <Link key={i} to={`/setup/${pc.slug}`} className={`about-color-card about-fade about-fade-d${Math.min(i + 1, 4)}`} style={{borderRadius: 16, overflow: 'hidden', textDecoration: 'none', display: 'block', border: `1px solid ${al(pc.color, 0.25)}`, background: al(pc.color, 0.04)}}>
                <img src={shopImg(pc.url, 400)} alt={`Astromeda ${pc.name}`} loading="lazy" style={{width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block'}} />
                <div style={{padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10}}>
                  <div style={{width: 14, height: 14, borderRadius: '50%', background: pc.color, border: '2px solid rgba(255,255,255,0.15)', flexShrink: 0, boxShadow: `0 0 10px ${al(pc.color, 0.4)}`}} />
                  <div style={{fontSize: 13, fontWeight: 800, color: '#fff'}}>{pc.name}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ═══ 製品ショーケース（PC商品画像のみ — コラボ画像は使わない） ═══ */}
      {showcasePC && (
        <section style={{position: 'relative', padding: 'clamp(56px,7vw,100px) 0', background: 'linear-gradient(180deg, transparent 0%, rgba(0,240,255,0.03) 50%, transparent 100%)'}}>
          <div style={{...PAGE_WIDTH, padding: '0 clamp(16px,3vw,40px)', display: 'flex', alignItems: 'center', gap: 'clamp(24px,4vw,60px)', flexWrap: 'wrap' as const}}>
            <div className="about-pulse about-scale" style={{flex: '1 1 320px', borderRadius: 24, overflow: 'hidden', border: `1px solid ${al(T.c, 0.12)}`}}>
              <img src={shopImg(showcasePC, 800)} alt="Astromeda PC Showcase" loading="lazy" style={{width: '100%', height: 'auto', display: 'block'}} />
            </div>
            <div className="about-fade" style={{flex: '1 1 300px', minWidth: 260}}>
              <div style={{fontSize: 'clamp(10px,1.1vw,12px)', fontWeight: 700, color: T.c, letterSpacing: 3, marginBottom: 10}}>HPC MANUFACTURING</div>
              <h2 style={{fontSize: 'clamp(22px,3.5vw,38px)', fontWeight: 900, color: '#fff', margin: '0 0 16px 0', lineHeight: 1.2}}>国内自社工場で<br />全台を組立</h2>
              <p style={{fontSize: 'clamp(13px,1.3vw,15px)', color: 'rgba(255,255,255,0.7)', lineHeight: 2, margin: '0 0 24px 0'}}>
                パーツの選定から組立、動作確認まで、熟練のスタッフが責任を持って対応。コンシューマー向け・法人向けともに高品質なHPCをお届けします。
              </p>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12}}>
                {[{n: 'RTX 5000', s: '全台搭載'}, {n: 'DDR5', s: '標準'}, {n: '最短10日', s: '出荷'}].map((item, i) => (
                  <div key={i} style={{padding: '14px 10px', background: al(T.c, 0.05), border: `1px solid ${al(T.c, 0.1)}`, borderRadius: 10, textAlign: 'center' as const}}>
                    <div style={{fontSize: 'clamp(16px,2vw,22px)', fontWeight: 900, color: T.c}}>{item.n}</div>
                    <div style={{fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2}}>{item.s}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═══ Why ASTROMEDA — テキストカード（画像なし = 不整合を避ける） ═══ */}
      <section style={{...PAGE_WIDTH, padding: 'clamp(40px,5vw,72px) clamp(16px,3vw,40px)'}}>
        <div style={{textAlign: 'center' as const, marginBottom: 'clamp(20px,3vw,36px)'}}>
          <div style={{fontSize: 'clamp(10px,1.1vw,12px)', fontWeight: 700, color: T.c, letterSpacing: 3, marginBottom: 8}}>WHY ASTROMEDA</div>
          <h2 style={{fontSize: 'clamp(22px,3.5vw,36px)', fontWeight: 900, color: '#fff', margin: 0}}>選ばれる理由</h2>
        </div>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16}}>
          {[
            {accent: T.c, icon: '🏭', title: '国内自社工場', desc: '全台を国内自社工場で組立・品質検査。パーツ選定から出荷まで一貫管理。'},
            {accent: '#FF6B9D', icon: '🎮', title: '25+ IPコラボ', desc: 'ONE PIECE、呪術廻戦、BLEACHなど25タイトル以上の公式コラボ。'},
            {accent: '#8B5CF6', icon: '🎨', title: '全8色カラー', desc: 'ホワイト・ブラック・ピンク・パープル・ライトブルー・レッド・グリーン・オレンジ。'},
            {accent: '#FFD700', icon: '⚡', title: 'RTX 5000 + DDR5', desc: '全モデルにNVIDIA RTX 5000シリーズGPU + DDR5メモリ標準搭載。'},
            {accent: '#2ECC71', icon: '🛡️', title: '最長3年保証', desc: 'メーカー標準1年 + 延長保証オプションで最長3年のサポート。'},
            {accent: '#F97316', icon: '🚚', title: '送料無料・最短10日', desc: '受注確定後、最短10日での出荷対応。全国送料無料でお届け。'},
          ].map((f, i) => (
            <div key={i} className={`about-scale about-fade about-fade-d${Math.min(i + 1, 4)}`} style={{borderRadius: 16, overflow: 'hidden', background: al(f.accent, 0.03), border: `1px solid ${al(f.accent, 0.12)}`, padding: 'clamp(20px,2.5vw,32px)'}}>
              <div style={{fontSize: 32, marginBottom: 12}}>{f.icon}</div>
              <div style={{fontSize: 'clamp(14px,1.6vw,18px)', fontWeight: 900, color: '#fff', marginBottom: 8}}>{f.title}</div>
              <p style={{fontSize: 'clamp(12px,1.2vw,14px)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.8, margin: 0}}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 実績の数字 ═══ */}
      <section style={{...PAGE_WIDTH, padding: '0 clamp(16px,3vw,40px) clamp(56px,6vw,80px)'}}>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12}}>
          {[
            {num: '25+', label: 'IPコラボ', sub: '公式ライセンス', accent: '#FF6B9D'},
            {num: '8', label: 'カラー', sub: '選べる本体色', accent: T.c},
            {num: '2018', label: '年創業', sub: '東京・板橋区', accent: '#8B5CF6'},
            {num: 'RTX 5000', label: '全台搭載', sub: '最新GPU', accent: '#FFD700'},
            {num: 'DDR5', label: '標準搭載', sub: '次世代メモリ', accent: '#2ECC71'},
          ].map((item, i) => (
            <div key={i} className="about-fade" style={{background: al(item.accent, 0.04), border: `1px solid ${al(item.accent, 0.1)}`, borderRadius: 14, padding: 'clamp(18px,2.5vw,28px)', textAlign: 'center' as const, animationDelay: `${i * 0.1}s`}}>
              <div style={{fontSize: 'clamp(24px,3.5vw,36px)', fontWeight: 900, color: item.accent, lineHeight: 1}}>{item.num}</div>
              <div style={{fontSize: 13, fontWeight: 700, color: '#fff', marginTop: 6}}>{item.label}</div>
              <div style={{fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2}}>{item.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ COMPANY（テキストのみ — 不整合な画像は使わない） ═══ */}
      <section style={{...PAGE_WIDTH, padding: '0 clamp(16px,3vw,40px) clamp(56px,6vw,80px)'}}>
        <div style={{background: al(T.c, 0.03), border: `1px solid ${al(T.c, 0.08)}`, borderRadius: 20, overflow: 'hidden'}}>
          <div style={{padding: 'clamp(28px,4vw,48px)'}}>
            <div style={{fontSize: 'clamp(10px,1.1vw,12px)', fontWeight: 700, color: T.c, letterSpacing: 3, marginBottom: 16}}>COMPANY</div>
            <h2 style={{fontSize: 'clamp(18px,2.5vw,26px)', fontWeight: 900, color: '#fff', margin: '0 0 24px 0'}}>株式会社マイニングベース</h2>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'clamp(16px,2vw,24px)'}}>
              {[
                {label: '設立', value: '2018年5月11日'},
                {label: '代表取締役', value: '武正貴昭'},
                {label: '所在地', value: '東京都板橋区前野町1-29-10\nFVP板橋ビル1号館2階'},
                {label: '事業内容', value: 'HPC製造販売、デザインPC製造販売、eSports人材事業、自社メディア事業'},
                {label: 'ブランド', value: 'ASTROMEDA（アストロメダ）'},
                {label: 'オンラインストア', value: 'shop.mining-base.co.jp'},
              ].map((item, i) => (
                <div key={i}>
                  <div style={{fontSize: 10, fontWeight: 700, color: T.c, marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' as const}}>{item.label}</div>
                  <div style={{fontSize: 'clamp(12px,1.3vw,14px)', color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, whiteSpace: 'pre-line' as const}}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section style={{padding: 'clamp(56px,8vw,120px) clamp(16px,3vw,40px)', textAlign: 'center' as const, position: 'relative'}}>
        <div className="about-glow" style={{position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '40vw', height: '40vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,240,255,0.06) 0%, transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none'}} />
        <div style={{position: 'relative', zIndex: 1}}>
          <h2 className="about-fade" style={{fontSize: 'clamp(22px,4vw,42px)', fontWeight: 900, color: '#fff', margin: '0 0 12px 0'}}>あなただけの1台を見つけよう</h2>
          <p className="about-fade about-fade-d1" style={{fontSize: 'clamp(13px,1.3vw,16px)', color: 'rgba(255,255,255,0.55)', marginBottom: 28}}>ゲーミングPC、IPコラボモデル、全8色カラーからお選びください。</p>
          <div className="about-fade about-fade-d2" style={{display: 'flex', flexWrap: 'wrap' as const, gap: 14, justifyContent: 'center'}}>
            <Link to="/collections" className="about-cta-btn cta" style={{display: 'inline-block', padding: '16px 44px', fontSize: 15, fontWeight: 900, borderRadius: 14, textDecoration: 'none', letterSpacing: 1}}>
              コラボモデルを見る →
            </Link>
            <Link to="/collections/astromeda" className="about-cta-btn" style={{display: 'inline-block', padding: '16px 44px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 15, fontWeight: 700, borderRadius: 14, textDecoration: 'none', letterSpacing: 1}}>
              ゲーミングPCを見る
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
