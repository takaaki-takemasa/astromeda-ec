/**
 * Collection route helper functions and constants
 * Extracted from app/routes/collections.$handle.tsx for maintainability
 */
import {AppError} from '~/lib/app-error';

import {getPaginationVariables} from '@shopify/hydrogen';
import {redirect} from 'react-router';
import {COLLABS} from '~/lib/astromeda-data';
import type {Route} from '~/routes/+types/collections.$handle';

// ─── IP × 製品タイプ フィルタリング ───────────────────────

export const IP_TAG_MAP: Record<string, string[]> = {
  onepiece:    ['ワンピース', 'ONE PIECE', 'バウンティラッシュ'],
  naruto:      ['ナルト', 'NARUTO'],
  heroaca:     ['ヒロアカ', 'ヒーローアカデミア'],
  sf6:         ['スト6', 'ストリートファイター', 'SF6'],
  sanrio:      ['サンリオ', 'キティ', 'シナモロール', 'マイメロ', 'クロミ', 'ポムポムプリン'],
  sonic:       ['ソニック', 'SONIC'],
  jujutsu:     ['呪術', 'jujutsu'],
  chainsawman: ['チェンソーマン', 'chainsaw'],
  bocchi:      ['ぼざろ', 'ぼっち'],
  'hololive-en': ['ホロライブ', 'hololive', 'ホロEN'],
  'bleach-ros':  ['BLEACH Rebirth'],
  'bleach-tybw': ['BLEACH 千年', 'BLEACH アニメ'],
  geass:       ['コードギアス', 'ギアス', 'ルルーシュ'],
  tokyoghoul:  ['東京喰種', '喰種'],
  lovelive:    ['ラブライブ', 'LoveLive'],
  sao:         ['SAO', 'ソードアート'],
  yurucamp:    ['ゆるキャン'],
  pacmas:      ['パックマス', 'パクマス'],
  sumikko:     ['すみっコ'],
  rilakkuma:   ['リラックマ'],
  garupan:     ['ガルパン', 'ガールズ＆パンツァー'],
  nitowai:     ['新兎わい', 'にとわい'],
  palworld:    ['パルワールド', 'Palworld'],
  imas:        ['アイドルマスター', 'ミリオンライブ'],
  milpr:       ['ミリプロ'],
  blackdesert: ['黒い砂漠'],
  // patch 0102: ACTIVE 商品 3軸監査で 244 件の PC に NOEZ FOXX ブランドタグが付いているが
  // IP_TAG_MAP に不在 → IP 検出ゼロになっていた。ブランド名だけでも IP として扱って
  // IPフィルタに載せる (専用コラボハンドルが無い場合はトップ「ゲーミングPC」表示のみ)
  noezfoxx:    ['NOEZ FOXX', 'ノイズフォックス'],
};

export const PRODUCT_TYPE_KW: Record<string, string[]> = {
  'ゲーミングPC': ['ゲーミングPC', 'コラボレーションPC', 'コラボPC'],
  'マウスパッド': ['マウスパッド'],
  'キーボード':  ['キーボード'],
  'パネル':      ['パネル', '着せ替え'],
  'PCケース':    ['PCケース', 'ケースファン'],
  'アクリルスタンド': ['アクリルスタンド', 'アクスタ'],
  'アクリルキーホルダー': ['アクリルキーホルダー', 'アクキー'],
  'Tシャツ':     ['Tシャツ'],
  'パーカー':    ['パーカー'],
  '缶バッジ':    ['缶バッジ'],
  'メタルカード': ['メタルカード'],
  'トートバッグ': ['トートバッグ'],
  'モバイルバッテリー': ['モバイルバッテリー'],
};

// ガジェット系キーワード（PC周辺機器）
export const GADGET_KEYWORDS = ['マウスパッド', 'キーボード', 'パネル', '着せ替え', 'PCケース', 'ケースファン'];

// PC系判定パターン
export const PC_PATTERN = /[【\[](GAMER|STREAMER|CREATOR)[】\]]|コラボレーションPC|コラボPC|Collaboration PC/;
export const PC_GAMING_PATTERN = /ゲーミングPC/;

// コレクションハンドル → IP ID マッピング（COLLABS から自動生成）
export const HANDLE_TO_IP: Record<string, string> = Object.fromEntries(
  COLLABS.map((c) => [c.shop, c.id]),
);

// ─── Detection functions ───────────────────────

export function detectIP(title: string, tags: string[]): string | null {
  const text = title + ' ' + tags.join(' ');
  for (const [id, kws] of Object.entries(IP_TAG_MAP)) {
    if (kws.some((kw) => text.includes(kw))) return id;
  }
  return null;
}

export function detectProductType(title: string, tags: string[] = []): string | null {
  // 1) タイトルに明示キーワードがあれば最優先
  for (const [type, kws] of Object.entries(PRODUCT_TYPE_KW)) {
    if (kws.some((kw) => title.includes(kw))) return type;
  }
  // 2) patch 0102: タグで後退判定 (#パックマス 系や旧 Shopify の "コラボPC" タグ)
  //    「#パックマス [キャラ]モデル-」のようにタイトルが PC_PATTERN に一致しないが
  //    tags に 'コラボPC' 'パックマスPC' 等が付いている 42 件のゲーミングPCを救う。
  for (const t of tags) {
    if (t === 'コラボPC' || t === 'パックマスPC' || /PC$/.test(t)) return 'ゲーミングPC';
  }
  return null;
}

/**
 * マウスパッド素材タイプ判定: ラバー / ポロンライク / ガラス
 * タイトルに素材キーワードがあれば優先。なければ価格帯で判定:
 *   ¥13,000以上 → ガラス / ¥8,000以上 → ポロンライク / それ以下 → ラバー
 */
export function detectMousepadMaterial(title: string, price: number): string | null {
  if (!title.includes('マウスパッド')) return null;
  // 1. タイトルに明示的な素材キーワードがあれば最優先
  if (title.includes('ポロン')) return 'ポロンライク';
  if (title.includes('ガラス')) return 'ガラス';
  if (title.includes('ラバー')) return 'ラバー';
  // 2. タイトルに素材記載なし → 価格帯で判定
  if (price >= 13000) return 'ガラス';
  if (price >= 8000) return 'ポロンライク';
  return 'ラバー';
}

export function extractSpec(tags: string[], prefix: string): string | null {
  const tag = tags.find((t) => t.startsWith(prefix + ':'));
  return tag ? tag.slice(prefix.length + 1) : null;
}

// patch 0014: Shopify タグに `CPU:...` / `GPU:...` が付いていない商品のため、
// 商品タイトルからも CPU/GPU を抽出できるようにする。gaming-pc コレクション等で
// CPU/GPU プルダウンを実機能させるための安全な後退手段。
const CPU_TITLE_PATTERNS = [
  /Core\s*Ultra\s*[3579]\s*\d{3,4}[A-Z]*/i,
  /Core\s*i[3579]-\d{4,5}[A-Z]*/i,
  /Core\s*i[3579]\s+\d{4,5}[A-Z]*/i,
  /Ryzen\s*[3579]\s*\d{3,4}X3D/i,
  /Ryzen\s*[3579]\s*\d{4}[A-Z]*/i,
];
const GPU_TITLE_PATTERNS = [
  /RTX\s*\d{4}\s*(Ti|SUPER)?/i,
  /GTX\s*\d{4}\s*(Ti|SUPER)?/i,
  /RX\s*\d{4}\s*(XT|XTX)?/i,
  /Arc\s*[AB]\d{3}/i,
];

/**
 * CPU/GPU ラベル正規化:
 *  - "RTX5070Ti" → "RTX 5070 Ti", "Ryzen7 5700X" → "Ryzen 7 5700X" のように
 *    数字や接尾辞前に空白を入れて重複を畳む
 */
function normalizeHardwareLabel(raw: string, kind: 'CPU' | 'GPU'): string {
  let s = raw.replace(/\s+/g, ' ').trim();
  if (kind === 'GPU') {
    s = s.replace(/^(RTX|GTX|RX|Arc)(\d)/i, '$1 $2');
    s = s.replace(/(\d)(Ti|SUPER|XT|XTX)\b/i, '$1 $2');
  } else {
    // CPU: "Ryzen7 X" → "Ryzen 7 X", "Core i7" 系はそのまま
    s = s.replace(/^(Ryzen)(\d)/i, '$1 $2');
  }
  // Ti/SUPER/XT は表記を Ti/SUPER/XT に統一（ヒット時の大小混在を解消）
  s = s.replace(/\bsuper\b/i, 'SUPER').replace(/\bti\b/i, 'Ti').replace(/\bxt\b/i, 'XT').replace(/\bxtx\b/i, 'XTX');
  return s;
}

/**
 * CPU/GPU 抽出（タグ優先・タイトル後退）
 * Shopify の product.tags に `CPU:Ryzen7 5700X` のように付与されていればそれを返し、
 * タグが無ければ商品タイトル中のパターンマッチで抽出する。
 * 抽出後は表記揺れを正規化して dedup 効率を上げる。
 */
export function extractHardwareSpec(
  title: string,
  tags: string[],
  kind: 'CPU' | 'GPU',
): string | null {
  const fromTag = extractSpec(tags, kind);
  if (fromTag) return normalizeHardwareLabel(fromTag, kind);
  const patterns = kind === 'CPU' ? CPU_TITLE_PATTERNS : GPU_TITLE_PATTERNS;
  for (const p of patterns) {
    const m = title.match(p);
    if (m) return normalizeHardwareLabel(m[0], kind);
  }
  return null;
}

// ─── Loader functions ───────────────────────

export async function loadCriticalData({context, params, request}: Route.LoaderArgs) {
  const {handle} = params;
  const {storefront} = context;
  const paginationVariables = getPaginationVariables(request, {pageBy: 48});

  if (!handle) {
    throw redirect('/collections');
  }

  // 販売停止 IP の 301 リダイレクト（SEO・UX保全）
  // imas-millionlive-collaboration: Shopify にコレクション不在で 500 を返していた
  // milpr-pc / black-desert-collaboration: 販売停止方針に合わせて誘導
  const DISCONTINUED_IP_HANDLES = new Set([
    'imas-millionlive-collaboration',
    'milpr-pc',
    'black-desert-collaboration',
  ]);
  if (DISCONTINUED_IP_HANDLES.has(handle)) {
    throw redirect('/collections/gaming-pc', 301);
  }

  // patch 0013: シンセティック handle の 302 リダイレクト
  // hero banner / footer / category cards で参照されるが Shopify 上に対応する
  // コレクションが存在しない handle (new-arrivals / ip-collaborations) を、
  // 機能的に等価な既存コレクション (astromeda = 52商品 + IP collab grid landing)
  // へ案内する。CMS 編集で別コレクションへ向ければこのリダイレクトは発火しない。
  const SYNTHETIC_HANDLE_REDIRECTS: Record<string, string> = {
    'new-arrivals': '/collections/astromeda?sort=newest',
    'ip-collaborations': '/collections/astromeda',
  };
  if (handle in SYNTHETIC_HANDLE_REDIRECTS) {
    throw redirect(SYNTHETIC_HANDLE_REDIRECTS[handle], 302);
  }

  const url = new URL(request.url);
  const sortParam = url.searchParams.get('sort') ?? 'newest';
  let sortKey = 'CREATED';
  let reverse = true;
  if (sortParam === 'default') {sortKey = 'COLLECTION_DEFAULT'; reverse = false;}
  if (sortParam === 'price-asc') {sortKey = 'PRICE'; reverse = false;}
  if (sortParam === 'price-desc') {sortKey = 'PRICE'; reverse = true;}
  if (sortParam === 'newest') {sortKey = 'CREATED'; reverse = true;}
  if (sortParam === 'best') {sortKey = 'BEST_SELLING'; reverse = false;}

  let collection;
  try {
    const [result] = await Promise.all([
      storefront.query(COLLECTION_QUERY, {
        variables: {handle, sortKey, reverse, ...paginationVariables},
      }),
    ]);
    collection = result.collection;
  } catch (error) {
    process.env.NODE_ENV === 'development' && console.error('[collections.$handle] Storefront API error:', error);
    throw AppError.externalApi('コレクションデータの取得に失敗しました', {handle, source: 'Storefront API'});
  }

  if (!collection) {
    throw AppError.notFound('コレクションが見つかりません', {handle});
  }

  const {redirectIfHandleIsLocalized} = await import('~/lib/redirect');
  redirectIfHandleIsLocalized(request, {handle, data: collection});

  // ── 商品補完ロジック ──
  // Shopifyスマートコレクションのタグ条件に含まれていない商品を
  // Storefront API の商品検索で補完する
  //
  // 対象:
  // 1. グッズコレクション: 缶バッジ、メタルカード、トートバッグ、モバイルバッテリーなど
  // 2. IPコレクション: タグ不備で漏れているキーボード、パネル、PCケースなど
  // 3. ガジェットコレクション: タグ不備の周辺機器
  //
  // 重要: キーワードごとに個別検索を実行する（並列）。
  // 1つのOR統合クエリだと first:50 の枠が特定タイプ（パネル等）に偏り、
  // キーボードやマウスパッドが0件になる深刻な欠落が発生していた。
  {
    // M8-SKELETAL-02: モジュールレベルの IP_TAG_MAP を統一使用（重複排除）

    // HANDLE → IP ID マッピング (COLLABSから構築)
    const handleToIpId: Record<string, string> = {};
    for (const c of COLLABS) {
      handleToIpId[c.shop] = c.id;
    }

    let supplementalKeywords: string[] = [];

    if (handle === 'goods') {
      // グッズ: 缶バッジ、メタルカード、トートバッグ、モバイルバッテリー
      supplementalKeywords = ['缶バッジ', 'メタルカード', 'トートバッグ', 'モバイルバッテリー'];
    } else if (handle === 'gadgets') {
      // ガジェット: キーボード、マウスパッド、PCケース、パネル、着せ替え
      // ※ 着せ替えトップメッシュフィルター（6件）はタイトルに「パネル」を含まないため
      //   Smart Collection（パネル条件）から漏れる → 着せ替えも個別検索
      supplementalKeywords = ['キーボード', 'マウスパッド', 'PCケース', 'パネル', '着せ替え'];
    } else {
      // IPコレクション: そのIPに関連する全商品を検索で補完
      const ipId = handleToIpId[handle];
      if (ipId) {
        supplementalKeywords = IP_TAG_MAP[ipId] ?? [];
      }
    }

    if (supplementalKeywords.length > 0) {
      type ProductNode = (typeof collection.products.nodes)[number];
      const existingIds = new Set(collection.products.nodes.map((p: ProductNode) => p.id));

      // ガジェット/グッズ: キーワードごとに個別検索を並列実行
      // → 1つのOR統合クエリだと first:50 の枠がパネル49件で埋まり
      //   キーボード0件になる深刻な欠落が発生していたため
      // IPコレクション: キーワードが同一IP内なのでOR統合で問題なし
      const isPerKeywordSearch = handle === 'gadgets' || handle === 'goods';

      let allSupplementalNodes: ProductNode[] = [];

      if (isPerKeywordSearch) {
        // キーワードごとに並列実行（各50件）
        // ※ Storefront API の title: プレフィックス検索は日本語で正常動作しない
        //   (title:キーボード → 0件、キーボード → 22件)
        //   よってベア検索（プレフィックスなし）を使用
        const searches = supplementalKeywords.map((kw) =>
          storefront.query(PRODUCTS_SEARCH_QUERY, {
            variables: {query: kw, first: 50},
          }).catch(() => null)
        );
        const results = await Promise.all(searches);
        for (const r of results) {
          if (r?.products?.nodes) {
            allSupplementalNodes = allSupplementalNodes.concat(r.products.nodes);
          }
        }
      } else {
        // IPコレクション等: OR統合クエリ
        // IP名はベア検索（日本語 title: プレフィックスが不安定なため）
        const combinedQuery = supplementalKeywords
          .join(' OR ');
        try {
          const result = await storefront.query(PRODUCTS_SEARCH_QUERY, {
            variables: {query: combinedQuery, first: 50},
          });
          if (result?.products?.nodes) {
            allSupplementalNodes = result.products.nodes;
          }
        } catch {
          // 補完検索が失敗してもコレクション本体は返す
        }
      }

      const extraProducts: ProductNode[] = [];
      for (const product of allSupplementalNodes) {
        if (!existingIds.has(product.id)) {
          existingIds.add(product.id);
          extraProducts.push(product);
        }
      }

      if (extraProducts.length > 0) {
        collection.products.nodes = [
          ...collection.products.nodes,
          ...extraProducts,
        ];
      }
    }
  }

  // ── ゲーミングPC Landing 用データ（astromeda / gaming-pc コレクション時のみ） ──
  const isGamingLanding = handle === 'astromeda' || handle === 'gaming-pc';
  // patch 0038: Metaobject 化した特集/パーツ/価格帯を追加。Metaobject が空ならコンポーネント側のフォールバックを使う。
  // patch 0039: Hero スライドとお問い合わせ情報も Metaobject 化
  type MetaCard = {label: string; href: string; img?: string};
  type GamingHeroSlide = {alt_text: string; image_url: string; link_url: string};
  type GamingContactInfo = {phone_number: string; phone_hours: string; line_url: string; line_label: string; line_hours: string};
  const gamingLandingData: {
    rankingProducts: Array<{title: string; handle: string; price: string; image: string}>;
    newsItems: Array<{date: string; title: string; url: string}>;
    featureCards: MetaCard[];
    cpuCards: MetaCard[];
    gpuCards: MetaCard[];
    priceRanges: Array<{label: string; href: string}>;
    gamingHeroSlides: GamingHeroSlide[];
    contactInfo: GamingContactInfo | null;
  } = {
    rankingProducts: [],
    newsItems: [],
    featureCards: [],
    cpuCards: [],
    gpuCards: [],
    priceRanges: [],
    gamingHeroSlides: [],
    contactInfo: null,
  };
  if (isGamingLanding) {
    // patch 0038: Admin client 経由で Metaobject 3 タイプを取得
    const env = (context as unknown as {env?: Env}).env;
    let adminClient: Awaited<ReturnType<typeof import('../../agents/core/shopify-admin.js').getAdminClient>> | null = null;
    try {
      if (env) {
        const {setAdminEnv, getAdminClient} = await import('../../agents/core/shopify-admin.js');
        setAdminEnv(env);
        adminClient = getAdminClient();
      }
    } catch {
      adminClient = null;
    }

    const emptyMo = async () => [] as Array<{id: string; handle: string; fields: Array<{key: string; value: string}>}>;

    try {
      const [rankingResult, blogResult, featureRes, partsRes, priceRes, heroRes, contactRes] = await Promise.allSettled([
        storefront.query(GAMING_RANKING_QUERY, {variables: {}}),
        storefront.query(GAMING_NEWS_QUERY, {variables: {}}),
        adminClient ? adminClient.getMetaobjects('astromeda_gaming_feature_card', 20) : emptyMo(),
        adminClient ? adminClient.getMetaobjects('astromeda_gaming_parts_card', 20) : emptyMo(),
        adminClient ? adminClient.getMetaobjects('astromeda_gaming_price_range', 20) : emptyMo(),
        adminClient ? adminClient.getMetaobjects('astromeda_gaming_hero_slide', 20) : emptyMo(),
        adminClient ? adminClient.getMetaobjects('astromeda_gaming_contact', 5) : emptyMo(),
      ]);

      if (rankingResult.status === 'fulfilled' && rankingResult.value?.collection?.products?.nodes) {
        for (const p of rankingResult.value.collection.products.nodes) {
          gamingLandingData.rankingProducts.push({
            title: p.title,
            handle: p.handle,
            price: p.priceRange?.minVariantPrice?.amount ?? '0',
            image: p.featuredImage?.url ?? '',
          });
        }
      }

      if (blogResult.status === 'fulfilled' && blogResult.value?.blog?.articles?.nodes) {
        for (const a of blogResult.value.blog.articles.nodes) {
          const d = new Date(a.publishedAt);
          gamingLandingData.newsItems.push({
            date: `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, '0')}月${String(d.getDate()).padStart(2, '0')}日`,
            title: a.title,
            url: `/blogs/news/${a.handle}`,
          });
        }
      }

      // patch 0038: Metaobject → フィールドマップ
      const fieldsToMap = (fields: Array<{key: string; value: string}>): Record<string, string> => {
        const m: Record<string, string> = {};
        for (const f of fields) m[f.key] = f.value;
        return m;
      };
      const toCard = (node: {fields: Array<{key: string; value: string}>}): {sortOrder: number; isActive: boolean; label: string; href: string; img?: string; category?: string} => {
        const m = fieldsToMap(node.fields);
        return {
          sortOrder: Number(m.display_order || 0),
          isActive: m.is_active !== 'false',
          label: m.label || '',
          href: m.link_url || '',
          img: m.image_url || undefined,
          category: m.category || undefined,
        };
      };

      if (featureRes.status === 'fulfilled' && Array.isArray(featureRes.value)) {
        gamingLandingData.featureCards = featureRes.value
          .map(toCard)
          .filter((c) => c.isActive && c.label)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(({label, href, img}) => ({label, href, img}));
      }

      if (partsRes.status === 'fulfilled' && Array.isArray(partsRes.value)) {
        const allParts = partsRes.value
          .map(toCard)
          .filter((c) => c.isActive && c.label)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        gamingLandingData.cpuCards = allParts
          .filter((c) => (c.category || '').toLowerCase() === 'cpu')
          .map(({label, href, img}) => ({label, href, img}));
        gamingLandingData.gpuCards = allParts
          .filter((c) => (c.category || '').toLowerCase() === 'gpu')
          .map(({label, href, img}) => ({label, href, img}));
      }

      if (priceRes.status === 'fulfilled' && Array.isArray(priceRes.value)) {
        gamingLandingData.priceRanges = priceRes.value
          .map(toCard)
          .filter((c) => c.isActive && c.label)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(({label, href}) => ({label, href}));
      }

      // patch 0039: Gaming Hero スライド
      if (heroRes.status === 'fulfilled' && Array.isArray(heroRes.value)) {
        gamingLandingData.gamingHeroSlides = heroRes.value
          .map((node) => {
            const m = fieldsToMap(node.fields);
            return {
              sortOrder: Number(m.display_order || 0),
              isActive: m.is_active !== 'false',
              alt_text: m.alt_text || '',
              image_url: m.image_url || '',
              link_url: m.link_url || '/',
            };
          })
          .filter((s) => s.isActive && s.image_url)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(({alt_text, image_url, link_url}) => ({alt_text, image_url, link_url}));
      }

      // patch 0039: Gaming お問い合わせ情報（単一レコード — 先頭の is_active=true を採用）
      if (contactRes.status === 'fulfilled' && Array.isArray(contactRes.value)) {
        const activeContact = contactRes.value
          .map((node) => fieldsToMap(node.fields))
          .find((m) => m.is_active !== 'false');
        if (activeContact && (activeContact.phone_number || activeContact.line_url)) {
          gamingLandingData.contactInfo = {
            phone_number: activeContact.phone_number || '',
            phone_hours: activeContact.phone_hours || '',
            line_url: activeContact.line_url || '',
            line_label: activeContact.line_label || '公式LINEを友達追加',
            line_hours: activeContact.line_hours || '',
          };
        }
      }
    } catch {
      // ランディング追加データ取得失敗時はデフォルト空配列のまま
    }
  }

  return {collection, sortParam, isGamingLanding, gamingLandingData};
}

export function loadDeferredData({context, params}: Route.LoaderArgs) {
  const {storefront} = context;
  const {handle} = params;

  // Deferred promise for recommended collections
  // Fetches 5 collections (to filter out current one) sorted by product count
  const recommendedCollectionsPromise = storefront
    .query<{collections: {nodes: Array<{id: string; handle: string; title: string; image?: {url: string}}>}}>(`#graphql
      query RecommendedCollections {
        collections(first: 5, sortKey: UPDATED_AT) {
          nodes {
            id
            handle
            title
            image { url }
          }
        }
      }
    `)
    .then((data) => {
      // Filter out the current collection and return top 3
      return (data?.collections?.nodes || [])
        .filter((c) => c.handle !== handle)
        .slice(0, 3);
    })
    .catch((error) => {
      process.env.NODE_ENV === 'development' &&
        console.error('[collections.$handle] Recommended collections fetch failed:', error);
      return []; // Return empty array on error, don't break the page
    });

  return {
    recommendedCollections: recommendedCollectionsPromise,
  };
}

// ─── GraphQL Queries ───────────────────────

const PRODUCT_ITEM_FRAGMENT = `#graphql
  fragment ProductItem on Product {
    id
    handle
    title
    tags
    productType
    featuredImage { id altText url width height }
    priceRange { minVariantPrice { amount currencyCode } }
    variants(first: 1) { nodes { availableForSale selectedOptions { name value } } }
  }
` as const;

// グッズコレクション補完用: 商品検索クエリ
export const PRODUCTS_SEARCH_QUERY = `#graphql
  ${PRODUCT_ITEM_FRAGMENT}
  query ProductsSearch(
    $query: String!
    $first: Int!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    products(first: $first, query: $query) {
      nodes { ...ProductItem }
    }
  }
` as const;

export const COLLECTION_QUERY = `#graphql
  ${PRODUCT_ITEM_FRAGMENT}
  query Collection(
    $handle: String!
    $country: CountryCode
    $language: LanguageCode
    $first: Int
    $last: Int
    $startCursor: String
    $endCursor: String
    $sortKey: ProductCollectionSortKeys
    $reverse: Boolean
  ) @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      image { url altText width height }
      products(first: $first, last: $last, before: $startCursor, after: $endCursor, sortKey: $sortKey, reverse: $reverse) {
        nodes { ...ProductItem }
        pageInfo { hasPreviousPage hasNextPage endCursor startCursor }
      }
    }
  }
` as const;

// ─── ゲーミングPC Landing 用クエリ ───
// ランキング: ranking コレクションのベストセラー10件
const GAMING_RANKING_QUERY = `#graphql
  query GamingRanking($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    collection(handle: "ranking") {
      products(first: 10, sortKey: BEST_SELLING) {
        nodes {
          title
          handle
          featuredImage { url }
          priceRange { minVariantPrice { amount currencyCode } }
        }
      }
    }
  }
` as const;

// お知らせ: news ブログの最新3件
const GAMING_NEWS_QUERY = `#graphql
  query GamingNews($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    blog(handle: "news") {
      articles(first: 3, sortKey: PUBLISHED_AT, reverse: true) {
        nodes {
          title
          handle
          publishedAt
        }
      }
    }
  }
` as const;
