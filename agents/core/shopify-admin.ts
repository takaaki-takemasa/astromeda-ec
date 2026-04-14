/**
 * Shopify Admin API クライアント（感覚器官 — 外界との接続点）
 *
 * 医学的メタファー: 感覚器官（目・耳・鼻）は外界の情報を体内に取り込む。
 * Shopify Admin APIはストアの「本当の」売上・注文・在庫データを取得する唯一の手段。
 *
 * 設計原則:
 * 1. 環境変数駆動 — トークン未設定時はモックデータにフォールバック
 * 2. レート制限対応 — Shopify Admin API は 2req/秒制限
 * 3. GraphQL使用 — REST APIよりも効率的（必要なフィールドのみ取得）
 * 4. エラー耐性 — API障害時もシステムは稼働し続ける
 *
 * 使用トークン: PRIVATE_STOREFRONT_API_TOKEN (shpat_プレフィックス = Admin APIトークン)
 * エンドポイント: https://{store}.myshopify.com/admin/api/2024-10/graphql.json
 */

import { createLogger } from '../core/logger.js';

const log = createLogger('shopify-admin');

// ── 型定義 ──

/** 商品作成/更新用の入力型（管理画面CMS基盤） */
export interface ProductCreateInput {
  title: string;
  descriptionHtml?: string;
  productType?: string;
  vendor?: string;
  tags?: string[];
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  variants?: VariantInput[];
}

/** バリアント作成/更新用の入力型 */
export interface VariantInput {
  id?: string;
  title?: string;
  price: string;
  sku?: string;
  inventoryQuantity?: number;
  options?: string[];
}

/** メタオブジェクトフィールド */
export interface MetaobjectField {
  key: string;
  value: string;
}

/** メタオブジェクト定義のフィールド */
export interface MetaobjectFieldDefinition {
  key: string;
  name: string;
  type: string;
}

export interface ShopifyOrder {
  id: string;
  name: string;
  totalPriceSet: {shopMoney: {amount: string; currencyCode: string}};
  subtotalPriceSet: {shopMoney: {amount: string; currencyCode: string}};
  createdAt: string;
  lineItems: {
    nodes: Array<{
      title: string;
      quantity: number;
      variant?: {id: string; price: string; product?: {id: string; handle: string}};
    }>;
  };
  customer?: {id: string; email?: string};
  tags: string[];
  financialStatus: string;
  fulfillmentStatus: string;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  status: string;
  totalInventory: number;
  description: string;
  descriptionHtml: string;
  seo: {title: string; description: string};
  featuredImage: {url: string; altText: string | null} | null;
  priceRangeV2: {
    minVariantPrice: {amount: string; currencyCode: string};
    maxVariantPrice: {amount: string; currencyCode: string};
  };
  variants: {
    nodes: Array<{
      id: string;
      title: string;
      price: string;
      inventoryQuantity: number;
      sku: string;
    }>;
  };
  productType: string;
  vendor: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderSummary {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  currency: string;
  period: string;
}

export interface ProductSummary {
  totalProducts: number;
  activeProducts: number;
  totalInventory: number;
  avgPrice: number;
}

// ── Admin API クライアント ──

export class ShopifyAdminClient {
  private storeDomain: string;
  private apiToken: string;
  private apiVersion: string;
  private isConfigured: boolean;

  constructor(storeDomain?: string, apiToken?: string) {
    this.storeDomain = storeDomain || '';
    this.apiToken = apiToken || '';
    this.apiVersion = '2025-04';
    this.isConfigured = !!(this.storeDomain && this.apiToken);
  }

  /**
   * 環境変数からクライアントを生成
   * PRIVATE_STOREFRONT_API_TOKEN (shpat_*) はAdmin APIトークンとしても機能
   */
  static fromEnv(): ShopifyAdminClient {
    // Oxygen環境では process.env ではなく、context.env から取得
    // ここではシングルトン初期化時にsetEnvで注入される
    return new ShopifyAdminClient(
      adminEnvCache.storeDomain,
      adminEnvCache.apiToken,
    );
  }

  /** Admin APIが使用可能か */
  get available(): boolean {
    return this.isConfigured;
  }

  /**
   * Admin GraphQL APIにクエリを送信
   */
  async query<T = unknown>(graphql: string, variables?: Record<string, unknown>): Promise<T> {
    if (!this.isConfigured) {
      throw new Error('Shopify Admin API is not configured. Set PRIVATE_STOREFRONT_API_TOKEN and PUBLIC_STORE_DOMAIN.');
    }

    const endpoint = `https://${this.storeDomain}/admin/api/${this.apiVersion}/graphql.json`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.apiToken,
      },
      body: JSON.stringify({query: graphql, variables}),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Shopify Admin API error: ${response.status} ${response.statusText} — ${text.slice(0, 200)}`);
    }

    const json = await response.json() as {data?: T; errors?: Array<{message: string}>};

    if (json.errors?.length) {
      throw new Error(`Shopify Admin GraphQL errors: ${json.errors.map(e => e.message).join(', ')}`);
    }

    return json.data as T;
  }

  // ── 注文データ取得 ──

  /**
   * 最近の注文を取得（日次/週次/月次レポート用）
   */
  async getRecentOrders(first = 50, query?: string): Promise<ShopifyOrder[]> {
    if (!this.isConfigured) return [];

    const gql = `
      query RecentOrders($first: Int!, $query: String) {
        orders(first: $first, sortKey: CREATED_AT, reverse: true, query: $query) {
          nodes {
            id
            name
            totalPriceSet { shopMoney { amount currencyCode } }
            subtotalPriceSet { shopMoney { amount currencyCode } }
            createdAt
            lineItems(first: 10) {
              nodes {
                title
                quantity
                variant { id price product { id handle } }
              }
            }
            customer { id email }
            tags
            financialStatus
            fulfillmentStatus
          }
        }
      }
    `;

    try {
      const data = await this.query<{orders: {nodes: ShopifyOrder[]}}>(gql, {first, query});
      return data.orders?.nodes || [];
    } catch (err) {
      // 感覚神経の鈍麻を防止: エラーをコールバック通知
      this.notifyError('getRecentOrders', err);
      return [];
    }
  }

  /**
   * 注文サマリーを取得（指定期間）
   */
  async getOrderSummary(sinceDaysAgo = 1): Promise<OrderSummary> {
    const since = new Date(Date.now() - sinceDaysAgo * 86400000).toISOString();
    const orders = await this.getRecentOrders(250, `created_at:>='${since}'`);

    let totalRevenue = 0;
    for (const order of orders) {
      totalRevenue += parseFloat(order.totalPriceSet?.shopMoney?.amount || '0');
    }

    return {
      totalOrders: orders.length,
      totalRevenue: Math.round(totalRevenue),
      avgOrderValue: orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0,
      currency: 'JPY',
      period: sinceDaysAgo === 1 ? 'daily' : sinceDaysAgo <= 7 ? 'weekly' : 'monthly',
    };
  }

  // ── 商品データ取得 ──

  /**
   * 商品一覧を取得
   */
  async getProducts(first = 50, query?: string): Promise<ShopifyProduct[]> {
    if (!this.isConfigured) return [];

    const gql = `
      query Products($first: Int!, $query: String) {
        products(first: $first, sortKey: UPDATED_AT, reverse: true, query: $query) {
          nodes {
            id
            title
            handle
            status
            totalInventory
            description
            descriptionHtml
            seo { title description }
            featuredImage { url altText }
            priceRangeV2 {
              minVariantPrice { amount currencyCode }
              maxVariantPrice { amount currencyCode }
            }
            variants(first: 10) {
              nodes { id title price inventoryQuantity sku }
            }
            productType
            vendor
            tags
            createdAt
            updatedAt
          }
        }
      }
    `;

    try {
      const data = await this.query<{products: {nodes: ShopifyProduct[]}}>(gql, {first, query});
      return data.products?.nodes || [];
    } catch (err) {
      this.notifyError('getProducts', err);
      return [];
    }
  }

  /**
   * 商品サマリーを取得
   */
  async getProductSummary(): Promise<ProductSummary> {
    const gql = `
      query ProductCount {
        productsCount { count }
        products(first: 250, query: "status:active") {
          nodes {
            totalInventory
            priceRangeV2 { minVariantPrice { amount } }
          }
        }
      }
    `;

    try {
      const data = await this.query<{
        productsCount: {count: number};
        products: {nodes: Array<{totalInventory: number; priceRangeV2: {minVariantPrice: {amount: string}}}>};
      }>(gql);

      const products = data.products?.nodes || [];
      let totalInventory = 0;
      let totalPrice = 0;

      for (const p of products) {
        totalInventory += p.totalInventory || 0;
        totalPrice += parseFloat(p.priceRangeV2?.minVariantPrice?.amount || '0');
      }

      return {
        totalProducts: data.productsCount?.count || 0,
        activeProducts: products.length,
        totalInventory,
        avgPrice: products.length > 0 ? Math.round(totalPrice / products.length) : 0,
      };
    } catch (err) {
      this.notifyError('getProductSummary', err);
      return {totalProducts: 0, activeProducts: 0, totalInventory: 0, avgPrice: 0};
    }
  }

  // ══════════════════════════════════════════════════════════
  // 書き込みオペレーション（運動神経 — 外界への作用）
  //
  // 医学的メタファー: 感覚神経(GET)で取得した情報をもとに、
  // 運動神経(MUTATION)が外界に作用する。商品の作成・更新・削除は
  // 生体の「効果器」に相当し、ストアの状態を直接変化させる。
  // ══════════════════════════════════════════════════════════

  /**
   * 商品を作成（効果器: 新細胞の生成）
   */
  async createProduct(input: ProductCreateInput): Promise<{id: string; handle: string}> {
    const gql = `
      mutation productCreate($input: ProductInput!) {
        productCreate(product: $input) {
          product { id handle title status }
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        productCreate: {
          product: {id: string; handle: string; title: string; status: string} | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {input});

      const {product, userErrors} = res.productCreate;
      if (userErrors.length > 0) {
        throw new Error(`商品作成失敗: ${userErrors.map(e => e.message).join(', ')}`);
      }
      if (!product) throw new Error('商品作成: レスポンスにproductが含まれません');

      log.info(`[createProduct] Created: ${product.handle} (${product.id})`);
      return {id: product.id, handle: product.handle};
    } catch (err) {
      this.notifyError('createProduct', err);
      throw err;
    }
  }

  /**
   * 商品を更新（効果器: 細胞の分化・変態）
   */
  async updateProduct(id: string, input: Partial<ProductCreateInput>): Promise<{id: string; handle: string}> {
    const gql = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(product: $input) {
          product { id handle title status }
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        productUpdate: {
          product: {id: string; handle: string} | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {input: {id, ...input}});

      const {product, userErrors} = res.productUpdate;
      if (userErrors.length > 0) {
        throw new Error(`商品更新失敗: ${userErrors.map(e => e.message).join(', ')}`);
      }
      if (!product) throw new Error('商品更新: レスポンスにproductが含まれません');

      log.info(`[updateProduct] Updated: ${product.handle} (${product.id})`);
      return {id: product.id, handle: product.handle};
    } catch (err) {
      this.notifyError('updateProduct', err);
      throw err;
    }
  }

  /**
   * 商品を削除（効果器: アポトーシス — 計画的細胞死）
   * 冪等性: 既に削除済みの場合もtrue返却
   */
  async deleteProduct(id: string): Promise<boolean> {
    const gql = `
      mutation productDelete($input: ProductDeleteInput!) {
        productDelete(input: $input) {
          deletedProductId
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        productDelete: {
          deletedProductId: string | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {input: {id}});

      const {userErrors} = res.productDelete;
      if (userErrors.length > 0) {
        // 既に削除済みの場合は冪等性を保つ
        const isAlreadyDeleted = userErrors.some(e =>
          e.message.toLowerCase().includes('not found') ||
          e.message.toLowerCase().includes('does not exist')
        );
        if (isAlreadyDeleted) {
          log.info(`[deleteProduct] Already deleted: ${id}`);
          return true;
        }
        throw new Error(`商品削除失敗: ${userErrors.map(e => e.message).join(', ')}`);
      }

      log.info(`[deleteProduct] Deleted: ${id}`);
      return true;
    } catch (err) {
      this.notifyError('deleteProduct', err);
      throw err;
    }
  }

  /**
   * バリアントを作成（効果器: 細胞の多様化）
   */
  async createVariant(productId: string, input: VariantInput): Promise<{id: string; title: string; price: string}> {
    const gql = `
      mutation productVariantCreate($input: ProductVariantInput!) {
        productVariantCreate(productVariant: $input) {
          productVariant { id title price sku inventoryQuantity }
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        productVariantCreate: {
          productVariant: {id: string; title: string; price: string} | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {input: {productId, ...input}});

      const {productVariant, userErrors} = res.productVariantCreate;
      if (userErrors.length > 0) {
        throw new Error(`バリアント作成失敗: ${userErrors.map(e => e.message).join(', ')}`);
      }
      if (!productVariant) throw new Error('バリアント作成: レスポンスにproductVariantが含まれません');

      log.info(`[createVariant] Created variant: ${productVariant.title} for ${productId}`);
      return productVariant;
    } catch (err) {
      this.notifyError('createVariant', err);
      throw err;
    }
  }

  /**
   * バリアントを更新（効果器: 細胞の形質変化）
   */
  async updateVariant(id: string, input: Partial<VariantInput>): Promise<{id: string; title: string; price: string}> {
    const gql = `
      mutation productVariantUpdate($input: ProductVariantInput!) {
        productVariantUpdate(productVariant: $input) {
          productVariant { id title price sku }
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        productVariantUpdate: {
          productVariant: {id: string; title: string; price: string} | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {input: {id, ...input}});

      const {productVariant, userErrors} = res.productVariantUpdate;
      if (userErrors.length > 0) {
        throw new Error(`バリアント更新失敗: ${userErrors.map(e => e.message).join(', ')}`);
      }
      if (!productVariant) throw new Error('バリアント更新: レスポンスにproductVariantが含まれません');

      log.info(`[updateVariant] Updated variant: ${productVariant.title} (${id})`);
      return productVariant;
    } catch (err) {
      this.notifyError('updateVariant', err);
      throw err;
    }
  }

  // ══════════════════════════════════════════════════════════
  // メタオブジェクトCRUD（幹細胞管理 — 分化可能な設定データ）
  //
  // メタオブジェクトはShopifyの「幹細胞」。CMS設定、カスタマイズ
  // オプション、ホームページ構成など、分化前の設定データを格納する。
  // ══════════════════════════════════════════════════════════

  /**
   * メタオブジェクト定義を作成（幹細胞のDNA設計図）
   */
  async createMetaobjectDefinition(
    type: string,
    name: string,
    fieldDefinitions: MetaobjectFieldDefinition[],
  ): Promise<{id: string}> {
    const gql = `
      mutation metaobjectDefinitionCreate($definition: MetaobjectDefinitionCreateInput!) {
        metaobjectDefinitionCreate(definition: $definition) {
          metaobjectDefinition { id type }
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        metaobjectDefinitionCreate: {
          metaobjectDefinition: {id: string; type: string} | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {
        definition: {
          type,
          name,
          fieldDefinitions: fieldDefinitions.map(f => ({
            key: f.key,
            name: f.name,
            type: f.type,
          })),
          access: {storefront: 'PUBLIC_READ'},
        },
      });

      const {metaobjectDefinition, userErrors} = res.metaobjectDefinitionCreate;
      if (userErrors.length > 0) {
        throw new Error(`メタオブジェクト定義作成失敗: ${userErrors.map(e => e.message).join(', ')}`);
      }
      if (!metaobjectDefinition) throw new Error('メタオブジェクト定義: レスポンスが空');

      log.info(`[createMetaobjectDefinition] Created: ${type} (${metaobjectDefinition.id})`);
      return {id: metaobjectDefinition.id};
    } catch (err) {
      this.notifyError('createMetaobjectDefinition', err);
      throw err;
    }
  }

  /**
   * メタオブジェクトを作成（幹細胞からの分化）
   */
  async createMetaobject(
    type: string,
    handle: string,
    fields: MetaobjectField[],
  ): Promise<{id: string; handle: string}> {
    const gql = `
      mutation metaobjectCreate($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject { id handle }
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        metaobjectCreate: {
          metaobject: {id: string; handle: string} | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {
        metaobject: {type, handle, fields},
      });

      const {metaobject, userErrors} = res.metaobjectCreate;
      if (userErrors.length > 0) {
        throw new Error(`メタオブジェクト作成失敗: ${userErrors.map(e => e.message).join(', ')}`);
      }
      if (!metaobject) throw new Error('メタオブジェクト作成: レスポンスが空');

      log.info(`[createMetaobject] Created: ${type}/${handle} (${metaobject.id})`);
      return metaobject;
    } catch (err) {
      this.notifyError('createMetaobject', err);
      throw err;
    }
  }

  /**
   * メタオブジェクトを更新
   */
  async updateMetaobject(id: string, fields: MetaobjectField[]): Promise<{id: string}> {
    const gql = `
      mutation metaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
        metaobjectUpdate(id: $id, metaobject: $metaobject) {
          metaobject { id }
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        metaobjectUpdate: {
          metaobject: {id: string} | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {id, metaobject: {fields}});

      const {metaobject, userErrors} = res.metaobjectUpdate;
      if (userErrors.length > 0) {
        throw new Error(`メタオブジェクト更新失敗: ${userErrors.map(e => e.message).join(', ')}`);
      }

      log.info(`[updateMetaobject] Updated: ${id}`);
      return {id: metaobject?.id || id};
    } catch (err) {
      this.notifyError('updateMetaobject', err);
      throw err;
    }
  }

  /**
   * メタオブジェクトを削除
   */
  async deleteMetaobject(id: string): Promise<boolean> {
    const gql = `
      mutation metaobjectDelete($id: ID!) {
        metaobjectDelete(id: $id) {
          deletedId
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        metaobjectDelete: {
          deletedId: string | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {id});

      const {userErrors} = res.metaobjectDelete;
      if (userErrors.length > 0) {
        const isGone = userErrors.some(e =>
          e.message.toLowerCase().includes('not found') ||
          e.message.toLowerCase().includes('does not exist')
        );
        if (isGone) return true;
        throw new Error(`メタオブジェクト削除失敗: ${userErrors.map(e => e.message).join(', ')}`);
      }

      log.info(`[deleteMetaobject] Deleted: ${id}`);
      return true;
    } catch (err) {
      this.notifyError('deleteMetaobject', err);
      throw err;
    }
  }

  /**
   * メタオブジェクトを一覧取得（指定typeの全件）
   */
  async getMetaobjects(type: string, first = 50): Promise<Array<{id: string; handle: string; fields: MetaobjectField[]}>> {
    const gql = `
      query getMetaobjects($type: String!, $first: Int!) {
        metaobjects(type: $type, first: $first) {
          nodes {
            id
            handle
            fields { key value }
          }
        }
      }
    `;

    try {
      const res = await this.query<{
        metaobjects: {
          nodes: Array<{id: string; handle: string; fields: Array<{key: string; value: string}>}>;
        };
      }>(gql, {type, first});

      return res.metaobjects?.nodes || [];
    } catch (err) {
      this.notifyError('getMetaobjects', err);
      return [];
    }
  }

  // ── エラー通知（感覚神経の鈍麻防止） ──

  /** エラーコールバック（AgentBusへの橋渡し用） */
  private onErrorCallback?: (method: string, error: unknown) => void;

  /** エラー通知コールバックを設定 */
  setErrorCallback(cb: (method: string, error: unknown) => void): void {
    this.onErrorCallback = cb;
  }

  private notifyError(method: string, error: unknown): void {
    log.warn(`[ShopifyAdmin] ${method} failed:`, error instanceof Error ? error.message : String(error));
    if (this.onErrorCallback) {
      try { this.onErrorCallback(method, error); } catch (err) { log.warn('[ShopifyAdmin] error callback failed:', err instanceof Error ? err.message : err); }
    }
  }
}

// ── 環境変数キャッシュ ──

const adminEnvCache = {
  storeDomain: '',
  apiToken: '',
};

/**
 * Oxygen/Hydrogen のcontext.envからAdmin API設定を注入
 * agent-bridge初期化時に呼び出す
 */
export function setAdminEnv(env: Record<string, string | undefined>): void {
  // PRIVATE_STOREFRONT_API_TOKEN は shpat_ プレフィックスならAdmin APIトークン
  // 優先順位: 正式名 → Storefront(shpat_互換) → フォールバック
  const token = env.SHOPIFY_ADMIN_ACCESS_TOKEN || env.PRIVATE_STOREFRONT_API_TOKEN || env.SHOPIFY_ADMIN_API_TOKEN || '';
  adminEnvCache.apiToken = token;
  adminEnvCache.storeDomain = env.PUBLIC_STORE_DOMAIN || '';
}

// ── シングルトン ──

let clientInstance: ShopifyAdminClient | null = null;

export function getAdminClient(): ShopifyAdminClient {
  if (!clientInstance) {
    clientInstance = ShopifyAdminClient.fromEnv();
  }
  return clientInstance;
}

/**
 * クライアントをリセット（環境変数再読み込み後に使用）
 */
export function resetAdminClient(): void {
  clientInstance = null;
}
