/**
 * KVStorage — Cloudflare KV永続化層（大脳皮質=長期記憶）
 *
 * 医学的メタファー:
 * InMemoryStorage（海馬）は短期記憶。ワーカー再起動で消える。
 * KVStorage（大脳皮質）は長期記憶。KVに書かれたデータは永続化される。
 * 海馬→大脳皮質への転写（memory consolidation）を実装。
 *
 * 設計:
 * - IStorageAdapterを完全実装
 * - KV Namespaceが未提供ならInMemoryStorageにフォールバック
 * - テーブル単位でキー名前空間を分離: `${table}:${id}`
 * - メタデータキーでインデックス管理: `_idx:${table}`
 * - TTL対応: KVの`expirationTtl`を活用
 *
 * Oxygen/Workers制約:
 * - KV getは最大25MB/値
 * - KV putは最大25MB/値
 * - 結果整合性（書き込みから読み込みまで最大60秒の遅延あり）
 * - 1リクエストあたり最大1000回のKV操作
 */

import type { IStorageAdapter, StorageRecord, StorageQuery, StorageStats } from './storage.js';

/** KV メタデータ */
export interface KVMetadata {
  [key: string]: string | number | boolean;
}

/** Cloudflare KV Namespace の型定義（最小限） */
export interface KVNamespace {
  get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<string | ArrayBuffer | ReadableStream<Uint8Array> | Record<string, unknown> | null>;
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: KVMetadata }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: Array<{ name: string; expiration?: number; metadata?: KVMetadata }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}

/** テーブルのインデックス（IDリスト + 作成日時） */
interface TableIndex {
  ids: Array<{ id: string; createdAt: number }>;
  updatedAt: number;
}

export class KVStorage implements IStorageAdapter {
  private kv: KVNamespace;
  private readonly defaultTtl?: number;
  /** インメモリキャッシュ（リクエスト内再利用） */
  private cache = new Map<string, StorageRecord>();

  /**
   * @param kv - Cloudflare KV Namespace
   * @param defaultTtlSeconds - デフォルトTTL（秒）。未指定なら無期限
   */
  constructor(kv: KVNamespace, defaultTtlSeconds?: number) {
    this.kv = kv;
    this.defaultTtl = defaultTtlSeconds;
  }

  /** KVキー生成 */
  private key(table: string, id: string): string {
    return `${table}:${id}`;
  }

  /** インデックスキー */
  private indexKey(table: string): string {
    return `_idx:${table}`;
  }

  /** テーブルインデックスを取得（リクエスト内キャッシュ） */
  private async getIndex(table: string): Promise<TableIndex> {
    const cached = this.cache.get(this.indexKey(table));
    if (cached) return cached as unknown as TableIndex;

    const raw = await this.kv.get(this.indexKey(table), { type: 'json' });
    const index: TableIndex = raw ?? { ids: [], updatedAt: 0 };
    this.cache.set(this.indexKey(table), index as unknown as StorageRecord);
    return index;
  }

  /** テーブルインデックスを保存 */
  private async saveIndex(table: string, index: TableIndex): Promise<void> {
    index.updatedAt = Date.now();
    this.cache.set(this.indexKey(table), index as unknown as StorageRecord);
    await this.kv.put(this.indexKey(table), JSON.stringify(index));
  }

  // ── IStorageAdapter 実装 ──

  async put<T extends StorageRecord>(table: string, record: T): Promise<void> {
    const now = Date.now();
    const existing = await this.get<T>(table, record.id);

    const toStore = {
      ...record,
      createdAt: existing?.createdAt ?? record.createdAt ?? now,
      updatedAt: now,
    };

    const opts: { expirationTtl?: number } = {};
    if (this.defaultTtl) opts.expirationTtl = this.defaultTtl;

    await this.kv.put(this.key(table, record.id), JSON.stringify(toStore), opts);
    this.cache.set(this.key(table, record.id), toStore);

    // インデックス更新
    const index = await this.getIndex(table);
    if (!index.ids.find((e) => e.id === record.id)) {
      index.ids.push({ id: record.id, createdAt: toStore.createdAt });
    }
    await this.saveIndex(table, index);
  }

  async upsert<T extends StorageRecord>(table: string, record: T): Promise<void> {
    return this.put(table, record);
  }

  async get<T extends StorageRecord>(table: string, id: string): Promise<T | null> {
    const cacheKey = this.key(table, id);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as T;

    const raw = await this.kv.get(cacheKey, { type: 'json' });
    if (raw) this.cache.set(cacheKey, raw);
    return raw ?? null;
  }

  async query<T extends StorageRecord>(table: string, q: StorageQuery): Promise<T[]> {
    const index = await this.getIndex(table);
    if (index.ids.length === 0) return [];

    // フィルタリング対象のIDを時間範囲で絞り込み
    let targetIds = index.ids;
    if (q.since) targetIds = targetIds.filter((e) => e.createdAt >= q.since!);
    if (q.until) targetIds = targetIds.filter((e) => e.createdAt <= q.until!);

    // ソート
    const desc = q.desc !== false;
    targetIds.sort((a, b) => desc ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);

    // KVから取得（上限付き — 大量取得を防止）
    const fetchLimit = Math.min((q.offset ?? 0) + (q.limit ?? 100), targetIds.length);
    const records: T[] = [];

    for (let i = 0; i < fetchLimit; i++) {
      const rec = await this.get<T>(table, targetIds[i].id);
      if (!rec) continue;

      // whereフィルタ
      if (q.where) {
        let match = true;
        for (const [key, value] of Object.entries(q.where)) {
          if (rec[key] !== value) { match = false; break; }
        }
        if (!match) continue;
      }

      records.push(rec);
    }

    // offsetとlimit適用
    const offset = q.offset ?? 0;
    const limit = q.limit ?? records.length;
    return records.slice(offset, offset + limit);
  }

  async delete(table: string, id: string): Promise<boolean> {
    const existing = await this.get(table, id);
    if (!existing) return false;

    await this.kv.delete(this.key(table, id));
    this.cache.delete(this.key(table, id));

    // インデックスからも削除
    const index = await this.getIndex(table);
    index.ids = index.ids.filter((e) => e.id !== id);
    await this.saveIndex(table, index);
    return true;
  }

  async count(table: string, q?: StorageQuery): Promise<number> {
    if (!q?.where && !q?.since && !q?.until) {
      const index = await this.getIndex(table);
      return index.ids.length;
    }
    const results = await this.query(table, { ...q, limit: 50_000 });
    return results.length;
  }

  async stats(): Promise<StorageStats> {
    // KVのlistでテーブルプレフィックスを走査
    const tables: Record<string, { count: number; sizeEstimate: number }> = {};
    let totalRecords = 0;

    // 登録済みテーブルのインデックスを確認
    const knownTables = ['agent_actions', 'health_history', 'pipeline_runs', 'feedback', 'system_events', 'agent_state', 'attribution'];

    for (const tableName of knownTables) {
      const index = await this.getIndex(tableName);
      tables[tableName] = {
        count: index.ids.length,
        sizeEstimate: index.ids.length * 512, // 概算: 1レコードあたり512bytes
      };
      totalRecords += index.ids.length;
    }

    return {
      tables,
      totalRecords,
      memoryUsageBytes: this.cache.size * 1024, // キャッシュの概算
    };
  }

  async purge(table: string, olderThan: number): Promise<number> {
    const index = await this.getIndex(table);
    const toDelete = index.ids.filter((e) => e.createdAt < olderThan);

    for (const entry of toDelete) {
      await this.kv.delete(this.key(table, entry.id));
      this.cache.delete(this.key(table, entry.id));
    }

    index.ids = index.ids.filter((e) => e.createdAt >= olderThan);
    await this.saveIndex(table, index);
    return toDelete.length;
  }

  async exportAll(): Promise<Record<string, StorageRecord[]>> {
    const result: Record<string, StorageRecord[]> = {};
    const knownTables = ['agent_actions', 'health_history', 'pipeline_runs', 'feedback', 'system_events', 'agent_state', 'attribution'];

    for (const tableName of knownTables) {
      result[tableName] = await this.query(tableName, { limit: 50_000 });
    }
    return result;
  }

  async importAll(data: Record<string, StorageRecord[]>): Promise<void> {
    for (const [tableName, records] of Object.entries(data)) {
      for (const record of records) {
        await this.put(tableName, record);
      }
    }
  }

  /** リクエスト間キャッシュをクリア（ワーカーの各リクエスト開始時に呼ぶ） */
  clearRequestCache(): void {
    this.cache.clear();
  }
}

/**
 * ストレージファクトリ — 環境に応じて最適なストレージを選択
 *
 * 医学メタファー: 発達段階に応じた記憶システムの選択
 * - KV Namespaceが提供されればKVStorage（大脳皮質=長期記憶）
 * - なければInMemoryStorage（海馬=短期記憶）にフォールバック
 */
export function createStorageFromEnv(env: Record<string, unknown>): IStorageAdapter | null {
  const kv = env.AGENT_KV as KVNamespace | undefined;
  if (kv && typeof kv.get === 'function') {
    return new KVStorage(kv);
  }
  return null; // フォールバック: 呼び出し元がInMemoryStorageを使う
}
