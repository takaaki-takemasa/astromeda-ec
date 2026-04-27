/**
 * セクション単位 HTML/CSS 上書き — 共通ライブラリ
 *
 * patch 0166 (2026-04-27): CEO 指示「他社（デザイン会社）に作業を任せる予定」+
 * 「HTML で一括変更もできるようにしてください」への基盤実装。
 *
 * Metaobject `astromeda_section_override`:
 *   - section_key: 上書き対象のセクション識別子 (hero / ip_banners / etc.)
 *   - mode: 'default' | 'custom_html' | 'custom_css'
 *   - custom_html: 上書き HTML (mode=custom_html 時のみ使用)
 *   - custom_css: 上書き CSS (mode=custom_css 時 + custom_html 時に注入)
 *   - is_active: false なら適用しない
 *   - notes: 編集者向けメモ
 *
 * セキュリティ:
 *   - sanitize-html.ts で script/iframe/onclick/javascript: を除去
 *   - storefront API 経由で読み取れるが、書き込みは admin only
 *
 * 後段 (patch 0167) で各セクションコンポーネントに override hook を埋め込む。
 */

export const SECTION_OVERRIDE_METAOBJECT_TYPE = 'astromeda_section_override';

/** override 可能なセクション一覧 (admin UI の選択肢にもなる) */
export const SECTION_KEYS = [
  // トップページ
  {key: 'home_hero', label: 'トップ：ヒーローバナー (HeroSlider)', page: 'home'},
  {key: 'home_color_models', label: 'トップ：8色カラーモデル (PCShowcase)', page: 'home'},
  {key: 'home_about', label: 'トップ：ABOUT セクション', page: 'home'},
  {key: 'home_category', label: 'トップ：カテゴリ (PC/ガジェット/グッズ)', page: 'home'},
  {key: 'home_ip_collabs', label: 'トップ：IPコラボグリッド (CollabGrid)', page: 'home'},
  {key: 'home_product_shelf', label: 'トップ：商品棚 (NEW ARRIVALS)', page: 'home'},
  {key: 'home_ugc_reviews', label: 'トップ：レビュー (UGC)', page: 'home'},
  {key: 'home_marquee', label: 'トップ：マーキー (流れる文字)', page: 'home'},
  // ゲーミングPCタブ
  {key: 'gpc_hero', label: 'ゲーミングPC：ヒーロー', page: 'gaming-pc'},
  {key: 'gpc_feature_cards', label: 'ゲーミングPC：特集カード', page: 'gaming-pc'},
  {key: 'gpc_ranking', label: 'ゲーミングPC：人気ランキング', page: 'gaming-pc'},
  {key: 'gpc_parts_cards', label: 'ゲーミングPC：パーツで選ぶ', page: 'gaming-pc'},
  {key: 'gpc_price_ranges', label: 'ゲーミングPC：価格帯で選ぶ', page: 'gaming-pc'},
  {key: 'gpc_contact', label: 'ゲーミングPC：お問い合わせ', page: 'gaming-pc'},
  // フッター (全ページ共通)
  {key: 'footer', label: 'フッター (全ページ共通)', page: 'global'},
] as const;

export type SectionKey = typeof SECTION_KEYS[number]['key'];
export type OverrideMode = 'default' | 'custom_html' | 'custom_css';

export interface SectionOverride {
  /** Metaobject GID */
  id: string;
  /** Metaobject handle (= section_key) */
  handle: string;
  /** 上書き対象セクション */
  sectionKey: SectionKey;
  /** モード */
  mode: OverrideMode;
  /** 上書き HTML (mode=custom_html 時) */
  customHtml: string;
  /** 上書き CSS (mode=custom_css or custom_html 時) */
  customCss: string;
  /** 有効フラグ — false なら一切適用しない */
  isActive: boolean;
  /** 編集者向けメモ */
  notes: string;
  /** Metaobject updatedAt (CAS 用) */
  updatedAt: string;
}

/** モードラベル (admin UI 表示用) */
export const MODE_LABEL: Record<OverrideMode, {label: string; description: string; color: string}> = {
  default: {label: '元のデザイン', description: 'Astromeda が最初から用意したデザインで表示します。', color: '#888'},
  custom_css: {label: 'CSS だけ上書き', description: '見た目（色・余白・フォント等）だけを CSS で変更します。HTML 構造は変えません。', color: '#00F0FF'},
  custom_html: {label: 'HTML/CSS を完全に上書き', description: 'セクション全体の HTML を別のものに置き換えます。CSS も同時に適用されます。', color: '#FF9500'},
};

/** ページキーで section list をフィルタ */
export function getSectionsForPage(page: 'home' | 'gaming-pc' | 'global' | 'all'): typeof SECTION_KEYS {
  if (page === 'all') return SECTION_KEYS;
  return SECTION_KEYS.filter((s) => s.page === page) as unknown as typeof SECTION_KEYS;
}

/** 文字列が SectionKey として有効か */
export function isValidSectionKey(value: unknown): value is SectionKey {
  if (typeof value !== 'string') return false;
  return SECTION_KEYS.some((s) => s.key === value);
}

/** Metaobject の fields[] から SectionOverride を構築 */
export function parseSectionOverride(node: {
  id: string;
  handle: string;
  updatedAt: string;
  fields: Array<{key: string; value: string | null}>;
}): SectionOverride | null {
  const get = (k: string): string => node.fields.find((f) => f.key === k)?.value || '';
  const sectionKey = get('section_key') || node.handle;
  if (!isValidSectionKey(sectionKey)) return null;
  const modeRaw = get('mode') || 'default';
  const mode: OverrideMode = (['default', 'custom_html', 'custom_css'] as const).includes(
    modeRaw as OverrideMode,
  )
    ? (modeRaw as OverrideMode)
    : 'default';
  return {
    id: node.id,
    handle: node.handle,
    sectionKey: sectionKey as SectionKey,
    mode,
    customHtml: get('custom_html'),
    customCss: get('custom_css'),
    isActive: get('is_active') === 'true',
    notes: get('notes'),
    updatedAt: node.updatedAt,
  };
}
