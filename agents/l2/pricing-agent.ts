/**
 * PricingAgent — L2 価格戦略エージェント（受容体 = 市場価格の感知）
 *
 * 生体対応: 価格受容体（プライスレセプター）
 * 動的価格設定、競合他社価格分析、利益率最適化を実行。
 * SalesLeadから指令を受け、収益性と市場競争力のバランスを維持。
 *
 * 担当タスク: price_analysis, dynamic_pricing, competitor_price_check, margin_optimization
 * 所属パイプライン: P2（売上成長）
 */

import type {
  AgentId,
  AgentEvent,
  CascadeCommand,
  IAgentBus,
} from '../core/types';
import {BaseL2Agent} from './base-l2-agent';
import {getAdminClient} from '../core/shopify-admin';
import { createLogger } from '../core/logger.js';

const log = createLogger('pricing-agent');

interface PriceAnalysis {
  productId: string;
  currentPrice: number;
  recommendedPrice: number;
  elasticity: number;        // 価格弾力性 (0-1)
  marginPercentage: number;   // 利益率 (%)
  competitorAverage: number;  // 競合平均価格
}

interface CompetitorPrice {
  competitor: string;
  productName: string;
  price: number;
  lastUpdated: number;
  priceGap: number; // Astromedalとの差分
}

export class PricingAgent extends BaseL2Agent {
  readonly id: AgentId = {
    id: 'pricing-agent',
    name: 'PricingAgent',
    level: 'L2',
    team: 'sales',
    version: '1.0.0',
  };

  private priceHistory: Map<string, number[]> = new Map();
  private competitorData: Map<string, CompetitorPrice[]> = new Map();

  constructor(bus: IAgentBus) {
    super(bus);
  }

  protected async onInitialize(): Promise<void> {
    this.subscribe('pricing.*');
    this.subscribe('sales.pricing.*');
    this.subscribe('market.price_update');

    this.seedCompetitorData();
  }

  protected async onShutdown(): Promise<void> {
    this.priceHistory.clear();
    this.competitorData.clear();
  }

  protected async onEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'market.price_update') {
      await this.publishEvent('pricing.market_analysis_triggered', {
        competitor: (event.payload as Record<string, unknown>).competitor,
        action: 'analyzing_price_change',
      }, 'high');
    }
  }

  protected async onCommand(command: CascadeCommand): Promise<unknown> {
    switch (command.action) {
      case 'price_analysis':
        return this.priceAnalysis(command.params);

      case 'dynamic_pricing':
        return this.dynamicPricing(command.params);

      case 'competitor_price_check':
        return this.competitorPriceCheck(command.params);

      case 'margin_optimization':
        return this.marginOptimization(command.params);

      default:
        throw new Error(`PricingAgent: unknown action "${command.action}"`);
    }
  }

  // ── Core Operations ──

  private seedCompetitorData(): void {
    // ゲーミングPC市場の主要競合ベンチマーク価格（日本市場・2026年Q1時点）
    // Phase 2: スクレイピング/APIでリアルタイム更新
    const now = Date.now();

    // Initialize with seed data
    this.competitorData.set('DELL', [
      { competitor: 'DELL', productName: 'Alienware Aurora R16', price: 289800, lastUpdated: now, priceGap: 0 },
      { competitor: 'DELL', productName: 'Dell G16 7630', price: 179800, lastUpdated: now, priceGap: 0 },
    ]);
    this.competitorData.set('ASUS', [
      { competitor: 'ASUS', productName: 'ROG Strix G16', price: 249800, lastUpdated: now, priceGap: 0 },
      { competitor: 'ASUS', productName: 'TUF Gaming F15', price: 159800, lastUpdated: now, priceGap: 0 },
    ]);
    this.competitorData.set('MSI', [
      { competitor: 'MSI', productName: 'Aegis RS 14', price: 269800, lastUpdated: now, priceGap: 0 },
      { competitor: 'MSI', productName: 'MAG Infinite S3', price: 189800, lastUpdated: now, priceGap: 0 },
    ]);
    this.competitorData.set('Razer', [
      { competitor: 'Razer', productName: 'Razer Blade 16', price: 349800, lastUpdated: now, priceGap: 0 },
    ]);
    this.competitorData.set('Corsair', [
      { competitor: 'Corsair', productName: 'Corsair ONE i500', price: 399800, lastUpdated: now, priceGap: 0 },
    ]);

    // Phase 2: Attempt to load real competitor data on initialization
    if (process.env.ENABLE_REAL_SCRAPING === 'true') {
      this.updateCompetitorDataFromScraper().catch(err => {
        log.warn('[PricingAgent] Real competitor scraping failed on init, using seed data:', err instanceof Error ? err.message : err);
      });
    }
  }

  private async updateCompetitorDataFromScraper(): Promise<void> {
    try {
      // Dynamic import for CompetitorScraper
      const { CompetitorScraper } = await import('../data-collection/competitor-scraper');

      const scraper = new CompetitorScraper({ enableRealScraping: true });
      await scraper.initialize();

      // Run PC competitor check
      const pcRecords = await scraper.runWeeklyPCCheck();

      // Merge scraper results into competitorData
      const now = Date.now();
      for (const record of pcRecords) {
        if (record.competitorType === 'pc_maker') {
          const products: CompetitorPrice[] = record.featuredProducts.map(fp => ({
            competitor: record.competitorName,
            productName: fp.name,
            price: fp.price,
            lastUpdated: now,
            priceGap: 0,
          }));
          this.competitorData.set(record.competitorName, products);
        }
      }

      await scraper.shutdown();
    } catch (err) {
      throw new Error(`CompetitorScraper initialization failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async priceAnalysis(params: Record<string, unknown>): Promise<PriceAnalysis> {
    const productId = (params.productId as string) ?? 'default';
    const costPrice = (params.costPrice as number) ?? 100000;
    let currentPrice = (params.currentPrice as number) ?? 150000;

    await this.publishEvent('pricing.analysis.started', { productId });

    // Phase 4: Shopify Admin APIから商品価格を取得
    const admin = getAdminClient();
    if (admin.available && productId !== 'default') {
      try {
        const products = await admin.getProducts(1, `id:${productId}`);
        if (products.length > 0) {
          currentPrice = parseFloat(products[0].priceRangeV2?.minVariantPrice?.amount || String(currentPrice));
        }
      } catch (err) {
        // フォールバック: パラメータの値をそのまま使用
        log.warn('[PricingAgent] product price fetch failed:', err instanceof Error ? err.message : err);
      }
    }

    const marginPercentage = costPrice > 0 ? ((currentPrice - costPrice) / currentPrice) * 100 : 0;
    const competitorAverage = 145000; // 競合API統合時にリアルデータ化（Phase 5）

    const result: PriceAnalysis = {
      productId,
      currentPrice,
      recommendedPrice: currentPrice,
      elasticity: 0.8,
      marginPercentage: +marginPercentage.toFixed(1),
      competitorAverage,
    };

    await this.publishEvent('pricing.analysis.completed', { result });
    return result;
  }

  private async dynamicPricing(params: Record<string, unknown>): Promise<{
    adjustments: Array<{ productId: string; oldPrice: number; newPrice: number; reason: string }>;
  }> {
    const timeOfDay = (params.timeOfDay as string) ?? 'peak';
    const demandLevel = (params.demandLevel as string) ?? 'normal';

    await this.publishEvent('pricing.dynamic_pricing.started', { timeOfDay, demandLevel });

    // Shopify在庫データに基づくルールベース動的価格調整
    const adjustments: Array<{ productId: string; oldPrice: number; newPrice: number; reason: string }> = [];

    const admin = getAdminClient();
    if (admin.available) {
      try {
        const products = await admin.getProducts(50, 'status:active');

        for (const product of products) {
          const minPrice = parseFloat(product.priceRangeV2?.minVariantPrice?.amount || '0');
          if (minPrice <= 0) continue;

          const inventory = product.totalInventory ?? 0;

          // ルール1: 在庫過多（100台以上）→ 3-5%ディスカウント提案
          if (inventory > 100) {
            const discountRate = 0.03 + Math.min(0.02, (inventory - 100) / 5000);
            adjustments.push({
              productId: product.id,
              oldPrice: minPrice,
              newPrice: Math.round(minPrice * (1 - discountRate)),
              reason: `在庫過多（${inventory}台）— ${(discountRate * 100).toFixed(1)}%値下げで回転促進`,
            });
          }

          // ルール2: 在庫僅少（5台以下）＋ ピーク時間帯 → 2-3%プレミアム
          if (inventory > 0 && inventory <= 5 && (timeOfDay === 'peak' || demandLevel === 'high')) {
            const premiumRate = 0.02 + (demandLevel === 'high' ? 0.01 : 0);
            adjustments.push({
              productId: product.id,
              oldPrice: minPrice,
              newPrice: Math.round(minPrice * (1 + premiumRate)),
              reason: `在庫僅少（${inventory}台）+ 高需要時間帯 — ${(premiumRate * 100).toFixed(1)}%プレミアム`,
            });
          }

          // ルール3: 90日以上更新なし → 5%マークダウン提案
          const daysSinceUpdate = (Date.now() - new Date(product.updatedAt).getTime()) / 86400000;
          if (daysSinceUpdate > 90 && inventory > 20) {
            adjustments.push({
              productId: product.id,
              oldPrice: minPrice,
              newPrice: Math.round(minPrice * 0.95),
              reason: `${Math.round(daysSinceUpdate)}日間更新なし — 5%マークダウンで在庫回転`,
            });
          }
        }
      } catch (err) {
        // API失敗時は空配列のまま
        log.warn('[PricingAgent] dynamic pricing adjustment fetch failed:', err instanceof Error ? err.message : err);
      }
    }

    // B-04: ルールベース結果をAI判定で検証（高額変更時のみ）
    const validatedAdjustments: typeof adjustments = [];
    for (const adj of adjustments) {
      const priceDiff = Math.abs(adj.newPrice - adj.oldPrice);
      const diffPercent = (priceDiff / adj.oldPrice) * 100;

      if (diffPercent >= 3) {
        // 3%以上の価格変更はAI判定を通す（閾値未満はルールベースのまま承認）
        try {
          const decision = await this.requestAIDecision(
            `価格変更提案: ${adj.reason}（変更率: ${diffPercent.toFixed(1)}%、差額: ¥${priceDiff.toLocaleString()}）`,
            ['承認: この価格変更を適用', '却下: 現行価格を維持', '修正: 変更幅を半分に縮小'],
            { productId: adj.productId, oldPrice: adj.oldPrice, newPrice: adj.newPrice, inventory: adj.reason },
            'pricing',
          );
          if (decision.selectedOption === 0) {
            validatedAdjustments.push(adj);
          } else if (decision.selectedOption === 2) {
            // AI提案: 変更幅を半分に
            const halfDiff = Math.round(priceDiff / 2);
            validatedAdjustments.push({
              ...adj,
              newPrice: adj.oldPrice > adj.newPrice
                ? adj.oldPrice - halfDiff
                : adj.oldPrice + halfDiff,
              reason: `${adj.reason}（AI判定: 変更幅50%に縮小）`,
            });
          }
          // selectedOption === 1 は却下 → validatedAdjustmentsに追加しない
        } catch {
          // AI Brain未接続時はルールベース結果をそのまま採用（フォールバック）
          validatedAdjustments.push(adj);
        }
      } else {
        // 小幅変更はルールベースのまま自動承認
        validatedAdjustments.push(adj);
      }
    }

    await this.publishEvent('pricing.dynamic_pricing.completed', {
      adjustmentCount: validatedAdjustments.length,
      originalCount: adjustments.length,
      aiFiltered: adjustments.length - validatedAdjustments.length,
      dataSource: admin.available ? 'shopify' : 'unavailable',
    });

    return { adjustments: validatedAdjustments };
  }

  private async competitorPriceCheck(params: Record<string, unknown>): Promise<{
    competitors: CompetitorPrice[];
    marketPosition: string;
    datasource?: string;
  }> {
    const productCategory = (params.productCategory as string) ?? 'gaming-pc';

    await this.publishEvent('pricing.competitor_check.started', { productCategory });

    let datasource = 'seed_data';
    const competitors: CompetitorPrice[] = [];

    // Phase 2: Real-time competitor price updates via CompetitorScraper
    if (process.env.ENABLE_REAL_SCRAPING === 'true') {
      try {
        const { CompetitorScraper } = await import('../data-collection/competitor-scraper');
        const scraper = new CompetitorScraper({ enableRealScraping: true });
        await scraper.initialize();

        // Run weekly PC check for fresh competitor data
        const records = await scraper.runWeeklyPCCheck();
        datasource = 'competitor_scraper';

        // Merge scraper results
        const now = Date.now();
        for (const record of records) {
          if (record.competitorType === 'pc_maker' && record.featuredProducts) {
            for (const product of record.featuredProducts) {
              competitors.push({
                competitor: record.competitorName,
                productName: product.name,
                price: product.price,
                lastUpdated: now,
                priceGap: 0, // Will be calculated after
              });
            }
          }
        }

        await scraper.shutdown();
      } catch (err) {
        log.warn('[PricingAgent] Real competitor scraping failed, falling back to seed data:', err instanceof Error ? err.message : err);
        // Fall through to seed data
      }
    }

    // Fallback to seed competitorData if scraping didn't produce results
    if (competitors.length === 0) {
      for (const [, compProducts] of this.competitorData) {
        for (const cp of compProducts) {
          competitors.push(cp);
        }
      }
    }

    // Shopifyから自社平均価格を取得
    let ourAvgPrice = 200000; // フォールバック
    const admin = getAdminClient();
    if (admin.available) {
      try {
        const ourProducts = await admin.getProducts(50, `product_type:${productCategory}`);
        if (ourProducts.length > 0) {
          const prices = ourProducts
            .map(p => parseFloat(p.priceRangeV2?.minVariantPrice?.amount || '0'))
            .filter(p => p > 0);
          if (prices.length > 0) {
            ourAvgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
          }
        }
      } catch (err) { log.warn('[PricingAgent] competitor data fetch failed:', err instanceof Error ? err.message : err); }
    }

    // 競合データにpriceGapを計算して返却
    const competitorsWithGap: CompetitorPrice[] = competitors.map(cp => ({
      ...cp,
      priceGap: Math.round(cp.price - ourAvgPrice),
    }));

    // 市場ポジション判定
    const avgCompetitor = competitorsWithGap.length > 0
      ? competitorsWithGap.reduce((s, c) => s + c.price, 0) / competitorsWithGap.length
      : 0;
    let marketPosition: string;
    if (avgCompetitor === 0) {
      marketPosition = 'data_insufficient';
    } else if (ourAvgPrice < avgCompetitor * 0.85) {
      marketPosition = 'value_leader'; // 競合の85%未満 → 価格優位
    } else if (ourAvgPrice > avgCompetitor * 1.15) {
      marketPosition = 'premium'; // 競合の115%超 → プレミアム
    } else {
      marketPosition = 'competitive'; // 範囲内
    }

    await this.publishEvent('pricing.competitor_check.completed', {
      competitorCount: competitorsWithGap.length,
      marketPosition,
      datasource,
    });

    return { competitors: competitorsWithGap, marketPosition, datasource };
  }

  private async marginOptimization(params: Record<string, unknown>): Promise<{
    optimizations: number;
    projectedRevenue: number;
    suggestions: Array<{ sku: string; currentMargin: number; optimizedMargin: number; price: number }>;
    dataSource: string;
  }> {
    const targetMargin = (params.targetMargin as number) ?? 35;
    const productCount = (params.productCount as number) ?? 50;

    await this.publishEvent('pricing.margin_optimization.started', { targetMargin, productCount });

    const suggestions: Array<{ sku: string; currentMargin: number; optimizedMargin: number; price: number }> = [];
    let projectedRevenue = 0;
    let dataSource = 'fallback';

    const admin = getAdminClient();
    if (admin.available) {
      try {
        const products = await admin.getProducts(productCount, 'status:active');
        dataSource = 'shopify';

        for (const product of products) {
          for (const variant of product.variants?.nodes || []) {
            const price = parseFloat(variant.price || '0');
            if (price > 0) {
              // コスト情報がAPIにないため、推定原価率60%で計算
              const estimatedCost = price * 0.6;
              const currentMargin = ((price - estimatedCost) / price) * 100;
              if (currentMargin < targetMargin) {
                const optimizedPrice = estimatedCost / (1 - targetMargin / 100);
                suggestions.push({
                  sku: variant.sku || variant.id,
                  currentMargin: +currentMargin.toFixed(1),
                  optimizedMargin: targetMargin,
                  price,
                });
                projectedRevenue += (optimizedPrice - price) * (variant.inventoryQuantity || 1);
              }
            }
          }
        }
      } catch (err) {
        log.warn('[PricingAgent] storage write failed:', err instanceof Error ? err.message : err);
        dataSource = 'fallback';
      }
    }

    await this.publishEvent('pricing.margin_optimization.completed', {
      optimizationCount: suggestions.length,
      projectedRevenue: Math.round(projectedRevenue),
      dataSource,
    });

    return { optimizations: suggestions.length, projectedRevenue: Math.round(projectedRevenue), suggestions, dataSource };
  }
}
