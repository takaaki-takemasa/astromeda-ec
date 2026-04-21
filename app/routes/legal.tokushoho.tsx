/**
 * 特定商取引法に基づく表示
 * EC運営に必須の法的ページ。
 *
 * patch 0093: astromeda_legal_info Metaobject 駆動化。
 * 会社・特商法・保証の各フィールドは rootData.metaLegalInfo を優先し、
 * 未入力または Metaobject 不在時は LEGAL 定数にフォールバック。
 * これにより管理画面 (サイト設定 > 法務) のみで本ページが編集可能。
 */
import type {Route} from './+types/legal.tokushoho';
import {useRouteLoaderData} from 'react-router';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {STORE_URL} from '~/lib/astromeda-data';
import {mergeLegal} from '~/lib/legal-overlay';
import type {RootLoader} from '~/root';

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

export default function Tokushoho() {
  const rootData = useRouteLoaderData<RootLoader>('root');
  const legal = mergeLegal(rootData?.metaLegalInfo || null);

  // patch 0093: 会社情報+特商法+保証+決済サポート+配送情報を Metaobject 駆動で構築。
  // 既存 UI (13 rows) を保持するため、label と value の配列をそのまま組み立てる。
  const rows: [string, string][] = [
    ['販売業者', legal.tokusho.seller],
    ['代表者', legal.tokusho.resp],
    ['所在地', legal.tokusho.addr],
    ['電話番号', `${legal.tokusho.tel}（受付時間：平日10:00〜18:00）`],
    ['メールアドレス', legal.tokusho.email],
    ['URL', STORE_URL],
    ['商品代金以外の必要料金', '消費税（税込価格表示）、送料（商品ページに記載）'],
    ['支払方法', legal.tokusho.pay],
    ['支払時期', 'クレジットカード：ご注文時に決済。後払い：各サービスの規約に準じます。'],
    ['商品の引渡時期', legal.tokusho.shipTime],
    ['返品・交換について', legal.tokusho.returnP],
    ['保証について', legal.warranty.base],
    ['動作環境', 'ゲーミングPC：商品ページに記載のスペック表をご確認ください。'],
  ];

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
