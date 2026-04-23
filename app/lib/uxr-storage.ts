/**
 * UXR Storage — お客様の動きを記録する箱
 *
 * patch 0123 Phase A: クリックヒートマップ MVP のストレージ層。
 *
 * 設計:
 * - イベントは「バッチ」単位で1キー1書き込み（KV write rate limit 1/s/key 対策）
 * - キー: `ux:b:{urlhash}:{ts}:{rand}` → JSON `{sid, ua, events:[...]}`
 * - TTL: 30日（自動失効）
 * - ヒートマップ集計時は `kv.list({prefix:'ux:b:{urlhash}:'})` → 並列 `kv.get` でバッチを束ねる
 * - ページ一覧は同 prefix scan を memoize して 60s キャッシュ
 *
 * ストレージ選択:
 * - Oxygen 本番: env.AGENT_KV（永続）
 * - 開発/AGENT_KV未設定: モジュールスコープ Map（揮発・isolate内のみ）
 */

import { initKVStore, getKVStore, type KVStore } from './kv-storage';

/** UX イベントの基本形（client tracker と一致させる） */
export interface UxrEvent {
  /**
   * event type
   * - pv: page view
   * - click: マウスクリック
   * - scroll: scroll depth
   * - rage: 短時間に同じ場所を連打
   * - nav: SPA route change（patch 0124 Phase B）
   * - input: 入力フォームに focus → blur した（patch 0124 Phase B・値は記録しない）
   */
  t: 'pv' | 'click' | 'scroll' | 'rage' | 'nav' | 'input';
  /** timestamp (ms since epoch) */
  ts: number;
  /** click x (viewport-relative, 0-1) */
  x?: number;
  /** click y (viewport-relative, 0-1) */
  y?: number;
  /** viewport width */
  vw?: number;
  /** viewport height */
  vh?: number;
  /** css-like selector path (~50 chars) */
  sel?: string;
  /** truncated text content (~30 chars) */
  txt?: string;
  /** scroll depth max (0-100, %) */
  d?: number;
  /** for pv: referrer host */
  r?: string;
  /** for pv: utm_source */
  u?: string;
  /** rage: count of rapid clicks in 50px area */
  c?: number;
  /** input: focus→blur 滞在秒数（最大 600 = 10分） */
  dur?: number;
  /** nav: 遷移先 path（先頭スラッシュ込・最大 200 char） */
  to?: string;
}

/** バッチの保存形式 */
export interface UxrBatch {
  /** session id */
  sid: string;
  /** url path (no query) */
  path: string;
  /** user-agent first 80 chars (for device coarse split) */
  ua: string;
  /** batch flush timestamp */
  ts: number;
  /** events */
  events: UxrEvent[];
}

/** TTL: 30日 */
export const UXR_BATCH_TTL_S = 60 * 60 * 24 * 30;

/** キー prefix */
export const UXR_KEY_PREFIX = 'ux:b:';

/**
 * URL path を 6文字の英数字ハッシュに圧縮（djb2 → base36）
 *
 * 同じパスは必ず同じハッシュになる（決定論的）。
 * 衝突は確率的に存在するが、実害は「他ページのデータが少し混ざる」程度で許容。
 */
export function hashPath(path: string): string {
  let h = 5381;
  for (let i = 0; i < path.length; i++) {
    h = ((h << 5) + h + path.charCodeAt(i)) | 0;
  }
  // 6 文字 base36（≒ 22bit）に圧縮
  return Math.abs(h).toString(36).padStart(6, '0').slice(0, 6);
}

/**
 * KV ストア取得（env を渡せば AGENT_KV を使う／無ければ InMemory）
 */
function resolveKv(env?: Record<string, unknown> | null): KVStore {
  if (env && typeof env === 'object') {
    // AGENT_KV を KV_STORE 互換でラップして initKVStore に渡す
    const agentKv = (env as { AGENT_KV?: unknown }).AGENT_KV;
    const kvStore = (env as { KV_STORE?: unknown }).KV_STORE;
    const wrapped = {
      ...env,
      KV_STORE: kvStore || agentKv,
    };
    return initKVStore(wrapped);
  }
  return getKVStore();
}

/**
 * バッチを保存
 *
 * 1リクエスト = 1書き込み = 1バッチ。
 * KV の書き込み回数を最小化するため、client は 5秒ごとに flush し、ここに来る。
 */
export async function writeBatch(
  env: Record<string, unknown> | null | undefined,
  batch: UxrBatch,
): Promise<{ key: string; size: number }> {
  const kv = resolveKv(env);
  const urlhash = hashPath(batch.path);
  // ts + 8 文字ランダムで衝突回避（同 ms に同 isolate から複数 flush は基本来ない）
  const rand = Math.random().toString(36).slice(2, 10);
  const key = `${UXR_KEY_PREFIX}${urlhash}:${batch.ts}:${rand}`;
  const value = JSON.stringify(batch);
  await kv.put(key, value, { expirationTtl: UXR_BATCH_TTL_S });
  return { key, size: value.length };
}

/**
 * 1ページのバッチを集約（ヒートマップ用）
 *
 * @param maxBatches 取得する最新バッチ数の上限（デフォルト 200）
 * @param sinceMs バッチ ts がこれ以降のもののみ（省略可）
 */
export async function readBatchesForPath(
  env: Record<string, unknown> | null | undefined,
  path: string,
  options?: { maxBatches?: number; sinceMs?: number },
): Promise<UxrBatch[]> {
  const kv = resolveKv(env);
  const urlhash = hashPath(path);
  const prefix = `${UXR_KEY_PREFIX}${urlhash}:`;
  const maxBatches = options?.maxBatches ?? 200;
  const sinceMs = options?.sinceMs ?? 0;

  const list = await kv.list({ prefix, limit: 1000 });

  // ts でフィルタしてから新しい順に切る
  const filtered = list.keys
    .map((k) => {
      // key 形式: ux:b:{hash}:{ts}:{rand}
      const parts = k.name.split(':');
      const ts = Number(parts[3] || 0);
      return { name: k.name, ts };
    })
    .filter((x) => x.ts >= sinceMs)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, maxBatches);

  // 並列取得（KV はリクエスト並列化が安全）
  const batches = await Promise.all(
    filtered.map(async (x) => {
      try {
        const v = await kv.get<UxrBatch>(x.name);
        if (!v) return null;
        // 互換: path が違うバッチ（hash 衝突）は除外
        if (v.path && v.path !== path) return null;
        return v;
      } catch {
        return null;
      }
    }),
  );

  return batches.filter((b): b is UxrBatch => b !== null);
}

/**
 * これまでに記録されたページ一覧（admin selectbox 用）
 *
 * 全 prefix scan は重いので 60秒メモ化。
 */
let cachedPages: { ts: number; pages: Array<{ path: string; sample: number }> } | null = null;
const PAGES_CACHE_MS = 60_000;

export async function listKnownPaths(
  env: Record<string, unknown> | null | undefined,
): Promise<Array<{ path: string; sample: number }>> {
  const now = Date.now();
  if (cachedPages && now - cachedPages.ts < PAGES_CACHE_MS) {
    return cachedPages.pages;
  }

  const kv = resolveKv(env);
  const list = await kv.list({ prefix: UXR_KEY_PREFIX, limit: 1000 });

  // hash → 最新バッチをサンプリング（最大 50 hash）
  const byHash: Record<string, { latest: string; count: number }> = {};
  for (const k of list.keys) {
    const parts = k.name.split(':');
    const hash = parts[2] || '';
    if (!hash) continue;
    const slot = byHash[hash] || { latest: '', count: 0 };
    slot.count += 1;
    if (k.name > slot.latest) slot.latest = k.name;
    byHash[hash] = slot;
  }

  const hashList = Object.entries(byHash).slice(0, 50);
  const samples = await Promise.all(
    hashList.map(async ([, info]) => {
      try {
        const v = await kv.get<UxrBatch>(info.latest);
        return v ? { path: v.path, sample: info.count } : null;
      } catch {
        return null;
      }
    }),
  );

  // path 重複は count 合算（hash 衝突対策）
  const merged: Record<string, number> = {};
  for (const s of samples) {
    if (!s || !s.path) continue;
    merged[s.path] = (merged[s.path] || 0) + s.sample;
  }
  const pages = Object.entries(merged)
    .map(([path, sample]) => ({ path, sample }))
    .sort((a, b) => b.sample - a.sample);

  cachedPages = { ts: now, pages };
  return pages;
}

/** テスト用: ページ一覧キャッシュをリセット */
export function _resetPagesCache(): void {
  cachedPages = null;
}

// ─────────────────────────────────────────────────────────────────────
// patch 0124 Phase B: セッション再生（誰がいつ何をクリックしたか）
// ─────────────────────────────────────────────────────────────────────

/**
 * セッション概要（admin 一覧テーブル用）
 */
export interface SessionSummary {
  /** session id */
  sid: string;
  /** このセッションが訪れたユニーク path 一覧 */
  paths: string[];
  /** 最初に観測した timestamp */
  firstSeen: number;
  /** 最後に観測した timestamp */
  lastSeen: number;
  /** 総 event 数 */
  eventCount: number;
  /** click 数 */
  clickCount: number;
  /** rage click 数 */
  rageCount: number;
  /** pageview 数 */
  pageviews: number;
  /** user-agent 先頭 80 char (device 推定用) */
  ua: string;
}

let cachedSessions: { ts: number; sessions: SessionSummary[] } | null = null;
const SESSIONS_CACHE_MS = 30_000;

/**
 * 最近のセッション一覧（KV 全 prefix scan → sid 別に集約）
 *
 * KV scan 上限 1000 + 直近 500 バッチに絞り込み。
 * 30秒キャッシュ。
 */
export async function listRecentSessions(
  env: Record<string, unknown> | null | undefined,
  options?: { limit?: number; sinceMs?: number },
): Promise<SessionSummary[]> {
  const now = Date.now();
  if (cachedSessions && now - cachedSessions.ts < SESSIONS_CACHE_MS) {
    return cachedSessions.sessions.slice(0, options?.limit ?? 50);
  }

  const kv = resolveKv(env);
  const list = await kv.list({ prefix: UXR_KEY_PREFIX, limit: 1000 });
  const sinceMs = options?.sinceMs ?? 0;

  const filtered = list.keys
    .map((k) => {
      const parts = k.name.split(':');
      const ts = Number(parts[3] || 0);
      return { name: k.name, ts };
    })
    .filter((x) => x.ts >= sinceMs)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 500);

  const batches = await Promise.all(
    filtered.map(async (x) => {
      try {
        return await kv.get<UxrBatch>(x.name);
      } catch {
        return null;
      }
    }),
  );

  const bySid: Record<string, SessionSummary> = {};
  for (const b of batches) {
    if (!b || !b.sid) continue;
    let s = bySid[b.sid];
    if (!s) {
      s = {
        sid: b.sid,
        paths: [],
        firstSeen: b.ts,
        lastSeen: b.ts,
        eventCount: 0,
        clickCount: 0,
        rageCount: 0,
        pageviews: 0,
        ua: b.ua || '',
      };
      bySid[b.sid] = s;
    }
    if (b.path && !s.paths.includes(b.path)) s.paths.push(b.path);
    if (b.ts < s.firstSeen) s.firstSeen = b.ts;
    if (b.ts > s.lastSeen) s.lastSeen = b.ts;
    s.eventCount += b.events.length;
    for (const e of b.events) {
      if (e.t === 'click') s.clickCount++;
      else if (e.t === 'rage') s.rageCount++;
      else if (e.t === 'pv') s.pageviews++;
    }
  }

  const sessions = Object.values(bySid).sort((a, b) => b.lastSeen - a.lastSeen);
  cachedSessions = { ts: now, sessions };
  return sessions.slice(0, options?.limit ?? 50);
}

/**
 * 1セッション分の全イベント timeline（admin 再生 UI 用）
 */
export async function readEventsForSession(
  env: Record<string, unknown> | null | undefined,
  sid: string,
  options?: { maxBatches?: number },
): Promise<{
  batches: UxrBatch[];
  events: Array<{ event: UxrEvent; path: string }>;
}> {
  const kv = resolveKv(env);
  const list = await kv.list({ prefix: UXR_KEY_PREFIX, limit: 1000 });
  const maxBatches = options?.maxBatches ?? 200;

  const sorted = list.keys
    .map((k) => {
      const parts = k.name.split(':');
      const ts = Number(parts[3] || 0);
      return { name: k.name, ts };
    })
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 500);

  const all = await Promise.all(
    sorted.map(async (x) => {
      try {
        return await kv.get<UxrBatch>(x.name);
      } catch {
        return null;
      }
    }),
  );

  const matching = all
    .filter((b): b is UxrBatch => !!b && b.sid === sid)
    .slice(0, maxBatches);

  const events: Array<{ event: UxrEvent; path: string }> = [];
  matching.forEach((b) => {
    for (const e of b.events) {
      events.push({ event: e, path: b.path });
    }
  });
  events.sort((a, b) => a.event.ts - b.event.ts);
  return { batches: matching, events };
}

/** テスト用: セッション一覧キャッシュをリセット */
export function _resetSessionsCache(): void {
  cachedSessions = null;
}

// ─────────────────────────────────────────────────────────────────────
// patch 0125 Phase C: ファネル可視化（来訪 → 商品 → カート → 購入手続き）
// ─────────────────────────────────────────────────────────────────────

/**
 * ファネルの各段階。お客様がどこで離脱しているかを把握するための 4 段階。
 * - landing: トップ or 任意ページに到達
 * - product: 商品詳細ページを見た
 * - cart: カート追加 click または /cart 系 path 訪問
 * - checkout: 購入手続き開始（/checkout 系 path or 「購入」「ご注文」ボタン click）
 */
export type FunnelStage = 'landing' | 'product' | 'cart' | 'checkout';

export const FUNNEL_STAGES: FunnelStage[] = ['landing', 'product', 'cart', 'checkout'];

export interface FunnelStageStat {
  stage: FunnelStage;
  /** ラベル（admin に表示する日本語） */
  label: string;
  /** この段階に到達したセッション数 */
  sessions: number;
  /** 前段階からの到達率 (%) */
  conversionFromPrev: number;
  /** 1段目（landing）からの到達率 (%) */
  conversionFromTop: number;
  /** 前段階からの離脱数 */
  dropoffCount: number;
  /** 前段階からの離脱率 (%) */
  dropoffRate: number;
}

export interface FunnelResult {
  /** 集計対象期間（日数） */
  days: number;
  /** 集計したセッション総数（= landing と同じ。少なくとも何かを送ってきたセッション） */
  totalSessions: number;
  /** 各段階の集計 */
  stages: FunnelStageStat[];
  /** よく訪れる商品 path の Top5（cart 段階に到達できなかったセッションでも商品を見ているケースの diagnostic） */
  topProductPaths: Array<{ path: string; sessions: number }>;
  /** よく追加されるカート path Top5 */
  topCartPaths: Array<{ path: string; sessions: number }>;
}

/**
 * 1 セッションがどの段階まで進んだかを判定する。
 *
 * 判定ルール:
 * - landing: 何かしらバッチがあれば true
 * - product: いずれかのバッチで path が `/products/` を含む or nav.to が `/products/` を含む
 * - cart: いずれかのイベントで sel に `cart`/`add-to-cart`/`buy`/`購入`/`カート` を含む click、
 *         または path/nav.to が `/cart` を含む
 * - checkout: path/nav.to が `/checkout` または `/checkouts/` を含む、
 *             または sel/txt が `購入` `ご注文` `お支払い` を含む click
 */
function classifySessionStage(batches: UxrBatch[]): {
  reachedProduct: boolean;
  reachedCart: boolean;
  reachedCheckout: boolean;
  productPaths: Set<string>;
  cartPaths: Set<string>;
} {
  let reachedProduct = false;
  let reachedCart = false;
  let reachedCheckout = false;
  const productPaths = new Set<string>();
  const cartPaths = new Set<string>();

  const isProductPath = (p: string) => p.includes('/products/');
  const isCartPath = (p: string) => p === '/cart' || p.startsWith('/cart');
  const isCheckoutPath = (p: string) =>
    p.startsWith('/checkout') || p.startsWith('/checkouts');

  const cartKeywords = ['cart', 'add-to-cart', 'add_to_cart', 'addtocart', 'カート', 'カートに入れる', '追加'];
  const buyKeywords = ['buy', '購入', 'ご注文', 'お支払い', 'checkout', 'レジへ'];

  for (const b of batches) {
    if (isProductPath(b.path)) {
      reachedProduct = true;
      productPaths.add(b.path);
    }
    if (isCartPath(b.path)) {
      reachedCart = true;
      cartPaths.add(b.path);
    }
    if (isCheckoutPath(b.path)) {
      reachedCheckout = true;
    }
    for (const e of b.events) {
      if (e.t === 'nav' && e.to) {
        if (isProductPath(e.to)) {
          reachedProduct = true;
          productPaths.add(e.to);
        }
        if (isCartPath(e.to)) {
          reachedCart = true;
          cartPaths.add(e.to);
        }
        if (isCheckoutPath(e.to)) reachedCheckout = true;
      }
      if (e.t === 'click') {
        const sel = (e.sel || '').toLowerCase();
        const txt = (e.txt || '').toLowerCase();
        const hay = sel + '|' + txt;
        if (cartKeywords.some((k) => hay.includes(k.toLowerCase()))) {
          reachedCart = true;
          cartPaths.add(b.path);
        }
        if (buyKeywords.some((k) => hay.includes(k.toLowerCase()))) {
          reachedCheckout = true;
        }
      }
    }
  }

  return { reachedProduct, reachedCart, reachedCheckout, productPaths, cartPaths };
}

let cachedFunnel: { ts: number; key: string; result: FunnelResult } | null = null;
const FUNNEL_CACHE_MS = 30_000;

/**
 * ファネル集計（直近 N 日）。
 *
 * 30秒キャッシュ（admin の頻繁リロードに耐える）。
 */
export async function computeFunnel(
  env: Record<string, unknown> | null | undefined,
  options?: { days?: number },
): Promise<FunnelResult> {
  const days = options?.days ?? 7;
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const cacheKey = `d=${days}`;

  const now = Date.now();
  if (cachedFunnel && cachedFunnel.key === cacheKey && now - cachedFunnel.ts < FUNNEL_CACHE_MS) {
    return cachedFunnel.result;
  }

  const kv = resolveKv(env);
  const list = await kv.list({ prefix: UXR_KEY_PREFIX, limit: 1000 });

  const filtered = list.keys
    .map((k) => {
      const parts = k.name.split(':');
      const ts = Number(parts[3] || 0);
      return { name: k.name, ts };
    })
    .filter((x) => x.ts >= sinceMs)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 1000);

  const batches = await Promise.all(
    filtered.map(async (x) => {
      try {
        return await kv.get<UxrBatch>(x.name);
      } catch {
        return null;
      }
    }),
  );

  // sid 別に集約
  const bySid: Record<string, UxrBatch[]> = {};
  for (const b of batches) {
    if (!b || !b.sid) continue;
    (bySid[b.sid] ||= []).push(b);
  }

  let landing = 0;
  let product = 0;
  let cart = 0;
  let checkout = 0;
  const productPathCount: Record<string, number> = {};
  const cartPathCount: Record<string, number> = {};

  for (const sid of Object.keys(bySid)) {
    landing++;
    const cls = classifySessionStage(bySid[sid]);
    if (cls.reachedProduct) {
      product++;
      for (const p of cls.productPaths) productPathCount[p] = (productPathCount[p] || 0) + 1;
    }
    if (cls.reachedCart) {
      cart++;
      for (const p of cls.cartPaths) cartPathCount[p] = (cartPathCount[p] || 0) + 1;
    }
    if (cls.reachedCheckout) checkout++;
  }

  const counts: Record<FunnelStage, number> = { landing, product, cart, checkout };
  const labels: Record<FunnelStage, string> = {
    landing: '👀 サイトに来た',
    product: '🛍 商品ページを見た',
    cart: '🛒 カートに入れた',
    checkout: '💳 購入手続きに進んだ',
  };

  const stages: FunnelStageStat[] = FUNNEL_STAGES.map((stage, idx) => {
    const sessions = counts[stage];
    const prev = idx === 0 ? landing : counts[FUNNEL_STAGES[idx - 1]];
    const conversionFromPrev = prev > 0 ? Math.round((sessions / prev) * 1000) / 10 : 0;
    const conversionFromTop = landing > 0 ? Math.round((sessions / landing) * 1000) / 10 : 0;
    const dropoffCount = Math.max(0, prev - sessions);
    const dropoffRate = prev > 0 ? Math.round((dropoffCount / prev) * 1000) / 10 : 0;
    return {
      stage,
      label: labels[stage],
      sessions,
      conversionFromPrev,
      conversionFromTop,
      dropoffCount,
      dropoffRate,
    };
  });

  const topProductPaths = Object.entries(productPathCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path, sessions]) => ({ path, sessions }));

  const topCartPaths = Object.entries(cartPathCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path, sessions]) => ({ path, sessions }));

  const result: FunnelResult = {
    days,
    totalSessions: landing,
    stages,
    topProductPaths,
    topCartPaths,
  };
  cachedFunnel = { ts: now, key: cacheKey, result };
  return result;
}

/** テスト用: ファネルキャッシュをリセット */
export function _resetFunnelCache(): void {
  cachedFunnel = null;
}
