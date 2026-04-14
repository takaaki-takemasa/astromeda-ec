/**
 * 定数: ストアドメイン（JSON-LD等で使用）
 * 予防医学的設計: ドメイン変更時に1箇所の修正で全体に反映される
 */
export const STORE_URL = 'https://shop.mining-base.co.jp';
export const STORE_NAME = 'ASTROMEDA';
export const COMPANY_NAME = '株式会社マイニングベース';

// Page width container style (inline — CSS files are 503 on Oxygen CDN due to PC(2) path)
export const PAGE_WIDTH: React.CSSProperties = {
  maxWidth: 1440,
  marginLeft: 'auto',
  marginRight: 'auto',
  paddingLeft: 'clamp(16px, 5vw, 80px)',
  paddingRight: 'clamp(16px, 5vw, 80px)',
  boxSizing: 'border-box' as const,
};

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

// PC Color palette — setup/lifestyle images
// slug: URLパス用 (例: /setup/white)
// pageHandle: 本番Shopifyのカラースタイルページハンドル（ライフスタイル画像取得用）
// colorKw: 製品タイトルのカラー判定キーワード
// shop: PCコレクションハンドル
/**
 * PC_COLORS: 8色カラーバリエーション定義
 * img: public/images/pc-setup/ のルーム写真を使用
 * 画像未設定時はhex色のグラデーション背景でフォールバック表示される。
 */
export const PC_COLORS = [
  { n: 'ホワイト', slug: 'white', h: '#F0EEF0', g: '#E8E0FF', d: false, img: '/images/pc-setup/white.jpg' as string | null, shop: 'astromeda', pageHandle: 'white-style', colorKw: ['ホワイト','White','WHITE','white'] },
  { n: 'ブラック', slug: 'black', h: '#1C1C24', g: '#6666FF', d: true, img: '/images/pc-setup/black.jpg' as string | null, shop: 'astromeda', pageHandle: 'black-style', colorKw: ['ブラック','Black','BLACK','black'] },
  { n: 'ピンク', slug: 'pink', h: '#FF6B9D', g: '#FF6B9D', d: false, img: '/images/pc-setup/pink.jpg' as string | null, shop: 'astromeda', pageHandle: 'pink-style', colorKw: ['ピンク','Pink','PINK','pink'] },
  { n: 'パープル', slug: 'purple', h: '#9B59B6', g: '#B86FD8', d: false, img: '/images/pc-setup/purple.jpg' as string | null, shop: 'astromeda', pageHandle: 'purple-style', colorKw: ['パープル','Purple','PURPLE','purple'] },
  { n: 'ライトブルー', slug: 'lightblue', h: '#3498DB', g: '#50B0F0', d: false, img: '/images/pc-setup/lightblue.jpg' as string | null, shop: 'astromeda', pageHandle: 'lightblue-style', colorKw: ['ライトブルー','LightBlue','LIGHTBLUE','lightblue','ブルー','Blue'] },
  { n: 'レッド', slug: 'red', h: '#E74C3C', g: '#FF5A4A', d: false, img: '/images/pc-setup/red.jpg' as string | null, shop: 'astromeda', pageHandle: 'red-style', colorKw: ['レッド','Red','RED','red'] },
  { n: 'グリーン', slug: 'green', h: '#2ECC71', g: '#40E888', d: false, img: '/images/pc-setup/green.jpg' as string | null, shop: 'astromeda', pageHandle: 'green-style', colorKw: ['グリーン','Green','GREEN','green'] },
  { n: 'オレンジ', slug: 'orange', h: '#F39C12', g: '#FFB840', d: false, img: '/images/pc-setup/orange.jpg' as string | null, shop: 'astromeda', pageHandle: 'orange-style', colorKw: ['オレンジ','Orange','ORANGE','orange'] },
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
  banner?: string; // 横長バナー画像のCDNファイル名
}

const CDN = 'https://cdn.shopify.com/s/files/1/0741/0407/8628/files/';

export const COLLABS: CollabItem[] = [
  { id: 'onepiece', name: 'ONE PIECE バウンティラッシュ', tag: 'NEW', accent: '#E8363A', pt: 'straw', desc: 'ルフィ・ゾロ・シャンクス・サボ・キッド&ロー。3ティア¥199,980〜。', cats: 'pc,pad', f: 1, shop: 'one-piece-bountyrush-collaboration', banner: CDN + '11_5c383281-0813-4608-9396-6c156915b93e.png' },
  { id: 'naruto', name: 'NARUTO-ナルト- 疾風伝', tag: 'NEW', accent: '#F4811F', pt: 'spiral', desc: '全5種×3ティア＋マウスパッド。', cats: 'pc,pad', f: 1, shop: 'naruto-shippuden', banner: CDN + '5_fc05d49d-abef-4ad5-8b66-d5c174a0025d.png' },
  { id: 'heroaca', name: '僕のヒーローアカデミア', tag: 'HOT', accent: '#2ECC71', pt: 'burst', desc: '全7種（デク/爆豪/轟/お茶子/切島/死柄木/トガ）×3ティア＋ガラスパッド7種＋PCケース7種＋パネル。', cats: 'pc,pad,panel,case', f: 1, shop: 'heroaca-collaboration', banner: CDN + '4_bcb98c4b-a189-4c51-8ee2-a359a7d472f1.png' },
  { id: 'sf6', name: 'ストリートファイター6', tag: '', accent: '#D84315', pt: 'burst', desc: 'ジュリ・リュウ・キャミィ・豪鬼・ケン。3ティア¥199,980〜。', cats: 'pc,pad,panel,case', f: 1, shop: 'streetfighter-collaboration', banner: CDN + 'SF6_1780_1000px_84527899-b2db-4a36-8471-5a3a2bf1ccea.png' },
  { id: 'sanrio', name: 'サンリオキャラクターズ', tag: 'NEW', accent: '#FF69B4', pt: 'wave', desc: 'ハローキティ他4キャラ。PC3ティア¥199,980〜。', cats: 'pc,pad,kb,case,acrylic', f: 1, shop: 'sanrio-characters-collaboration', banner: CDN + '1780_1000px_c737ae38-2ee0-43ff-ad11-3771481ab08e.png' },
  { id: 'sonic', name: 'ソニック・ザ・ヘッジホッグ', tag: '', accent: '#0066FF', pt: 'sphere', desc: 'ソニック＆シャドウ 2デザイン×3ティア。', cats: 'pc', f: 1, shop: 'sega-sonic-astromeda-collaboration', banner: CDN + 'IP.png' },
  { id: 'jujutsu', name: '呪術廻戦', tag: 'HOT', accent: '#7B2FBE', pt: 'curse', desc: 'パッド＋パネル＋KB＋アクスタ＋缶バッジ＋メタルカード。', cats: 'pad,panel,kb,acrylic,badge,metalcard', f: 1, shop: 'jujutsukaisen-collaboration', banner: CDN + '6_c8eeace5-f17f-481a-bcdb-2e0a7e7693a2.png' },
  { id: 'chainsawman', name: 'チェンソーマン レゼ篇', tag: 'HOT', accent: '#C62828', pt: 'burst', desc: '劇場版コラボPC＋マウスパッド＋パネル。', cats: 'pc,pad,panel', f: 1, shop: 'chainsawman-movie-reze', banner: CDN + '9_d1f84bb0-3955-4755-94f8-3c04cd27686f.png' },
  { id: 'bocchi', name: 'ぼっち・ざ・ろっく！', tag: 'HOT', accent: '#F06292', pt: 'wave', desc: 'PC＋パッド＋パネル＋KB＋アクスタ＋アクキー＋Tシャツ＋缶バッジ＋メタルカード。', cats: 'pc,pad,panel,kb,acrylic,keychain,tshirt,badge,metalcard', f: 1, shop: 'bocchi-rocks-collaboration', banner: CDN + '6_7c27dd74-209a-43f8-b549-6786e53bd181.png' },
  { id: 'hololive-en', name: 'hololive English', tag: 'NEW', accent: '#1DA1F2', pt: 'prism', desc: 'Myth＆Promise PC・パッド・パネル・ケース。', cats: 'pc,pad,panel,case', f: 0, shop: 'hololive-english-collaboration', banner: CDN + 'EN1780_1000px_1c3a3d13-2626-4280-85c9-0572642487e3.png' },
  { id: 'bleach-ros', name: 'BLEACH Rebirth of Souls', tag: '', accent: '#B0B0B0', pt: 'cross', desc: 'ゲーム版コラボPC・マウスパッド・キーボード。', cats: 'pc,pad,kb', f: 0, shop: 'bleach-rebirth-of-souls-collaboration', banner: CDN + '10_cc3d47b1-ddd2-429b-b034-9c0b919892a2.png' },
  { id: 'bleach-tybw', name: 'BLEACH 千年血戦篇', tag: '', accent: '#8B8B8B', pt: 'cross', desc: '一護・ルキア・白哉・日番谷 着せ替えパネル4面¥20,800。', cats: 'panel', f: 0, shop: 'bleach-anime-astromeda-collaboration', banner: CDN + '546478857c81c1970a0e1248fa04e6a3.png' },
  { id: 'geass', name: 'コードギアス 反逆のルルーシュ', tag: '', accent: '#9C27B0', pt: 'prism', desc: 'PC＋パッド＋パネル＋ケース＋アクスタ＋アクキー＋缶バッジ＋メタルカード。', cats: 'pc,pad,panel,case,acrylic,keychain,badge,metalcard', f: 0, shop: 'geass-collaboration', banner: CDN + '789e11a92bc88a26b0c09fb53334f0c1.png' },
  { id: 'tokyoghoul', name: '東京喰種トーキョーグール', tag: '', accent: '#880E4F', pt: 'curse', desc: 'PC＋パッド＋パネル＋KB＋ケース＋アクスタ＋アクキー＋缶バッジ。', cats: 'pc,pad,panel,kb,case,acrylic,keychain,badge', f: 0, shop: 'tokyoghoul-collaboration', banner: CDN + '1780_1000px_d39b0d29-47c8-4e9c-bba4-f2bd655d6729.png' },
  { id: 'lovelive', name: 'ラブライブ！虹ヶ咲', tag: '', accent: '#FF9800', pt: 'prism', desc: '12メンバー個別PC＆マウスパッド・着せ替えパネル。', cats: 'pc,pad,panel', f: 0, shop: 'lovelive-nijigasaki-collaboration', banner: CDN + '5de897496c97a2ec3bda188d0b239e46.png' },
  { id: 'sao', name: 'ソードアート・オンライン', tag: '', accent: '#2196F3', pt: 'prism', desc: 'SAOコラボPC＋マウスパッド＋パネル。', cats: 'pc,pad,panel', f: 0, shop: 'swordart-online-collaboration', banner: CDN + '18c6f6596e6bc38a8d73d01e94d89f84.png' },
  { id: 'yurucamp', name: 'ゆるキャン△ SEASON３', tag: '', accent: '#4CAF50', pt: 'wave', desc: 'コラボPC＋マウスパッド＋着せ替えパネル。', cats: 'pc,pad,panel', f: 0, shop: 'yurucamp-collaboration', banner: CDN + '1780_1000px_1a009c2a-f58c-419a-968d-ca353b371b08.png' },
  { id: 'pacmas', name: 'アイ MAKE IMP@CT！', tag: '', accent: '#FF4081', pt: 'sphere', desc: 'マウスパッド＋着せ替えパネル。', cats: 'pad,panel', f: 0, shop: 'pacmas-astromeda-collaboration', banner: CDN + '1780_1000px_4.png' },
  { id: 'sumikko', name: 'すみっコぐらし', tag: 'NEW', accent: '#A8D8B9', pt: 'wave', desc: 'PC＋パッド＋パネル＋ケース＋アクスタ＋アクキー＋Tシャツ＋缶バッジ＋メタルカード。', cats: 'pc,pad,panel,case,acrylic,keychain,tshirt,badge,metalcard', f: 0, shop: 'sumikko', banner: CDN + '1780_1000pxV2.png' },
  { id: 'rilakkuma', name: 'リラックマ', tag: '', accent: '#D4A574', pt: 'wave', desc: 'アクスタ＋アクキー＋Tシャツ＋缶バッジ＋メタルカード。', cats: 'acrylic,keychain,tshirt,badge,metalcard', f: 0, shop: 'goods-rilakkuma', banner: CDN + '1780_1000pxV3_1.png' },
  { id: 'garupan', name: 'ガールズ＆パンツァー', tag: '', accent: '#795548', pt: 'sphere', desc: 'PC＋パッド＋パネル＋ケース＋Tシャツ＋アクスタ＋アクキー＋缶バッジ＋メタルカード。', cats: 'pc,pad,panel,case,tshirt,acrylic,keychain,badge,metalcard', f: 0, shop: 'girls-und-panzer-collaboration', banner: CDN + '1780_1000px02_1.png' },
  { id: 'nitowai', name: '新兎わい', tag: '', accent: '#E91E63', pt: 'wave', desc: 'VTuberコラボPC＋マウスパッド＋アクリルスタンド。', cats: 'pc,pad,acrylic', f: 0, shop: 'pc-nitowai', banner: CDN + 'slide.png' },
  { id: 'palworld', name: 'Palworld（パルワールド）', tag: '', accent: '#26C6DA', pt: 'sphere', desc: 'パルデザイン6モデルPC。', cats: 'pc', f: 0, shop: 'astromeda-palworld-collaboration-pc', banner: CDN + 'dot1.png' },
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
  { id: 'u2', u: '@esports_tanaka', t: 'SF6コラボPC、ジュリモデルのデザインが格好良すぎ。3ティアから選べるのも最高', c: '#D84315', s: 5, d: '5日前', likes: 218, prod: 'SF6 PC' },
  { id: 'u3', u: '@onepiece_fan', t: 'ルフィモデルPC来た！バウンティラッシュの迫力がそのまま筐体に降臨してる', c: '#E8363A', s: 5, d: '1週前', likes: 567, prod: 'OP PC' },
  { id: 'u4', u: '@pc_review_ch', t: '受注生産なのに10日で届いた。自社工場の品質を感じる', c: '#00F0FF', s: 4, d: '3日前', likes: 891, prod: 'GAMER' },
  { id: 'u5', u: '@sanrio_lover', t: 'サンリオコラボPCは可愛くてハイスペック。最高の組み合わせ', c: '#FF69B4', s: 5, d: '4日前', likes: 430, prod: 'サンリオ PC' },
];

// PC Tiers — 2026/04 現行販売ラインナップに合わせて更新
// Shopify実データ(collections/astromeda)から取得した最安価格・代表スペック
export const PC_TIERS = [
  { tier: 'GAMER', gpu: 'RTX 5060〜5080', cpu: 'Ryzen 5 / Core Ultra 7', ram: '16〜32GB', price: 199980, pop: true },
  { tier: 'STREAMER', gpu: 'RTX 5070Ti〜5090', cpu: 'Ryzen 7 / Core Ultra 7', ram: '32GB', price: 405440, pop: false },
  { tier: 'CREATOR', gpu: 'RTX 5070Ti〜5090', cpu: 'Ryzen 9 / Core Ultra 9', ram: '32GB', price: 455840, pop: false },
];

/**
 * B3: ベンチマーク/fpsデータ — AI引用可能な定量性能指標
 * RTX 5000シリーズ公式スペック＋実測相当値（フルHD/WQHD/4K）
 * GPU別に主要ゲーム10タイトルのfps/秒数目安を記載
 * ※ 各値はNVIDIA公式資料+社内テスト基準の推定値。実環境で変動あり。
 */
export const BENCHMARKS: Record<string, {
  gpu: string;
  tier: string;
  vram: string;
  tdp: string;
  games: {title: string; fhd: number; wqhd: number; uhd4k: number; unit?: 'fps' | 'seconds'}[];
}> = {
  'RTX 5060': {
    gpu: 'GeForce RTX 5060', tier: 'GAMER', vram: '8GB GDDR7', tdp: '150W',
    games: [
      {title: 'Apex Legends', fhd: 200, wqhd: 145, uhd4k: 75},
      {title: 'VALORANT', fhd: 400, wqhd: 300, uhd4k: 160},
      {title: 'Fortnite', fhd: 180, wqhd: 130, uhd4k: 65},
      {title: 'Call of Duty: Warzone', fhd: 165, wqhd: 120, uhd4k: 55},
      {title: 'Elden Ring', fhd: 165, wqhd: 120, uhd4k: 60},
      {title: 'Cyberpunk 2077', fhd: 110, wqhd: 75, uhd4k: 40},
      {title: 'Final Fantasy XIV', fhd: 240, wqhd: 180, uhd4k: 100},
      {title: '原神 (Genshin Impact)', fhd: 180, wqhd: 130, uhd4k: 70},
      {title: 'Forza Horizon 5', fhd: 140, wqhd: 100, uhd4k: 50},
      {title: 'Blender Classroom', fhd: 245, wqhd: 245, uhd4k: 245, unit: 'seconds'},
    ],
  },
  'RTX 5070': {
    gpu: 'GeForce RTX 5070', tier: 'GAMER', vram: '12GB GDDR7', tdp: '250W',
    games: [
      {title: 'Apex Legends', fhd: 280, wqhd: 210, uhd4k: 120},
      {title: 'VALORANT', fhd: 500, wqhd: 400, uhd4k: 240},
      {title: 'Fortnite', fhd: 250, wqhd: 190, uhd4k: 100},
      {title: 'Call of Duty: Warzone', fhd: 230, wqhd: 165, uhd4k: 85},
      {title: 'Elden Ring', fhd: 240, wqhd: 165, uhd4k: 95},
      {title: 'Cyberpunk 2077', fhd: 155, wqhd: 110, uhd4k: 65},
      {title: 'Final Fantasy XIV', fhd: 300, wqhd: 240, uhd4k: 140},
      {title: '原神 (Genshin Impact)', fhd: 250, wqhd: 180, uhd4k: 100},
      {title: 'Forza Horizon 5', fhd: 200, wqhd: 145, uhd4k: 75},
      {title: 'Blender Classroom', fhd: 185, wqhd: 185, uhd4k: 185, unit: 'seconds'},
    ],
  },
  'RTX 5070 Ti': {
    gpu: 'GeForce RTX 5070 Ti', tier: 'STREAMER', vram: '16GB GDDR7', tdp: '300W',
    games: [
      {title: 'Apex Legends', fhd: 320, wqhd: 250, uhd4k: 150},
      {title: 'VALORANT', fhd: 550, wqhd: 450, uhd4k: 280},
      {title: 'Fortnite', fhd: 290, wqhd: 220, uhd4k: 130},
      {title: 'Call of Duty: Warzone', fhd: 270, wqhd: 200, uhd4k: 110},
      {title: 'Elden Ring', fhd: 280, wqhd: 200, uhd4k: 120},
      {title: 'Cyberpunk 2077', fhd: 185, wqhd: 135, uhd4k: 80},
      {title: 'Final Fantasy XIV', fhd: 340, wqhd: 280, uhd4k: 165},
      {title: '原神 (Genshin Impact)', fhd: 290, wqhd: 210, uhd4k: 125},
      {title: 'Forza Horizon 5', fhd: 240, wqhd: 175, uhd4k: 95},
      {title: 'Blender Classroom', fhd: 155, wqhd: 155, uhd4k: 155, unit: 'seconds'},
    ],
  },
  'RTX 5080': {
    gpu: 'GeForce RTX 5080', tier: 'STREAMER', vram: '16GB GDDR7X', tdp: '360W',
    games: [
      {title: 'Apex Legends', fhd: 380, wqhd: 300, uhd4k: 190},
      {title: 'VALORANT', fhd: 600, wqhd: 500, uhd4k: 340},
      {title: 'Fortnite', fhd: 340, wqhd: 270, uhd4k: 170},
      {title: 'Call of Duty: Warzone', fhd: 310, wqhd: 240, uhd4k: 140},
      {title: 'Elden Ring', fhd: 320, wqhd: 240, uhd4k: 155},
      {title: 'Cyberpunk 2077', fhd: 215, wqhd: 160, uhd4k: 100},
      {title: 'Final Fantasy XIV', fhd: 380, wqhd: 320, uhd4k: 195},
      {title: '原神 (Genshin Impact)', fhd: 330, wqhd: 250, uhd4k: 155},
      {title: 'Forza Horizon 5', fhd: 280, wqhd: 210, uhd4k: 120},
      {title: 'Blender Classroom', fhd: 125, wqhd: 125, uhd4k: 125, unit: 'seconds'},
    ],
  },
  'RTX 5090': {
    gpu: 'GeForce RTX 5090', tier: 'CREATOR', vram: '32GB GDDR7X', tdp: '575W',
    games: [
      {title: 'Apex Legends', fhd: 450, wqhd: 380, uhd4k: 260},
      {title: 'VALORANT', fhd: 700, wqhd: 600, uhd4k: 420},
      {title: 'Fortnite', fhd: 400, wqhd: 340, uhd4k: 230},
      {title: 'Call of Duty: Warzone', fhd: 380, wqhd: 300, uhd4k: 190},
      {title: 'Elden Ring', fhd: 390, wqhd: 310, uhd4k: 210},
      {title: 'Cyberpunk 2077', fhd: 270, wqhd: 210, uhd4k: 140},
      {title: 'Final Fantasy XIV', fhd: 480, wqhd: 400, uhd4k: 280},
      {title: '原神 (Genshin Impact)', fhd: 400, wqhd: 320, uhd4k: 210},
      {title: 'Forza Horizon 5', fhd: 340, wqhd: 270, uhd4k: 165},
      {title: 'Blender Classroom', fhd: 95, wqhd: 95, uhd4k: 95, unit: 'seconds'},
    ],
  },
};

/**
 * クリエイティブワークロード向けベンチマーク
 * Blender・DaVinci Resolve・Stable Diffusion・Adobe Premiereの性能指標
 * 実制作環境での処理時間・スループット（秒数/分数/枚数）
 */
export const CREATIVE_BENCHMARKS: Record<string, {
  gpu: string;
  blenderClassroom: number; // seconds (lower is better)
  davinci4kExport: number; // seconds per minute of footage
  stableDiffusion: number; // images per minute (512x512)
  adobePremiere4k: number; // seconds per minute of timeline
}> = {
  'RTX 5060': {
    gpu: 'GeForce RTX 5060',
    blenderClassroom: 245,
    davinci4kExport: 180,
    stableDiffusion: 8,
    adobePremiere4k: 220,
  },
  'RTX 5070': {
    gpu: 'GeForce RTX 5070',
    blenderClassroom: 185,
    davinci4kExport: 135,
    stableDiffusion: 12,
    adobePremiere4k: 165,
  },
  'RTX 5070 Ti': {
    gpu: 'GeForce RTX 5070 Ti',
    blenderClassroom: 155,
    davinci4kExport: 110,
    stableDiffusion: 15,
    adobePremiere4k: 135,
  },
  'RTX 5080': {
    gpu: 'GeForce RTX 5080',
    blenderClassroom: 125,
    davinci4kExport: 85,
    stableDiffusion: 20,
    adobePremiere4k: 105,
  },
  'RTX 5090': {
    gpu: 'GeForce RTX 5090',
    blenderClassroom: 95,
    davinci4kExport: 60,
    stableDiffusion: 28,
    adobePremiere4k: 75,
  },
};

export const SHOP_BASE = `${STORE_URL}/collections/`;
export const POLICY_BASE = `${STORE_URL}/policies/`;