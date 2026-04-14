/**
 * ContentWriter — L2 コンテンツ生成エージェント（唾液腺 = 分泌物質の生成器）
 *
 * 生体対応: 唾液腺（サリバリーグランド）
 * ブログ記事、商品説明文、LP文言を生成・最適化する。
 * MarketingLeadから指令を受け、SEODirectorと連携してコンテンツ品質を担保。
 *
 * 担当タスク: write_article, write_product_desc, write_landing_page, update_content, content_audit
 * 所属パイプライン: P4（コンテンツ生成）
 */

import type {
  AgentId,
  AgentEvent,
  CascadeCommand,
  IAgentBus,
} from '../core/types';
import {BaseL2Agent} from './base-l2-agent';
import { createLogger } from '../core/logger.js';

const log = createLogger('content-writer');


interface ContentSpec {
  type: 'article' | 'product_desc' | 'landing_page';
  topic: string;
  keywords?: string[];
  targetLength?: number; // characters
  tone?: 'professional' | 'casual' | 'enthusiastic';
  locale?: string;
}

interface ContentResult {
  id: string;
  type: string;
  title: string;
  body: string;
  wordCount: number;
  keywords: string[];
  seoScore?: number;
  createdAt: number;
}

interface ContentAuditResult {
  totalContent: number;
  needsUpdate: number;
  qualityScore: number;
  issues: Array<{
    contentId: string;
    issue: string;
    severity: 'high' | 'medium' | 'low';
  }>;
}

export class ContentWriter extends BaseL2Agent {
  readonly id: AgentId = {
    id: 'content-writer',
    name: 'ContentWriter',
    level: 'L2',
    team: 'acquisition',
    version: '1.0.0',
  };

  private contentCount = 0;

  constructor(bus: IAgentBus) {
    super(bus);
  }

  protected async onInitialize(): Promise<void> {
    this.subscribe('content.*');
    this.subscribe('marketing.content.*');
  }

  protected async onShutdown(): Promise<void> {
    // Nothing to clean up
  }

  protected async onEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'content.review.requested') {
      await this.publishEvent('content.review.acknowledged', {
        contentId: (event.payload as Record<string, unknown>).contentId,
        agentId: this.id.id,
      });
    }
  }

  protected async onCommand(command: CascadeCommand): Promise<unknown> {
    switch (command.action) {
      case 'write_article':
        return this.writeArticle(command.params as unknown as ContentSpec);

      case 'write_product_desc':
        return this.writeProductDesc(command.params);

      case 'write_landing_page':
        return this.writeLandingPage(command.params);

      case 'update_content':
        return this.updateContent(command.params);

      case 'content_audit':
        return this.auditContent(command.params);

      default:
        throw new Error(`ContentWriter: unknown action "${command.action}"`);
    }
  }

  // ── Core Operations ──

  private async writeArticle(spec: ContentSpec): Promise<ContentResult> {
    await this.publishEvent('content.article.writing', {
      topic: spec.topic,
      keywords: spec.keywords,
    });

    const contentId = `article_${Date.now()}`;
    const body = this.generateArticleBody(spec);

    const result: ContentResult = {
      id: contentId,
      type: 'article',
      title: this.generateArticleTitle(spec),
      body,
      wordCount: body.length,
      keywords: spec.keywords ?? [],
      seoScore: this.calculateSeoScore(body, spec.keywords ?? []),
      createdAt: Date.now(),
    };

    this.contentCount++;

    await this.publishEvent('content.article.completed', { result });
    return result;
  }

  private async writeProductDesc(params: Record<string, unknown>): Promise<ContentResult> {
    const productHandle = params.productHandle as string;
    const features = (params.features as string[]) ?? [];
    const productTitle = (params.productTitle as string) ?? productHandle;
    const price = (params.price as string) ?? '';
    const collabIp = (params.collabIp as string) ?? '';

    await this.publishEvent('content.product_desc.writing', { productHandle });

    const body = this.generateProductDescBody(productTitle, features, collabIp, price);

    const result: ContentResult = {
      id: `desc_${productHandle}_${Date.now()}`,
      type: 'product_desc',
      title: productTitle,
      body,
      wordCount: body.length,
      keywords: features,
      seoScore: this.calculateSeoScore(body, features),
      createdAt: Date.now(),
    };

    this.contentCount++;
    await this.publishEvent('content.product_desc.completed', { result });
    return result;
  }

  private async writeLandingPage(params: Record<string, unknown>): Promise<ContentResult> {
    const campaign = params.campaign as string;
    const targetAudience = (params.targetAudience as string) ?? 'ゲーマー';
    const collabIp = (params.collabIp as string) ?? '';
    const features = (params.features as string[]) ?? [];

    await this.publishEvent('content.landing_page.writing', { campaign, targetAudience });

    const body = this.generateLandingPageBody(campaign, targetAudience, collabIp, features);

    const result: ContentResult = {
      id: `lp_${Date.now()}`,
      type: 'landing_page',
      title: campaign ?? 'Landing Page',
      body,
      wordCount: body.length,
      keywords: features,
      seoScore: this.calculateSeoScore(body, features),
      createdAt: Date.now(),
    };

    this.contentCount++;
    await this.publishEvent('content.landing_page.completed', { result });
    return result;
  }

  // ── テンプレートベース生成エンジン（Phase 1.5 — AI API統合前の橋渡し） ──

  private generateArticleTitle(spec: ContentSpec): string {
    const keywords = spec.keywords ?? [];
    const topic = spec.topic;
    const templates = [
      `【${new Date().getFullYear()}年最新】${topic}の選び方完全ガイド`,
      `${topic}を徹底解説｜おすすめモデルと選び方のポイント`,
      `プロが教える${topic}の選び方｜失敗しないためのチェックリスト`,
    ];
    // キーワードに基づいてテンプレートを選択
    if (keywords.some(k => k.includes('おすすめ') || k.includes('ランキング'))) {
      return `【${new Date().getFullYear()}年版】${topic}おすすめランキング${keywords.length}選`;
    }
    return templates[this.contentCount % templates.length];
  }

  private generateArticleBody(spec: ContentSpec): string {
    const topic = spec.topic;
    const keywords = spec.keywords ?? [];
    const tone = spec.tone ?? 'professional';
    const locale = spec.locale ?? 'ja';

    const toneMap = {
      professional: { opener: 'この記事では', closer: 'ぜひ参考にしてください。' },
      casual: { opener: '今回は', closer: 'ぜひチェックしてみてね！' },
      enthusiastic: { opener: '待望の', closer: '最高のゲーミング体験を手に入れよう！' },
    };
    const t = toneMap[tone];

    const sections = [
      `${t.opener}、${topic}について詳しく解説します。Astromedaは、26以上のIPコラボレーションを展開する日本発のゲーミングPCブランドです。`,
      '',
      `## ${topic}の特徴`,
      '',
      `Astromedaのゲーミングpcは、高性能なだけでなく、${keywords.length > 0 ? keywords.slice(0, 3).join('・') + 'など' : '圧倒的なデザイン性'}で多くのファンから支持されています。`,
      '',
      `### スペックのポイント`,
      '',
      '- 最新世代のGPU搭載で4K/144fps対応',
      '- 冷却システムを徹底設計し、長時間プレイでも安定したパフォーマンス',
      '- IPコラボモデルは限定デザインケースと専用LED演出を搭載',
      '',
      `### 選び方のコツ`,
      '',
      '1. **用途で選ぶ**: FPSならフレームレート重視、RPGなら画質重視',
      '2. **予算で選ぶ**: エントリーモデルから本格ハイエンドまで幅広いラインナップ',
      '3. **デザインで選ぶ**: 好きなIPコラボモデルで所有欲を満たす',
      '',
      `## まとめ`,
      '',
      `${topic}を選ぶ際は、スペック・予算・デザインのバランスが重要です。${t.closer}`,
    ];

    return sections.join('\n');
  }

  private generateProductDescBody(
    title: string,
    features: string[],
    collabIp: string,
    price: string,
  ): string {
    const featureList = features.length > 0
      ? features.map(f => `・${f}`).join('\n')
      : '・最新世代GPU搭載\n・高効率冷却システム\n・カスタムLEDライティング';

    const collabSection = collabIp
      ? `\n\n【${collabIp}コラボレーション】\n${collabIp}の世界観を再現した限定デザイン。ファンなら見逃せない一台です。`
      : '';

    const priceSection = price ? `\n\n価格: ${price}円（税込）` : '';

    return [
      `${title}`,
      '',
      `Astromedaが誇る高性能ゲーミングPC。${collabIp ? `${collabIp}との` : ''}コラボレーションモデルは、パフォーマンスとデザインを両立した特別な一台です。`,
      '',
      '【主な特徴】',
      featureList,
      collabSection,
      priceSection,
      '',
      '【保証・サポート】',
      '・1年間のメーカー保証',
      '・専門スタッフによる電話・メールサポート',
      '・初期不良は無償交換対応',
    ].join('\n');
  }

  private generateLandingPageBody(
    campaign: string,
    targetAudience: string,
    collabIp: string,
    features: string[],
  ): string {
    const heroSection = collabIp
      ? `${collabIp} × Astromeda 限定コラボPC`
      : `Astromeda Gaming PC — ${campaign}`;

    return [
      `# ${heroSection}`,
      '',
      `## ${targetAudience}のための、究極のゲーミング体験`,
      '',
      `Astromedaは${targetAudience}に最適化されたゲーミングPCを提供します。`,
      collabIp ? `${collabIp}の世界観を体現した限定デザインで、ゲームへの没入感がさらに高まります。` : '',
      '',
      '## 選ばれる3つの理由',
      '',
      '### 1. 圧倒的パフォーマンス',
      '最新世代のCPU/GPUを搭載し、4K/144fpsのなめらかな映像体験を実現。',
      '',
      '### 2. こだわりのデザイン',
      `${collabIp ? `${collabIp}コラボ限定` : 'Astromedaオリジナル'}のケースデザインとLED演出。`,
      '',
      '### 3. 安心のサポート体制',
      '購入後も専門スタッフが電話・メールでしっかりサポート。',
      '',
      features.length > 0 ? `## スペックハイライト\n${features.map(f => `- ${f}`).join('\n')}` : '',
      '',
      '## 今すぐチェック',
      `[商品一覧を見る](/collections/${collabIp ? campaign : 'all'})`,
    ].join('\n');
  }

  /** SEOスコアを簡易算出（0-100） */
  private calculateSeoScore(body: string, keywords: string[]): number {
    let score = 50; // ベーススコア

    // コンテンツ長（500文字以上で加点、2000文字以上でさらに加点）
    if (body.length >= 500) score += 10;
    if (body.length >= 2000) score += 10;

    // キーワード含有率
    for (const kw of keywords) {
      if (body.includes(kw)) score += 5;
    }

    // 見出し構造（h2, h3）
    if (body.includes('## ')) score += 5;
    if (body.includes('### ')) score += 5;

    // リスト使用
    if (body.includes('- ') || body.includes('1. ')) score += 5;

    return Math.min(100, score);
  }

  private async updateContent(params: Record<string, unknown>): Promise<ContentResult> {
    const contentId = params.contentId as string;
    const updates = params.updates as Record<string, unknown>;

    await this.publishEvent('content.update.started', { contentId, updates });

    const result: ContentResult = {
      id: contentId,
      type: (updates?.type as string) ?? 'article',
      title: (updates?.title as string) ?? '',
      body: (updates?.body as string) ?? '',
      wordCount: 0,
      keywords: [],
      createdAt: Date.now(),
    };

    await this.publishEvent('content.update.completed', { contentId, result });
    return result;
  }

  private async auditContent(params: Record<string, unknown>): Promise<ContentAuditResult> {
    const scope = (params.scope as string) ?? 'all';

    await this.publishEvent('content.audit.started', { scope });

    let qualityScore = 75; // baseline
    const issues: ContentAuditResult['issues'] = [];
    let datasource = 'rule_based';

    // Phase 2: 実際のコンテンツスキャンとAI品質評価
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        // Use Claude API for content quality assessment
        const assessment = await this.assessContentWithAI(scope, apiKey);
        qualityScore = assessment.qualityScore;
        issues.push(...assessment.issues);
        datasource = 'ai_claude';
      } catch (err) {
        log.warn('[ContentWriter] AI content audit failed, using rule-based scoring:', err instanceof Error ? err.message : err);
        // Fall through to rule-based assessment
      }
    }

    // Rule-based fallback assessment
    if (datasource === 'rule_based') {
      // Basic heuristic checks
      if (this.contentCount === 0) {
        issues.push({
          contentId: 'global',
          issue: 'No content generated yet',
          severity: 'high',
        });
        qualityScore = 20;
      } else {
        // Estimate quality based on content count and diversity
        qualityScore = Math.min(100, 50 + (this.contentCount * 2));
        if (this.contentCount < 5) {
          issues.push({
            contentId: 'global',
            issue: 'Insufficient content volume for comprehensive SEO',
            severity: 'medium',
          });
        }
      }
    }

    const result: ContentAuditResult = {
      totalContent: this.contentCount,
      needsUpdate: issues.filter(i => i.severity === 'high' || i.severity === 'medium').length,
      qualityScore,
      issues,
    };

    await this.publishEvent('content.audit.completed', {
      result,
      datasource,
    });
    return result;
  }

  private async assessContentWithAI(scope: string, apiKey: string): Promise<{ qualityScore: number; issues: ContentAuditResult['issues'] }> {
    // Claude API Messages endpoint for content quality analysis
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: `Assess the quality of gaming PC marketing content. Evaluate: readability (8-20 grade level), keyword density (2-3% for SEO), structure (headers, lists, CTAs), tone match (professional/casual/enthusiastic). Scope: ${scope}. Return JSON: { qualityScore: 0-100, issues: [{contentId, issue, severity}] }.`,
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
      try {
        const parsed = JSON.parse(data.content[0].text) as { qualityScore: number; issues: Array<{ contentId: string; issue: string; severity: 'high' | 'medium' | 'low' }> };
        return {
          qualityScore: Math.min(100, Math.max(0, parsed.qualityScore)),
          issues: parsed.issues || [],
        };
      } catch {
        throw new Error('Failed to parse Claude response as JSON');
      }
    }

    throw new Error('Unexpected Claude API response format');
  }
}
