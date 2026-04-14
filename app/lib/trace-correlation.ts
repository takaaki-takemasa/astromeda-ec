/**
 * IM-05: 分散トレース相関 — 免疫系のサイトカイン信号
 *
 * 医学メタファー: サイトカイン
 * 免疫細胞（エラーレポート・ログ・モニタリング）が全身の何千という細胞と
 * 通信するため、サイトカインという分子信号が使われる。各信号に固有ID
 * （サイトカイン型）が付与されることで、因果関係を追跡できる。
 *
 * テクニカル: trace-idでエラーレポート・ログ・リクエストを横断的に紐付け
 * - server.ts BR-01: リクエスト到着時にtrace-idを生成
 * - api.error-report.ts: 受信したエラーレポートにtrace-idを付与
 * - app/lib/error-reporter.ts: クライアント側でtrace-idを伝播
 * - console.error / logger: 構造化ログにtrace-idを含める
 *
 * これにより、「あるエラーレポートが発生した時点での全ログを取得」
 * 「複数のエラーレポートが同じtrace-idで発生」という分析が可能になる
 */

import type { Request } from '@remix-run/web-api';

/**
 * trace-id抽出: リクエストヘッダーから既存のtrace-idを取得
 * または新規生成
 */
export function extractTraceId(request: Request | { headers: Headers }): string {
  const headers = 'headers' in request ? request.headers : request.headers;

  // サーバー側（X-Trace-Id）: server.ts BR-01で生成済み
  const serverTraceId = headers.get('x-trace-id');
  if (serverTraceId) return serverTraceId;

  // クライアント側からの追跡ID伝播（エラーレポート等）
  const requestId = headers.get('x-request-id');
  if (requestId) return requestId;

  // 標準W3C Trace Context
  const traceParent = headers.get('traceparent');
  if (traceParent) {
    // traceparent: 00-trace-id-span-id-flags
    const parts = traceParent.split('-');
    if (parts.length >= 2) return parts[1];
  }

  // 生成（到達していない場合のフォールバック）
  return crypto.randomUUID();
}

/**
 * trace-idを応答ヘッダーに設定
 */
export function setTraceIdHeader(response: Response, traceId: string): void {
  response.headers.set('X-Trace-Id', traceId);
}

/**
 * トレース・コンテキスト構造化データ
 * ログ・エラーレポート・メトリクス保存に使用
 */
export interface TraceContext {
  traceId: string;
  timestamp: string;
  url: string;
  method: string;
  userAgent: string;
  ip: string;
  userEmail?: string; // 認証済みユーザーの場合のみ
  sessionId?: string;
  userId?: string;
}

/**
 * リクエストからトレース・コンテキストを構築
 *
 * @param request - Node Request オブジェクト
 * @param additional - userEmail, sessionId等の追加フィールド
 * @returns トレース・コンテキスト
 */
export function createTraceContext(
  request: Request,
  additional?: {
    userEmail?: string;
    sessionId?: string;
    userId?: string;
  }
): TraceContext {
  const url = new URL(request.url);
  const traceId = extractTraceId(request);

  return {
    traceId,
    timestamp: new Date().toISOString(),
    url: url.pathname + url.search,
    method: request.method,
    userAgent: request.headers.get('user-agent') || 'unknown',
    ip: request.headers.get('cf-connecting-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || 'unknown',
    ...additional,
  };
}

/**
 * トレース・コンテキストの構造化ログ出力
 * console.error / logger で使用
 */
export function formatTraceLog(
  context: TraceContext,
  level: 'error' | 'warning' | 'info' | 'debug',
  message: string,
  metadata?: Record<string, unknown>
): Record<string, unknown> {
  return {
    level,
    msg: message,
    timestamp: context.timestamp,
    traceId: context.traceId,
    url: context.url,
    method: context.method,
    ip: context.ip,
    userAgent: context.userAgent,
    userEmail: context.userEmail,
    sessionId: context.sessionId,
    userId: context.userId,
    ...metadata,
  };
}

/**
 * エラーレポート用のtrace-id付きコンテキスト
 * api.error-report.ts で使用
 */
export function createErrorReportContext(
  request: Request,
  errorCategory: string
): Record<string, string> {
  const traceId = extractTraceId(request);
  const url = new URL(request.url);

  return {
    traceId,
    timestamp: new Date().toISOString(),
    url: url.pathname,
    method: request.method,
    errorCategory,
    userAgent: request.headers.get('user-agent') || 'unknown',
  };
}

/**
 * W3C Trace Context (traceparent) を生成
 * 外部サービス（Datadog, Jaeger等）連携時に使用
 *
 * Format: version-trace-id-parent-id-flags
 * @param traceId - 既存のtrace-id（またはUUID）
 * @returns traceparent ヘッダー値
 */
export function generateTraceParent(traceId: string): string {
  // version=00 (W3C standard), trace-id (32 hex), parent-id (16 hex, 0=root), flags=01 (sampled)
  const spanId = crypto.getRandomValues(new Uint8Array(8));
  const spanIdHex = Array.from(spanId, (b) => b.toString(16).padStart(2, '0')).join('');
  return `00-${traceId.replace(/-/g, '')}-${spanIdHex}-01`;
}

/**
 * Baggage形式（OTEL仕様）でtrace情報を詰める
 * マイクロサービス間のpropagation用
 */
export function encodeBaggage(context: TraceContext): string {
  const items = [
    `traceId=${encodeURIComponent(context.traceId)}`,
    `userId=${encodeURIComponent(context.userId || 'anonymous')}`,
    `timestamp=${encodeURIComponent(context.timestamp)}`,
    `url=${encodeURIComponent(context.url)}`,
  ];
  return items.join(',');
}

/**
 * Baggageヘッダーをパース
 */
export function decodeBaggage(baggageHeader: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pairs = baggageHeader.split(',');

  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value) {
      result[key.trim()] = decodeURIComponent(value);
    }
  }

  return result;
}
