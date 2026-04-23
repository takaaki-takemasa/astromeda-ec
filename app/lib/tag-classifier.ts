/**
 * Tag Classifier — patch 0134 P0
 *
 * CEO 指摘:
 *   「タグをつけることでどのように変更できるのかをリアルタイムビューで表現できていない、
 *    複数の機能がごっちゃになっているのであれば明確にして、
 *    高校生でもわかるレベルに細分化されたタグマネージメントをしてください」
 *
 * Astromeda の Shopify ストアには現在 250+ タグが命名規則バラバラで混在している:
 *   - _customization / _hidden / _system  (内部用システム)
 *   - core-i7-14700f / core-ultra7-265f / AMD Ryzenハイエンドモデル  (PC スペック)
 *   - hololive English / NOEZ FOXX / 呪術廻戦  (IP コラボ)
 *   - Black / Green / Purple  (カラー)
 *   - pulldown-component / globo-product-options  (プルダウン部品)
 *   - featured / new-arrival / sale-  (キャンペーン)
 *
 * このヘルパーは各タグを 7 カテゴリに自動分類し、
 * 「このタグを付けると何が起きるか (effect)」と「どこに反映されるか (whereVisible)」を
 * 高校生でもわかる日本語で返す。
 *
 * AdminBulkTags / AdminCustomization / TagPicker から呼び出して
 * リアルタイム効果プレビューを実現する。
 */

import {COLLABS} from './astromeda-data';

/** タグのカテゴリ (高校生向けラベル付き) */
export type TagCategory =
  | 'ip' // IPコラボ識別 (例: hololive, NOEZ FOXX)
  | 'spec' // PCスペック (CPU/GPU/メモリ)
  | 'color' // カラー (8色: Black/White/Pink/Purple/Light Blue/Red/Green/Orange)
  | 'productType' // 商品種 (Tシャツ/キーボード/マウスパッド等)
  | 'pulldown' // プルダウン部品 (storefront 一覧から隠される)
  | 'campaign' // キャンペーン/セール (featured/new-arrival/sale)
  | 'system' // 内部システム用 (_customization 等・触らない)
  | 'other'; // 上記いずれにも該当しない

export interface TagCategoryMeta {
  category: TagCategory;
  /** カテゴリ絵文字 (UI ラベル用) */
  icon: string;
  /** 高校生向けカテゴリ名 */
  label: string;
  /** カテゴリの説明 (1-2 行) */
  categoryDescription: string;
}

export const TAG_CATEGORY_META: Record<TagCategory, TagCategoryMeta> = {
  ip: {
    category: 'ip',
    icon: '🎬',
    label: 'IPコラボ',
    categoryDescription:
      'アニメ・ゲーム作品とのコラボ商品を表すタグ。トップページのIPコラボグリッドで該当商品が表示されます。',
  },
  spec: {
    category: 'spec',
    icon: '💻',
    label: 'PCスペック',
    categoryDescription:
      'CPU・GPU・メモリなど PC のスペックを表すタグ。商品ページのカタログ情報や検索フィルタで使われます。',
  },
  color: {
    category: 'color',
    icon: '🎨',
    label: 'カラー',
    categoryDescription:
      'PC ケースの 8 色カラー（Black/White/Pink/Purple/Light Blue/Red/Green/Orange）を表すタグ。',
  },
  productType: {
    category: 'productType',
    icon: '📦',
    label: '商品ジャンル',
    categoryDescription:
      'Tシャツ・マウスパッド・キーボードなど商品の種類を表すタグ。「ガジェット」「グッズ」コレクションの自動振り分けに使われます。',
  },
  pulldown: {
    category: 'pulldown',
    icon: '🧩',
    label: 'プルダウン部品',
    categoryDescription:
      '「メモリ +8GB」など、商品ページのプルダウン選択肢として使われる隠し商品のタグ。お客様向けの商品一覧には表示されません。',
  },
  campaign: {
    category: 'campaign',
    icon: '📣',
    label: 'キャンペーン',
    categoryDescription:
      '「セール」「新着」「特集」など、期間限定や注目商品を表すタグ。トップページの特集枠やキャンペーンバナーで使われます。',
  },
  system: {
    category: 'system',
    icon: '⚙️',
    label: 'システム用',
    categoryDescription:
      '内部の自動処理で使われる特殊タグ。手動で付け外ししないでください（システムが自動管理します）。',
  },
  other: {
    category: 'other',
    icon: '🏷️',
    label: 'その他',
    categoryDescription:
      'ブランド名・メーカー名・社内ラベルなど、上記カテゴリのいずれにも該当しないタグ。',
  },
};

/** 1 タグを分類した結果 */
export interface TagInfo {
  /** 元のタグ名 */
  name: string;
  /** 分類カテゴリ */
  category: TagCategory;
  /** カテゴリ絵文字 */
  icon: string;
  /** カテゴリ表示名 */
  categoryLabel: string;
  /** 「このタグを付けると何が起きるか」(高校生向け) */
  effect: string;
  /** 「どこに反映されるか」(storefront URL or admin タブ) */
  whereVisible: Array<{label: string; url: string}>;
  /** 「触っても安全か」/警告 */
  warning?: string;
}

// ── Pattern-based classifier ──

const SYSTEM_PREFIX_RE = /^[_]/;
const SPEC_RE = /^(core[\s-]?i\d|core[\s-]?ultra|ryzen|amd[\s_]ryzen|rtx[\s-]?\d|rx[\s-]?\d|geforce|radeon|memory|メモリ|ssd|hdd|nvme|ddr\d|gen\d|hz)/i;
const PULLDOWN_TAGS = new Set(['pulldown-component', 'globo-product-options', 'pulldown']);
const COLOR_TAGS = new Set([
  'Black',
  'White',
  'Pink',
  'Purple',
  'Light Blue',
  'LightBlue',
  'Red',
  'Green',
  'Orange',
  'black',
  'white',
  'pink',
  'purple',
  'lightblue',
  'red',
  'green',
  'orange',
]);
const PRODUCT_TYPE_KEYWORDS = [
  'Tシャツ',
  'tシャツ',
  'マウスパッド',
  'mousepad',
  'キーボード',
  'keyboard',
  'モバイルバッテリー',
  'アクリル',
  'acrylic',
  '缶バッジ',
  'メタルカード',
  'トートバッグ',
  'パーカー',
  'hoodie',
  'PCケース',
  'pccase',
  'パネル',
  'panel',
  '着せ替え',
  'ケースファン',
  'fan',
  'マットレス',
  'デスクマット',
];
const CAMPAIGN_KEYWORDS = [
  'featured',
  'new-arrival',
  'newarrival',
  'sale',
  'campaign',
  'limited',
  '新着',
  'セール',
  'キャンペーン',
  '特集',
  'おすすめ',
  'recommend',
  'tier-',
  'price-',
];

/** COLLABS から IP 関連キーワードを動的構築 (タイトル断片 + shop ハンドル + tag) */
function buildIpKeywords(): string[] {
  const set = new Set<string>();
  for (const c of COLLABS) {
    if (c.shop) set.add(c.shop.toLowerCase());
    if (c.tag) set.add(c.tag.toLowerCase());
    if (c.name) {
      // 名前から記号を除いた小文字キーワード
      const t = c.name
        .replace(/[【】「」『』！？!?・]/g, '')
        .toLowerCase()
        .trim();
      if (t.length >= 2) set.add(t);
    }
  }
  // 一般的な略称も追加
  ['naruto', 'onepiece', 'one piece', 'jujutsu', 'chainsaw', 'hololive', 'sao', 'noez', 'foxx', 'pacmas', 'tokyoghoul', 'sanrio', 'sumikko', 'bocchi', 'bleach', 'pal', 'palworld', 'rilakkuma', 'kuroi', 'sonic', 'streetfighter', 'street fighter', 'gantz', 'geass', 'lovelive', 'idolmaster', 'imas', 'hero', 'heroaca'].forEach((k) => set.add(k));
  return Array.from(set);
}

let _ipKeywordsCache: string[] | null = null;
function getIpKeywords(): string[] {
  if (!_ipKeywordsCache) _ipKeywordsCache = buildIpKeywords();
  return _ipKeywordsCache;
}

/** 1 タグを分類カテゴリに自動振り分け */
export function classifyTagCategory(name: string): TagCategory {
  const n = name.trim();
  if (!n) return 'other';

  // 1. system (内部用 _ 始まり)
  if (SYSTEM_PREFIX_RE.test(n)) return 'system';

  // 2. pulldown 部品
  if (PULLDOWN_TAGS.has(n)) return 'pulldown';

  // 3. color (完全一致)
  if (COLOR_TAGS.has(n)) return 'color';

  // 4. PC スペック (CPU/GPU/メモリ系)
  if (SPEC_RE.test(n)) return 'spec';

  // 5. キャンペーン (キーワード含む)
  const lowerN = n.toLowerCase();
  if (CAMPAIGN_KEYWORDS.some((k) => lowerN.includes(k.toLowerCase()))) return 'campaign';

  // 6. IP コラボ (COLLABS 由来キーワード含む)
  const ipKeywords = getIpKeywords();
  if (ipKeywords.some((k) => lowerN.includes(k))) return 'ip';

  // 7. 商品ジャンル
  if (PRODUCT_TYPE_KEYWORDS.some((k) => n.includes(k))) return 'productType';

  return 'other';
}

/** カテゴリ別の effect / whereVisible を生成 */
function buildEffectAndWhere(name: string, cat: TagCategory): Pick<TagInfo, 'effect' | 'whereVisible' | 'warning'> {
  switch (cat) {
    case 'ip':
      return {
        effect: `「${name}」コラボ商品としてマークされ、トップページのIPコラボグリッドや該当IPのコレクションページに表示されます。`,
        whereVisible: [
          {label: 'トップページ → IPコラボ', url: '/#collabs'},
          {label: 'コレクション一覧', url: `/collections/${slugify(name)}`},
        ],
      };
    case 'spec':
      return {
        effect: `PCスペック情報として商品ページのカタログに表示されます。スペック検索フィルタの絞り込みにも使われます。`,
        whereVisible: [
          {label: 'ゲーミングPCコレクション', url: '/collections/gaming-pc'},
          {label: '商品詳細ページのスペック表', url: '#'},
        ],
      };
    case 'color':
      return {
        effect: `PCケースのカラーバリエーションとして識別され、トップページの「8色から選ぶ」セクションでこの色のグループに分類されます。`,
        whereVisible: [
          {label: 'トップページ → 8色から選ぶ', url: '/#colors'},
          {label: `${name}カラーのコレクション`, url: `/collections/${slugify(name)}`},
        ],
      };
    case 'productType':
      return {
        effect: `商品ジャンルとして識別され、「ガジェット」「グッズ」コレクションの自動振り分け条件に使われます。`,
        whereVisible: [
          {label: 'ガジェットコレクション', url: '/collections/gadgets'},
          {label: 'グッズコレクション', url: '/collections/goods'},
        ],
      };
    case 'pulldown':
      return {
        effect: `この商品は「プルダウン部品」として扱われ、お客様向けの商品一覧には一切表示されません。商品ページのプルダウン選択肢としてのみ機能します。`,
        whereVisible: [
          {label: '商品ページのプルダウン (例: メモリ追加)', url: '#'},
        ],
        warning: '⚠️ このタグを通常商品から外すと、お客様の商品一覧に表示されてしまいます。',
      };
    case 'campaign':
      return {
        effect: `キャンペーン対象商品としてマークされ、トップページの特集枠やセールバナーに表示される可能性があります。`,
        whereVisible: [
          {label: 'トップページ → 特集枠', url: '/'},
          {label: '管理 → キャンペーン管理', url: '/admin?tab=marketing'},
        ],
      };
    case 'system':
      return {
        effect: `システム内部で自動的に管理されるタグです。ユーザーには見えません。`,
        whereVisible: [],
        warning: '⚠️ このタグは手動で付け外ししないでください。システムの動作が壊れる可能性があります。',
      };
    case 'other':
    default:
      return {
        effect: `ブランド名やメーカー名、社内向けの管理ラベルとして使われている可能性があります。明確な機能はありません。`,
        whereVisible: [
          {label: '管理 → 商品検索', url: `/admin?tab=products&q=tag:${encodeURIComponent(name)}`},
        ],
      };
  }
}

/** タグ名を URL slug 風に正規化 (簡易) */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[【】「」『』！？!?・\s]+/g, '-')
    .replace(/-+$/, '')
    .replace(/^-+/, '');
}

/**
 * 1 タグを分類して TagInfo を返す (高校生向け説明つき)
 */
export function classifyTag(name: string): TagInfo {
  const cat = classifyTagCategory(name);
  const meta = TAG_CATEGORY_META[cat];
  const eff = buildEffectAndWhere(name, cat);
  return {
    name,
    category: cat,
    icon: meta.icon,
    categoryLabel: meta.label,
    effect: eff.effect,
    whereVisible: eff.whereVisible,
    warning: eff.warning,
  };
}

/**
 * 複数タグをカテゴリ別にグループ化 (UI のタブ切り替え用)
 */
export function groupTagsByCategory(
  tags: Array<{name: string; productCount?: number}>,
): Record<TagCategory, Array<{name: string; productCount: number}>> {
  const result: Record<TagCategory, Array<{name: string; productCount: number}>> = {
    ip: [],
    spec: [],
    color: [],
    productType: [],
    pulldown: [],
    campaign: [],
    system: [],
    other: [],
  };
  for (const t of tags) {
    const cat = classifyTagCategory(t.name);
    result[cat].push({name: t.name, productCount: t.productCount ?? 0});
  }
  // 各カテゴリ内は productCount 降順
  for (const cat of Object.keys(result) as TagCategory[]) {
    result[cat].sort((a, b) => b.productCount - a.productCount);
  }
  return result;
}
