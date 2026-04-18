/**
 * よじまるPCページ
 *
 * SEO最適化:
 * - meta description 設定
 * - canonical URL
 * - よじまるPCコラボレーションのランディングページ
 *
 * patch 0020 (P0-C): astromeda_static_page (page_slug='yojimaru') から
 * title / meta_description / sections_json をオーバーライド可能に接続。
 */

import {useLoaderData} from 'react-router';
import type {Route} from './+types/yojimaru';
import {T, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {loadStaticPageBySlug, type StaticPageCms} from '~/lib/static-page-loader';

const HARDCODED_TITLE = 'よじまるPC';
const HARDCODED_META_DESC =
  'よじまるさんコラボレーションPC。ストリーマー監修のゲーミング環境を、ASTROMEDAのカラーバリエーション・カスタマイズと共にお届けします。';
const HARDCODED_LEAD =
  'ストリーマー「よじまる」さん監修のコラボレーションゲーミングPC。';

const HARDCODED_SECTIONS = [
  {
    heading: '1. コラボレーションについて',
    body:
      '人気ストリーマーのよじまるさんとのコラボレーションPC。' +
      '配信・ゲームプレイの両面で快適にご利用いただけるスペック構成を、' +
      'よじまるさん本人の監修のもとで設計しています。\n' +
      'ASTROMEDAのカラー8色展開・カスタマイズオプションと組み合わせて、' +
      'あなただけの1台を仕立ててください。',
  },
  {
    heading: '2. ラインナップ',
    body:
      'よじまるPCコラボレーションの最新ラインナップは、ゲーミングPCコレクション内でご確認いただけます。' +
      '予約・販売状況については、メールマガジンや公式SNSでも随時お知らせしています。',
  },
  {
    heading: '3. お問い合わせ',
    body:
      'よじまるPCに関するご質問・在庫状況のお問い合わせは下記までお気軽にご連絡ください。\n' +
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
  const cms = await loadStaticPageBySlug(adminClient, 'yojimaru');
  return {cms};
}

export const meta: Route.MetaFunction = ({data}) => {
  const cms = (data as {cms?: StaticPageCms | null} | undefined)?.cms;
  const useCms = cms && cms.isPublished;
  const title = `${useCms && cms.title ? cms.title : HARDCODED_TITLE} | ASTROMEDA ゲーミングPC`;
  const description = useCms && cms.metaDescription ? cms.metaDescription : HARDCODED_META_DESC;
  const url = `${STORE_URL}/yojimaru`;
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

export default function Yojimaru() {
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
            STREAMER COLLABORATION
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
            よじまるPCのラインナップを見る
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
            ゲーミングPCを見る
          </a>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
