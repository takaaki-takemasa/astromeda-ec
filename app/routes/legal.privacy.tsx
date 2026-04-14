/**
 * プライバシーポリシー詳細版
 * 個人情報保護法・GDPR対応の詳細プライバシーポリシー。
 * Shopifyのpolicies.$handleとは別に独立ページとして提供。
 */
import type {Route} from './+types/legal.privacy';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {STORE_URL} from '~/lib/astromeda-data';

export const meta: Route.MetaFunction = () => {
  const title = 'プライバシーポリシー | ASTROMEDA ゲーミングPC';
  const description = 'ASTROMEDAのプライバシーポリシー。個人情報の収集・利用・管理について。';
  const url = `${STORE_URL}/legal/privacy`;
  return [
    {title},
    {name: 'description', content: description},
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:url', content: url},
    {name: 'twitter:card', content: 'summary'},
    {name: 'twitter:title', content: title},
  ];
};

const T = {
  t1: 'rgba(255,255,255,0.12)',
  t3: 'rgba(255,255,255,0.7)',
  t5: 'rgba(255,255,255,1)',
  accent: '#00e5ff',
};

function Section({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <section style={{marginBottom: 32}}>
      <h2 style={{
        fontSize: 16, fontWeight: 800, color: T.t5,
        marginBottom: 12, paddingBottom: 6,
        borderBottom: `1px solid ${T.t1}`,
      }}>
        {title}
      </h2>
      <div style={{fontSize: 14, lineHeight: 1.9, color: T.t3}}>
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <div style={{
      maxWidth: 800, margin: '0 auto', padding: '60px 20px 80px',
      color: T.t3, fontFamily: "'Noto Sans JP', 'Outfit', sans-serif",
    }}>
      <h1 style={{
        fontSize: 22, fontWeight: 800, color: T.t5,
        marginBottom: 10, letterSpacing: 1,
      }}>
        プライバシーポリシー
      </h1>
      <p style={{fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 30}}>
        最終更新日: 2026年4月7日
      </p>

      <Section title="1. 事業者情報">
        <p>
          株式会社マイニングベース（以下「当社」）は、ASTROMEDA ECサイト（以下「本サービス」）を運営するにあたり、
          お客様の個人情報の保護に最大限の注意を払います。
        </p>
      </Section>

      <Section title="2. 収集する個人情報">
        <p>当社は以下の情報を収集します。</p>
        <p style={{marginTop: 8}}>
          <strong style={{color: T.t5}}>注文・会員情報：</strong>氏名、メールアドレス、住所、電話番号、決済情報（カード番号は当社では保持せず、Shopify Payments経由で処理）。
        </p>
        <p style={{marginTop: 8}}>
          <strong style={{color: T.t5}}>閲覧情報：</strong>アクセスログ、IPアドレス、Cookie、閲覧ページ、デバイス情報。Google Analytics 4、Microsoft Clarity、Meta Pixelを使用しています。
        </p>
      </Section>

      <Section title="3. 個人情報の利用目的">
        <p>
          商品の発送・決済処理、お問い合わせ対応、サービス改善のための分析、マーケティング（広告配信の最適化）、
          法令に基づく対応に利用します。
        </p>
      </Section>

      <Section title="4. 第三者への提供">
        <p>
          お客様の同意がある場合、法令に基づく場合、及び業務委託先（配送業者、決済代行業者）への
          必要最小限の情報提供を除き、第三者に個人情報を提供しません。
        </p>
      </Section>

      <Section title="5. Cookieと計測ツール">
        <p>
          本サービスでは以下の計測ツールを使用しています。
        </p>
        <p style={{marginTop: 8}}>
          <strong style={{color: T.t5}}>Google Analytics 4</strong> — サイト利用状況の分析。Google社のプライバシーポリシーに基づきデータが処理されます。
        </p>
        <p style={{marginTop: 8}}>
          <strong style={{color: T.t5}}>Microsoft Clarity</strong> — ヒートマップ・セッションリプレイによるUX改善分析。
        </p>
        <p style={{marginTop: 8}}>
          <strong style={{color: T.t5}}>Meta Pixel</strong> — Facebook/Instagram広告の効果測定。
        </p>
        <p style={{marginTop: 8}}>
          <strong style={{color: T.t5}}>Google Tag Manager</strong> — 上記計測タグの一括管理。
        </p>
        <p style={{marginTop: 8}}>
          ブラウザの設定でCookieを無効にすることが可能ですが、一部機能が制限される場合があります。
        </p>
      </Section>

      <Section title="6. 個人情報の安全管理">
        <p>
          SSL/TLS暗号化通信、アクセス制御、定期的なセキュリティ監査を実施し、個人情報への不正アクセス、
          紛失、漏洩等の防止に努めます。
        </p>
      </Section>

      <Section title="7. お客様の権利">
        <p>
          お客様は自己の個人情報について、開示・訂正・削除・利用停止を請求する権利を有します。
          ご希望の場合はsupport@mining-base.co.jpまでご連絡ください。
        </p>
      </Section>

      <Section title="8. お問い合わせ窓口">
        <p>
          個人情報の取り扱いに関するお問い合わせは下記までお願いします。
        </p>
        <p style={{marginTop: 8}}>
          株式会社マイニングベース 個人情報保護担当<br />
          メール: support@mining-base.co.jp<br />
          電話: 03-6265-3740（平日10:00〜18:00）
        </p>
      </Section>

      <Section title="9. ポリシーの変更">
        <p>
          本ポリシーは法令改正やサービス変更に伴い、予告なく変更する場合があります。
          変更後のポリシーは本ページへの掲載時点で効力を生じます。
        </p>
      </Section>
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
