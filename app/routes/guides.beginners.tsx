/**
 * ゲーミングPC入門ガイド
 *
 * SEO最適化:
 * - 「ゲーミングPC 選び方」「ゲーミングPC 初心者」キーワード対策
 * - HowTo Schema.org 構造化データ
 * - 内部リンク → コレクションページ誘導
 */

import {Link} from 'react-router';
import type {Route} from './+types/guides.beginners';
import {T, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

export const meta: Route.MetaFunction = () => {
  const title = 'ゲーミングPC入門ガイド — 初心者の選び方 | ASTROMEDA ゲーミングPC';
  const description = 'ゲーミングPC初心者向け完全ガイド。GPU・CPU・メモリの違い、予算別おすすめスペック、購入前に知るべきポイントをASTROMEDA専門スタッフが解説。';
  const url = `${STORE_URL}/guides/beginners`;
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

const SECTIONS = [
  {
    id: 'what-is',
    title: 'ゲーミングPCとは？',
    content: [
      'ゲーミングPCとは、ゲームを快適にプレイするために設計された高性能パソコンです。一般的なPCと比較して、グラフィック処理能力（GPU）、処理速度（CPU）、メモリ容量が大幅に強化されています。',
      '最新のゲームを高画質・高フレームレートで楽しむには、これらの各パーツがバランスよく高性能であることが重要です。ASTROMEDAでは、ゲームジャンルや用途に合わせた最適な構成を提案しています。',
    ],
  },
  {
    id: 'gpu',
    title: 'GPU（グラフィックボード）の選び方',
    content: [
      'GPUはゲーミングPCの心臓部です。ゲームの映像をリアルタイムに描画する役割を持ち、PCのゲーム性能を最も左右するパーツです。',
      'NVIDIA GeForce RTXシリーズが現在の主流です。フルHD（1920×1080）であればRTX 5060以上、WQHD（2560×1440）であればRTX 5070以上、4K（3840×2160）であればRTX 5080以上が推奨されます。',
      'レイトレーシング（光の反射をリアルに再現する技術）やDLSS（AIによる画質向上・フレームレート改善）など、最新技術にも対応しているかチェックしましょう。',
    ],
  },
  {
    id: 'cpu',
    title: 'CPU（プロセッサー）の選び方',
    content: [
      'CPUはPCの頭脳にあたるパーツです。ゲーム処理だけでなく、配信ソフトの同時動作やバックグラウンドタスクにも影響します。',
      'Intel Core Ultra / AMD Ryzen シリーズが現在の主流です。Core Ultra 5 / Ryzen 5 以上であれば、ほとんどのゲームを快適にプレイできます。配信やクリエイティブ作業も同時に行う場合は、Core Ultra 7 / Ryzen 7 以上がおすすめです。',
      '世代が新しいほど性能が向上しています。2025年以降はIntelがCore Ultraシリーズに移行しており、AI処理用のNPUも内蔵した最新アーキテクチャです。',
    ],
  },
  {
    id: 'memory',
    title: 'メモリ（RAM）の選び方',
    content: [
      'メモリはPCの「作業台」にあたり、同時に処理できるデータ量を決定します。メモリ不足はカクつきやフリーズの原因になります。',
      '2026年現在のゲームでは16GBが最低ライン、32GBが推奨です。動画編集や配信を同時に行う場合は32GB以上を推奨します。',
      'DDR5メモリが主流です。最新プラットフォームではDDR5が標準となっており、帯域幅・レイテンシともに大幅に改善されています。ASTROMEDAの全モデルはDDR5を採用しています。',
    ],
  },
  {
    id: 'storage',
    title: 'ストレージ（SSD）の選び方',
    content: [
      'ストレージはゲームやOSのデータを保存する場所です。SSD（ソリッドステートドライブ）はHDDと比較してデータの読み書き速度が数十倍速く、ゲームのロード時間を大幅に短縮します。',
      'NVMe SSD 1TB以上を推奨します。最新のAAA級ゲームは1本50〜100GBを超えることもあり、複数タイトルをインストールするには十分な容量が必要です。',
      '予算に余裕がある場合は、OS・ゲーム用のNVMe SSD（1TB）＋データ保存用SSD（2TB）のデュアル構成がおすすめです。',
    ],
  },
  {
    id: 'budget',
    title: '予算別おすすめ構成',
    content: [
      '【20万円台】フルHDゲーミング入門。RTX 5060 + Ryzen 5 / Core Ultra 5 + 16GB DDR5 + 1TB NVMe SSD。Apex Legends、Valorant、フォートナイトなどの人気タイトルを高画質で快適プレイ。',
      '【30万円台】WQHD高画質ゲーミング。RTX 5070 / 5070Ti + Ryzen 7 / Core Ultra 7 + 32GB DDR5 + 1TB NVMe SSD。最新AAAタイトルも余裕を持って動作。配信との同時使用にも対応。',
      '【40万円台以上】4Kハイエンド。RTX 5080 / 5090 + Ryzen 9 / Core Ultra 9 + 32GB DDR5 + 2TB NVMe SSD。あらゆるゲームを最高画質で。プロ向け配信や動画編集にも対応するフラッグシップ構成。',
    ],
  },
  {
    id: 'checklist',
    title: '購入前チェックリスト',
    content: [
      '✓ プレイしたいゲームの推奨スペックを確認する — ゲームの公式サイトや Steam のストアページに記載されています。',
      '✓ モニターの解像度・リフレッシュレートを決める — PC性能に見合ったモニターを選ばないと、性能を活かしきれません。',
      '✓ 設置スペースを確認する — ゲーミングPCはミドルタワーで幅20cm×奥行45cm×高さ45cm程度。十分な排熱スペースも必要です。',
      '✓ 電源容量（コンセント）を確認 — ハイエンドPCは消費電力が高く、たこ足配線は避けましょう。',
      '✓ 保証・サポート体制を確認 — ASTROMEDAは国内自社工場での1年保証標準、延長保証にも対応しています。',
    ],
  },
];

export default function GuidesBeginners() {
  // 9-20: HowTo JSON-LD — AI引用＋リッチリザルト対応
  const howToJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    'name': 'ゲーミングPCの選び方 — 初心者向け完全ガイド',
    'description': 'GPU・CPU・メモリの違いから予算別おすすめ構成まで、ゲーミングPC選びの全ステップを解説。',
    'step': SECTIONS.map((s, i) => ({
      '@type': 'HowToStep',
      'position': i + 1,
      'name': s.title,
      'text': s.content[0],
      'url': `${STORE_URL}/guides/beginners#${s.id}`,
    })),
    'totalTime': 'PT15M',
    'tool': [{'@type': 'HowToTool', 'name': 'ASTROMEDA公式オンラインストア'}],
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
        dangerouslySetInnerHTML={{__html: JSON.stringify(howToJsonLd)}}
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
          <span style={{color: T.c}}>入門ガイド</span>
        </nav>

        {/* Header */}
        <header style={{marginBottom: 40}}>
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
            Beginner&apos;s Guide
          </span>
          <h1
            style={{
              fontSize: 'clamp(24px, 4vw, 36px)',
              fontWeight: 900,
              margin: '0 0 12px',
            }}
          >
            ゲーミングPC入門ガイド
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.6)',
              lineHeight: 1.8,
              margin: 0,
            }}
          >
            初めてゲーミングPCを購入する方に向けて、GPU・CPU・メモリの違いから予算別おすすめ構成まで、
            知るべきポイントを網羅的に解説します。
          </p>
        </header>

        {/* Table of Contents */}
        <nav
          style={{
            background: 'rgba(255,255,255,.03)',
            borderRadius: 14,
            padding: 20,
            border: '1px solid rgba(255,255,255,.06)',
            marginBottom: 40,
          }}
        >
          <div
            style={{fontSize: 12, fontWeight: 800, color: T.c, marginBottom: 12}}
          >
            目次
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
                padding: '6px 0',
                borderBottom:
                  i < SECTIONS.length - 1
                    ? '1px solid rgba(255,255,255,.04)'
                    : 'none',
              }}
            >
              {i + 1}. {s.title}
            </a>
          ))}
        </nav>

        {/* Sections */}
        {SECTIONS.map((s, i) => (
          <section key={s.id} id={s.id} style={{marginBottom: 40}}>
            <h2
              style={{
                fontSize: 'clamp(18px, 2.5vw, 22px)',
                fontWeight: 900,
                color: T.c,
                marginBottom: 16,
                paddingBottom: 8,
                borderBottom: '1px solid rgba(0,240,255,.15)',
              }}
            >
              {i + 1}. {s.title}
            </h2>
            {s.content.map((p, j) => (
              <p
                key={j}
                style={{
                  fontSize: 14,
                  color: 'rgba(255,255,255,.75)',
                  lineHeight: 1.9,
                  margin: '0 0 12px',
                }}
              >
                {p}
              </p>
            ))}
          </section>
        ))}

        {/* CTA */}
        <div
          style={{
            textAlign: 'center',
            padding: 32,
            background: 'rgba(0,240,255,.04)',
            borderRadius: 16,
            border: '1px solid rgba(0,240,255,.15)',
            marginTop: 48,
          }}
        >
          <h3
            style={{
              fontSize: 18,
              fontWeight: 900,
              marginBottom: 12,
            }}
          >
            自分に合ったゲーミングPCを見つけよう
          </h3>
          <p
            style={{
              fontSize: 13,
              color: 'rgba(255,255,255,.6)',
              marginBottom: 20,
              lineHeight: 1.6,
            }}
          >
            ASTROMEDAは人気アニメ・ゲームIPとのコラボモデルを多数ラインナップ。
            国内自社工場で一台ずつ丁寧に組み立てています。
          </p>
          <div style={{display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap'}}>
            <Link
              to="/collections/astromeda"
              style={{
                display: 'inline-block',
                padding: '14px 28px',
                background: T.c,
                color: '#000',
                fontSize: 13,
                fontWeight: 800,
                borderRadius: 10,
                textDecoration: 'none',
              }}
            >
              PCラインナップを見る
            </Link>
            <Link
              to="/guides/cospa"
              style={{
                display: 'inline-block',
                padding: '14px 28px',
                background: 'transparent',
                color: T.g,
                fontSize: 13,
                fontWeight: 800,
                borderRadius: 10,
                textDecoration: 'none',
                border: '1px solid rgba(255,215,0,.3)',
              }}
            >
              コスパ比較ガイドへ →
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

      {/* HowTo Schema.org */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: 'ゲーミングPC入門ガイド — 初心者の選び方',
            description:
              'ゲーミングPC初心者向け完全ガイド。GPU・CPU・メモリの違い、予算別おすすめスペック、購入前に知るべきポイントを解説。',
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
              '@id': `${STORE_URL}/guides/beginners`,
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
