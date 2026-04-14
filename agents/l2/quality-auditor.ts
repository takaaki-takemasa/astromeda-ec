/**
 * QualityAuditor — L2 品質監査エージェント（免疫T細胞 = 品質の監視者）
 *
 * 生体対応: T細胞（ヘルパーT / キラーT）
 * 他のL2エージェントの出力物を検査し、品質基準を満たしているか判定。
 * バナー画像品質、コンテンツ品質、SEO品質を横断的に監査する。
 *
 * 担当タスク: quality_check, banner_review, content_review, full_audit
 * 所属パイプライン: P1末尾, P4末尾（品質ゲート）
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

const log = createLogger('quality-auditor');


interface QualityCheckResult {
  itemId: string;
  type: string;
  passed: boolean;
  score: number;   // 0-100
  threshold: number;
  checks: Array<{
    name: string;
    passed: boolean;
    detail: string;
  }>;
  recommendation?: string;
}

interface FullAuditResult {
  timestamp: number;
  overallScore: number;
  categories: {
    images: { score: number; issues: number };
    content: { score: number; issues: number };
    seo: { score: number; issues: number };
    ux: { score: number; issues: number };
    catalog: { score: number; issues: number };
  };
  criticalIssues: string[];
  recommendations: string[];
}

export class QualityAuditor extends BaseL2Agent {
  readonly id: AgentId = {
    id: 'quality-auditor',
    name: 'QualityAuditor',
    level: 'L2',
    team: 'intelligence',
    version: '1.0.0',
  };

  private auditLog: QualityCheckResult[] = [];
  private qualityThresholds = {
    banner: 70,
    content: 75,
    seo: 65,
    overall: 70,
  };

  constructor(bus: IAgentBus) {
    super(bus);
  }

  protected async onInitialize(): Promise<void> {
    this.subscribe('quality.*');
    // 他エージェントの完了イベントを監視して自動品質チェック
    this.subscribe('image.generation.completed');
    this.subscribe('content.article.completed');
    this.subscribe('seo.audit.completed');
  }

  protected async onShutdown(): Promise<void> {
    this.auditLog = [];
  }

  protected async onEvent(event: AgentEvent): Promise<void> {
    // 自動品質ゲート: 他L2の出力完了時に品質チェックをトリガー
    if (event.type === 'image.generation.completed') {
      const payload = event.payload as Record<string, unknown>;
      await this.publishEvent('quality.auto_check.queued', {
        type: 'banner',
        itemId: (payload.result as Record<string, unknown>)?.collectionHandle ?? 'unknown',
        source: event.source,
      });
    } else if (event.type === 'content.article.completed') {
      const payload = event.payload as Record<string, unknown>;
      await this.publishEvent('quality.auto_check.queued', {
        type: 'content',
        itemId: (payload.result as Record<string, unknown>)?.id ?? 'unknown',
        source: event.source,
      });
    }
  }

  protected async onCommand(command: CascadeCommand): Promise<unknown> {
    switch (command.action) {
      case 'quality_check':
        return this.qualityCheck(command.params);

      case 'banner_review':
        return this.bannerReview(command.params);

      case 'content_review':
        return this.contentReview(command.params);

      case 'full_audit':
        return this.fullAudit(command.params);

      default:
        throw new Error(`QualityAuditor: unknown action "${command.action}"`);
    }
  }

  // ── Core Operations ──

  private async qualityCheck(params: Record<string, unknown>): Promise<QualityCheckResult> {
    const itemId = (params.itemId as string) ?? 'unknown';
    const type = (params.type as string) ?? 'generic';
    const data = params.data as Record<string, unknown>;

    await this.publishEvent('quality.check.started', { itemId, type });

    const threshold = this.qualityThresholds[type as keyof typeof this.qualityThresholds]
      ?? this.qualityThresholds.overall;

    const checks: QualityCheckResult['checks'] = [];

    // 共通品質チェック
    if (data) {
      checks.push({
        name: 'data_completeness',
        passed: Object.keys(data).length > 0,
        detail: `${Object.keys(data).length} fields present`,
      });
    }

    const passedCount = checks.filter(c => c.passed).length;
    const score = checks.length > 0 ? Math.round((passedCount / checks.length) * 100) : 0;

    const result: QualityCheckResult = {
      itemId,
      type,
      passed: score >= threshold,
      score,
      threshold,
      checks,
      recommendation: score < threshold ? `Score ${score} is below threshold ${threshold}. Review required.` : undefined,
    };

    this.auditLog.push(result);

    await this.publishEvent('quality.check.completed', {
      itemId,
      passed: result.passed,
      score: result.score,
    });

    return result;
  }

  private async bannerReview(params: Record<string, unknown>): Promise<QualityCheckResult> {
    const bannerUrl = params.bannerUrl as string;
    const collectionHandle = params.collectionHandle as string;

    const checks: QualityCheckResult['checks'] = [
      {
        name: 'url_valid',
        passed: Boolean(bannerUrl && bannerUrl.startsWith('https://')),
        detail: bannerUrl ? 'URL is HTTPS' : 'No URL provided',
      },
      {
        name: 'shopify_cdn',
        passed: Boolean(bannerUrl?.includes('cdn.shopify.com')),
        detail: bannerUrl?.includes('cdn.shopify.com') ? 'Hosted on Shopify CDN' : 'Not on Shopify CDN',
      },
      {
        name: 'collection_linked',
        passed: Boolean(collectionHandle),
        detail: collectionHandle ? `Linked to ${collectionHandle}` : 'No collection link',
      },
    ];

    const passedCount = checks.filter(c => c.passed).length;
    const score = Math.round((passedCount / checks.length) * 100);

    const result: QualityCheckResult = {
      itemId: collectionHandle ?? 'unknown',
      type: 'banner',
      passed: score >= this.qualityThresholds.banner,
      score,
      threshold: this.qualityThresholds.banner,
      checks,
    };

    this.auditLog.push(result);
    return result;
  }

  private async contentReview(params: Record<string, unknown>): Promise<QualityCheckResult> {
    const contentId = params.contentId as string;
    const body = params.body as string;
    const keywords = (params.keywords as string[]) ?? [];

    const checks: QualityCheckResult['checks'] = [
      {
        name: 'has_content',
        passed: Boolean(body && body.length > 0),
        detail: `Content length: ${body?.length ?? 0} chars`,
      },
      {
        name: 'min_length',
        passed: (body?.length ?? 0) >= 100,
        detail: body?.length >= 100 ? 'Meets minimum length' : 'Too short (< 100 chars)',
      },
      {
        name: 'has_keywords',
        passed: keywords.length > 0,
        detail: `${keywords.length} keywords specified`,
      },
    ];

    const passedCount = checks.filter(c => c.passed).length;
    const score = Math.round((passedCount / checks.length) * 100);

    const result: QualityCheckResult = {
      itemId: contentId ?? 'unknown',
      type: 'content',
      passed: score >= this.qualityThresholds.content,
      score,
      threshold: this.qualityThresholds.content,
      checks,
    };

    this.auditLog.push(result);
    return result;
  }

  private async fullAudit(_params: Record<string, unknown>): Promise<FullAuditResult & { dataSource: 'shopify' | 'fallback'; catalogStats?: Record<string, number> }> {
    await this.publishEvent('quality.full_audit.started', {});

    let dataSource: 'shopify' | 'fallback' = 'fallback';
    const catalogStats: Record<string, number> = {};

    // Shopify Admin APIから商品データを取得し、カタログ品質を自動監査
    try {
      const admin = getAdminClient();
      if (admin.available) {
        const products = await admin.getProducts(250);
        if (products.length > 0) {
          dataSource = 'shopify';
          catalogStats['totalProducts'] = products.length;

          let zeroPriceCount = 0;
          let zeroInventoryActive = 0;
          let missingType = 0;
          let missingTags = 0;

          for (const product of products) {
            const minPrice = parseFloat(product.priceRangeV2?.minVariantPrice?.amount || '0');
            if (minPrice === 0 && product.status === 'ACTIVE') zeroPriceCount++;
            if (product.totalInventory === 0 && product.status === 'ACTIVE') zeroInventoryActive++;
            if (!product.productType) missingType++;
            if (!product.tags || product.tags.length === 0) missingTags++;
          }

          catalogStats['zeroPriceActive'] = zeroPriceCount;
          catalogStats['zeroInventoryActive'] = zeroInventoryActive;
          catalogStats['missingProductType'] = missingType;
          catalogStats['missingTags'] = missingTags;

          // カタログ品質チェック結果をauditLogに追加
          const catalogScore = Math.max(0, 100 - zeroPriceCount * 10 - zeroInventoryActive * 5 - missingType * 2 - missingTags * 1);
          this.auditLog.push({
            itemId: 'catalog_full',
            type: 'catalog',
            passed: catalogScore >= this.qualityThresholds.overall,
            score: catalogScore,
            threshold: this.qualityThresholds.overall,
            checks: [
              { name: 'zero_price_check', passed: zeroPriceCount === 0, detail: `${zeroPriceCount} active products with ¥0 price` },
              { name: 'inventory_check', passed: zeroInventoryActive === 0, detail: `${zeroInventoryActive} active products with 0 inventory` },
              { name: 'product_type_check', passed: missingType === 0, detail: `${missingType} products missing productType` },
              { name: 'tags_check', passed: missingTags < 10, detail: `${missingTags} products missing tags` },
            ],
          });
        }
      }
    } catch (err) {
      // フォールバック
      log.warn('[QualityAuditor] full audit product fetch failed:', err instanceof Error ? err.message : err);
    }

    // 全カテゴリの監査結果を集計
    const categorized = {
      images: this.auditLog.filter(a => a.type === 'banner'),
      content: this.auditLog.filter(a => a.type === 'content'),
      seo: this.auditLog.filter(a => a.type === 'seo'),
      ux: this.auditLog.filter(a => a.type === 'ux'),
      catalog: this.auditLog.filter(a => a.type === 'catalog'),
    };

    const avgScore = (items: QualityCheckResult[]) =>
      items.length > 0
        ? Math.round(items.reduce((sum, i) => sum + i.score, 0) / items.length)
        : 100;

    const issueCount = (items: QualityCheckResult[]) =>
      items.filter(i => !i.passed).length;

    const categories = {
      images: { score: avgScore(categorized.images), issues: issueCount(categorized.images) },
      content: { score: avgScore(categorized.content), issues: issueCount(categorized.content) },
      seo: { score: avgScore(categorized.seo), issues: issueCount(categorized.seo) },
      ux: { score: avgScore(categorized.ux), issues: issueCount(categorized.ux) },
      catalog: { score: avgScore(categorized.catalog), issues: issueCount(categorized.catalog) },
    };

    const scores = Object.values(categories).map(c => c.score);
    const overallScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 100;

    const criticalIssues = this.auditLog
      .filter(a => !a.passed && a.score < 50)
      .map(a => `${a.type}:${a.itemId} (score: ${a.score})`);

    const result: FullAuditResult & { dataSource: 'shopify' | 'fallback'; catalogStats?: Record<string, number> } = {
      timestamp: Date.now(),
      overallScore,
      categories,
      criticalIssues,
      recommendations: criticalIssues.length > 0
        ? ['Resolve critical quality issues before deployment']
        : ['All quality gates passed'],
      dataSource,
      catalogStats,
    };

    await this.publishEvent('quality.full_audit.completed', { result });
    return result;
  }
}
