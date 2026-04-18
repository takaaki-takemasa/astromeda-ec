/**
 * 家電リサイクルページ
 *
 * SEO最適化:
 * - meta description 設定
 * - canonical URL
 * - 旧PCの引取・リサイクル制度のご案内
 *
 * patch 0019 (P0-C): astromeda_static_page (page_slug='recycle') から
 * title / meta_description / sections_json をオーバーライド可能に接続。
 */

import {useLoaderData} from 'react-router';
import type {Route} from './+types/recycle';
import {T, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {loadStaticPageBySlug, type StaticPageCms} from '~/lib/static-page-loader';

const HARDCODED_TITLE = 'PCリサイクル・引取サービス';
const HARDCODED_META_DESC =
  'ASTROMEDAでは資源有効利用促進法に基づき、不要になったパソコンの回収・リサイクルを承っています。データ消去対応・運搬手段のご案内まで、安心してお任せください。';
const HARDCODED_LEAD =
  'ASTROMEDAでは資源有効利用促進法に基づき、不要になったパソコンの回収を承っています。';

const HARDCODED_SECTIONS = [
  {
    heading: '1. 対象機種',
    body:
      'デスクトップパソコン本体、ノートパソコン本体、CRT/液晶ディスプレイが回収対象となります。' +
      'メーカー・購入時期は問いません。ASTROMEDA製以外のPCも回収可能です。\n' +
      '・デスクトップパソコン（本体のみ）\n' +
      '・ノートパソコン\n' +
      '・液晶ディスプレイ／CRTディスプレイ\n' +
      '・一体型パソコン',
  },
  {
    heading: '2. 回収費用',
    body:
      'ご家庭で使用されていたPCで、PCリサイクルマーク付きの製品は無料で回収可能です。' +
      'マーク無しの製品は所定のリサイクル料金が発生します。' +
      '事業所から排出されるPCは産業廃棄物扱いとなり、別途お見積もりとなります。',
  },
  {
    heading: '3. データ消去について',
    body:
      '回収前にお客様ご自身でデータバックアップ・消去を行っていただくことを推奨します。' +
      'ご希望の場合、米国国防総省規格（DoD 5220.22-M）に準拠した物理消去サービスも承ります（有償）。' +
      '消去証明書の発行も可能です。',
  },
  {
    heading: '4. お申込みの流れ',
    body:
      'STEP 1：下記メールまたはお問い合わせフォームより、機種・台数・現在地をご連絡ください。\n' +
      'STEP 2：担当者よりお見積もりと回収方法（宅配便着払い／お持ち込み／集荷）をご案内します。\n' +
      'STEP 3：お申込み後、回収・データ消去を実施。完了後にレポートをお送りします。',
  },
  {
    heading: '5. お問い合わせ窓口',
    body:
      'リサイクル・引取に関するご相談は下記までご連絡ください。\n' +
      'メール：customersupport@mng-base.com\n' +
      '電話：03-6903-5371（平日10:00〜18:00）',
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
  const cms = await loadStaticPageBySlug(adminClient, 'recycle');
  return {cms};
}

export const meta: Route.MetaFunction = ({data}) => {
  const cms = (data as {cms?: StaticPageCms | null} | undefined)?.cms;
  const useCms = cms && cms.isPublished;
  const title = `${useCms && cms.title ? cms.title : HARDCODED_TITLE} | ASTROMEDA`;
  const description = useCms && cms.metaDescription ? cms.metaDescription : HARDCODED_META_DESC;
  const url = `${STORE_URL}/recycle`;
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

export default function Recycle() {
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
            PC RECYCLE
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
            リサイクル・引取をお申し込みの方はこちら
          </p>
          <a
            href="mailto:customersupport@mng-base.com?subject=PCリサイクル申込"
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
            リサイクルお申込み
          </a>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
