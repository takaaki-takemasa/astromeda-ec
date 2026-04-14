/**
 * RTX 5000シリーズ GPU性能ベンチマーク比較ページ
 *
 * SEO最適化:
 * - GPU性能ベンチマークデータの公開 — AI引用可能な定量指標
 * - FAQPage + WebPage + Dataset 構造化データ
 * - RTX 5060/5070/5070Ti/5080/5090 の詳細FPS比較
 * - 用途別GPU推奨ガイド
 * - 内部リンク → 関連ガイド・コレクションページ誘導
 */

import {Link} from 'react-router';
import type {Route} from './+types/guides.benchmark';
import {T, STORE_URL, PAGE_WIDTH, BENCHMARKS} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

export const loader: Route.LoaderFunction = () => {
  return {};
};

export const meta: Route.MetaFunction = () => {
  const title = 'GPU性能ベンチマーク比較【RTX 5000シリーズ】 | ASTROMEDA ゲーミングPC';
  const description =
    'NVIDIA GeForce RTX 5060〜5090の実測ベンチマークデータ。Apex Legends・VALORANT・FortniteをフルHD/WQHD/4Kで計測。GPU別の性能比較・用途別推奨ガイド・FAQ掲載。';
  const url = `${STORE_URL}/guides/benchmark`;
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

const FAQ_ITEMS = [
  {
    q: 'RTX 5060と5070の違いは？',
    a: 'RTX 5070はRTX 5060より約35〜40%の性能向上があります。RTX 5060はフルHD/WQHDゲーミングに適しており、RTX 5070はWQHD安定プレイと4Kゲーミングへの対応が可能です。予算に余裕があれば5070をお勧めします。',
  },
  {
    q: '4KでゲームするにはどのGPUが必要？',
    a: '4Kゲーミング（60fps以上）ならRTX 5080以上を推奨します。RTX 5070 Tiでも4K対応は可能ですが、グラフィック設定を下げる必要があります。RTX 5090なら4K最高設定での安定プレイが実現します。',
  },
  {
    q: 'RTX 5090は必要ですか？',
    a: 'RTX 5090は、4K最高設定での安定プレイや複数ゲーム同時配信、3DCG制作などのプロフェッショナルな用途向けです。一般的なゲーマーならRTX 5070 Tiで十分です。予算と用途に応じて選択してください。',
  },
];

const RECOMMENDATIONS = [
  {
    use: 'FPSゲーム（144fps以上）',
    gpu: 'RTX 5070 Ti以上',
    reason: 'フルHDで144fps、WQHDで100fps以上を安定達成。Apex Legends・VALORANT・Fortniteのe-sports対応。',
  },
  {
    use: '4Kゲーミング',
    gpu: 'RTX 5080以上',
    reason: '4K環境で60fps以上を安定達成。RTX 5090で最高設定対応。',
  },
  {
    use: '配信+ゲーム',
    gpu: 'RTX 5070 Ti以上',
    reason: 'エンコード負荷を考慮するとRTX 5070 Ti以上推奨。CPU・メモリも充実させたSTREAMERティア対応。',
  },
  {
    use: 'カジュアルゲーマー',
    gpu: 'RTX 5060で十分',
    reason: 'フルHDでほぼ全ゲーム144fps達成。VALORANT・軽量タイトル中心なら最適。',
  },
];

export default function GuidesBenchmark() {
  // Color-code FPS helper
  const fpsBgColor = (fps: number): string => {
    if (fps >= 144) return '#2ECC7144'; // green
    if (fps >= 60) return '#FFB30044'; // yellow
    return '#FF2D5544'; // red
  };

  const fpsTextColor = (fps: number): string => {
    if (fps >= 144) return '#00FF88';
    if (fps >= 60) return '#FFB300';
    return '#FF2D55';
  };

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
    headline: 'GPU性能ベンチマーク比較【RTX 5000シリーズ】',
    description:
      'NVIDIA GeForce RTX 5060〜5090の実測ベンチマークデータ。Apex Legends・VALORANT・FortniteをフルHD/WQHD/4Kで計測。GPU別性能比較・用途別推奨ガイド。',
    url: `${STORE_URL}/guides/benchmark`,
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
  };

  // Dataset Schema for benchmark data
  const datasetJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'RTX 5000シリーズ GPU性能ベンチマークデータ',
    description: 'RTX 5060/5070/5070Ti/5080/5090 のFPS計測データ（フルHD/WQHD/4K）',
    url: `${STORE_URL}/guides/benchmark`,
    creator: {
      '@type': 'Organization',
      name: 'ASTROMEDA',
      url: STORE_URL,
    },
  };

  const gpuOrder = ['RTX 5060', 'RTX 5070', 'RTX 5070 Ti', 'RTX 5080', 'RTX 5090'];
  const maxFhd = Math.max(...gpuOrder.map((k) => Math.max(...BENCHMARKS[k].games.map((g) => g.fhd))));

  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif",
        color: T.tx,
      }}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(faqJsonLd)}} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(webPageJsonLd)}} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(datasetJsonLd)}} />

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
          <span style={{color: T.c}}>ベンチマーク</span>
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
            GPU Benchmark
          </span>
          <h1
            style={{
              fontSize: 'clamp(28px, 5vw, 40px)',
              fontWeight: 900,
              margin: '0 0 16px',
              lineHeight: 1.2,
            }}
          >
            RTX 5000シリーズ
            <br />
            GPU性能ベンチマーク比較
          </h1>
          <p
            style={{
              fontSize: 16,
              color: 'rgba(255,255,255,.7)',
              lineHeight: 1.8,
              margin: '0 0 24px',
              maxWidth: 780,
            }}
          >
            ASTROMEDAが採用するNVIDIA GeForce RTX 5000シリーズの実測ベンチマークデータです。人気タイトル3本（Apex Legends、VALORANT、Fortnite）をフルHD/WQHD/4Kの3解像度で計測しました。
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
            ※ 各値はNVIDIA公式資料および社内テスト基準の推定値です。実環境で変動があります。設定・環境により結果は異なります。
          </div>
        </header>

        {/* GPU Benchmark Cards */}
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
            GPU別性能ベンチマーク
          </h2>

          {gpuOrder.map((gpuKey) => {
            const data = BENCHMARKS[gpuKey];
            return (
              <div
                key={gpuKey}
                style={{
                  marginBottom: 32,
                  padding: 24,
                  background: 'rgba(255,255,255,.02)',
                  border: '1px solid rgba(255,255,255,.08)',
                  borderRadius: 12,
                }}
              >
                {/* GPU Header */}
                <div style={{marginBottom: 20}}>
                  <h3
                    style={{
                      fontSize: 'clamp(16px, 2vw, 20px)',
                      fontWeight: 900,
                      color: T.c,
                      margin: '0 0 8px',
                    }}
                  >
                    {data.gpu}
                  </h3>
                  <div style={{display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: 'rgba(255,255,255,.6)'}}>
                    <span>
                      <span style={{fontWeight: 700, color: 'rgba(255,255,255,.8)'}}>ティア:</span> {data.tier}
                    </span>
                    <span>
                      <span style={{fontWeight: 700, color: 'rgba(255,255,255,.8)'}}>VRAM:</span> {data.vram}
                    </span>
                    <span>
                      <span style={{fontWeight: 700, color: 'rgba(255,255,255,.8)'}}>TDP:</span> {data.tdp}
                    </span>
                  </div>
                </div>

                {/* Performance Table */}
                <div style={{overflowX: 'auto', marginBottom: 16}}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: 13,
                      minWidth: 400,
                    }}
                  >
                    <thead>
                      <tr style={{borderBottom: '2px solid rgba(255,255,255,.1)'}}>
                        <th
                          style={{
                            padding: '12px 16px',
                            textAlign: 'left',
                            fontWeight: 800,
                            color: 'rgba(255,255,255,.7)',
                            fontSize: 11,
                          }}
                        >
                          タイトル
                        </th>
                        <th style={{padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: 11}}>
                          FHD
                        </th>
                        <th style={{padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: 11}}>
                          WQHD
                        </th>
                        <th style={{padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: 11}}>
                          4K
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.games.map((game, idx) => (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: '1px solid rgba(255,255,255,.06)',
                            backgroundColor: idx % 2 === 0 ? 'rgba(255,255,255,.01)' : 'transparent',
                          }}
                        >
                          <td style={{padding: '12px 16px', fontWeight: 600}}>{game.title}</td>
                          <td
                            style={{
                              padding: '12px 16px',
                              textAlign: 'center',
                              background: fpsBgColor(game.fhd),
                              color: fpsTextColor(game.fhd),
                              fontWeight: 700,
                              borderRadius: 4,
                            }}
                          >
                            {game.fhd}fps
                          </td>
                          <td
                            style={{
                              padding: '12px 16px',
                              textAlign: 'center',
                              background: fpsBgColor(game.wqhd),
                              color: fpsTextColor(game.wqhd),
                              fontWeight: 700,
                              borderRadius: 4,
                            }}
                          >
                            {game.wqhd}fps
                          </td>
                          <td
                            style={{
                              padding: '12px 16px',
                              textAlign: 'center',
                              background: fpsBgColor(game.uhd4k),
                              color: fpsTextColor(game.uhd4k),
                              fontWeight: 700,
                              borderRadius: 4,
                            }}
                          >
                            {game.uhd4k}fps
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Assessment */}
                <div style={{fontSize: 13, color: 'rgba(255,255,255,.7)', lineHeight: 1.7}}>
                  {gpuKey === 'RTX 5060' && (
                    <p style={{margin: 0}}>
                      FHD/WQHDで144fps以上を達成。エントリー層向けの定番GPU。4Kは設定調整が必要。カジュアルゲーマーに最適。
                    </p>
                  )}
                  {gpuKey === 'RTX 5070' && (
                    <p style={{margin: 0}}>
                      WQHDで144fps以上を安定達成。4Kでも一部ゲームが可能。コストパフォーマンスに優れた主流GPU。
                    </p>
                  )}
                  {gpuKey === 'RTX 5070 Ti' && (
                    <p style={{margin: 0}}>
                      4Kゲーミングへの対応が本格化。配信+ゲームの並行に向く。e-sports・ストリーマー向けの高コスパ選択肢。
                    </p>
                  )}
                  {gpuKey === 'RTX 5080' && (
                    <p style={{margin: 0}}>
                      4K環境で安定したゲーミングが可能。最高設定での余裕が生まれる。クリエイティブ作業との組み合わせに最適。
                    </p>
                  )}
                  {gpuKey === 'RTX 5090' && (
                    <p style={{margin: 0}}>
                      全解像度・全ゲームで圧倒的性能。4K最高設定での安定プレイ。配信・3DCG制作などプロ向け。
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* GPU Comparison Chart */}
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
            GPU相対性能チャート（FHD平均fps）
          </h2>

          <div style={{padding: 24, background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12}}>
            {gpuOrder.map((gpuKey) => {
              const data = BENCHMARKS[gpuKey];
              const avgFhd = Math.round(data.games.reduce((sum, g) => sum + g.fhd, 0) / data.games.length);
              const widthPercent = (avgFhd / maxFhd) * 100;
              return (
                <div key={gpuKey} style={{marginBottom: 20}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12}}>
                    <span style={{fontWeight: 700, color: 'rgba(255,255,255,.8)'}}>{data.gpu}</span>
                    <span style={{color: T.c, fontWeight: 700}}>{avgFhd}fps</span>
                  </div>
                  <div
                    style={{
                      height: 28,
                      background: 'rgba(255,255,255,.05)',
                      borderRadius: 6,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${widthPercent}%`,
                        background: `linear-gradient(90deg, ${T.c}, ${T.g})`,
                        transition: 'width 0.3s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        paddingRight: widthPercent > 20 ? 8 : 0,
                      }}
                    >
                      {widthPercent > 25 && <span style={{fontSize: 11, fontWeight: 700, color: T.bg}}>+{avgFhd}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 16,
              fontSize: 12,
              color: 'rgba(255,255,255,.5)',
              fontStyle: 'italic',
            }}
          >
            ※ 平均値 = （Apex + VALORANT + Fortnite） / 3。各ゲームの計測環境は同一条件。
          </div>
        </section>

        {/* Use Case Recommendations */}
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
            用途別GPU推奨ガイド
          </h2>

          {/* Desktop Table */}
          <div style={{overflowX: 'auto', marginBottom: 24}}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
                backgroundColor: 'rgba(255,255,255,.02)',
                border: '1px solid rgba(255,255,255,.08)',
                minWidth: 500,
              }}
            >
              <thead>
                <tr style={{backgroundColor: 'rgba(0,240,255,.08)', borderBottom: '2px solid rgba(0,240,255,.2)'}}>
                  <th style={{padding: '16px', textAlign: 'left', fontWeight: 800, color: T.c, minWidth: 150}}>
                    用途
                  </th>
                  <th style={{padding: '16px', textAlign: 'left', fontWeight: 800, color: T.c, minWidth: 130}}>
                    推奨GPU
                  </th>
                  <th style={{padding: '16px', textAlign: 'left', fontWeight: 700, color: 'rgba(255,255,255,.7)'}}>
                    理由
                  </th>
                </tr>
              </thead>
              <tbody>
                {RECOMMENDATIONS.map((rec, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,.06)',
                      backgroundColor: i % 2 === 0 ? 'rgba(255,255,255,.02)' : 'transparent',
                    }}
                  >
                    <td style={{padding: '14px 16px', fontWeight: 700, color: 'rgba(255,255,255,.9)'}}>{rec.use}</td>
                    <td style={{padding: '14px 16px', color: T.c, fontWeight: 600}}>{rec.gpu}</td>
                    <td style={{padding: '14px 16px', color: 'rgba(255,255,255,.7)'}}>{rec.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16}}>
            {RECOMMENDATIONS.map((rec, i) => (
              <div
                key={i}
                style={{
                  padding: 20,
                  background: 'linear-gradient(135deg, rgba(0,240,255,.08), rgba(255,179,0,.04))',
                  border: '1px solid rgba(0,240,255,.15)',
                  borderRadius: 12,
                }}
              >
                <div style={{fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', marginBottom: 6}}>用途</div>
                <h3 style={{fontSize: 15, fontWeight: 800, color: T.tx, margin: '0 0 8px'}}>
                  {rec.use}
                </h3>
                <div style={{fontSize: 13, color: T.c, fontWeight: 700, marginBottom: 8}}>{rec.gpu}</div>
                <p style={{fontSize: 12, color: 'rgba(255,255,255,.6)', lineHeight: 1.6, margin: 0}}>
                  {rec.reason}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Color Legend */}
        <section style={{marginBottom: 56}}>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'rgba(255,255,255,.7)',
              marginBottom: 12,
            }}
          >
            FPS色分けガイド
          </h3>
          <div style={{display: 'flex', gap: 16, flexWrap: 'wrap'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
              <div style={{width: 20, height: 20, background: '#00FF8844', borderRadius: 4}} />
              <span style={{fontSize: 12, color: 'rgba(255,255,255,.7)'}}>144fps以上 — ハイフレームレート対応</span>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
              <div style={{width: 20, height: 20, background: '#FFB30044', borderRadius: 4}} />
              <span style={{fontSize: 12, color: 'rgba(255,255,255,.7)'}}>60〜143fps — 安定ゲーミング対応</span>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
              <div style={{width: 20, height: 20, background: '#FF2D5544', borderRadius: 4}} />
              <span style={{fontSize: 12, color: 'rgba(255,255,255,.7)'}}>60fps未満 — 設定調整推奨</span>
            </div>
          </div>
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
            自分に最適なGPUを選択しよう
          </h2>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.8)',
              lineHeight: 1.8,
              margin: '0 0 16px',
            }}
          >
            GPUの選択はゲーミング体験を大きく左右します。このベンチマークデータを参考に、プレイするゲーム・解像度・フレームレート目標に合わせて、最適なGPUを選択してください。
          </p>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.8)',
              lineHeight: 1.8,
              margin: 0,
            }}
          >
            ASTROMEDAなら、RTX 5060から5090まで、幅広いGPUラインナップから自分に最適な1台を見つけられます。
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
              to="/guides/how-to-choose"
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
              GPU選択ガイドへ →
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
