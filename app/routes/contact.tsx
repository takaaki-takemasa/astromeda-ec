/**
 * 一般お問い合わせページ
 *
 * SEO最適化:
 * - meta description 設定
 * - canonical URL
 * - お問い合わせ窓口・連絡手段を案内
 */

import type {Route} from './+types/contact';
import {T, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

export const meta: Route.MetaFunction = () => {
  const title = 'お問い合わせ | ASTROMEDA ゲーミングPC';
  const description =
    'ASTROMEDAへのお問い合わせ窓口。商品・注文・配送・保証・修理に関するご質問は、メール・電話・LINEからお気軽にお問い合わせください。';
  const url = `${STORE_URL}/contact`;
  return [
    {title},
    {name: 'description', content: description},
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:url', content: url},
    {name: 'twitter:card', content: 'summary'},
    {name: 'twitter:title', content: title},
  ];
};

function Card({
  icon,
  title,
  body,
  cta,
  href,
}: {
  icon: string;
  title: string;
  body: string;
  cta: string;
  href: string;
}) {
  return (
    <a
      href={href}
      style={{
        display: 'block',
        padding: 24,
        background: 'rgba(255,255,255,.03)',
        border: '1px solid rgba(255,255,255,.06)',
        borderRadius: 14,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color .2s',
      }}
    >
      <div style={{fontSize: 28, marginBottom: 8}}>{icon}</div>
      <div style={{fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 6}}>{title}</div>
      <div style={{fontSize: 13, color: 'rgba(255,255,255,.65)', lineHeight: 1.6, marginBottom: 12}}>
        {body}
      </div>
      <div style={{fontSize: 12, fontWeight: 700, color: T.c, letterSpacing: '0.05em'}}>
        {cta} →
      </div>
    </a>
  );
}

export default function Contact() {
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
            CONTACT
          </span>
          <h1
            style={{
              fontSize: 'clamp(24px, 4vw, 36px)',
              fontWeight: 900,
              margin: '0 0 12px',
            }}
          >
            お問い合わせ
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.6)',
              lineHeight: 1.6,
            }}
          >
            ご質問・ご相談は下記の窓口よりお気軽にお問い合わせください。
            <br />
            よくあるご質問は<a href="/faq" style={{color: T.c, textDecoration: 'underline'}}>FAQページ</a>もご確認ください。
          </p>
        </div>

        {/* Contact channels */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 48,
          }}
        >
          <Card
            icon="✉"
            title="メール"
            body="24時間受付。1〜2営業日以内にご返信いたします。"
            cta="メールを送る"
            href="mailto:customersupport@mng-base.com"
          />
          <Card
            icon="☎"
            title="電話"
            body="平日10:00〜18:00（土日祝休業）"
            cta="03-6903-5371"
            href="tel:0369035371"
          />
          <Card
            icon="💬"
            title="LINE"
            body="公式LINEアカウントから直接お問い合わせいただけます。"
            cta="LINEで相談"
            href="https://lin.ee/your-line-id"
          />
        </div>

        {/* Inquiry types */}
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
            お問い合わせ内容別の窓口
          </h2>
          <div style={{fontSize: 14, lineHeight: 1.9, color: 'rgba(255,255,255,.7)'}}>
            <p>
              <strong style={{color: '#fff'}}>商品・スペックに関するご質問：</strong>
              customersupport@mng-base.com
            </p>
            <p style={{marginTop: 8}}>
              <strong style={{color: '#fff'}}>注文・配送に関するご質問：</strong>
              customersupport@mng-base.com
            </p>
            <p style={{marginTop: 8}}>
              <strong style={{color: '#fff'}}>保証・修理に関するご質問：</strong>
              customersupport@mng-base.com（<a href="/warranty" style={{color: T.c}}>保証ページ</a>もご参照ください）
            </p>
            <p style={{marginTop: 8}}>
              <strong style={{color: '#fff'}}>法人・教育機関・大量導入のご相談：</strong>
              <a href="/contact-houjin" style={{color: T.c}}>法人お問い合わせページ</a>
            </p>
            <p style={{marginTop: 8}}>
              <strong style={{color: '#fff'}}>取材・メディア掲載のご依頼：</strong>
              press@mng-base.com
            </p>
          </div>
        </section>

        {/* Note */}
        <section
          style={{
            padding: 20,
            background: 'rgba(255,255,255,.03)',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,.06)',
            fontSize: 13,
            color: 'rgba(255,255,255,.6)',
            lineHeight: 1.7,
          }}
        >
          <p>
            <strong style={{color: '#fff'}}>ご注意：</strong>
            お問い合わせの内容によりご返信までお時間をいただく場合があります。
            お急ぎの場合はお電話またはLINEをご利用ください。
            個人情報のお取り扱いについては
            <a href="/legal/privacy" style={{color: T.c}}>プライバシーポリシー</a>
            をご確認ください。
          </p>
        </section>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
