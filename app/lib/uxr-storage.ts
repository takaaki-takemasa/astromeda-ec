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
