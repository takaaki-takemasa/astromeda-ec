/**
 * コスパ比較ガイド
 *
 * SEO最適化:
 * - 「ゲーミングPC コスパ」「ゲーミングPC 予算」キーワード対策
 * - Article Schema.org 構造化データ
 * - 内部リンク → 予算帯別コレクション誘導
 */

import {Link} from 'react-router';
import type {Route} from './+types/guides.cospa';
import {T, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

export const meta: Route.MetaFunction = () => {
  const title = 'コスパ最強ゲーミングPC選び方 | ASTROMEDA ゲーミングPC';
  const description = '予算別コスパ最強ゲーミングPCの選び方ガイド。10万円台・20万円台・30万円台の価格帯別おすすめ構成をASTROMEDA専門スタッフが解説。';
  const url = `${STORE_URL}/guides/cospa`;
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
  ];
};

const TIERS = [
  {
    id: 'tier-20',
    budget: '20万円台',
    label: 'エントリーモデル',
    accent: '#4CAF50',
    target: 'フルHD（1920×1080）で人気ゲームを快適に',
    specs: [
      {part: 'GPU', rec: 'NVIDIA GeForce RTX 5060'},
      {part: 'CPU', rec: 'AMD Ryzen 5 / Intel Core Ultra 5'},
      {part: 'メモリ', rec: '16GB DDR5'},
      {part: 'ストレージ', rec: 'NVMe SSD 1TB'},
      {part: '電源', rec: '650W 80PLUS Bronze'},
    ],
    games: 'Apex Legends（高画質 144fps+）、Valorant（最高画質 240fps+）、フォートナイト（高画質 120fps+）、原神（最高画質 60fps）',
    pros: 'コストを抑えながらも、人気のeスポーツタイトルを十分快適にプレイ可能。初めてのゲーミングPCに最適。',
    cons: '4K解像度や最新AAAタイトルの最高画質設定では力不足になる場面も。将来的にGPU交換で対応可能。',
  },
  {
    id: 'tier-30',
    budget: '30万円台',
    label: 'ミドルハイモデル',
    accent: '#FFD700',
    target: 'WQHD（2560×1440）で最新ゲームを高画質に',
    specs: [
      {part: 'GPU', rec: 'NVIDIA GeForce RTX 5070 / RTX 5070Ti'},
      {part: 'CPU', rec: 'AMD Ryzen 7 / Intel Core Ultra 7'},
      {part: 'メモリ', rec: '32GB DDR5'},
      {part: 'ストレージ', rec: 'NVMe SSD 1TB'},
      {part: '電源', rec: '750W 80PLUS Gold'},
    ],
    games: 'サイバーパンク2077（高画質 80fps+）、エルデンリング（最高画質 60fps）、Starfield（高画質 60fps+）、配信しながらApex（高画質 120fps+）',
    pros: '最新AAAタイトルもWQHDで快適動作。配信・動画編集との同時使用にも対応。2〜3年は最前線で戦える構成。',
    cons: '4K最高画質では一部タイトルでフレームレートが落ちる場面あり。',
  },
  {
    id: 'tier-40',
    budget: '40万円台〜',
    label: 'フラッグシップモデル',
    accent: '#FF2D55',
    target: '4K（3840×2160）最高画質、妥協なしのハイエンド',
    specs: [
      {part: 'GPU', rec: 'NVIDIA GeForce RTX 5080 / RTX 5090'},
      {part: 'CPU', rec: 'AMD Ryzen 9 / Intel Core Ultra 9'},
      {part: 'メモリ', rec: '32GB〜64GB DDR5'},
      {part: 'ストレージ', rec: 'NVMe SSD 2TB（Gen5対応）'},
      {part: '電源', rec: '1000W 80PLUS Gold'},
    ],
    games: 'あらゆるゲームを4K最高画質で。サイバーパンク2077 RT Overdrive（4K 60fps+）、Flight Simulator 2024（Ultra 4K）、VRゲーム（Quest 3対応）',
    pros: '現行最高峰の性能。ゲーム、配信、動画編集、3DCG制作など何でもこなせる。5年以上第一線で活躍可能。',
    cons: '電気代とスペース（大型ケース必須）は覚悟が必要。冷却対策も重要。',
  },
];

const TIPS = [
  {
    title: 'コスパを最大化する3つのコツ',
    items: [
      '【GPUに予算を集中】ゲーム性能の7割はGPUで決まります。他を削ってでもGPUのランクを上げるのがコスパ向上の鉄則。',
      '【メモリは後から増設可能】最初は16GBで始めて、必要になったら32GBに増設する戦略もアリ。ただしDDR4/DDR5の混在はNG。',
      '【セール・キャンペーンを活用】ASTROMEDAでは定期的に期間限定セールを実施。メルマガ登録で最新情報を受け取れます。',
    ],
  },
  {
    title: 'やってはいけない失敗パターン',
    items: [
      '【スペック偏重】RTX 5090にローエンドCPUを合わせるなど、パーツバランスが悪いとボトルネックが発生し、高額GPUの性能を活かしきれません。',
      '【電源ケチり】安価な電源は故障リスクが高く、最悪の場合他パーツも巻き込みます。80PLUS認証品を選びましょう。',
      '【冷却軽視】ケースの排熱設計やCPUクーラーを軽視すると、サーマルスロットリングで性能ダウン。特に夏場は要注意。',
    ],
  },
];

const SECTIONS = [
  {
    name: 'エントリーモデル（20万円台）',
    text: 'フルHD（1920×1080）で人気ゲームを快適に。NVIDIA GeForce RTX 5060とAMD Ryzen 5で最適なバランスを実現。',
  },
  {
    name: 'ミドルハイモデル（30万円台）',
    text: 'WQHD（2560×1440）で最新ゲームを高画質に。RTX 5070 / RTX 5070TiとRyzen 7で2〜3年の最前線性能を確保。',
  },
  {
    name: 'フラッグシップモデル（40万円台〜）',
    text: '4K（3840×2160）最高画質、妥協なしのハイエンド。RTX 5080 / RTX 5090で5年以上の第一線活躍を実現。',
  },
];

export default function GuidesCospa() {
  const howToJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'コスパ最強ゲーミングPC選び方',
    description: '予算別コスパ最強ゲーミングPCの選び方ガイド。10万円台・20万円台・30万円台の価格帯別おすすめ構成。',
    step: SECTIONS.map((section, index) => ({
      '@type': 'HowToStep',
      position: String(index + 1),
      name: section.name,
      text: section.text,
    })),
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
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(howToJsonLd),
        }}
      />
      <div
        style={{
          maxWidth: 800,
          margin: '0 auto',
          padding: 'clamp(32px, 4vw, 64px) clamp(16px, 4vw, 48px)',
        }}
      >
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
          <span style={{color: T.g}}>コスパ比較</span>
        </nav>

        {/* Header */}
        <header style={{marginBottom: 40}}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: T.g,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: 8,
            }}
          >
            Cost Performance Guide
          </span>
          <h1
            style={{
              fontSize: 'clamp(24px, 4vw, 36px)',
              fontWeight: 900,
              margin: '0 0 12px',
            }}
          >
            コスパ比較ガイド
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.6)',
              lineHeight: 1.8,
              margin: 0,
            }}
          >
            予算20万円台〜40万円台の各価格帯で、最もコストパフォーマンスの高い構成を比較。
            あなたの予算と用途に最適なゲーミングPCが見つかります。
          </p>
        </header>

        {/* Tier cards */}
        {TIERS.map((tier) => (
          <section
            key={tier.id}
            id={tier.id}
            style={{
              marginBottom: 32,
              background: 'rgba(255,255,255,.02)',
              borderRadius: 16,
              border: `1px solid ${tier.accent}20`,
              overflow: 'hidden',
            }}
          >
            {/* Tier header */}
            <div
              style={{
                padding: '20px 24px',
                background: `${tier.accent}08`,
                borderBottom: `1px solid ${tier.accent}15`,
              }}
            >
              <div style={{display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'}}>
                <span
                  style={{
                    fontSize: 'clamp(20px, 3vw, 26px)',
                    fontWeight: 900,
                    color: tier.accent,
                  }}
                >
                  {tier.budget}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#fff',
                    background: `${tier.accent}30`,
                    padding: '4px 10px',
                    borderRadius: 6,
                  }}
                >
                  {tier.label}
                </span>
              </div>
              <p style={{fontSize: 13, color: 'rgba(255,255,255,.6)', margin: '8px 0 0'}}>
                {tier.target}
              </p>
            </div>

            {/* Specs */}
            <div style={{padding: 24}}>
              <h3
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: tier.accent,
                  marginBottom: 12,
                }}
              >
                推奨スペック
              </h3>
              {tier.specs.map((spec) => (
                <div
                  key={spec.part}
                  style={{
                    display: 'flex',
                    gap: 12,
                    padding: '8px 0',
                    borderBottom: '1px solid rgba(255,255,255,.04)',
                    fontSize: 13,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      color: 'rgba(255,255,255,.5)',
                      minWidth: 90,
                      flexShrink: 0,
                    }}
                  >
                    {spec.part}
                  </span>
                  <span style={{color: 'rgba(255,255,255,.8)'}}>{spec.rec}</span>
                </div>
              ))}

              {/* Games */}
              <h3
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: tier.accent,
                  marginTop: 20,
                  marginBottom: 8,
                }}
              >
                対応ゲーム目安
              </h3>
              <p style={{fontSize: 13, color: 'rgba(255,255,255,.65)', lineHeight: 1.8, margin: 0}}>
                {tier.games}
              </p>

              {/* Pros/Cons */}
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20}}>
                <div>
                  <h4 style={{fontSize: 12, fontWeight: 800, color: '#4CAF50', marginBottom: 6}}>
                    ◎ メリット
                  </h4>
                  <p style={{fontSize: 12, color: 'rgba(255,255,255,.6)', lineHeight: 1.7, margin: 0}}>
                    {tier.pros}
                  </p>
                </div>
                <div>
                  <h4 style={{fontSize: 12, fontWeight: 800, color: '#FF9800', marginBottom: 6}}>
                    △ 注意点
                  </h4>
                  <p style={{fontSize: 12, color: 'rgba(255,255,255,.6)', lineHeight: 1.7, margin: 0}}>
                    {tier.cons}
                  </p>
                </div>
              </div>
            </div>
          </section>
        ))}

        {/* Tips */}
        {TIPS.map((tip) => (
          <section
            key={tip.title}
            style={{
              marginBottom: 32,
              padding: 24,
              background: 'rgba(255,255,255,.02)',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,.06)',
            }}
          >
            <h2
              style={{
                fontSize: 'clamp(16px, 2.5vw, 20px)',
                fontWeight: 900,
                color: T.g,
                marginBottom: 16,
              }}
            >
              {tip.title}
            </h2>
            {tip.items.map((item, i) => (
              <p
                key={i}
                style={{
                  fontSize: 13,
                  color: 'rgba(255,255,255,.7)',
                  lineHeight: 1.8,
                  margin: '0 0 10px',
                }}
              >
                {item}
              </p>
            ))}
          </section>
        ))}

        {/* CTA */}
        <div
          style={{
            textAlign: 'center',
            padding: 32,
            background: 'rgba(255,215,0,.04)',
            borderRadius: 16,
            border: '1px solid rgba(255,215,0,.15)',
            marginTop: 48,
          }}
        >
          <h3 style={{fontSize: 18, fontWeight: 900, marginBottom: 12}}>
            予算に合ったPCを探す
          </h3>
          <p
            style={{
              fontSize: 13,
              color: 'rgba(255,255,255,.6)',
              marginBottom: 20,
              lineHeight: 1.6,
            }}
          >
            ASTROMEDAなら人気IPコラボデザインで所有欲も満たせます。
          </p>
          <div style={{display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap'}}>
            <Link
              to="/collections/astromeda"
              style={{
                display: 'inline-block',
                padding: '14px 28px',
                background: T.g,
                color: '#000',
                fontSize: 13,
                fontWeight: 800,
                borderRadius: 10,
                textDecoration: 'none',
              }}
            >
              全ラインナップを見る
            </Link>
            <Link
              to="/guides/streaming"
              style={{
                display: 'inline-block',
                padding: '14px 28px',
                background: 'transparent',
                color: T.r,
                fontSize: 13,
                fontWeight: 800,
                borderRadius: 10,
                textDecoration: 'none',
                border: '1px solid rgba(255,45,85,.3)',
              }}
            >
              配信向けガイドへ →
            </Link>
          </div>
        </div>

        {/* Back link */}
        <div style={{textAlign: 'center', marginTop: 32}}>
          <Link
            to="/guides"
            style={{fontSize: 13, color: 'rgba(255,255,255,.5)', textDecoration: 'none'}}
          >
            ← ガイド一覧に戻る
          </Link>
        </div>
      </div>

      {/* Article Schema.org */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: 'コスパ比較ガイド — 予算別おすすめゲーミングPC',
            description:
              '20万円台・30万円台・40万円台の予算別に最もコスパの高いゲーミングPC構成を比較。',
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
            mainEntityOfPage: {
              '@type': 'WebPage',
              '@id': `${STORE_URL}/guides/cospa`,
            },
          }),
        }}
      />
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
