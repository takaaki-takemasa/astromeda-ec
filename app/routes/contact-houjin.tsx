/**
 * 法人お問い合わせページ
 *
 * SEO最適化:
 * - meta description 設定
 * - canonical URL
 * - 法人・教育機関・大量導入向けの専用窓口案内
 */

import type {Route} from './+types/contact-houjin';
import {T, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

export const meta: Route.MetaFunction = () => {
  const title = '法人のお客様 | ASTROMEDA ゲーミングPC';
  const description =
    'ASTROMEDAは法人・教育機関・eスポーツチーム向けの大量導入・カスタマイズ・請求書払いに対応しています。お見積もり・導入相談はこちらから。';
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
      <div style={{fontSize: 14, lineHeight: 1.9, color: 'rgba(255,255,255,.7)'}}>
        {children}
      </div>
    </section>
  );
}

export default function ContactHoujin() {
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
            法人のお客様
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.6)',
              lineHeight: 1.6,
            }}
          >
            ASTROMEDAは法人・教育機関・eスポーツチーム様向けの大量導入・カスタマイズに対応しています。
          </p>
        </div>

        <Section title="法人向けサービスのご案内">
          <p>
            ASTROMEDAでは、企業・教育機関・eスポーツチーム・配信スタジオ・ゲーミングカフェなど、
            法人のお客様向けに以下のサービスをご提供しています。
          </p>
          <p style={{marginTop: 8}}>
            ・大量導入時の特別価格ご提案<br />
            ・複数台一括カスタマイズ・統一仕様での製造<br />
            ・請求書払い（与信審査後）<br />
            ・納品先一括配送・分散配送<br />
            ・3年延長保証の標準付帯<br />
            ・専任担当者による導入後サポート
          </p>
        </Section>

        <Section title="主な導入実績">
          <p>
            ASTROMEDAのゲーミングPCは、プロeスポーツチーム、配信スタジオ、教育機関、
            ゲーム実況者の制作環境など幅広いシーンでご利用いただいています。
            守秘義務契約の範囲内で実績資料をご提示することも可能です。
          </p>
        </Section>

        <Section title="お見積もり・ご相談の流れ">
          <p>
            <strong style={{color: '#fff'}}>STEP 1：</strong>
            下記メールアドレスにご用途・想定台数・希望スペック・納期をお知らせください。
          </p>
          <p style={{marginTop: 6}}>
            <strong style={{color: '#fff'}}>STEP 2：</strong>
            担当者より2営業日以内にヒアリングのご連絡を差し上げます。
          </p>
          <p style={{marginTop: 6}}>
            <strong style={{color: '#fff'}}>STEP 3：</strong>
            お見積もり書・仕様書をご提示します（必要に応じて貸出機の手配も可能）。
          </p>
          <p style={{marginTop: 6}}>
            <strong style={{color: '#fff'}}>STEP 4：</strong>
            ご発注後、製造開始。納期に合わせて配送・設置までサポートいたします。
          </p>
        </Section>

        <Section title="お問い合わせ窓口">
          <p>
            法人のお客様専用窓口にて承ります。
            お見積もり・導入相談・カスタマイズのご要望など、お気軽にご連絡ください。
          </p>
          <p style={{marginTop: 8}}>
            <strong style={{color: '#fff'}}>メール：</strong>business@mng-base.com<br />
            <strong style={{color: '#fff'}}>電話：</strong>03-6903-5371（平日10:00〜18:00）<br />
            <strong style={{color: '#fff'}}>運営会社：</strong>株式会社マイニングベース
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
