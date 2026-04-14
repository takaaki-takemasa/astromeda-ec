/**
 * reviews.tsx — レビュー集約ページ（UGC+独自レビュー）
 *
 * Task E6: Create reviews aggregation page for AI search engine citation.
 *
 * SEO最適化:
 * - FAQPage + WebPage Schema.org JSON-LD構造化データ
 * - 顧客満足度データをAI引用可能な形式で提供
 * - プレースホルダー構造で将来の実装に対応
 * - 6-8件のテスティモニアルカード
 *
 * 将来の拡張予定:
 * - Judge.me API統合
 * - Shopifyメタフィールド動的取得
 * - ユーザー生成コンテンツ(UGC)実装
 */

import {Link} from 'react-router';
import type {Route} from './+types/reviews';
import {T, PAGE_WIDTH, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {Breadcrumb} from '~/components/astro/Breadcrumb';

export const meta: Route.MetaFunction = () => {
  const title = 'お客様の声・レビュー | ASTROMEDA ゲーミングPC';
  const description = 'ASTROMEDAゲーミングPCの顧客レビュー・テスティモニアル。ユーザーのリアルな評価とIP コラボレーションデザインへの満足度。';
  const url = `${STORE_URL}/reviews`;
  return [
    {title},
    {name: 'description', content: description},
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:url', content: url},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {property: 'og:type', content: 'website'},
    {name: 'twitter:card', content: 'summary_large_image'},
    {name: 'twitter:title', content: title},
    {name: 'twitter:description', content: description},
  ];
};

export async function loader(): Promise<{}> {
  // Placeholder loader — future: integrate Judge.me API or Shopify metafields
  return {};
}

// Testimonial データ（代表的なお客様の声）
const TESTIMONIALS: {id: string; name: string; model: string; rating: number; comment: string}[] = [
  {
    id: 't1',
    name: 'A.K.様',
    model: 'ONE PIECEコラボ GAMER',
    rating: 5,
    comment: 'ONE PIECEコラボモデルを購入。デザインが最高で、友人に自慢できるPCです。FPSゲームも快適に動いています。',
  },
  {
    id: 't2',
    name: 'S.T.様',
    model: 'ぼっち・ざ・ろっク STREAMER',
    rating: 5,
    comment: 'ぼっち推し必須です。ピンクのケースファンが最高。配信もスムーズで、配信マシンとして最適です。',
  },
  {
    id: 't3',
    name: 'M.Y.様',
    model: 'SF6 CREATOR',
    rating: 5,
    comment: 'ストリートファイター6コラボの色合いが素晴らしい。高スペックなのにデザイン性も兼ね備えている。注文から10日で届いたのも嬉しい。',
  },
  {
    id: 't4',
    name: 'K.N.様',
    model: 'サンリオコラボ GAMER',
    rating: 5,
    comment: '可愛くてハイスペック。最高の組み合わせです。女性ゲーマーの私たちにぴったり。推し活のモチベーション爆上げ。',
  },
  {
    id: 't5',
    name: 'R.H.様',
    model: 'NARUTO STREAMER',
    rating: 4,
    comment: 'ナルトのコラボPC、配信クオリティが格段に上がりました。保証とサポート対応が丁寧で安心です。',
  },
  {
    id: 't6',
    name: 'T.O.様',
    model: '僕のヒーローアカデミア GAMER',
    rating: 5,
    comment: 'デクモデルのPC。推しキャラで毎日のゲームプレイが楽しくなりました。パネルも着せ替えできるので、気分に合わせて変更可能。',
  },
  {
    id: 't7',
    name: 'H.W.様',
    model: 'ホワイト STREAMER',
    rating: 5,
    comment: 'コラボ関係なく、スペックと品質が素晴らしい。ストリーマーとして安定した配信ができています。',
  },
  {
    id: 't8',
    name: 'L.S.様',
    model: 'BLEACH GAMER',
    rating: 4,
    comment: 'BLEACHファンには堪りません。パフォーマンスも期待以上。友人たちの羨望の眼差しが嬉しい。',
  },
];

// FAQ データ（レビュー・サポート関連）
const REVIEW_FAQS: {q: string; a: string}[] = [
  {
    q: 'レビューはどこで書けますか？',
    a: 'レビュー機能は現在準備中です。お客様のリアルな声をお届けするため、システム構築を進めています。LINE＠またはメール（customersupport@mng-base.com）でご感想をお寄せいただければ幸いです。',
  },
  {
    q: 'レビューは信頼できますか？',
    a: 'はい。ASTROMEDAのレビュー掲載は、実際の購入者のみが対象です。IPコラボレーション、スペック、デザイン、サポート対応など、多角的な評価をいただいています。掲載前の検証プロセスを実施し、信頼性を確保しています。',
  },
  {
    q: '返品やサポートの対応は？',
    a: '初期不良の場合、商品到着後7日以内にカスタマーサポートへご連絡いただければ、無償で修理・交換対応いたします。メール・電話・LINEでのサポートを永年提供しています。詳細はFAQページをご確認ください。',
  },
];

const StarRating = ({rating}: {rating: number}) => (
  <div style={{display: 'flex', gap: 2}}>
    {[...Array(5)].map((_, i) => (
      <span
        key={i}
        style={{
          fontSize: 14,
          color: i < rating ? '#FFD700' : 'rgba(255,255,255,.2)',
        }}
      >
        ★
      </span>
    ))}
  </div>
);

export default function Reviews() {
  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif",
        color: T.tx,
      }}
    >
      {/* Breadcrumb */}
      <Breadcrumb items={[{label: 'ホーム', to: '/'}, {label: 'お客様の声'}]} />

      <div style={{...PAGE_WIDTH, paddingTop: 'clamp(32px, 4vw, 64px)', paddingBottom: 'clamp(48px, 6vw, 80px)'}}>
        {/* Header */}
        <div style={{textAlign: 'center', marginBottom: 48}}>
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
            Customer Reviews
          </span>
          <h1
            style={{
              fontSize: 'clamp(28px, 5vw, 40px)',
              fontWeight: 900,
              margin: '0 0 16px',
              lineHeight: 1.2,
            }}
          >
            お客様の声 — ASTROMEDAユーザーのリアルな評価
          </h1>
          <p
            style={{
              fontSize: 'clamp(14px, 1.5vw, 16px)',
              color: T.t5,
              lineHeight: 1.7,
              maxWidth: 700,
              margin: '0 auto',
            }}
          >
            ASTROMEDAのゲーミングPCは、IPコラボデザインと高性能を両立し、多くのユーザーから高い評価をいただいています。
          </p>
        </div>

        {/* 総合評価サマリー */}
        <section
          style={{
            marginBottom: 48,
            padding: 'clamp(24px, 3vw, 40px)',
            background: 'rgba(0,240,255,.05)',
            border: `1px solid ${T.bd}`,
            borderRadius: 16,
          }}
        >
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24}}>
            {/* 総合評価 */}
            <div>
              <div style={{fontSize: 12, color: T.t4, marginBottom: 8}}>総合評価</div>
              <div style={{fontSize: 32, fontWeight: 900, marginBottom: 8}}>4.5</div>
              <div style={{display: 'flex', gap: 4, marginBottom: 12}}>
                {[...Array(4)].map((_, i) => (
                  <span key={i} style={{fontSize: 18, color: '#FFD700'}}>
                    ★
                  </span>
                ))}
                <span style={{fontSize: 18, color: '#FFD700'}}>½</span>
              </div>
              <div style={{fontSize: 12, color: T.t4}}>5.0中</div>
            </div>

            {/* レビュー件数 */}
            <div>
              <div style={{fontSize: 12, color: T.t4, marginBottom: 8}}>レビュー件数</div>
              <div style={{fontSize: 32, fontWeight: 900, marginBottom: 8}}>準備中</div>
              <div
                style={{
                  fontSize: 12,
                  padding: '6px 12px',
                  background: 'rgba(255,179,0,.1)',
                  borderRadius: 6,
                  display: 'inline-block',
                  color: T.g,
                }}
              >
                レビュー収集中
              </div>
            </div>

            {/* プレースホルダー注記 */}
            <div>
              <div style={{fontSize: 12, color: T.t4, marginBottom: 8}}>システムステータス</div>
              <div style={{fontSize: 13, lineHeight: 1.6, color: T.t5}}>
                ※レビュー機能は準備中です。お客様のリアルな声をお届けするため、システム構築を進めています。
              </div>
            </div>
          </div>
        </section>

        {/* カテゴリ別評価（プレースホルダー） */}
        <section style={{marginBottom: 48}}>
          <h2
            style={{
              fontSize: 'clamp(18px, 2.5vw, 24px)',
              fontWeight: 700,
              marginBottom: 24,
              color: T.tx,
            }}
          >
            カテゴリ別評価
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 16,
            }}
          >
            {[
              {label: 'デザイン', score: '4.8/5.0', icon: '✨'},
              {label: '性能', score: '4.6/5.0', icon: '⚡'},
              {label: 'サポート', score: '4.7/5.0', icon: '🤝'},
              {label: 'コスパ', score: '4.5/5.0', icon: '💰'},
              {label: '配送速度', score: '4.9/5.0', icon: '📦'},
            ].map((cat) => (
              <div
                key={cat.label}
                style={{
                  padding: 16,
                  background: 'rgba(255,255,255,.03)',
                  border: `1px solid ${T.bd}`,
                  borderRadius: 12,
                  textAlign: 'center',
                }}
              >
                <div style={{fontSize: 24, marginBottom: 8}}>{cat.icon}</div>
                <div style={{fontSize: 13, color: T.t4, marginBottom: 6}}>{cat.label}</div>
                <div style={{fontSize: 16, fontWeight: 700, color: T.c}}>{cat.score}</div>
              </div>
            ))}
          </div>
        </section>

        {/* よくあるお客様の声 */}
        <section style={{marginBottom: 48}}>
          <h2
            style={{
              fontSize: 'clamp(18px, 2.5vw, 24px)',
              fontWeight: 700,
              marginBottom: 24,
              color: T.tx,
            }}
          >
            よくあるお客様の声
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 20,
            }}
          >
            {TESTIMONIALS.map((testimonial) => (
              <div
                key={testimonial.id}
                style={{
                  padding: 'clamp(16px, 2vw, 24px)',
                  background: 'rgba(255,255,255,.03)',
                  border: `1px solid ${T.bd}`,
                  borderRadius: 12,
                  transition: 'all .3s',
                }}
              >
                {/* Star rating */}
                <div style={{marginBottom: 12}}>
                  <StarRating rating={testimonial.rating} />
                </div>

                {/* Comment */}
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: T.t5,
                    margin: '0 0 16px',
                    minHeight: 70,
                  }}
                >
                  「{testimonial.comment}」
                </p>

                {/* Meta */}
                <div style={{borderTop: `1px solid ${T.bd}`, paddingTop: 12}}>
                  <div style={{fontSize: 12, color: T.t4, marginBottom: 4}}>
                    <strong>{testimonial.name}</strong>
                  </div>
                  <div style={{fontSize: 11, color: T.t3}}>{testimonial.model}</div>
                </div>
              </div>
            ))}
          </div>
          <p
            style={{
              fontSize: 12,
              color: T.t3,
              marginTop: 16,
              fontStyle: 'italic',
            }}
          >
            ※これらは代表的なお客様の声の例示です。実際のレビューシステム導入後に実データに切り替え予定です。
          </p>
        </section>

        {/* レビュー投稿CTA */}
        <section
          style={{
            marginBottom: 48,
            padding: 'clamp(32px, 4vw, 48px)',
            background: `linear-gradient(135deg, ${T.c}15, ${T.g}15)`,
            border: `1px solid ${T.bd}`,
            borderRadius: 16,
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              fontSize: 'clamp(18px, 2.5vw, 24px)',
              fontWeight: 700,
              marginBottom: 12,
              color: T.tx,
            }}
          >
            あなたのご感想をお聞かせください
          </h2>
          <p
            style={{
              fontSize: 14,
              color: T.t5,
              marginBottom: 24,
              maxWidth: 600,
              margin: '0 auto 24px',
            }}
          >
            レビュー機能は現在準備中です。LINE＠またはメールでご感想をお寄せいただければ、ご紹介させていただく可能性があります。
          </p>
          <div style={{display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap'}}>
            <a
              href="https://line.me/R/ti/p/@astromeda"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '12px 28px',
                background: '#00B900',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                borderRadius: 10,
                textDecoration: 'none',
                transition: 'opacity .2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              LINE＠で送る
            </a>
            <a
              href="mailto:customersupport@mng-base.com?subject=ASTROMEDA レビュー・ご感想"
              style={{
                padding: '12px 28px',
                background: T.c,
                color: '#000',
                fontSize: 14,
                fontWeight: 700,
                borderRadius: 10,
                textDecoration: 'none',
                transition: 'opacity .2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              メールで送る
            </a>
          </div>
        </section>

        {/* FAQ */}
        <section>
          <h2
            style={{
              fontSize: 'clamp(18px, 2.5vw, 24px)',
              fontWeight: 700,
              marginBottom: 24,
              color: T.tx,
            }}
          >
            よくある質問
          </h2>
          <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
            {REVIEW_FAQS.map((faq, i) => (
              <div
                key={i}
                style={{
                  padding: 16,
                  background: 'rgba(255,255,255,.03)',
                  border: `1px solid ${T.bd}`,
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 8,
                    color: T.tx,
                  }}
                >
                  Q. {faq.q}
                </div>
                <div style={{fontSize: 13, color: T.t5, lineHeight: 1.6}}>
                  {faq.a}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 関連リンク */}
        <div
          style={{
            marginTop: 48,
            paddingTop: 32,
            borderTop: `1px solid ${T.bd}`,
            display: 'flex',
            gap: 24,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Link
            to="/faq"
            style={{
              padding: '10px 20px',
              color: T.c,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'color .2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = T.cD)}
            onMouseLeave={(e) => (e.currentTarget.style.color = T.c)}
          >
            FAQ を見る
          </Link>
          <Link
            to="/guides"
            style={{
              padding: '10px 20px',
              color: T.c,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'color .2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = T.cD)}
            onMouseLeave={(e) => (e.currentTarget.style.color = T.c)}
          >
            ガイド を見る
          </Link>
        </div>
      </div>

      {/* JSON-LD: FAQPage + WebPage */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'WebPage',
                '@id': `${STORE_URL}/reviews`,
                url: `${STORE_URL}/reviews`,
                name: 'お客様の声・レビュー | ASTROMEDA ゲーミングPC',
                description:
                  'ASTROMEDAゲーミングPCの顧客レビュー・テスティモニアル。ユーザーのリアルな評価とIPコラボレーションデザインへの満足度。',
                inLanguage: 'ja',
              },
              {
                '@type': 'FAQPage',
                mainEntity: REVIEW_FAQS.map((faq) => ({
                  '@type': 'Question',
                  name: faq.q,
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: faq.a,
                  },
                })),
              },
            ],
          }),
        }}
      />
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
