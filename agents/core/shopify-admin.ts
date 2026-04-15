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

/** バリアント一括更新の入力型（productVariantsBulkUpdate 用） */
export interface VariantBulkUpdateInput {
  id: string;
  price?: string;
  compareAtPrice?: string;
  sku?: string;
  barcode?: string;
  taxable?: boolean;
  inventoryPolicy?: 'DENY' | 'CONTINUE';
  inventoryItem?: {
    sku?: string;
    tracked?: boolean;
  };
}

/** 商品画像メディア */
export interface ProductImage {
  id: string;
  alt: string | null;
  url: string;
  width?: number;
  height?: number;
}

/** 商品メタフィールド */
export interface ProductMetafield {
  id: string;
  namespace: string;
  key: string;
  value: string;
  type: string;
}

/** getProductDetail の返却型（全フィールド+variants+images+metafields） */
export interface ProductDetail {
  id: string;
  title: string;
  handle: string;
  status: string;
  descriptionHtml: string;
  productType: string;
  vendor: string;
  tags: string[];
  totalInventory: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  seo: {title: string | null; description: string | null};
  priceRangeV2: {
    minVariantPrice: {amount: string; currencyCode: string};
    maxVariantPrice: {amount: string; currencyCode: string};
  };
  featuredImage: {id: string; url: string; altText: string | null} | null;
  variants: Array<{
    id: string;
    title: string;
    price: string;
    compareAtPrice: string | null;
    sku: string;
    barcode: string | null;
    inventoryQuantity: number;
    inventoryItem: {id: string; tracked: boolean};
    selectedOptions: Array<{name: string; value: string}>;
  }>;
  images: ProductImage[];
  metafields: ProductMetafield[];
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
   * 既存メタオブジェクト定義を type 指定で取得
   */
  async getMetaobjectDefinitionByType(type: string): Promise<{id: string; type: string} | null> {
    const gql = `
      query metaobjectDefinitionByType($type: String!) {
        metaobjectDefinitionByType(type: $type) {
          id
          type
        }
      }
    `;
    try {
      const res = await this.query<{metaobjectDefinitionByType: {id: string; type: string} | null}>(gql, {type});
      return res.metaobjectDefinitionByType;
    } catch (err) {
      this.notifyError('getMetaobjectDefinitionByType', err);
      return null;
    }
  }

  /**
   * メタオブジェクト定義に新規フィールドを追加（既存データは保全、append のみ）
   * Shopify の metaobjectDefinitionUpdate mutation を使用。
   */
  async updateMetaobjectDefinitionAppendFields(
    type: string,
    fieldsToAdd: MetaobjectFieldDefinition[],
  ): Promise<{id: string; addedCount: number}> {
    const existing = await this.getMetaobjectDefinitionByType(type);
    if (!existing) {
      throw new Error(`メタオブジェクト定義 ${type} が存在しません`);
    }

    const gql = `
      mutation metaobjectDefinitionUpdate($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
        metaobjectDefinitionUpdate(id: $id, definition: $definition) {
          metaobjectDefinition { id type }
          userErrors { field message code }
        }
      }
    `;

    const definition = {
      fieldDefinitions: fieldsToAdd.map((f) => ({
        create: {
          key: f.key,
          name: f.name,
          type: f.type,
        },
      })),
    };

    try {
      const res = await this.query<{
        metaobjectDefinitionUpdate: {
          metaobjectDefinition: {id: string; type: string} | null;
          userErrors: Array<{field: string[]; message: string; code?: string}>;
        };
      }>(gql, {id: existing.id, definition});

      const {metaobjectDefinition, userErrors} = res.metaobjectDefinitionUpdate;
      // 既に同名フィールドが存在する場合は TAKEN エラー → 冪等として OK 扱い
      const nonDuplicateErrors = userErrors.filter((e) => {
        const msg = e.message.toLowerCase();
        return !(msg.includes('already') || msg.includes('taken') || msg.includes('exists') || e.code === 'TAKEN');
      });
      if (nonDuplicateErrors.length > 0) {
        throw new Error(`メタオブジェクト定義更新失敗: ${nonDuplicateErrors.map((e) => e.message).join(', ')}`);
      }
      const id = metaobjectDefinition?.id || existing.id;
      log.info(`[updateMetaobjectDefinitionAppendFields] ${type} +${fieldsToAdd.length} fields (${userErrors.length} dup skipped)`);
      return {id, addedCount: fieldsToAdd.length - userErrors.length};
    } catch (err) {
      this.notifyError('updateMetaobjectDefinitionAppendFields', err);
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

  // ══════════════════════════════════════════════════════════
  // ── Sprint 1: 商品運用向け追加ミューテーション（2025-10 API） ──
  // ══════════════════════════════════════════════════════════

  /**
   * バリアントを一括更新（productVariantsBulkUpdate）
   * 価格/SKU/在庫ポリシー等を1回のAPIコールで複数バリアントに反映。
   */
  async productVariantsBulkUpdate(
    productId: string,
    variants: VariantBulkUpdateInput[],
  ): Promise<Array<{id: string; title: string; price: string}>> {
    const gql = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants { id title price }
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        productVariantsBulkUpdate: {
          productVariants: Array<{id: string; title: string; price: string}> | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {productId, variants});

      const {productVariants, userErrors} = res.productVariantsBulkUpdate;
      if (userErrors.length > 0) {
        throw new Error(`バリアント一括更新失敗: ${userErrors.map((e) => e.message).join(', ')}`);
      }
      const updated = productVariants || [];
      log.info(`[productVariantsBulkUpdate] Updated ${updated.length} variants for ${productId}`);
      return updated;
    } catch (err) {
      this.notifyError('productVariantsBulkUpdate', err);
      throw err;
    }
  }

  /**
   * 在庫数量を相対調整（inventoryAdjustQuantities）
   * delta は増減量（正で加算、負で減算）。available quantityName を使用。
   */
  async inventoryAdjustQuantity(
    inventoryItemId: string,
    locationId: string,
    delta: number,
  ): Promise<{createdAt: string; reason: string}> {
    const gql = `
      mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) {
          inventoryAdjustmentGroup { createdAt reason }
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        inventoryAdjustQuantities: {
          inventoryAdjustmentGroup: {createdAt: string; reason: string} | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {
        input: {
          reason: 'correction',
          name: 'available',
          changes: [{delta, inventoryItemId, locationId}],
        },
      });

      const {inventoryAdjustmentGroup, userErrors} = res.inventoryAdjustQuantities;
      if (userErrors.length > 0) {
        throw new Error(`在庫調整失敗: ${userErrors.map((e) => e.message).join(', ')}`);
      }
      if (!inventoryAdjustmentGroup) {
        throw new Error('在庫調整: レスポンスに inventoryAdjustmentGroup が含まれません');
      }
      log.info(`[inventoryAdjustQuantity] ${inventoryItemId} @${locationId} delta=${delta}`);
      return inventoryAdjustmentGroup;
    } catch (err) {
      this.notifyError('inventoryAdjustQuantity', err);
      throw err;
    }
  }

  /**
   * 商品画像を追加（productCreateMedia, IMAGE タイプ）
   */
  async productImageCreate(
    productId: string,
    src: string,
    altText?: string,
  ): Promise<{id: string; alt: string | null}> {
    const gql = `
      mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media { ... on MediaImage { id alt image { url } } }
          mediaUserErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        productCreateMedia: {
          media: Array<{id: string; alt: string | null}> | null;
          mediaUserErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {
        productId,
        media: [{originalSource: src, alt: altText || '', mediaContentType: 'IMAGE'}],
      });

      const {media, mediaUserErrors} = res.productCreateMedia;
      if (mediaUserErrors.length > 0) {
        throw new Error(`商品画像作成失敗: ${mediaUserErrors.map((e) => e.message).join(', ')}`);
      }
      const created = media?.[0];
      if (!created) throw new Error('商品画像作成: レスポンスに media が含まれません');
      log.info(`[productImageCreate] Created media ${created.id} for ${productId}`);
      return created;
    } catch (err) {
      this.notifyError('productImageCreate', err);
      throw err;
    }
  }

  /**
   * 商品画像を削除（productDeleteMedia）
   * 2025-10 API は productId が必須のため、第1引数に追加。
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
          mediaUserErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {productId, mediaIds: [imageId]});

      const {deletedMediaIds, mediaUserErrors} = res.productDeleteMedia;
      if (mediaUserErrors.length > 0) {
        const isAlreadyDeleted = mediaUserErrors.some(
          (e) =>
            e.message.toLowerCase().includes('not found') ||
            e.message.toLowerCase().includes('does not exist'),
        );
        if (isAlreadyDeleted) {
          log.info(`[productImageDelete] Already deleted: ${imageId}`);
          return true;
        }
        throw new Error(`商品画像削除失敗: ${mediaUserErrors.map((e) => e.message).join(', ')}`);
      }
      log.info(`[productImageDelete] Deleted ${deletedMediaIds?.length ?? 0} media from ${productId}`);
      return true;
    } catch (err) {
      this.notifyError('productImageDelete', err);
      throw err;
    }
  }

  /**
   * 商品画像の表示順を変更（productReorderMedia）
   * imageIds は希望順序で並べて渡す（0-indexed で newPosition を自動採番）。
   */
  async productImageReorder(productId: string, imageIds: string[]): Promise<boolean> {
    const gql = `
      mutation productReorderMedia($id: ID!, $moves: [MoveInput!]!) {
        productReorderMedia(id: $id, moves: $moves) {
          job { id }
          mediaUserErrors { field message }
        }
      }
    `;

    const moves = imageIds.map((id, i) => ({id, newPosition: String(i)}));

    try {
      const res = await this.query<{
        productReorderMedia: {
          job: {id: string} | null;
          mediaUserErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {id: productId, moves});

      const {mediaUserErrors} = res.productReorderMedia;
      if (mediaUserErrors.length > 0) {
        throw new Error(`商品画像並び替え失敗: ${mediaUserErrors.map((e) => e.message).join(', ')}`);
      }
      log.info(`[productImageReorder] Reordered ${imageIds.length} images for ${productId}`);
      return true;
    } catch (err) {
      this.notifyError('productImageReorder', err);
      throw err;
    }
  }

  /**
   * 商品を公開チャネルに公開（publishablePublish）
   */
  async productPublish(productId: string, publicationIds: string[]): Promise<boolean> {
    const gql = `
      mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        publishablePublish: {
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {
        id: productId,
        input: publicationIds.map((publicationId) => ({publicationId})),
      });

      const {userErrors} = res.publishablePublish;
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
   * 商品を公開チャネルから非公開化（publishableUnpublish）
   */
  async productUnpublish(productId: string, publicationIds: string[]): Promise<boolean> {
    const gql = `
      mutation publishableUnpublish($id: ID!, $input: [PublicationInput!]!) {
        publishableUnpublish(id: $id, input: $input) {
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        publishableUnpublish: {
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {
        id: productId,
        input: publicationIds.map((publicationId) => ({publicationId})),
      });

      const {userErrors} = res.publishableUnpublish;
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
   * 商品詳細を全フィールド取得（variants/images/metafields 含む）
   */
  async getProductDetail(productId: string): Promise<ProductDetail | null> {
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
          totalInventory
          createdAt
          updatedAt
          publishedAt
          seo { title description }
          priceRangeV2 {
            minVariantPrice { amount currencyCode }
            maxVariantPrice { amount currencyCode }
          }
          featuredImage { id url altText }
          variants(first: 100) {
            nodes {
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
          media(first: 50, query: "media_type:IMAGE") {
            nodes {
              ... on MediaImage {
                id
                alt
                image { url width height }
              }
            }
          }
          metafields(first: 50) {
            nodes { id namespace key value type }
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
          totalInventory: number;
          createdAt: string;
          updatedAt: string;
          publishedAt: string | null;
          seo: {title: string | null; description: string | null};
          priceRangeV2: ProductDetail['priceRangeV2'];
          featuredImage: {id: string; url: string; altText: string | null} | null;
          variants: {nodes: ProductDetail['variants']};
          media: {
            nodes: Array<{
              id?: string;
              alt?: string | null;
              image?: {url: string; width?: number; height?: number} | null;
            }>;
          };
          metafields: {nodes: ProductMetafield[]};
        } | null;
      }>(gql, {id: productId});

      if (!res.product) return null;
      const p = res.product;

      const images: ProductImage[] = (p.media?.nodes || [])
        .filter((m) => m.id && m.image?.url)
        .map((m) => ({
          id: m.id as string,
          alt: m.alt ?? null,
          url: (m.image as {url: string}).url,
          width: m.image?.width,
          height: m.image?.height,
        }));

      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        status: p.status,
        descriptionHtml: p.descriptionHtml,
        productType: p.productType,
        vendor: p.vendor,
        tags: p.tags,
        totalInventory: p.totalInventory,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        publishedAt: p.publishedAt,
        seo: p.seo,
        priceRangeV2: p.priceRangeV2,
        featuredImage: p.featuredImage,
        variants: p.variants?.nodes || [],
        images,
        metafields: p.metafields?.nodes || [],
      };
    } catch (err) {
      this.notifyError('getProductDetail', err);
      throw err;
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
