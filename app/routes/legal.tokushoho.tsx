/**
 * 特定商取引法に基づく表示
 * EC運営に必須の法的ページ。
 */
import type {Route} from './+types/legal.tokushoho';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {STORE_URL} from '~/lib/astromeda-data';

export const meta: Route.MetaFunction = () => {
  const title = '特定商取引法に基づく表示 | ASTROMEDA ゲーミングPC';
  const description = 'ASTROMEDAの特定商取引法に基づく表示。販売業者、所在地、返品・交換ポリシー等。';
  const url = `${STORE_URL}/legal/tokushoho`;
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
  bg: '#06060C',
  t1: 'rgba(255,255,255,0.12)',
  t3: 'rgba(255,255,255,0.7)',
  t5: 'rgba(255,255,255,1)',
  accent: '#00e5ff',
};

const rows: [string, string][] = [
  ['販売業者', '株式会社マイニングベース'],
  ['代表者', '武正 貴昭'],
  ['所在地', '〒162-0825 東京都新宿区神楽坂3-2-15'],
  ['電話番号', '03-6265-3740（受付時間：平日10:00〜18:00）'],
  ['メールアドレス', 'support@mining-base.co.jp'],
  ['URL', STORE_URL],
  ['商品代金以外の必要料金', '消費税（税込価格表示）、送料（商品ページに記載）'],
  ['支払方法', 'クレジットカード（VISA / Mastercard / AMEX / JCB）、Shopify Payments、PayPay、Amazon Pay、あと払い（Paidy）'],
  ['支払時期', 'クレジットカード：ご注文時に決済。後払い：各サービスの規約に準じます。'],
  ['商品の引渡時期', 'ご注文確認後、通常5〜14営業日以内に発送。受注生産品は商品ページに記載の期間。'],
  ['返品・交換について', '商品到着後7日以内にご連絡ください。初期不良の場合は無償交換。お客様都合による返品は未開封・未使用品に限り承ります（送料はお客様負担）。'],
  ['保証について', 'ゲーミングPC：1年間無償保証。周辺機器・グッズ：初期不良のみ対応。'],
  ['動作環境', 'ゲーミングPC：商品ページに記載のスペック表をご確認ください。'],
];

export default function Tokushoho() {
  return (
    <div style={{
      maxWidth: 800, margin: '0 auto', padding: '60px 20px 80px',
      color: T.t3, fontFamily: "'Noto Sans JP', 'Outfit', sans-serif",
    }}>
      <h1 style={{
        fontSize: 22, fontWeight: 800, color: T.t5,
        marginBottom: 30, letterSpacing: 1,
      }}>
        特定商取引法に基づく表示
      </h1>

      <table style={{
        width: '100%', borderCollapse: 'collapse',
        fontSize: 14, lineHeight: 1.8,
      }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} style={{borderBottom: `1px solid ${T.t1}`}}>
              <th style={{
                textAlign: 'left', padding: '14px 16px 14px 0',
                fontWeight: 700, color: T.t5, whiteSpace: 'nowrap',
                verticalAlign: 'top', width: '30%',
              }}>
                {label}
              </th>
              <td style={{padding: '14px 0', color: T.t3}}>
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{
        marginTop: 40, fontSize: 12, color: 'rgba(255,255,255,0.4)',
        lineHeight: 1.6,
      }}>
        ※ 上記は特定商取引法第11条に基づく表示です。
        記載内容は予告なく変更する場合があります。最新の情報は本ページをご確認ください。
      </p>
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
