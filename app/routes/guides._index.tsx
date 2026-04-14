/**
 * ゲーミングPC初心者ガイド — インデックスページ
 *
 * SEO最適化:
 * - コンテンツマーケティングの入口ページ
 * - ガイド記事へのリンクハブ
 * - 内部リンク構造強化
 */

import {Link} from 'react-router';
import type {Route} from './+types/guides._index';
import {T, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {RelatedProducts} from '~/components/astro/RelatedProducts';

export const meta: Route.MetaFunction = () => {
  const title = 'ゲーミングPC初心者ガイド | ASTROMEDA ゲーミングPC';
  const description = 'ゲーミングPC初心者の方へ。選び方、コスパ比較、配信向けPCの選び方など、ASTROMEDA専門スタッフが解説。';
  const url = `${STORE_URL}/guides`;
  return [
    {title},
    {name: 'description', content: description},
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:url', content: url},
    {name: 'twitter:card', content: 'summary'},
    {name: 'twitter:title', content: title},
  ];
};

const GUIDES = [
  {
    slug: 'beginners',
    title: 'ゲーミングPC入門ガイド',
    subtitle: '初めてのゲーミングPCの選び方',
    description:
      'GPU、CPU、メモリの違いからわかりやすく解説。何を基準に選べばいいのか、初心者の方が最初に知るべきポイントをまとめました。',
    icon: '🎮',
    accent: '#00F0FF',
  },
  {
    slug: 'benchmark',
    title: 'GPU性能ベンチマーク比較',
    subtitle: 'RTX 5060〜5090の性能データ',
    description:
      'NVIDIA GeForce RTX 5000シリーズの実測ベンチマークデータ。Apex Legends・VALORANT・FortniteをフルHD/WQHD/4Kで計測。用途別推奨ガイド付き。',
    icon: '📊',
    accent: '#00FF88',
  },
  {
    slug: 'cospa',
    title: 'コスパ比較ガイド',
    subtitle: '予算別おすすめスペック',
    description:
      '20万円台・30万円台・40万円台の各価格帯で最もコストパフォーマンスの高い構成を比較。あなたの予算に最適なPCが見つかります。',
    icon: '💰',
    accent: '#FFD700',
  },
  {
    slug: 'streaming',
    title: '配信向けPCガイド',
    subtitle: 'ゲーム実況・配信に必要なスペック',
    description:
      'OBS、StreamLabsなどの配信ソフトを快適に動かすために必要なスペックは？ゲームプレイ+配信の同時処理に必要な構成を解説。',
    icon: '📺',
    accent: '#FF2D55',
  },
];

export default function GuidesIndex() {
  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif",
        color: T.tx,
      }}
    >
      <div
        style={{
          maxWidth: 900,
          margin: '0 auto',
          padding: 'clamp(32px, 4vw, 64px) clamp(16px, 4vw, 48px)',
        }}
      >
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
            Guides & Resources
          </span>
          <h1
            style={{
              fontSize: 'clamp(24px, 4vw, 36px)',
              fontWeight: 900,
              margin: '0 0 12px',
            }}
          >
            ゲーミングPC初心者ガイド
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.6)',
              lineHeight: 1.6,
              maxWidth: 600,
              margin: '0 auto',
            }}
          >
            初めてゲーミングPCを購入する方に向けて、
            ASTROMEDAのスタッフが選び方のポイントを解説します。
          </p>
        </div>

        {/* Pillar Page Featured Section */}
        <Link
          to="/guides/how-to-choose"
          style={{textDecoration: 'none', color: '#fff', marginBottom: 40, display: 'block'}}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(0,240,255,.12) 0%, rgba(255,215,0,.06) 100%)',
              borderRadius: 16,
              padding: 32,
              border: '2px solid rgba(0,240,255,.2)',
              transition: 'border-color .2s, transform .2s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = T.c;
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,240,255,.2)';
              (e.currentTarget as HTMLElement).style.transform = 'none';
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: T.c,
                letterSpacing: '0.15em',
                marginBottom: 8,
              }}
            >
              ★ 最初に読むべきページ
            </div>
            <h2
              style={{
                fontSize: 'clamp(18px, 2.5vw, 24px)',
                fontWeight: 900,
                color: T.c,
                margin: '0 0 8px',
              }}
            >
              ゲーミングPCの選び方 完全ガイド【2026年最新版】
            </h2>
            <p
              style={{
                fontSize: 13,
                color: 'rgba(255,255,255,.65)',
                lineHeight: 1.7,
                margin: '0 0 12px',
              }}
            >
              GPU別比較表、予算別おすすめ構成、用途別選定フロー、よくある質問まで。
              5000文字級の権威的ガイド。このページを読めば、ゲーミングPC選びの全てが分かります。
            </p>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: T.g,
              }}
            >
              詳しく読む →
            </div>
          </div>
        </Link>

        {/* Guide cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 20,
          }}
        >
          {GUIDES.map((guide) => (
            <Link
              key={guide.slug}
              to={`/guides/${guide.slug}`}
              style={{textDecoration: 'none', color: '#fff'}}
            >
              <div
                style={{
                  background: 'rgba(255,255,255,.03)',
                  borderRadius: 16,
                  padding: 24,
                  border: '1px solid rgba(255,255,255,.06)',
                  transition: 'border-color .2s, transform .2s',
                  height: '100%',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor =
                    guide.accent + '30';
                  (e.currentTarget as HTMLElement).style.transform =
                    'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor =
                    'rgba(255,255,255,.06)';
                  (e.currentTarget as HTMLElement).style.transform = 'none';
                }}
              >
                <span style={{fontSize: 32, display: 'block', marginBottom: 12}}>
                  {guide.icon}
                </span>
                <h2
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    margin: '0 0 4px',
                    color: guide.accent,
                  }}
                >
                  {guide.title}
                </h2>
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'rgba(255,255,255,.5)',
                    margin: '0 0 12px',
                  }}
                >
                  {guide.subtitle}
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: 'rgba(255,255,255,.6)',
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {guide.description}
                </p>
                <div
                  style={{
                    marginTop: 16,
                    fontSize: 12,
                    fontWeight: 700,
                    color: guide.accent,
                  }}
                >
                  続きを読む →
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div style={{textAlign: 'center', marginTop: 48}}>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.5)',
              marginBottom: 16,
            }}
          >
            ガイドを読んだ後は、ASTROMEDAのラインナップをチェック
          </p>
          <Link
            to="/collections/astromeda"
            style={{
              display: 'inline-block',
              padding: '14px 36px',
              background: T.c,
              color: '#000',
              fontSize: 14,
              fontWeight: 800,
              borderRadius: 10,
              textDecoration: 'none',
            }}
          >
            PCラインナップを見る
          </Link>
        </div>
      </div>

      {/* RelatedProducts — EC⇄Blog cross-navigation */}
      <RelatedProducts context="general" />

      {/* ArticleList Schema.org */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            itemListElement: GUIDES.map((guide, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `${STORE_URL}/guides/${guide.slug}`,
              name: guide.title,
            })),
          }),
        }}
      />
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
