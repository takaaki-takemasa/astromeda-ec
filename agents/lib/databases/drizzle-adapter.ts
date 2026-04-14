/**
 * Drizzle Storage Adapter — PostgreSQL via DrizzleORM（神経細胞シナプス）
 *
 * T001-T006 Preparation: Bridge between Drizzle ORM tables and IStorageAdapter interface
 *
 * 医学的メタファー: シナプスは神経細胞間の通信。
 * DrizzleORM（脳）とStorageAdapter（神経系）の通信インターフェース。
 *
 * 設計原則:
 * 1. IStorageAdapterを完全に実装
 * 2. Drizzle ORM table操作を使用してDB読み書き
 * 3. StorageRecordの型互換性を保証
 * 4. QueryパラメータをDrizzle where句に変換
 * 5. エラーハンドリング = セカンドオピニオン実装
 *
 * 状態:
 * - T008: env-validator.ts で DATABASE_URL 検証済み
 * - T009: .env.example で PostgreSQL 形式ドキュメント済み
 * - T001-T006: このアダプタで initStorageFromEnv() 統合可能
 *
 * 使用例:
 * ```typescript
 * // storage.ts の initStorageFromEnv() で以下のように呼び出される:
 * if (DATABASE_URL) {
 *   const db = getDatabase();
 *   const adapter = new DrizzleStorageAdapter(db.db);
 *   storageInstance = adapter;
 * }
 * ```
 */

import type { IStorageAdapter, StorageRecord, StorageQuery, StorageStats } from '../../core/storage.js';
import { createLogger } from '../../core/logger.js';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import {
  eq,
  and,
  gte,
  lte,
  asc,
  desc,
  sql,
  inArray,
} from 'drizzle-orm';

const logger = createLogger('drizzle-adapter');

// ─── 型定義 ───

/** Drizzle ORM database instance */
export type DrizzleDB = PgDatabase<any>;

/** 動的テーブルアクセス用の型（Drizzleはテーブルをキーで指定） */
interface TableMap {
  [key: string]: any; // 実際のテーブル定義
}

/**
 * DrizzleStorageAdapter — PostgreSQL 実装
 *
 * IStorageAdapterの全メソッドをDrizzleORM経由で実装。
 * テーブル名を文字列で指定できるように設計（dynamic table access）。
 */
export class DrizzleStorageAdapter implements IStorageAdapter {
  private db: DrizzleDB;
  private readonly tableMap: Map<string, any> = new Map();
  private startTime: number = Date.now();
  private statsCache: StorageStats | null = null;
  private statsCacheTime: number = 0;
  private readonly statsCacheTTL: number = 30_000; // 30秒キャッシュ

  /**
   * コンストラクタ
   *
   * @param db Drizzle ORM db インスタンス (getDatabase().db)
   * @param tables テーブルマップ（省略時は動的ロード）
   */
  constructor(db: DrizzleDB, tables?: TableMap) {
    if (!db) {
      throw new Error('[DrizzleAdapter] Drizzle db instance is required');
    }
    this.db = db;

    // テーブルを動的ロード（schema.tsから）
    if (tables) {
      for (const [name, table] of Object.entries(tables)) {
        this.tableMap.set(name, table);
      }
    }

    logger.info('DrizzleStorageAdapter initialized', {
      tableCount: this.tableMap.size,
    });
  }

  /**
   * テーブルを登録（初期化時に呼び出し）
   */
  registerTable(name: string, table: any): void {
    this.tableMap.set(name, table);
  }

  /**
   * テーブルを取得
   */
  private getTable(name: string): any {
    const table = this.tableMap.get(name);
    if (!table) {
      throw new Error(`[DrizzleAdapter] Table "${name}" not registered. Call registerTable() first.`);
    }
    return table;
  }

  /**
   * StorageRecord → DB型 変換
   */
  private recordToDBRow(record: StorageRecord): Record<string, unknown> {
    const row: Record<string, unknown> = { ...record };
    // createdAt/updatedAt を Date に変換（Drizzle timestamp対応）
    if (typeof row.createdAt === 'number') {
      row.createdAt = new Date(row.createdAt);
    }
    if (typeof row.updatedAt === 'number') {
      row.updatedAt = new Date(row.updatedAt);
    }
    return row;
  }

  /**
   * DB型 → StorageRecord 変換
   */
  private dbRowToRecord(row: any): StorageRecord {
    const record: any = { ...row };
    // Date → number に変換
    if (row.createdAt instanceof Date) {
      record.createdAt = row.createdAt.getTime();
    }
    if (row.updatedAt instanceof Date) {
      record.updatedAt = row.updatedAt.getTime();
    }
    if (typeof record.id !== 'string') {
      record.id = String(record.id);
    }
    return record;
  }

  /**
   * put — レコード挿入/更新（upsert）
   */
  async put<T extends StorageRecord>(tableName: string, record: T): Promise<void> {
    // 0-04: データ検証
    if (!record || typeof record !== 'object') {
      throw new TypeError(`[DrizzleAdapter] put(): record must be non-null object`);
    }
    if (!record.id || typeof record.id !== 'string') {
      throw new TypeError(`[DrizzleAdapter] put(): record.id must be non-empty string`);
    }

    const table = this.getTable(tableName);
    const dbRow = this.recordToDBRow(record);

    try {
      // Drizzle ORM: INSERT ... ON CONFLICT UPDATE (upsert)
      // PostgreSQL特有だが、他DBに移行時は差し替え可能
      await this.db
        .insert(table)
        .values(dbRow as any)
        .onConflictDoUpdate({
          target: table.id,
          set: dbRow as any,
        });
    } catch (err) {
      logger.error('put() failed', {
        tableName,
        recordId: record.id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    // キャッシュ無効化
    this.statsCache = null;
  }

  /**
   * upsert — put の alias
   */
  async upsert<T extends StorageRecord>(tableName: string, record: T): Promise<void> {
    return this.put(tableName, record);
  }

  /**
   * get — ID でレコード取得
   */
  async get<T extends StorageRecord>(tableName: string, id: string): Promise<T | null> {
    const table = this.getTable(tableName);

    try {
      const result = await this.db
        .select()
        .from(table)
        .where(eq(table.id, id))
        .limit(1);

      if (result.length === 0) return null;
      return this.dbRowToRecord(result[0]) as T;
    } catch (err) {
      logger.error('get() failed', {
        tableName,
        id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * query — StorageQuery でレコード検索
   */
  async query<T extends StorageRecord>(tableName: string, q: StorageQuery): Promise<T[]> {
    const table = this.getTable(tableName);

    try {
      let query = this.db.select().from(table);

      // where フィルタを構築
      const conditions: any[] = [];

      if (q.where) {
        for (const [key, value] of Object.entries(q.where)) {
          const vType = typeof value;
          if (value !== null && vType === 'object') {
            throw new TypeError(`[DrizzleAdapter] query(): where value for "${key}" must be primitive`);
          }
          if (vType === 'function' || vType === 'symbol') {
            throw new TypeError(`[DrizzleAdapter] query(): where value for "${key}" must be primitive`);
          }
          // key がテーブルカラムの場合のみ条件追加
          if (table[key]) {
            conditions.push(eq(table[key], value));
          }
        }
      }

      // 時間範囲フィルタ
      if (q.since && table.createdAt) {
        conditions.push(gte(table.createdAt, new Date(q.since)));
      }
      if (q.until && table.createdAt) {
        conditions.push(lte(table.createdAt, new Date(q.until)));
      }

      // where句を適用
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      // ソート
      const orderBy = q.orderBy || 'createdAt';
      const sortOrder = q.desc !== false ? desc : asc;
      if (table[orderBy]) {
        query = query.orderBy(sortOrder(table[orderBy])) as any;
      }

      // ページネーション（offset/limit）
      if (q.offset) {
        query = query.offset(q.offset) as any;
      }
      if (q.limit) {
        query = query.limit(q.limit) as any;
      }

      const results = await query;
      return results.map(r => this.dbRowToRecord(r) as T);
    } catch (err) {
      logger.error('query() failed', {
        tableName,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * delete — ID でレコード削除
   */
  async delete(tableName: string, id: string): Promise<boolean> {
    const table = this.getTable(tableName);

    try {
      const result = await this.db
        .delete(table)
        .where(eq(table.id, id));

      // キャッシュ無効化
      this.statsCache = null;

      // Drizzle は削除行数を返さないため、存在チェック
      const exists = await this.get(tableName, id);
      return !exists;
    } catch (err) {
      logger.error('delete() failed', {
        tableName,
        id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * count — テーブル内のレコード数を取得
   */
  async count(tableName: string, q?: StorageQuery): Promise<number> {
    const table = this.getTable(tableName);

    try {
      // StorageQuery が指定されていない場合は全体数
      if (!q || (!q.where && !q.since && !q.until)) {
        const result = await this.db
          .select({ count: sql`count(*)` })
          .from(table);
        return Number(result[0]?.count) || 0;
      }

      // StorageQuery で絞り込んだ件数
      const results = await this.query(tableName, { ...q, limit: undefined, offset: undefined });
      return results.length;
    } catch (err) {
      logger.error('count() failed', {
        tableName,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * stats — ストレージ統計
   * キャッシュ機能付き（30秒）
   */
  async stats(): Promise<StorageStats> {
    const now = Date.now();
    if (this.statsCache && now - this.statsCacheTime < this.statsCacheTTL) {
      return this.statsCache;
    }

    const tableStats: Record<string, { count: number; sizeEstimate: number }> = {};
    let totalRecords = 0;

    try {
      // 全テーブルに対して COUNT を実行
      for (const [tableName, table] of this.tableMap) {
        const count = await this.count(tableName);
        const sizeEstimate = count * 500; // 粗い推定
        tableStats[tableName] = { count, sizeEstimate };
        totalRecords += count;
      }

      this.statsCache = {
        tables: tableStats,
        totalRecords,
        memoryUsageBytes: totalRecords * 500, // 推定
      };
      this.statsCacheTime = now;

      return this.statsCache;
    } catch (err) {
      logger.error('stats() failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * purge — 古いレコードを削除
   */
  async purge(tableName: string, olderThan: number): Promise<number> {
    const table = this.getTable(tableName);

    try {
      // Drizzle はDELETEの削除行数を返さない可能性があるため、
      // 先に削除対象を取得
      if (!table.createdAt) {
        logger.warn('purge() skipped: table has no createdAt column', { tableName });
        return 0;
      }

      const toDelete = await this.db
        .select({ id: table.id })
        .from(table)
        .where(lte(table.createdAt, new Date(olderThan)));

      const purged = toDelete.length;

      if (purged > 0) {
        const ids = toDelete.map(r => (r as any).id);
        await this.db
          .delete(table)
          .where(inArray(table.id, ids));
      }

      // キャッシュ無効化
      this.statsCache = null;

      logger.info('purge() completed', { tableName, purged });
      return purged;
    } catch (err) {
      logger.error('purge() failed', {
        tableName,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * exportAll — 全テーブルをJSON形式でエクスポート
   */
  async exportAll(): Promise<Record<string, StorageRecord[]>> {
    const result: Record<string, StorageRecord[]> = {};

    try {
      for (const [tableName, table] of this.tableMap) {
        const rows = await this.db.select().from(table);
        result[tableName] = rows.map(r => this.dbRowToRecord(r));
      }
      return result;
    } catch (err) {
      logger.error('exportAll() failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * importAll — JSON データをインポート（復元用）
   */
  async importAll(data: Record<string, StorageRecord[]>): Promise<void> {
    try {
      for (const [tableName, records] of Object.entries(data)) {
        if (!records || records.length === 0) continue;

        const table = this.getTable(tableName);
        const dbRows = records.map(r => this.recordToDBRow(r));

        // バッチ挿入（大量データの場合）
        const batchSize = 100;
        for (let i = 0; i < dbRows.length; i += batchSize) {
          const batch = dbRows.slice(i, i + batchSize);
          await this.db.insert(table).values(batch as any);
        }

        logger.info('importAll() completed for table', { tableName, count: records.length });
      }

      // キャッシュ無効化
      this.statsCache = null;
    } catch (err) {
      logger.error('importAll() failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * diagnostic — 接続確認用メソッド
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.db.execute(sql`SELECT 1 as health`);
      return !!result;
    } catch (err) {
      logger.error('healthCheck() failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * アップタイムを取得（デバッグ用）
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }
}
