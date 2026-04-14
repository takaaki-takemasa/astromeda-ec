import type {Route} from './+types/api.$version.[graphql.json]';
import {
  validateGraphQLRequest,
  sanitizeHeaders,
  graphqlErrorResponse,
} from '~/lib/graphql-guard';

/**
 * GraphQL Proxy — Shopify Storefront API への安全な中継
 *
 * 医学メタファー: 血液脳関門（BBB）
 * 全てのリクエストを検証してからAPIに転送する。
 * 未検証のリクエストが直接APIに到達することを防ぐ。
 *
 * 防御:
 * - ヘッダーホワイトリスト（Cookie/Authorization等を除去）
 * - クエリ深度制限（DoS防止）
 * - イントロスペクション遮断（スキーマ探索防止）
 * - ミューテーション遮断（読み取り専用プロキシ）
 * - ボディサイズ制限（100KB上限）
 * - フェッチタイムアウト（10秒）
 */
export async function action({params, context, request}: Route.ActionArgs) {
  // リクエストボディを読み取り
  const body = await request.text();

  // GraphQLガードによる検証
  const validation = validateGraphQLRequest(body);
  if (!validation.allowed) {
    return graphqlErrorResponse(
      validation.error ?? 'Request blocked',
      validation.status ?? 400,
    );
  }

  // 安全なヘッダーのみ転送（Cookie, Authorization等を除去）
  const safeHeaders = sanitizeHeaders(request.headers);

  // タイムアウト付きフェッチ（10秒）
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(
      `https://${context.env.PUBLIC_CHECKOUT_DOMAIN}/api/${params.version}/graphql.json`,
      {
        method: 'POST',
        body,
        headers: safeHeaders,
        signal: controller.signal,
      },
    );

    // レスポンスヘッダーもフィルタリング（Set-Cookie等を除去）
    const responseHeaders = new Headers();
    const safeResponseHeaders = ['content-type', 'content-length', 'cache-control'];
    for (const name of safeResponseHeaders) {
      const value = response.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return graphqlErrorResponse('Upstream API timeout', 504);
    }
    return graphqlErrorResponse('Upstream API error', 502);
  } finally {
    clearTimeout(timeoutId);
  }
}
