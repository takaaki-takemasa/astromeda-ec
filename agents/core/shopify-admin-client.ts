/**
 * Shopify Admin API Client — 双方向CRUD（臍帯=母体との生命線）
 *
 * 医学メタファー: 臍帯は胎児と母体（Shopify）をつなぐ唯一の生命線。
 * 栄養（商品データ読み取り）と代謝産物（在庫・メタフィールド書き込み）の双方向輸送。
 *
 * 設計:
 * - Shopify Admin API (GraphQL) を使用
 * - レート制限: Shopify GraphQL Cost Based Throttling に準拠
 * - リトライ: 指数バックオフ (1s→2s→4s, max 3回)
 * - 全操作を shopify_sync_log に記録（監査証跡）
 * - Edge互換: fetch() API のみ使用
 */

import { getDB } from '../lib/databases/db-adapter.js';
import type { NewShopifySyncLog } from '../lib/databases/schema.js';

// ─── 型定義 ───

export interface ShopifyAdminConfig {
  shop: string;           // e.g., 'production-mining-base.myshopify.com'
  accessToken: string;    // Admin API access token
  apiVersion?: string;    // e.g., '2025-01'
}

export interface GraphQLResponse<T = Record<string, unknown>> {
  data?: T;
  errors?: Array<{ message: string; locations?: Array<{ line: number; column: number }> }>;
  extensions?: {
    cost: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

interface RateLimitState {
  currentlyAvailable: number;
  maximumAvailable: number;
  restoreRate: number;    // ポイント/秒
  lastUpdatedAt: number;
}

// ─── Shopify Admin Client ───

export class ShopifyAdminClient {
  private config: ShopifyAdminConfig;
  private apiVersion: string;
  private rateLimit: RateLimitState;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS = [1000, 2000, 4000];

  constructor(config: ShopifyAdminConfig) {
    this.config = config;
    this.apiVersion = config.apiVersion || '2025-01';
    this.rateLimit = {
      currentlyAvailable: 1000,
      maximumAvailable: 1000,
      restoreRate: 50,
      lastUpdatedAt: Date.now(),
    };
  }

  /** GraphQL APIエンドポイントURL */
  private get endpoint(): string {
    return `https://${this.config.shop}/admin/api/${this.apiVersion}/graphql.json`;
  }

  /**
   * GraphQLクエリ実行（レート制限・リトライ付き）
   */
  async query<T = Record<string, unknown>>(
    graphqlQuery: string,
    variables?: Record<string, unknown>,
  ): Promise<GraphQLResponse<T>> {
    await this.waitForRateLimit(100); // 最低100ポイント確保

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': this.config.accessToken,
          },
          body: JSON.stringify({ query: graphqlQuery, variables }),
        });

        if (response.status === 429) {
          // レート制限ヒット → 待機してリトライ
          const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10);
          await this.sleep(retryAfter * 1000);
          continue;
        }

        if (!response.ok) {
          throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
        }

        const result = (await response.json()) as GraphQLResponse<T>;

        // レート制限状態を更新
        if (result.extensions?.cost?.throttleStatus) {
          const ts = result.extensions.cost.throttleStatus;
          this.rateLimit = {
            currentlyAvailable: ts.currentlyAvailable,
            maximumAvailable: ts.maximumAvailable,
            restoreRate: ts.restoreRate,
            lastUpdatedAt: Date.now(),
          };
        }

        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.MAX_RETRIES) {
          await this.sleep(this.RETRY_DELAYS[attempt]);
        }
      }
    }

    throw lastError || new Error('Shopify API query failed after all retries');
  }

  /**
   * GraphQLミューテーション実行（書き込み操作）
   */
  async mutate<T = Record<string, unknown>>(
    mutation: string,
    variables?: Record<string, unknown>,
    syncMetadata?: { resourceType: string; resourceId?: string; operation: string },
  ): Promise<GraphQLResponse<T>> {
    const startTime = Date.now();
    const syncId = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const result = await this.query<T>(mutation, variables);
      const durationMs = Date.now() - startTime;

      // 同期ログ記録
      if (syncMetadata) {
        await this.logSync({
          syncId,
          direction: 'write',
          resourceType: syncMetadata.resourceType,
          resourceId: syncMetadata.resourceId,
          operation: syncMetadata.operation,
          status: result.errors ? 'failure' : 'success',
          durationMs,
          errorDetails: result.errors || [],
          rateLimitRemaining: this.rateLimit.currentlyAvailable,
          triggeredBy: 'agent',
        });
      }

      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      if (syncMetadata) {
        await this.logSync({
          syncId,
          direction: 'write',
          resourceType: syncMetadata.resourceType,
          resourceId: syncMetadata.resourceId,
          operation: syncMetadata.operation,
          status: 'failure',
          durationMs,
          errorDetails: [{ message: err instanceof Error ? err.message : String(err) }],
          triggeredBy: 'agent',
        });
      }
      throw err;
    }
  }

  // ─── 商品 CRUD ───

  /**
   * 商品一覧取得（ページネーション付き）
   */
  async getProducts(first = 50, cursor?: string): Promise<GraphQLResponse> {
    const query = `
      query GetProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          edges {
            cursor
            node {
              id
              title
              handle
              status
              totalInventory
              priceRangeV2 { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
              images(first: 5) { edges { node { url altText } } }
              variants(first: 10) { edges { node { id title price inventoryQuantity sku } } }
              metafields(first: 10) { edges { node { namespace key value type } } }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;
    return this.query(query, { first, after: cursor });
  }

  /**
   * 商品メタフィールド更新
   */
  async updateProductMetafields(
    productId: string,
    metafields: Array<{ namespace: string; key: string; value: string; type: string }>,
  ): Promise<GraphQLResponse> {
    const mutation = `
      mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key value }
          userErrors { field message }
        }
      }
    `;
    const input = metafields.map(mf => ({
      ownerId: productId,
      namespace: mf.namespace,
      key: mf.key,
      value: mf.value,
      type: mf.type,
    }));
    return this.mutate(mutation, { metafields: input }, {
      resourceType: 'product',
      resourceId: productId,
      operation: 'update_metafields',
    });
  }

  // ─── 在庫 CRUD ───

  /**
   * 在庫数量調整
   */
  async adjustInventory(
    inventoryItemId: string,
    locationId: string,
    delta: number,
    reason = 'agent_sync',
  ): Promise<GraphQLResponse> {
    const mutation = `
      mutation InventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) {
          inventoryAdjustmentGroup { reason }
          userErrors { field message }
        }
      }
    `;
    return this.mutate(mutation, {
      input: {
        reason,
        name: 'available',
        changes: [{
          inventoryItemId,
          locationId,
          delta,
        }],
      },
    }, {
      resourceType: 'inventory',
      resourceId: inventoryItemId,
      operation: 'adjust',
    });
  }

  // ─── コレクション ───

  /**
   * コレクション一覧取得
   */
  async getCollections(first = 50): Promise<GraphQLResponse> {
    const query = `
      query GetCollections($first: Int!) {
        collections(first: $first) {
          edges {
            node {
              id
              title
              handle
              productsCount { count }
              image { url altText }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;
    return this.query(query, { first });
  }

  // ─── 注文 ───

  /**
   * 最近の注文取得
   */
  async getRecentOrders(first = 20): Promise<GraphQLResponse> {
    const query = `
      query GetRecentOrders($first: Int!) {
        orders(first: $first, reverse: true) {
          edges {
            node {
              id
              name
              totalPriceSet { shopMoney { amount currencyCode } }
              displayFinancialStatus
              displayFulfillmentStatus
              createdAt
              lineItems(first: 5) { edges { node { title quantity } } }
            }
          }
        }
      }
    `;
    return this.query(query, { first });
  }

  // ─── Webhook管理 ───

  /**
   * Webhook登録
   */
  async registerWebhook(
    topic: string,
    callbackUrl: string,
  ): Promise<GraphQLResponse> {
    const mutation = `
      mutation WebhookCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
          webhookSubscription { id topic endpoint { ... on WebhookHttpEndpoint { callbackUrl } } }
          userErrors { field message }
        }
      }
    `;
    return this.mutate(mutation, {
      topic,
      webhookSubscription: {
        callbackUrl,
        format: 'JSON',
      },
    }, {
      resourceType: 'webhook',
      operation: 'create',
    });
  }

  // ─── レート制限・ユーティリティ ───

  /**
   * レート制限に基づいて待機
   */
  private async waitForRateLimit(requiredPoints: number): Promise<void> {
    const now = Date.now();
    const elapsed = (now - this.rateLimit.lastUpdatedAt) / 1000;
    const restored = Math.min(
      this.rateLimit.maximumAvailable,
      this.rateLimit.currentlyAvailable + elapsed * this.rateLimit.restoreRate,
    );

    if (restored < requiredPoints) {
      const waitSeconds = (requiredPoints - restored) / this.rateLimit.restoreRate;
      await this.sleep(waitSeconds * 1000);
    }
  }

  /** 現在のレート制限状態 */
  getRateLimitStatus(): RateLimitState {
    return { ...this.rateLimit };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** 同期ログをDB記録 */
  private async logSync(log: Omit<NewShopifySyncLog, 'id'>): Promise<void> {
    try {
      const db = getDB();
      await db.shopifySyncLog.create(log as any);
    } catch {
      // DB未初期化時は無視（最低限の耐性）
    }
  }
}

// ─── シングルトン ───

let adminClientInstance: ShopifyAdminClient | null = null;

export function getShopifyAdminClient(config?: ShopifyAdminConfig): ShopifyAdminClient {
  if (!adminClientInstance && config) {
    adminClientInstance = new ShopifyAdminClient(config);
  }
  if (!adminClientInstance) {
    // 環境変数からフォールバック
    adminClientInstance = new ShopifyAdminClient({
      shop: process.env.SHOPIFY_ADMIN_SHOP || 'production-mining-base.myshopify.com',
      accessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '',
      apiVersion: process.env.SHOPIFY_API_VERSION || '2025-01',
    });
  }
  return adminClientInstance;
}

export function resetShopifyAdminClient(): void {
  adminClientInstance = null;
}
