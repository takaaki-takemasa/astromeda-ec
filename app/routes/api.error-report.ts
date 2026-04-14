/**
 * API Route: POST /api/error-report
 *
 * Server-side error logging endpoint.
 *
 * Accepts error reports from client-side error reporter and logs them
 * in a structured JSON format for analysis.
 *
 * Features:
 * - Rate limiting by IP: max 20 reports per minute
 * - Structured logging with timestamp, message, stack, URL, user agent
 * - Returns 200 OK to client (we don't fail the client on logging errors)
 * - In production, would forward to log aggregation service (Datadog, CloudWatch, etc.)
 */

import type {Route} from './+types/api.error-report';
import { ErrorReportSchema } from '~/lib/api-schemas';
import { redactPII } from '~/lib/pii-redactor';
import { extractTraceId, createErrorReportContext, formatTraceLog } from '~/lib/trace-correlation';

interface ErrorLogEntry {
  timestamp: string;
  message: string;
  stack?: string;
  url: string;
  userAgent: string;
  ip: string;
  context?: Record<string, string>;
  traceId: string; // IM-05: 分散トレース相関用ID
}

/**
 * Rate limiter state (simple in-memory, persists per Oxygen worker)
 * In production, use Redis or a similar store.
 */
const rateLimitStore = new Map<string, {count: number; resetAt: number}>();

/**
 * Extract client IP from request headers
 */
function getClientIP(request: Request): string {
  const cfIP = request.headers.get('cf-connecting-ip');
  const xForwardedFor = request.headers.get('x-forwarded-for');
  const xRealIP = request.headers.get('x-real-ip');

  // Cloudflare (Oxygen)
  if (cfIP) return cfIP.split(',')[0].trim();

  // Proxy headers
  if (xForwardedFor) return xForwardedFor.split(',')[0].trim();
  if (xRealIP) return xRealIP.trim();

  // Fallback
  return 'unknown';
}

/**
 * Check and enforce rate limit by IP (20 per minute)
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now >= entry.resetAt) {
    // New window or expired
    rateLimitStore.set(ip, {count: 1, resetAt: now + 60000});
    return true;
  }

  if (entry.count < 20) {
    entry.count++;
    return true;
  }

  return false;
}


/**
 * Forward error to external error tracking service
 * Supports Sentry or Datadog, with graceful fallback
 */
async function forwardToExternalService(entry: ErrorLogEntry): Promise<void> {
  // Redact PII before sending to external service
  const redactedEntry = {
    ...entry,
    message: redactPII(entry.message),
    stack: entry.stack ? redactPII(entry.stack) : undefined,
    url: redactPII(entry.url),
  };

  // Check for Sentry DSN
  const sentryDsn = process.env.SENTRY_DSN;
  if (sentryDsn) {
    try {
      // Sentry uses envelope format: https://docs.sentry.io/api/envelope/
      const dsn = new URL(sentryDsn);
      const projectId = dsn.pathname.split('/').pop();
      const sentryHost = dsn.host;

      const envelope = JSON.stringify(redactedEntry) + '\n';

      await fetch(`https://${sentryHost}/api/${projectId}/envelope/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
          'X-Trace-Id': redactedEntry.traceId, // IM-05: Sentry側でtrace相関分析
        },
        body: envelope,
      });
      return;
    } catch (err) {
      console.error('[Sentry Forward Error]', err instanceof Error ? err.message : String(err));
      // Fall through to next option
    }
  }

  // Check for Datadog API Key
  const datadogApiKey = process.env.DATADOG_API_KEY;
  if (datadogApiKey) {
    try {
      await fetch('https://api.datadoghq.com/api/v2/logs', {
        method: 'POST',
        headers: {
          'DD-API-KEY': datadogApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hostname: 'astromeda-ec',
          service: 'error-reporter',
          ddsource: 'error-report',
          ddtags: `env:${process.env.NODE_ENV},traceId:${redactedEntry.traceId}`, // IM-05
          message: redactedEntry.message,
          error: {
            message: redactedEntry.message,
            stack: redactedEntry.stack,
            context: redactedEntry.context,
          },
          timestamp: new Date(redactedEntry.timestamp).toISOString(),
          url: redactedEntry.url,
          traceId: redactedEntry.traceId, // IM-05: Datadog側でtrace相関分析
        }),
      });
      return;
    } catch (err) {
      console.error('[Datadog Forward Error]', err instanceof Error ? err.message : String(err));
      // Fall through to console logging
    }
  }

  // Fallback: structured console logging (local/development)
  console.error('[ErrorReport - External Service Fallback]', JSON.stringify(redactedEntry, null, 2));
}

/**
 * Log structured error entry with trace-id correlation
 */
function logError(entry: ErrorLogEntry): void {
  // IM-05: 構造化ログにtrace-idを含めて分散トレース対応
  const logData = formatTraceLog(
    {
      traceId: entry.traceId,
      timestamp: entry.timestamp,
      url: entry.url,
      method: 'POST',
      userAgent: entry.userAgent,
      ip: entry.ip,
    },
    'error',
    entry.message,
    {
      stack: entry.stack,
      context: entry.context,
    }
  );

  // In development or early testing, log to console with formatting
  if (process.env.NODE_ENV === 'development') {
    console.error('[ErrorReport]', JSON.stringify(logData, null, 2));
  } else {
    // In production, log in structured format for ingestion
    console.error(JSON.stringify(logData));
  }

  // Forward to external service asynchronously (fire and forget)
  // Don't block the response on external service latency
  forwardToExternalService(entry).catch((err) => {
    console.error('[Error forwarding to external service]', err);
  });
}

/**
 * POST handler
 */
export async function action({request, context}: Route.ActionArgs) {
  // Only accept POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({error: 'Method Not Allowed'}), {
      status: 405,
      headers: {'Content-Type': 'application/json'},
    });
  }

  const clientIP = getClientIP(request);

  // Rate limit by IP
  if (!checkRateLimit(clientIP)) {
    return new Response(JSON.stringify({error: 'Rate Limit Exceeded'}), {
      status: 429,
      headers: {'Content-Type': 'application/json'},
    });
  }

  // M-phase セキュリティ: Content-Length 上限 (100KB)
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > 100_000) {
    return new Response(JSON.stringify({error: 'Payload Too Large'}), {
      status: 413,
      headers: {'Content-Type': 'application/json'},
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({error: 'Invalid JSON'}), {
      status: 400,
      headers: {'Content-Type': 'application/json'},
    });
  }

  // Zodバリデーション
  const validation = ErrorReportSchema.safeParse(body);
  if (!validation.success) {
    return new Response(JSON.stringify({
      error: '入力値が無効です',
      details: validation.error.errors.map(e => e.message),
    }), {
      status: 400,
      headers: {'Content-Type': 'application/json'},
    });
  }

  // M-phase セキュリティ: 1リクエスト50件まで（スキーマで既に制限済み）
  const cappedReports = validation.data;

  // IM-05: trace-idを抽出して各エラーレポートに付与
  const traceId = extractTraceId(request);

  // Log each error report
  for (const report of cappedReports) {
    const entry: ErrorLogEntry = {
      timestamp: report.timestamp,
      message: report.message,
      stack: report.stack,
      url: report.url,
      userAgent: report.userAgent,
      ip: clientIP,
      context: report.context,
      traceId, // IM-05: 分散トレース相関ID
    };

    logError(entry);
  }

  // Always return 200 OK to client (we don't want to fail the client)
  // IM-05: trace-idを応答ヘッダーに含めてクライアント側と相関
  return new Response(JSON.stringify({success: true, traceId}), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Trace-Id': traceId, // IM-05: クライアント側で取得可能に
    },
  });
}

/**
 * Optional: GET handler for health check
 */
export async function loader({request}: Route.LoaderArgs) {
  return new Response(JSON.stringify({error: 'Method Not Allowed'}), {
    status: 405,
    headers: {'Content-Type': 'application/json'},
  });
}
