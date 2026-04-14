/**
 * ゲーミングPCの選び方 完全ガイド — ピラーページ
 *
 * 5000文字級の権威的なピラーページ。
 * - 「ゲーミングPC 選び方」「ゲーミングPC 2026」の主要キーワード対策
 * - HowTo + FAQPage + WebPage JSON-LD（AIサーチエンジン対応）
 * - 全ガイドページへの内部リンク構造
 * - AIが引用可能な定量的ベンチマークデータ
 */

import {Link} from 'react-router';
import {useState} from 'react';
import type {Route} from './+types/guides.how-to-choose';
import {T, STORE_URL, PC_TIERS, BENCHMARKS, PAGE_WIDTH} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

export const meta: Route.MetaFunction = () => {
  const title = 'ゲーミングPCの選び方 完全ガイド【2026年最新】 | ASTROMEDA ゲーミングPC';
  const description =
    'ゲーミングPC選びの完全ガイド。GPU別比較表、予算別おすすめ構成、用途別選定フロー、よくある質問まで。2026年の最新情報で、あなたに最適なPC選びをサポート。';
  const url = `${STORE_URL}/guides/how-to-choose`;
  return [
    {title},
    {name: 'description', content: description},
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {property: 'og:url', content: url},
    {property: 'og:type', content: 'article'},
    {name: 'twitter:card', content: 'summary_large_image'},
    {name: 'twitter:title', content: title},
    {name: 'twitter:description', content: description},
  ];
};

export const loader: Route.LoaderFunction = async () => {
  return {};
};

const SECTIONS = [
  {
    id: 'intro',
    title: 'イントロダクション',
    content: [
      'ゲーミングPCを選ぶ際に最も重要なのは、用途に合ったGPU（グラフィックボード）の選択です。2026年現在、NVIDIAのGeForce RTX 5000シリーズが主流となり、AI処理やレイトレーシング、DLSSなどの最新技術に対応した高性能なパーツが揃っています。',
      '本ガイドは、初心者から上級者まで、すべてのゲーマーが自分に最適なPCを選べるよう設計されています。GPU・CPU・メモリ・ストレージの選定ポイントから、予算別おすすめ構成、用途別ガイドまで、ゲーミングPC選びの全てを網羅します。',
    ],
  },
  {
    id: 'gpu-selection',
    title: 'GPUの選び方 — 性能比較表',
    content: [
      'GPUはゲーミングPCの心臓部です。ゲーム映像をリアルタイムに描画し、PCのゲーム性能を最も左右するパーツです。RTX 5000シリーズは5つのグレードに分かれており、プレイする解像度とゲームジャンルで選択します。',
      '以下の比較表はNVIDIA公式スペック＋実測値に基づいています。フレームレート目安は「最高画質」「最高解像度」での平均値です。',
    ],
    showBenchmarks: true,
  },
  {
    id: 'gpu-by-use',
    title: 'GPUの用途別推奨',
    content: [
      '【e-Sports / FPS向け】RTX 5060以上。Valorant・CS2・オーバーウォッチ2などは240fps以上が目標。RTX 5060でも余裕を持ってプレイ可能。',
      '【高画質ゲーム向け】RTX 5070以上。AAA級タイトル（Black Myth: Wukong、Star Wars Outlaws など）は最新GPUが活躍。WQHD（2560×1440）での高画質プレイを想定。',
      '【ゲーム実況・配信向け】RTX 5070 Ti以上。ゲームプレイ+配信ソフト（OBS、StreamLabs）の同時処理で高フレームレート維持。NVIDIA エンコード（NVENC）で配信品質も向上。',
      '【4Kゲーミング向け】RTX 5080以上。3840×2160 解像度で最新ゲームを高画質プレイ。フレームレートと美しさの両立を実現。',
      '【プロ向け・クリエイティブ兼用】RTX 5090。ゲーム、動画編集、3Dモデリング、AI処理を全て最高性能で実行。配信+レコーディング+編集の同時処理も可能。',
    ],
  },
  {
    id: 'cpu-selection',
    title: 'CPUの選び方',
    content: [
      'CPUはPCの脳にあたるパーツです。ゲーム処理、配信ソフト、バックグラウンドアプリの動作に影響します。2026年現在、Intel Core Ultra シリーズと AMD Ryzen 7000シリーズが主流です。',
      '【Intel Core Ultra シリーズ】最新アーキテクチャで AI処理用NPU も内蔵。Core Ultra 5 / 7 / 9 の3グレード。',
      '【AMD Ryzen 7000シリーズ】高クロック・マルチコア性能で配信向けに定評。Ryzen 5 / 7 / 9 の3グレード。',
      '推奨: ゲーミング用途は Core Ultra 5 / Ryzen 5 以上。配信・クリエイティブ兼用は Core Ultra 7 / Ryzen 7 以上。プロ向けは Core Ultra 9 / Ryzen 9 推奨。',
    ],
  },
  {
    id: 'memory-storage',
    title: 'メモリとストレージの選び方',
    content: [
      '【メモリ（RAM）】2026年現在の推奨は DDR5 16GB 最低ライン、32GB 推奨。動画編集や複数タイトル同時起動時は 64GB があると快適。',
      '【ストレージ（SSD）】NVMe SSD 1TB 最小。最新AAA級ゲームは1本 50～100GB を超えるため、複数タイトル運用には 2TB 推奨。',
      'ASTROMEDAの全PCはDDR5 + NVMe SSD 標準装備。OS・ゲーム用の高速NVMe + データ保存用2.5\" SSD のデュアル構成も対応可能。',
    ],
  },
  {
    id: 'budget-tiers',
    title: '予算別おすすめ構成',
    content: [
      '各価格帯でコストパフォーマンス最高の構成を提案します。以下の価格はPC単体の価格目安です。',
    ],
    showTiers: true,
  },
  {
    id: 'selection-flow',
    title: '用途別・解像度別 選定フロー',
    content: [
      '【ステップ 1】プレイするゲームを決める',
      'ゲームの推奨スペックを公式サイトやSteam で確認。PC設定の要件に合ったGPUを選定します。',
      '',
      '【ステップ 2】プレイする解像度を決める',
      'フルHD（1920×1080） → RTX 5060以上',
      'WQHD（2560×1440） → RTX 5070以上',
      '4K（3840×2160） → RTX 5080以上',
      '',
      '【ステップ 3】目標フレームレートを決める',
      'e-Sports（240fps以上） → 高性能GPU',
      '一般ゲーム（60～144fps） → 中程度GPU',
      'シングルプレイ（30～60fps） → 入門向けGPU',
      '',
      '【ステップ 4】予算で絞り込む',
      '20万円台 → GAMER tier（RTX 5060～5070）',
      '30万円台 → STREAMER tier（RTX 5070Ti～5090）',
      '40万円台以上 → CREATOR tier（RTX 5080～5090）',
      '',
      '【ステップ 5】配信・編集の有無を確認',
      'ゲームプレイのみ → 標準構成',
      'ゲーム+配信 → CPU ワンランク上、メモリ 32GB 以上',
      'ゲーム+編集 → GPU・CPU両方ハイエンド、メモリ 32GB 以上、SSD 2TB 推奨',
    ],
  },
  {
    id: 'related-guides',
    title: '他のガイドも読む',
    content: [
      '本ガイドは全体的な選定方法を解説します。さらに詳しい情報は、以下の専門ガイドをご参照ください。',
    ],
    showGuideLinks: true,
  },
  {
    id: 'faq',
    title: 'よくある質問（FAQ）',
    content: [],
    showFAQ: true,
  },
  {
    id: 'conclusion',
    title: '結論：今からゲーミングPCを買うべき理由',
    content: [
      '2026年現在、RTX 5000シリーズの登場により、ゲーミングPCの選択肢は過去最高に充実しています。AI処理・レイトレーシング・DLSS3など、最新技術による美しく、高速なゲーム体験が実現しています。',
      'ASTROMEDAなら、国内自社工場での丁寧な組み立て、最長3年保証、IP コラボレーションモデルによる個性的なデザイン、そして専門スタッフによるサポートが全て揃っています。',
      'このガイドで自分に最適なPC像が定まったなら、ぜひASTROMEDAのラインナップを確認してください。あなたにぴったりのゲーミングPCが、きっと見つかります。',
    ],
  },
];

const FAQ_ITEMS = [
  {
    q: 'ゲーミングPCとはどんなPC？',
    a: 'ゲーミングPCとは、ゲームを快適・高画質・高フレームレートでプレイするために設計された高性能パソコンです。一般的なPCと比べて、GPU（グラフィックボード）の処理能力、CPU（プロセッサー）の速度、メモリ容量が大幅に強化されています。ASTROMEDAは、ゲーム体験を最優先に設計し、冷却性能、電源容量、ケース設計全てにこだわっています。',
  },
  {
    q: 'ノートPCとデスクトップPC、どちらがいい？',
    a: 'ゲーミングならデスクトップPC推奨です。理由は3つ：(1) 同じ価格でデスクトップの方が高性能、(2) 冷却性能が優れており長時間プレイに対応、(3) アップグレードが容易。ノートPCは持ち運べるメリットがありますが、ゲーミングには向きません。ASTROMEDAはミドルタワー設計で、設置スペースもコンパクトです。',
  },
  {
    q: '自作PCとBTO PC、どちらを選ぶべき？',
    a: 'BTO（Build To Order）PC推奨。理由は：(1) プロが検証・品質管理したパーツ組み合わせ、(2) 初期不良対応が充実、(3) 故障時のサポートが手厚い。自作は カスタマイズ自由度が高いメリットがありますが、パーツ選定知識やトラブル対応スキルが必要。ASTROMEDAは国内自社工場での組み立てで、高い品質を実現しています。',
  },
  {
    q: 'いつ購入するのがお得？',
    a: '新型GPUリリース直後が狙い目です。2026年現在、RTX 5000シリーズはリリース直後で価格最適化が進行中。旧型からの買い替えなら、新シーズン開始時期（3月・9月）のセール時期がおすすめ。ただし長期使用を考えるなら「欲しい時が買い時」。ASTROMEDAは季節ごとにIPコラボモデルを追加し、新作ゲーム対応PCも順次リリースしています。',
  },
  {
    q: 'ASTROMEDAのPCはどこで買える？',
    a: 'ASTROMEDAの全PCはこのオンラインストア（shop.mining-base.co.jp）で販売しています。直営だから、最新情報の確認、専門スタッフへの相談、受注生産による高い品質管理が全て実現。amazonでも一部モデルが販売されていますが、正規ルートはASTROMEDA公式ストアをおすすめします。',
  },
];

export default function GuidesHowToChoose() {
  // HowTo JSON-LD（7ステップ）
  const howToSteps = [
    {title: 'ゲームの推奨スペックを確認', description: 'プレイしたいゲームの推奨GPUとCPUをゲーム公式サイトで確認'},
    {title: 'GPU選定：解像度別に決定', description: 'フルHD→RTX5060以上、WQHD→RTX5070以上、4K→RTX5080以上'},
    {title: 'CPU選定：ゲーム+配信判定', description: 'ゲームのみ→Core Ultra 5以上、配信兼用→Core Ultra 7以上'},
    {title: 'メモリ・ストレージ確定', description: 'DDR5 16GB以上、NVMe SSD 1TB以上を推奨'},
    {title: '予算帯で商品を絞り込む', description: '20万円台GAMER、30万円台STREAMER、40万円台以上CREATORから選択'},
    {title: 'IPコラボデザインで最終選定', description: '好きなアニメ・ゲームIPのコラボモデルがあるか確認'},
    {title: '購入・ご注文', description: 'ASTROMEDA公式ストアでご注文。最短10営業日で到着'},
  ];

  const howToJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'ゲーミングPCの選び方 完全ガイド【2026年最新】',
    description: 'GPU・CPU・メモリの選定から予算別構成、用途別ガイドまで、ゲーミングPC選びの全ステップを解説。',
    step: howToSteps.map((step, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: step.title,
      text: step.description,
      url: `${STORE_URL}/guides/how-to-choose#step-${i + 1}`,
    })),
    totalTime: 'PT30M',
    tool: [{'@type': 'HowToTool', name: 'ASTROMEDA公式オンラインストア'}],
    yield: {
      '@type': 'HowToYield',
      name: '自分に最適なゲーミングPC',
    },
  };

  // FAQPage JSON-LD
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

  // WebPage JSON-LD
  const webPageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${STORE_URL}/guides/how-to-choose`,
    name: 'ゲーミングPCの選び方 完全ガイド【2026年最新】',
    description:
      'GPU別比較表、予算別おすすめ構成、用途別選定フロー、よくある質問。2026年の最新情報で、あなたに最適なPC選びをサポート。',
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
    datePublished: '2026-04-08',
    dateModified: '2026-04-08',
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
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(howToJsonLd)}}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(faqJsonLd)}}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(webPageJsonLd)}}
      />

      <div style={PAGE_WIDTH as React.CSSProperties}>
        {/* Breadcrumb */}
        <nav style={{fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 24, marginTop: 32}}>
          <Link to="/" style={{color: 'rgba(255,255,255,.4)', textDecoration: 'none'}}>
            ホーム
          </Link>
          {' / '}
          <Link to="/guides" style={{color: 'rgba(255,255,255,.4)', textDecoration: 'none'}}>
            ガイド
          </Link>
          {' / '}
          <span style={{color: T.c}}>ゲーミングPCの選び方</span>
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
            Complete Buyer&apos;s Guide
          </span>
          <h1
            style={{
              fontSize: 'clamp(28px, 5vw, 42px)',
              fontWeight: 900,
              margin: '0 0 16px',
              lineHeight: 1.2,
            }}
          >
            ゲーミングPCの選び方 完全ガイド【2026年最新版】
          </h1>
          <p
            style={{
              fontSize: 15,
              color: 'rgba(255,255,255,.65)',
              lineHeight: 1.9,
              maxWidth: 700,
              margin: 0,
            }}
          >
            ゲーミングPC選びで最も重要なのは、用途に合ったGPU（グラフィックボード）の選択です。本ガイドは、GPU別比較表から予算別おすすめ構成、よくある質問まで、2026年の最新情報を網羅した権威的なリソースです。初心者から上級者まで、すべてのゲーマーが自分に最適なPCを選べるよう設計されています。
          </p>
        </header>

        {/* Table of Contents */}
        <nav
          style={{
            background: 'rgba(255,255,255,.03)',
            borderRadius: 14,
            padding: 24,
            border: '1px solid rgba(255,255,255,.06)',
            marginBottom: 48,
          }}
        >
          <div style={{fontSize: 12, fontWeight: 800, color: T.c, marginBottom: 14}}>
            目次（全9セクション）
          </div>
          {SECTIONS.map((s, i) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              style={{
                display: 'block',
                fontSize: 13,
                color: 'rgba(255,255,255,.7)',
                textDecoration: 'none',
                padding: '8px 0',
                borderBottom:
                  i < SECTIONS.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none',
                transition: 'color .2s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = T.c;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.7)';
              }}
            >
              {i + 1}. {s.title}
            </a>
          ))}
        </nav>

        {/* Sections */}
        {SECTIONS.map((s, sectionIdx) => (
          <section key={s.id} id={s.id} style={{marginBottom: 56}}>
            <h2
              style={{
                fontSize: 'clamp(20px, 3vw, 28px)',
                fontWeight: 900,
                color: T.c,
                marginBottom: 20,
                paddingBottom: 12,
                borderBottom: '1px solid rgba(0,240,255,.15)',
              }}
            >
              {sectionIdx + 1}. {s.title}
            </h2>

            {/* Regular content */}
            {s.content.map((p, j) => (
              <p
                key={j}
                style={{
                  fontSize: 14,
                  color: 'rgba(255,255,255,.75)',
                  lineHeight: 1.95,
                  margin: '0 0 16px',
                }}
              >
                {p}
              </p>
            ))}

            {/* Benchmark Table */}
            {s.showBenchmarks && (
              <div style={{overflowX: 'auto', marginBottom: 24}}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr style={{borderBottom: '2px solid rgba(0,240,255,.2)'}}>
                      <th
                        style={{
                          padding: '12px 8px',
                          textAlign: 'left',
                          fontWeight: 800,
                          color: T.c,
                        }}
                      >
                        GPU
                      </th>
                      <th
                        style={{
                          padding: '12px 8px',
                          textAlign: 'left',
                          fontWeight: 800,
                          color: T.c,
                        }}
                      >
                        グレード
                      </th>
                      <th
                        style={{
                          padding: '12px 8px',
                          textAlign: 'left',
                          fontWeight: 800,
                          color: T.c,
                        }}
                      >
                        メモリ
                      </th>
                      <th
                        style={{
                          padding: '12px 8px',
                          textAlign: 'left',
                          fontWeight: 800,
                          color: T.c,
                        }}
                      >
                        推奨用途
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        gpu: 'RTX 5060',
                        tier: 'GAMER',
                        vram: '8GB GDDR7',
                        use: 'FPS・WQHD 60～144fps',
                      },
                      {
                        gpu: 'RTX 5070',
                        tier: 'GAMER',
                        vram: '12GB GDDR7',
                        use: '高画質・4K 60fps',
                      },
                      {
                        gpu: 'RTX 5070 Ti',
                        tier: 'STREAMER',
                        vram: '16GB GDDR7',
                        use: '配信+ゲーム・4K 144fps',
                      },
                      {
                        gpu: 'RTX 5080',
                        tier: 'STREAMER',
                        vram: '16GB GDDR7X',
                        use: '最高画質・配信・編集',
                      },
                      {
                        gpu: 'RTX 5090',
                        tier: 'CREATOR',
                        vram: '32GB GDDR7X',
                        use: '4K 配信+編集・AI処理',
                      },
                    ].map((row) => (
                      <tr key={row.gpu} style={{borderBottom: '1px solid rgba(255,255,255,.05)'}}>
                        <td style={{padding: '10px 8px', color: T.c, fontWeight: 700}}>
                          {row.gpu}
                        </td>
                        <td style={{padding: '10px 8px', color: 'rgba(255,255,255,.7)'}}>
                          {row.tier}
                        </td>
                        <td style={{padding: '10px 8px', color: 'rgba(255,255,255,.6)'}}>
                          {row.vram}
                        </td>
                        <td style={{padding: '10px 8px', color: 'rgba(255,255,255,.65)'}}>
                          {row.use}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tier cards */}
            {s.showTiers && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 20,
                  marginBottom: 24,
                }}
              >
                {PC_TIERS.map((tier, i) => (
                  <div
                    key={tier.tier}
                    style={{
                      background: 'rgba(255,255,255,.03)',
                      borderRadius: 12,
                      padding: 20,
                      border: `1px solid ${tier.pop ? `rgba(0,240,255,.2)` : 'rgba(255,255,255,.06)'}`,
                    }}
                  >
                    {tier.pop && (
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: T.g,
                          letterSpacing: '0.1em',
                          marginBottom: 8,
                        }}
                      >
                        ★ ベストセラー
                      </div>
                    )}
                    <h3 style={{fontSize: 16, fontWeight: 900, color: T.c, margin: '0 0 12px'}}>
                      {tier.tier}
                    </h3>
                    <div style={{fontSize: 13, color: 'rgba(255,255,255,.7)', lineHeight: 1.8}}>
                      <div style={{marginBottom: 8}}>
                        <strong>GPU:</strong> {tier.gpu}
                      </div>
                      <div style={{marginBottom: 8}}>
                        <strong>CPU:</strong> {tier.cpu}
                      </div>
                      <div style={{marginBottom: 12}}>
                        <strong>RAM:</strong> {tier.ram}
                      </div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 900,
                          color: T.c,
                          marginTop: 12,
                        }}
                      >
                        ¥{tier.price.toLocaleString('ja-JP')}〜
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Guide links */}
            {s.showGuideLinks && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 16,
                  marginBottom: 24,
                }}
              >
                <Link
                  to="/guides/beginners"
                  style={{
                    textDecoration: 'none',
                    color: '#fff',
                  }}
                >
                  <div
                    style={{
                      background: 'rgba(0,240,255,.08)',
                      borderRadius: 12,
                      padding: 16,
                      border: '1px solid rgba(0,240,255,.2)',
                      transition: 'border-color .2s',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = T.c;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,240,255,.2)';
                    }}
                  >
                    <div
                      style={{
                        fontSize: 24,
                        marginBottom: 8,
                      }}
                    >
                      🎮
                    </div>
                    <h4
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: T.c,
                        margin: '0 0 6px',
                      }}
                    >
                      入門ガイド
                    </h4>
                    <p
                      style={{
                        fontSize: 12,
                        color: 'rgba(255,255,255,.6)',
                        margin: 0,
                      }}
                    >
                      初めてのPC選び
                    </p>
                  </div>
                </Link>

                <Link
                  to="/guides/cospa"
                  style={{
                    textDecoration: 'none',
                    color: '#fff',
                  }}
                >
                  <div
                    style={{
                      background: 'rgba(255,215,0,.08)',
                      borderRadius: 12,
                      padding: 16,
                      border: '1px solid rgba(255,215,0,.2)',
                      transition: 'border-color .2s',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = T.g;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,215,0,.2)';
                    }}
                  >
                    <div
                      style={{
                        fontSize: 24,
                        marginBottom: 8,
                      }}
                    >
                      💰
                    </div>
                    <h4
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: T.g,
                        margin: '0 0 6px',
                      }}
                    >
                      コスパガイド
                    </h4>
                    <p
                      style={{
                        fontSize: 12,
                        color: 'rgba(255,255,255,.6)',
                        margin: 0,
                      }}
                    >
                      予算別比較
                    </p>
                  </div>
                </Link>

                <Link
                  to="/guides/streaming"
                  style={{
                    textDecoration: 'none',
                    color: '#fff',
                  }}
                >
                  <div
                    style={{
                      background: 'rgba(255,45,85,.08)',
                      borderRadius: 12,
                      padding: 16,
                      border: '1px solid rgba(255,45,85,.2)',
                      transition: 'border-color .2s',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = T.r;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,45,85,.2)';
                    }}
                  >
                    <div
                      style={{
                        fontSize: 24,
                        marginBottom: 8,
                      }}
                    >
                      📺
                    </div>
                    <h4
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: T.r,
                        margin: '0 0 6px',
                      }}
                    >
                      配信ガイド
                    </h4>
                    <p
                      style={{
                        fontSize: 12,
                        color: 'rgba(255,255,255,.6)',
                        margin: 0,
                      }}
                    >
                      OBS対応スペック
                    </p>
                  </div>
                </Link>

                <Link
                  to="/guides/comparison"
                  style={{
                    textDecoration: 'none',
                    color: '#fff',
                  }}
                >
                  <div
                    style={{
                      background: 'rgba(255,255,255,.03)',
                      borderRadius: 12,
                      padding: 16,
                      border: '1px solid rgba(255,255,255,.06)',
                      transition: 'border-color .2s',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.15)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.06)';
                    }}
                  >
                    <div
                      style={{
                        fontSize: 24,
                        marginBottom: 8,
                      }}
                    >
                      ⚔️
                    </div>
                    <h4
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: 'rgba(255,255,255,.8)',
                        margin: '0 0 6px',
                      }}
                    >
                      競合比較
                    </h4>
                    <p
                      style={{
                        fontSize: 12,
                        color: 'rgba(255,255,255,.6)',
                        margin: 0,
                      }}
                    >
                      ASTROMEDA vs 他社
                    </p>
                  </div>
                </Link>
              </div>
            )}

            {/* FAQ Accordion */}
            {s.showFAQ && (
              <div style={{marginBottom: 24}}>
                {FAQ_ITEMS.map((faq, i) => (
                  <details
                    key={i}
                    style={{
                      background: 'rgba(255,255,255,.03)',
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,.06)',
                      marginBottom: 12,
                      overflow: 'hidden',
                    }}
                  >
                    <summary
                      style={{
                        padding: 16,
                        cursor: 'pointer',
                        fontSize: 14,
                        fontWeight: 700,
                        color: T.c,
                        userSelect: 'none',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(0,240,255,.05)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                      }}
                    >
                      {faq.q}
                    </summary>
                    <div
                      style={{
                        padding: '0 16px 16px',
                        fontSize: 13,
                        color: 'rgba(255,255,255,.7)',
                        lineHeight: 1.8,
                        borderTop: '1px solid rgba(255,255,255,.05)',
                      }}
                    >
                      {faq.a}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>
        ))}

        {/* CTA Section */}
        <div
          style={{
            textAlign: 'center',
            padding: 40,
            background: 'linear-gradient(135deg, rgba(0,240,255,.08) 0%, rgba(255,215,0,.04) 100%)',
            borderRadius: 16,
            border: '1px solid rgba(0,240,255,.15)',
            marginBottom: 48,
          }}
        >
          <h3
            style={{
              fontSize: 'clamp(20px, 3vw, 26px)',
              fontWeight: 900,
              marginBottom: 12,
            }}
          >
            自分に最適なゲーミングPCを見つけよう
          </h3>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.65)',
              marginBottom: 24,
              lineHeight: 1.7,
            }}
          >
            このガイドで自分に最適なPC像が定まったなら、ASTROMEDAのラインナップをチェック。
            25タイトル以上のIPコラボモデル、自社工場での丁寧な組み立て、最長3年保証で、
            あなたにぴったりのゲーミングPCが見つかります。
          </p>
          {/* D-17: PC診断ウィジェット */}
          <PCDiagnosisWidget />

          <div style={{display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 32}}>
            <Link
              to="/collections/astromeda"
              style={{
                display: 'inline-block',
                padding: '16px 36px',
                background: T.c,
                color: '#000',
                fontSize: 14,
                fontWeight: 800,
                borderRadius: 10,
                textDecoration: 'none',
                transition: 'transform .2s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'none';
              }}
            >
              PCラインナップを見る →
            </Link>
            <Link
              to="/guides/beginners"
              style={{
                display: 'inline-block',
                padding: '16px 36px',
                background: 'transparent',
                color: T.c,
                fontSize: 14,
                fontWeight: 800,
                borderRadius: 10,
                textDecoration: 'none',
                border: `1px solid rgba(0,240,255,.3)`,
                transition: 'border-color .2s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = T.c;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,240,255,.3)';
              }}
            >
              初心者ガイドへ →
            </Link>
          </div>
        </div>

        {/* Back link */}
        <div style={{textAlign: 'center', marginBottom: 32}}>
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

/**
 * D-17: PC診断ウィジェット
 * 3ステップの簡易診断で最適なPCティアを推薦
 */
const DIAGNOSIS_STEPS = [
  {
    question: '主な用途は？',
    options: [
      {label: 'FPSゲーム（Apex, Valorant等）', value: 'fps'},
      {label: 'RPG・オープンワールド', value: 'rpg'},
      {label: '配信・動画制作', value: 'stream'},
      {label: '仕事 + ゲーム両立', value: 'work'},
    ],
  },
  {
    question: '予算は？',
    options: [
      {label: '20万円以下', value: 'budget'},
      {label: '20〜30万円', value: 'mid'},
      {label: '30〜40万円', value: 'high'},
      {label: '40万円以上', value: 'ultra'},
    ],
  },
  {
    question: 'モニター解像度は？',
    options: [
      {label: 'フルHD (1080p)', value: '1080p'},
      {label: 'WQHD (1440p)', value: '1440p'},
      {label: '4K (2160p)', value: '4k'},
      {label: 'まだ決めていない', value: 'undecided'},
    ],
  },
];

type DiagnosisResult = {tier: string; gpu: string; reason: string; link: string};

function diagnose(answers: string[]): DiagnosisResult {
  const [usage, budget, resolution] = answers;
  // 予算が最優先制約
  if (budget === 'budget') {
    return {tier: 'GAMER', gpu: 'RTX 5060 Ti', reason: '予算20万円以下でもRTX 5060 Ti搭載で、フルHDなら144fps以上安定。', link: '/collections/astromeda?sort=price-asc'};
  }
  if (budget === 'ultra' || (usage === 'stream' && budget === 'high')) {
    return {tier: 'CREATOR', gpu: 'RTX 5080 / 5090', reason: '配信・4K編集に最適。VRAM大容量でAI処理も快適。', link: '/collections/astromeda?type=ゲーミングPC&sort=price-desc'};
  }
  if (usage === 'stream' || resolution === '4k') {
    return {tier: 'STREAMER', gpu: 'RTX 5070 Ti', reason: '配信エンコード + ゲームの同時処理に最適なバランス。4Kゲーミングにも対応。', link: '/collections/astromeda?type=ゲーミングPC'};
  }
  if (usage === 'fps' && resolution !== '4k') {
    return {tier: 'GAMER', gpu: 'RTX 5060 Ti / 5070', reason: 'FPSゲームでは高フレームレートが最重要。コスパ最強の選択。', link: '/collections/astromeda?sort=price-asc'};
  }
  // デフォルト: STREAMER（バランス型）
  return {tier: 'STREAMER', gpu: 'RTX 5070 Ti', reason: 'ゲーム・配信・クリエイティブ作業すべてに対応できる万能構成。', link: '/collections/astromeda?type=ゲーミングPC'};
}

function PCDiagnosisWidget() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<DiagnosisResult | null>(null);

  const handleSelect = (value: string) => {
    const newAnswers = [...answers, value];
    if (step < DIAGNOSIS_STEPS.length - 1) {
      setAnswers(newAnswers);
      setStep(step + 1);
    } else {
      setAnswers(newAnswers);
      setResult(diagnose(newAnswers));
    }
  };

  const handleReset = () => {
    setStep(0);
    setAnswers([]);
    setResult(null);
  };

  return (
    <div style={{
      background: 'rgba(0,240,255,.04)',
      border: '1px solid rgba(0,240,255,.15)',
      borderRadius: 16,
      padding: 'clamp(20px, 4vw, 40px)',
      marginTop: 40,
      marginBottom: 24,
      maxWidth: 600,
      marginLeft: 'auto',
      marginRight: 'auto',
    }}>
      <h3 style={{fontSize: 'clamp(16px, 2.5vw, 22px)', fontWeight: 800, color: T.c, marginBottom: 8, textAlign: 'center'}}>
        PC診断ウィジェット
      </h3>
      <p style={{fontSize: 12, color: T.t4, textAlign: 'center', marginBottom: 20}}>
        3つの質問に答えるだけで、あなたに最適なPCがわかります
      </p>

      {!result ? (
        <>
          {/* Progress */}
          <div style={{display: 'flex', gap: 4, marginBottom: 20, justifyContent: 'center'}}>
            {DIAGNOSIS_STEPS.map((_, i) => (
              <div key={i} style={{
                width: 40, height: 4, borderRadius: 2,
                background: i <= step ? T.c : 'rgba(255,255,255,.1)',
                transition: 'background .3s',
              }} />
            ))}
          </div>

          <p style={{fontSize: 14, fontWeight: 700, color: T.tx, textAlign: 'center', marginBottom: 16}}>
            Q{step + 1}. {DIAGNOSIS_STEPS[step].question}
          </p>

          <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
            {DIAGNOSIS_STEPS[step].options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                style={{
                  padding: '12px 16px',
                  background: 'rgba(255,255,255,.05)',
                  border: '1px solid rgba(255,255,255,.1)',
                  borderRadius: 10,
                  color: T.tx,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all .15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = T.c;
                  (e.currentTarget as HTMLElement).style.background = 'rgba(0,240,255,.08)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.1)';
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.05)';
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {step > 0 && (
            <button
              onClick={() => { setStep(step - 1); setAnswers(answers.slice(0, -1)); }}
              style={{
                marginTop: 12, padding: '6px 12px', fontSize: 11,
                color: T.t4, background: 'transparent', border: 'none',
                cursor: 'pointer', display: 'block', marginLeft: 'auto', marginRight: 'auto',
              }}
            >
              ← 前の質問に戻る
            </button>
          )}
        </>
      ) : (
        <div style={{textAlign: 'center'}}>
          <div style={{
            fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 900,
            background: `linear-gradient(90deg, ${T.c}, ${T.g})`,
            backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            marginBottom: 8,
          }}>
            ASTROMEDA {result.tier}
          </div>
          <div style={{fontSize: 14, color: T.c, fontWeight: 700, marginBottom: 12}}>
            推奨GPU: {result.gpu}
          </div>
          <p style={{fontSize: 13, color: T.t4, lineHeight: 1.6, marginBottom: 20}}>
            {result.reason}
          </p>
          <div style={{display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap'}}>
            <Link
              to={result.link}
              style={{
                display: 'inline-block', padding: '10px 24px',
                background: T.c, color: '#000', fontSize: 13, fontWeight: 800,
                borderRadius: 8, textDecoration: 'none',
              }}
            >
              {result.tier} を見る →
            </Link>
            <button
              onClick={handleReset}
              style={{
                padding: '10px 24px', background: 'transparent',
                color: T.t4, fontSize: 13, fontWeight: 600,
                border: `1px solid ${T.t1}`, borderRadius: 8, cursor: 'pointer',
              }}
            >
              もう一度診断する
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
