/**
 * Collection Classifier — patch 0141 P0
 * (旧称: Collection (ジャンル) Classifier — patch 0151 で「ジャンル」呼称を撤廃)
 *
 * CEO 指摘 (patch 0140 の修正):
 *   「ジャンル別なら IP別、製品群別 (コラボPC/スタンダードモデル/ガジェット/グッズ)、
 *    製品ジャンル (マウスパッド/キーボード等) で分ける必要がある」
 *   ※ 上記引用文中の「ジャンル」は patch 0151 後 "コレクション" を意味する。
 *     ただし「製品ジャンル」(マウスパッド/キーボード等の細分類) は別概念のため残置。
 *
 * 3 軸で分類:
 *   軸1: productGroup (大分類・4つ): collabPc / standardPc / gadget / goods
 *   軸2: ipName (IP別・コラボ系のみ): NARUTO / hololive English 等
 *   軸3: productType (製品ジャンル・ガジェット/グッズ系のみ):
 *        マウスパッド / キーボード / Tシャツ / アクリル 等
 *
 * 加えてフィルタ系 (価格帯/スペック別) と隠し系 (プルダウン部品) も別グループに分離。
 */

import {COLLABS} from './astromeda-data';

/** 7 つの大グループ (CEO 正解 4 + 補助 3) */
export type ProductGroup =
  | 'collabPc' // 🎮 IPコラボ PC (hololive PC等)
  | 'standardPc' // 💻 スタンダードPC (Sirius/GAMER/LEGEND等)
  | 'gadget' // 🎧 ガジェット (PC周辺機器)
  | 'goods' // 🎁 グッズ (物販)
  | 'filter' // 🔍 フィルタ・絞り込み (価格帯/スペック別)
  | 'pulldownComponent' // 🧩 プルダウン部品 (お客様には見えない)
  | 'other'; // 🏷️ その他

export interface ProductGroupMeta {
  group: ProductGroup;
  icon: string;
  label: string;
  /** 高校生向け 1-2 行のユーザーメリット説明 */
  userBenefit: string;
}

export const PRODUCT_GROUP_META: Record<ProductGroup, ProductGroupMeta> = {
  collabPc: {
    group: 'collabPc',
    icon: '🎮',
    label: 'コラボPC',
    userBenefit: 'お客様がトップページから「推しの作品」(NARUTO / hololive 等) で PC を絞り込めます。',
  },
  standardPc: {
    group: 'standardPc',
    icon: '💻',
    label: 'スタンダードPC',
    userBenefit: 'コラボなしの一般的な PC モデル (GAMER / LEGEND / Sirius 等)。価格や用途で選べます。',
  },
  gadget: {
    group: 'gadget',
    icon: '🎧',
    label: 'ガジェット',
    userBenefit: 'マウスパッド・キーボード・PCケース等の周辺機器を製品ジャンル別に探せます。',
  },
  goods: {
    group: 'goods',
    icon: '🎁',
    label: 'グッズ',
    userBenefit: 'Tシャツ・アクリルスタンド等の物販グッズを種類別に探せます。',
  },
  filter: {
    group: 'filter',
    icon: '🔍',
    label: 'フィルタ・絞り込み',
    userBenefit: '価格帯やスペック (CPU/GPU) で絞り込むためのジャンル。検索結果を狭めます。',
  },
  pulldownComponent: {
    group: 'pulldownComponent',
    icon: '🧩',
    label: 'プルダウン部品 (お客様には見えない)',
    userBenefit: '商品ページのプルダウン選択肢として使われる隠し商品の集まり。お客様には表示されません。',
  },
  other: {
    group: 'other',
    icon: '🏷️',
    label: 'その他',
    userBenefit: '上記いずれにも該当しないジャンル。社内用や未分類のもの。',
  },
};

/** 表示順 (高校生視点で重要なものから) */
export const GROUP_ORDER: ProductGroup[] = [
  'collabPc',
  'standardPc',
  'gadget',
  'goods',
  'filter',
  'pulldownComponent',
  'other',
];

interface ClassifiableCollection {
  handle?: string;
  title?: string;
  productsCount?: number;
}

// 判定 RegExp
const PC_RE = /(gaming-pc|gamer|legend|pro-gamer|sirius|^pc$|streamer|creator|専用pc|pc$|searchpc|搭載モデル)/i;
const GADGET_RE = /(gadget|gadgets|キーボード|keyboard|マウスパッド|mousepad|モバイルバッテリー|バッテリー|ケース\b|^case|panel|パネル|stand|アクリルスタンド|フィギュア|ヘッドセット|headset|webcam|microphone|マウス|mouse(?!pad)|ガジェット)/i;
const GOODS_RE = /(goods|グッズ|tシャツ|tshirt|tees?|パーカー|hoodie|缶バッジ|メタルカード|metalcard|トートバッグ|tote|アクリルキーホルダー|keyholder|stickers?|シール|ハット|hat|cap|ステッカー|物販)/i;
const FILTER_RE = /(over_\d|under_\d|price|円以上|円未満|価格|^cpu|^gpu|rtx-\d|radeon-\d|nvidia|intel|core-i|core_i|ryzen|geforce|hz$|ddr\d|ssd|hdd|搭載$|搭載モデル|^memory)/i;
const PULLDOWN_RE = /(pulldown|globo|延長保証|warranty|component|オプション|変換|アップグレード)/i;

/** COLLABS から IP マッチング用キーワード集合を構築 */
let _ipKeywordCache: Map<string, string> | null = null; // keyword → display name
function getIpKeywordMap(): Map<string, string> {
  if (_ipKeywordCache) return _ipKeywordCache;
  const map = new Map<string, string>();
  for (const c of COLLABS) {
    const display = c.name || c.shop || '';
    if (c.shop) map.set(c.shop.toLowerCase(), display);
    if (c.tag) map.set(c.tag.toLowerCase(), display);
    if (c.name) {
      const t = c.name.replace(/[【】「」『』！？!?・\s]+/g, '').toLowerCase().trim();
      if (t.length >= 2) map.set(t, display);
    }
  }
  // 一般的略称 (display name ≒ original)
  const aliases: Array<[string, string]> = [
    ['naruto', 'NARUTO-ナルト-'],
    ['onepiece', 'ONE PIECE'],
    ['one-piece', 'ONE PIECE'],
    ['jujutsu', '呪術廻戦'],
    ['chainsaw', 'チェンソーマン'],
    ['hololive', 'hololive'],
    ['sao', 'ソードアートオンライン'],
    ['noez', 'NOEZ FOXX'],
    ['foxx', 'NOEZ FOXX'],
    ['pacmas', 'パックマス'],
    ['tokyoghoul', '東京喰種'],
    ['sanrio', 'サンリオ'],
    ['sumikko', 'すみっコぐらし'],
    ['bocchi', 'ぼっち・ざ・ろっく'],
    ['bleach', 'BLEACH'],
    ['palworld', 'Palworld'],
    ['rilakkuma', 'リラックマ'],
    ['rirakkuma', 'リラックマ'],
    ['kuroi', '黒い砂漠'],
    ['sonic', 'ソニック'],
    ['streetfighter', 'ストリートファイター6'],
    ['street-fighter', 'ストリートファイター6'],
    ['gantz', 'GANTZ'],
    ['geass', 'コードギアス'],
    ['lovelive', 'ラブライブ'],
    ['idolmaster', 'アイドルマスター'],
    ['imas', 'アイドルマスター'],
    ['heroaca', '僕のヒーローアカデミア'],
    ['hero-academia', '僕のヒーローアカデミア'],
    ['myhero', '僕のヒーローアカデミア'],
    ['yurucamp', 'ゆるキャン△'],
    ['girls-und-panzer', 'ガールズ＆パンツァー'],
    ['girlspanzer', 'ガールズ＆パンツァー'],
  ];
  for (const [key, val] of aliases) {
    if (!map.has(key)) map.set(key, val);
  }
  _ipKeywordCache = map;
  return map;
}

/** ガジェット製品ジャンル判定 */
const GADGET_TYPES: Array<[RegExp, string]> = [
  [/マウスパッド|mousepad/i, '🖱️ マウスパッド'],
  [/キーボード|keyboard/i, '⌨️ キーボード'],
  [/モバイルバッテリー|バッテリー/i, '🔋 モバイルバッテリー'],
  [/pcケース|case\b|^case/i, '🗄️ PCケース'],
  [/panel|パネル/i, '🖼️ パネル'],
  [/stand|アクリルスタンド|フィギュア/i, '🗿 スタンド・フィギュア'],
  [/headset|ヘッドセット/i, '🎧 ヘッドセット'],
  [/マウス\b|mouse\b(?!pad)/i, '🖱️ マウス'],
  [/webcam|microphone|マイク/i, '🎤 マイク・カメラ'],
];

/** グッズ製品ジャンル判定 */
const GOODS_TYPES: Array<[RegExp, string]> = [
  [/tシャツ|tshirt|tees?/i, '👕 Tシャツ'],
  [/パーカー|hoodie/i, '🧥 パーカー'],
  [/缶バッジ/i, '🎀 缶バッジ'],
  [/メタルカード|metalcard/i, '💳 メタルカード'],
  [/トートバッグ|tote/i, '👜 トートバッグ'],
  [/アクリル|acrylic/i, '🧊 アクリル'],
  [/sticker|シール|ステッカー/i, '🏷️ シール'],
  [/hat|cap|帽子/i, '🧢 帽子'],
];

/**
 * 1 コレクションを 3 軸で分類:
 *   - productGroup: 大分類 (CEO 4 軸 + 補助 3)
 *   - ipName: IP 名 (collabPc のみ・該当する display name)
 *   - productType: 製品ジャンル (gadget/goods のみ・該当する種別ラベル)
 */
export interface CollectionClassification {
  productGroup: ProductGroup;
  ipName?: string;
  productType?: string;
}

export function classifyCollection(c: ClassifiableCollection): CollectionClassification {
  const handle = (c.handle || '').toLowerCase();
  const title = (c.title || '').toLowerCase();
  const both = handle + ' ' + title;

  // 1. プルダウン部品 (最優先・お客様には見えない)
  if (PULLDOWN_RE.test(both)) return {productGroup: 'pulldownComponent'};

  // 2. フィルタ系 (価格帯/スペック別)
  if (FILTER_RE.test(both) && !PC_RE.test(both)) return {productGroup: 'filter'};

  // 3. IP マッチング
  const ipMap = getIpKeywordMap();
  let matchedIp: string | undefined;
  for (const [kw, display] of ipMap) {
    if (handle.includes(kw) || title.includes(kw)) {
      matchedIp = display;
      break;
    }
  }

  // 4. ガジェット製品ジャンル判定
  let gadgetType: string | undefined;
  for (const [re, label] of GADGET_TYPES) {
    if (re.test(both)) {
      gadgetType = label;
      break;
    }
  }

  // 5. グッズ製品ジャンル判定
  let goodsType: string | undefined;
  for (const [re, label] of GOODS_TYPES) {
    if (re.test(both)) {
      goodsType = label;
      break;
    }
  }

  // 大分類決定:
  //  - PC 系 + IP → コラボPC
  //  - PC 系のみ → スタンダードPC
  //  - ガジェット系 → ガジェット
  //  - グッズ系 → グッズ
  //  - IP 単体 (PC でもガジェットでもない・例: hololive コレクション全体) → コラボPC (default)

  const isPc = PC_RE.test(both);
  const isGadget = GADGET_RE.test(both) || gadgetType !== undefined;
  const isGoods = GOODS_RE.test(both) || goodsType !== undefined;

  if (isPc && matchedIp) {
    return {productGroup: 'collabPc', ipName: matchedIp};
  }
  if (isPc) {
    return {productGroup: 'standardPc'};
  }
  if (isGadget) {
    return {productGroup: 'gadget', productType: gadgetType ?? '🛠️ その他ガジェット', ipName: matchedIp};
  }
  if (isGoods) {
    return {productGroup: 'goods', productType: goodsType ?? '🎁 その他グッズ', ipName: matchedIp};
  }
  // IP マッチして PC でも周辺でもない → コラボPC 親 (例: hololive コレクション)
  if (matchedIp) {
    return {productGroup: 'collabPc', ipName: matchedIp};
  }

  return {productGroup: 'other'};
}

/**
 * 階層的グルーピング:
 *   ProductGroup → (sub key: IP名 or 製品ジャンル名) → コレクション配列
 */
export interface GroupedCollections<T> {
  group: ProductGroup;
  items: T[]; // sub 分類のないもの
  subGroups: Map<string, T[]>; // sub key → コレクション配列
}

export function groupCollectionsHierarchical<T extends ClassifiableCollection>(
  collections: T[],
): Map<ProductGroup, GroupedCollections<T>> {
  const result = new Map<ProductGroup, GroupedCollections<T>>();
  for (const g of GROUP_ORDER) {
    result.set(g, {group: g, items: [], subGroups: new Map()});
  }
  for (const c of collections) {
    const cls = classifyCollection(c);
    const groupData = result.get(cls.productGroup)!;
    // sub key 決定:
    //   - collabPc: IP 名で分ける
    //   - gadget/goods: 製品ジャンルで分ける
    //   - 他: sub なし
    let subKey: string | undefined;
    if (cls.productGroup === 'collabPc') subKey = cls.ipName;
    else if (cls.productGroup === 'gadget' || cls.productGroup === 'goods') subKey = cls.productType;

    if (subKey) {
      if (!groupData.subGroups.has(subKey)) groupData.subGroups.set(subKey, []);
      groupData.subGroups.get(subKey)!.push(c);
    } else {
      groupData.items.push(c);
    }
  }
  // 各 sub group / items を商品数降順
  for (const data of result.values()) {
    data.items.sort((a, b) => (b.productsCount ?? 0) - (a.productsCount ?? 0));
    for (const arr of data.subGroups.values()) {
      arr.sort((a, b) => (b.productsCount ?? 0) - (a.productsCount ?? 0));
    }
  }
  return result;
}
