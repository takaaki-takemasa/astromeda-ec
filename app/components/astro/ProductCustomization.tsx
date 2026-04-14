/**
 * ProductCustomization — PC製品のカスタマイズオプション（メモリ、SSD、電源等）
 *
 * 本番サイトのCustomizeryアプリと同等の17カスタマイズ項目を
 * Shopify cart line item properties として送信。
 * PC製品のみ表示（ガジェット・グッズは非表示）。
 */

import React, {useState, useCallback, useMemo} from 'react';
import {T, al} from '~/lib/astromeda-data';

export interface CustomizationSelection {
  key: string;
  value: string;
}

/**
 * オプションラベルから追加価格を抽出（例: "+¥70,000" → 70000）
 * 「標準」や追加価格なしの場合は0を返す
 */
function parsePriceFromLabel(label: string): number {
  const match = label.match(/\+¥([\d,]+)/);
  if (!match) return 0;
  return parseInt(match[1].replace(/,/g, ''), 10);
}

/**
 * オプションvalueから追加価格を計算
 * STANDARD_OPTIONS内の対応するlabelを検索して価格を抽出
 */
function calcSurchargeForSelection(fieldName: string, value: string): number {
  const opt = STANDARD_OPTIONS.find((o) => o.name === fieldName);
  if (!opt) return 0;
  const chosen = opt.options.find((o) => o.value === value);
  if (!chosen) return 0;
  return parsePriceFromLabel(chosen.label);
}

interface CustomizationOption {
  name: string;
  options: {value: string; label: string}[];
  /** 別のフィールドの値に依存する条件付き表示 */
  dependsOn?: {field: string; value: string};
}

/**
 * 標準カスタマイズオプション定義
 * 本番サイト(Customizery)の設定を再現
 */
/**
 * フォールバック用カスタマイズオプション定義
 * メタオブジェクトからの動的取得が失敗した場合に使用
 * CMS管理画面から更新可能（Phase C完了後）
 */
export const STANDARD_OPTIONS: CustomizationOption[] = [
  {
    name: 'メモリ',
    options: [
      {value: 'DDR5(5200MHz以上)非LED32GB', label: 'DDR5 非LED 32GB（標準）'},
      {value: 'DDR5(5200MHz以上)非LED64GB', label: 'DDR5 非LED 64GB (+¥70,000)'},
      {value: 'DDR5(5200MHz以上)LED32GB ブラック', label: 'DDR5 LED 32GB ブラック (+¥35,000)'},
      {value: 'DDR5(5200MHz以上)LED64GB ブラック', label: 'DDR5 LED 64GB ブラック (+¥105,000)'},
    ],
  },
  {
    name: 'SSD(1つ目)',
    options: [
      {value: '500GB M.2 NVMe Gen4', label: '500GB NVMe Gen4（標準）'},
      {value: '1TB M.2 NVMe Gen4※おすすめ', label: '1TB NVMe Gen4 ※おすすめ (+¥20,000)'},
      {value: '2TB M.2 NVMe Gen4', label: '2TB NVMe Gen4 (+¥40,000)'},
      {value: '4TB M.2 NVMe Gen4', label: '4TB NVMe Gen4 (+¥90,000)'},
    ],
  },
  {
    name: 'SSD(2つ目)',
    options: [
      {value: '非搭載', label: '非搭載（標準）'},
      {value: '1TB M.2 NVMe Gen4', label: '1TB NVMe Gen4 (+¥20,000)'},
      {value: '2TB M.2 NVMe Gen4', label: '2TB NVMe Gen4 (+¥40,000)'},
      {value: '4TB M.2 NVMe Gen4', label: '4TB NVMe Gen4 (+¥90,000)'},
    ],
  },
  {
    name: 'HDD',
    options: [
      {value: '非搭載', label: '非搭載（標準）'},
      {value: '2TB(5400rpm)', label: '2TB (+¥10,000)'},
      {value: '4TB(5400rpm)', label: '4TB (+¥15,000)'},
      {value: '8TB(5400rpm)', label: '8TB (+¥25,000)'},
      {value: '10TB(5400rpm)', label: '10TB (+¥55,000)'},
    ],
  },
  {
    name: '電源',
    options: [
      {value: '650W BRONZE(ブラックケーブル)', label: '650W BRONZE（標準）'},
      {value: '750W BRONZE(ブラックケーブル)', label: '750W BRONZE (+¥5,000)'},
      {value: '850W 80PLUS認証 GOLD(ブラックケーブル)', label: '850W GOLD (+¥13,000)'},
    ],
  },
  {
    name: '電源スリーブケーブル',
    options: [
      {value: 'スリーブケーブルなし(標準電源ケーブル)', label: 'なし（標準）'},
      {value: 'ブラック(スリーブケーブル)', label: 'ブラック (+¥6,000)'},
      {value: 'ホワイト(スリーブケーブル)', label: 'ホワイト (+¥6,000)'},
      {value: 'ピンク(スリーブケーブル)', label: 'ピンク (+¥10,000)'},
      {value: 'パープル(スリーブケーブル)', label: 'パープル (+¥10,000)'},
      {value: 'オレンジ(スリーブケーブル)', label: 'オレンジ (+¥10,000)'},
      {value: 'ゴールド(スリーブケーブル)', label: 'ゴールド (+¥12,000)'},
    ],
  },
  {
    name: '水冷クーラー＆ケースファンカラーの変更',
    options: [
      {value: '変更なし(ケースと同色)', label: '変更なし（ケースと同色）'},
      {value: '変更あり', label: '変更あり'},
    ],
  },
  {
    name: '水冷クーラー＆ケースファンカラー',
    dependsOn: {field: '水冷クーラー＆ケースファンカラーの変更', value: '変更あり'},
    options: [
      {value: '変更なし(ケースと同色)', label: 'ケースと同色'},
      {value: 'ホワイト', label: 'ホワイト'},
      {value: 'ピンク', label: 'ピンク'},
    ],
  },
  {
    name: 'RGB GPU(グラフィックカード)ステイ',
    options: [
      {value: 'なし', label: 'なし（標準）'},
      {value: 'あり', label: 'あり (+¥5,000)'},
    ],
  },
  {
    name: 'RGB GPU(グラフィックカード)ステイカラー',
    dependsOn: {field: 'RGB GPU(グラフィックカード)ステイ', value: 'あり'},
    options: [
      {value: 'ブラック', label: 'ブラック'},
      {value: 'ホワイト', label: 'ホワイト'},
    ],
  },
  {
    name: 'CPUグリス',
    options: [
      {value: 'ノーマルグリス', label: 'ノーマルグリス（標準）'},
      {value: '高熱伝導率グリス【13.2W/m・K】親和産業社製', label: '高伝導グリス 13.2W/m・K (+¥3,000)'},
      {value: '高熱伝導率グリス【 16W/m・K】アイネックス社製', label: '高伝導グリス 16W/m・K (+¥5,000)'},
    ],
  },
  {
    name: 'Microsoft Office(Word/Excel/Outlook/PowerPoint)',
    options: [
      {value: 'なし', label: 'なし'},
      {value: 'あり', label: 'あり (+¥35,000)'},
    ],
  },
  {
    name: '無線LAN(Wi-Fi＆Bluetooth接続)',
    options: [
      {value: 'なし', label: 'なし（標準）'},
      {value: 'あり Wi-Fi 5【Bluetooth 4.2】', label: 'Wi-Fi 5 / BT 4.2 (+¥3,980)'},
      {value: 'あり Wi-Fi 6E【Bluetooth 5.2】', label: 'Wi-Fi 6E / BT 5.2 (+¥6,480)'},
    ],
  },
  {
    name: 'OS',
    options: [
      {value: 'Windows11 Home', label: 'Windows 11 Home（標準）'},
      {value: 'Windows11 Pro', label: 'Windows 11 Pro (+¥10,000)'},
    ],
  },
  {
    name: 'Windows言語',
    options: [
      {value: '日本語(Japanese)', label: '日本語（標準）'},
      {value: 'English', label: 'English (+¥3,000)'},
      {value: '中国語(簡体字)', label: '中国語 (+¥3,000)'},
      {value: '韓国語(Korean)', label: '韓国語 (+¥3,000)'},
    ],
  },
  {
    name: 'クイックスタート(初期設定代行)',
    options: [
      {value: 'なし', label: 'なし'},
      {value: 'あり', label: 'あり (+¥3,300)'},
    ],
  },
  {
    name: '延長保証(自然故障)',
    options: [
      {value: '申し込まない (メーカー標準1年保証(無料))', label: '標準1年保証（無料）'},
      {value: '申し込む(延長保証2年(標準保証＋追加1年)(+PC総額×7%))', label: '延長2年 (+PC総額×7%)'},
      {value: '申し込む(延長保証3年(標準保証＋追加2年)(+PC総額×11%))', label: '延長3年 (+PC総額×11%)'},
    ],
  },
];

interface ProductCustomizationProps {
  productTitle: string;
  productTags: string[];
  onSelectionsChange: (selections: CustomizationSelection[], surcharge: number) => void;
}

function isPC(title: string, tags: string[]): boolean {
  const combined = `${title} ${tags.join(' ')}`.toLowerCase();
  const gadgetKeywords = ['マウスパッド', 'キーボード', 'パネル', 'pcケース'];
  const goodsKeywords = ['アクリル', 'tシャツ', 'パーカー', 'グッズ', 'ステッカー', '缶バッジ'];
  for (const kw of [...gadgetKeywords, ...goodsKeywords]) {
    if (combined.includes(kw)) return false;
  }
  const pcKeywords = ['pc', 'デスクトップ', 'gaming', 'ゲーミング', 'rtx', 'gtx', 'ryzen', 'core'];
  return pcKeywords.some((kw) => combined.includes(kw));
}

export function ProductCustomization({
  productTitle,
  productTags,
  onSelectionsChange,
}: ProductCustomizationProps) {
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [surcharge, setSurcharge] = useState(0);

  // PC製品のみ表示（Hooksの後に条件分岐）
  if (!isPC(productTitle, productTags)) {
    return null;
  }

  const handleChange = useCallback(
    (fieldName: string, value: string) => {
      setSelections((prev) => {
        const next = {...prev, [fieldName]: value};
        // 選択結果をline item properties形式に変換して通知
        const attrs: CustomizationSelection[] = Object.entries(next)
          .filter(([, v]) => v !== '')
          .map(([k, v]) => ({key: k, value: v}));
        // カスタマイズ追加金額の合計を計算
        const totalSurcharge = Object.entries(next)
          .filter(([, v]) => v !== '')
          .reduce((sum, [k, v]) => sum + calcSurchargeForSelection(k, v), 0);
        setSurcharge(totalSurcharge);
        onSelectionsChange(attrs, totalSurcharge);
        return next;
      });
    },
    [onSelectionsChange],
  );

  // 表示するオプション（依存条件を考慮）
  const visibleOptions = useMemo(() => {
    return STANDARD_OPTIONS.filter((opt) => {
      if (!opt.dependsOn) return true;
      return selections[opt.dependsOn.field] === opt.dependsOn.value;
    });
  }, [selections]);

  // 基本オプション（最初の5つ）と詳細オプション
  const basicOptions = visibleOptions.slice(0, 5);
  const advancedOptions = visibleOptions.slice(5);

  return (
    <div
      style={{
        marginTop: 24,
        marginBottom: 24,
        borderRadius: 14,
        border: `1px solid ${al(T.c, 0.1)}`,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 20px',
          background: al(T.c, 0.05),
          borderBottom: `1px solid ${al(T.c, 0.08)}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: al(T.tx, 0.35),
              letterSpacing: 2,
              marginBottom: 2,
            }}
          >
            CUSTOMIZATION
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: T.tx,
            }}
          >
            パーツカスタマイズ
          </div>
        </div>
        <div
          style={{
            fontSize: 10,
            color: T.c,
            fontWeight: 700,
            padding: '4px 10px',
            background: al(T.c, 0.08),
            borderRadius: 20,
          }}
        >
          {Object.keys(selections).filter((k) => selections[k]).length} / {visibleOptions.length} 選択済
        </div>
      </div>

      {/* Basic Options */}
      <div style={{padding: '16px 20px'}}>
        {basicOptions.map((opt) => (
          <CustomSelect
            key={opt.name}
            name={opt.name}
            options={opt.options}
            value={selections[opt.name] || ''}
            onChange={(v) => handleChange(opt.name, v)}
          />
        ))}

        {/* Toggle Advanced */}
        {advancedOptions.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              style={{
                width: '100%',
                padding: '10px 0',
                background: 'none',
                border: 'none',
                color: T.c,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                marginTop: 8,
              }}
            >
              {expanded ? '詳細オプションを閉じる' : `詳細オプションを表示 (${advancedOptions.length}項目)`}
              <span
                style={{
                  display: 'inline-block',
                  transition: 'transform .2s',
                  transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
                }}
              >
                ▼
              </span>
            </button>

            {expanded && (
              <div style={{marginTop: 8}}>
                {advancedOptions.map((opt) => (
                  <CustomSelect
                    key={opt.name}
                    name={opt.name}
                    options={opt.options}
                    value={selections[opt.name] || ''}
                    onChange={(v) => handleChange(opt.name, v)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* カスタマイズ追加金額サマリー */}
      {surcharge > 0 && (
        <div
          style={{
            padding: '12px 20px',
            borderTop: `1px solid ${al(T.c, 0.1)}`,
            background: al(T.c, 0.04),
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{fontSize: 12, fontWeight: 700, color: al(T.tx, 0.6)}}>
            カスタマイズ追加金額
          </span>
          <span style={{fontSize: 16, fontWeight: 900, color: T.c}}>
            +¥{surcharge.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}

function CustomSelect({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: {value: string; label: string}[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{marginBottom: 14}}>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 700,
          color: al(T.tx, 0.5),
          marginBottom: 6,
        }}
      >
        {name}
      </label>
      <select
        data-field-name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '10px 14px',
          fontSize: 12,
          fontWeight: 600,
          color: value ? T.tx : al(T.tx, 0.4),
          background: '#0a0e14',
          border: `1px solid ${value ? al(T.c, 0.2) : al(T.tx, 0.08)}`,
          borderRadius: 8,
          outline: 'none',
          cursor: 'pointer',
          appearance: 'none',
          colorScheme: 'dark',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2300F0FF' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          paddingRight: 36,
          transition: 'border-color .2s',
        }}
      >
        <option value="" style={{background: '#0a0e14', color: 'rgba(255,255,255,0.4)'}}>選択してください</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} style={{background: '#0a0e14', color: '#fff'}}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
