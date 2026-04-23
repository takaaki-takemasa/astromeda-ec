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

// ═══ シングルトン管理 ═══

let kvInstance: KVStore | null = null;

/**
 * KVストアを初期化（Worker起動時に1回呼ぶ）
 *
 * @param env - Oxygen環境変数（KV_STORE または AGENT_KV バインディングを含む）
 * @returns 初期化されたKVストア
 *
 * 医学メタファー: 出生時の海馬形成
 * KVバインディングがあれば長期記憶（永続化）、なければ短期記憶（インメモリ）で動作
 *
 * patch 0127: production の binding 名は AGENT_KV であり KV_STORE は存在しない。
 * env.KV_STORE のみ参照していたため全 isolate が InMemoryKV に lock され、
 * isolate を跨いだ KV read/write が不可能になっていた。
 * AGENT_KV も探索する＋ InMemory → Cloudflare へのアップグレードを許可する。
 */
export function initKVStore(env: Record<string, unknown>): KVStore {
  // KV_STORE 優先・無ければ AGENT_KV (Oxygen 本番 binding)
  const kvBinding =
    (env.KV_STORE as KVNamespace | undefined) ||
    (env.AGENT_KV as KVNamespace | undefined);
  const hasRealBinding = !!(kvBinding && typeof kvBinding.get === 'function');

  // 既に CloudflareKV ならそのまま返す（再初期化不要）
  if (kvInstance instanceof CloudflareKV) return kvInstance;

  // 既に InMemoryKV だが今回 real binding が来た → Cloudflare に昇格（isolate lock 解消）
  if (kvInstance instanceof InMemoryKV && hasRealBinding) {
    kvInstance = new CloudflareKV(kvBinding!);
    return kvInstance;
  }

  // 既存 instance を維持（real binding 不在で再呼び出された場合）
  if (kvInstance) return kvInstance;

  // 初回初期化
  if (hasRealBinding) {
    kvInstance = new CloudflareKV(kvBinding!);
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.info('[KV] Cloudflare KV initialized (persistent storage)');
    }
  } else {
    kvInstance = new InMemoryKV();
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.info('[KV] InMemory fallback initialized (non-persistent)');
    }
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
