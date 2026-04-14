/**
 * 家電リサイクルページ
 *
 * SEO最適化:
 * - meta description 設定
 * - canonical URL
 * - 旧PCの引取・リサイクル制度のご案内
 */

import type {Route} from './+types/recycle';
import {T, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

export const meta: Route.MetaFunction = () => {
  const title = 'PCリサイクル・引取サービス | ASTROMEDA';
  const description =
    'ASTROMEDAでは資源有効利用促進法に基づき、不要になったパソコンの回収・リサイクルを承っています。データ消去対応・運搬手段のご案内まで、安心してお任せください。';
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
      <div style={{fontSize: 14, lineHeight: 1.9, color: 'rgba(255,255,255,.7)'}}>
        {children}
      </div>
    </section>
  );
}

export default function Recycle() {
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
            PCリサイクル・引取サービス
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.6)',
              lineHeight: 1.6,
            }}
          >
            ASTROMEDAでは資源有効利用促進法に基づき、不要になったパソコンの回収を承っています。
          </p>
        </div>

        <Section title="1. 対象機種">
          <p>
            デスクトップパソコン本体、ノートパソコン本体、CRT/液晶ディスプレイが回収対象となります。
            メーカー・購入時期は問いません。ASTROMEDA製以外のPCも回収可能です。
          </p>
          <p style={{marginTop: 8}}>
            ・デスクトップパソコン（本体のみ）<br />
            ・ノートパソコン<br />
            ・液晶ディスプレイ／CRTディスプレイ<br />
            ・一体型パソコン
          </p>
        </Section>

        <Section title="2. 回収費用">
          <p>
            ご家庭で使用されていたPCで、PCリサイクルマーク付きの製品は無料で回収可能です。
            マーク無しの製品は所定のリサイクル料金が発生します。
            事業所から排出されるPCは産業廃棄物扱いとなり、別途お見積もりとなります。
          </p>
        </Section>

        <Section title="3. データ消去について">
          <p>
            回収前にお客様ご自身でデータバックアップ・消去を行っていただくことを推奨します。
            ご希望の場合、米国国防総省規格（DoD 5220.22-M）に準拠した物理消去サービスも承ります（有償）。
            消去証明書の発行も可能です。
          </p>
        </Section>

        <Section title="4. お申込みの流れ">
          <p>
            <strong style={{color: '#fff'}}>STEP 1：</strong>
            下記メールまたはお問い合わせフォームより、機種・台数・現在地をご連絡ください。
          </p>
          <p style={{marginTop: 6}}>
            <strong style={{color: '#fff'}}>STEP 2：</strong>
            担当者よりお見積もりと回収方法（宅配便着払い／お持ち込み／集荷）をご案内します。
          </p>
          <p style={{marginTop: 6}}>
            <strong style={{color: '#fff'}}>STEP 3：</strong>
            お申込み後、回収・データ消去を実施。完了後にレポートをお送りします。
          </p>
        </Section>

        <Section title="5. お問い合わせ窓口">
          <p>
            リサイクル・引取に関するご相談は下記までご連絡ください。
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
