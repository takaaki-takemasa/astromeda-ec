/**
 * CORS Utility — 免疫系（オリジン検証の一元化）
 *
 * HT-06修正:
 * - Vary: Origin ヘッダー追加（CDNが異なるOriginを同一レスポンスでキャッシュしないように）
 * - ALLOWED_ORIGINS をenv変数から読み込み可能に（デプロイ環境切替対応）
 */

/** デフォルト許可オリジンリスト（Shopify本番 + ステージング） */
const DEFAULT_ALLOWED_ORIGINS = [
  'https://shop.mining-base.co.jp',
  'https://staging-mining-base.myshopify.com',
] as const;

/**
 * HT-06: 許可オリジンリストを取得
 * env.ALLOWED_ORIGINS が設定されていればカンマ区切りでパース、
 * 未設定ならデフォルトリストを使用。
 */
let _cachedAllowedOrigins: string[] | null = null;

export function getAllowedOrigins(env?: Record<string, unknown>): string[] {
  if (_cachedAllowedOrigins) return _cachedAllowedOrigins;

  const envOrigins = env?.ALLOWED_ORIGINS as string | undefined;
  if (envOrigins) {
    _cachedAllowedOrigins = envOrigins.split(',').map((o) => o.trim()).filter(Boolean);
  } else {
    _cachedAllowedOrigins = [...DEFAULT_ALLOWED_ORIGINS];
  }

  return _cachedAllowedOrigins;
}

/** テスト用: キャッシュリセット */
export function resetAllowedOriginsCache(): void {
  _cachedAllowedOrigins = null;
}

/**
 * CORSヘッダーを生成
 *
 * HT-06: Vary: Originヘッダーを必ず付与。
 * CDNがOriginヘッダーの値ごとにレスポンスを分けてキャッシュするようにする。
 * これがないと、Origin Aへの応答がOrigin Bにもキャッシュから返され、
 * ブラウザのCORSチェックで拒否される。
 */
export function getCorsHeaders(
  request: Request,
  options: {
    methods?: string;
    credentials?: boolean;
    maxAge?: number;
    env?: Record<string, unknown>;
  } = {},
): Record<string, string> {
  const {
    methods = 'GET, POST, OPTIONS',
    credentials = false,
    maxAge = 86400,
    env,
  } = options;

  const allowedOrigins = getAllowedOrigins(env);
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin = allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0] || '';

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Max-Age': String(maxAge),
    // HT-06: Vary: Origin — CDNキャッシュが異なるOriginを混同しない
    'Vary': 'Origin',
  };

  if (credentials) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return headers;
}

/**
 * OPTIONS プリフライトレスポンスを生成
 */
export function handlePreflight(
  request: Request,
  options?: Parameters<typeof getCorsHeaders>[1],
): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, options),
  });
}
