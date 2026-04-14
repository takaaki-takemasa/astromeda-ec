/**
 * API Utilities — 血管系（データの流通路）
 *
 * AP-02: Admin GETルートにレート制限適用
 * AP-05: 統一レスポンスエンベロープ
 *
 * 生命医学: 血管は全身にデータ（血液）を運ぶ。
 * レート制限は血管の収縮（過剰な血流を制限）、
 * レスポンスエンベロープは血液の成分表（赤血球=data, 白血球=errors, 血漿=meta）。
 */
import {checkRateLimit, RATE_LIMIT_PRESETS, getClientIP} from '~/lib/rate-limiter';

/**
 * AP-05: 統一レスポンスエンベロープ
 * 全APIレスポンスを統一形式で返す。
 * フロントエンドが一貫したエラーハンドリングを実装できる。
 */
export interface ApiEnvelope<T = unknown> {
  data: T | null;
  meta: {
    timestamp: string;
    traceId?: string;
    page?: number;
    pageSize?: number;
    total?: number;
  };
  errors: ApiError[];
}

export interface ApiError {
  code: string;
  message: string;
  field?: string;
}

/**
 * 成功レスポンスを統一形式で作成
 */
export function apiSuccess<T>(
  payload: T,
  meta?: Partial<ApiEnvelope['meta']>,
): ApiEnvelope<T> {
  return {
    data: payload,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
    errors: [],
  };
}

/**
 * エラーレスポンスを統一形式で作成
 */
export function apiError(
  code: string,
  message: string,
  status: number = 400,
  meta?: Partial<ApiEnvelope['meta']>,
): Response {
  const envelope: ApiEnvelope<null> = {
    data: null,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
    errors: [{code, message}],
  };
  return Response.json(envelope, {status});
}

/**
 * AP-02: adminルート用レート制限チェック
 * リクエストのIPからレート制限を確認し、超過時は429を返す。
 *
 * 使い方:
 * ```ts
 * export async function loader({request}: LoaderFunctionArgs) {
 *   const limited = checkAdminRateLimit(request);
 *   if (limited) return limited;
 *   // ... normal logic
 * }
 * ```
 */
export function checkAdminRateLimit(request: Request, routeKey: string = 'admin'): Response | null {
  const ip = getClientIP(request);
  const result = checkRateLimit(routeKey, ip, RATE_LIMIT_PRESETS.admin);
  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return apiError(
      'RATE_LIMITED',
      `レート制限超過。${retryAfter}秒後に再試行してください。`,
      429,
    );
  }
  return null;
}
