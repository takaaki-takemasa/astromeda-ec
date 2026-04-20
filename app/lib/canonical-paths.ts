/**
 * Canonical path registry (patch 0073 / R2-3)
 *
 * 複数の admin タブで同じ Metaobject を CRUD できる状態だと、
 * 「どこで編集するのが正規なのか」が非エンジニアには分かりません。
 *
 * このレジストリで Metaobject type → canonical (正規) タブを一元管理し、
 * 非正規のタブでは CanonicalRedirectBanner でユーザーを正しい場所へ誘導します。
 *
 * 判断基準:
 * - ビジュアル編集 (pageEditor) を持つもの → pageEditor が canonical
 * - サイト設定 (legal/site_config/static_page) → siteConfig が canonical
 * - 記事系 (article/SEO) → content が canonical
 * - 商品系 (pc_tier) → pageEditor (GamingSections) が canonical
 * - マーケ系 (campaign) → marketing が canonical
 * - 商品カスタマイズ → customization が canonical
 * - スキーマ定義 → metaobjectDefs が canonical
 */

/**
 * admin._index.tsx の SubTab literal と 1:1 対応。
 * canonical タブのみ厳密に列挙するが、currentTab として渡すのは
 * deprecated タブ (homepage など) も含まれうるため広めに許容する。
 */
export type CanonicalTab =
  | 'pageEditor'
  | 'siteConfig'
  | 'content'
  | 'marketing'
  | 'customization'
  | 'metaobjectDefs'
  | 'products'
  // deprecated / non-canonical tabs (currentTab 用)
  | 'homepage';

export interface CanonicalOwnership {
  /** どのタブが正規 (canonical) か */
  canonical: CanonicalTab;
  /** 正規タブ内でのセクション名（ユーザーに示す） */
  canonicalLabel: string;
  /** 正規ではないが CRUD できてしまうタブ（deprecated 扱い） */
  alsoEditableIn?: CanonicalTab[];
  /** 正規タブへのジャンプに使う hash / query */
  deepLinkHash?: string;
}

/**
 * Metaobject type → canonical ownership
 * キーは Shopify Metaobject の type (e.g. `astromeda_hero_banner`)
 */
export const METAOBJECT_CANONICAL_MAP: Record<string, CanonicalOwnership> = {
  // ── Layout / Homepage / Landing (canonical = pageEditor ビジュアル編集) ──
  astromeda_hero_banner: {
    canonical: 'pageEditor',
    canonicalLabel: 'ビジュアル編集 / ヒーローバナー',
    alsoEditableIn: ['content'],
  },
  astromeda_ip_banner: {
    canonical: 'pageEditor',
    canonicalLabel: 'ビジュアル編集 / IPバナー',
    alsoEditableIn: ['content'],
  },
  astromeda_pc_color: {
    canonical: 'pageEditor',
    canonicalLabel: 'ビジュアル編集 / 8色カラー',
  },
  astromeda_marquee_item: {
    canonical: 'pageEditor',
    canonicalLabel: 'ビジュアル編集 / マーキー',
  },
  astromeda_footer_config: {
    canonical: 'pageEditor',
    canonicalLabel: 'ビジュアル編集 / フッター',
  },
  astromeda_category_card: {
    canonical: 'pageEditor',
    canonicalLabel: 'ビジュアル編集 / カテゴリカード',
    alsoEditableIn: ['siteConfig'],
  },
  astromeda_product_shelf: {
    canonical: 'pageEditor',
    canonicalLabel: 'ビジュアル編集 / 商品シェルフ',
    alsoEditableIn: ['siteConfig'],
  },
  astromeda_about_section: {
    canonical: 'pageEditor',
    canonicalLabel: 'ビジュアル編集 / ABOUT セクション',
    alsoEditableIn: ['siteConfig'],
  },
  astromeda_ugc_review: {
    canonical: 'pageEditor',
    canonicalLabel: 'ビジュアル編集 / UGC レビュー',
    alsoEditableIn: ['products'],
  },
  astromeda_pc_tier: {
    canonical: 'pageEditor',
    canonicalLabel: 'ビジュアル編集 / PC ティア',
    alsoEditableIn: ['products'],
  },

  // ── Gaming PC ランディング (canonical = pageEditor) ──
  astromeda_gaming_hero_slide: {
    canonical: 'pageEditor',
    canonicalLabel: 'ビジュアル編集 / ゲーミングヒーロー',
  },
  astromeda_gaming_feature_card: {
    canonical: 'pageEditor',
    canonicalLabel: 'ビジュアル編集 / ゲーミング特集カード',
  },
  astromeda_gaming_parts_card: {
    canonical: 'pageEditor',
    canonicalLabel: 'ビジュアル編集 / ゲーミング CPU/GPU',
  },
  astromeda_gaming_price_range: {
    canonical: 'pageEditor',
    canonicalLabel: 'ビジュアル編集 / ゲーミング価格帯',
  },
  astromeda_gaming_contact: {
    canonical: 'pageEditor',
    canonicalLabel: 'ビジュアル編集 / ゲーミングお問い合わせ',
  },

  // ── Site-level (canonical = siteConfig) ──
  astromeda_site_config: {
    canonical: 'siteConfig',
    canonicalLabel: 'サイト設定 / 基本情報',
  },
  astromeda_legal_info: {
    canonical: 'siteConfig',
    canonicalLabel: 'サイト設定 / 法務情報',
  },
  astromeda_static_page: {
    canonical: 'siteConfig',
    canonicalLabel: 'サイト設定 / 固定ページ',
  },
  astromeda_faq_item: {
    canonical: 'siteConfig',
    canonicalLabel: 'サイト設定 / FAQ',
  },

  // ── Content (canonical = content) ──
  astromeda_article_content: {
    canonical: 'content',
    canonicalLabel: 'コンテンツ / 記事',
  },
  astromeda_seo_article: {
    canonical: 'content',
    canonicalLabel: 'コンテンツ / SEO 記事',
  },

  // ── Marketing (canonical = marketing) ──
  astromeda_campaign: {
    canonical: 'marketing',
    canonicalLabel: 'マーケティング / キャンペーン',
  },

  // ── Product customization (canonical = customization) ──
  astromeda_custom_option: {
    canonical: 'customization',
    canonicalLabel: 'カスタマイズ',
    alsoEditableIn: ['marketing'],
  },
};

/** ある Metaobject type がこのタブで正規か判定 */
export function isCanonicalFor(type: string, tab: CanonicalTab): boolean {
  return METAOBJECT_CANONICAL_MAP[type]?.canonical === tab;
}

/** ある Metaobject type の canonical ownership を取得 */
export function getCanonicalOwnership(type: string): CanonicalOwnership | undefined {
  return METAOBJECT_CANONICAL_MAP[type];
}

/** canonical タブへのディープリンク URL を生成 */
export function buildCanonicalDeepLink(type: string): string | undefined {
  const ownership = METAOBJECT_CANONICAL_MAP[type];
  if (!ownership) return undefined;
  const tab = ownership.canonical;
  const hash = ownership.deepLinkHash ? `#${ownership.deepLinkHash}` : '';
  return `/admin?tab=${tab}${hash}`;
}
