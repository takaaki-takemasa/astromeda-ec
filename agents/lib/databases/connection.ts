/**
 * Database Connection Manager — DB接続プール+ヘルスチェック（血管系）
 *
 * 医学メタファー: 血管は骨髄と臓器を結ぶ。
 * 接続プールは「血管の太さ」、ヘルスチェックは「脈拍測定」。
 *
 * 設計原則:
 * 1. 接続プール — max=20, idleTimeout=30s, connectionTimeout=5s
 * 2. ヘルスチェック — 30秒間隔でSELECT 1
 * 3. 自動リトライ — 3回+指数バックオフ
 * 4. 統計メトリクス — active/idle/waiting
 * 5. Graceful shutdown — プール安全終了
 *
 * 環境変数:
 *   DATABASE_URL — PostgreSQL接続文字列
 *     例: postgres://user:pass@host:5432/astromeda_agents
 *   DATABASE_URL未設定時はInMemoryモードにフォールバック
 */

// Dynamic imports for postgres/drizzle to avoid pulling them into client bundle.
// These are only used when DATABASE_URL is set (server-side).
import type * as schema from './schema';
import { createLogger } from '../../core/logger.js';

const log = createLogger('connection');


// ─── 型定義 ───
export interface ConnectionConfig {
  databaseUrl?: string;
  maxConnections?: number;
  idleTimeout?: number;      // seconds
  connectTimeout?: number;   // seconds
  healthCheckInterval?: number; // ms
}

export interface ConnectionStats {
  mode: 'postgres' | 'memory';
  active: number;
  idle: number;
  total: number;
  waitingCount: number;
  healthChecksPassed: number;
  healthChecksFailed: number;
  lastHealthCheck: number | null;
  uptime: number;
}

export interface DatabaseClient {
  db: ReturnType<typeof drizzle>;
  sql: ReturnType<typeof postgres>;
  getStats(): ConnectionStats;
  healthCheck(): Promise<boolean>;
  shutdown(): Promise<void>;
}

// ─── InMemory フォールバック ───
// PostgreSQL未接続時のスタブ。開発・テストで使用。
class InMemoryDatabase {
  private tables: Map<string, unknown[]> = new Map();
  private startTime = Date.now();
  private healthChecks = { passed: 0, failed: 0, last: null as number | null };

  getStats(): ConnectionStats {
    return {
      mode: 'memory',
      active: 0,
      idle: 0,
      total: 0,
      waitingCount: 0,
      healthChecksPassed: this.healthChecks.passed,
      healthChecksFailed: this.healthChecks.failed,
      lastHealthCheck: this.healthChecks.last,
      uptime: Date.now() - this.startTime,
    };
  }

  async healthCheck(): Promise<boolean> {
    this.healthChecks.passed++;
    this.healthChecks.last = Date.now();
    return true;
  }

  async shutdown(): Promise<void> {
    this.tables.clear();
  }
}

// ─── シングルトン管理 ───
let _client: DatabaseClient | null = null;
let _memoryFallback: InMemoryDatabase | null = null;
let _healthCheckTimer: ReturnType<typeof setInterval> | null = null;

const DEFAULT_CONFIG: Required<ConnectionConfig> = {
  databaseUrl: '',
  maxConnections: 20,
  idleTimeout: 30,
  connectTimeout: 5,
  healthCheckInterval: 30_000,
};

/**
 * データベースクライアントを取得（シングルトン）
 *
 * DATABASE_URL が設定されていれば PostgreSQL に接続。
 * 未設定時は InMemory モードで動作（テスト・開発用）。
 */
export async function getDatabase(config?: ConnectionConfig): Promise<DatabaseClient> {
  if (_client) return _client;

  const cfg = { ...DEFAULT_CONFIG, ...config };
  const url = cfg.databaseUrl || process.env.DATABASE_URL;

  if (!url) {
    // InMemoryフォールバック（開発・テスト用）
    log.warn('[DB] DATABASE_URL未設定 — InMemoryモードで起動');
    _memoryFallback = new InMemoryDatabase();

    // InMemoryモード用のDrizzle互換ラッパー
    // 注: 実際のDB操作は不可。テスト用。
    _client = {
      db: null as any,
      sql: null as any,
      getStats: () => _memoryFallback!.getStats(),
      healthCheck: () => _memoryFallback!.healthCheck(),
      shutdown: () => _memoryFallback!.shutdown(),
    };
    return _client;
  }

  // PostgreSQL接続 — 動的importでクライアントバンドル汚染を防止
  const postgresModule = await import('postgres');
  const drizzleModule = await import('drizzle-orm/postgres-js');
  const schemaModule = await import('./schema');
  const pgCreate = postgresModule.default;
  const drizzleCreate = drizzleModule.drizzle;

  const sql = pgCreate(url, {
    max: cfg.maxConnections,
    idle_timeout: cfg.idleTimeout,
    connect_timeout: cfg.connectTimeout,
    onnotice: () => {},
  });

  const db = drizzleCreate(sql, { schema: schemaModule });

  const startTime = Date.now();
  const healthStats = { passed: 0, failed: 0, last: null as number | null };

  const healthCheck = async (): Promise<boolean> => {
    try {
      await sql`SELECT 1 as health_check`;
      healthStats.passed++;
      healthStats.last = Date.now();
      return true;
    } catch (err) {
      healthStats.failed++;
      healthStats.last = Date.now();
      log.error('[DB] ヘルスチェック失敗:', err instanceof Error ? err.message : err);
      return false;
    }
  };

  // 定期ヘルスチェック開始
  _healthCheckTimer = setInterval(() => {
    void (async () => {
      const ok = await healthCheck();
      if (!ok) {
        log.error(`[DB] ヘルスチェック連続失敗: ${healthStats.failed}回`);
      }
    })();
  }, cfg.healthCheckInterval);

  _client = {
    db,
    sql,
    getStats: () => ({
      mode: 'postgres' as const,
      active: 0,  // postgres.js doesn't expose pool stats directly
      idle: 0,
      total: cfg.maxConnections,
      waitingCount: 0,
      healthChecksPassed: healthStats.passed,
      healthChecksFailed: healthStats.failed,
      lastHealthCheck: healthStats.last,
      uptime: Date.now() - startTime,
    }),
    healthCheck,
    shutdown: async () => {
      if (_healthCheckTimer) {
        clearInterval(_healthCheckTimer);
        _healthCheckTimer = null;
      }
      await sql.end();
      _client = null;
    },
  };

  return _client;
}

/**
 * DB接続をリセット（テスト用）
 */
export async function resetDatabase(): Promise<void> {
  if (_client) {
    await _client.shutdown();
    _client = null;
  }
  _memoryFallback = null;
}

/**
 * リトライ付きDB操作ヘルパー
 * 3回リトライ + 指数バックオフ（1s→2s→4s）
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        log.warn(`[DB] リトライ ${attempt + 1}/${maxRetries} (${delay}ms後): ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

/**
 * 現在のデータベースモードを確認
 */
export function isDatabaseConnected(): boolean {
  return _client?.getStats().mode === 'postgres';
}
