/**
 * LoggingConfig — 外部アグリゲーション対応ログ設定（T068完成）
 *
 * 医学的メタファー: 電子カルテシステム（EHR）
 * - JSON形式でログを出力（構造化ロギング）
 * - correlation-id でリクエスト全体の追跡を可能に
 * - log level はモジュール単位で設定可能
 * - DataDog/Splunk/CloudWatch等への転送対応
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  timestamp: string; // ISO 8601
  level: LogLevel;
  module: string;
  message: string;
  correlationId?: string;
  requestId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LogConfig {
  defaultLevel: LogLevel;
  modules: Record<string, LogLevel>;
  enableJsonFormat: boolean;
  enableConsoleOutput: boolean;
  enableFileOutput: boolean;
  filePath?: string;
  batchSize?: number;
  flushIntervalMs?: number;
}

const DEFAULT_CONFIG: LogConfig = {
  defaultLevel: 'info',
  modules: {
    'agent-bus': 'info',
    'health-monitor': 'info',
    'notification-bus': 'info',
    'notification-channels': 'info',
    'notification-router': 'info',
    'notification-history': 'debug',
    'escalation-rules': 'info',
    'ai-brain': 'info',
    'ai-router': 'info',
    'api-middleware': 'info',
    'error-monitor': 'warn',
    'approval-queue': 'info',
    'cascade-engine': 'warn',
  },
  enableJsonFormat: true,
  enableConsoleOutput: true,
  enableFileOutput: false,
  batchSize: 100,
  flushIntervalMs: 5000,
};

// ─────────────────────────────────
// Correlation ID (リクエスト追跡用)
// ─────────────────────────────────

const correlationIdMap = new Map<string, string>();
let requestCounter = 0;

/**
 * Correlation IDを生成または取得
 * （リクエストの全体的なフローを追跡するため）
 */
export function getOrCreateCorrelationId(requestId?: string): string {
  const rid = requestId || generateRequestId();

  if (!correlationIdMap.has(rid)) {
    const correlationId = `corr_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    correlationIdMap.set(rid, correlationId);

    // 古いマップエントリをクリーンアップ（メモリリーク防止）
    if (correlationIdMap.size > 10000) {
      const firstKey = correlationIdMap.keys().next().value;
      if (firstKey) correlationIdMap.delete(firstKey);
    }
  }

  return correlationIdMap.get(rid)!;
}

/**
 * Request ID を生成
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${(++requestCounter).toString(36)}`;
}

// ─────────────────────────────────
// Log Formatter
// ─────────────────────────────────

/**
 * JSON形式でログをフォーマット
 */
export function formatLogAsJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * テキスト形式でログをフォーマット（コンソール出力用）
 */
export function formatLogAsText(entry: LogEntry): string {
  const time = entry.timestamp;
  const level = entry.level.toUpperCase().padEnd(5);
  const module = `[${entry.module}]`.padEnd(20);
  const msg = entry.message;
  const corrId = entry.correlationId ? ` (${entry.correlationId})` : '';
  const reqId = entry.requestId ? ` {${entry.requestId}}` : '';

  let line = `${time} ${level} ${module} ${msg}${corrId}${reqId}`;

  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    line += ` metadata=${JSON.stringify(entry.metadata)}`;
  }

  if (entry.error) {
    line += ` error="${entry.error.name}: ${entry.error.message}"`;
  }

  return line;
}

// ─────────────────────────────────
// Logger Class
// ─────────────────────────────────

export class Logger {
  private module: string;
  private config: LogConfig;
  private logBuffer: LogEntry[] = [];
  private flushTimer?: ReturnType<typeof setInterval>;

  constructor(module: string, config?: LogConfig) {
    this.module = module;
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.enableFileOutput && this.config.batchSize && this.config.batchSize > 0) {
      this.startBatchFlush();
    }
  }

  /**
   * 現在のモジュールのログレベルを取得
   */
  private getLogLevel(): LogLevel {
    return this.config.modules[this.module] || this.config.defaultLevel;
  }

  /**
   * ログレベルの順序判定
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      fatal: 4,
    };

    return levels[level] >= levels[this.getLogLevel()];
  }

  /**
   * ログを出力（共通処理）
   */
  private log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
    error?: Error,
    correlationId?: string,
  ): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module: this.module,
      message,
      correlationId,
      metadata,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    if (this.config.enableJsonFormat) {
      const json = formatLogAsJson(entry);
      if (this.config.enableConsoleOutput) {
        console.log(json);
      }
      if (this.config.enableFileOutput) {
        this.logBuffer.push(entry);
      }
    } else {
      const text = formatLogAsText(entry);
      if (this.config.enableConsoleOutput) {
        if (level === 'error' || level === 'fatal') {
          console.error(text);
        } else if (level === 'warn') {
          console.warn(text);
        } else {
          console.log(text);
        }
      }
    }
  }

  debug(message: string, metadata?: Record<string, unknown>, correlationId?: string): void {
    this.log('debug', message, metadata, undefined, correlationId);
  }

  info(message: string, metadata?: Record<string, unknown>, correlationId?: string): void {
    this.log('info', message, metadata, undefined, correlationId);
  }

  warn(message: string, metadata?: Record<string, unknown>, correlationId?: string): void {
    this.log('warn', message, metadata, undefined, correlationId);
  }

  error(message: string, error?: Error | unknown, metadata?: Record<string, unknown>, correlationId?: string): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this.log('error', message, metadata, err, correlationId);
  }

  fatal(message: string, error?: Error | unknown, metadata?: Record<string, unknown>, correlationId?: string): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this.log('fatal', message, metadata, err, correlationId);
  }

  /**
   * バッチフラッシュ開始
   */
  private startBatchFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setInterval(
      () => {
        this.flushBuffer();
      },
      this.config.flushIntervalMs || 5000,
    );
  }

  /**
   * バッファをフラッシュ（実装は外部に委譲 — DataDog/Splunk/CloudWatch等へ送信）
   */
  private async flushBuffer(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    const batch = this.logBuffer.splice(0, this.config.batchSize || 100);

    // 本番環境では外部ログサービスに送信
    // 例: await sendToDatadog(batch);
    // 例: await sendToSplunk(batch);
    // 例: await sendToCloudWatch(batch);

    // デバッグ用: コンソール出力
    console.debug(
      `[LoggerBatch] Flushing ${batch.length} log entries`,
      batch.map((e) => e.timestamp),
    );
  }

  /**
   * ロガーをシャットダウン
   */
  shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushBuffer();
    }
  }
}

// ─────────────────────────────────
// Middleware: Request ID追跡
// ─────────────────────────────────

/**
 * Express/Remixミドルウェア: Correlation IDをコンテキストに注入
 *
 * 使用例:
 * ```
 * app.use(createCorrelationIdMiddleware());
 * ```
 */
export function createCorrelationIdMiddleware() {
  return (req: any, res: any, next: any) => {
    const requestId = generateRequestId();
    const correlationId = getOrCreateCorrelationId(requestId);

    // Request に注入
    req.correlationId = correlationId;
    req.requestId = requestId;

    // Response ヘッダーに追加
    res.set('X-Correlation-ID', correlationId);
    res.set('X-Request-ID', requestId);

    next();
  };
}

// ─────────────────────────────────
// シングルトン Logger Factory
// ─────────────────────────────────

const loggerInstances = new Map<string, Logger>();

/**
 * モジュール名でLoggerを取得（キャッシュ）
 */
export function createLogger(module: string, config?: LogConfig): Logger {
  if (!loggerInstances.has(module)) {
    loggerInstances.set(module, new Logger(module, config));
  }
  return loggerInstances.get(module)!;
}

/**
 * 全ロガーをシャットダウン（graceful shutdown）
 */
export function shutdownAllLoggers(): void {
  for (const logger of loggerInstances.values()) {
    logger.shutdown();
  }
  loggerInstances.clear();
}

// ─────────────────────────────────
// Configuration Export
// ─────────────────────────────────

/**
 * デフォルトログ設定を取得
 */
export function getLogConfig(): LogConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * ログ設定を初期化
 * （環境変数 LOG_LEVEL=debug 等で上書き可能）
 */
export function initLogging(config?: Partial<LogConfig>): LogConfig {
  const merged = { ...DEFAULT_CONFIG, ...config };

  // 環境変数で上書き
  if (process.env.LOG_LEVEL) {
    merged.defaultLevel = process.env.LOG_LEVEL as LogLevel;
  }

  if (process.env.LOG_FORMAT === 'text') {
    merged.enableJsonFormat = false;
  }

  if (process.env.LOG_FILE) {
    merged.enableFileOutput = true;
    merged.filePath = process.env.LOG_FILE;
  }

  return merged;
}
