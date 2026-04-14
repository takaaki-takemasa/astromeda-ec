/**
 * ゲーミングPC徹底比較 — ASTROMEDA vs 大手5社
 *
 * SEO最適化:
 * - 「ゲーミングPC 比較」「ASTROMEDA vs ドスパラ」等のキーワード対策
 * - FAQPage + WebPage 構造化データ
 * - AI引用可能な客観的比較表
 * - 内部リンク → 関連ガイド・コレクションページ誘導
 */

import {Link} from 'react-router';
import type {Route} from './+types/guides.comparison';
import {T, STORE_URL, PAGE_WIDTH} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

export const loader: Route.LoaderFunction = () => {
  return {};
};

export const meta: Route.MetaFunction = () => {
  const title = 'ゲーミングPC徹底比較 — ASTROMEDA vs 大手5社 | ASTROMEDA ゲーミングPC';
  const description =
    'ASTROMEDAとドスパラ・マウスコンピューター・パソコン工房・HP・Lenovoを徹底比較。25タイトル以上のIPコラボ、カスタムカラー、国内工場、アフターサポートの違いを解説。';
  const url = `${STORE_URL}/guides/comparison`;
  return [
    {title},
    {name: 'description', content: description},
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {property: 'og:url', content: url},
    {property: 'og:type', content: 'article'},
    {name: 'twitter:card', content: 'summary'},
    {name: 'twitter:title', content: title},
    {name: 'twitter:description', content: description},
  ];
};

const COMPARISON_DATA = [
  {
    category: 'IPコラボレーション',
    astromeda: '◎ 25タイトル以上',
    dosparakara: '×',
    mousecomp: '×',
    pc_koubou: '△ 少数',
    hp: '×',
    lenovo: '×',
    note: 'ONE PIECE、NARUTO、ぼっち・ざ・ろっく！など人気タイトルの豊富なラインナップ。ASTROMEDAの独自戦略。',
  },
  {
    category: 'カスタムカラー',
    astromeda: '◎ 8色',
    dosparakara: '×',
    mousecomp: '×',
    pc_koubou: '×',
    hp: '×',
    lenovo: '×',
    note: 'ホワイト・ブラック・ピンク・パープル・ライトブルー・レッド・グリーン・オレンジ。個性を表現できるデザイン。',
  },
  {
    category: '国内自社工場',
    astromeda: '◎',
    dosparakara: '◎',
    mousecomp: '◎',
    pc_koubou: '◎',
    hp: '× 海外製造',
    lenovo: '× 海外製造',
    note: '品質管理・カスタマイズ対応・修理対応の速度が異なる。',
  },
  {
    category: '最新GPU（RTX 50系）',
    astromeda: '◎',
    dosparakara: '◎',
    mousecomp: '◎',
    pc_koubou: '◎',
    hp: '◎',
    lenovo: '◎',
    note: 'RTX 5060〜5090 対応。BTO各社とも対応済み。',
  },
  {
    category: '即日出荷対応',
    astromeda: '◎',
    dosparakara: '◎',
    mousecomp: '△',
    pc_koubou: '△',
    hp: '×',
    lenovo: '×',
    note: 'ASTROMEDAは受注生産で10〜15営業日。ドスパラは一部即日出荷対応。',
  },
  {
    category: 'アフターサポート',
    astromeda: '◎ 電話+LINE',
    dosparakara: '○ 電話',
    mousecomp: '○ 電話',
    pc_koubou: '○ 電話',
    hp: '△ チャット',
    lenovo: '△ チャット',
    note: 'ASTROMEDAはLINE対応で気軽に相談可能。永年サポート。',
  },
  {
    category: 'エントリー価格帯',
    astromeda: '¥199,980〜',
    dosparakara: '¥189,980〜',
    mousecomp: '¥179,980〜',
    pc_koubou: '¥169,980〜',
    hp: '¥149,980〜',
    lenovo: '¥139,980〜',
    note: '価格帯は競合各社と同等。IPコラボ・カラーカスタムの付加価値がある。',
  },
];

const FAQ_ITEMS = [
  {
    q: 'ASTROMEDAは他社より高いですか？',
    a: 'エントリー価格帯は同等です（¥199,980〜）。ドスパラ・マウスコンピューターと比較しても大きな差はありません。ただしASTROMEDAは25タイトル以上のIPコラボと8色のカスタムカラーを備えており、同じ価格帯でも付加価値が高いのが特徴です。好きなアニメ・ゲームのPCが手に入るのはASTROMEDAだけです。',
  },
  {
    q: '初心者でも購入できますか？',
    a: 'もちろんです。ASTROMEDAは初心者向けの詳細なガイドページを用意しており、GPU・CPU・メモリの違いから予算別の構成まで網羅的に解説しています。また、購入後も電話・LINEでの手厚いサポートが利用でき、困ったことがあれば気軽に相談できます。',
  },
  {
    q: 'どのモデルがおすすめですか？',
    a: 'ゲーム・配信・クリエイティブ作業の用途に応じて、3つのティアを用意しています。【GAMER】¥199,980〜（フルHDゲーミング向け、RTX 5060〜5080）、【STREAMER】¥405,440〜（配信・WQHD向け、RTX 5070Ti〜5090）、【CREATOR】¥455,840〜（4K対応・クリエイティブ向け、RTX 5070Ti〜5090）。プレイするゲームやモニターの解像度に合わせて選択してください。',
  },
  {
    q: '即日出荷に対応していますか？',
    a: 'ASTROMEDAは受注生産モデルのため、注文から出荷までに10〜15営業日いただいています。これは国内自社工場での丁寧な組み立てと品質管理を実現するためです。急ぎの場合はお気軽にお問い合わせください。',
  },
  {
    q: '保証期間はどのくらいですか？',
    a: '標準で1年間の製品保証が付帯しています。さらに最大2年の延長保証に対応しており、最大3年間の手厚い保証を選択できます。保証期間内はメーカー・工賃ともに無料で修理対応いたします。',
  },
];

const BRAND_PROFILES = [
  {
    name: 'ASTROMEDA',
    position: 'IPコラボ・カスタムカラーの独自路線',
    desc: '25タイトル以上のIPコラボと8色のカスタムカラーで、ゲーマーの個性を最大限に表現できるゲーミングPC。国内自社工場での丁寧な組み立て、電話・LINEでの手厚いサポート、最長3年保証など、購入後の満足度を重視した総合ブランド。',
  },
  {
    name: 'ドスパラ（GALLERIA）',
    position: 'BTO大手。スペック重視',
    desc: 'ゲーミングPC市場のトップシェアを占めるBTO大手。スペック重視の顧客層をターゲットとしており、豊富なカスタマイズオプション、迅速な対応、品揃えの充実が強み。価格競争力も高い。',
  },
  {
    name: 'マウスコンピューター（G-Tune）',
    position: 'コスパ重視、幅広いラインナップ',
    desc: 'エントリーから最高峰まで、幅広い価格帯と構成を揃えたBTOメーカー。コストパフォーマンスに優れており、初心者からプロゲーマーまで幅広いニーズに対応。国内工場での組み立てと安定した品質。',
  },
  {
    name: 'パソコン工房（LEVEL∞）',
    position: 'パーツ選択肢が豊富',
    desc: 'ユーザーのニーズに応じた細かなカスタマイズに対応。パーツの選択肢が豊富で、こだわりのある顧客に支持されている。国内工場での製造で安定した品質を提供。',
  },
  {
    name: 'HP（OMEN）',
    position: 'グローバルブランド。デザイン重視',
    desc: 'グローバルなゲーミングPCブランド。洗練されたデザイン、豊富な色オプション、国際的なサポートネットワークが特徴。価格帯は高めだが、ブランド価値とデザイン性を求める層に人気。',
  },
  {
    name: 'Lenovo（Legion）',
    position: 'コストパフォーマンスに優れる',
    desc: '世界最大級のPC製造メーカーによるゲーミングブランド。スケールメリットを活かした低価格戦略、充実した仕様、グローバルサポートが強み。初心者向けのエントリーモデルが豊富。',
  },
];

export default function GuidesComparison() {
  // FAQ Schema
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };

  // WebPage Schema
  const webPageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    headline: 'ゲーミングPC徹底比較 — ASTROMEDA vs 大手5社',
    description:
      'ASTROMEDAとドスパラ・マウスコンピューター・パソコン工房・HP・Lenovoを徹底比較。IPコラボ、カスタムカラー、国内工場、アフターサポートの違いを解説。',
    url: `${STORE_URL}/guides/comparison`,
    author: {
      '@type': 'Organization',
      name: 'ASTROMEDA',
      url: STORE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: 'ASTROMEDA',
      url: STORE_URL,
    },
    mainEntity: {
      '@type': 'Table',
      about: 'ゲーミングPC徹底比較表',
    },
  };

  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif",
        color: T.tx,
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(faqJsonLd)}}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(webPageJsonLd)}}
      />

      <div style={{...PAGE_WIDTH, paddingTop: 'clamp(32px, 4vw, 64px)', paddingBottom: 'clamp(32px, 4vw, 64px)'}}>
        {/* Breadcrumb */}
        <nav style={{fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 24}}>
          <Link to="/" style={{color: 'rgba(255,255,255,.4)', textDecoration: 'none'}}>
            ホーム
          </Link>
          {' / '}
          <Link to="/guides" style={{color: 'rgba(255,255,255,.4)', textDecoration: 'none'}}>
            ガイド
          </Link>
          {' / '}
          <span style={{color: T.c}}>競合比較</span>
        </nav>

        {/* Header */}
        <header style={{marginBottom: 48}}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: T.c,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: 8,
            }}
          >
            Competitive Comparison
          </span>
          <h1
            style={{
              fontSize: 'clamp(28px, 5vw, 40px)',
              fontWeight: 900,
              margin: '0 0 16px',
              lineHeight: 1.2,
            }}
          >
            ゲーミングPC徹底比較
            <br />
            — ASTROMEDAが選ばれる理由
          </h1>
          <p
            style={{
              fontSize: 16,
              color: 'rgba(255,255,255,.7)',
              lineHeight: 1.8,
              margin: '0 0 24px',
              maxWidth: 680,
            }}
          >
            ASTROMEDAは、国内自社工場で1台ずつ組み立てる高品質ゲーミングPCブランドです。25タイトル以上のIPコラボレーションと8色のカスタムカラーで、他にはない唯一無二のゲーミング体験を提供しています。
          </p>
          <div
            style={{
              fontSize: 13,
              background: 'rgba(0,240,255,.08)',
              border: '1px solid rgba(0,240,255,.2)',
              borderRadius: 10,
              padding: '16px 20px',
              color: 'rgba(255,255,255,.8)',
            }}
          >
            この比較ページは、ゲーミングPC購入時に「どのメーカーを選ぶか」と悩んでいるあなたのために、客観的なデータを基に作成されました。各メーカーの特徴を理解して、自分に最適なPCを選択してください。
          </div>
        </header>

        {/* Main Comparison Table */}
        <section style={{marginBottom: 56}}>
          <h2
            style={{
              fontSize: 'clamp(22px, 3vw, 28px)',
              fontWeight: 900,
              color: T.c,
              marginBottom: 24,
              paddingBottom: 12,
              borderBottom: `2px solid ${T.c}`,
            }}
          >
            6社比較表
          </h2>

          {/* Desktop Table */}
          <div
            style={{
              overflowX: 'auto',
              marginBottom: 24,
              display: 'none',
              '@media (min-width: 768px)': {
                display: 'block',
              },
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
                backgroundColor: 'rgba(255,255,255,.02)',
                border: '1px solid rgba(255,255,255,.08)',
              }}
            >
              <thead>
                <tr style={{backgroundColor: 'rgba(0,240,255,.08)', borderBottom: '2px solid rgba(0,240,255,.2)'}}>
                  <th
                    style={{
                      padding: '16px',
                      textAlign: 'left',
                      fontWeight: 800,
                      color: T.c,
                      minWidth: 140,
                    }}
                  >
                    項目
                  </th>
                  <th style={{padding: '16px', textAlign: 'left', fontWeight: 800, color: T.c, minWidth: 130}}>
                    ASTROMEDA
                  </th>
                  <th style={{padding: '16px', textAlign: 'left', fontWeight: 700, color: 'rgba(255,255,255,.7)', minWidth: 120}}>
                    ドスパラ
                  </th>
                  <th style={{padding: '16px', textAlign: 'left', fontWeight: 700, color: 'rgba(255,255,255,.7)', minWidth: 130}}>
                    マウスコンピューター
                  </th>
                  <th style={{padding: '16px', textAlign: 'left', fontWeight: 700, color: 'rgba(255,255,255,.7)', minWidth: 110}}>
                    パソコン工房
                  </th>
                  <th style={{padding: '16px', textAlign: 'left', fontWeight: 700, color: 'rgba(255,255,255,.7)', minWidth: 70}}>
                    HP
                  </th>
                  <th style={{padding: '16px', textAlign: 'left', fontWeight: 700, color: 'rgba(255,255,255,.7)', minWidth: 80}}>
                    Lenovo
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_DATA.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,.06)',
                      backgroundColor: i % 2 === 0 ? 'rgba(255,255,255,.02)' : 'transparent',
                    }}
                  >
                    <td style={{padding: '14px 16px', fontWeight: 700, color: 'rgba(255,255,255,.9)'}}>{row.category}</td>
                    <td style={{padding: '14px 16px', color: T.c, fontWeight: 600}}>{row.astromeda}</td>
                    <td style={{padding: '14px 16px', color: 'rgba(255,255,255,.7)'}}>{row.dosparakara}</td>
                    <td style={{padding: '14px 16px', color: 'rgba(255,255,255,.7)'}}>{row.mousecomp}</td>
                    <td style={{padding: '14px 16px', color: 'rgba(255,255,255,.7)'}}>{row.pc_koubou}</td>
                    <td style={{padding: '14px 16px', color: 'rgba(255,255,255,.7)'}}>{row.hp}</td>
                    <td style={{padding: '14px 16px', color: 'rgba(255,255,255,.7)'}}>{row.lenovo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Layout */}
          <div style={{display: 'block', '@media (min-width: 768px)': {display: 'none'}}}>
            {COMPARISON_DATA.map((row, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 20,
                  padding: 16,
                  background: 'rgba(255,255,255,.03)',
                  border: '1px solid rgba(255,255,255,.08)',
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: T.c,
                    marginBottom: 12,
                  }}
                >
                  {row.category}
                </div>
                <div style={{fontSize: 12, color: 'rgba(255,255,255,.6)', lineHeight: 1.6}}>
                  <div style={{marginBottom: 8}}>
                    <span style={{color: 'rgba(255,255,255,.5)', fontWeight: 600}}>ASTROMEDA:</span>{' '}
                    <span style={{color: T.c, fontWeight: 600}}>{row.astromeda}</span>
                  </div>
                  <div style={{marginBottom: 8}}>
                    <span style={{color: 'rgba(255,255,255,.5)', fontWeight: 600}}>ドスパラ:</span> {row.dosparakara}
                  </div>
                  <div style={{marginBottom: 8}}>
                    <span style={{color: 'rgba(255,255,255,.5)', fontWeight: 600}}>マウスコンピューター:</span> {row.mousecomp}
                  </div>
                  <div style={{marginBottom: 8}}>
                    <span style={{color: 'rgba(255,255,255,.5)', fontWeight: 600}}>パソコン工房:</span> {row.pc_koubou}
                  </div>
                  <div style={{marginBottom: 8}}>
                    <span style={{color: 'rgba(255,255,255,.5)', fontWeight: 600}}>HP:</span> {row.hp}
                  </div>
                  <div style={{marginBottom: 12}}>
                    <span style={{color: 'rgba(255,255,255,.5)', fontWeight: 600}}>Lenovo:</span> {row.lenovo}
                  </div>
                  <p
                    style={{
                      fontSize: 11,
                      color: 'rgba(255,255,255,.5)',
                      fontStyle: 'italic',
                      margin: '12px 0 0',
                      paddingTop: 12,
                      borderTop: '1px solid rgba(255,255,255,.06)',
                    }}
                  >
                    {row.note}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Why ASTROMEDA Section */}
        <section style={{marginBottom: 56}}>
          <h2
            style={{
              fontSize: 'clamp(22px, 3vw, 28px)',
              fontWeight: 900,
              color: T.c,
              marginBottom: 24,
              paddingBottom: 12,
              borderBottom: `2px solid ${T.c}`,
            }}
          >
            ASTROMEDAを選ぶ3つの決定的理由
          </h2>

          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24}}>
            {[
              {
                num: '1',
                title: '25タイトル以上のIPコラボ',
                desc: 'ONE PIECE、NARUTO、ぼっち・ざ・ろっく！など、好きな作品のPCが手に入るのはASTROMEDAだけ。推し活とゲーミングの両立を実現。',
              },
              {
                num: '2',
                title: '8色カスタムカラー',
                desc: 'ホワイト・ブラック・ピンク・パープル・ライトブルー・レッド・グリーン・オレンジ。部屋のインテリアに合わせたカスタマイズが可能。',
              },
              {
                num: '3',
                title: '国内工場＋手厚いサポート',
                desc: '国内自社工場での丁寧な組み立て、電話・LINEでの永年サポート、最長3年保証。購入後も安心して愛用できる。',
              },
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  padding: 24,
                  background: 'linear-gradient(135deg, rgba(0,240,255,.08), rgba(255,179,0,.04))',
                  border: '1px solid rgba(0,240,255,.15)',
                  borderRadius: 16,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 900,
                    color: T.c,
                    marginBottom: 12,
                  }}
                >
                  {item.num}
                </div>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: T.tx,
                    marginBottom: 12,
                    lineHeight: 1.4,
                  }}
                >
                  {item.title}
                </h3>
                <p
                  style={{
                    fontSize: 13,
                    color: 'rgba(255,255,255,.7)',
                    lineHeight: 1.7,
                    margin: 0,
                  }}
                >
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Brand Profiles */}
        <section style={{marginBottom: 56}}>
          <h2
            style={{
              fontSize: 'clamp(22px, 3vw, 28px)',
              fontWeight: 900,
              color: T.c,
              marginBottom: 24,
              paddingBottom: 12,
              borderBottom: `2px solid ${T.c}`,
            }}
          >
            各ブランドの特徴
          </h2>

          {BRAND_PROFILES.map((brand, i) => (
            <div key={i} style={{marginBottom: 28}}>
              <div style={{marginBottom: 8}}>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: i === 0 ? T.c : 'rgba(255,255,255,.85)',
                    margin: '0 0 4px',
                  }}
                >
                  {brand.name}
                </h3>
                <p
                  style={{
                    fontSize: 12,
                    color: 'rgba(255,255,255,.5)',
                    fontWeight: 600,
                    margin: 0,
                    fontStyle: 'italic',
                  }}
                >
                  {brand.position}
                </p>
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: 'rgba(255,255,255,.7)',
                  lineHeight: 1.7,
                  margin: 0,
                  borderLeft: i === 0 ? `3px solid ${T.c}` : `3px solid rgba(255,255,255,.1)`,
                  paddingLeft: 16,
                }}
              >
                {brand.desc}
              </p>
            </div>
          ))}
        </section>

        {/* FAQ Section */}
        <section style={{marginBottom: 56}}>
          <h2
            style={{
              fontSize: 'clamp(22px, 3vw, 28px)',
              fontWeight: 900,
              color: T.c,
              marginBottom: 24,
              paddingBottom: 12,
              borderBottom: `2px solid ${T.c}`,
            }}
          >
            よくある質問
          </h2>

          {FAQ_ITEMS.map((item, i) => (
            <details
              key={i}
              style={{
                marginBottom: 12,
                padding: 0,
                background: 'rgba(255,255,255,.03)',
                border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  padding: '16px 20px',
                  fontWeight: 700,
                  fontSize: 13,
                  color: T.tx,
                  userSelect: 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{item.q}</span>
                <span
                  style={{
                    fontSize: 18,
                    color: T.c,
                    transition: 'transform 0.3s',
                  }}
                >
                  ▼
                </span>
              </summary>
              <div
                style={{
                  padding: '0 20px 16px 20px',
                  fontSize: 13,
                  color: 'rgba(255,255,255,.7)',
                  lineHeight: 1.8,
                  borderTop: '1px solid rgba(255,255,255,.06)',
                }}
              >
                {item.a}
              </div>
            </details>
          ))}
        </section>

        {/* Conclusion */}
        <section
          style={{
            padding: 32,
            background: `linear-gradient(135deg, ${T.c}22 0%, ${T.g}22 100%)`,
            border: `1px solid ${T.c}33`,
            borderRadius: 16,
            marginBottom: 48,
          }}
        >
          <h2
            style={{
              fontSize: 'clamp(20px, 2.5vw, 26px)',
              fontWeight: 900,
              margin: '0 0 16px',
            }}
          >
            ASTROMEDAでゲーミング人生を最高に
          </h2>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.8)',
              lineHeight: 1.8,
              margin: '0 0 20px',
            }}
          >
            ゲーミングPCの選択は、単なるマシン選びではなく、あなたのゲーミング人生そのものを左右します。ASTROMEDAなら、好きなIPとのコラボで推し活もゲーミングも両立でき、カスタムカラーで部屋を自分色に染められます。そして国内工場での丁寧な組み立てと永年サポートで、購入後も安心です。
          </p>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.8)',
              lineHeight: 1.8,
              margin: 0,
            }}
          >
            あなたの「推し」を応援するゲーミングPC、それがASTROMEDAです。
          </p>
        </section>

        {/* CTA */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: 32,
          }}
        >
          <div style={{display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap'}}>
            <Link
              to="/collections/astromeda"
              style={{
                display: 'inline-block',
                padding: '16px 32px',
                background: T.c,
                color: '#000',
                fontSize: 13,
                fontWeight: 800,
                borderRadius: 10,
                textDecoration: 'none',
              }}
            >
              ASTROMEDAのPCを見る →
            </Link>
            <Link
              to="/guides/beginners"
              style={{
                display: 'inline-block',
                padding: '16px 32px',
                background: 'transparent',
                color: T.g,
                fontSize: 13,
                fontWeight: 800,
                borderRadius: 10,
                textDecoration: 'none',
                border: `1px solid ${T.g}4D`,
              }}
            >
              初心者ガイドへ →
            </Link>
          </div>
        </div>

        {/* Back link */}
        <div style={{textAlign: 'center'}}>
          <Link
            to="/guides"
            style={{fontSize: 13, color: 'rgba(255,255,255,.5)', textDecoration: 'none'}}
          >
            ← ガイド一覧に戻る
          </Link>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
