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
// patch 0089 (R2-P2-4): GraphQL userErrors を日本語化
import { translateUserErrors } from '../../app/lib/graphql-error-i18n.js';

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

/** コレクション作成/更新用の入力型（patch 0064 — 管理画面完結化） */
export interface CollectionCreateInput {
  title: string;
  descriptionHtml?: string;
  handle?: string;
  /** image: { src: 既存ファイル URL or stagedUpload resourceUrl, altText?: string } または { id: 既存 MediaImage GID } */
  image?: {id?: string; src?: string; altText?: string};
  /** スマートコレクション条件。省略時は手動コレクション。 */
  ruleSet?: {
    appliedDisjunctively: boolean;
    rules: Array<{
      column:
        | 'TAG'
        | 'TITLE'
        | 'TYPE'
        | 'VENDOR'
        | 'VARIANT_PRICE'
        | 'IS_PRICE_REDUCED'
        | 'VARIANT_COMPARE_AT_PRICE'
        | 'VARIANT_WEIGHT'
        | 'VARIANT_INVENTORY';
      relation:
        | 'EQUALS'
        | 'NOT_EQUALS'
        | 'GREATER_THAN'
        | 'LESS_THAN'
        | 'STARTS_WITH'
        | 'ENDS_WITH'
        | 'CONTAINS'
        | 'NOT_CONTAINS'
        | 'IS_SET'
        | 'IS_NOT_SET';
      condition: string;
    }>;
  };
  seo?: {title?: string; description?: string};
  sortOrder?:
    | 'MANUAL'
    | 'BEST_SELLING'
    | 'ALPHA_ASC'
    | 'ALPHA_DESC'
    | 'PRICE_ASC'
    | 'PRICE_DESC'
    | 'CREATED'
    | 'CREATED_DESC';
  templateSuffix?: string;
}

export interface CollectionListItem {
  id: string;
  handle: string;
  title: string;
  updatedAt: string;
  productsCount: number;
  imageUrl: string | null;
  ruleSet: {appliedDisjunctively: boolean; rules: Array<{column: string; relation: string; condition: string}>} | null;
  sortOrder: string;
  // patch 0149: 公開状態 (Apple Just Works 視覚化)
  // 0=非公開 / >=1=公開チャネル数
  publishedCount: number;
  totalChannels: number;
}

export interface CollectionDetail extends CollectionListItem {
  descriptionHtml: string;
  description: string;
  seo: {title: string | null; description: string | null};
  templateSuffix: string | null;
}

/** URL リダイレクト作成/更新用の入力型（patch 0066 — 管理画面完結化 P2） */
export interface UrlRedirectInput {
  /** リダイレクト元パス（例: /pages/old-page） */
  path: string;
  /** リダイレクト先パスまたはURL（例: /collections/new-page） */
  target: string;
}

/** URL リダイレクト一覧アイテム */
export interface UrlRedirectListItem {
  id: string;
  path: string;
  target: string;
}

/** Shopify Files ライブラリ一覧アイテム（patch 0067 — 管理画面完結化 P3） */
export interface ShopifyFileListItem {
  /** gid://shopify/MediaImage/... or gid://shopify/GenericFile/... or gid://shopify/Video/... */
  id: string;
  /** MediaImage | GenericFile | Video */
  fileStatus: string;
  /** 代表 URL（画像なら image.url、その他は url） */
  url: string;
  /** プレビュー URL（ない場合は空） */
  previewUrl: string;
  /** 代替テキスト */
  alt: string;
  /** MIME type（推定） */
  mimeType: string;
  /** 作成日時 ISO 8601 */
  createdAt: string;
  /** 原典のファイル名（取得できる場合） */
  originalFileName: string;
  /** 画像幅（MediaImage のみ） */
  width: number | null;
  /** 画像高（MediaImage のみ） */
  height: number | null;
  /** ファイルサイズ byte（GenericFile のみ） */
  fileSize: number | null;
  /** __typename（MediaImage | GenericFile | Video | ...） */
  typeName: string;
}

/** メタオブジェクト定義一覧アイテム（patch 0068 — 管理画面完結化 P4） */
export interface ShopifyMetaobjectDefinitionItem {
  /** gid://shopify/MetaobjectDefinition/... */
  id: string;
  /** 例: astromeda_marquee_item */
  type: string;
  /** 表示名 */
  name: string;
  /** 説明（任意） */
  description: string | null;
  /** 定義済みフィールド数 */
  fieldCount: number;
  /** 実体の Metaobject インスタンス件数 — 削除警告用 */
  metaobjectsCount: number;
  /** フィールド一覧 */
  fieldDefinitions: Array<{
    key: string;
    name: string;
    type: string;
    required: boolean;
    description: string | null;
  }>;
}

/**
 * Shopify Admin Discount Code 一覧表示用 — patch 0069
 * CEO がキャンペーンコード (例 SPRING10 で 10% OFF) を admin から発行/削除するための表示形
 */
export interface ShopifyDiscountCodeItem {
  /** gid://shopify/DiscountCodeNode/... (削除 mutation 用) */
  id: string;
  /** CEO 表示用タイトル */
  title: string;
  /** チェックアウトで入力するコード文字列 */
  code: string;
  /** ACTIVE / EXPIRED / SCHEDULED のいずれか */
  status: string;
  /** ISO 8601 開始 */
  startsAt: string;
  /** ISO 8601 終了 (任意) */
  endsAt: string | null;
  /** 利用回数上限 (null = 無制限) */
  usageLimit: number | null;
  /** 現在までの利用回数 */
  asyncUsageCount: number;
  /** 割引種別: "percentage" | "fixed_amount" */
  kind: 'percentage' | 'fixed_amount' | 'unknown';
  /** パーセント (kind=percentage のとき、0.10 = 10%) */
  percentage: number | null;
  /** 固定額 (kind=fixed_amount のとき) */
  fixedAmount: number | null;
  /** 顧客がいつでも使えるか (true=全員 / false=条件つき) */
  appliesToAllCustomers: boolean;
  /** Shopify が返す summary 文 */
  summary: string;
}

/**
 * Shopify Navigation Menu 一覧表示用 — patch 0070
 * CEO がヘッダー/フッターのメニュー構造を admin から編集するための表示形
 */
export interface ShopifyMenuSummary {
  /** gid://shopify/Menu/... */
  id: string;
  /** handle (main-menu / footer / shop など。url path にも使われる) */
  handle: string;
  /** CEO 表示用タイトル */
  title: string;
  /** メニュー項目数（トップレベルのみの件数。Admin API が直接返す） */
  itemsCount: number;
  /** Shopify の既定 (main-menu / footer) かどうか (削除不可) */
  isDefault: boolean;
  /** patch 0115 (P2-5): 楽観的ロック CAS 用の更新時刻 (ISO8601) */
  updatedAt?: string;
}

/** メニュー項目（再帰的ツリー） */
export interface ShopifyMenuItem {
  /** gid://shopify/MenuItem/... (update 時に同 id を渡せば置き換え) */
  id?: string;
  /** 表示ラベル */
  title: string;
  /** 項目タイプ */
  type: ShopifyMenuItemType;
  /** type=COLLECTION/PRODUCT/PAGE/BLOG/ARTICLE/METAOBJECT のとき参照する gid */
  resourceId?: string | null;
  /** type=HTTP のときの URL (外部/相対どちらも可) */
  url?: string | null;
  /** 補助タグ */
  tags?: string[];
  /** 子メニュー (深さ 3 まで) */
  items?: ShopifyMenuItem[];
}

/** Shopify MenuItemType enum (2025-10 schema) */
export type ShopifyMenuItemType =
  | 'FRONTPAGE'
  | 'COLLECTION'
  | 'COLLECTIONS'
  | 'CATALOG'
  | 'PRODUCT'
  | 'PAGE'
  | 'BLOG'
  | 'ARTICLE'
  | 'SEARCH'
  | 'SHOP_POLICY'
  | 'CUSTOMER_ACCOUNT_PAGE'
  | 'METAOBJECT'
  | 'HTTP';

/** メニュー詳細 (getMenu 戻り値) */
export interface ShopifyMenuDetail extends ShopifyMenuSummary {
  items: ShopifyMenuItem[];
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
   *
   * patch 0105 (P4): fetch に AbortSignal を渡せるよう options 引数を追加。
   * caller (route loader 等) から server.ts の requestSignal を渡せば、
   * 30秒の request timeout が切れたタイミングで Shopify への fetch も
   * 即座に abort される。caller が signal を渡さない場合は内部で
   * AbortSignal.timeout(25_000) を生成し、Shopify API ハング時に
   * 上流から強制中断する (server.ts の 30秒より 5秒早く切る)。
   */
  async query<T = unknown>(
    graphql: string,
    variables?: Record<string, unknown>,
    options?: {signal?: AbortSignal},
  ): Promise<T> {
    if (!this.isConfigured) {
      throw new Error('Shopify Admin API is not configured. Set PRIVATE_STOREFRONT_API_TOKEN and PUBLIC_STORE_DOMAIN.');
    }

    const endpoint = `https://${this.storeDomain}/admin/api/${this.apiVersion}/graphql.json`;

    // patch 0105 (P4): caller signal を内部 25s timeout と AnySignal でマージ。
    // 古い workerd は AbortSignal.any/timeout が無いケースもあるので feature
    // detect してフォールバック。少なくとも内部 timeout は必ず付ける。
    const signals: AbortSignal[] = [];
    if (options?.signal) signals.push(options.signal);
    const SignalAny = (AbortSignal as unknown as {
      any?: (s: AbortSignal[]) => AbortSignal;
      timeout?: (ms: number) => AbortSignal;
    });
    if (typeof SignalAny.timeout === 'function') {
      signals.push(SignalAny.timeout(25_000));
    }
    const finalSignal: AbortSignal | undefined =
      signals.length === 0
        ? undefined
        : signals.length === 1
          ? signals[0]
          : typeof SignalAny.any === 'function'
            ? SignalAny.any(signals)
            : signals[0]; // fallback: caller signal 優先

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': this.apiToken,
        },
        body: JSON.stringify({query: graphql, variables}),
        signal: finalSignal,
      });
    } catch (err) {
      // AbortError は上流の 504 ハンドラに乗せるためそのまま re-throw
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Shopify Admin API fetch failed: ${msg}`);
    }

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

  /**
   * ストアに登録されている商品タグの一覧（patch 0098）
   * Shopify Admin の shop.productTags を介して最大 first 件まで取得する。
   * 失敗時は空配列を返して UI 側のフォールバック動作を許す。
   */
  async listProductTags(first = 250): Promise<string[]> {
    if (!this.isConfigured) return [];
    const gql = `
      query ShopProductTags($first: Int!) {
        shop { productTags(first: $first) { edges { node } } }
      }
    `;
    try {
      const data = await this.query<{shop: {productTags: {edges: Array<{node: string}>}}}>(gql, {
        first,
      });
      return (data.shop?.productTags?.edges || []).map((e) => e.node).filter(Boolean);
    } catch (err) {
      this.notifyError('listProductTags', err);
      return [];
    }
  }

  /**
   * 指定タグを持つ商品件数を返す（patch 0098）
   * productsCount は Shopify Admin API 2024-07+ で利用可。正確な件数が得られる。
   */
  async countProductsByTag(tag: string): Promise<number> {
    if (!this.isConfigured || !tag) return 0;
    const safeTag = tag.replace(/'/g, "\\'");
    const gql = `query ProductsCountByTag($q: String!) { productsCount(query: $q) { count } }`;
    try {
      const data = await this.query<{productsCount: {count: number}}>(gql, {
        q: `tag:'${safeTag}'`,
      });
      return data.productsCount?.count || 0;
    } catch (err) {
      this.notifyError('countProductsByTag', err);
      return 0;
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
   *
   * patch 0150 P0: Shopify Admin API 2025-10 仕様変更対応
   * 旧仕様 (~2025-04) では ProductCreateInput に variants を含められたが、
   * 2025-10 で削除された。代わりに productCreate → productVariantsBulkCreate
   * の 2 段階で作る必要がある。
   *
   * 本メソッドは呼び出し側から見て透過的に「商品+バリアント」を作成できるよう、
   * 内部で 2 mutation を順次実行する。
   */
  async createProduct(input: ProductCreateInput): Promise<{id: string; handle: string; variantsCount?: number}> {
    // patch 0150: variants は 2025-10 API では別 mutation で作成
    const {variants, ...productOnly} = input;

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
      }>(gql, {input: productOnly});

      const {product, userErrors} = res.productCreate;
      if (userErrors.length > 0) {
        throw new Error(`商品作成失敗: ${translateUserErrors(userErrors)}`);
      }
      if (!product) throw new Error('商品作成: レスポンスにproductが含まれません');

      log.info(`[createProduct] Created: ${product.handle} (${product.id})`);

      // patch 0150: variants が指定されていれば productVariantsBulkCreate で追加
      let variantsCount: number | undefined;
      if (variants && variants.length > 0) {
        try {
          variantsCount = await this.bulkCreateProductVariants(product.id, variants);
          log.info(`[createProduct] Added ${variantsCount} variants to ${product.handle}`);
        } catch (vErr) {
          // variants 追加失敗しても商品自体は作成済 → warning で済ませる
          log.warn(`[createProduct] Variants 追加失敗 (商品自体は作成済): ${vErr instanceof Error ? vErr.message : String(vErr)}`);
        }
      }

      return {id: product.id, handle: product.handle, variantsCount};
    } catch (err) {
      this.notifyError('createProduct', err);
      throw err;
    }
  }

  /**
   * 商品にバリアントを一括追加 (productVariantsBulkCreate)
   * patch 0150: createProduct から呼ばれる helper
   */
  async bulkCreateProductVariants(productId: string, variants: VariantInput[]): Promise<number> {
    const gql = `
      mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkCreate(productId: $productId, variants: $variants) {
          productVariants { id title price }
          userErrors { field message }
        }
      }
    `;
    // 2025-10 ProductVariantsBulkInput: price (Decimal), optionValues, inventoryItem.sku
    const bulkInput = variants.map((v) => {
      const obj: Record<string, unknown> = {price: v.price};
      if (v.options && v.options.length > 0) {
        obj.optionValues = v.options.map((name, i) => ({optionName: `Option ${i + 1}`, name}));
      }
      if (v.sku) {
        obj.inventoryItem = {sku: v.sku};
      }
      return obj;
    });

    const res = await this.query<{
      productVariantsBulkCreate: {
        productVariants: Array<{id: string; title: string; price: string}> | null;
        userErrors: Array<{field: string[]; message: string}>;
      };
    }>(gql, {productId, variants: bulkInput});

    const {productVariants, userErrors} = res.productVariantsBulkCreate;
    if (userErrors.length > 0) {
      throw new Error(`バリアント追加失敗: ${translateUserErrors(userErrors)}`);
    }
    return productVariants?.length ?? 0;
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
        throw new Error(`商品更新失敗: ${translateUserErrors(userErrors)}`);
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
        throw new Error(`商品削除失敗: ${translateUserErrors(userErrors)}`);
      }

      log.info(`[deleteProduct] Deleted: ${id}`);
      return true;
    } catch (err) {
      this.notifyError('deleteProduct', err);
      throw err;
    }
  }

  // ══════════════════════════════════════════════════════════
  // 商品タグ一括操作（効果器: 分類の再編 — patch 0065）
  //
  // 医学的メタファー: 細胞(商品)の表面マーカー(タグ)を
  // 一括で付け替えることで、Smart Collection の rule 判定を
  // 瞬時に再構成する。個別 productUpdate を 100 回呼ぶのではなく
  // Shopify 2025-10 の tagsAdd / tagsRemove mutation を使い、
  // 既存タグを上書きせずマージ/削除する。
  // ══════════════════════════════════════════════════════════

  /**
   * 複数商品に対してタグを一括付与（既存タグは保持・冪等）
   *
   * Shopify の tagsAdd mutation は Taggable interface を受けるので
   * Product GID をそのまま渡せる。既存タグとのマージは Shopify 側で処理。
   *
   * @param productIds - Product GID の配列
   * @param tags - 追加するタグ文字列の配列
   * @returns 各商品の成否を示す配列
   */
  async bulkAddTagsToProducts(
    productIds: string[],
    tags: string[],
  ): Promise<Array<{id: string; success: boolean; error?: string}>> {
    const gql = `
      mutation tagsAdd($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          node { id }
          userErrors { field message }
        }
      }
    `;

    const results: Array<{id: string; success: boolean; error?: string}> = [];

    // Shopify Admin API は 2req/sec 制限があるので直列で処理（ループ内で await）
    // 将来 graphqlBulkOperations に置換可能だが、数十〜数百件想定なら直列で十分
    for (const id of productIds) {
      try {
        const res = await this.query<{
          tagsAdd: {
            node: {id: string} | null;
            userErrors: Array<{field: string[]; message: string}>;
          };
        }>(gql, {id, tags});

        const {userErrors} = res.tagsAdd;
        if (userErrors.length > 0) {
          results.push({
            id,
            success: false,
            error: translateUserErrors(userErrors),
          });
        } else {
          results.push({id, success: true});
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        results.push({id, success: false, error: msg});
      }
    }

    const ok = results.filter(r => r.success).length;
    log.info(`[bulkAddTagsToProducts] ${ok}/${productIds.length} 成功 (tags=${tags.join(',')})`);
    return results;
  }

  /**
   * 複数商品からタグを一括削除（指定タグが無ければ何もしない・冪等）
   *
   * @param productIds - Product GID の配列
   * @param tags - 削除するタグ文字列の配列
   * @returns 各商品の成否を示す配列
   */
  async bulkRemoveTagsFromProducts(
    productIds: string[],
    tags: string[],
  ): Promise<Array<{id: string; success: boolean; error?: string}>> {
    const gql = `
      mutation tagsRemove($id: ID!, $tags: [String!]!) {
        tagsRemove(id: $id, tags: $tags) {
          node { id }
          userErrors { field message }
        }
      }
    `;

    const results: Array<{id: string; success: boolean; error?: string}> = [];

    for (const id of productIds) {
      try {
        const res = await this.query<{
          tagsRemove: {
            node: {id: string} | null;
            userErrors: Array<{field: string[]; message: string}>;
          };
        }>(gql, {id, tags});

        const {userErrors} = res.tagsRemove;
        if (userErrors.length > 0) {
          results.push({
            id,
            success: false,
            error: translateUserErrors(userErrors),
          });
        } else {
          results.push({id, success: true});
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        results.push({id, success: false, error: msg});
      }
    }

    const ok = results.filter(r => r.success).length;
    log.info(`[bulkRemoveTagsFromProducts] ${ok}/${productIds.length} 成功 (tags=${tags.join(',')})`);
    return results;
  }

  // ══════════════════════════════════════════════════════════
  // コレクションCRUD（効果器: 組織化 — patch 0064）
  //
  // 医学的メタファー: 商品(細胞)を特定のルール(タグ条件等)で
  // 束ねて「組織」(コレクション)を作る。新 IP コラボの親コレクション
  // 作成を管理画面から完結するために 2026-04-20 に新設。
  // ══════════════════════════════════════════════════════════

  /**
   * コレクション一覧（Admin API — draft を含む）
   */
  async listCollectionsAdmin(
    first = 50,
    queryStr?: string,
    cursor?: string,
  ): Promise<{
    collections: CollectionListItem[];
    pageInfo: {hasNextPage: boolean; endCursor: string | null};
  }> {
    // patch 0149: 公開状態を視覚化するため availablePublicationsCount + resourcePublications を取得
    const gql = `
      query CollectionsAdmin($first: Int!, $query: String, $after: String) {
        collections(first: $first, query: $query, after: $after, sortKey: UPDATED_AT, reverse: true) {
          edges {
            cursor
            node {
              id
              handle
              title
              updatedAt
              productsCount { count }
              image { url altText }
              ruleSet {
                appliedDisjunctively
                rules { column relation condition }
              }
              sortOrder
              availablePublicationsCount { count }
              resourcePublicationsCount { count }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;

    try {
      const res = await this.query<{
        collections: {
          edges: Array<{
            cursor: string;
            node: {
              id: string;
              handle: string;
              title: string;
              updatedAt: string;
              productsCount: {count: number} | null;
              image: {url: string; altText: string | null} | null;
              ruleSet: {
                appliedDisjunctively: boolean;
                rules: Array<{column: string; relation: string; condition: string}>;
              } | null;
              sortOrder: string;
              availablePublicationsCount: {count: number} | null;
              resourcePublicationsCount: {count: number} | null;
            };
          }>;
          pageInfo: {hasNextPage: boolean; endCursor: string | null};
        };
      }>(gql, {first, query: queryStr, after: cursor});

      const collections: CollectionListItem[] = res.collections.edges.map(({node}) => ({
        id: node.id,
        handle: node.handle,
        title: node.title,
        updatedAt: node.updatedAt,
        productsCount: node.productsCount?.count ?? 0,
        imageUrl: node.image?.url ?? null,
        ruleSet: node.ruleSet,
        sortOrder: node.sortOrder,
        publishedCount: node.resourcePublicationsCount?.count ?? 0,
        totalChannels: node.availablePublicationsCount?.count ?? 0,
      }));

      return {collections, pageInfo: res.collections.pageInfo};
    } catch (err) {
      this.notifyError('listCollectionsAdmin', err);
      throw err;
    }
  }

  /**
   * コレクション詳細（編集用）
   */
  async getCollectionDetail(id: string): Promise<CollectionDetail | null> {
    const gql = `
      query CollectionDetail($id: ID!) {
        collection(id: $id) {
          id
          handle
          title
          description
          descriptionHtml
          updatedAt
          templateSuffix
          sortOrder
          productsCount { count }
          image { url altText }
          seo { title description }
          ruleSet {
            appliedDisjunctively
            rules { column relation condition }
          }
        }
      }
    `;

    try {
      const res = await this.query<{
        collection: {
          id: string;
          handle: string;
          title: string;
          description: string;
          descriptionHtml: string;
          updatedAt: string;
          templateSuffix: string | null;
          sortOrder: string;
          productsCount: {count: number} | null;
          image: {url: string; altText: string | null} | null;
          seo: {title: string | null; description: string | null};
          ruleSet: {
            appliedDisjunctively: boolean;
            rules: Array<{column: string; relation: string; condition: string}>;
          } | null;
        } | null;
      }>(gql, {id});

      if (!res.collection) return null;
      const c = res.collection;
      return {
        id: c.id,
        handle: c.handle,
        title: c.title,
        description: c.description,
        descriptionHtml: c.descriptionHtml,
        updatedAt: c.updatedAt,
        productsCount: c.productsCount?.count ?? 0,
        imageUrl: c.image?.url ?? null,
        seo: c.seo,
        ruleSet: c.ruleSet,
        sortOrder: c.sortOrder,
        templateSuffix: c.templateSuffix,
      };
    } catch (err) {
      this.notifyError('getCollectionDetail', err);
      throw err;
    }
  }

  /**
   * コレクションを作成（効果器: 新組織の形成）
   *
   * patch 0147 P0:
   * options.publish が true (default) の場合、作成直後に
   * 全 publishable channels (Online Store / Hydrogen 等) に自動 publish。
   * これがないと storefront /collections/handle が 404 になる構造的バグを解消。
   *
   * options.publish=false なら明示的に「下書き」として残す。
   */
  async createCollection(
    input: CollectionCreateInput,
    options: {publish?: boolean} = {},
  ): Promise<{id: string; handle: string; publishedToCount?: number; publishUrl?: string; needsManualPublish?: boolean}> {
    const shouldPublish = options.publish !== false; // default true
    const gql = `
      mutation collectionCreate($input: CollectionInput!) {
        collectionCreate(input: $input) {
          collection { id handle title }
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        collectionCreate: {
          collection: {id: string; handle: string; title: string} | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {input});

      const {collection, userErrors} = res.collectionCreate;
      if (userErrors.length > 0) {
        throw new Error(`コレクション作成失敗: ${translateUserErrors(userErrors)}`);
      }
      if (!collection) throw new Error('コレクション作成: レスポンスにcollectionが含まれません');

      log.info(`[createCollection] Created: ${collection.handle} (${collection.id})`);

      // patch 0147: 自動 publish (Online Store / Hydrogen 等の全 publishable channels へ)
      let publishedToCount = 0;
      let publishFailed = false;
      if (shouldPublish) {
        try {
          const pubs = await this.getPublications(20);
          const targetIds = pubs.map((p) => p.id);
          if (targetIds.length > 0) {
            await this.publishablePublish(collection.id, targetIds);
            publishedToCount = targetIds.length;
            log.info(`[createCollection] Auto-published to ${targetIds.length} channels`);
          } else {
            publishFailed = true;
          }
        } catch (pubErr) {
          // publish に失敗しても collection 自体は作成済みなので、warning で済ませる
          log.warn(`[createCollection] Auto-publish failed (collection 自体は作成済み): ${pubErr instanceof Error ? pubErr.message : String(pubErr)}`);
          publishFailed = true;
        }
      }

      // patch 0148: Apple/Stripe Graceful Degradation
      // publish に失敗した場合 (scope 不足等)、Shopify admin の collection 編集ページ URL を返す
      // → admin UI で「1 クリックで公開」リンクを表示できる
      // store handle はハードコード (CLAUDE.md の本番ストア = production-mining-base)
      const numericId = collection.id.replace('gid://shopify/Collection/', '');
      const publishUrl = `https://admin.shopify.com/store/production-mining-base/collections/${numericId}`;

      return {
        id: collection.id,
        handle: collection.handle,
        publishedToCount,
        publishUrl,
        needsManualPublish: shouldPublish && publishFailed,
      };
    } catch (err) {
      this.notifyError('createCollection', err);
      throw err;
    }
  }

  /**
   * 任意のリソース (Product / Collection / etc.) を publishable channels に公開
   * patch 0147: createCollection 経由 + 直接呼び出し両用
   */
  async publishablePublish(resourceId: string, publicationIds: string[]): Promise<boolean> {
    const gql = `
      mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          publishable { availablePublicationsCount { count } }
          userErrors { field message }
        }
      }
    `;
    try {
      const input = publicationIds.map((publicationId) => ({publicationId}));
      const res = await this.query<{
        publishablePublish: {
          publishable: {availablePublicationsCount: {count: number}} | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {id: resourceId, input});
      const {userErrors} = res.publishablePublish;
      if (userErrors.length > 0) {
        throw new Error(`公開失敗: ${translateUserErrors(userErrors)}`);
      }
      log.info(`[publishablePublish] Published ${resourceId} to ${publicationIds.length} channels`);
      return true;
    } catch (err) {
      this.notifyError('publishablePublish', err);
      throw err;
    }
  }

  /**
   * コレクションを更新（効果器: 組織の再編）
   */
  async updateCollection(
    id: string,
    input: Partial<CollectionCreateInput>,
  ): Promise<{id: string; handle: string}> {
    const gql = `
      mutation collectionUpdate($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id handle title }
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        collectionUpdate: {
          collection: {id: string; handle: string} | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {input: {id, ...input}});

      const {collection, userErrors} = res.collectionUpdate;
      if (userErrors.length > 0) {
        throw new Error(`コレクション更新失敗: ${translateUserErrors(userErrors)}`);
      }
      if (!collection) throw new Error('コレクション更新: レスポンスにcollectionが含まれません');

      log.info(`[updateCollection] Updated: ${collection.handle} (${collection.id})`);
      return {id: collection.id, handle: collection.handle};
    } catch (err) {
      this.notifyError('updateCollection', err);
      throw err;
    }
  }

  /**
   * コレクションを削除（効果器: 組織の吸収）
   * 冪等性: 既に削除済みの場合も true
   */
  async deleteCollection(id: string): Promise<boolean> {
    const gql = `
      mutation collectionDelete($input: CollectionDeleteInput!) {
        collectionDelete(input: $input) {
          deletedCollectionId
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        collectionDelete: {
          deletedCollectionId: string | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {input: {id}});

      const {userErrors} = res.collectionDelete;
      if (userErrors.length > 0) {
        const isAlreadyDeleted = userErrors.some(
          (e) =>
            e.message.toLowerCase().includes('not found') ||
            e.message.toLowerCase().includes('does not exist'),
        );
        if (isAlreadyDeleted) {
          log.info(`[deleteCollection] Already deleted: ${id}`);
          return true;
        }
        throw new Error(`コレクション削除失敗: ${translateUserErrors(userErrors)}`);
      }

      log.info(`[deleteCollection] Deleted: ${id}`);
      return true;
    } catch (err) {
      this.notifyError('deleteCollection', err);
      throw err;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // patch 0066 — URL リダイレクト CRUD（管理画面完結化 P2）
  // 効果器: 記憶の再経路化（旧URL→新URLへ神経経路を接続）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * URL リダイレクト一覧を取得（受容器: 現在の記憶再経路マップを読み取る）
   */
  async listUrlRedirects(
    first = 50,
    query?: string,
    after?: string,
  ): Promise<{
    items: UrlRedirectListItem[];
    pageInfo: {hasNextPage: boolean; endCursor: string | null};
  }> {
    const gql = `
      query UrlRedirects($first: Int!, $query: String, $after: String) {
        urlRedirects(first: $first, query: $query, after: $after, sortKey: ID, reverse: true) {
          edges {
            cursor
            node { id path target }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;

    try {
      const res = await this.query<{
        urlRedirects: {
          edges: Array<{cursor: string; node: {id: string; path: string; target: string}}>;
          pageInfo: {hasNextPage: boolean; endCursor: string | null};
        };
      }>(gql, {first, query, after});

      const items = res.urlRedirects.edges.map((e) => e.node);
      return {items, pageInfo: res.urlRedirects.pageInfo};
    } catch (err) {
      this.notifyError('listUrlRedirects', err);
      throw err;
    }
  }

  /**
   * URL リダイレクトを作成（効果器: 新しい経路の配線）
   */
  async createUrlRedirect(input: UrlRedirectInput): Promise<{id: string; path: string; target: string}> {
    const gql = `
      mutation urlRedirectCreate($urlRedirect: UrlRedirectInput!) {
        urlRedirectCreate(urlRedirect: $urlRedirect) {
          urlRedirect { id path target }
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        urlRedirectCreate: {
          urlRedirect: {id: string; path: string; target: string} | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {urlRedirect: input});

      const {urlRedirect, userErrors} = res.urlRedirectCreate;
      if (userErrors.length > 0) {
        throw new Error(`リダイレクト作成失敗: ${translateUserErrors(userErrors)}`);
      }
      if (!urlRedirect) throw new Error('リダイレクト作成: レスポンスに urlRedirect が含まれません');

      log.info(`[createUrlRedirect] Created: ${urlRedirect.path} → ${urlRedirect.target} (${urlRedirect.id})`);
      return urlRedirect;
    } catch (err) {
      this.notifyError('createUrlRedirect', err);
      throw err;
    }
  }

  /**
   * URL リダイレクトを更新（効果器: 経路の再配線）
   */
  async updateUrlRedirect(
    id: string,
    input: UrlRedirectInput,
  ): Promise<{id: string; path: string; target: string}> {
    const gql = `
      mutation urlRedirectUpdate($id: ID!, $urlRedirect: UrlRedirectInput!) {
        urlRedirectUpdate(id: $id, urlRedirect: $urlRedirect) {
          urlRedirect { id path target }
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        urlRedirectUpdate: {
          urlRedirect: {id: string; path: string; target: string} | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {id, urlRedirect: input});

      const {urlRedirect, userErrors} = res.urlRedirectUpdate;
      if (userErrors.length > 0) {
        throw new Error(`リダイレクト更新失敗: ${translateUserErrors(userErrors)}`);
      }
      if (!urlRedirect) throw new Error('リダイレクト更新: レスポンスに urlRedirect が含まれません');

      log.info(`[updateUrlRedirect] Updated: ${urlRedirect.path} → ${urlRedirect.target} (${urlRedirect.id})`);
      return urlRedirect;
    } catch (err) {
      this.notifyError('updateUrlRedirect', err);
      throw err;
    }
  }

  /**
   * URL リダイレクトを削除（効果器: 経路の切断）
   * 冪等性: 既に削除済みの場合も true
   */
  async deleteUrlRedirect(id: string): Promise<boolean> {
    const gql = `
      mutation urlRedirectDelete($id: ID!) {
        urlRedirectDelete(id: $id) {
          deletedUrlRedirectId
          userErrors { field message }
        }
      }
    `;

    try {
      const res = await this.query<{
        urlRedirectDelete: {
          deletedUrlRedirectId: string | null;
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(gql, {id});

      const {userErrors} = res.urlRedirectDelete;
      if (userErrors.length > 0) {
        const isAlreadyDeleted = userErrors.some(
          (e) =>
            e.message.toLowerCase().includes('not found') ||
            e.message.toLowerCase().includes('does not exist'),
        );
        if (isAlreadyDeleted) {
          log.info(`[deleteUrlRedirect] Already deleted: ${id}`);
          return true;
        }
        throw new Error(`リダイレクト削除失敗: ${translateUserErrors(userErrors)}`);
      }

      log.info(`[deleteUrlRedirect] Deleted: ${id}`);
      return true;
    } catch (err) {
      this.notifyError('deleteUrlRedirect', err);
      throw err;
    }
  }

  // ── Files ライブラリ管理（patch 0067 — 管理画面完結化 P3）──

  /**
   * Shopify Files ライブラリを一覧取得
   * （受容器: 倉庫の在庫を覗き込む）
   *
   * @param first 1ページあたりの件数（最大 100）
   * @param query Shopify Files 検索クエリ（例: `media_type:IMAGE`、`filename:hero*`）
   * @param after カーソル（次ページ用）
   */
  async listFiles(
    first = 50,
    query?: string,
    after?: string,
  ): Promise<{
    items: ShopifyFileListItem[];
    pageInfo: {hasNextPage: boolean; endCursor: string | null};
  }> {
    const gql = `
      query Files($first: Int!, $query: String, $after: String) {
        files(first: $first, query: $query, after: $after, sortKey: CREATED_AT, reverse: true) {
          edges {
            cursor
            node {
              __typename
              id
              fileStatus
              alt
              createdAt
              preview { image { url } }
              ... on MediaImage {
                mimeType
                originalSource { url fileSize }
                image { url width height altText }
              }
              ... on GenericFile {
                mimeType
                url
                originalFileSize
                originalFileName: alt
              }
              ... on Video {
                originalSource { url width height }
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;

    try {
      type FileNode = {
        __typename: string;
        id: string;
        fileStatus: string;
        alt: string | null;
        createdAt: string;
        preview?: {image?: {url: string} | null} | null;
        mimeType?: string | null;
        originalSource?: {url?: string; fileSize?: number; width?: number; height?: number} | null;
        image?: {url: string; width: number | null; height: number | null; altText: string | null} | null;
        url?: string;
        originalFileSize?: number | null;
        originalFileName?: string | null;
      };

      const res = await this.query<{
        files: {
          edges: Array<{cursor: string; node: FileNode}>;
          pageInfo: {hasNextPage: boolean; endCursor: string | null};
        };
      }>(gql, {first, query, after});

      const items: ShopifyFileListItem[] = res.files.edges.map((e) => {
        const n = e.node;
        const isImage = n.__typename === 'MediaImage';
        const isVideo = n.__typename === 'Video';
        const previewUrl = n.preview?.image?.url || '';
        const url =
          (isImage ? n.image?.url : undefined) ||
          n.url ||
          n.originalSource?.url ||
          previewUrl ||
          '';
        return {
          id: n.id,
          fileStatus: n.fileStatus,
          url,
          previewUrl,
          alt: n.alt || n.image?.altText || '',
          mimeType: n.mimeType || (isVideo ? 'video/*' : isImage ? 'image/*' : 'application/octet-stream'),
          createdAt: n.createdAt,
          originalFileName: n.originalFileName || '',
          width: isImage ? n.image?.width ?? null : isVideo ? n.originalSource?.width ?? null : null,
          height: isImage ? n.image?.height ?? null : isVideo ? n.originalSource?.height ?? null : null,
          fileSize:
            n.originalFileSize ?? n.originalSource?.fileSize ?? null,
          typeName: n.__typename,
        };
      });

      return {items, pageInfo: res.files.pageInfo};
    } catch (err) {
      this.notifyError('listFiles', err);
      throw err;
    }
  }

  /**
   * Shopify Files ライブラリから複数ファイルを削除（効果器: 倉庫からの撤去）
   *
   * Shopify の fileDelete mutation は配列 ID を受けるバッチ削除。
   * 既に削除済みの ID も冪等に true を返す。
   *
   * @param fileIds 削除対象の gid 配列（gid://shopify/MediaImage/... 等）
   */
  async deleteFiles(fileIds: string[]): Promise<{deletedFileIds: string[]}> {
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return {deletedFileIds: []};
    }

    const gql = `
      mutation FileDelete($fileIds: [ID!]!) {
        fileDelete(fileIds: $fileIds) {
          deletedFileIds
          userErrors { field message code }
        }
      }
    `;

    try {
      const res = await this.query<{
        fileDelete: {
          deletedFileIds: string[] | null;
          userErrors: Array<{field: string[]; message: string; code: string}>;
        };
      }>(gql, {fileIds});

      const {userErrors, deletedFileIds} = res.fileDelete;

      if (userErrors && userErrors.length > 0) {
        // 全エラーが「存在しない」系なら冪等成功扱い
        const allMissing = userErrors.every(
          (e) =>
            e.message.toLowerCase().includes('not found') ||
            e.message.toLowerCase().includes('does not exist') ||
            (e.code || '').toLowerCase().includes('not_found'),
        );
        if (!allMissing) {
          throw new Error(
            `ファイル削除失敗: ${translateUserErrors(userErrors)}`,
          );
        }
        log.info(
          `[deleteFiles] Some files were already removed (${userErrors.length}); idempotent success`,
        );
      }

      const deleted = deletedFileIds || [];
      log.info(
        `[deleteFiles] Deleted ${deleted.length}/${fileIds.length} files (req: ${fileIds.length})`,
      );
      return {deletedFileIds: deleted};
    } catch (err) {
      this.notifyError('deleteFiles', err);
      throw err;
    }
  }

  /**
   * 単一ファイル削除のショートカット（冪等）
   */
  async deleteFile(id: string): Promise<boolean> {
    const {deletedFileIds} = await this.deleteFiles([id]);
    return deletedFileIds.includes(id) || true; // userErrors=not_found の場合も true
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
        throw new Error(`バリアント作成失敗: ${translateUserErrors(userErrors)}`);
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
        throw new Error(`バリアント更新失敗: ${translateUserErrors(userErrors)}`);
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
        throw new Error(`メタオブジェクト定義作成失敗: ${translateUserErrors(userErrors)}`);
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
        throw new Error(`メタオブジェクト定義更新失敗: ${translateUserErrors(userErrors)}`);
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

  // ══════════════════════════════════════════════════════════
  // メタオブジェクト定義 一覧/詳細/削除（patch 0068 — 管理画面完結化 P4）
  //
  // CEO が Shopify admin に行かずに新しい Metaobject タイプを
  // 定義・閲覧・廃棄できるようにするための拡張。
  // ══════════════════════════════════════════════════════════

  /**
   * メタオブジェクト定義の一覧を取得（cursor pagination）
   *
   * @param first 1〜100
   * @param after cursor（Relay）
   */
  async listMetaobjectDefinitions(
    first: number = 50,
    after?: string,
  ): Promise<{
    items: ShopifyMetaobjectDefinitionItem[];
    pageInfo: {hasNextPage: boolean; hasPreviousPage: boolean; endCursor: string | null};
  }> {
    const gql = `
      query listMetaobjectDefinitions($first: Int!, $after: String) {
        metaobjectDefinitions(first: $first, after: $after) {
          edges {
            cursor
            node {
              id
              type
              name
              description
              metaobjects(first: 1) { nodes { id } }
              fieldDefinitions {
                key
                name
                description
                required
                type { name }
              }
            }
          }
          pageInfo { hasNextPage hasPreviousPage endCursor }
        }
      }
    `;

    try {
      const res = await this.query<{
        metaobjectDefinitions: {
          edges: Array<{
            cursor: string;
            node: {
              id: string;
              type: string;
              name: string;
              description: string | null;
              metaobjects: {nodes: Array<{id: string}>};
              fieldDefinitions: Array<{
                key: string;
                name: string;
                description: string | null;
                required: boolean;
                type: {name: string};
              }>;
            };
          }>;
          pageInfo: {hasNextPage: boolean; hasPreviousPage: boolean; endCursor: string | null};
        };
      }>(gql, {first, after});

      const items: ShopifyMetaobjectDefinitionItem[] = res.metaobjectDefinitions.edges.map(e => ({
        id: e.node.id,
        type: e.node.type,
        name: e.node.name,
        description: e.node.description,
        fieldCount: e.node.fieldDefinitions.length,
        // metaobjects(first:1) で件数の有無のみ確認可（厳密件数は別 query 必要）。
        // 1件以上ヒットした場合は -1 を返し UI 側で「(>=1)」と表記する戦略でも可だが、
        // 単純に edges.length を返す（最大1）。
        metaobjectsCount: e.node.metaobjects.nodes.length,
        fieldDefinitions: e.node.fieldDefinitions.map(f => ({
          key: f.key,
          name: f.name,
          type: f.type.name,
          required: f.required,
          description: f.description,
        })),
      }));

      return {items, pageInfo: res.metaobjectDefinitions.pageInfo};
    } catch (err) {
      this.notifyError('listMetaobjectDefinitions', err);
      throw err;
    }
  }

  /**
   * 単一定義の詳細取得（type または id 指定）
   */
  async getMetaobjectDefinitionFull(
    typeOrId: {type?: string; id?: string},
  ): Promise<ShopifyMetaobjectDefinitionItem | null> {
    const fragmentBody = `
      id
      type
      name
      description
      metaobjects(first: 1) { nodes { id } }
      fieldDefinitions {
        key
        name
        description
        required
        type { name }
      }
    `;

    let gql: string;
    let variables: Record<string, string>;

    if (typeOrId.id) {
      gql = `query metaobjectDefinitionById($id: ID!) { metaobjectDefinition(id: $id) { ${fragmentBody} } }`;
      variables = {id: typeOrId.id};
    } else if (typeOrId.type) {
      gql = `query metaobjectDefinitionByType($type: String!) { metaobjectDefinitionByType(type: $type) { ${fragmentBody} } }`;
      variables = {type: typeOrId.type};
    } else {
      throw new Error('getMetaobjectDefinitionFull: type または id を指定してください');
    }

    try {
      const res = await this.query<Record<string, {
        id: string;
        type: string;
        name: string;
        description: string | null;
        metaobjects: {nodes: Array<{id: string}>};
        fieldDefinitions: Array<{
          key: string;
          name: string;
          description: string | null;
          required: boolean;
          type: {name: string};
        }>;
      } | null>>(gql, variables);

      const node = typeOrId.id ? res.metaobjectDefinition : res.metaobjectDefinitionByType;
      if (!node) return null;

      return {
        id: node.id,
        type: node.type,
        name: node.name,
        description: node.description,
        fieldCount: node.fieldDefinitions.length,
        metaobjectsCount: node.metaobjects.nodes.length,
        fieldDefinitions: node.fieldDefinitions.map(f => ({
          key: f.key,
          name: f.name,
          type: f.type.name,
          required: f.required,
          description: f.description,
        })),
      };
    } catch (err) {
      this.notifyError('getMetaobjectDefinitionFull', err);
      throw err;
    }
  }

  /**
   * メタオブジェクト定義を削除
   *
   * **危険**: 実体の Metaobject インスタンスがある場合、それらも全て削除される。
   * 必ず UI 側で metaobjectsCount を確認させ、明示的な確認ダイアログを表示すること。
   *
   * 戻り値:
   *   - deletedId: 削除した GID（成功時）
   *   - notFound: 既に存在しない場合 true（idempotent — 並行削除で安全）
   */
  async deleteMetaobjectDefinition(
    id: string,
  ): Promise<{deletedId: string | null; notFound: boolean}> {
    const gql = `
      mutation metaobjectDefinitionDelete($id: ID!) {
        metaobjectDefinitionDelete(id: $id) {
          deletedId
          userErrors { field message code }
        }
      }
    `;

    try {
      const res = await this.query<{
        metaobjectDefinitionDelete: {
          deletedId: string | null;
          userErrors: Array<{field: string[] | null; message: string; code: string | null}>;
        };
      }>(gql, {id});

      const {deletedId, userErrors} = res.metaobjectDefinitionDelete;

      if (userErrors.length > 0) {
        const isNotFound = userErrors.every(
          e =>
            (e.code && /not[_-]?found/i.test(e.code)) ||
            /not\s+found|does\s+not\s+exist|存在しません/i.test(e.message),
        );
        if (isNotFound) {
          log.info(`[deleteMetaobjectDefinition] Not found (idempotent): ${id}`);
          return {deletedId: null, notFound: true};
        }
        throw new Error(`メタオブジェクト定義削除失敗: ${translateUserErrors(userErrors)}`);
      }

      log.info(`[deleteMetaobjectDefinition] Deleted: ${deletedId || id}`);
      return {deletedId, notFound: false};
    } catch (err) {
      this.notifyError('deleteMetaobjectDefinition', err);
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
        throw new Error(`メタオブジェクト作成失敗: ${translateUserErrors(userErrors)}`);
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
        throw new Error(`メタオブジェクト更新失敗: ${translateUserErrors(userErrors)}`);
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
        throw new Error(`メタオブジェクト削除失敗: ${translateUserErrors(userErrors)}`);
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
   *
   * patch 0115: updatedAt を取得対象に追加（楽観的ロック CAS で使用）。
   * GET /api/admin/* がレスポンスに updatedAt を含められるようにするため。
   */
  async getMetaobjects(type: string, first = 50): Promise<Array<{id: string; handle: string; updatedAt: string; fields: MetaobjectField[]}>> {
    const gql = `
      query getMetaobjects($type: String!, $first: Int!) {
        metaobjects(type: $type, first: $first) {
          nodes {
            id
            handle
            updatedAt
            fields { key value }
          }
        }
      }
    `;

    try {
      const res = await this.query<{
        metaobjects: {
          nodes: Array<{id: string; handle: string; updatedAt: string; fields: Array<{key: string; value: string}>}>;
        };
      }>(gql, {type, first});

      return res.metaobjects?.nodes || [];
    } catch (err) {
      this.notifyError('getMetaobjects', err);
      return [];
    }
  }

  /**
   * メタオブジェクトを ID 単体取得（CAS 用）— patch 0115 (P2-5)
   *
   * 楽観的ロックのために mutation 直前に最新 updatedAt を取得する。
   * 削除済み (null 返却) の場合も CAS 衝突として扱える。
   */
  async getMetaobjectById(id: string): Promise<{id: string; handle: string; updatedAt: string; fields: MetaobjectField[]} | null> {
    const gql = `
      query getMetaobjectById($id: ID!) {
        metaobject(id: $id) {
          id
          handle
          updatedAt
          fields { key value }
        }
      }
    `;

    try {
      const res = await this.query<{
        metaobject: {id: string; handle: string; updatedAt: string; fields: Array<{key: string; value: string}>} | null;
      }>(gql, {id});

      return res.metaobject || null;
    } catch (err) {
      this.notifyError('getMetaobjectById', err);
      return null;
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
      throw new Error(`Staged upload 作成失敗: ${translateUserErrors(userErrors)}`);
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
      throw new Error(`ファイル作成失敗: ${translateUserErrors(userErrors)}`);
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
        throw new Error(`バリアント一括更新失敗: ${translateUserErrors(userErrors)}`);
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
        throw new Error(`バリアント一括作成失敗: ${translateUserErrors(userErrors)}`);
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
        throw new Error(`在庫調整失敗: ${translateUserErrors(userErrors)}`);
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
    updatedAt: string;
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
          updatedAt
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
          updatedAt: string;
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
        updatedAt: p.updatedAt || '',
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
        throw new Error(`商品公開失敗: ${translateUserErrors(userErrors)}`);
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
        throw new Error(`商品非公開失敗: ${translateUserErrors(userErrors)}`);
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Discount Code CRUD — patch 0069 (CEO 二段階修正撤廃 P5)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //
  // 効果器: キャンペーン配信（心臓→末梢までホルモンを流す）
  // 想定 use case: CEO が「SPRING10」で全商品 10% OFF キャンペーンコードを発行、
  // 終了後に削除、という一連の割引運用を Shopify admin を開かずに完結。
  //
  // 必要 scope: read_discounts, write_discounts
  // (未付与の場合はトークン再認可が必要。patch 0066 の urlRedirects と同じ流れ)

  /**
   * 割引コード（Basic Discount Code）一覧取得
   * — patch 0069: Discount Code Basic を最新順で取得
   */
  async listDiscountCodes(
    first = 50,
    after?: string,
  ): Promise<{
    items: ShopifyDiscountCodeItem[];
    pageInfo: {hasNextPage: boolean; hasPreviousPage: boolean; endCursor: string | null};
  }> {
    const gql = `
      query listDiscountNodes($first: Int!, $after: String) {
        discountNodes(
          first: $first
          after: $after
          sortKey: CREATED_AT
          reverse: true
          query: "type:discount_code_basic"
        ) {
          edges {
            cursor
            node {
              id
              discount {
                __typename
                ... on DiscountCodeBasic {
                  title
                  summary
                  status
                  startsAt
                  endsAt
                  usageLimit
                  asyncUsageCount
                  customerSelection { __typename }
                  codes(first: 1) { nodes { code } }
                  customerGets {
                    value {
                      __typename
                      ... on DiscountPercentage { percentage }
                      ... on DiscountAmount { amount { amount currencyCode } appliesOnEachItem }
                    }
                  }
                }
              }
            }
          }
          pageInfo { hasNextPage hasPreviousPage endCursor }
        }
      }
    `;

    try {
      const res = await this.query<{
        discountNodes: {
          edges: Array<{
            cursor: string;
            node: {
              id: string;
              discount: {
                __typename: string;
                title?: string;
                summary?: string;
                status?: string;
                startsAt?: string;
                endsAt?: string | null;
                usageLimit?: number | null;
                asyncUsageCount?: number;
                customerSelection?: {__typename: string};
                codes?: {nodes: Array<{code: string}>};
                customerGets?: {
                  value: {
                    __typename: string;
                    percentage?: number;
                    amount?: {amount: string; currencyCode: string};
                    appliesOnEachItem?: boolean;
                  };
                };
              };
            };
          }>;
          pageInfo: {hasNextPage: boolean; hasPreviousPage: boolean; endCursor: string | null};
        };
      }>(gql, {first: Math.max(1, Math.min(first, 100)), after: after ?? null});

      const items: ShopifyDiscountCodeItem[] = res.discountNodes.edges
        .filter((e) => e.node.discount.__typename === 'DiscountCodeBasic')
        .map((e) => {
          const d = e.node.discount;
          const value = d.customerGets?.value;
          let kind: ShopifyDiscountCodeItem['kind'] = 'unknown';
          let percentage: number | null = null;
          let fixedAmount: number | null = null;
          if (value?.__typename === 'DiscountPercentage' && typeof value.percentage === 'number') {
            kind = 'percentage';
            percentage = value.percentage;
          } else if (value?.__typename === 'DiscountAmount' && value.amount) {
            kind = 'fixed_amount';
            fixedAmount = Number(value.amount.amount);
          }
          return {
            id: e.node.id,
            title: d.title ?? '',
            code: d.codes?.nodes[0]?.code ?? '',
            status: d.status ?? 'UNKNOWN',
            startsAt: d.startsAt ?? '',
            endsAt: d.endsAt ?? null,
            usageLimit: d.usageLimit ?? null,
            asyncUsageCount: d.asyncUsageCount ?? 0,
            kind,
            percentage,
            fixedAmount,
            appliesToAllCustomers: d.customerSelection?.__typename === 'DiscountCustomerAll',
            summary: d.summary ?? '',
          };
        });

      log.info(`[listDiscountCodes] Fetched ${items.length} discount codes`);
      return {items, pageInfo: res.discountNodes.pageInfo};
    } catch (err) {
      this.notifyError('listDiscountCodes', err);
      throw err;
    }
  }

  /**
   * 割引コード (Basic) を新規作成
   * — patch 0069: percentage | fixed_amount の 2 種をサポート
   *
   * @param input.title           管理上のタイトル（例: "2026春キャンペーン"）
   * @param input.code            コード文字列（例: "SPRING10"）
   * @param input.kind            'percentage' | 'fixed_amount'
   * @param input.percentage      0.01〜1.00（10% = 0.1）kind=percentage のとき必須
   * @param input.fixedAmount     固定額（円）kind=fixed_amount のとき必須
   * @param input.startsAt        ISO 8601 開始日時（例: "2026-04-20T00:00:00Z"）
   * @param input.endsAt          ISO 8601 終了日時（任意）
   * @param input.usageLimit      利用回数上限（任意、null=無制限）
   * @param input.appliesOncePerCustomer 1顧客1回制限
   */
  async createDiscountCodeBasic(input: {
    title: string;
    code: string;
    kind: 'percentage' | 'fixed_amount';
    percentage?: number;
    fixedAmount?: number;
    startsAt: string;
    endsAt?: string | null;
    usageLimit?: number | null;
    appliesOncePerCustomer?: boolean;
  }): Promise<{id: string; code: string; title: string}> {
    // 値バリデーション
    if (input.kind === 'percentage' && (input.percentage == null || input.percentage <= 0 || input.percentage > 1)) {
      throw new Error('percentage は 0 より大きく 1 以下 (= 100%) である必要があります');
    }
    if (input.kind === 'fixed_amount' && (input.fixedAmount == null || input.fixedAmount <= 0)) {
      throw new Error('fixedAmount は 0 より大きい数値である必要があります');
    }

    // customerGets.value を kind に応じて組み立て
    const value =
      input.kind === 'percentage'
        ? {percentage: input.percentage}
        : {discountAmount: {amount: String(input.fixedAmount!), appliesOnEachItem: false}};

    const gql = `
      mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                title
                codes(first: 1) { nodes { code } }
              }
            }
          }
          userErrors { field message code }
        }
      }
    `;

    try {
      const res = await this.query<{
        discountCodeBasicCreate: {
          codeDiscountNode: {
            id: string;
            codeDiscount: {title: string; codes: {nodes: Array<{code: string}>}};
          } | null;
          userErrors: Array<{field: string[] | null; message: string; code: string | null}>;
        };
      }>(gql, {
        basicCodeDiscount: {
          title: input.title,
          code: input.code,
          startsAt: input.startsAt,
          endsAt: input.endsAt ?? null,
          customerSelection: {all: true},
          customerGets: {items: {all: true}, value},
          usageLimit: input.usageLimit ?? null,
          appliesOncePerCustomer: input.appliesOncePerCustomer ?? false,
        },
      });

      const {codeDiscountNode, userErrors} = res.discountCodeBasicCreate;
      if (userErrors.length > 0) {
        throw new Error(`割引コード作成失敗: ${translateUserErrors(userErrors)}`);
      }
      if (!codeDiscountNode) {
        throw new Error('割引コード作成失敗: ノードが返されませんでした');
      }

      log.info(`[createDiscountCodeBasic] Created: ${codeDiscountNode.id} (${input.code})`);
      return {
        id: codeDiscountNode.id,
        code: codeDiscountNode.codeDiscount.codes.nodes[0]?.code ?? input.code,
        title: codeDiscountNode.codeDiscount.title ?? input.title,
      };
    } catch (err) {
      this.notifyError('createDiscountCodeBasic', err);
      throw err;
    }
  }

  /**
   * 割引コード (Basic) を削除
   * — patch 0069: 冪等 (not-found → success 扱い)
   */
  async deleteDiscountCode(id: string): Promise<{deletedId: string | null; notFound: boolean}> {
    const gql = `
      mutation discountCodeDelete($id: ID!) {
        discountCodeDelete(id: $id) {
          deletedCodeDiscountId
          userErrors { field message code }
        }
      }
    `;

    try {
      const res = await this.query<{
        discountCodeDelete: {
          deletedCodeDiscountId: string | null;
          userErrors: Array<{field: string[] | null; message: string; code: string | null}>;
        };
      }>(gql, {id});

      const {deletedCodeDiscountId, userErrors} = res.discountCodeDelete;
      if (userErrors.length > 0) {
        const isNotFound = userErrors.every(
          (e) =>
            (e.code && /not[_-]?found/i.test(e.code)) ||
            /not\s+found|does\s+not\s+exist|存在しません/i.test(e.message),
        );
        if (isNotFound) {
          log.info(`[deleteDiscountCode] Not found (idempotent): ${id}`);
          return {deletedId: null, notFound: true};
        }
        throw new Error(`割引コード削除失敗: ${translateUserErrors(userErrors)}`);
      }

      log.info(`[deleteDiscountCode] Deleted: ${deletedCodeDiscountId || id}`);
      return {deletedId: deletedCodeDiscountId, notFound: false};
    } catch (err) {
      this.notifyError('deleteDiscountCode', err);
      throw err;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Navigation Menu CRUD — patch 0070 (CEO 二段階修正撤廃 P6)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //
  // 効果器: 末梢神経路の再配線（ヘッダー/フッターの導線を組み替える）
  // 想定 use case: CEO が新しいキャンペーンページやコレクションを追加したとき、
  // ヘッダー/フッターの「メニュー項目」を Shopify admin を開かず管理画面から並べ替え・追加・削除する。
  //
  // 必要 scope: read_online_store_navigation, write_online_store_navigation
  // (patch 0066 の urlRedirects と同じ scope — 追加認可不要)
  //
  // 深さ上限: Shopify の仕様で最大 3 階層まで (trim する責任は呼び出し側)
  // 参照: https://shopify.dev/docs/api/admin-graphql/latest/objects/Menu

  /**
   * ナビゲーションメニュー一覧
   * — patch 0070: handle / title / 項目数 のみの summary
   */
  async listMenus(
    first = 50,
    after?: string,
  ): Promise<{
    items: ShopifyMenuSummary[];
    pageInfo: {hasNextPage: boolean; hasPreviousPage: boolean; endCursor: string | null};
  }> {
    // patch 0133 (2026-04-23): Shopify Admin API 2025-10 schema 整合修正
    // Menu 型は itemsCount / updatedAt を持たないため、items { id } を取得して
    // length で件数算出する。CAS の updatedAt は menu には不要 (Shopify が
    // menuUpdate で全置換するため楽観的ロックは menu レベルでは効かない)。
    const gql = `
      query listMenus($first: Int!, $after: String) {
        menus(first: $first, after: $after, sortKey: TITLE) {
          edges {
            cursor
            node {
              id
              handle
              title
              isDefault
              items { id }
            }
          }
          pageInfo { hasNextPage hasPreviousPage endCursor }
        }
      }
    `;

    try {
      const res = await this.query<{
        menus: {
          edges: Array<{
            cursor: string;
            node: {
              id: string;
              handle: string;
              title: string;
              isDefault: boolean;
              items: Array<{id: string}>;
            };
          }>;
          pageInfo: {hasNextPage: boolean; hasPreviousPage: boolean; endCursor: string | null};
        };
      }>(gql, {first: Math.max(1, Math.min(first, 100)), after: after ?? null});

      const items: ShopifyMenuSummary[] = res.menus.edges.map((e) => ({
        id: e.node.id,
        handle: e.node.handle,
        title: e.node.title,
        itemsCount: e.node.items.length,
        isDefault: e.node.isDefault,
      }));

      log.info(`[listMenus] Fetched ${items.length} menus`);
      return {items, pageInfo: res.menus.pageInfo};
    } catch (err) {
      this.notifyError('listMenus', err);
      throw err;
    }
  }

  /**
   * メニュー詳細（ネストした items ツリーつき）
   * — patch 0070: 深さ 3 階層まで取得。それ以上は切り捨て
   */
  async getMenu(id: string): Promise<ShopifyMenuDetail> {
    const itemFragment = `
      id
      title
      type
      resourceId
      url
      tags
    `;
    // patch 0133 (2026-04-23): Shopify Admin API 2025-10 schema 整合修正
    // Menu 型に itemsCount / updatedAt 無し → items.length で代用
    // 深さ 3 までのネスト（Shopify 仕様上限）
    const gql = `
      query getMenu($id: ID!) {
        menu(id: $id) {
          id
          handle
          title
          isDefault
          items {
            ${itemFragment}
            items {
              ${itemFragment}
              items {
                ${itemFragment}
              }
            }
          }
        }
      }
    `;

    try {
      const res = await this.query<{
        menu: {
          id: string;
          handle: string;
          title: string;
          isDefault: boolean;
          items: ShopifyMenuItemRaw[];
        } | null;
      }>(gql, {id});

      if (!res.menu) {
        throw new Error(`メニューが見つかりません: ${id}`);
      }

      const items = normalizeMenuItemsTree(res.menu.items);
      log.info(`[getMenu] Fetched: ${id} (${items.length} top-level items)`);
      return {
        id: res.menu.id,
        handle: res.menu.handle,
        title: res.menu.title,
        itemsCount: items.length,
        isDefault: res.menu.isDefault,
        items,
      };
    } catch (err) {
      this.notifyError('getMenu', err);
      throw err;
    }
  }

  /**
   * メニュー新規作成
   * — patch 0070: handle は URL handle として使われる (重複不可)
   */
  async createMenu(input: {
    title: string;
    handle: string;
    items?: ShopifyMenuItem[];
  }): Promise<{id: string; handle: string; title: string}> {
    const gql = `
      mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
        menuCreate(title: $title, handle: $handle, items: $items) {
          menu { id handle title }
          userErrors { field message code }
        }
      }
    `;

    const itemsForCreate = toMenuItemCreateInputList(input.items ?? []);

    try {
      const res = await this.query<{
        menuCreate: {
          menu: {id: string; handle: string; title: string} | null;
          userErrors: Array<{field: string[] | null; message: string; code: string | null}>;
        };
      }>(gql, {
        title: input.title,
        handle: input.handle,
        items: itemsForCreate,
      });

      const {menu, userErrors} = res.menuCreate;
      if (userErrors.length > 0) {
        throw new Error(`メニュー作成失敗: ${translateUserErrors(userErrors)}`);
      }
      if (!menu) {
        throw new Error('メニュー作成失敗: ノードが返されませんでした');
      }

      log.info(`[createMenu] Created: ${menu.id} (${menu.handle})`);
      return menu;
    } catch (err) {
      this.notifyError('createMenu', err);
      throw err;
    }
  }

  /**
   * メニュー更新 (title / handle / items を丸ごと置換)
   * — patch 0070: items は全置換方式 (Shopify の menuUpdate 仕様)
   * — patch 0113 (P1-3, 全保存パターン監査 2026-04-22):
   *   構造的 partial 化は Shopify 仕様で不可能 (per-MenuItem mutation 不在)。
   *   代わりに更新前後の diff を計算して呼出元に返却 → AuditLog にリッチに残せる。
   *   呼出側で current 取得 → 差分送信 → diff 検証のフローを推奨。
   *
   *   ID 保持の不変条件: 既存 MenuItem は input.items[*].id で識別される。
   *   id を抜かして送ると Shopify は新規作成扱い → 外部参照切断のリスク。
   *   computeMenuItemsDiff() で kept/added/removed/renamed を可視化する。
   */
  async updateMenu(
    id: string,
    input: {
      title: string;
      handle: string;
      items: ShopifyMenuItem[];
      // patch 0113: 呼出側から渡す現在値スナップショット (UI で getMenu 直後の items)。
      // 渡された場合、差分を計算して result.diff に詰めて返す。
      currentItems?: ShopifyMenuItem[];
    },
  ): Promise<{id: string; handle: string; title: string; diff?: MenuItemsDiff}> {
    const gql = `
      mutation menuUpdate(
        $id: ID!
        $title: String!
        $handle: String!
        $items: [MenuItemUpdateInput!]!
      ) {
        menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
          menu { id handle title }
          userErrors { field message code }
        }
      }
    `;

    const itemsForUpdate = toMenuItemUpdateInputList(input.items);

    // patch 0113: 差分計算 (currentItems が無い場合は undefined を返す)
    const diff = input.currentItems
      ? computeMenuItemsDiff(input.currentItems, input.items)
      : undefined;

    try {
      const res = await this.query<{
        menuUpdate: {
          menu: {id: string; handle: string; title: string} | null;
          userErrors: Array<{field: string[] | null; message: string; code: string | null}>;
        };
      }>(gql, {
        id,
        title: input.title,
        handle: input.handle,
        items: itemsForUpdate,
      });

      const {menu, userErrors} = res.menuUpdate;
      if (userErrors.length > 0) {
        throw new Error(`メニュー更新失敗: ${translateUserErrors(userErrors)}`);
      }
      if (!menu) {
        throw new Error('メニュー更新失敗: ノードが返されませんでした');
      }

      if (diff) {
        log.info(
          `[updateMenu] Updated: ${menu.id} (kept=${diff.kept} added=${diff.added} removed=${diff.removed} renamed=${diff.renamed})`,
        );
      } else {
        log.info(`[updateMenu] Updated: ${menu.id} (${input.items.length} top-level items, no diff)`);
      }

      return {...menu, diff};
    } catch (err) {
      this.notifyError('updateMenu', err);
      throw err;
    }
  }

  /**
   * メニュー削除
   * — patch 0070: 冪等 (not-found → success 扱い)。既定メニュー (main-menu/footer) は削除不可エラーを投げる
   */
  async deleteMenu(id: string): Promise<{deletedId: string | null; notFound: boolean}> {
    const gql = `
      mutation menuDelete($id: ID!) {
        menuDelete(id: $id) {
          deletedMenuId
          userErrors { field message code }
        }
      }
    `;

    try {
      const res = await this.query<{
        menuDelete: {
          deletedMenuId: string | null;
          userErrors: Array<{field: string[] | null; message: string; code: string | null}>;
        };
      }>(gql, {id});

      const {deletedMenuId, userErrors} = res.menuDelete;
      if (userErrors.length > 0) {
        const isNotFound = userErrors.every(
          (e) =>
            (e.code && /not[_-]?found/i.test(e.code)) ||
            /not\s+found|does\s+not\s+exist|存在しません/i.test(e.message),
        );
        if (isNotFound) {
          log.info(`[deleteMenu] Not found (idempotent): ${id}`);
          return {deletedId: null, notFound: true};
        }
        throw new Error(`メニュー削除失敗: ${translateUserErrors(userErrors)}`);
      }

      log.info(`[deleteMenu] Deleted: ${deletedMenuId || id}`);
      return {deletedId: deletedMenuId, notFound: false};
    } catch (err) {
      this.notifyError('deleteMenu', err);
      throw err;
    }
  }

}

// ── Menu 補助 (patch 0070) ──

/** GraphQL が返す MenuItem の生形（items が任意深さで再帰） */
interface ShopifyMenuItemRaw {
  id?: string | null;
  title: string;
  type: string;
  resourceId?: string | null;
  url?: string | null;
  tags?: string[] | null;
  items?: ShopifyMenuItemRaw[] | null;
}

/**
 * GraphQL レスポンスの items ツリーを ShopifyMenuItem に正規化
 * — 深さ 3 階層以降は Shopify が返さないので null check のみ
 */
function normalizeMenuItemsTree(raw: ShopifyMenuItemRaw[] | null | undefined): ShopifyMenuItem[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.map((r) => ({
    id: r.id ?? undefined,
    title: r.title,
    type: (r.type as ShopifyMenuItemType) ?? 'HTTP',
    resourceId: r.resourceId ?? null,
    url: r.url ?? null,
    tags: Array.isArray(r.tags) ? r.tags : [],
    items: normalizeMenuItemsTree(r.items),
  }));
}

/**
 * ShopifyMenuItem[] → MenuItemCreateInput[] へ変換
 * — Shopify の schema が要求するキーだけ残す
 */
function toMenuItemCreateInputList(items: ShopifyMenuItem[]): Array<Record<string, unknown>> {
  return items.map((it) => toMenuItemCreateInput(it));
}

function toMenuItemCreateInput(it: ShopifyMenuItem): Record<string, unknown> {
  const out: Record<string, unknown> = {
    title: it.title,
    type: it.type,
  };
  if (it.resourceId) out.resourceId = it.resourceId;
  if (it.url) out.url = it.url;
  if (it.tags && it.tags.length > 0) out.tags = it.tags;
  if (it.items && it.items.length > 0) {
    out.items = it.items.map((child) => toMenuItemCreateInput(child));
  }
  return out;
}

/**
 * ShopifyMenuItem[] → MenuItemUpdateInput[] へ変換
 * — update は既存 id を渡せば同一 MenuItem を維持、なければ新規作成扱い
 */
function toMenuItemUpdateInputList(items: ShopifyMenuItem[]): Array<Record<string, unknown>> {
  return items.map((it) => toMenuItemUpdateInput(it));
}

function toMenuItemUpdateInput(it: ShopifyMenuItem): Record<string, unknown> {
  const out: Record<string, unknown> = {
    title: it.title,
    type: it.type,
  };
  if (it.id) out.id = it.id;
  if (it.resourceId) out.resourceId = it.resourceId;
  if (it.url) out.url = it.url;
  if (it.tags && it.tags.length > 0) out.tags = it.tags;
  if (it.items && it.items.length > 0) {
    out.items = it.items.map((child) => toMenuItemUpdateInput(child));
  }
  return out;
}

/**
 * patch 0113 (P1-3, 全保存パターン監査 2026-04-22):
 * メニュー項目の差分計算ヘルパー。
 *
 * Shopify の menuUpdate は items[] 全置換が仕様 (per-item mutation 不在)。
 * したがって構造的な partial update は不可能だが、UI は MenuItem の id を保持して
 * 送信している (toMenuItemUpdateInput が `if (it.id) out.id = it.id`)。
 *
 * このヘルパーは「保存時に何が起きるか」を呼出元に伝えるための診断ツール:
 *   - kept: 既存 id を持って送られている項目数 (Shopify 側で in-place update)
 *   - added: id を持たない項目 = 新規 MenuItem として作成される
 *   - removed: 既存 menu には居たが今回送信されない項目 = 削除される
 *   - renamed: id 一致だが title が変わる項目 (既存 id 維持・タイトルだけ変更)
 *
 * Why: 「1 項目リネームで MenuItem id 全変化 → 外部参照切断」は構造ではなく UI ミス
 * (id を抜かす) で起きる。AuditLog にこの diff を残せば事故時のロールバックが可能になる。
 */
export interface MenuItemsDiff {
  kept: number; // 既存 id 保持
  added: number; // 新規 (id なし)
  removed: number; // 今回送信されない既存項目
  renamed: number; // id 一致 + title 変更
  totalIncoming: number;
  totalCurrent: number;
}

function flattenMenuItems(items: ShopifyMenuItem[] | undefined): ShopifyMenuItem[] {
  if (!items) return [];
  const out: ShopifyMenuItem[] = [];
  for (const it of items) {
    out.push(it);
    if (it.items && it.items.length > 0) {
      out.push(...flattenMenuItems(it.items));
    }
  }
  return out;
}

export function computeMenuItemsDiff(
  current: ShopifyMenuItem[] | undefined,
  incoming: ShopifyMenuItem[] | undefined,
): MenuItemsDiff {
  const flatCurrent = flattenMenuItems(current);
  const flatIncoming = flattenMenuItems(incoming);

  const currentById = new Map<string, ShopifyMenuItem>();
  for (const it of flatCurrent) {
    if (it.id) currentById.set(it.id, it);
  }

  const incomingIds = new Set<string>();
  let kept = 0;
  let added = 0;
  let renamed = 0;

  for (const it of flatIncoming) {
    if (it.id) {
      incomingIds.add(it.id);
      const existing = currentById.get(it.id);
      if (existing) {
        kept += 1;
        if ((existing.title || '').trim() !== (it.title || '').trim()) {
          renamed += 1;
        }
      } else {
        // id 指定だが現状に存在しない (UI バグ or stale state)
        added += 1;
      }
    } else {
      added += 1;
    }
  }

  let removed = 0;
  for (const id of currentById.keys()) {
    if (!incomingIds.has(id)) removed += 1;
  }

  return {
    kept,
    added,
    removed,
    renamed,
    totalIncoming: flatIncoming.length,
    totalCurrent: flatCurrent.length,
  };
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
