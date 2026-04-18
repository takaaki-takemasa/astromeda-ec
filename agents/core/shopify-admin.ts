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
    this.apiVersion = '2025-10';
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
    // 2025-10 API: productCreate は `product: ProductCreateInput!` を取る
    const gql = `
      mutation productCreate($input: ProductCreateInput!) {
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
      mutation productUpdate($input: ProductUpdateInput!) {
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
   * メタオブジェクト定義を更新（既存定義にフィールドを追加）
   * 既に存在するフィールドはスキップし、不足分のみ追加する
   */
  async updateMetaobjectDefinition(
    id: string,
    fieldDefinitionsToAdd: MetaobjectFieldDefinition[],
  ): Promise<{id: string}> {
    const gql = `
      mutation metaobjectDefinitionUpdate($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
        metaobjectDefinitionUpdate(id: $id, definition: $definition) {
          metaobjectDefinition { id type }
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        metaobjectDefinitionUpdate: {
          metaobjectDefinition: {id: string; type: string} | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {
        id,
        definition: {
          fieldDefinitions: fieldDefinitionsToAdd.map(f => ({
            create: {
              key: f.key,
              name: f.name,
              type: f.type,
            },
          })),
        },
      });

      const {metaobjectDefinition, userErrors} = res.metaobjectDefinitionUpdate;
      if (userErrors.length > 0) {
        throw new Error(`メタオブジェクト定義更新失敗: ${userErrors.map(e => e.message).join(', ')}`);
      }

      log.info(`[updateMetaobjectDefinition] Updated: ${id} (+${fieldDefinitionsToAdd.length} fields)`);
      return {id: metaobjectDefinition?.id || id};
    } catch (err) {
      this.notifyError('updateMetaobjectDefinition', err);
      throw err;
    }
  }

  /**
   * メタオブジェクト定義の現在のフィールドを取得
   */
  async getMetaobjectDefinition(type: string): Promise<{id: string; fieldDefinitions: Array<{key: string; name: string}>} | null> {
    const gql = `
      query getMetaobjectDefinitionByType($type: String!) {
        metaobjectDefinitionByType(type: $type) {
          id
          fieldDefinitions {
            key
            name
          }
        }
      }
    `;

    try {
      const res = await this.query<{
        metaobjectDefinitionByType: {
          id: string;
          fieldDefinitions: Array<{key: string; name: string}>;
        } | null;
      }>(gql, {type});

      return res.metaobjectDefinitionByType;
    } catch (err) {
      this.notifyError('getMetaobjectDefinition', err);
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

  // ── 画像アップロード（Staged Uploads + Product Media 作成）──

  /**
   * Staged Upload URLを取得（ブラウザからの直接アップロード用）
   * Shopify CDN にファイルをアップロードするための署名付きURLを発行
   */
  async createStagedUpload(filename: string, mimeType: string, fileSize: number): Promise<{
    url: string;
    resourceUrl: string;
    parameters: Array<{ name: string; value: string }>;
  }> {
    const gql = `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters { name value }
          }
          userErrors { field message }
        }
      }
    `;

    const res = await this.query<{
      stagedUploadsCreate: {
        stagedTargets: Array<{
          url: string;
          resourceUrl: string;
          parameters: Array<{ name: string; value: string }>;
        }>;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(gql, {
      input: [{
        filename,
        mimeType,
        resource: 'IMAGE',
        fileSize: String(fileSize),
        httpMethod: 'POST',
      }],
    });

    const { stagedTargets, userErrors } = res.stagedUploadsCreate;
    if (userErrors.length > 0) {
      throw new Error(`Staged upload 作成失敗: ${userErrors.map(e => e.message).join(', ')}`);
    }
    if (!stagedTargets?.[0]) {
      throw new Error('Staged upload: レスポンスにtargetが含まれません');
    }

    log.info(`[createStagedUpload] Created staged target for: ${filename}`);
    return stagedTargets[0];
  }

  /**
   * 商品にメディア（画像）を追加
   * stagedUploadで取得したresourceUrlを使って商品画像として登録
   */
  async addProductMedia(productId: string, resourceUrl: string, alt?: string): Promise<{
    id: string;
    status: string;
  }> {
    const gql = `
      mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media {
            ... on MediaImage {
              id
              status
              image { url altText }
            }
          }
          mediaUserErrors { field message code }
        }
      }
    `;

    const res = await this.query<{
      productCreateMedia: {
        media: Array<{ id: string; status: string; image?: { url: string; altText: string | null } }>;
        mediaUserErrors: Array<{ field: string[]; message: string; code: string }>;
      };
    }>(gql, {
      productId,
      media: [{
        originalSource: resourceUrl,
        alt: alt || '',
        mediaContentType: 'IMAGE',
      }],
    });

    const { media, mediaUserErrors } = res.productCreateMedia;
    if (mediaUserErrors.length > 0) {
      throw new Error(`商品メディア追加失敗: ${mediaUserErrors.map(e => e.message).join(', ')}`);
    }
    if (!media?.[0]) {
      throw new Error('productCreateMedia: レスポンスにmediaが含まれません');
    }

    log.info(`[addProductMedia] Added media to ${productId}: ${media[0].id}`);
    return { id: media[0].id, status: media[0].status };
  }

  /**
   * ファイル（メタオブジェクト画像等）をShopify Files APIで登録
   * 商品以外の画像（バナー、コレクション画像等）に使用
   */
  async createFileFromStagedUpload(resourceUrl: string, alt?: string): Promise<{
    id: string;
    url: string;
  }> {
    const gql = `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            ... on MediaImage {
              id
              image { url }
            }
            ... on GenericFile {
              id
              url
            }
          }
          userErrors { field message }
        }
      }
    `;

    const res = await this.query<{
      fileCreate: {
        files: Array<{ id: string; image?: { url: string }; url?: string }>;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(gql, {
      files: [{
        originalSource: resourceUrl,
        alt: alt || '',
        contentType: 'IMAGE',
      }],
    });

    const { files, userErrors } = res.fileCreate;
    if (userErrors.length > 0) {
      throw new Error(`ファイル作成失敗: ${userErrors.map(e => e.message).join(', ')}`);
    }
    if (!files?.[0]) {
      throw new Error('fileCreate: レスポンスにfileが含まれません');
    }

    const f = files[0];
    const url = f.image?.url || f.url || '';
    log.info(`[createFileFromStagedUpload] Created file: ${f.id}`);
    return { id: f.id, url };
  }

  // ══════════════════════════════════════════════════════════
  // patch 0008 (2026-04-18): 2025-10 API 整合追加メソッド
  //
  // 2024-07 で productVariantCreate / productVariantUpdate が deprecated 化され、
  // 2025-10 では productVariantsBulkCreate / productVariantsBulkUpdate が
  // 正式 API となった。app/routes/api.admin.products.ts は既にこの新APIを
  // 呼び出すコードが書かれていたが、client 側に実装が無くランタイム ReferenceError
  // になっていた。ここで実装を追加する。
  // ══════════════════════════════════════════════════════════

  /**
   * バリアントを一括更新（2025-10 API）
   * 2024-07 以降の正式 API。productVariantUpdate は deprecated。
   */
  async productVariantsBulkUpdate(
    productId: string,
    variants: Array<{
      id: string;
      price?: string;
      compareAtPrice?: string | null;
      sku?: string;
      barcode?: string | null;
      inventoryPolicy?: 'CONTINUE' | 'DENY';
      taxable?: boolean;
    }>,
  ): Promise<Array<{ id: string; title: string; price: string }>> {
    const gql = `
      mutation productVariantsBulkUpdate(
        $productId: ID!
        $variants: [ProductVariantsBulkInput!]!
      ) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants { id title price sku }
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        productVariantsBulkUpdate: {
          productVariants: Array<{ id: string; title: string; price: string; sku: string | null }>;
          userErrors: Array<{ field: string[]; message: string }>;
        };
      }>(gql, { productId, variants });

      const { productVariants, userErrors } = res.productVariantsBulkUpdate;
      if (userErrors.length > 0) {
        throw new Error(`バリアント一括更新失敗: ${userErrors.map((e) => e.message).join(', ')}`);
      }
      log.info(`[productVariantsBulkUpdate] Updated ${productVariants.length} variants for ${productId}`);
      return productVariants.map((v) => ({ id: v.id, title: v.title, price: v.price }));
    } catch (err) {
      this.notifyError('productVariantsBulkUpdate', err);
      throw err;
    }
  }

  /**
   * バリアントを一括作成（2025-10 API）
   */
  async productVariantsBulkCreate(
    productId: string,
    variants: Array<{
      price?: string;
      compareAtPrice?: string | null;
      sku?: string;
      barcode?: string | null;
      optionValues?: Array<{ name: string; optionName: string }>;
    }>,
  ): Promise<Array<{ id: string; title: string; price: string }>> {
    const gql = `
      mutation productVariantsBulkCreate(
        $productId: ID!
        $variants: [ProductVariantsBulkInput!]!
      ) {
        productVariantsBulkCreate(productId: $productId, variants: $variants) {
          productVariants { id title price }
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        productVariantsBulkCreate: {
          productVariants: Array<{ id: string; title: string; price: string }>;
          userErrors: Array<{ field: string[]; message: string }>;
        };
      }>(gql, { productId, variants });

      const { productVariants, userErrors } = res.productVariantsBulkCreate;
      if (userErrors.length > 0) {
        throw new Error(`バリアント一括作成失敗: ${userErrors.map((e) => e.message).join(', ')}`);
      }
      log.info(`[productVariantsBulkCreate] Created ${productVariants.length} variants for ${productId}`);
      return productVariants;
    } catch (err) {
      this.notifyError('productVariantsBulkCreate', err);
      throw err;
    }
  }

  /**
   * 在庫数を差分で調整（2025-10 API）
   * 2024-04 から inventoryAdjustQuantities (複数形) が正式 API。
   * reason='correction' は SHOPIFY スキーマの正式な ReasonEnum 値。
   */
  async inventoryAdjustQuantity(
    inventoryItemId: string,
    locationId: string,
    delta: number,
  ): Promise<{ inventoryAdjustmentGroupId: string | null; changedQuantity: number }> {
    const gql = `
      mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) {
          inventoryAdjustmentGroup { id changes { delta name } }
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        inventoryAdjustQuantities: {
          inventoryAdjustmentGroup: {
            id: string;
            changes: Array<{ delta: number; name: string }>;
          } | null;
          userErrors: Array<{ field: string[]; message: string }>;
        };
      }>(gql, {
        input: {
          reason: 'correction',
          name: 'available',
          changes: [
            {
              inventoryItemId,
              locationId,
              delta,
            },
          ],
        },
      });

      const { inventoryAdjustmentGroup, userErrors } = res.inventoryAdjustQuantities;
      if (userErrors.length > 0) {
        throw new Error(`在庫調整失敗: ${userErrors.map((e) => e.message).join(', ')}`);
      }
      const changedQuantity = inventoryAdjustmentGroup?.changes?.reduce((s, c) => s + (c.delta || 0), 0) || 0;
      log.info(`[inventoryAdjustQuantity] Adjusted ${inventoryItemId} @ ${locationId} by ${delta}`);
      return {
        inventoryAdjustmentGroupId: inventoryAdjustmentGroup?.id || null,
        changedQuantity,
      };
    } catch (err) {
      this.notifyError('inventoryAdjustQuantity', err);
      throw err;
    }
  }

  /**
   * 商品画像を resourceUrl から追加（addProductMedia のエイリアス）
   * api.admin.products.ts が image_upload アクションで呼び出す。
   */
  async productImageCreate(
    productId: string,
    src: string,
    altText?: string,
  ): Promise<{ id: string; status: string }> {
    return this.addProductMedia(productId, src, altText);
  }

  /**
   * Shopify Files API でファイルを作成（createFileFromStagedUpload のエイリアス）
   * api.admin.images.ts が create_file アクションで呼び出す。
   */
  async createFileFromUrl(
    resourceUrl: string,
    alt?: string,
  ): Promise<{ id: string; url: string }> {
    return this.createFileFromStagedUpload(resourceUrl, alt);
  }

  /**
   * 商品詳細を取得（admin.products_.$id.tsx / api.admin.products.ts の ?id= モード）
   * 2025-10 API。variants/images/inventoryItem を含む完全スキーマ。
   */
  async getProductDetail(productGid: string): Promise<{
    id: string;
    title: string;
    handle: string;
    status: string;
    descriptionHtml: string;
    productType: string;
    vendor: string;
    tags: string[];
    publishedAt: string | null;
    variants: Array<{
      id: string;
      title: string;
      price: string;
      compareAtPrice: string | null;
      sku: string;
      barcode: string | null;
      inventoryQuantity: number;
      inventoryItem: { id: string; tracked: boolean };
      selectedOptions: Array<{ name: string; value: string }>;
    }>;
    images: Array<{ id: string; alt: string | null; url: string; width?: number; height?: number }>;
  } | null> {
    const gql = `
      query getProductDetail($id: ID!) {
        product(id: $id) {
          id
          title
          handle
          status
          descriptionHtml
          productType
          vendor
          tags
          publishedAt
          variants(first: 100) {
            edges {
              node {
                id
                title
                price
                compareAtPrice
                sku
                barcode
                inventoryQuantity
                inventoryItem { id tracked }
                selectedOptions { name value }
              }
            }
          }
          media(first: 50) {
            edges {
              node {
                ... on MediaImage {
                  id
                  alt
                  image { url width height }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const res = await this.query<{
        product: {
          id: string;
          title: string;
          handle: string;
          status: string;
          descriptionHtml: string;
          productType: string;
          vendor: string;
          tags: string[];
          publishedAt: string | null;
          variants: {
            edges: Array<{
              node: {
                id: string;
                title: string;
                price: string;
                compareAtPrice: string | null;
                sku: string | null;
                barcode: string | null;
                inventoryQuantity: number | null;
                inventoryItem: { id: string; tracked: boolean } | null;
                selectedOptions: Array<{ name: string; value: string }>;
              };
            }>;
          };
          media: {
            edges: Array<{
              node: {
                id?: string;
                alt?: string | null;
                image?: { url: string; width?: number; height?: number } | null;
              };
            }>;
          };
        } | null;
      }>(gql, { id: productGid });

      if (!res.product) return null;
      const p = res.product;
      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        status: p.status,
        descriptionHtml: p.descriptionHtml || '',
        productType: p.productType || '',
        vendor: p.vendor || '',
        tags: p.tags || [],
        publishedAt: p.publishedAt,
        variants: p.variants.edges.map((e) => ({
          id: e.node.id,
          title: e.node.title,
          price: e.node.price,
          compareAtPrice: e.node.compareAtPrice,
          sku: e.node.sku || '',
          barcode: e.node.barcode,
          inventoryQuantity: e.node.inventoryQuantity ?? 0,
          inventoryItem: {
            id: e.node.inventoryItem?.id || '',
            tracked: e.node.inventoryItem?.tracked ?? false,
          },
          selectedOptions: e.node.selectedOptions || [],
        })),
        images: p.media.edges
          .filter((e) => e.node.image)
          .map((e) => ({
            id: e.node.id || '',
            alt: e.node.alt ?? null,
            url: e.node.image!.url,
            width: e.node.image!.width,
            height: e.node.image!.height,
          })),
      };
    } catch (err) {
      this.notifyError('getProductDetail', err);
      throw err;
    }
  }

  /**
   * メタオブジェクト定義を type で取得（getMetaobjectDefinition のエイリアス）
   * api.admin.metaobject-migrate.ts が check_definition で呼び出す。
   */
  async getMetaobjectDefinitionByType(
    type: string,
  ): Promise<{ id: string; fieldDefinitions: Array<{ key: string; name: string }> } | null> {
    return this.getMetaobjectDefinition(type);
  }

  /**
   * 公開チャネル一覧取得（商品公開タブのピッカー用）
   * api.admin.publications.ts から呼び出される。
   */
  async getPublications(
    first = 50,
  ): Promise<Array<{ id: string; name: string; supportsFuturePublishing: boolean }>> {
    const gql = `
      query getPublications($first: Int!) {
        publications(first: $first) {
          edges {
            node {
              id
              name
              supportsFuturePublishing
            }
          }
        }
      }
    `;

    try {
      const res = await this.query<{
        publications: {
          edges: Array<{
            node: { id: string; name: string; supportsFuturePublishing: boolean };
          }>;
        };
      }>(gql, { first });

      return res.publications.edges.map((e) => e.node);
    } catch (err) {
      this.notifyError('getPublications', err);
      throw err;
    }
  }

  /**
   * 商品画像を削除（2025-10 API: productDeleteMedia）
   */
  async productImageDelete(productId: string, imageId: string): Promise<boolean> {
    const gql = `
      mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
        productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
          deletedMediaIds
          mediaUserErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        productDeleteMedia: {
          deletedMediaIds: string[] | null;
          mediaUserErrors: Array<{ field: string[]; message: string }>;
        };
      }>(gql, { productId, mediaIds: [imageId] });

      const { deletedMediaIds, mediaUserErrors } = res.productDeleteMedia;
      if (mediaUserErrors && mediaUserErrors.length > 0) {
        throw new Error(`画像削除失敗: ${mediaUserErrors.map((e) => e.message).join(', ')}`);
      }
      log.info(`[productImageDelete] Deleted ${deletedMediaIds?.length || 0} media from ${productId}`);
      return (deletedMediaIds?.length || 0) > 0;
    } catch (err) {
      this.notifyError('productImageDelete', err);
      throw err;
    }
  }

  /**
   * 商品画像を並び替え（2025-10 API: productReorderMedia）
   */
  async productImageReorder(productId: string, imageIds: string[]): Promise<boolean> {
    const gql = `
      mutation productReorderMedia($id: ID!, $moves: [MoveInput!]!) {
        productReorderMedia(id: $id, moves: $moves) {
          job { id done }
          mediaUserErrors { field message }
        }
      }
    `;

    try {
      const moves = imageIds.map((id, index) => ({ id, newPosition: String(index) }));
      const res = await this.query<{
        productReorderMedia: {
          job: { id: string; done: boolean } | null;
          mediaUserErrors: Array<{ field: string[]; message: string }>;
        };
      }>(gql, { id: productId, moves });

      const { mediaUserErrors } = res.productReorderMedia;
      if (mediaUserErrors && mediaUserErrors.length > 0) {
        throw new Error(`画像並び替え失敗: ${mediaUserErrors.map((e) => e.message).join(', ')}`);
      }
      log.info(`[productImageReorder] Reordered ${imageIds.length} media for ${productId}`);
      return true;
    } catch (err) {
      this.notifyError('productImageReorder', err);
      throw err;
    }
  }

  /**
   * 商品を公開チャネルに公開（2025-10 API: publishablePublish）
   */
  async productPublish(productId: string, publicationIds: string[]): Promise<boolean> {
    const gql = `
      mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          publishable { availablePublicationsCount { count } }
          userErrors { field message }
        }
      }
    `;

    try {
      const input = publicationIds.map((publicationId) => ({ publicationId }));
      const res = await this.query<{
        publishablePublish: {
          publishable: { availablePublicationsCount: { count: number } } | null;
          userErrors: Array<{ field: string[]; message: string }>;
        };
      }>(gql, { id: productId, input });

      const { userErrors } = res.publishablePublish;
      if (userErrors.length > 0) {
        throw new Error(`商品公開失敗: ${userErrors.map((e) => e.message).join(', ')}`);
      }
      log.info(`[productPublish] Published ${productId} to ${publicationIds.length} channels`);
      return true;
    } catch (err) {
      this.notifyError('productPublish', err);
      throw err;
    }
  }

  /**
   * 商品を公開チャネルから非公開化（2025-10 API: publishableUnpublish）
   */
  async productUnpublish(productId: string, publicationIds: string[]): Promise<boolean> {
    const gql = `
      mutation publishableUnpublish($id: ID!, $input: [PublicationInput!]!) {
        publishableUnpublish(id: $id, input: $input) {
          publishable { availablePublicationsCount { count } }
          userErrors { field message }
        }
      }
    `;

    try {
      const input = publicationIds.map((publicationId) => ({ publicationId }));
      const res = await this.query<{
        publishableUnpublish: {
          publishable: { availablePublicationsCount: { count: number } } | null;
          userErrors: Array<{ field: string[]; message: string }>;
        };
      }>(gql, { id: productId, input });

      const { userErrors } = res.publishableUnpublish;
      if (userErrors.length > 0) {
        throw new Error(`商品非公開失敗: ${userErrors.map((e) => e.message).join(', ')}`);
      }
      log.info(`[productUnpublish] Unpublished ${productId} from ${publicationIds.length} channels`);
      return true;
    } catch (err) {
      this.notifyError('productUnpublish', err);
      throw err;
    }
  }

  /**
   * Metaobject 定義に追加フィールドを append する（冪等）
   * api.admin.metaobject-migrate.ts が append_fields で呼び出す。
   * 既存フィールドキーは無視して、不足キーのみ追加する。
   */
  async updateMetaobjectDefinitionAppendFields(
    type: string,
    fields: Array<{ key: string; name: string; type: string }>,
  ): Promise<{ id: string; addedCount: number; skippedKeys: string[] }> {
    const existing = await this.getMetaobjectDefinition(type);
    if (!existing) {
      throw new Error(`Metaobject definition not found: ${type}`);
    }
    const existingKeys = new Set(existing.fieldDefinitions.map((f) => f.key));
    const toAdd = fields.filter((f) => !existingKeys.has(f.key));
    const skippedKeys = fields.filter((f) => existingKeys.has(f.key)).map((f) => f.key);

    if (toAdd.length === 0) {
      log.info(`[updateMetaobjectDefinitionAppendFields] No new fields for ${type} (all ${fields.length} already exist)`);
      return { id: existing.id, addedCount: 0, skippedKeys };
    }

    await this.updateMetaobjectDefinition(existing.id, toAdd);
    log.info(`[updateMetaobjectDefinitionAppendFields] Appended ${toAdd.length} fields to ${type} (skipped ${skippedKeys.length})`);
    return { id: existing.id, addedCount: toAdd.length, skippedKeys };
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
