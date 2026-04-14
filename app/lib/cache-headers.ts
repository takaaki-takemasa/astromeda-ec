/**
 * キャッシュヘッダー制御ユーティリティ
 *
 * 医学メタファー: 代謝効率（ATP効率）
 * 無駄なリクエストを削減し、ネットワーク効率を最大化する。
 * CDN (Cloudflare/Oxygen) + ブラウザキャッシュの2層構造。
 *
 * Oxygen/Cloudflare CDNは Cache-Control ヘッダーを尊重。
 * s-maxage = CDNキャッシュ時間、max-age = ブラウザキャッシュ時間。
 * stale-while-revalidate で古いキャッシュを返しつつバックグラウンド更新。
 */

/** キャッシュプロファイル定義 */
interface CacheProfile {
  /** Cache-Control ヘッダー値 */
  cacheControl: string;
  /** Vary ヘッダー（必要な場合） */
  vary?: string;
}

/**
 * ページ種別ごとのキャッシュ戦略
 *
 * 静的ページ: 長期キャッシュ（24h CDN, 1h ブラウザ）
 * 商品ページ: 中期（10min CDN + stale-while-revalidate 1h）
 * カートAPI: no-store（常に最新）
 * 管理画面: no-store（常に最新）
 */
export const CACHE_PROFILES = {
  /** トップページ、コレクション一覧等 — CDN 5分 + 1時間バックグラウンド更新 */
  page: {
    cacheControl: 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
    vary: 'Accept-Encoding',
  },
  /** 商品ページ — CDN 10分 + 1時間バックグラウンド更新 */
  product: {
    cacheControl: 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600',
    vary: 'Accept-Encoding',
  },
  /** 静的コンテンツ（FAQ、ガイド等）— CDN 24時間 */
  static: {
    cacheControl: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
    vary: 'Accept-Encoding',
  },
  /** API（カート等）— キャッシュなし */
  noCache: {
    cacheControl: 'no-store, no-cache, must-revalidate',
  },
  /** 管理画面 — キャッシュなし + private */
  admin: {
    cacheControl: 'private, no-store, no-cache, must-revalidate',
  },
  /** Webhook — キャッシュなし */
  webhook: {
    cacheControl: 'no-store',
  },
} as const;

export type CacheProfileName = keyof typeof CACHE_PROFILES;

/**
 * レスポンスヘッダーにキャッシュプロファイルを適用
 */
export function applyCacheHeaders(
  headers: Headers,
  profile: CacheProfileName | CacheProfile,
): Headers {
  const p: CacheProfile = typeof profile === 'string' ? CACHE_PROFILES[profile] : profile;
  headers.set('Cache-Control', p.cacheControl);
  if (p.vary) headers.set('Vary', p.vary);
  return headers;
}

/**
 * ルートのheaders関数で使うためのヘルパー
 *
 * React Router v7のRoute.HeadersFunction向け:
 * ```tsx
 * export const headers = cacheHeaders('page');
 * ```
 */
export function cacheHeaders(profile: CacheProfileName) {
  return () => {
    const p: CacheProfile = CACHE_PROFILES[profile];
    const headers: Record<string, string> = {
      'Cache-Control': p.cacheControl,
    };
    if (p.vary) headers['Vary'] = p.vary;
    return headers;
  };
}

/**
 * Shopify CDN画像URLに最適化パラメータを付与
 *
 * @param url - Shopify CDN URL
 * @param width - 表示幅（px）
 * @param quality - 品質（1-100、デフォルト: 75）
 */
export function optimizeImageUrl(
  url: string,
  width: number,
  quality = 75,
): string {
  if (!url) return '';
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}width=${width}&format=webp&quality=${quality}`;
}

/**
 * srcset用の複数サイズURL生成
 *
 * @param url - ベースURL
 * @param widths - 幅の配列（デフォルト: [320, 640, 960, 1280, 1920]）
 * @param quality - 品質（1-100、デフォルト: 75）
 */
export function generateSrcSet(
  url: string,
  widths = [320, 640, 960, 1280, 1920],
  quality = 75,
): string {
  return widths
    .map((w) => `${optimizeImageUrl(url, w, quality)} ${w}w`)
    .join(', ');
}

/**
 * Critical CSS用のプリロードリンクタグ生成（React metaで使用）
 */
export function preloadImage(url: string, width: number): {
  tagName: 'link';
  rel: 'preload';
  as: 'image';
  href: string;
  fetchpriority: 'high';
} {
  return {
    tagName: 'link',
    rel: 'preload',
    as: 'image',
    href: optimizeImageUrl(url, width),
    fetchpriority: 'high',
  };
}
