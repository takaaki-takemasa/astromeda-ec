/**
 * エラー回復ユーティリティ
 *
 * 医学メタファー: 自己治癒力（創傷治癒プロセス）
 * 1. 炎症反応（検知）: エラーをキャッチ
 * 2. 肉芽形成（回復）: リトライ or フォールバック
 * 3. 瘢痕形成（学習）: エラーをログして再発防止
 *
 * Oxygen/Workers環境で安全に動作する設計。
 */

/**
 * リトライ付き非同期関数実行
 *
 * @param fn - 実行する非同期関数
 * @param options - リトライ設定
 * @returns 結果、または全リトライ失敗後にフォールバック値
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    /** リトライ回数（デフォルト: 2） */
    retries?: number;
    /** リトライ間隔ms（デフォルト: 500） */
    delayMs?: number;
    /** 指数バックオフ倍率（デフォルト: 2） */
    backoffMultiplier?: number;
    /** フォールバック値（全リトライ失敗時） */
    fallback?: T;
    /** エラーログ関数 */
    onError?: (error: unknown, attempt: number) => void;
  } = {},
): Promise<T> {
  const {
    retries = 2,
    delayMs = 500,
    backoffMultiplier = 2,
    fallback,
    onError,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      onError?.(error, attempt);

      if (attempt < retries) {
        // 指数バックオフで待機（Oxygen 30秒制限に注意）
        const wait = Math.min(delayMs * Math.pow(backoffMultiplier, attempt), 5000);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  if (fallback !== undefined) return fallback;
  throw lastError;
}

/**
 * Storefront APIクエリ用ラッパー（リトライ + フォールバック）
 *
 * 医学メタファー: 自律神経の再試行（心臓の代償機構）
 */
export async function safeStorefrontQuery<T>(
  storefront: { query: (q: string, opts?: {variables?: Record<string, unknown>}) => Promise<T> },
  query: string,
  options?: {
    variables?: Record<string, unknown>;
    fallback?: T;
    label?: string;
  },
): Promise<T | null> {
  return withRetry(
    () => storefront.query(query, options?.variables ? { variables: options.variables } : undefined),
    {
      retries: 1,
      delayMs: 300,
      fallback: (options?.fallback ?? null) as T | null,
      onError: (err, attempt) => {
        process.env.NODE_ENV === 'development' && console.warn(`[StorefrontQuery] ${options?.label ?? 'unknown'} attempt ${attempt} failed:`, err);
      },
    },
  );
}

/**
 * 安全なJSONパース（エラー時にフォールバック）
 */
export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/**
 * Loaderエラーの安全な処理（500ではなくフォールバックを返す）
 *
 * 使い方:
 * ```ts
 * export async function loader(args) {
 *   return safeLoader(args, async ({context}) => {
 *     // loader本体
 *   }, { fallbackData: {} });
 * }
 * ```
 */
export async function safeLoader<T, TContext = unknown>(
  args: { request: Request; context: TContext; params: Record<string, string | undefined> },
  fn: (args: { request: Request; context: TContext; params: Record<string, string | undefined> }) => Promise<T>,
  options?: {
    fallbackData?: T;
    label?: string;
  },
): Promise<T> {
  try {
    return await fn(args);
  } catch (error) {
    process.env.NODE_ENV === 'development' && console.error(`[SafeLoader] ${options?.label ?? 'unknown'} failed:`, error);
    if (options?.fallbackData !== undefined) {
      return options.fallbackData;
    }
    throw error;
  }
}
