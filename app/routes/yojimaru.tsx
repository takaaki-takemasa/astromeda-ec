/**
 * よじまるPCページ
 *
 * SEO最適化:
 * - meta description 設定
 * - canonical URL
 * - よじまるPCコラボレーションのランディングページ
 */

import type {Route} from './+types/yojimaru';
import {T, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

export const meta: Route.MetaFunction = () => {
  const title = 'よじまるPC | ASTROMEDA ゲーミングPC';
  const description =
    'よじまるさんコラボレーションPC。ストリーマー監修のゲーミング環境を、ASTROMEDAのカラーバリエーション・カスタマイズと共にお届けします。';
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
      <div style={{fontSize: 14, lineHeight: 1.9, color: 'rgba(255,255,255,.7)'}}>
        {children}
      </div>
    </section>
  );
}

export default function Yojimaru() {
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
            よじまるPC
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.6)',
              lineHeight: 1.6,
            }}
          >
            ストリーマー「よじまる」さん監修のコラボレーションゲーミングPC。
          </p>
        </div>

        <Section title="コラボレーションについて">
          <p>
            人気ストリーマーのよじまるさんとのコラボレーションPC。
            配信・ゲームプレイの両面で快適にご利用いただけるスペック構成を、
            よじまるさん本人の監修のもとで設計しています。
          </p>
          <p style={{marginTop: 8}}>
            ASTROMEDAのカラー8色展開・カスタマイズオプションと組み合わせて、
            あなただけの1台を仕立ててください。
          </p>
        </Section>

        <Section title="ラインナップ">
          <p>
            よじまるPCコラボレーションの最新ラインナップは、ゲーミングPCコレクション内でご確認いただけます。
            予約・販売状況については、メールマガジンや公式SNSでも随時お知らせしています。
          </p>
          <p style={{marginTop: 12}}>
            <a
              href="/collections/gaming-pc"
              style={{color: T.c, textDecoration: 'underline', fontWeight: 700}}
            >
              ゲーミングPCコレクションを見る →
            </a>
          </p>
        </Section>

        <Section title="お問い合わせ">
          <p>
            よじまるPCに関するご質問・在庫状況のお問い合わせは下記までお気軽にご連絡ください。
          </p>
          <p style={{marginTop: 8}}>
            <strong style={{color: '#fff'}}>メール：</strong>customersupport@mng-base.com<br />
            <strong style={{color: '#fff'}}>電話：</strong>03-6903-5371（平日10:00〜18:00）
          </p>
        </Section>

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
