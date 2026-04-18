/**
 * こだわりページ
 *
 * SEO最適化:
 * - meta description 設定
 * - canonical URL
 * - ASTROMEDAの製造・品質・サポートへのこだわりを訴求
 *
 * patch 0019 (P0-C): astromeda_static_page (page_slug='commitment') から
 * title / meta_description / sections_json をオーバーライド可能に接続。
 */

import {useLoaderData} from 'react-router';
import type {Route} from './+types/commitment';
import {T, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {loadStaticPageBySlug, type StaticPageCms} from '~/lib/static-page-loader';

const HARDCODED_TITLE = 'ASTROMEDAのこだわり';
const HARDCODED_META_DESC =
  'ASTROMEDAのこだわり。国内自社工場での受注生産、ベンチマーク済みパーツ選定、24時間エージング、永年サポート。安心して長く使える1台をお届けします。';
const HARDCODED_LEAD =
  '「長く愛されるゲーミングPCを」その想いから、私たちは品質・デザイン・サポートのすべてに妥協しません。';

const HARDCODED_SECTIONS = [
  {
    heading: '1. 国内自社工場での受注生産',
    body:
      'ASTROMEDAのゲーミングPCは、すべて日本国内の自社工場で1台ずつ組み立てられます。' +
      'ご注文を受けてから組み立てるため、最新パーツでのご提供と、お客様一人ひとりの仕様に合わせた' +
      'カスタマイズが可能です。\n' +
      '熟練のビルダーが目視でケーブル取り回し・冷却バランス・配線美観まで仕上げます。',
  },
  {
    heading: '2. ベンチマーク済みパーツ選定',
    body:
      'CPU・GPU・メモリ・SSD・電源・マザーボード — すべてのパーツは社内ベンチマークで' +
      '性能・安定性・長期信頼性を検証したうえで採用しています。' +
      '「カタログスペックが良い」だけでは選びません。実機での連続稼働テストをパスしたものだけが' +
      'ASTROMEDAに搭載されます。',
  },
  {
    heading: '3. 24時間エージングテスト',
    body:
      '出荷前にすべてのPCに対して24時間の負荷エージングテストを実施しています。' +
      'CPU/GPU高負荷状態での連続稼働、メモリチェック、ストレージ全領域検証を経て、' +
      '初期不良の芽を出荷前に取り除きます。',
  },
  {
    heading: '4. IPコラボレーションの世界観',
    body:
      '人気IPとのコラボレーションでは、版元様と密に連携し、UV高精細印刷による' +
      'キャラクターデザインの再現性にもこだわっています。' +
      '着せ替えパネル・カラー8色展開・グッズの同梱まで、世界観を丸ごとお届けします。',
  },
  {
    heading: '5. 永年サポート',
    body:
      'メーカー1年保証・延長保証3年（オプション）に加え、保証期間後も' +
      'メール・電話・LINEでのサポートを永年無料でご提供します。' +
      '「買って終わり」ではなく、長く一緒に走るパートナーでありたい。それが私たちの願いです。',
  },
];

export async function loader(args: Route.LoaderArgs) {
  const {env} = args.context;
  let adminClient: {getMetaobjects: (type: string, first: number) => Promise<Array<{id: string; handle: string; fields: Array<{key: string; value: string}>}>>} | null = null;
  try {
    const {setAdminEnv, getAdminClient} = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(env as unknown as Record<string, string | undefined>);
    adminClient = getAdminClient();
  } catch {
    adminClient = null;
  }
  const cms = await loadStaticPageBySlug(adminClient, 'commitment');
  return {cms};
}

export const meta: Route.MetaFunction = ({data}) => {
  const cms = (data as {cms?: StaticPageCms | null} | undefined)?.cms;
  const useCms = cms && cms.isPublished;
  const title = `${useCms && cms.title ? cms.title : HARDCODED_TITLE} | ゲーミングPC`;
  const description = useCms && cms.metaDescription ? cms.metaDescription : HARDCODED_META_DESC;
  const url = `${STORE_URL}/commitment`;
  return [
    {title},
    {name: 'description', content: description},
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:url', content: url},
    {name: 'twitter:card', content: 'summary'},
    {name: 'twitter:title', content: title},
  ];
};

function Section({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <section style={{marginBottom: 32}}>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 800,
          color: '#fff',
          marginBottom: 12,
          paddingBottom: 6,
          borderBottom: '1px solid rgba(0,240,255,.15)',
        }}
      >
        {title}
      </h2>
      <div
        style={{fontSize: 14, lineHeight: 1.9, color: 'rgba(255,255,255,.7)', whiteSpace: 'pre-line'}}
      >
        {children}
      </div>
    </section>
  );
}

export default function Commitment() {
  const {cms} = useLoaderData<typeof loader>();
  const useCms = !!cms && cms.isPublished;
  const pageTitle = useCms && cms!.title ? cms!.title : HARDCODED_TITLE;
  const sections =
    useCms && cms!.sections.length > 0 ? cms!.sections : HARDCODED_SECTIONS;

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
          maxWidth: 800,
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
            COMMITMENT
          </span>
          <h1
            style={{
              fontSize: 'clamp(24px, 4vw, 36px)',
              fontWeight: 900,
              margin: '0 0 12px',
            }}
          >
            {pageTitle}
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.6)',
              lineHeight: 1.6,
            }}
          >
            {HARDCODED_LEAD}
          </p>
        </div>

        {sections.map((s, i) => (
          <Section key={i} title={s.heading}>
            {s.body}
          </Section>
        ))}

        {useCms && cms!.updatedLabel && (
          <div style={{textAlign: 'center', marginBottom: 16, fontSize: 12, color: 'rgba(255,255,255,.4)'}}>
            {cms!.updatedLabel}
          </div>
        )}

        {/* Contact CTA */}
        <div
          style={{
            marginTop: 48,
            textAlign: 'center',
            padding: 32,
            background: 'rgba(255,255,255,.03)',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,.06)',
          }}
        >
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.6)',
              marginBottom: 12,
            }}
          >
            ASTROMEDAのPCラインナップを見る
          </p>
          <a
            href="/collections/gaming-pc"
            style={{
              display: 'inline-block',
              padding: '12px 32px',
              background: T.c,
              color: '#000',
              fontSize: 14,
              fontWeight: 700,
              borderRadius: 10,
              textDecoration: 'none',
            }}
          >
            ゲーミングPC一覧へ
          </a>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
