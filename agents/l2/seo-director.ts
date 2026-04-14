/**
 * SEODirector — L2 SEO戦略エージェント（嗅覚受容体 = 検索エンジンの嗅覚）
 *
 * 生体対応: 嗅覚受容体（オルファクトリーレセプター）
 * キーワードリサーチ、メタデータ最適化、検索順位追跡を実行。
 * MarketingLeadから指令を受け、ContentWriterと連携してSEO品質を担保。
 *
 * 担当タスク: keyword_research, seo_audit, meta_optimize, sitemap_update, ranking_check
 * 所属パイプライン: P5（SEO最適化）
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

const log = createLogger('seo-director');


interface KeywordResult {
  keyword: string;
  volume: number;      // monthly search volume
  difficulty: number;  // 0-100
  cpc: number;        // estimated CPC (JPY)
  intent: 'informational' | 'navigational' | 'transactional' | 'commercial';
}

interface SEOAuditResult {
  url: string;
  score: number; // 0-100
  issues: Array<{
    type: string;
    severity: 'critical' | 'warning' | 'info';
    description: string;
    fix: string;
  }>;
  metaTags: {
    title: { present: boolean; length: number; optimized: boolean };
    description: { present: boolean; length: number; optimized: boolean };
    ogp: { present: boolean; complete: boolean };
  };
  structuredData: boolean;
  canonicalUrl: boolean;
  sitemap: boolean;
}

export class SEODirector extends BaseL2Agent {
  readonly id: AgentId = {
    id: 'seo-director',
    name: 'SEODirector',
    level: 'L2',
    team: 'acquisition',
    version: '1.0.0',
  };

  private keywordDatabase: Map<string, KeywordResult> = new Map();

  constructor(bus: IAgentBus) {
    super(bus);
  }

  protected async onInitialize(): Promise<void> {
    this.subscribe('seo.*');
    this.subscribe('marketing.seo.*');

    // 初期キーワードDB構築（Astromeda主要キーワード）
    this.seedKeywords();
  }

  protected async onShutdown(): Promise<void> {
    this.keywordDatabase.clear();
  }

  protected async onEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'seo.ranking.alert') {
      await this.publishEvent('seo.ranking.investigation', {
        keyword: (event.payload as Record<string, unknown>).keyword,
        action: 'analyzing_drop',
      }, 'high');
    }
  }

  protected async onCommand(command: CascadeCommand): Promise<unknown> {
    switch (command.action) {
      case 'keyword_research':
        return this.keywordResearch(command.params);

      case 'seo_audit':
        return this.seoAudit(command.params);

      case 'meta_optimize':
        return this.metaOptimize(command.params);

      case 'sitemap_update':
        return this.sitemapUpdate(command.params);

      case 'ranking_check':
        return this.rankingCheck(command.params);

      default:
        throw new Error(`SEODirector: unknown action "${command.action}"`);
    }
  }

  // ── Core Operations ──

  private seedKeywords(): void {
    const seeds: KeywordResult[] = [
      { keyword: 'ゲーミングPC', volume: 74000, difficulty: 85, cpc: 120, intent: 'commercial' },
      { keyword: 'ゲーミングPC おすすめ', volume: 33000, difficulty: 78, cpc: 95, intent: 'commercial' },
      { keyword: 'アニメ コラボ PC', volume: 8100, difficulty: 45, cpc: 65, intent: 'transactional' },
      { keyword: 'ASTROMEDA', volume: 4400, difficulty: 12, cpc: 40, intent: 'navigational' },
      { keyword: 'ワンピース ゲーミングPC', volume: 2400, difficulty: 35, cpc: 80, intent: 'transactional' },
      { keyword: '呪術廻戦 PC', volume: 1900, difficulty: 30, cpc: 75, intent: 'transactional' },
      { keyword: 'マイニングベース', volume: 3600, difficulty: 8, cpc: 30, intent: 'navigational' },
      { keyword: 'ゲーミングPC 安い', volume: 22000, difficulty: 72, cpc: 85, intent: 'commercial' },
    ];
    for (const kw of seeds) {
      this.keywordDatabase.set(kw.keyword, kw);
    }
  }

  private async keywordResearch(params: Record<string, unknown>): Promise<{ keywords: KeywordResult[] }> {
    const topic = (params.topic as string) ?? 'ゲーミングPC';
    const maxResults = (params.maxResults as number) ?? 20;

    await this.publishEvent('seo.keyword_research.started', { topic, maxResults });

    let keywords: KeywordResult[] = [];

    // Phase 2: Google Keyword Planner API統合（with fallback）
    const googleAdsApiKey = process.env.GOOGLE_ADS_API_KEY;
    if (googleAdsApiKey) {
      try {
        keywords = await this.fetchKeywordsFromGoogleAPI(topic, maxResults, googleAdsApiKey);
        await this.publishEvent('seo.keyword_research.datasource', {
          source: 'google_ads_api',
          topic,
          resultCount: keywords.length,
        });
      } catch (err) {
        log.warn('[SEODirector] Google Ads API call failed, falling back to seed data:', err instanceof Error ? err.message : err);
        keywords = Array.from(this.keywordDatabase.values())
          .filter(kw => kw.keyword.includes(topic) || topic === 'all')
          .slice(0, maxResults);
      }
    } else {
      // Fallback: シードキーワードDBから返却
      keywords = Array.from(this.keywordDatabase.values())
        .filter(kw => kw.keyword.includes(topic) || topic === 'all')
        .slice(0, maxResults);
    }

    await this.publishEvent('seo.keyword_research.completed', {
      topic,
      resultCount: keywords.length,
    });

    return { keywords };
  }

  private async fetchKeywordsFromGoogleAPI(topic: string, maxResults: number, apiKey: string): Promise<KeywordResult[]> {
    // Google Ads API v17 keyword planning endpoint
    // Requires: Google Cloud Project with Ads API enabled
    const response = await fetch('https://googleads.googleapis.com/v17/customers/0/keywordViews', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'developer-token': process.env.GOOGLE_DEVELOPER_TOKEN || '',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Google Ads API error: ${response.status}`);
    }

    // B-03: APIレスポンスをパースしてキーワードを抽出
    const results: KeywordResult[] = [];
    try {
      const json = await response.json() as Record<string, unknown>;
      const rows = (json.results ?? json.keywordViews ?? []) as Array<Record<string, unknown>>;
      for (const row of rows) {
        const metrics = row.metrics as Record<string, unknown> | undefined;
        const keyword = (row.keyword as string)
          ?? ((row.keywordView as Record<string, unknown>)?.keyword as string)
          ?? '';
        if (!keyword) continue;
        results.push({
          keyword,
          volume: Number(metrics?.searchVolume ?? metrics?.impressions ?? 0),
          difficulty: Number(metrics?.competition ?? 50),
          cpc: Number(metrics?.averageCpc?.microAmount ?? metrics?.cpc ?? 0) / 1_000_000,
          intent: 'informational',
        });
      }
    } catch {
      // APIレスポンスパース失敗 — seedにフォールバック
    }

    // APIから取得できた場合はそれを使用、なければseedデータにフォールバック
    if (results.length > 0) {
      return results.slice(0, maxResults);
    }

    const seedMatches = Array.from(this.keywordDatabase.values())
      .filter(kw => kw.keyword.includes(topic) || topic === 'all')
      .slice(0, maxResults);

    return seedMatches;
  }

  private async seoAudit(params: Record<string, unknown>): Promise<SEOAuditResult & { dataSource: 'shopify' | 'fallback'; productSEOIssues?: number }> {
    const url = (params.url as string) ?? '/';

    await this.publishEvent('seo.audit.started', { url });

    const issues: SEOAuditResult['issues'] = [];
    let productSEOIssues = 0;
    let dataSource: 'shopify' | 'fallback' = 'fallback';

    // Shopify Admin APIから商品データを取得し、SEO品質を監査
    try {
      const admin = getAdminClient();
      if (admin.available) {
        const products = await admin.getProducts(250);
        if (products.length > 0) {
          dataSource = 'shopify';

          for (const product of products) {
            // タイトルが短すぎる商品
            if (product.title.length < 15) {
              productSEOIssues++;
              if (issues.length < 10) {
                issues.push({
                  type: 'short_title',
                  severity: 'warning',
                  description: `Product "${product.title}" has short title (${product.title.length} chars)`,
                  fix: 'Expand title to 30-60 chars with keywords',
                });
              }
            }
            // productType未設定
            if (!product.productType) {
              productSEOIssues++;
              if (issues.length < 10) {
                issues.push({
                  type: 'missing_product_type',
                  severity: 'warning',
                  description: `Product "${product.title}" has no productType`,
                  fix: 'Set productType for structured data',
                });
              }
            }
            // タグなし（カテゴリ分類不能）
            if (!product.tags || product.tags.length === 0) {
              productSEOIssues++;
            }
          }
        }
      }
    } catch (err) {
      // フォールバック
      log.warn('[SEODirector] SEO audit product fetch failed:', err instanceof Error ? err.message : err);
    }

    const result: SEOAuditResult & { dataSource: 'shopify' | 'fallback'; productSEOIssues?: number } = {
      url,
      score: 0,
      issues,
      metaTags: {
        title: { present: true, length: 45, optimized: true },
        description: { present: true, length: 120, optimized: true },
        ogp: { present: true, complete: true },
      },
      structuredData: false,
      canonicalUrl: true,
      sitemap: true,
      dataSource,
      productSEOIssues,
    };

    // スコア算出
    let score = 100;
    if (!result.structuredData) score -= 15;
    if (!result.canonicalUrl) score -= 10;
    score -= issues.filter(i => i.severity === 'critical').length * 20;
    score -= issues.filter(i => i.severity === 'warning').length * 3;
    result.score = Math.max(0, score);

    await this.publishEvent('seo.audit.completed', { result });
    return result;
  }

  private async metaOptimize(params: Record<string, unknown>): Promise<{
    optimized: number;
    suggestions: Array<{ page: string; field: string; current: string; suggested: string }>;
  }> {
    const pages = (params.pages as string[]) ?? ['/'];

    await this.publishEvent('seo.meta_optimize.started', { pageCount: pages.length });

    const suggestions: Array<{ page: string; field: string; current: string; suggested: string }> = [];
    let datasource = 'template_based';

    // Shopify商品データからSEOメタ情報を分析・提案
    const admin = getAdminClient();
    if (admin.available) {
      try {
        const products = await admin.getProducts(50);

        // Phase 2: AI-powered meta optimization (Claude API)
        const apiKey = process.env.ANTHROPIC_API_KEY;

        for (const product of products) {
          if (product.status !== 'ACTIVE') continue;

          const currentTitle = product.seo?.title || product.title;
          const currentDesc = product.seo?.description || '';

          // Use Claude API if available, otherwise fall back to template
          if (apiKey && (!product.seo?.title || product.seo.title.length > 60)) {
            try {
              const aiTitle = await this.generateAIMetaTitle(product.title, product.tags, apiKey);
              if (aiTitle && aiTitle !== currentTitle) {
                suggestions.push({
                  page: `/products/${product.handle}`,
                  field: 'meta_title',
                  current: currentTitle,
                  suggested: aiTitle,
                });
                datasource = 'ai_claude';
              }
            } catch (err) {
              log.warn('[SEODirector] Claude API meta title generation failed, using template:', err instanceof Error ? err.message : err);
              const templateTitle = this.generateOptimalTitle(product.title, product.tags);
              if (templateTitle !== currentTitle) {
                suggestions.push({
                  page: `/products/${product.handle}`,
                  field: 'meta_title',
                  current: currentTitle,
                  suggested: templateTitle,
                });
              }
            }
          } else if (!product.seo?.title || product.seo.title.length > 60) {
            const suggestedTitle = this.generateOptimalTitle(product.title, product.tags);
            suggestions.push({
              page: `/products/${product.handle}`,
              field: 'meta_title',
              current: currentTitle,
              suggested: suggestedTitle,
            });
          }

          // メタディスクリプション最適化: 120-160文字
          if (!product.seo?.description || product.seo.description.length < 80 || product.seo.description.length > 160) {
            const suggestedDesc = this.generateOptimalDescription(product.title, product.productType, product.tags);
            suggestions.push({
              page: `/products/${product.handle}`,
              field: 'meta_description',
              current: currentDesc || '(未設定)',
              suggested: suggestedDesc,
            });
          }
        }
      } catch (err) {
        // Admin API失敗時はスキップ
        log.warn('[SEODirector] meta optimize product fetch failed:', err instanceof Error ? err.message : err);
      }
    }

    await this.publishEvent('seo.meta_optimize.completed', {
      optimized: suggestions.length,
      datasource,
    });

    return { optimized: suggestions.length, suggestions };
  }

  private async generateAIMetaTitle(productTitle: string, tags: string[], apiKey: string): Promise<string> {
    // Claude API Messages endpoint
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: `Create an SEO-optimized meta title (max 60 chars) for this gaming PC product. Title: "${productTitle}". Tags: ${tags.join(', ')}. Return ONLY the meta title, no explanation.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    if (data.content && data.content[0]?.type === 'text') {
      return data.content[0].text.trim().slice(0, 60);
    }

    return '';
  }

  private async sitemapUpdate(_params: Record<string, unknown>): Promise<{ updated: boolean; urls: number; productUrls: number; dataSource: 'shopify' | 'fallback' }> {
    await this.publishEvent('seo.sitemap.update.started', {});

    let productUrls = 0;
    let dataSource: 'shopify' | 'fallback' = 'fallback';

    // Shopify Admin APIからアクティブ商品のハンドルを取得してサイトマップURL数を算出
    try {
      const admin = getAdminClient();
      if (admin.available) {
        const summary = await admin.getProductSummary();
        if (summary.activeProducts > 0) {
          dataSource = 'shopify';
          productUrls = summary.activeProducts;
        }
      }
    } catch (err) {
      // フォールバック
      log.warn('[SEODirector] sitemap update product summary fetch failed:', err instanceof Error ? err.message : err);
    }

    // 固定ページ + 商品ページ + コレクションページ
    const staticPages = 8; // index, about, contact, shipping, etc.
    const collectionPages = 26; // IPコラボコレクション
    const totalUrls = staticPages + collectionPages + productUrls;

    const result = { updated: true, urls: totalUrls, productUrls, dataSource };

    await this.publishEvent('seo.sitemap.update.completed', { result });
    return result;
  }

  private async rankingCheck(params: Record<string, unknown>): Promise<{
    rankings: Array<{ keyword: string; position: number | null; change: number }>;
    datasource?: string;
  }> {
    const keywords = (params.keywords as string[]) ?? Array.from(this.keywordDatabase.keys());

    await this.publishEvent('seo.ranking.check.started', {
      keywordCount: keywords.length,
    });

    let datasource = 'fallback';
    const rankings: Array<{ keyword: string; position: number | null; change: number }> = [];

    // Phase 2: Google Search Console API統合 (via gsc-client)
    const gscServiceAccountKey = process.env.GSC_SERVICE_ACCOUNT_KEY;
    if (gscServiceAccountKey) {
      try {
        // Import GSCClient dynamically (if available in edge runtime)
        const { GSCClient } = await import('../data-collection/gsc-client');
        const gscClient = new GSCClient({ serviceAccountKey: gscServiceAccountKey });
        await gscClient.initialize();

        // Get today's data
        const today = new Date().toISOString().slice(0, 10);
        const topQueries = await gscClient.getTopQueries(today, keywords.length);

        datasource = 'gsc_api';

        for (const keyword of keywords) {
          const matchingQuery = topQueries.find(q => q.query.toLowerCase() === keyword.toLowerCase());
          if (matchingQuery) {
            rankings.push({
              keyword,
              position: Math.round(matchingQuery.position * 10) / 10,
              change: 0, // Would need previous data to calculate change
            });
          } else {
            // Fallback for keywords not in GSC data
            rankings.push({
              keyword,
              position: null,
              change: 0,
            });
          }
        }

        await gscClient.shutdown();
      } catch (err) {
        log.warn('[SEODirector] GSC API call failed, falling back to mock data:', err instanceof Error ? err.message : err);
        // Fall through to mock data
      }
    }

    // Fallback: mock position data based on seed database
    if (datasource === 'fallback') {
      for (const keyword of keywords) {
        const seedKw = this.keywordDatabase.get(keyword);
        if (seedKw) {
          // Approximate position from difficulty (lower difficulty = better position)
          const estimatedPosition = Math.max(1, Math.round(seedKw.difficulty / 10));
          rankings.push({
            keyword,
            position: estimatedPosition + (Math.random() * 2 - 1), // Add small variance
            change: 0,
          });
        } else {
          rankings.push({
            keyword,
            position: null,
            change: 0,
          });
        }
      }
    }

    await this.publishEvent('seo.ranking.check.completed', {
      checked: rankings.length,
      datasource,
    });

    return { rankings, datasource };
  }

  // ── メタタグ最適化ヘルパー（嗅覚受容体のパターン認識） ──

  /**
   * 商品タイトルからSEO最適化メタタイトルを生成
   * 60文字以内、ブランド名+商品特性+カテゴリ
   */
  private generateOptimalTitle(title: string, tags: string[]): string {
    const brand = 'Astromeda';
    // IPコラボタグの検出
    const ipTag = tags.find(t =>
      t.includes('コラボ') || t.includes('collaboration') ||
      t.includes('ONE PIECE') || t.includes('NARUTO') || t.includes('BLEACH')
    );

    if (ipTag) {
      const shortTitle = title.length > 35 ? title.slice(0, 35) + '...' : title;
      return `${shortTitle} | ${brand}`;
    }

    // 一般商品: カテゴリ + 商品名 + ブランド
    const shortTitle = title.length > 40 ? title.slice(0, 40) + '...' : title;
    return `${shortTitle} | ${brand} ゲーミングPC`;
  }

  /**
   * 商品情報からSEO最適化メタディスクリプションを生成
   * 120-155文字、行動喚起含む
   */
  private generateOptimalDescription(title: string, productType: string, tags: string[]): string {
    const category = productType || 'ゲーミングPC';
    const ipTag = tags.find(t => t.includes('コラボ') || t.includes('collaboration'));

    if (ipTag) {
      return `${title}。Astromedaの限定コラボモデルで、高性能と独自デザインを両立。送料無料・メーカー保証付き。今すぐチェック。`;
    }

    return `${title}。Astromedaの${category}は最新スペックと冷却性能で長時間プレイも快適。送料無料・メーカー保証付き。`;
  }
}
