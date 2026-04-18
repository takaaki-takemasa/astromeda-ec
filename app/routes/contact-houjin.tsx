/**
 * 法人お問い合わせページ
 *
 * SEO最適化:
 * - meta description 設定
 * - canonical URL
 * - 法人・教育機関・大量導入向けの専用窓口案内
 *
 * patch 0020 (P0-C): astromeda_static_page (page_slug='contact-houjin') から
 * title / meta_description / sections_json をオーバーライド可能に接続。
 */

import {useLoaderData} from 'react-router';
import type {Route} from './+types/contact-houjin';
import {T, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {loadStaticPageBySlug, type StaticPageCms} from '~/lib/static-page-loader';

const HARDCODED_TITLE = '法人のお客様';
const HARDCODED_META_DESC =
  'ASTROMEDAは法人・教育機関・eスポーツチーム向けの大量導入・カスタマイズ・請求書払いに対応しています。お見積もり・導入相談はこちらから。';
const HARDCODED_LEAD =
  'ASTROMEDAは法人・教育機関・eスポーツチーム様向けの大量導入・カスタマイズに対応しています。';

const HARDCODED_SECTIONS = [
  {
    heading: '1. 法人向けサービスのご案内',
    body:
      'ASTROMEDAでは、企業・教育機関・eスポーツチーム・配信スタジオ・ゲーミングカフェなど、' +
      '法人のお客様向けに以下のサービスをご提供しています。\n' +
      '・大量導入時の特別価格ご提案\n' +
      '・複数台一括カスタマイズ・統一仕様での製造\n' +
      '・請求書払い（与信審査後）\n' +
      '・納品先一括配送・分散配送\n' +
      '・3年延長保証の標準付帯\n' +
      '・専任担当者による導入後サポート',
  },
  {
    heading: '2. 主な導入実績',
    body:
      'ASTROMEDAのゲーミングPCは、プロeスポーツチーム、配信スタジオ、教育機関、' +
      'ゲーム実況者の制作環境など幅広いシーンでご利用いただいています。' +
      '守秘義務契約の範囲内で実績資料をご提示することも可能です。',
  },
  {
    heading: '3. お見積もり・ご相談の流れ',
    body:
      'STEP 1：下記メールアドレスにご用途・想定台数・希望スペック・納期をお知らせください。\n' +
      'STEP 2：担当者より2営業日以内にヒアリングのご連絡を差し上げます。\n' +
      'STEP 3：お見積もり書・仕様書をご提示します（必要に応じて貸出機の手配も可能）。\n' +
      'STEP 4：ご発注後、製造開始。納期に合わせて配送・設置までサポートいたします。',
  },
  {
    heading: '4. お問い合わせ窓口',
    body:
      '法人のお客様専用窓口にて承ります。お見積もり・導入相談・カスタマイズのご要望など、' +
      'お気軽にご連絡ください。\n' +
      'メール：business@mng-base.com\n' +
      '電話：03-6903-5371（平日10:00〜18:00）\n' +
      '運営会社：株式会社マイニングベース',
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
  const cms = await loadStaticPageBySlug(adminClient, 'contact-houjin');
  return {cms};
}

export const meta: Route.MetaFunction = ({data}) => {
  const cms = (data as {cms?: StaticPageCms | null} | undefined)?.cms;
  const useCms = cms && cms.isPublished;
  const title = `${useCms && cms.title ? cms.title : HARDCODED_TITLE} | ASTROMEDA ゲーミングPC`;
  const description = useCms && cms.metaDescription ? cms.metaDescription : HARDCODED_META_DESC;
  const url = `${STORE_URL}/contact-houjin`;
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

export default function ContactHoujin() {
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
            FOR BUSINESS
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
            法人・教育機関のお見積もりはこちら
          </p>
          <a
            href="mailto:business@mng-base.com"
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
            法人窓口へお問い合わせ
          </a>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
