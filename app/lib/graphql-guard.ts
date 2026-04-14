/**
 * GraphQL Guard — 血液脳関門（Blood-Brain Barrier）
 *
 * 医学メタファー: 血液脳関門
 * 脳（Shopify Storefront API）に到達する血液（リクエスト）を厳密にフィルタリング。
 * 有害物質（悪意あるクエリ）を遮断し、必要な栄養素（正当なデータ取得）だけを通す。
 *
 * 防御レイヤー:
 * 1. ヘッダーホワイトリスト — 不要なヘッダー（Cookie, Authorization等）を除去
 * 2. クエリ深度制限 — ネストされた再帰クエリによるDoS防止
 * 3. イントロスペクション遮断 — スキーマ探索の防止
 * 4. ボディサイズ制限 — 巨大ペイロード送信の防止
 */

import {AppError} from '~/lib/app-error';

/** プロキシに転送を許可するヘッダー（小文字） */
const ALLOWED_HEADERS = new Set([
  'content-type',
  'accept',
  'accept-language',
  'x-shopify-storefront-access-token',
]);

/** GraphQL ボディの最大サイズ (bytes) */
const MAX_BODY_SIZE = 100_000; // 100KB

/** クエリの最大深度 */
const MAX_QUERY_DEPTH = 10;

/** イントロスペクションで使われるフィールド名 */
const INTROSPECTION_FIELDS = ['__schema', '__type'];

export interface GraphQLGuardResult {
  allowed: boolean;
  error?: string;
  status?: number;
}

/**
 * GraphQL リクエストを検証
 */
export function validateGraphQLRequest(
  body: string | null,
): GraphQLGuardResult {
  if (!body) {
    return { allowed: false, error: 'Empty request body', status: 400 };
  }

  // サイズ制限チェック
  const bodySize = new TextEncoder().encode(body).byteLength;
  if (bodySize > MAX_BODY_SIZE) {
    return { allowed: false, error: 'Request body too large', status: 413 };
  }

  // JSON パース
  let parsed: { query?: string; mutation?: string; operationName?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    return { allowed: false, error: 'Invalid JSON', status: 400 };
  }

  const query = parsed.query || parsed.mutation || '';

  // イントロスペクション遮断
  for (const field of INTROSPECTION_FIELDS) {
    if (query.includes(field)) {
      return {
        allowed: false,
        error: 'Introspection queries are not allowed',
        status: 403,
      };
    }
  }

  // ミューテーション遮断（Storefrontプロキシ経由のミューテーションは原則禁止）
  if (parsed.mutation || /^\s*mutation\s/i.test(query)) {
    return {
      allowed: false,
      error: 'Mutations are not allowed through the proxy',
      status: 403,
    };
  }

  // 深度チェック
  const depth = measureQueryDepth(query);
  if (depth > MAX_QUERY_DEPTH) {
    return {
      allowed: false,
      error: `Query depth ${depth} exceeds maximum ${MAX_QUERY_DEPTH}`,
      status: 400,
    };
  }

  return { allowed: true };
}

/**
 * 安全なヘッダーのみを抽出（不要なヘッダーを除去）
 */
export function sanitizeHeaders(requestHeaders: Headers): Headers {
  const safe = new Headers();
  for (const [name, value] of requestHeaders.entries()) {
    if (ALLOWED_HEADERS.has(name.toLowerCase())) {
      safe.set(name, value);
    }
  }
  return safe;
}

/**
 * GraphQL クエリの深度を測定
 */
function measureQueryDepth(query: string): number {
  let maxDepth = 0;
  let currentDepth = 0;
  let inString = false;
  let escapeNext = false;

  for (const char of query) {
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') {
      currentDepth++;
      if (currentDepth > maxDepth) maxDepth = currentDepth;
    } else if (char === '}') {
      currentDepth--;
    }
  }

  return maxDepth;
}

/** クエリの最大文字数 */
const MAX_QUERY_LENGTH = 10_000;

/** 変数JSONの最大バイト数 */
const MAX_VARIABLES_SIZE = 5_000;

export interface GraphQLQueryResult {
  valid: boolean;
  error?: string;
  sanitizedVariables?: Record<string, unknown>;
}

/**
 * GraphQL クエリ文字列を直接検証（safeQuery / storefront-client 用）
 *
 * validateGraphQLRequest はHTTPリクエストボディ（JSON文字列）を検証するが、
 * こちらはクエリ文字列を直接検証する。Storefront APIクライアント経由の
 * 内部呼び出しで使用。
 */
export function validateGraphQLQuery(
  query: string,
  variables?: Record<string, unknown>,
): GraphQLQueryResult {
  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'クエリが空です' };
  }

  // クエリ長制限
  if (query.length > MAX_QUERY_LENGTH) {
    return { valid: false, error: 'クエリが長すぎます（上限: 10,000文字）' };
  }

  // イントロスペクション遮断
  for (const field of INTROSPECTION_FIELDS) {
    if (query.includes(field)) {
      return { valid: false, error: `禁止されたクエリパターン: ${field}` };
    }
  }

  // ミューテーション遮断
  if (/^\s*mutation[\s({]/im.test(query) || /\bmutation\s*\{/i.test(query)) {
    return { valid: false, error: '許可されていないオペレーション: mutation' };
  }

  // サブスクリプション遮断
  if (/^\s*subscription[\s({]/im.test(query) || /\bsubscription\s*\{/i.test(query)) {
    return { valid: false, error: '許可されていないオペレーション: subscription' };
  }

  // 深度チェック
  const depth = measureQueryDepth(query);
  if (depth > MAX_QUERY_DEPTH) {
    return { valid: false, error: `深度が制限を超えています（${depth} > ${MAX_QUERY_DEPTH}）` };
  }

  // 変数検証・サニタイズ
  let sanitizedVariables: Record<string, unknown> | undefined;
  if (variables) {
    const serialized = JSON.stringify(variables);
    if (new TextEncoder().encode(serialized).byteLength > MAX_VARIABLES_SIZE) {
      return { valid: false, error: '変数が長すぎます（上限: 5,000バイト）' };
    }
    sanitizedVariables = sanitizeVariables(variables) as Record<string, unknown>;
  }

  return { valid: true, sanitizedVariables };
}

/**
 * assertValidGraphQL — throw版バリデーション
 * 不正なクエリの場合 AppError (400, VALIDATION) をthrow
 */
export function assertValidGraphQL(
  query: string,
  variables?: Record<string, unknown>,
): void {
  const result = validateGraphQLQuery(query, variables);
  if (!result.valid) {
    // AppError を動的import回避のために直接構築
    throw new AppError({
      title: 'GraphQLバリデーションエラー',
      status: 400,
      detail: result.error ?? 'GraphQLクエリの検証に失敗しました',
      category: 'VALIDATION',
      context: { source: 'graphql-guard' },
    });
  }
}

/**
 * 変数オブジェクトから __で始まるキーを再帰的に除去
 */
function sanitizeVariables(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeVariables);
  }
  if (obj !== null && typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (!key.startsWith('__')) {
        sanitized[key] = sanitizeVariables(value);
      }
    }
    return sanitized;
  }
  return obj;
}

/**
 * GraphQL エラーレスポンスを生成（RFC 7807 互換）
 */
export function graphqlErrorResponse(error: string, status: number): Response {
  return Response.json(
    {
      type: '/errors/graphql-guard',
      title: 'GraphQL Request Blocked',
      status,
      detail: error,
      timestamp: new Date().toISOString(),
    },
    {
      status,
      headers: {
        'Content-Type': 'application/problem+json',
        'Cache-Control': 'no-store',
      },
    },
  );
}
