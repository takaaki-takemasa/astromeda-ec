/**
 * 保証ページ
 *
 * SEO最適化:
 * - meta description 設定
 * - canonical URL
 * - 標準1年保証 + 延長保証3年プランの案内
 */

import type {Route} from './+types/warranty';
import {T, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

export const meta: Route.MetaFunction = () => {
  const title = '保証・修理について | ASTROMEDA ゲーミングPC';
  const description =
    'ASTROMEDAゲーミングPCの保証内容。標準1年保証＋延長保証（合計3年）、修理対応、サポート窓口についてご案内します。';
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
      <div style={{fontSize: 14, lineHeight: 1.9, color: 'rgba(255,255,255,.7)'}}>
        {children}
      </div>
    </section>
  );
}

export default function Warranty() {
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
            保証・修理について
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.6)',
              lineHeight: 1.6,
            }}
          >
            ASTROMEDAは、お客様に長く安心してお使いいただけるよう、充実した保証とサポートをご用意しています。
          </p>
        </div>

        <Section title="1. 標準保証（メーカー1年保証）">
          <p>
            すべてのASTROMEDAゲーミングPCには、ご購入日から1年間のメーカー保証が標準付帯されています。
            CPU・GPU・マザーボード・電源・ストレージ・メモリを含む全パーツの自然故障が対象です。
          </p>
          <p style={{marginTop: 8}}>
            保証期間内の修理は、送料を含めて完全無料で対応いたします。
          </p>
        </Section>

        <Section title="2. 延長保証（合計3年）">
          <p>
            標準保証に加え、2年間の延長保証（合計3年保証）を <strong style={{color: '#fff'}}>¥14,800</strong>{' '}
            でご用意しています。延長保証はご注文時のオプションでお選びいただけます。
          </p>
          <p style={{marginTop: 8}}>
            延長保証期間中も、CPU・GPUを含む全パーツの自然故障に対して工賃・送料を無料で対応します。
          </p>
        </Section>

        <Section title="3. 修理対応について">
          <p>
            修理部材を在庫運用しており、お預かりから最短翌日〜3営業日で返却しています。
            繁忙期や特殊パーツの場合は若干お時間をいただくことがあります。
          </p>
          <p style={{marginTop: 8}}>
            <strong style={{color: '#fff'}}>保証期間内：</strong>送料含め完全無料
          </p>
          <p style={{marginTop: 4}}>
            <strong style={{color: '#fff'}}>保証期間後：</strong>工賃無料・パーツ代のみ実費
          </p>
        </Section>

        <Section title="4. 保証対象外となるケース">
          <p>以下のケースは保証の対象外となります。</p>
          <p style={{marginTop: 8}}>
            ・お客様による改造・分解・誤った使用に起因する故障<br />
            ・天災・火災・水没・落下・衝撃などによる物理破損<br />
            ・経年劣化による性能低下<br />
            ・消耗品（ケースファン軸受け等）の自然摩耗<br />
            ・ソフトウェアのインストール不具合・ウイルス感染
          </p>
        </Section>

        <Section title="5. 初期不良対応">
          <p>
            商品到着後7日以内に動作不良が確認された場合は、初期不良として無償で修理・交換対応いたします。
            到着時の梱包材は念のため保管をお願いいたします。
          </p>
        </Section>

        <Section title="6. サポート窓口">
          <p>
            修理・保証に関するお問い合わせは下記までご連絡ください。
            メール・電話・LINEでのサポートを永年提供しています。
          </p>
          <p style={{marginTop: 8}}>
            <strong style={{color: '#fff'}}>メール：</strong>customersupport@mng-base.com<br />
            <strong style={{color: '#fff'}}>電話：</strong>03-6903-5371（平日10:00〜18:00）<br />
            <strong style={{color: '#fff'}}>LINE：</strong>公式LINEアカウントよりお気軽にお問い合わせください
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
