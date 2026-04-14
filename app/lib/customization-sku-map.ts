/**
 * カスタマイズオプション選択肢 → SKU マッピング
 *
 * ProductCustomization.tsx の STANDARD_OPTIONS (fieldName, value) を
 * Shopify 上の「PCカスタマイズオプション」商品のバリアント SKU に対応させる。
 *
 * ※ 追加金額が0円（標準）のオプションにはマッピング不要。
 */

/** (fieldName, value) をキーとして SKU を返すマップ */
export const CUSTOMIZATION_SKU_MAP: Record<string, Record<string, string>> = {
  'メモリ': {
    'DDR5(5200MHz以上)非LED64GB': 'CUSTOM-MEM-64GB',
    'DDR5(5200MHz以上)LED32GB ブラック': 'CUSTOM-MEM-LED32',
    'DDR5(5200MHz以上)LED64GB ブラック': 'CUSTOM-MEM-LED64',
  },
  'SSD(1つ目)': {
    '1TB M.2 NVMe Gen4※おすすめ': 'CUSTOM-SSD1-1TB',
    '2TB M.2 NVMe Gen4': 'CUSTOM-SSD1-2TB',
    '4TB M.2 NVMe Gen4': 'CUSTOM-SSD1-4TB',
  },
  'SSD(2つ目)': {
    '1TB M.2 NVMe Gen4': 'CUSTOM-SSD2-1TB',
    '2TB M.2 NVMe Gen4': 'CUSTOM-SSD2-2TB',
    '4TB M.2 NVMe Gen4': 'CUSTOM-SSD2-4TB',
  },
  'HDD': {
    '2TB(5400rpm)': 'CUSTOM-HDD-2TB',
    '4TB(5400rpm)': 'CUSTOM-HDD-4TB',
    '8TB(5400rpm)': 'CUSTOM-HDD-8TB',
    '10TB(5400rpm)': 'CUSTOM-HDD-10TB',
  },
  '電源': {
    '750W BRONZE(ブラックケーブル)': 'CUSTOM-PSU-750',
    '850W 80PLUS認証 GOLD(ブラックケーブル)': 'CUSTOM-PSU-850',
  },
  '電源スリーブケーブル': {
    'ブラック(スリーブケーブル)': 'CUSTOM-CABLE-BLK',
    'ホワイト(スリーブケーブル)': 'CUSTOM-CABLE-WHT',
    'ピンク(スリーブケーブル)': 'CUSTOM-CABLE-PNK',
    'パープル(スリーブケーブル)': 'CUSTOM-CABLE-PPL',
    'オレンジ(スリーブケーブル)': 'CUSTOM-CABLE-ORG',
    'ゴールド(スリーブケーブル)': 'CUSTOM-CABLE-GLD',
  },
  'RGB GPU(グラフィックカード)ステイ': {
    'あり': 'CUSTOM-MBGUARD',
  },
  'CPUグリス': {
    '高熱伝導率グリス【13.2W/m・K】親和産業社製': 'CUSTOM-GREASE-13',
    '高熱伝導率グリス【 16W/m・K】アイネックス社製': 'CUSTOM-GREASE-16',
  },
  'Microsoft Office(Word/Excel/Outlook/PowerPoint)': {
    'あり': 'CUSTOM-AIO',
  },
  '無線LAN(Wi-Fi＆Bluetooth接続)': {
    'あり Wi-Fi 5【Bluetooth 4.2】': 'CUSTOM-WIFI5',
    'あり Wi-Fi 6E【Bluetooth 5.2】': 'CUSTOM-WIFI6E',
  },
  'OS': {
    'Windows11 Pro': 'CUSTOM-WIN11PRO',
  },
  'Windows言語': {
    'English': 'CUSTOM-KB-EN',
    '中国語(簡体字)': 'CUSTOM-KB-CN',
    '韓国語(Korean)': 'CUSTOM-KB-KR',
  },
  'クイックスタート(初期設定代行)': {
    'あり': 'CUSTOM-ASSEMBLY',
  },
};

/** カスタマイズ商品のハンドル（Shopifyで自動生成される） */
export const CUSTOMIZATION_PRODUCT_HANDLE = 'pcカスタマイズオプション';

/**
 * (fieldName, value) から SKU を引く
 */
export function getCustomizationSku(
  fieldName: string,
  value: string,
): string | null {
  return CUSTOMIZATION_SKU_MAP[fieldName]?.[value] ?? null;
}
