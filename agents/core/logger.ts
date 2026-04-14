/**
 * Structured Logger — 構造化ログモジュール（延髄=反射神経）
 *
 * v3 Layer 1 (1-02): console.log/warn/error → JSON構造化ログに統一
 * 全モジュールが同じフォーマットでログを出力し、
 * 将来のログ集約基盤（Datadog/Grafana Loki等）に対応する。
 *
 * 医学的メタファー: 延髄は無意識の反射を司る。
 * ログは「痛覚反射」のように、問題をリアルタイムで記録する。
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  [key: string]: unknown;
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

/** 環境変数でログレベルを制御（デフォルト: info） */
function getMinLevel(): LogLevel {
  const envLevel = (typeof process !== 'undefined' && process.env?.LOG_LEVEL) || 'info';
  return (LOG_LEVEL_ORDER[envLevel as LogLevel] !== undefined) ? envLevel as LogLevel : 'info';
}

/**
 * 構造化ログ出力
 * @param entry ログエントリ
 */
export function structuredLog(entry: StructuredLogEntry): void {
  const minLevel = getMinLevel();
  if (LOG_LEVEL_ORDER[entry.level] < LOG_LEVEL_ORDER[minLevel]) return;

  const logLine = JSON.stringify({
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
  });

  switch (entry.level) {
    case 'error':
    case 'fatal':
      console.error(logLine);
      break;
    case 'warn':
      console.warn(logLine);
      break;
    case 'debug':
      console.debug(logLine);
      break;
    default:
      console.log(logLine);
  }
}

/**
 * モジュール専用ロガーを生成（各臓器の専用神経回路）
 * @param module モジュール名（例: 'agent-bus', 'health-monitor'）
 */
export function createLogger(module: string) {
  return {
    debug: (message: string, extra?: Record<string, unknown>) =>
      structuredLog({ timestamp: new Date().toISOString(), level: 'debug', module, message, ...extra }),
    info: (message: string, extra?: Record<string, unknown>) =>
      structuredLog({ timestamp: new Date().toISOString(), level: 'info', module, message, ...extra }),
    warn: (message: string, extra?: Record<string, unknown>) =>
      structuredLog({ timestamp: new Date().toISOString(), level: 'warn', module, message, ...extra }),
    error: (message: string, extra?: Record<string, unknown>) =>
      structuredLog({ timestamp: new Date().toISOString(), level: 'error', module, message, ...extra }),
    fatal: (message: string, extra?: Record<string, unknown>) =>
      structuredLog({ timestamp: new Date().toISOString(), level: 'fatal', module, message, ...extra }),
  };
}
