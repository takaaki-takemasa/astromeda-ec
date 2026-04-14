/**
 * API Middleware — リクエスト検証層（統合免疫応答）
 *
 * 医学的メタファー: 統合免疫応答（Integrated Immune Response）
 * - CSRF検証：獲得免疫（T細胞）
 * - レート制限：自然免疫（物理バリア）
 * - 認証：MHC自己認識
 * - バリデーション：受容体シグナリング
 *
 * 用途:
 * 複数のセキュリティチェックを組み合わせたミドルウェアを提供する。
 * - withCSRF: X-CSRF-Token ヘッダを検証
 * - withRateLimit: レート制限を適用
 * - withAuth: Admin認証を確認
 * - withValidation: Zodスキーマで入力をバリデート
 */

import { data as routerData } from 'react-router';
import { createLogger } from './logger.js';
import { validateCSRFToken } from './csrf-guard.js';
import { getRateLimiter, getClientIP } from './rate-limiter.js';
import type { ZodSchema } from 'zod';

const log = createLogger('api-middleware');

/**
 * 標準API エラーレスポンス形式
 */
export interface APIError {
  error: true;
  code: string; // e.g. "CSRF_INVALID", "RATE_LIMITED", "UNAUTHORIZED"
  message: string;
  details?: unknown;
}

export interface APISuccess<T = unknown> {
  error: false;
  data?: T;
}

/**
 * API レスポンスを標準形式で返す
 *
 * 常に Response オブジェクトを返す。
 * React Router ルートハンドラ内では routerData() をラップしているため互換性あり。
 */
export function apiError(code: string, message: string, status: number = 400, details?: unknown): Response {
  const payload = { error: true, code, message, details };
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function apiSuccess<T>(payload: T, status: number = 200): Response {
  const responsePayload = { error: false, data: payload };
  return new Response(JSON.stringify(responsePayload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * セッションIDを抽出（CSRF検証用）
 */
async function getSessionId(request: Request, env: Env): Promise<string | undefined> {
  if (!env.SESSION_SECRET) return undefined;

  try {
    const { AppSession } = await import('../../lib/session.js');
    const session = await AppSession.init(request, [env.SESSION_SECRET]);
    return session.get('sessionId') as string | undefined;
  } catch {
    return undefined;
  }
}

/**
 * withCSRF ミドルウェア
 *
 * X-CSRF-Token ヘッダから CSRF トークンを取得し、セッション付きで検証。
 * GET/HEAD リクエストはスキップ（冪等操作）。
 *
 * 失敗: 403 Forbidden
 */
export function withCSRF<T extends { request: Request; context: any }>(
  handler: (args: T) => Promise<Response>,
): (args: T) => Promise<Response> {
  return async (args: T) => {
    const { request, context } = args;
    const env = context.env as Env;

    // GET/HEAD は CSRF 不要（冪等操作）
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
      return handler(args);
    }

    try {
      const token = request.headers.get('X-CSRF-Token');
      const sessionId = await getSessionId(request, env);
      const secret = env.ADMIN_PASSWORD || env.SESSION_SECRET;

      if (!secret) {
        log.warn('CSRF check skipped', { reason: 'no secret configured' });
        return handler(args);
      }

      if (!sessionId) {
        log.warn('CSRF validation failed', { reason: 'no session id' });
        return apiError('CSRF_NO_SESSION', 'セッションが見つかりません', 401);
      }

      const isValid = await validateCSRFToken(token, sessionId, secret);
      if (!isValid) {
        log.warn('CSRF validation failed', { sessionId, hasToken: !!token });
        return apiError('CSRF_INVALID', 'CSRFトークンが無効です', 403);
      }

      return handler(args);
    } catch (error) {
      log.error('CSRF middleware error', { error: String(error) });
      return apiError('CSRF_ERROR', 'CSRF検証エラーが発生しました', 500);
    }
  };
}

/**
 * withRateLimit ミドルウェア
 *
 * クライアント IP をキーにしてレート制限を適用。
 *
 * 失敗: 429 Too Many Requests
 */
export function withRateLimit<T extends { request: Request; context: any }>(
  handler: (args: T) => Promise<Response>,
  profile: 'login' | 'api' | 'approval' = 'api',
): (args: T) => Promise<Response> {
  return async (args: T) => {
    const { request, context } = args;
    const clientIP = getClientIP(request);
    const limiter = getRateLimiter(profile);

    const result = limiter.check(clientIP);
    if (!result.allowed) {
      log.warn('Rate limit exceeded', {
        ip: clientIP,
        profile,
        remaining: result.remaining,
        retryAfterMs: result.retryAfterMs,
        totalAttempts: result.totalAttempts,
      });

      return new Response(
        JSON.stringify({
          error: true,
          code: 'RATE_LIMITED',
          message: 'リクエスト数が多すぎます。しばらく待ってから再度お試しください。',
          retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)),
          },
        },
      );
    }

    return handler(args);
  };
}

/**
 * withAuth ミドルウェア
 *
 * Admin 認証（セッション Cookie または Basic Auth）を確認。
 *
 * 失敗: 401 Unauthorized
 */
export function withAuth<T extends { request: Request; context: any }>(
  handler: (args: T) => Promise<Response>,
): (args: T) => Promise<Response> {
  return async (args: T) => {
    const { request, context } = args;
    const env = context.env as Env;

    // Dynamic import to avoid circular dependency
    const { verifyAdminAuth } = await import('../../lib/admin-auth.js');
    const auth = await verifyAdminAuth(request, env);
    if (!auth.authenticated) {
      return auth.response;
    }

    return handler(args);
  };
}

/**
 * withValidation ミドルウェア
 *
 * リクエストボディを Zod スキーマで検証。
 * Content-Type: application/json を前提とする。
 *
 * 失敗: 400 Bad Request
 */
export function withValidation<T extends { request: Request; context: any }, SchemaType>(
  handler: (args: T & { body: SchemaType }) => Promise<Response>,
  schema: ZodSchema<SchemaType>,
): (args: T) => Promise<Response> {
  return async (args: T) => {
    const { request, context } = args;

    try {
      const body = await request.json();
      const validation = schema.safeParse(body);

      if (!validation.success) {
        const errors = validation.error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        }));

        log.warn('Validation failed', { errors, fieldCount: errors.length });
        return apiError('VALIDATION_ERROR', '入力値が無効です', 400, { errors });
      }

      return handler({ ...args, body: validation.data });
    } catch (error) {
      if (error instanceof SyntaxError) {
        log.warn('Invalid JSON', { error: error.message });
        return apiError('INVALID_JSON', 'JSONが無効です', 400);
      }

      log.error('Validation middleware error', { error: String(error) });
      return apiError('VALIDATION_ERROR', '検証エラーが発生しました', 500);
    }
  };
}

/**
 * ミドルウェアチェーン用ユーティリティ
 *
 * 複数のミドルウェアを組み合わせる場合に使用。
 * 例: pipe(withAuth, withCSRF, withRateLimit)(handler)
 *
 * 注意: ミドルウェアの順序は重要。
 * 通常は: Auth → CSRF → RateLimit → Validation → Handler
 */
export function pipe<T extends { request: Request; context: any }>(
  ...middlewares: Array<(handler: (args: T) => Promise<Response>) => (args: T) => Promise<Response>>
): (handler: (args: T) => Promise<Response>) => (args: T) => Promise<Response> {
  return (handler: (args: T) => Promise<Response>) => {
    let wrapped = handler;
    // ミドルウェアを逆順で適用（後に追加されたものが外側になる）
    for (let i = middlewares.length - 1; i >= 0; i--) {
      wrapped = middlewares[i](wrapped);
    }
    return wrapped;
  };
}
