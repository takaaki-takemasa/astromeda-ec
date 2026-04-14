/**
 * ShippingEstimate — 配送見積もり表示コンポーネント
 *
 * 商品ページで配送情報を表示:
 * - PC: 受注生産 10〜15営業日 + 送料¥3,300
 * - ガジェット/グッズ: 3〜5営業日 + 送料別途表示
 *
 * 商品タイプ（PC/ガジェット/グッズ）はタイトルとタグから自動判定。
 */

import {T, al} from '~/lib/astromeda-data';

interface ShippingEstimateProps {
  /** 商品タイトル */
  productTitle: string;
  /** 商品タグ */
  productTags?: string[];
  /** 商品タイプ */
  productType?: string;
}

type ProductCategory = 'pc' | 'gadget' | 'goods';

const SHIPPING_INFO: Record<
  ProductCategory,
  {label: string; time: string; cost: string; icon: string}
> = {
  pc: {
    label: 'ゲーミングPC',
    time: '注文後10〜15営業日前後',
    cost: '全国一律 ¥3,300',
    icon: '🖥️',
  },
  gadget: {
    label: 'ガジェット',
    time: '3〜5営業日',
    cost: '商品により異なります',
    icon: '⌨️',
  },
  goods: {
    label: 'グッズ',
    time: '3〜5営業日',
    cost: '商品により異なります',
    icon: '🎁',
  },
};

// PC判定キーワード
const PC_KEYWORDS = ['PC', 'GAMER', 'STREAMER', 'CREATOR', 'ゲーミング', 'デスクトップ'];
// ガジェット判定キーワード
const GADGET_KEYWORDS = ['マウスパッド', 'キーボード', 'PCケース', 'パネル', '着せ替え', 'ケースファン'];
// グッズ判定キーワード
const GOODS_KEYWORDS = ['アクリル', 'Tシャツ', 'パーカー', '缶バッジ', 'メタルカード', 'アクキー', 'トートバッグ', 'モバイルバッテリー'];

function detectCategory(
  title: string,
  tags: string[],
  productType?: string,
): ProductCategory {
  const combined = [title, ...tags, productType || ''].join(' ');

  if (PC_KEYWORDS.some((kw) => combined.includes(kw))) return 'pc';
  if (GADGET_KEYWORDS.some((kw) => combined.includes(kw))) return 'gadget';
  if (GOODS_KEYWORDS.some((kw) => combined.includes(kw))) return 'goods';

  // デフォルトはPC（Astromedaの主力商品）
  return 'pc';
}

export function ShippingEstimate({
  productTitle,
  productTags = [],
  productType,
}: ShippingEstimateProps) {
  const category = detectCategory(productTitle, productTags, productType);
  const info = SHIPPING_INFO[category];

  return (
    <div
      style={{
        marginTop: 16,
        padding: '14px 16px',
        background: T.bgC,
        borderRadius: 12,
        border: `1px solid ${T.bd}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span style={{fontSize: 14}}>{info.icon}</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: T.tx,
          }}
        >
          配送情報
        </span>
        <span
          style={{
            fontSize: 9,
            padding: '2px 6px',
            borderRadius: 4,
            background: al(T.c, 0.1),
            color: T.c,
            fontWeight: 600,
          }}
        >
          {info.label}
        </span>
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: T.t5,
            }}
          >
            お届け目安
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: T.tx,
            }}
          >
            {info.time}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: T.t5,
            }}
          >
            送料
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: T.tx,
            }}
          >
            {info.cost}
          </span>
        </div>
      </div>
      <p
        style={{
          fontSize: 10,
          color: al(T.tx, 0.35),
          margin: '8px 0 0',
          lineHeight: 1.4,
        }}
      >
        ※ 土日祝を除く営業日での目安です。在庫状況により変動する場合があります。
      </p>
    </div>
  );
}
