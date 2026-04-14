/**
 * Shopify Webhook 登録自動化ユーティリティ
 *
 * 医学メタファー: 自律神経の配線
 * Shopify Admin APIを使ってWebhookサブスクリプションを自動登録。
 * デプロイ時にこのユーティリティを呼び出すことで、
 * Webhookの登録漏れや設定ミスを防止する。
 *
 * Shopify Admin API GraphQL使用（REST APIは非推奨化進行中）
 */

/** Webhook登録定義 */
interface WebhookDefinition {
  topic: string;
  /** エンドポイントパス（ベースURLからの相対パス） */
  path: string;
}

/** 登録するWebhookの一覧 */
const WEBHOOK_DEFINITIONS: WebhookDefinition[] = [
  // 注文系
  { topic: 'ORDERS_CREATE', path: '/api/webhook/orders' },
  { topic: 'ORDERS_UPDATED', path: '/api/webhook/orders' },
  { topic: 'ORDERS_CANCELLED', path: '/api/webhook/orders' },
  { topic: 'ORDERS_PAID', path: '/api/webhook/orders' },
  // 商品系
  { topic: 'PRODUCTS_CREATE', path: '/api/webhook/products' },
  { topic: 'PRODUCTS_UPDATE', path: '/api/webhook/products' },
  { topic: 'PRODUCTS_DELETE', path: '/api/webhook/products' },
];

/** Webhook登録結果 */
interface WebhookRegistrationResult {
  topic: string;
  callbackUrl: string;
  success: boolean;
  error?: string;
  webhookId?: string;
}

/**
 * 全Webhookを一括登録
 *
 * @param shopDomain - Shopifyストアドメイン（例: production-mining-base.myshopify.com）
 * @param adminAccessToken - Admin APIアクセストークン
 * @param baseUrl - Webhookコールバックのベース URL（例: https://shop.mining-base.co.jp）
 * @param apiVersion - Shopify API バージョン（デフォルト: 2025-04）
 */
export async function registerAllWebhooks(
  shopDomain: string,
  adminAccessToken: string,
  baseUrl: string,
  apiVersion = '2025-04',
): Promise<WebhookRegistrationResult[]> {
  const results: WebhookRegistrationResult[] = [];

  for (const def of WEBHOOK_DEFINITIONS) {
    const callbackUrl = `${baseUrl}${def.path}`;
    const result = await registerWebhook(
      shopDomain,
      adminAccessToken,
      def.topic,
      callbackUrl,
      apiVersion,
    );
    results.push(result);
  }

  return results;
}

/**
 * 単一Webhookを登録（GraphQL Mutation）
 */
async function registerWebhook(
  shopDomain: string,
  adminAccessToken: string,
  topic: string,
  callbackUrl: string,
  apiVersion: string,
): Promise<WebhookRegistrationResult> {
  const endpoint = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;

  const mutation = `
    mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        webhookSubscription {
          id
          topic
          endpoint {
            ... on WebhookHttpEndpoint {
              callbackUrl
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000); // 10s for Shopify Admin API

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': adminAccessToken,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          topic,
          webhookSubscription: {
            callbackUrl,
            format: 'JSON',
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        topic,
        callbackUrl,
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json() as {
      data?: {
        webhookSubscriptionCreate?: {
          webhookSubscription?: { id: string };
          userErrors?: Array<{ field: string[]; message: string }>;
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (data.errors?.length) {
      return {
        topic,
        callbackUrl,
        success: false,
        error: data.errors.map((e) => e.message).join(', '),
      };
    }

    const result = data.data?.webhookSubscriptionCreate;
    if (result?.userErrors?.length) {
      return {
        topic,
        callbackUrl,
        success: false,
        error: result.userErrors.map((e) => e.message).join(', '),
      };
    }

    return {
      topic,
      callbackUrl,
      success: true,
      webhookId: result?.webhookSubscription?.id,
    };
  } catch (err) {
    const errorMsg = err instanceof Error && err.name === 'AbortError'
      ? 'Request timeout'
      : err instanceof Error ? err.message : String(err);
    return {
      topic,
      callbackUrl,
      success: false,
      error: errorMsg,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 登録済みWebhookの一覧を取得（確認用）
 */
export async function listWebhooks(
  shopDomain: string,
  adminAccessToken: string,
  apiVersion = '2025-04',
): Promise<Array<{ id: string; topic: string; callbackUrl: string }>> {
  const endpoint = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;

  const query = `
    {
      webhookSubscriptions(first: 50) {
        edges {
          node {
            id
            topic
            endpoint {
              ... on WebhookHttpEndpoint {
                callbackUrl
              }
            }
          }
        }
      }
    }
  `;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000); // 10s for Shopify Admin API

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': adminAccessToken,
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });

    if (!response.ok) return [];

    const data = await response.json() as {
      data?: {
        webhookSubscriptions?: {
          edges?: Array<{
            node: {
              id: string;
              topic: string;
              endpoint?: { callbackUrl?: string };
            };
          }>;
        };
      };
    };

    return (data.data?.webhookSubscriptions?.edges ?? []).map((edge) => ({
      id: edge.node.id,
      topic: edge.node.topic,
      callbackUrl: edge.node.endpoint?.callbackUrl ?? '',
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Webhook定義のエクスポート（テスト用） */
export function getWebhookDefinitions(): readonly WebhookDefinition[] {
  return WEBHOOK_DEFINITIONS;
}
