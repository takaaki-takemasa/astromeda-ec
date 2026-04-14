/**
 * 配信向けPCガイド
 *
 * SEO最適化:
 * - 「配信用PC スペック」「ゲーム配信 PC おすすめ」キーワード対策
 * - Article Schema.org 構造化データ
 * - 内部リンク → 配信向けPC商品誘導
 */

import {Link} from 'react-router';
import type {Route} from './+types/guides.streaming';
import {T, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

export const meta: Route.MetaFunction = () => {
  const title = '配信・ストリーミング向けPC選び方 | ASTROMEDA ゲーミングPC';
  const description = '配信・ストリーミングに最適なPC選び方ガイド。エンコード性能、CPU・GPU選定、配信ソフト設定のコツをASTROMEDA専門スタッフが解説。';
  const url = `${STORE_URL}/guides/streaming`;
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
    id: 'overview',
    title: '配信用PCに必要なスペックとは？',
    content: [
      'ゲーム配信は「ゲームプレイ」と「映像エンコード（配信ソフトでの変換・送信）」という2つの重い処理を同時に行います。そのため、通常のゲーミングPCよりも高い性能が求められます。',
      '特にCPU性能が重要になります。ゲーム自体はGPU依存ですが、配信のエンコード処理はCPUに大きな負荷をかけます。また、OBSなどの配信ソフト、ブラウザ（チャット表示）、Discord（通話）などを同時に動かすため、マルチタスク性能も必要です。',
    ],
  },
  {
    id: 'software',
    title: '主要配信ソフトと推奨環境',
    content: [
      '【OBS Studio】最も人気のある無料配信ソフト。Twitch、YouTube、ニコニコ生放送に対応。NVENC（GPU）エンコードとx264（CPU）エンコードを選択可能。推奨: 6コア以上のCPU + RTX 5060以上。',
      '【StreamLabs Desktop】OBSベースの配信特化ソフト。ウィジェット、アラート、チャットボットが統合されており設定が簡単。OBSより若干リソースを消費。推奨: 8コア以上のCPU + 32GB メモリ。',
      '【XSplit】有料ソフト。プロ向けの機能が充実。バーチャル背景、シーン切り替えが優秀。推奨: Ryzen 7 / Core Ultra 7以上 + RTX 5070以上。',
    ],
  },
  {
    id: 'encode',
    title: 'エンコード方式の選び方',
    content: [
      'エンコードとは、ゲーム映像をリアルタイムで配信用の動画形式に変換する処理です。大きく分けて2つの方式があります。',
      '【NVENCエンコード（GPU）】NVIDIA GPUに搭載された専用ハードウェアエンコーダーを使用。CPUへの負荷がほぼゼロで、ゲーム性能への影響が最小限。RTX 50シリーズのNVENCはAV1コーデックに完全対応し、同じビットレートでもx264を上回る画質を実現。1PC配信ならこちらが主流。',
      '【x264エンコード（CPU）】CPUのみでエンコード。画質面での優位性はNVENC AV1の進化により縮小。CPU負荷が非常に高い。配信専用PC（2PC配信）で使用するケースが多い。使う場合はRyzen 7 / Core Ultra 7以上+「medium」プリセット以上で。',
      '初心者にはNVENCを推奨します。設定が簡単で、ゲームパフォーマンスへの影響が少なく、最新GPUなら画質も十分です。',
    ],
  },
  {
    id: 'one-vs-two',
    title: '1PC配信 vs 2PC配信',
    content: [
      '【1PC配信】1台のPCでゲーム+配信を同時処理。コストが抑えられ、配線もシンプル。RTX 5070以上 + Ryzen 7 / Core Ultra 7以上の構成なら、NVENCエンコードでほとんどのゲームをフルHD 60fpsで配信可能。',
      '【2PC配信】ゲーム用PCと配信用PCを分離。キャプチャーボードで映像を配信用PCに転送。ゲーム側のパフォーマンスに一切影響なし。プロ配信者や高画質4K配信を行う場合に採用。追加コスト10〜20万円。',
      'ASTROMEDAではIPコラボモデルを含む高性能PCを取り揃えており、1PC配信で十分な性能を確保できるモデルが多数あります。まずは1PC配信から始めて、必要に応じて2PC体制に移行するのがおすすめです。',
    ],
  },
  {
    id: 'specs',
    title: '配信用PC推奨スペック',
    content: [
      '【ライト配信（フルHD 30fps / 雑談配信）】Ryzen 5 / Core Ultra 5 + RTX 5060 + 16GB DDR5 メモリ + 1TB NVMe SSD。予算目安: 20万円台。Vtuberの雑談配信やレトロゲーム配信に。',
      '【スタンダード配信（フルHD 60fps / ゲーム実況）】Ryzen 7 / Core Ultra 7 + RTX 5070Ti + 32GB DDR5 メモリ + 1TB NVMe SSD。予算目安: 30万円台。Apex、Valorant、フォートナイト等のeスポーツ配信に最適。',
      '【ハイエンド配信（WQHD〜4K 60fps / プロ品質）】Ryzen 9 / Core Ultra 9 + RTX 5080 + 32〜64GB DDR5 メモリ + 2TB NVMe SSD。予算目安: 40万円台〜。最高画質でのゲーム配信、VTuber 3Dモデル使用、同時編集作業対応。',
    ],
  },
  {
    id: 'peripherals',
    title: '配信に必要な周辺機器',
    content: [
      '【マイク】USB接続のコンデンサーマイクが入門に最適。Blue Yeti、HyperX QuadCast、Audio-Technica AT2020USBなどが定番。予算: 1〜2万円。',
      '【Webカメラ】フルHD 60fps対応のものを選びましょう。Logicool C920/C922、Elgato Facecam等。Vtuberの場合はフェイストラッキング精度も重要。予算: 1〜3万円。',
      '【キャプチャーボード（2PC配信のみ）】Elgato HD60 X、AVerMedia Live Gamer 4Kなど。4Kパススルー+フルHD録画対応が主流。予算: 2〜3万円。',
      '【照明】リングライトやキーライトで顔映りを改善。配信画質は照明で大きく変わります。予算: 3,000〜1万円。',
      '【デュアルモニター】配信中のチャット確認やOBS操作に2枚目のモニターは必須に近い。ゲーム用は高リフレッシュレート、配信管理用はフルHDの安価なもので十分。',
    ],
  },
  {
    id: 'settings',
    title: 'OBS推奨設定（ゲーム配信向け）',
    content: [
      '【出力設定】エンコーダー: NVIDIA NVENC H.264 / ビットレート: 6,000 Kbps（Twitch）〜 10,000 Kbps（YouTube）/ プリセット: Quality / プロファイル: high',
      '【映像設定】基本解像度: 1920×1080 / 出力解像度: 1920×1080 / FPS: 60 / ダウンスケールフィルター: ランチョス',
      '【音声設定】サンプリングレート: 48kHz / ビットレート: 160 kbps / ノイズ抑制フィルター有効',
      'YouTube向けの場合、AV1エンコード（RTX 50シリーズ全モデル対応）を使うと、同じビットレートでより高画質な配信が可能です。',
    ],
  },
];

export default function GuidesStreaming() {
  const howToJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: '配信・ストリーミング向けPC選び方',
    description: '配信・ストリーミングに最適なPC選び方ガイド。エンコード性能、CPU・GPU選定、配信ソフト設定のコツを解説。',
    step: SECTIONS.map((section, index) => ({
      '@type': 'HowToStep',
      position: String(index + 1),
      name: section.title,
      text: section.content.join(' '),
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
          <span style={{color: T.r}}>配信向けPC</span>
        </nav>

        {/* Header */}
        <header style={{marginBottom: 40}}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: T.r,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: 8,
            }}
          >
            Streaming PC Guide
          </span>
          <h1
            style={{
              fontSize: 'clamp(24px, 4vw, 36px)',
              fontWeight: 900,
              margin: '0 0 12px',
            }}
          >
            配信向けPCガイド
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.6)',
              lineHeight: 1.8,
              margin: 0,
            }}
          >
            ゲーム配信・実況に必要なスペック、OBSの推奨設定、
            1PC配信と2PC配信の違いまで徹底解説します。
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
            style={{fontSize: 12, fontWeight: 800, color: T.r, marginBottom: 12}}
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
                color: T.r,
                marginBottom: 16,
                paddingBottom: 8,
                borderBottom: '1px solid rgba(255,45,85,.15)',
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
            background: 'rgba(255,45,85,.04)',
            borderRadius: 16,
            border: '1px solid rgba(255,45,85,.15)',
            marginTop: 48,
          }}
        >
          <h3 style={{fontSize: 18, fontWeight: 900, marginBottom: 12}}>
            配信デビューはASTROMEDAで
          </h3>
          <p
            style={{
              fontSize: 13,
              color: 'rgba(255,255,255,.6)',
              marginBottom: 20,
              lineHeight: 1.6,
            }}
          >
            お気に入りのIPコラボデザインで、配信映えするゲーミングPCを。
            国内自社工場で一台ずつ丁寧に組み立て、万全のサポート体制でお届けします。
          </p>
          <div style={{display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap'}}>
            <Link
              to="/collections/astromeda"
              style={{
                display: 'inline-block',
                padding: '14px 28px',
                background: T.r,
                color: T.tx,
                fontSize: 13,
                fontWeight: 800,
                borderRadius: 10,
                textDecoration: 'none',
              }}
            >
              PCラインナップを見る
            </Link>
            <Link
              to="/guides/beginners"
              style={{
                display: 'inline-block',
                padding: '14px 28px',
                background: 'transparent',
                color: T.c,
                fontSize: 13,
                fontWeight: 800,
                borderRadius: 10,
                textDecoration: 'none',
                border: '1px solid rgba(0,240,255,.3)',
              }}
            >
              ← 入門ガイドへ
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
            headline: '配信向けPCガイド — ゲーム実況に必要なスペック',
            description:
              'ゲーム配信・実況に必要なPCスペックを徹底解説。OBS・StreamLabsの推奨環境、1PC配信と2PC配信の違い、エンコード設定まで。',
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
              '@id': `${STORE_URL}/guides/streaming`,
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
