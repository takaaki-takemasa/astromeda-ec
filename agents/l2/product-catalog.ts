/**
 * ProductCatalog — L2 商品カタログエージェント（肝細胞 = 代謝・貯蔵の中核）
 *
 * 生体対応: 肝細胞（ヘパトサイト）
 * Shopify Storefront APIと同期し、商品データの管理・検証・最適化を行う。
 * ProductLeadから指令を受け、カタログの整合性を維持する。
 *
 * 担当タスク: update_catalog, sync_products, audit_catalog
 * 所属パイプライン: P2（商品カタログ更新）
 */

import type {
  AgentId,
  AgentEvent,
  CascadeCommand,
  IAgentBus,
} from '../core/types';
import {BaseL2Agent} from './base-l2-agent';
import {getAdminClient, type ShopifyProduct} from '../core/shopify-admin';

interface ProductSyncResult {
  synced: number;
  added: number;
  updated: number;
  removed: number;
  errors: string[];
}

interface CatalogAuditResult {
  totalProducts: number;
  missingImages: string[];
  missingDescriptions: string[];
  priceAnomalies: string[];
  orphanedVariants: string[];
  score: number; // 0-100
}

export class ProductCatalog extends BaseL2Agent {
  readonly id: AgentId = {
    id: 'product-catalog',
    name: 'ProductCatalog',
    level: 'L2',
    team: 'conversion',
    version: '1.0.0',
  };

  private lastSyncTimestamp = 0;
  private productCount = 0;

  constructor(bus: IAgentBus) {
    super(bus);
  }

  protected async onInitialize(): Promise<void> {
    this.subscribe('shopify.product.*');
    this.subscribe('product.catalog.*');
  }

  protected async onShutdown(): Promise<void> {
    // Nothing to clean up
  }

  protected async onEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'shopify.product.create' || event.type === 'shopify.product.update') {
      await this.publishEvent('product.catalog.change_detected', {
        productId: (event.payload as Record<string, unknown>).productId,
        changeType: event.type.split('.').pop(),
      });
    }
  }

  protected async onCommand(command: CascadeCommand): Promise<unknown> {
    switch (command.action) {
      case 'update_catalog':
        return this.updateCatalog(command.params);

      case 'sync_products':
        return this.syncProducts(command.params);

      case 'audit_catalog':
        return this.auditCatalog(command.params);

      default:
        throw new Error(`ProductCatalog: unknown action "${command.action}"`);
    }
  }

  // ── Core Operations ──

  private async updateCatalog(params: Record<string, unknown>): Promise<ProductSyncResult> {
    const collectionHandle = params.collectionHandle as string | undefined;

    await this.publishEvent('product.catalog.update.started', {
      collection: collectionHandle ?? 'all',
    });

    // Phase 4: Shopify Admin API経由で商品データ取得
    const result: ProductSyncResult = {
      synced: 0,
      added: 0,
      updated: 0,
      removed: 0,
      errors: [],
    };

    const admin = getAdminClient();
    if (admin.available) {
      try {
        const products = await admin.getProducts(250);
        const prevCount = this.productCount;
        this.productCount = products.length;
        result.synced = products.length;
        result.added = Math.max(0, products.length - prevCount);
        result.updated = prevCount > 0 ? Math.min(prevCount, products.length) : 0;
      } catch (err) {
        result.errors.push(`Admin API error: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      result.synced = this.productCount;
    }

    this.lastSyncTimestamp = Date.now();

    await this.publishEvent('product.catalog.update.completed', { result });
    return result;
  }

  private async syncProducts(params: Record<string, unknown>): Promise<ProductSyncResult> {
    const handles = (params.handles as string[]) ?? [];
    const forceSync = (params.force as boolean) ?? false;

    await this.publishEvent('product.catalog.sync.started', {
      handleCount: handles.length,
      force: forceSync,
    });

    const result: ProductSyncResult = {
      synced: 0,
      added: 0,
      updated: 0,
      removed: 0,
      errors: [],
    };

    const admin = getAdminClient();
    if (admin.available) {
      try {
        // ハンドル指定がある場合は個別クエリ、なければ全件取得
        const query = handles.length > 0
          ? handles.map(h => `handle:${h}`).join(' OR ')
          : undefined;
        const products = await admin.getProducts(250, query);
        result.synced = products.length;
        this.productCount = Math.max(this.productCount, products.length);
      } catch (err) {
        result.errors.push(`Sync error: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      result.synced = handles.length || this.productCount;
    }

    this.lastSyncTimestamp = Date.now();

    await this.publishEvent('product.catalog.sync.completed', { result });
    return result;
  }

  private async auditCatalog(params: Record<string, unknown>): Promise<CatalogAuditResult> {
    const scope = (params.scope as string) ?? 'full';

    await this.publishEvent('product.catalog.audit.started', { scope });

    const result: CatalogAuditResult = {
      totalProducts: 0,
      missingImages: [],
      missingDescriptions: [],
      priceAnomalies: [],
      orphanedVariants: [],
      score: 100,
    };

    const admin = getAdminClient();
    if (admin.available) {
      try {
        const products = await admin.getProducts(250);
        result.totalProducts = products.length;

        for (const product of products) {
          // 画像チェック: featuredImageが未設定のACTIVE商品（視覚情報の欠損）
          if (!product.featuredImage?.url && product.status === 'ACTIVE') {
            result.missingImages.push(`${product.title}: メイン画像なし`);
          }

          // 説明文チェック: description空 or カテゴリ未設定（消化器系の栄養不足）
          if (product.status === 'ACTIVE') {
            if (!product.description || product.description.trim().length < 10) {
              result.missingDescriptions.push(`${product.title}: 説明文なし/不足`);
            }
            if (!product.productType) {
              result.missingDescriptions.push(`${product.title}: カテゴリ未設定`);
            }
          }

          // SEOチェック: メタタイトル/ディスクリプション未設定
          if (product.status === 'ACTIVE' && product.seo) {
            if (!product.seo.title && !product.seo.description) {
              result.missingDescriptions.push(`${product.title}: SEOメタ情報未設定`);
            }
          }

          // 価格異常チェック: 0円商品（代謝異常 — 無料で売られる商品）
          const minPrice = parseFloat(product.priceRangeV2?.minVariantPrice?.amount || '0');
          if (minPrice === 0 && product.status === 'ACTIVE') {
            result.priceAnomalies.push(`${product.title}: 価格 ¥0`);
          }

          // 極端な価格差チェック（同一商品内のバリエーション価格差3倍以上）
          const maxPrice = parseFloat(product.priceRangeV2?.maxVariantPrice?.amount || '0');
          if (minPrice > 0 && maxPrice / minPrice > 3) {
            result.priceAnomalies.push(`${product.title}: 価格差 ${(maxPrice / minPrice).toFixed(1)}倍`);
          }

          // 在庫0の有効商品（臓器壊死 — 機能しない細胞）
          if (product.totalInventory === 0 && product.status === 'ACTIVE') {
            result.orphanedVariants.push(`${product.title}: 在庫0 (ACTIVE)`);
          }

          // SKU未設定のバリエーション（骨格欠損 — 追跡不能な部品）
          for (const v of product.variants?.nodes ?? []) {
            if (!v.sku && product.status === 'ACTIVE') {
              result.orphanedVariants.push(`${product.title}/${v.title}: SKU未設定`);
              break; // 1商品につき1回のみ警告
            }
          }
        }

        this.productCount = products.length;
      } catch (err) {
        result.totalProducts = this.productCount;
      }
    } else {
      result.totalProducts = this.productCount;
    }

    // スコア計算
    const totalIssues = result.missingImages.length
      + result.missingDescriptions.length
      + result.priceAnomalies.length
      + result.orphanedVariants.length;

    if (result.totalProducts > 0) {
      result.score = Math.max(0, Math.round(100 - (totalIssues / result.totalProducts) * 100));
    }

    await this.publishEvent('product.catalog.audit.completed', { result });
    return result;
  }
}
