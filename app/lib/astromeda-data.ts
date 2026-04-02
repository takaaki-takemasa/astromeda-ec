// Astromeda Theme Constants
export const T = {
  c: '#00F0FF',
  cD: '#00C4CC',
  g: '#FFB300',
  gD: '#FF8C00',
  r: '#FF2D55',
  bg: '#06060C',
  tx: '#fff',
  t5: 'rgba(255,255,255,.5)',
  t4: 'rgba(255,255,255,.4)',
  t3: 'rgba(255,255,255,.25)',
  t2: 'rgba(255,255,255,.12)',
  t1: 'rgba(255,255,255,.06)',
  bd: 'rgba(255,255,255,.08)',
  ov: 'rgba(6,6,12,.88)',
  bl: 'blur(20px) saturate(1.5)',
  bgC: 'rgba(255,255,255,.03)',
  bgE: 'rgba(255,255,255,.02)',
};

// Hex to rgba
export function al(h: string, o: number): string {
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${o})`;
}

// Fluid value interpolation (mobile → desktop)
export function fl(spV: number, pcV: number, vw: number): number {
  const t = (vw - 320) / (1200 - 320);
  const v = spV + (pcV - spV) * t;
  return Math.round(Math.min(Math.max(Math.min(spV, pcV), v), Math.max(spV, pcV)));
}

// Responsive padding
export function px(vw: number): number {
  return fl(16, 48, vw);
}

// Yen formatter
export function yen(n: number): string {
  return '¥' + n.toLocaleString('ja-JP');
}

// Dynamic font size for long names
export function nameFs(name: string, base: number, min: number): number {
  let len = 0;
  for (let i = 0; i < name.length; i++)
    len += name.charCodeAt(i) > 0x2000 ? 1.0 : 0.6;
  if (len <= 7) return base;
  if (len >= 14) return min;
  return Math.round((base - ((base - min) * (len - 7)) / 7) * 10) / 10;
}

// PC Color palette
export const PC_COLORS = [
  { n: 'ホワイト', h: '#F0EEF0', g: '#E8E0FF', d: false },
  { n: 'ブラック', h: '#1C1C24', g: '#6666FF', d: true },
  { n: 'ピンク', h: '#FF6B9D', g: '#FF6B9D', d: false },
  { n: 'パープル', h: '#9B59B6', g: '#B86FD8', d: false },
  { n: 'ブルー', h: '#3498DB', g: '#50B0F0', d: false },
  { n: 'レッド', h: '#E74C3C', g: '#FF5A4A', d: false },
  { n: 'グリーン', h: '#2ECC71', g: '#40E888', d: false },
  { n: 'オレンジ', h: '#F39C12', g: '#FFB840', d: false },
];

// Collab IP data
export interface CollabItem {
  id: string;
  name: string;
  tag: string;
  accent: string;
  pt: string;
  desc: string;
  cats: string;
  f: number;
  shop: string;
  count?: number;
}

export const COLLABS: CollabItem[] = [
  { id: 'onepiece', name: 'ONE PIECE バウンティラッシュ', tag: 'NEW', accent: '#E8363A', pt: 'straw', desc: 'ルフィ・ゾロ・シャンクス・サボ・キッド&ロー。8ティア¥229,510〜¥572,890。', cats: 'pc,pad', f: 1, shop: 'one-piece-bountyrush-collaboration' },
  { id: 'naruto', name: 'NARUTO-ナルト- 疾風伝', tag: 'NEW', accent: '#F4811F', pt: 'spiral', desc: '全5種×3ティア＋マウスパッド＋キーボード。', cats: 'pc,pad,kb', f: 1, shop: 'pc-naruto-shippuden' },
  { id: 'heroaca', name: '僕のヒーローアカデミア', tag: 'HOT', accent: '#2ECC71', pt: 'burst', desc: '全7種（デク/爆豪/轟/お茶子/切島/死柄木/トガ）×3ティア＋ガラスパッド7種＋PCケース7種＋パネル。', cats: 'pc,pad,panel,case', f: 1, shop: 'heroaca-collaboration' },
  { id: 'sf6', name: 'ストリートファイター6', tag: '', accent: '#D84315', pt: 'burst', desc: 'ジュリ・リュウ・キャミィ・豪鬼・ケン。8ティア¥157,530〜¥565,800。', cats: 'pc,panel,pad', f: 1, shop: 'sf6-collaboration' },
  { id: 'sanrio', name: 'サンリオキャラクターズ', tag: 'NEW', accent: '#FF69B4', pt: 'wave', desc: 'ハローキティ他4キャラ。PC5ティア¥178,800〜¥413,829。', cats: 'pc,pad,kb,case,acrylic', f: 1, shop: 'sanrio-collaboration' },
  { id: 'sonic', name: 'ソニック・ザ・ヘッジホッグ', tag: '', accent: '#0066FF', pt: 'sphere', desc: 'ソニック＆シャドウ 2デザイン×3ティア＋マウスパッド。', cats: 'pc,pad', f: 1, shop: 'pc-sega-sonic-astromeda-collaboration' },
  { id: 'jujutsu', name: '呪術廻戦', tag: 'HOT', accent: '#7B2FBE', pt: 'curse', desc: 'パッド＋パネル＋KB＋アクスタ＋缶バッジ＋メタルカード。', cats: 'pad,panel,kb,acrylic,badge,goods', f: 1, shop: 'jujutsu-collaboration' },
  { id: 'chainsawman', name: 'チェンソーマン レゼ篇', tag: 'HOT', accent: '#C62828', pt: 'burst', desc: '劇場版コラボPC3ティア＋マウスパッド。', cats: 'pc,pad', f: 1, shop: 'chainsawman-collaboration' },
  { id: 'bocchi', name: 'ぼっち・ざ・ろっく！', tag: 'HOT', accent: '#F06292', pt: 'wave', desc: 'PC＋パッド＋パネル＋ケース＋キーボード。', cats: 'pc,pad,panel,case,kb', f: 1, shop: 'bocchi-rocks-collaboration' },
  { id: 'hololive-en', name: 'hololive English', tag: 'NEW', accent: '#1DA1F2', pt: 'prism', desc: 'Myth＆Promise PC・パッド・パネル・ケース・缶バッジ。', cats: 'pc,pad,panel,case,badge', f: 0, shop: 'hololive-english-collaboration' },
  { id: 'bleach-ros', name: 'BLEACH Rebirth of Souls', tag: '', accent: '#B0B0B0', pt: 'cross', desc: 'ゲーム版コラボPC・マウスパッド・キーボード。', cats: 'pc,pad,kb', f: 0, shop: 'bleach-rebirth-of-souls-collaboration' },
  { id: 'bleach-tybw', name: 'BLEACH 千年血戦篇', tag: '', accent: '#8B8B8B', pt: 'cross', desc: '一護・ルキア・白哉・日番谷 着せ替えパネル4面¥20,800。', cats: 'panel', f: 0, shop: 'bleach-tybw-collaboration' },
  { id: 'geass', name: 'コードギアス 反逆のルルーシュ', tag: '', accent: '#9C27B0', pt: 'prism', desc: 'ルルーシュ＆スザク。PC6モデル・マウスパッド・PCケース。', cats: 'pc,pad,case', f: 0, shop: 'code-geass-collaboration' },
  { id: 'tokyoghoul', name: '東京喰種トーキョーグール', tag: '', accent: '#880E4F', pt: 'curse', desc: 'PC3ティア¥220,779〜¥246,519 + マウスパッド（金木/金木マスク）+ 着せ替えパネル。', cats: 'pc,pad,panel', f: 0, shop: 'tokyoghoul-collaboration' },
  { id: 'lovelive', name: 'ラブライブ！虹ヶ咲', tag: '', accent: '#FF9800', pt: 'prism', desc: '12メンバー個別PC＆マウスパッド・着せ替えパネル。', cats: 'pc,pad,panel', f: 0, shop: 'lovelive-nijigasaki-collaboration' },
  { id: 'sao', name: 'ソードアート・オンライン', tag: '', accent: '#2196F3', pt: 'prism', desc: 'SAOコラボPC。', cats: 'pc', f: 0, shop: 'sao-collaboration' },
  { id: 'yurucamp', name: 'ゆるキャン△ SEASON３', tag: '', accent: '#4CAF50', pt: 'wave', desc: 'コラボPC＋マウスパッド＋着せ替えパネル＋PCケース。', cats: 'pc,pad,panel,case', f: 0, shop: 'yurucamp-collaboration' },
  { id: 'pacmas', name: 'アイ MAKE IMP@CT！', tag: '', accent: '#FF4081', pt: 'sphere', desc: '14種コラボPC＋マウスパッド＋着せ替えパネル。', cats: 'pc,pad,panel', f: 0, shop: 'pacmas-collaboration' },
  { id: 'sumikko', name: 'すみっコぐらし', tag: 'NEW', accent: '#A8D8B9', pt: 'wave', desc: 'やさしい色合いのゲーミングPC・マウスパッド・グッズ。', cats: 'pc,pad,goods', f: 0, shop: 'sumikko-collaboration' },
  { id: 'rilakkuma', name: 'リラックマ', tag: '', accent: '#D4A574', pt: 'wave', desc: '癒しカラーのゲーミングPC・マウスパッド・グッズ。', cats: 'pc,pad,goods', f: 0, shop: 'rilakkuma-collaboration' },
  { id: 'garupan', name: 'ガールズ＆パンツァー', tag: '', accent: '#795548', pt: 'sphere', desc: 'PC＋パッド＋パネル＋Tシャツ＋アクスタ＋アクキー。', cats: 'pc,pad,panel,tshirt,acrylic', f: 0, shop: 'garupan-collaboration' },
  { id: 'nitowai', name: '新兎わい', tag: '', accent: '#E91E63', pt: 'wave', desc: 'VTuberコラボPC＋マウスパッド＋アクリルスタンド。', cats: 'pc,pad,acrylic', f: 0, shop: 'nitowai-collaboration' },
  { id: 'palworld', name: 'Palworld（パルワールド）', tag: '', accent: '#26C6DA', pt: 'sphere', desc: 'パルデザイン6モデルPC。', cats: 'pc', f: 0, shop: 'palworld-collaboration' },
  { id: 'imas-ml', name: 'アイドルマスター ミリオンライブ！', tag: '', accent: '#FFEB3B', pt: 'straw', desc: '39キャラ個別PC・マウスパッド・マウス・アクキー・パネル。', cats: 'pc,pad,panel,mouse,acrylic', f: 0, shop: 'imas-millionlive-collaboration' },
  { id: 'milpr', name: 'ミリプロ', tag: '', accent: '#00BCD4', pt: 'prism', desc: '音ノ乃のの・甘狼このみ他。PC・マウスパッド・パネル。', cats: 'pc,pad,panel,acrylic', f: 0, shop: 'milpr-collaboration' },
];

// Compute product counts per collab
COLLABS.forEach((cb) => {
  cb.count = 0; // Will be updated from Shopify data
});

export const FEATURED = COLLABS.filter((c) => c.f);
export const REMAINING = COLLABS.filter((c) => !c.f);

// Legal info
export const LEGAL = {
  company: {
    name: '株式会社マイニングベース',
    en: 'Mining Base Co.,Ltd.',
    ceo: '武正 貴昭',
    est: '2018年5月11日',
    addr: '〒174-0063 東京都板橋区前野町1-29-10 FVP板橋ビル1号館2階',
    biz: 'HPCの製造・企画・販売、オリジナルデザインPCの製造・企画・販売、IP コラボレーション事業',
    partners: 'Amazon, ASRock, ASUS, AMD, Human, Intel, Microsoft, MSI, Rakuten 等',
  },
  tokusho: {
    seller: '株式会社マイニングベース',
    resp: '武正 貴昭',
    addr: '〒174-0063 東京都板橋区前野町1-29-10 FVP板橋ビル1号館2階',
    tel: '03-6903-5371',
    email: 'customersupport@mng-base.com',
    pay: 'クレジットカード（一括/分割）、銀行振込',
    ship: '全国一律 3,300円（PC）/ ガジェット・グッズ 別途表示',
    shipTime: 'PC：注文後10〜15営業日前後（土日祝除く）/ ガジェット・グッズ：3〜5営業日',
    cancel: '銀行振込の場合、注文日から3営業日以内に入金確認ができない場合はキャンセル',
    returnP: '初期不良のみ商品到着後7日以内にご連絡ください。お客様都合の返品は原則不可。',
    price: '各商品ページに税込価格で表示',
  },
  warranty: {
    base: 'メーカー1年保証（標準付帯）',
    ext: '最大2年延長（通常保証含め最大3年）',
    extPrice2: '¥9,900',
    extPrice3: '¥14,800',
    scope: 'CPU・GPU含む全パーツの自然故障が対象',
    exclude: '過失・物損（落下、水没、全損等）は対象外',
    repair: '修理部材を在庫運用し最短翌日〜3営業日で返却',
    repairCost: '保証期間内：送料含め完全無料 / 保証期間後：工賃無料（パーツ代のみ実費）',
    support: 'メール・電話・LINE（永年対応）',
    device: 'e-sportsデバイスサポートパック（月額550円〜）でPC以外の通信機器も補償対象',
  },
  privacy:
    'お客様からお預かりした個人情報は、商品の発送・ご連絡等の目的以外には使用いたしません。法令に基づく場合を除き、第三者への提供は行いません。詳細は公式サイトのプライバシーポリシーをご確認ください。',
};

// Marquee items
export const MARQUEE_ITEMS = [
  '✦ 国内自社工場',
  '✦ 全8色カラー',
  '✦ 最長3年保証',
  '✦ 送料無料',
  '✦ UV高精細印刷',
  '✦ 最短10日',
  '✦ 25タイトルコラボ',
];

// UGC reviews
export const UGC = [
  { id: 'u1', u: '@game_setup_jp', t: 'ぼざろコラボPC届いた！ピンクのケースファンが最高すぎる 🔥', c: '#F06292', s: 5, d: '2日前', likes: 342, prod: 'ぼざろPC' },
  { id: 'u2', u: '@esports_tanaka', t: 'SF6コラボPC、ジュリモデルのデザインが格好良すぎ。8ティアから選べるのも最高', c: '#D84315', s: 5, d: '5日前', likes: 218, prod: 'SF6 PC' },
  { id: 'u3', u: '@onepiece_fan', t: 'ルフィモデルPC来た！バウンティラッシュの迫力がそのまま筐体に降臨してる', c: '#E8363A', s: 5, d: '1週前', likes: 567, prod: 'OP PC' },
  { id: 'u4', u: '@pc_review_ch', t: '受注生産なのに10日で届いた。自社工場の品質を感じる', c: '#00F0FF', s: 4, d: '3日前', likes: 891, prod: 'GAMER' },
  { id: 'u5', u: '@sanrio_lover', t: 'サンリオコラボPC、ハローキティモデルが可愛すぎて仕事中もテンション上がる！', c: '#FF69B4', s: 5, d: '4日前', likes: 445, prod: 'サンリオPC' },
];

// Standard PC tiers
export const PC_TIERS = [
  { tier: 'GAMER', gpu: 'RTX 5060', cpu: 'Ryzen 7 5700X', ram: '16GB', price: 199980, pop: false },
  { tier: 'STREAMER', gpu: 'RTX 5070', cpu: 'Ryzen 7 9800X3D', ram: '32GB', price: 433440, pop: true },
  { tier: 'CREATOR', gpu: 'RTX 5080', cpu: 'Core Ultra 9 285K', ram: '32GB', price: 576800, pop: false },
];

export const SHOP_BASE = 'https://shop.mining-base.co.jp/collections/';
export const POLICY_BASE = 'https://shop.mining-base.co.jp/policies/';
