/**
 * Storefront API クライアント統合層 — 消化器系
 *
 * D-001: 型安全なStorefront APIクエリラッパー
 *
 * 医学メタファー: 消化器系（Digestive System）
 * 外部データ（Shopify Storefront API）を「消化」して
 * アプリケーションが利用可能な形に変換する。
 *
 * 統合する防御層:
 * 1. GraphQL Guard（心臓弁膜）— クエリ検証
 * 2. Circuit Breaker（免疫系）— 連続障害対応
 * 3. Cache Headers（代謝効率）— キャッシュ最適化
 * 4. Error Recovery（自己治癒力）— リトライ
 * 5. AppError（脳幹）— エラー統一化
 */

import {validateGraphQLQuery} from '~/lib/graphql-guard';
import {storefrontCircuit} from '~/lib/circuit-breaker';
import {withRetry} from '~/lib/error-recovery';
import {AppError} from '~/lib/app-error';

// ━━━ Storefront型 ━━━

export interface StorefrontClient {
  query: <T = unknown>(
    query: string,
    options?: {variables?: Record<string, unknown>; cache?: unknown},
  ) => Promise<T>;
  CacheShort: () => unknown;
  CacheLong: () => unknown;
  CacheNone: () => unknown;
}

export interface SafeQueryOptions {
  /** クエリ変数 */
  variables?: Record<string, unknown>;
  /** キャッシュ戦略（Hydrogen CacheAPI） */
  cache?: unknown;
  /** フォールバック値（失敗時） */
  fallback?: unknown;
  /** ラベル（ログ用） */
  label?: string;
  /** リトライ回数（デフォルト: 1） */
  retries?: number;
  /** GraphQL Guard を適用するか（デフォルト: true） */
  validate?: boolean;
}

// ━━━ 統合クエリ関数 ━━━

/**
 * 全防御層を統合した安全なStorefrontクエリ
 *
 * 実行順序:
 * 1. GraphQL Guard でクエリ検証（注入攻撃防止）
 * 2. Circuit Breaker で障害チェック（連続障害時はフォールバック）
 * 3. withRetry でリトライ付き実行
 * 4. エラー時は AppError に統一化
 *
 * @example
 * const data = await safeQuery(storefront, PRODUCT_QUERY, {
 *   variables: { handle: 'gaming-pc' },
 *   fallback: { product: null },
 *   label: 'ProductQuery',
 * });
 */
export async function safeQuery<T>(
  storefront: StorefrontClient,
  query: string,
  options: SafeQueryOptions = {},
): Promise<T> {
  const {
    variables,
    cache,
    fallback,
    label = 'unknown',
    retries = 1,
    validate = true,
  } = options;

  // 1. GraphQL Guard（心臓弁膜）
  if (validate) {
    const validation = validateGraphQLQuery(query, variables);
    if (!validation.valid) {
      throw AppError.validation(
        validation.error ?? 'GraphQLクエリの検証に失敗しました',
        {source: 'storefront-client', label},
      );
    }
  }

  // 2. Circuit Breaker（免疫系）
  const result = await storefrontCircuit.execute<T>(
    async () => {
      // 3. withRetry（自己治癒力）
      return withRetry<T>(
        () =>
          storefront.query<T>(query, {
            variables,
            cache,
          }),
        {
          retries,
          delayMs: 300,
          onError: (err, attempt) => {
            if (process.env.NODE_ENV === 'development') {
              console.warn(`[StorefrontClient] ${label} attempt ${attempt} failed:`, err);
            }
          },
        },
      );
    },
    fallback as T | undefined,
  );

  if (result === null && fallback === undefined) {
    throw AppError.externalApi(
      `Storefront APIが応答しません（サーキットブレーカーOPEN）`,
      {label, circuitState: storefrontCircuit.getStats().state},
    );
  }

  return result as T;
}

/**
 * 複数クエリの並列実行（Promise.allSettled ベース）
 *
 * 医学メタファー: 多臓器同時検査
 * 1つのクエリが失敗しても他のクエリ結果は取得できる。
 */
export async function safeQueryAll<T extends readonly unknown[]>(
  storefront: StorefrontClient,
  queries: {
    [K in keyof T]: {
      query: string;
      options?: SafeQueryOptions;
    };
  },
): Promise<{
  [K in keyof T]: T[K] | null;
}> {
  const promises = queries.map(({query, options}) =>
    safeQuery<unknown>(storefront, query, {
      ...options,
      fallback: options?.fallback ?? null,
    }).catch(() => null),
  );

  const results = await Promise.all(promises);
  return results as {[K in keyof T]: T[K] | null};
}
