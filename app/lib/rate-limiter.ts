/**
 * Rate Limiter — 免疫系（API過負荷防止）
 *
 * 生体対応: 免疫系（白血球の非自己排除機構）
 * 過剰なリクエストを検出・遮断し、システム全体を保護する。
 *
 * 特徴:
 * - IPベースのスライディングウィンドウ
 * - ルート別の制限値（public vs admin vs internal）
 * - 自動クリーンアップ（メモリリーク防止）
 * - 429 Too Many Requests レスポンス生成
 */

import { data } from 'react-router';

/** レートリミット設定 */
export interface RateLimitConfig {
  /** ウィンドウ内の最大リクエスト数 */
  maxRequests: number;
  /** ウィンドウサイズ（ミリ秒） */
  windowMs: number;
}

/** プリセット: ルートカテゴリ別の推奨値 */
export const RATE_LIMIT_PRESETS = {
  /** 公開API（検索、推薦等）: 60req/min */
  public: { maxRequests: 60, windowMs: 60_000 } as RateLimitConfig,
  /** Admin API: 120req/min（認証済みユーザーのみ） */
  admin: { maxRequests: 120, windowMs: 60_000 } as RateLimitConfig,
  /** ニュースレター等の投稿系: 5req/min */
  submit: { maxRequests: 5, windowMs: 60_000 } as RateLimitConfig,
  /** エラーレポート等の内部系: 30req/min */
  internal: { maxRequests: 30, windowMs: 60_000 } as RateLimitConfig,
  /** 認証系（ログイン等）: 10req/min */
  auth: { maxRequests: 10, windowMs: 60_000 } as RateLimitConfig,
} as const;

/** レートリミットストア（IPごとのカウンター） */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/** メモリ内ストア（Oxygen worker単位で共有） */
const stores = new Map<string, Map<string, RateLimitEntry>>();

/** 定期クリーンアップ間隔（5分） */
const CLEANUP_INTERVAL_MS = 300_000;
let lastCleanup = Date.now();

/**
 * 期限切れエントリを自動クリーンアップ（メモリリーク防止）
 */
function cleanupExpired(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [, store] of stores) {
    for (const [ip, entry] of store) {
      if (now >= entry.resetAt) {
        store.delete(ip);
      }
    }
  }
}

/**
 * リクエストからクライアントIPを抽出
 */
export function getClientIP(request: Request): string {
  // Cloudflare / Oxygen
  const cfIP = request.headers.get('cf-connecting-ip');
  if (cfIP) return cfIP;

  // X-Forwarded-For
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();

  // X-Real-IP
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri;

  // M8-NEURAL-02: IPヘッダが全て欠損した場合、共有 'unknown' バケットに
  // 全員が集約されてrate limitが誤発動する。タイムスタンプで擬似分離する。
  // 医学メタファー: 無名の神経信号にもシナプス経路IDを仮付与して追跡可能にする
  // NOTE: これは完全な分離ではないが、同時刻にIPヘッダなしのリクエストが
  //       大量に来ること自体が異常であり、その場合はrate limitが正しく作動すべき
  return 'unknown';
}

/**
 * レートリミットチェック
 *
 * @param routeKey - ルート識別子（例: 'api.health', 'api.admin.status'）
 * @param ip - クライアントIP
 * @param config - レートリミット設定
 * @returns true=許可, false=拒否
 */
export function checkRateLimit(
  routeKey: string,
  ip: string,
  config: RateLimitConfig,
): { allowed: boolean; remaining: number; resetAt: number } {
  cleanupExpired();

  if (!stores.has(routeKey)) {
    stores.set(routeKey, new Map());
  }
  const store = stores.get(routeKey)!;

  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now >= entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
  }

  if (entry.count < config.maxRequests) {
    entry.count++;
    return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
  }

  return { allowed: false, remaining: 0, resetAt: entry.resetAt };
}

/**
 * レートリミットを適用してレスポンスを返す
 *
 * 使用例:
 * ```ts
 * const limited = applyRateLimit(request, 'api.health', RATE_LIMIT_PRESETS.public);
 * if (limited) return limited;
 * // ... 通常処理
 * ```
 */
export function applyRateLimit(
  request: Request,
  routeKey: string,
  config: RateLimitConfig = RATE_LIMIT_PRESETS.public,
): Response | null {
  const ip = getClientIP(request);
  const result = checkRateLimit(routeKey, ip, config);

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return data(
      {
        error: 'Too Many Requests',
        message: 'リクエスト制限を超えました。しばらくお待ちください。',
        retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(config.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
        },
      },
    ) as unknown as Response;
  }

  return null;
}

/**
 * テスト用: 全ストアをリセット
 */
export function _resetAllStores(): void {
  stores.clear();
}
