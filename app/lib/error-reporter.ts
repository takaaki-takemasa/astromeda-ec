/**
 * Error Reporter — Lightweight client-side error monitoring
 *
 * Captures:
 * - Unhandled errors (window.onerror)
 * - Unhandled promise rejections (unhandledrejection)
 * - Manual error reports via reportError()
 *
 * Features:
 * - Batches errors (max 10 per flush, flush every 30s or on page unload)
 * - Deduplicates by error message within session
 * - Rate limits: max 50 reports per session
 * - Sends via navigator.sendBeacon (with fetch fallback)
 * - Works only in production client-side environment
 */

interface ErrorReport {
  message: string;
  stack?: string;
  url: string;
  timestamp: string;
  userAgent: string;
  context?: Record<string, string>;
}

interface ErrorReporterState {
  queue: ErrorReport[];
  seen: Set<string>;
  reportCount: number;
  maxReports: number;
  flushTimer?: number;
  initialized: boolean;
}

const MAX_REPORTS_PER_SESSION = 50;
const MAX_ERRORS_PER_BATCH = 10;
const FLUSH_INTERVAL_MS = 30000; // 30 seconds
const MAX_STACK_LENGTH = 500;

/**
 * HT-02: 指数バックオフ設定
 * 生命医学: 心臓が止まった時の除細動は、連続ではなく間隔を空けて行う。
 * サーバーが過負荷の時に連続送信すると状況が悪化するため、
 * 失敗ごとに待ち時間を倍増させる（1s→2s→4s→8s→16s→30s上限）。
 */
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const BACKOFF_JITTER_FACTOR = 0.3; // ±30%のランダムゆらぎ

let state: ErrorReporterState = {
  queue: [],
  seen: new Set(),
  reportCount: 0,
  maxReports: MAX_REPORTS_PER_SESSION,
  initialized: false,
};

/** HT-02: 連続失敗回数（指数バックオフ用） */
let consecutiveFailures = 0;

/** HT-01: オフライン時のlocalStorageキュー名 */
const OFFLINE_QUEUE_KEY = '__astromeda_error_offline_queue__';

/** HT-03: 現在のtrace-id（server.tsのBR-01と連携） */
let currentTraceId: string | undefined;

/**
 * HT-04: エラー報告の実行判定
 * - サーバーサイド(SSR)では報告しない
 * - 開発環境ではコンソールで十分なので報告しない（noisy回避）
 * - localhost/127.0.0.1でも報告しない
 * - test環境では許可（テスト可能に）
 */
function shouldReport(): boolean {
  if (typeof window === 'undefined') return false;
  // HT-04: 開発環境除外ガード（test環境は許可）
  if (process.env.NODE_ENV === 'development') return false;
  // test環境はshouldReport=trueにして単体テスト可能に
  if (process.env.NODE_ENV === 'test') return true;
  const host = typeof window !== 'undefined' ? window.location?.hostname : '';
  if (host === 'localhost' || host === '127.0.0.1') return false;
  return true;
}

/**
 * Truncate stack trace to reasonable length
 */
function truncateStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  return stack.substring(0, MAX_STACK_LENGTH);
}

/**
 * Check if we've already seen this error (deduplication)
 */
function isDuplicate(errorMessage: string): boolean {
  return state.seen.has(errorMessage);
}

/**
 * Mark error as seen
 */
function markSeen(errorMessage: string): void {
  state.seen.add(errorMessage);
}

/**
 * Check rate limit
 */
function isRateLimited(): boolean {
  return state.reportCount >= state.maxReports;
}

/**
 * Queue an error for reporting
 */
function queueError(report: ErrorReport): void {
  if (isRateLimited()) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[ErrorReporter] Rate limit reached (50 errors per session)');
    }
    return;
  }

  if (isDuplicate(report.message)) {
    return; // Silently skip duplicates
  }

  markSeen(report.message);
  state.queue.push(report);
  state.reportCount++;

  // Auto-flush if we hit the max batch size
  if (state.queue.length >= MAX_ERRORS_PER_BATCH) {
    flushErrors();
  }
}

/**
 * HT-02: 指数バックオフ計算（jitter付き）
 * 心臓のリズム: 失敗するたびに間隔を倍に、ランダムゆらぎで
 * 複数クライアントのflushが同時に集中するのを防ぐ（心拍同期回避）。
 */
function getBackoffDelay(): number {
  const base = Math.min(BACKOFF_BASE_MS * Math.pow(2, consecutiveFailures), BACKOFF_MAX_MS);
  const jitter = base * BACKOFF_JITTER_FACTOR * (Math.random() * 2 - 1);
  return Math.max(0, Math.floor(base + jitter));
}

/**
 * HT-01: オフライン時にlocalStorageへキューを退避
 */
function saveToOfflineQueue(reports: ErrorReport[]): void {
  try {
    const existing = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    const merged = [...existing, ...reports].slice(-50); // 最大50件保持
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(merged));
  } catch {
    // localStorage利用不可の環境では諦める
  }
}

/**
 * HT-01: オフラインキューからの復元
 */
function restoreOfflineQueue(): ErrorReport[] {
  try {
    const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (stored) {
      localStorage.removeItem(OFFLINE_QUEUE_KEY);
      return JSON.parse(stored);
    }
  } catch {
    // パース失敗時はクリア
    try { localStorage.removeItem(OFFLINE_QUEUE_KEY); } catch { /* ignore */ }
  }
  return [];
}

/**
 * Flush queued errors to the server
 *
 * HT-01: オフライン検出時はlocalStorageに退避
 * HT-02: 失敗時は指数バックオフで再試行
 * HT-03: trace-idヘッダー付与
 */
async function flushErrors(): Promise<void> {
  if (state.queue.length === 0) return;

  // HT-01: オフライン検出
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    saveToOfflineQueue(state.queue.splice(0));
    return;
  }

  // HT-02: バックオフ中はスキップ（test環境ではバックオフ無効）
  if (consecutiveFailures > 0 && process.env.NODE_ENV !== 'test') {
    const delay = getBackoffDelay();
    await new Promise((r) => setTimeout(r, delay));
  }

  const toSend = state.queue.splice(0, MAX_ERRORS_PER_BATCH);

  try {
    // Try sendBeacon first (best for unload scenarios)
    if (navigator.sendBeacon) {
      const success = navigator.sendBeacon(
        '/api/error-report',
        JSON.stringify(toSend),
      );
      if (success) {
        consecutiveFailures = 0; // HT-02: 成功時にリセット
        return;
      }
    }

    // HT-03: trace-idヘッダーを付与（BR-01連携）
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (currentTraceId) {
      headers['X-Trace-Id'] = currentTraceId;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000);

    try {
      const response = await fetch('/api/error-report', {
        method: 'POST',
        headers,
        body: JSON.stringify(toSend),
        keepalive: true,
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status >= 500) {
          consecutiveFailures++; // HT-02: 5xx失敗カウント
          throw new Error(`Server error: ${response.status}`);
        }
        // 4xx: 破棄（再送無意味）
      } else {
        consecutiveFailures = 0; // HT-02: 成功時にリセット
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    consecutiveFailures++; // HT-02: 失敗カウント
    // Re-queue failed errors
    state.queue.unshift(...toSend);

    // HT-01: ネットワークエラー時はオフラインキューへ退避
    if (err instanceof TypeError && err.message.includes('fetch')) {
      saveToOfflineQueue(state.queue.splice(0));
    }
  }
}

/**
 * Schedule periodic flush
 */
function scheduleFlush(): void {
  if (state.flushTimer !== undefined) return;

  state.flushTimer = window.setInterval(() => {
    flushErrors();
  }, FLUSH_INTERVAL_MS) as unknown as number;
}

/**
 * Manually report an error with optional context
 */
export function reportError(error: Error, context?: Record<string, string>): void {
  if (!shouldReport()) return;

  const report: ErrorReport = {
    message: error.message || (typeof error === 'string' ? error : JSON.stringify(error)),
    stack: truncateStack(error.stack),
    url: typeof window !== 'undefined' ? window.location.href : '',
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    context,
  };

  queueError(report);
}

/**
 * HT-03: trace-idを設定（BR-01のserver.tsから受け取る）
 * レスポンスヘッダーのX-Trace-Idを読み取り、エラー報告に含める。
 */
export function setTraceId(traceId: string): void {
  currentTraceId = traceId;
}

/**
 * Initialize global error handlers
 *
 * HT-01: オンライン復帰時にオフラインキューをフラッシュ
 * HT-04: 開発環境では初期化しない（shouldReportガード）
 */
export function initErrorReporter(): void {
  if (!shouldReport() || state.initialized) return;

  state.initialized = true;

  // HT-01: オフラインキューの復元（前回オフライン時に退避したエラーを復元）
  const offlineErrors = restoreOfflineQueue();
  if (offlineErrors.length > 0) {
    state.queue.push(...offlineErrors);
  }

  scheduleFlush();

  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    const error = event.error || new Error(event.message);
    const report: ErrorReport = {
      message: error.message || event.message,
      stack: truncateStack(error.stack),
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    };
    queueError(report);
  });

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const error =
      event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason));

    const report: ErrorReport = {
      message: error.message || 'Unhandled Promise Rejection',
      stack: truncateStack(error.stack),
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    };
    queueError(report);
  });

  // Flush on page unload
  window.addEventListener('beforeunload', () => {
    flushErrors();
  });

  // HT-01: オンライン復帰時にオフラインキューをフラッシュ
  window.addEventListener('online', () => {
    const offlineErrors = restoreOfflineQueue();
    if (offlineErrors.length > 0) {
      state.queue.push(...offlineErrors);
    }
    flushErrors();
  });

  if (process.env.NODE_ENV === 'development') {
    console.log('[ErrorReporter] Initialized');
  }
}

/**
 * Force flush all queued errors (useful for testing)
 *
 * M4-CARDIAC-06 (2026-04-10): 無限ループ防止。
 * flushErrors は失敗時に unshift で再キューするため、persistent 5xx 下で
 * while (queue.length > 0) だと永久に回り続けて呼び出し元（beforeunload等）
 * を凍らせる。最大イテレーション + 進捗なし検出で確実に抜ける。
 * （蘇生措置を永遠に続けると生存者まで疲弊する。適切な撤退を保証。）
 */
export async function flush(): Promise<void> {
  const MAX_ITERATIONS = 20;
  let iterations = 0;
  while (state.queue.length > 0 && iterations < MAX_ITERATIONS) {
    const before = state.queue.length;
    await flushErrors();
    iterations++;
    // 進捗が無い（再キューで同じまま）なら即座に中断
    if (state.queue.length >= before) {
      break;
    }
  }
}

/**
 * Get current state (for testing/debugging)
 */
export function getState() {
  return {
    queueLength: state.queue.length,
    reportCount: state.reportCount,
    seenErrors: state.seen.size,
    initialized: state.initialized,
  };
}

/**
 * Reset state (for testing)
 */
export function reset(): void {
  if (state.flushTimer !== undefined) {
    clearInterval(state.flushTimer);
  }
  state = {
    queue: [],
    seen: new Set(),
    reportCount: 0,
    maxReports: MAX_REPORTS_PER_SESSION,
    initialized: false,
  };
  consecutiveFailures = 0; // HT-02: バックオフもリセット
  currentTraceId = undefined; // HT-03: trace-idもリセット
}
