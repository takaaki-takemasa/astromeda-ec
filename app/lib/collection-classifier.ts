/**
 * Collection (ジャンル) Classifier — patch 0140 P0
 *
 * CEO 指摘:
 *   「ジャンルとはなに、どのようなソーティングになっているか。
 *    高校生でもわかりやすいようにグループ化されているか」
 *
 * Astromeda の Shopify コレクションは 100 件以上が完全にバラバラ順に並んでおり、
 * 「リラックマキーボード → ガジェット → ONE PIECE → over_100k → ゲーミングPC → RADEON → ...」
 * のように種類が混在していた。
 *
 * このヘルパーは各コレクションを 7 グループに自動分類し、
 * AdminCollections タブで「PC本体 / スペック別 / 価格帯 / IPコラボ / 商品ジャンル / 部品 / その他」
 * のセクションヘッダー付きで描画できるようにする。
 */

import {COLLABS} from './astromeda-data';

export type CollectionGroup =
  | 'pc' // ゲーミングPC本体 (gaming-pc, gamer, legend 等)
  | 'spec' // PCスペック別 (Intel/AMD/NVIDIA/AMD GPU 等)
  | 'price' // 価格帯
  | 'ip' // IPコラボ (NARUTO, ONE PIECE, hololive 等)
  | 'productType' // 商品種 (ガジェット, グッズ, キーボード等)
  | 'pulldownComponent' // プルダウン部品 (Globo / pulldown-* 系)
  | 'other'; // その他

export interface CollectionGroupMeta {
  group: CollectionGroup;
  icon: string;
  label: string;
  description: string;
}

export const COLLECTION_GROUP_META: Record<CollectionGroup, CollectionGroupMeta> = {
  pc: {
    group: 'pc',
    icon: '💻',
    label: 'ゲーミングPC本体',
    description: 'GAMER / LEGEND など PC 本体グループ',
  },
  spec: {
    group: 'spec',
    icon: '🔧',
    label: 'PCスペック別',
    description: 'Intel Core / NVIDIA GeForce / RADEON / Ryzen 等 CPU/GPU で絞り込み',
  },
  price: {
    group: 'price',
    icon: '💰',
    label: '価格帯',
    description: '〜10万円 / 10万円以上 等の値段帯',
  },
  ip: {
    group: 'ip',
    icon: '🎬',
    label: 'IPコラボ',
    description: 'アニメ・ゲーム作品コラボ (NARUTO / ONE PIECE / hololive 等)',
  },
  productType: {
    group: 'productType',
    icon: '📦',
    label: '商品の種類',
    description: 'ガジェット / グッズ / キーボード / マウスパッド 等',
  },
  pulldownComponent: {
    group: 'pulldownComponent',
    icon: '🧩',
    label: 'プルダウン部品 (お客様には見えない)',
    description: 'Globo / pulldown-* 系の隠しコレクション',
  },
  other: {
    group: 'other',
    icon: '🏷️',
    label: 'その他',
    description: '上記いずれにも該当しないジャンル',
  },
};

/** グループ表示順 (高校生視点で分かりやすい順) */
export const GROUP_ORDER: CollectionGroup[] = [
  'pc',
  'spec',
  'price',
  'ip',
  'productType',
  'pulldownComponent',
  'other',
];

interface ClassifiableCollection {
  handle?: string;
  title?: string;
}

const PC_RE = /(gaming-pc|gamer|legend|pro-gamer|sirius|pc-(?!nitowai)|^pc$|streamer|creator)/i;
const SPEC_RE = /(rtx|radeon|nvidia|intel|core-i|core_i|ryzen|geforce|gpu|cpu|搭載モデル|搭載$|hz$|ddr\d|ssd|hdd)/i;
const PRICE_RE = /(over_\d|under_\d|price|円以上|円未満|価格)/i;
const PRODUCT_TYPE_RE = /(gadget|goods|キーボード|keyboard|マウスパッド|mousepad|モバイルバッテリー|ケース|case|panel|パネル|アクリル|acrylic|缶バッジ|メタルカード|トートバッグ|tシャツ|tshirt|パーカー|hoodie|stand|ガジェット|グッズ)/i;
const PULLDOWN_RE = /(pulldown|globo|延長保証|warranty|component|オプション)/i;

/** COLLABS から IP マッチング用キーワード集合を構築 */
let _ipKeywordCache: Set<string> | null = null;
function getIpKeywordSet(): Set<string> {
  if (_ipKeywordCache) return _ipKeywordCache;
  const set = new Set<string>();
  for (const c of COLLABS) {
    if (c.shop) set.add(c.shop.toLowerCase());
    if (c.tag) set.add(c.tag.toLowerCase());
    if (c.name) {
      const t = c.name.replace(/[【】「」『』！？!?・\s]+/g, '').toLowerCase().trim();
      if (t.length >= 2) set.add(t);
    }
  }
  // 一般的略称
  ['naruto','onepiece','one-piece','jujutsu','chainsaw','hololive','sao','noez','foxx',
   'pacmas','tokyoghoul','sanrio','sumikko','bocchi','bleach','pal','palworld','rilakkuma',
   'kuroi','sonic','streetfighter','street-fighter','gantz','geass','lovelive','idolmaster',
   'imas','heroaca','hero','rirakkuma','myhero'].forEach((k) => set.add(k));
  _ipKeywordCache = set;
  return set;
}

/**
 * 1 コレクションを 7 グループに自動振り分け
 */
export function classifyCollection(c: ClassifiableCollection): CollectionGroup {
  const handle = (c.handle || '').toLowerCase();
  const title = (c.title || '').toLowerCase();
  const both = handle + ' ' + title;

  // 1. プルダウン部品 (最優先で除外したい・お客様に見えない)
  if (PULLDOWN_RE.test(handle) || PULLDOWN_RE.test(title)) return 'pulldownComponent';

  // 2. 価格帯
  if (PRICE_RE.test(both)) return 'price';

  // 3. PCスペック (CPU/GPU/メモリ等)
  if (SPEC_RE.test(both)) return 'spec';

  // 4. IP コラボ
  const ipKw = getIpKeywordSet();
  for (const kw of ipKw) {
    if (handle.includes(kw) || title.includes(kw)) return 'ip';
  }

  // 5. ゲーミングPC本体
  if (PC_RE.test(handle) || PC_RE.test(title)) return 'pc';

  // 6. 商品ジャンル
  if (PRODUCT_TYPE_RE.test(handle) || PRODUCT_TYPE_RE.test(title)) return 'productType';

  // 7. その他
  return 'other';
}

/** 複数コレクションを group 別 Map にまとめる (各グループ内は商品数降順) */
export function groupCollections<T extends ClassifiableCollection & {productsCount?: number}>(
  collections: T[],
): Map<CollectionGroup, T[]> {
  const map = new Map<CollectionGroup, T[]>();
  for (const g of GROUP_ORDER) map.set(g, []);
  for (const c of collections) {
    const g = classifyCollection(c);
    map.get(g)?.push(c);
  }
  // 各グループ内を商品数降順
  for (const arr of map.values()) {
    arr.sort((a, b) => (b.productsCount ?? 0) - (a.productsCount ?? 0));
  }
  return map;
}
