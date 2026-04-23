/**
 * KV Storage Adapter — 脳幹の記憶中枢
 *
 * 医学メタファー: 海馬（Hippocampus）
 * 短期記憶（インメモリ Map）から長期記憶（Cloudflare KV）への
 * 記憶固定化プロセスを実現する。海馬が破壊されると新しい記憶を
 * 形成できないように、この層が壊れると全ての状態管理が崩壊する。
 *
 * 設計原則:
 * 1. インターフェースの統一: InMemory / KV を同一APIで操作
 * 2. 段階的移行: env.KV_STORE が未設定ならインメモリにフォールバック
 * 3. TTL自動管理: KV側のexpirationTtlで自動期限切れ
 * 4. 型安全: ジェネリクスで値の型を保証
 * 5. 障害耐性: KV障害時はインメモリにフォールバック（graceful degradation）
 *
 * patch 0129: Hydrogen on Oxygen は KV namespace binding を露出しないため
 * (Shopify admin に binding 追加 UI なし／env.AGENT_KV / env.KV_STORE 共に不在)、
 * Cloudflare Workers Cache API (`caches.open('uxr-store')`) ベースの
 * CacheKV adapter を追加。cross-isolate visibility が確保され、本番で
 * UXR (heatmap / session / funnel / insights) が動くようになる。
 */

/** KVストアの統一インターフェース */
export interface KVStore {
  get<T = string>(key: string): Promise<T | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number }): Promise<{ keys: { name: string }[] }>;
}

/**
 * InMemory KV — 開発環境・KV未設定時のフォールバック
 * Oxygen Worker再起動で消失するが、単一isolate内では一貫性を保つ
 */
class InMemoryKV implements KVStore {
  private store = new Map<string, { value: string; expiresAt?: number }>();
  private maxEntries: number;

  constructor(maxEntries = 10_000) {
    this.maxEntries = maxEntries;
  }

  async get<T = string>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return entry.value as unknown as T;
    }
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    this.enforceLimit();
    const expiresAt = options?.expirationTtl
      ? Date.now() + options.expirationTtl * 1000
      : undefined;
    this.store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: { prefix?: string; limit?: number }): Promise<{ keys: { name: string }[] }> {
    const prefix = options?.prefix ?? '';
    const limit = options?.limit ?? 1000;
    const keys: { name: string }[] = [];
    const now = Date.now();
    for (const [name, entry] of this.store) {
      if (entry.expiresAt && now >= entry.expiresAt) {
        this.store.delete(name);
        continue;
      }
      if (name.startsWith(prefix)) {
        keys.push({ name });
        if (keys.length >= limit) break;
      }
    }
    return { keys };
  }

  private enforceLimit(): void {
    if (this.store.size <= this.maxEntries) return;
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt && now >= entry.expiresAt) {
        this.store.delete(key);
      }
    }
    if (this.store.size > this.maxEntries) {
      const excess = this.store.size - this.maxEntries;
      let deleted = 0;
      for (const key of this.store.keys()) {
        if (deleted >= excess) break;
        this.store.delete(key);
        deleted++;
      }
    }
  }

  /** テスト用: 全データクリア */
  _clear(): void {
    this.store.clear();
  }

  /** 監視用: 現在のエントリ数 */
  get size(): number {
    return this.store.size;
  }
}

/**
 * Cloudflare KV Adapter — 本番用永続ストレージ
 * Worker再起動後もデータが保持される（結果整合性: ~60秒の伝播遅延あり）
 */
class CloudflareKV implements KVStore {
  private kv: KVNamespace;
  private fallback: InMemoryKV;

  constructor(kv: KVNamespace) {
    this.kv = kv;
    this.fallback = new InMemoryKV();
  }

  async get<T = string>(key: string): Promise<T | null> {
    try {
      const value = await this.kv.get(key);
      if (value === null) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    } catch {
      // KV障害 → インメモリフォールバック
      return this.fallback.get<T>(key);
    }
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    try {
      const kvOptions: KVNamespacePutOptions = {};
      if (options?.expirationTtl) {
        kvOptions.expirationTtl = options.expirationTtl;
      }
      await this.kv.put(key, value, kvOptions);
    } catch {
      // KV障害 → インメモリフォールバック
      await this.fallback.put(key, value, options);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.kv.delete(key);
    } catch {
      await this.fallback.delete(key);
    }
  }

  async list(options?: { prefix?: string; limit?: number }): Promise<{ keys: { name: string }[] }> {
    try {
      const result = await this.kv.list({
        prefix: options?.prefix,
        limit: options?.limit,
      });
      return { keys: result.keys.map((k) => ({ name: k.name })) };
    } catch {
      return this.fallback.list(options);
    }
  }
}

// ═══ patch 0129: Cloudflare Workers Cache API ベースの永続ストレージ ═══

/**
 * CacheKV — Cloudflare Workers Cache API を KV 互換 interface でラップ
 *
 * Hydrogen on Oxygen は KV binding を露出しないため (UI に binding 追加項目なし)、
 * 本番で唯一利用できる cross-isolate persistent store は Cache API (caches.open / caches.default)。
 *
 * 設計:
 * - URL key:   https://uxr-cache.invalid/v1/{encodeURIComponent(key)}
 *              .invalid TLD は RFC 2606 で予約 (DNS lookup されない・安全)
 * - Index URL: https://uxr-cache.invalid/__index__/master
 *              JSON `{keys: string[], updated: number}`
 *              list() 操作のために自前管理。FIFO で maxIndexSize 件まで保持
 * - TTL:       `Cache-Control: max-age=N` ヘッダで自動失効
 * - 並行制御: 同一 isolate 内では Promise chain で R/M/W を直列化
 *              (cross-isolate 間の race は分析用途として許容＝多少のロスはあり)
 *
 * Cache API は per-colo storage なので：
 * - 同 colo の別 isolate からは見える (cross-isolate visibility ✓)
 * - 別 colo へは伝播しない (eventual consistency より厳しい — 真の global 永続には KV/D1 が必要)
 *
 * UXR 用途では「同一ユーザの batch flush と admin 集計」が主で、
 * 短時間内なら同 colo に留まりやすく実用上問題ない。
 */
class CacheKV implements KVStore {
  private fallback: InMemoryKV;
  private cachePromise: Promise<Cache> | null = null;
  private cacheNamespace: string;
  private indexUrl: string;
  private keyBaseUrl: string;
  private maxIndexSize: number;
  /** intra-isolate index update を直列化する Promise chain */
  private indexLock: Promise<void>;

  constructor(opts?: { namespace?: string; maxIndexSize?: number }) {
    this.fallback = new InMemoryKV();
    this.cacheNamespace = opts?.namespace ?? 'uxr-store';
    const host = `${this.cacheNamespace}-cache.invalid`;
    this.indexUrl = `https://${host}/__index__/master`;
    this.keyBaseUrl = `https://${host}/v1/`;
    this.maxIndexSize = opts?.maxIndexSize ?? 5000;
    this.indexLock = Promise.resolve();
  }

  /** namespace cache を遅延 open (Worker isolate 起動コスト最小化) */
  private getCache(): Promise<Cache> {
    if (!this.cachePromise) {
      // global caches は Workers runtime が提供
      const cs = (globalThis as unknown as { caches?: CacheStorage }).caches;
      if (!cs || typeof cs.open !== 'function') {
        // 万が一 caches が無ければ never-resolve を避けて即 reject
        return Promise.reject(new Error('caches global not available'));
      }
      this.cachePromise = cs.open(this.cacheNamespace);
    }
    return this.cachePromise;
  }

  private toUrl(key: string): string {
    return this.keyBaseUrl + encodeURIComponent(key);
  }

  async get<T = string>(key: string): Promise<T | null> {
    try {
      const cache = await this.getCache();
      const res = await cache.match(this.toUrl(key));
      if (!res) return null;
      const text = await res.text();
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    } catch {
      return this.fallback.get<T>(key);
    }
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    try {
      const cache = await this.getCache();
      // Cache-Control: max-age で TTL 制御 (Cache API は自動的に失効を扱う)
      // 30 日デフォルト (UXR_BATCH_TTL_S と同等)
      const ttl = options?.expirationTtl ?? 60 * 60 * 24 * 30;
      const headers = new Headers({
        'content-type': 'application/json; charset=utf-8',
        'cache-control': `max-age=${ttl}`,
      });
      const response = new Response(value, { status: 200, headers });
      await cache.put(this.toUrl(key), response);
      // Index 更新は best-effort・失敗しても put 自体は成功扱い
      await this.appendToIndex(key);
    } catch {
      await this.fallback.put(key, value, options);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const cache = await this.getCache();
      await cache.delete(this.toUrl(key));
      await this.removeFromIndex(key);
    } catch {
      await this.fallback.delete(key);
    }
  }

  async list(options?: { prefix?: string; limit?: number }): Promise<{ keys: { name: string }[] }> {
    try {
      const index = await this.readIndex();
      const prefix = options?.prefix ?? '';
      const limit = options?.limit ?? 1000;
      const keys: { name: string }[] = [];
      // 新しい順に返す (index 末尾が最新)
      for (let i = index.length - 1; i >= 0 && keys.length < limit; i--) {
        const name = index[i];
        if (!prefix || name.startsWith(prefix)) {
          keys.push({ name });
        }
      }
      return { keys };
    } catch {
      return this.fallback.list(options);
    }
  }

  /** 内部: 現在の index (key 名一覧) を読み出す */
  private async readIndex(): Promise<string[]> {
    try {
      const cache = await this.getCache();
      const res = await cache.match(this.indexUrl);
      if (!res) return [];
      const data = (await res.json()) as { keys?: unknown };
      return Array.isArray(data?.keys) ? (data.keys as string[]).filter((s) => typeof s === 'string') : [];
    } catch {
      return [];
    }
  }

  /** 内部: index を上書き保存 (FIFO trim 込) */
  private async writeIndex(keys: string[]): Promise<void> {
    try {
      const cache = await this.getCache();
      const trimmed = keys.length > this.maxIndexSize ? keys.slice(keys.length - this.maxIndexSize) : keys;
      const headers = new Headers({
        'content-type': 'application/json; charset=utf-8',
        // index は batch 自体より長く保持 (60日)
        'cache-control': `max-age=${60 * 60 * 24 * 60}`,
      });
      const response = new Response(JSON.stringify({ keys: trimmed, updated: Date.now() }), {
        status: 200,
        headers,
      });
      await cache.put(this.indexUrl, response);
    } catch {
      // 失敗は飲み込む — index 失敗は put 全体を失敗にしない
    }
  }

  /** 内部: index に key を追加 (intra-isolate で R/M/W 直列化) */
  private appendToIndex(key: string): Promise<void> {
    const next = this.indexLock.then(async () => {
      const current = await this.readIndex();
      // 重複排除: 既に index 末尾にあれば何もしない (空配列の -1 === -1 一致は無視)
      const existsIdx = current.indexOf(key);
      if (existsIdx >= 0 && existsIdx === current.length - 1) return;
      const filtered = existsIdx >= 0 ? current.filter((k) => k !== key) : current.slice();
      filtered.push(key);
      await this.writeIndex(filtered);
    });
    // chain 維持・エラーは飲み込む
    this.indexLock = next.catch(() => {});
    return this.indexLock;
  }

  /** 内部: index から key を削除 */
  private removeFromIndex(key: string): Promise<void> {
    const next = this.indexLock.then(async () => {
      const current = await this.readIndex();
      const filtered = current.filter((k) => k !== key);
      if (filtered.length !== current.length) {
        await this.writeIndex(filtered);
      }
    });
    this.indexLock = next.catch(() => {});
    return this.indexLock;
  }
}

// ═══ シングルトン管理 ═══

let kvInstance: KVStore | null = null;

/**
 * caches global の有無で CacheKV 利用可否を判定
 * patch 0129: Workers/Oxygen runtime では true・Node test 環境では false
 */
function isCacheApiAvailable(): boolean {
  const cs = (globalThis as unknown as { caches?: CacheStorage }).caches;
  return !!(cs && typeof cs.open === 'function');
}

/**
 * KVストアを初期化（Worker起動時に1回呼ぶ）
 *
 * @param env - Oxygen環境変数（KV_STORE または AGENT_KV バインディングを含む）
 * @returns 初期化されたKVストア
 *
 * 医学メタファー: 出生時の海馬形成
 * KVバインディングがあれば長期記憶（永続化）、なければ短期記憶（インメモリ）で動作
 *
 * 優先順位 (patch 0129):
 *   1. KV binding (KV_STORE / AGENT_KV) → CloudflareKV — 真の永続・global 一貫
 *   2. caches API 利用可能 → CacheKV — per-colo 永続・cross-isolate 可視
 *   3. それ以外 → InMemoryKV — per-isolate のみ・テスト/dev フォールバック
 *
 * 昇格: InMemoryKV → CacheKV → CloudflareKV のみ。降格はしない。
 *
 * patch 0127: production binding 名は AGENT_KV であり KV_STORE は存在しない可能性。
 * patch 0128: 実は env に KV binding が一切無いことを selftest で証明。
 * patch 0129: 解決策として CacheKV を導入し isolate-lock を Cache API 経由で解消。
 */
export function initKVStore(env: Record<string, unknown>): KVStore {
  // KV_STORE 優先・無ければ AGENT_KV (Oxygen 本番 binding)
  const kvBinding =
    (env.KV_STORE as KVNamespace | undefined) ||
    (env.AGENT_KV as KVNamespace | undefined);
  const hasRealBinding = !!(kvBinding && typeof kvBinding.get === 'function');

  // CloudflareKV は最強 — 既に CloudflareKV ならそのまま (downgrade 防止)
  if (kvInstance instanceof CloudflareKV) return kvInstance;

  // CloudflareKV へ昇格できる条件: real binding が今回現れた
  if (hasRealBinding) {
    kvInstance = new CloudflareKV(kvBinding!);
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.info('[KV] Cloudflare KV initialized (persistent storage)');
    }
    return kvInstance;
  }

  // CacheKV は CloudflareKV より弱いが InMemoryKV より強い
  if (kvInstance instanceof CacheKV) return kvInstance;

  // CacheKV へ昇格できる条件: caches API が利用可能 (Workers/Oxygen runtime)
  if (isCacheApiAvailable()) {
    kvInstance = new CacheKV();
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.info('[KV] Cache API KV initialized (cross-isolate, per-colo persistent)');
    }
    return kvInstance;
  }

  // 既存 instance を維持 (real binding/caches 不在で再呼び出された場合)
  if (kvInstance) return kvInstance;

  // 最終フォールバック: InMemoryKV (test/dev)
  kvInstance = new InMemoryKV();
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.info('[KV] InMemory fallback initialized (non-persistent, per-isolate)');
  }
  return kvInstance;
}

/**
 * 現在のKVストアを取得（initKVStore後に使用）
 * 未初期化ならInMemoryKVを自動生成（テスト互換性）
 */
export function getKVStore(): KVStore {
  if (!kvInstance) {
    kvInstance = new InMemoryKV();
  }
  return kvInstance;
}

/** テスト用: KVインスタンスをリセット */
export function _resetKVStore(): void {
  kvInstance = null;
}

/** テスト用: InMemoryKVを直接生成 */
export function _createInMemoryKV(maxEntries?: number): InMemoryKV {
  return new InMemoryKV(maxEntries);
}

/** テスト用: CacheKV を直接生成 (注: Cache API が無い環境では fallback に落ちる) */
export function _createCacheKV(opts?: { namespace?: string; maxIndexSize?: number }): CacheKV {
  return new CacheKV(opts);
}

/**
 * 診断用: 現在の kvInstance の実装種別を返す
 * patch 0128 selftest: production binding 認識状態の可視化
 * patch 0129: 'CacheKV' を追加
 */
export function _peekKVStoreType(): 'CloudflareKV' | 'CacheKV' | 'InMemoryKV' | 'none' {
  if (!kvInstance) return 'none';
  if (kvInstance instanceof CloudflareKV) return 'CloudflareKV';
  if (kvInstance instanceof CacheKV) return 'CacheKV';
  if (kvInstance instanceof InMemoryKV) return 'InMemoryKV';
  return 'none';
}

/**
 * 診断用: env から binding 認識状況を返す（initKVStore は呼ばない）
 * patch 0129: caches API 利用可否も返す
 */
export function _diagnoseEnv(env: Record<string, unknown>): {
  hasKV_STORE: boolean;
  hasAGENT_KV: boolean;
  hasCacheApi: boolean;
  envKeys: string[];
} {
  const kvStore = env.KV_STORE as KVNamespace | undefined;
  const agentKv = env.AGENT_KV as KVNamespace | undefined;
  return {
    hasKV_STORE: !!(kvStore && typeof kvStore.get === 'function'),
    hasAGENT_KV: !!(agentKv && typeof agentKv.get === 'function'),
    hasCacheApi: isCacheApiAvailable(),
    envKeys: Object.keys(env).slice(0, 50),
  };
}
