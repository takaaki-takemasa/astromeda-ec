/**
 * StorageAdapter — データ永続化抽象層（骨格系）
 *
 * 医学的メタファー: 骨格系は体を支え、臓器を守る。
 * StorageAdapterはシステム全体のデータを支え、揮発を防ぐ。
 *
 * 設計原則:
 * 1. インターフェース駆動 — InMemory → KV → D1 に差し替え可能
 * 2. テーブル指向 — 将来のSQL移行を考慮
 * 3. TTL対応 — 自動期限切れでメモリ保護
 * 4. 型安全 — ジェネリクスで型を保証
 *
 * 現在の実装: InMemoryStorage（Phase 3 初期）
 * 将来: CloudflareKVStorage / D1Storage に差し替え
 */

import type { KVNamespace } from './kv-storage.js';
import { z } from 'zod';
import { createLogger } from '../core/logger.js';

const log = createLogger('storage');


// ── Zodスキーマ（T014: ストレージ検証） ──

/** StorageRecordのZodスキーマ — id, createdAt, updatedAt必須 */
export const StorageRecordSchema = z.object({
  id: z.string().min(1),
  createdAt: z.number().positive(),
  updatedAt: z.number().positive(),
}).passthrough(); // [key: string]: unknown を許可

/** StorageQuery filterのZodスキーマ — プリミティブ値のみ許可 */
export const StorageQueryFilterSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);


// ── 型定義 ──

/** ストレージに保存するレコードの基本形 */
export interface StorageRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  [key: string]: unknown;
}

/** クエリフィルタ */
export interface StorageQuery {
  /** フィールド名 → 値 の完全一致フィルタ */
  where?: Record<string, unknown>;
  /** ソートキー（デフォルト: createdAt） */
  orderBy?: string;
  /** 降順（デフォルト: true — 新しい順） */
  desc?: boolean;
  /** 取得件数上限 */
  limit?: number;
  /** スキップ件数 */
  offset?: number;
  /** 開始タイムスタンプ（createdAt >= since） */
  since?: number;
  /** 終了タイムスタンプ（createdAt <= until） */
  until?: number;
}

/** ストレージの統計情報 */
export interface StorageStats {
  tables: Record<string, {count: number; sizeEstimate: number}>;
  totalRecords: number;
  memoryUsageBytes: number;
}

// ── ストレージアダプタインターフェース ──

export interface IStorageAdapter {
  /** レコードを挿入（idが重複したらupsert） */
  put<T extends StorageRecord>(table: string, record: T): Promise<void>;

  /** レコードをupsert（put の alias） */
  upsert<T extends StorageRecord>(table: string, record: T): Promise<void>;

  /** IDでレコードを取得 */
  get<T extends StorageRecord>(table: string, id: string): Promise<T | null>;

  /** クエリでレコードを検索 */
  query<T extends StorageRecord>(table: string, query: StorageQuery): Promise<T[]>;

  /** IDでレコードを削除 */
  delete(table: string, id: string): Promise<boolean>;

  /** テーブル内の全レコード数を取得 */
  count(table: string, query?: StorageQuery): Promise<number>;

  /** ストレージの統計情報を取得 */
  stats(): Promise<StorageStats>;

  /** テーブルの古いレコードを削除（TTLベース） */
  purge(table: string, olderThan: number): Promise<number>;

  /** 全テーブルのデータをJSON形式でエクスポート */
  exportAll(): Promise<Record<string, StorageRecord[]>>;

  /** JSONデータをインポート（復元用） */
  importAll(data: Record<string, StorageRecord[]>): Promise<void>;
}

// ── テーブル名定数 ──

export const TABLES = {
  /** エージェントのアクション記録 */
  AGENT_ACTIONS: 'agent_actions',
  /** エージェントの健康状態履歴 */
  HEALTH_HISTORY: 'health_history',
  /** パイプライン実行履歴 */
  PIPELINE_RUNS: 'pipeline_runs',
  /** フィードバックレコード */
  FEEDBACK: 'feedback',
  /** システムイベントログ */
  SYSTEM_EVENTS: 'system_events',
  /** エージェント状態スナップショット */
  AGENT_STATE: 'agent_state',
  /** 売上帰属データ（Phase 5用） */
  ATTRIBUTION: 'attribution',
} as const;

// ── InMemoryStorage 実装 ──

/**
 * InMemoryStorage — 揮発性ストレージ（Phase 3初期実装）
 *
 * 制限:
 * - ワーカー再起動でデータ消失
 * - メモリ制限あり（128MB目安）
 * - テーブルごとにMAX_RECORDS制限
 *
 * 利点:
 * - 外部依存ゼロ
 * - 即座に使える
 * - インターフェースが確定するまでの安全な選択
 */
export class InMemoryStorage implements IStorageAdapter {
  private tables: Map<string, Map<string, StorageRecord>> = new Map();
  private readonly maxRecordsPerTable: number;
  /** LRU退去時のコールバック（無痛症の防止） */
  private onEvictionCallback?: (table: string, evictedId: string) => void;

  constructor(maxRecordsPerTable = 10_000) {
    this.maxRecordsPerTable = maxRecordsPerTable;
  }

  /** 退去通知コールバック設定（AgentBusと接続して使う） */
  setEvictionCallback(cb: (table: string, evictedId: string) => void): void {
    this.onEvictionCallback = cb;
  }

  private getTable(name: string): Map<string, StorageRecord> {
    let table = this.tables.get(name);
    if (!table) {
      table = new Map();
      this.tables.set(name, table);
    }
    return table;
  }

  async put<T extends StorageRecord>(tableName: string, record: T): Promise<void> {
    // T014: Zodスキーマによる型検証（骨格に異物が混入するのを防ぐ）
    const validation = StorageRecordSchema.safeParse(record);
    if (!validation.success) {
      log.error('[Storage] put() validation failed:', validation.error.message);
      throw new TypeError(`[Storage] put(): record validation failed — ${validation.error.message}`);
    }

    const table = this.getTable(tableName);

    // 容量制限チェック — 最も古いレコードを削除（LRU的）
    if (table.size >= this.maxRecordsPerTable && !table.has(record.id)) {
      let oldestId = '';
      let oldestTime = Infinity;
      for (const [id, rec] of table) {
        if (rec.createdAt < oldestTime) {
          oldestTime = rec.createdAt;
          oldestId = id;
        }
      }
      if (oldestId) {
        table.delete(oldestId);
        // 退去通知（無痛症の防止）
        if (this.onEvictionCallback) {
          try { this.onEvictionCallback(tableName, oldestId); } catch (err) { log.warn('[Storage] eviction callback failed:', err instanceof Error ? err.message : err); }
        }
      }
    }

    const existing = table.get(record.id);
    table.set(record.id, {
      ...record,
      createdAt: existing?.createdAt ?? record.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
  }

  async upsert<T extends StorageRecord>(tableName: string, record: T): Promise<void> {
    // upsert is an alias for put (insert or update)
    return this.put(tableName, record);
  }

  async get<T extends StorageRecord>(tableName: string, id: string): Promise<T | null> {
    const table = this.tables.get(tableName);
    return (table?.get(id) as T) ?? null;
  }

  async query<T extends StorageRecord>(tableName: string, q: StorageQuery): Promise<T[]> {
    const table = this.tables.get(tableName);
    if (!table) return [];

    let results = Array.from(table.values()) as T[];

    // T014: where フィルタをZodで検証 — プリミティブ値のみ許可
    if (q.where) {
      const validation = StorageQueryFilterSchema.safeParse(q.where);
      if (!validation.success) {
        log.error('[Storage] query() where validation failed:', validation.error.message);
        throw new TypeError(`[Storage] query(): where filter validation failed — ${validation.error.message}`);
      }

      for (const [key, value] of Object.entries(q.where)) {
        results = results.filter((r) => r[key] === value);
      }
    }

    // 時間範囲フィルタ
    if (q.since) results = results.filter((r) => r.createdAt >= q.since!);
    if (q.until) results = results.filter((r) => r.createdAt <= q.until!);

    // ソート
    const orderBy = q.orderBy || 'createdAt';
    const desc = q.desc !== false; // デフォルト降順
    results.sort((a, b) => {
      const aVal = a[orderBy] as number;
      const bVal = b[orderBy] as number;
      return desc ? bVal - aVal : aVal - bVal;
    });

    // ページネーション
    if (q.offset) results = results.slice(q.offset);
    if (q.limit) results = results.slice(0, q.limit);

    return results;
  }

  async delete(tableName: string, id: string): Promise<boolean> {
    const table = this.tables.get(tableName);
    return table?.delete(id) ?? false;
  }

  async count(tableName: string, q?: StorageQuery): Promise<number> {
    if (!q || (!q.where && !q.since && !q.until)) {
      return this.tables.get(tableName)?.size ?? 0;
    }
    const results = await this.query(tableName, {...q, limit: undefined, offset: undefined});
    return results.length;
  }

  async stats(): Promise<StorageStats> {
    const tableStats: Record<string, {count: number; sizeEstimate: number}> = {};
    let totalRecords = 0;

    for (const [name, table] of this.tables) {
      const count = table.size;
      // 粗い推定: レコードあたり平均500バイト
      const sizeEstimate = count * 500;
      tableStats[name] = {count, sizeEstimate};
      totalRecords += count;
    }

    return {
      tables: tableStats,
      totalRecords,
      memoryUsageBytes: totalRecords * 500,
    };
  }

  async purge(tableName: string, olderThan: number): Promise<number> {
    const table = this.tables.get(tableName);
    if (!table) return 0;

    let purged = 0;
    for (const [id, record] of table) {
      if (record.createdAt < olderThan) {
        table.delete(id);
        purged++;
      }
    }
    return purged;
  }

  async exportAll(): Promise<Record<string, StorageRecord[]>> {
    const result: Record<string, StorageRecord[]> = {};
    for (const [name, table] of this.tables) {
      result[name] = Array.from(table.values());
    }
    return result;
  }

  async importAll(data: Record<string, StorageRecord[]>): Promise<void> {
    for (const [tableName, records] of Object.entries(data)) {
      const table = this.getTable(tableName);
      for (const record of records) {
        table.set(record.id, record);
      }
    }
  }
}

// ── シングルトンインスタンス ──

let storageInstance: IStorageAdapter | null = null;

/**
 * ストレージインスタンスを取得
 *
 * Phase 3: InMemoryStorage（海馬=短期記憶）
 * Phase 13: KVStorage対応（大脳皮質=長期記憶）
 *  - 環境変数AGENT_KVがあればKVStorageを自動選択
 *  - なければInMemoryStorageにフォールバック
 */
export function getStorage(): IStorageAdapter {
  if (!storageInstance) {
    storageInstance = new InMemoryStorage(10_000);
  }
  return storageInstance;
}

/**
 * 環境変数に基づいてストレージを初期化（P13: KV対応 + T008: PostgreSQL対応）
 *
 * 優先順位:
 * 1. DATABASE_URL が設定 → DrizzleStorageAdapter（脳髄=永続記憶）
 * 2. AGENT_KV が設定 → KVStorage（大脳皮質=長期記憶）
 * 3. デフォルト → InMemoryStorage（海馬=短期記憶）
 *
 * server.tsのリクエストハンドラで呼び出す想定:
 * ```
 * await initStorageFromEnv(process.env);
 * ```
 */
export async function initStorageFromEnv(env: Record<string, unknown>): Promise<IStorageAdapter> {
  // 初回のみ初期化（リクエスト毎の再初期化を防止）
  if (storageInstance) return storageInstance;

  const databaseUrl = env.DATABASE_URL as string | undefined;
  const kvNamespace = env.AGENT_KV;

  // ── Tier 1: PostgreSQL（脳髄=永続記憶） ────
  if (databaseUrl) {
    try {
      const { getDatabase } = await import(/* @vite-ignore */ '../lib/databases/connection.js');
      const { DrizzleStorageAdapter } = await import(/* @vite-ignore */ '../lib/databases/drizzle-adapter.js');
      const schemaModule = await import(/* @vite-ignore */ '../lib/databases/schema.js');

      const dbClient = await getDatabase({ databaseUrl });
      const adapter = new DrizzleStorageAdapter(dbClient.db);

      // 全テーブルをスキーマから登録
      for (const [key, table] of Object.entries(schemaModule)) {
        // テーブルオブジェクトのみを検出（型のみのエクスポートをスキップ）
        if (table && typeof table === 'object' && (table as any)._ && (table as any).__tableName) {
          adapter.registerTable((table as any).__tableName, table);
        }
      }

      // ヘルスチェック
      const isHealthy = await adapter.healthCheck();
      if (!isHealthy) {
        log.warn('[Storage] PostgreSQL health check failed, falling back to InMemory');
        storageInstance = new InMemoryStorage(10_000);
        return storageInstance;
      }

      storageInstance = adapter as unknown as IStorageAdapter;
      log.info('[Storage] PostgreSQL connection active — persistent storage enabled (脳髄)');
      return storageInstance;
    } catch (err) {
      log.warn(
        '[Storage] PostgreSQL adapter failed:',
        err instanceof Error ? err.message : String(err),
      );
      log.warn('[Storage] Falling back to InMemory storage');
    }
  }

  // ── Tier 2: Cloudflare KV（大脳皮質=長期記憶） ────
  if (kvNamespace && typeof (kvNamespace as Record<string, unknown>).get === 'function') {
    // KV Namespace検出 → KVStorage（大脳皮質=長期記憶）を活性化
    try {
      const { KVStorage } = await import('./kv-storage.js');
      const kvAdapter = new KVStorage(kvNamespace as KVNamespace);
      storageInstance = kvAdapter as unknown as IStorageAdapter;
      log.info('[Storage] KV Namespace bound — long-term memory active (大脳皮質)');
      return storageInstance;
    } catch (err) {
      log.warn('[Storage] KVStorage creation failed, falling back to InMemory:', err instanceof Error ? err.message : err);
    }
  }

  // ── Tier 3: InMemory（海馬=短期記憶） ────
  storageInstance = new InMemoryStorage(10_000);
  if (!databaseUrl && !kvNamespace) {
    log.warn(
      '[Storage] DATABASE_URL and AGENT_KV not set. Using in-memory storage (海馬=短期記憶). Data will be lost on restart.',
    );
  } else {
    log.info('[Storage] In-memory storage initialized as fallback (海馬=短期記憶)');
  }
  return storageInstance;
}

/**
 * ストレージインスタンスを差し替え（テスト/マイグレーション/KV切替用）
 */
export function setStorage(adapter: IStorageAdapter): void {
  storageInstance = adapter;
}

/** 現在のストレージタイプを返す（診断用） */
export function getStorageType(): string {
  if (!storageInstance) return 'not_initialized';
  if (storageInstance instanceof InMemoryStorage) return 'in_memory';
  return 'external'; // KVStorage等
}
