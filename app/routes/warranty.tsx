/**
 * 保証ページ
 *
 * SEO最適化:
 * - meta description 設定
 * - canonical URL
 * - 標準1年保証 + 延長保証3年プランの案内
 *
 * patch 0019 (P0-C): astromeda_static_page (page_slug='warranty') で
 * title / meta_description / sections_json をオーバーライド可能に接続。
 * CMS データが無い / is_published=false の場合は従来のハードコードで表示。
 */

import {useLoaderData} from 'react-router';
import type {Route} from './+types/warranty';
import {T, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {loadStaticPageBySlug, type StaticPageCms} from '~/lib/static-page-loader';

const HARDCODED_TITLE = '保証・修理について';
const HARDCODED_META_DESC =
  'ASTROMEDAゲーミングPCの保証内容。標準1年保証＋延長保証（合計3年）、修理対応、サポート窓口についてご案内します。';
const HARDCODED_LEAD =
  'ASTROMEDAは、お客様に長く安心してお使いいただけるよう、充実した保証とサポートをご用意しています。';

const HARDCODED_SECTIONS = [
  {
    heading: '1. 標準保証（メーカー1年保証）',
    body:
      'すべてのASTROMEDAゲーミングPCには、ご購入日から1年間のメーカー保証が標準付帯されています。' +
      'CPU・GPU・マザーボード・電源・ストレージ・メモリを含む全パーツの自然故障が対象です。\n' +
      '保証期間内の修理は、送料を含めて完全無料で対応いたします。',
  },
  {
    heading: '2. 延長保証（合計3年）',
    body:
      '標準保証に加え、2年間の延長保証（合計3年保証）を ¥14,800 でご用意しています。' +
      '延長保証はご注文時のオプションでお選びいただけます。\n' +
      '延長保証期間中も、CPU・GPUを含む全パーツの自然故障に対して工賃・送料を無料で対応します。',
  },
  {
    heading: '3. 修理対応について',
    body:
      '修理部材を在庫運用しており、お預かりから最短翌日〜3営業日で返却しています。' +
      '繁忙期や特殊パーツの場合は若干お時間をいただくことがあります。\n' +
      '保証期間内：送料含め完全無料\n' +
      '保証期間後：工賃無料・パーツ代のみ実費',
  },
  {
    heading: '4. 保証対象外となるケース',
    body:
      '以下のケースは保証の対象外となります。\n' +
      '・お客様による改造・分解・誤った使用に起因する故障\n' +
      '・天災・火災・水没・落下・衝撃などによる物理破損\n' +
      '・経年劣化による性能低下\n' +
      '・消耗品（ケースファン軸受け等）の自然摩耗\n' +
      '・ソフトウェアのインストール不具合・ウイルス感染',
  },
  {
    heading: '5. 初期不良対応',
    body:
      '商品到着後7日以内に動作不良が確認された場合は、初期不良として無償で修理・交換対応いたします。' +
      '到着時の梱包材は念のため保管をお願いいたします。',
  },
  {
    heading: '6. サポート窓口',
    body:
      '修理・保証に関するお問い合わせは下記までご連絡ください。' +
      'メール・電話・LINEでのサポートを永年提供しています。\n' +
      'メール：customersupport@mng-base.com\n' +
      '電話：03-6903-5371（平日10:00〜18:00）\n' +
      'LINE：公式LINEアカウントよりお気軽にお問い合わせください',
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
  const cms = await loadStaticPageBySlug(adminClient, 'warranty');
  return {cms};
}

export const meta: Route.MetaFunction = ({data}) => {
  const cms = (data as {cms?: StaticPageCms | null} | undefined)?.cms;
  const useCms = cms && cms.isPublished;
  const title = `${useCms && cms.title ? cms.title : HARDCODED_TITLE} | ASTROMEDA ゲーミングPC`;
  const description = useCms && cms.metaDescription ? cms.metaDescription : HARDCODED_META_DESC;
  const url = `${STORE_URL}/warranty`;
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

export default function Warranty() {
  const {cms} = useLoaderData<typeof loader>();
  const useCms = !!cms && cms.isPublished;
  const pageTitle = useCms && cms!.title ? cms!.title : HARDCODED_TITLE;
  const sections =
    useCms && cms!.sections.length > 0
      ? cms!.sections
      : HARDCODED_SECTIONS;

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
            WARRANTY
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
            修理・保証についてのご質問はこちら
          </p>
          <a
            href="mailto:customersupport@mng-base.com"
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
            お問い合わせ
          </a>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
