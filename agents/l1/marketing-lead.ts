/**
 * MarketingLead — 集客チームリード（L1）
 *
 * 生体対応: 視床下部 弓状核（食欲・成長ホルモン放出の制御）
 * = 成長を促進するシグナルの制御中枢
 *
 * 配下L2 Agent:
 * - ContentWriter: 記事・ブログコンテンツの自動生成
 * - SEODirector: 検索エンジン最適化の戦略立案・実行
 * - (Phase 2) SNS Publisher, Email Marketing Agent
 *
 * 管理パイプライン:
 * - P4: コンテンツ生成
 * - P5: SEO最適化
 * - P6: 価格最適化（Phase 2）
 */

import { BaseLead, type TaskItem } from './base-lead.js';
import type { AgentId, AgentEvent } from '../core/types.js';
import type { AgentBus } from '../core/agent-bus.js';
import type { AgentRegistry } from '../registry/agent-registry.js';
import type { CascadeEngine } from '../core/cascade-engine.js';

export class MarketingLead extends BaseLead {
  readonly id: AgentId = {
    id: 'marketing-lead',
    name: 'Marketing Lead',
    level: 'L1',
    team: 'marketing-lead',
    version: '1.0.0',
  };

  private taskAgentMap: Record<string, string> = {
    // SEO系
    'keyword_research': 'seo-director',
    'seo_audit': 'seo-director',
    'meta_optimize': 'seo-director',
    'sitemap_update': 'seo-director',
    'ranking_check': 'seo-director',
    // コンテンツ系
    'write_article': 'content-writer',
    'write_product_desc': 'content-writer',
    'write_landing_page': 'content-writer',
    'update_content': 'content-writer',
    'content_audit': 'content-writer',
  };

  constructor(
    bus: AgentBus,
    registry: AgentRegistry,
    cascadeEngine: CascadeEngine,
  ) {
    super(bus, registry, cascadeEngine, {
      teamName: 'Marketing',
      maxConcurrentTasks: 2,
      healthCheckIntervalMs: 30000,
    });
  }

  // ── 抽象メソッド実装 ──

  protected async onInitialize(): Promise<void> {
    // マーケティング関連イベント購読
    this.bus.subscribe('marketing.*', async (event) => {
      await this.handleMarketingEvent(event);
    });

    // SEO関連イベント
    this.bus.subscribe('seo.*', async (event) => {
      await this.handleSEOEvent(event);
    });

    // コンテンツ関連イベント
    this.bus.subscribe('content.*', async (event) => {
      await this.handleContentEvent(event);
    });
  }

  protected async onShutdown(): Promise<void> {
    for (const [, task] of this.activeTasks) {
      task.status = 'failed';
      task.error = 'Lead shutdown';
    }
    this.activeTasks.clear();
  }

  protected async selectAgent(task: TaskItem): Promise<string | null> {
    // T037: 並行タスク上限チェック
    if (this.activeTasks.size >= this.config.maxConcurrentTasks) {
      return null;
    }

    const agentId = this.taskAgentMap[task.type];
    if (!agentId) return null;

    const agentInfo = this.registry.get(agentId);
    if (!agentInfo) return null;

    return agentId;
  }

  protected getTeamAgentIds(): string[] {
    return ['content-writer', 'seo-director'];
  }

  protected async onTeamMemberHealthChange(
    agentId: string,
    status: string,
  ): Promise<void> {
    if (status === 'error' || status === 'shutdown') {
      for (const [taskId, task] of this.activeTasks) {
        if (task.assignedTo === agentId) {
          task.status = 'queued';
          task.assignedTo = undefined;
          this.taskQueue.push(task);
          this.activeTasks.delete(taskId);
        }
      }

      await this.bus.publish({
        id: `health_report_${Date.now()}`,
        type: 'team.health.alert',
        source: this.id.id,
        target: 'commander',
        priority: 'high',
        payload: {
          teamName: this.config.teamName,
          agentId,
          status,
          affectedTasks: this.taskQueue.length,
        },
        timestamp: Date.now(),
      });
    }
  }

  protected async onCustomEvent(event: AgentEvent): Promise<void> {
    if (event.type.startsWith('marketing.') || event.type.startsWith('seo.') || event.type.startsWith('content.')) {
      // すでにinitializeで購読済み — 重複回避
    }
  }

  // ── マーケティング固有ロジック ──

  private async handleMarketingEvent(event: AgentEvent): Promise<void> {
    switch (event.type) {
      case 'marketing.campaign_launch':
        // キャンペーン開始 → コンテンツ + SEOのパイプライン
        await this.triggerCampaignPipeline(event.payload as Record<string, unknown>);
        break;

      case 'marketing.weekly_report':
        // 週次レポート生成
        this.taskQueue.push({
          id: `task_report_${Date.now()}`,
          type: 'seo_audit',
          priority: 'normal',
          status: 'queued',
          createdAt: Date.now(),
          payload: { reportType: 'weekly' },
        });
        await this.processQueue();
        break;
    }
  }

  private async handleSEOEvent(event: AgentEvent): Promise<void> {
    switch (event.type) {
      case 'seo.ranking_drop':
        // ランキング低下アラート → 緊急対応
        this.taskQueue.push({
          id: `task_seo_urgent_${Date.now()}`,
          type: 'seo_audit',
          priority: 'critical',
          status: 'queued',
          createdAt: Date.now(),
          payload: event.payload,
        });
        await this.processQueue();
        break;

      case 'seo.new_keyword':
        // 新キーワード発見 → コンテンツ生成
        this.taskQueue.push({
          id: `task_keyword_${Date.now()}`,
          type: 'write_article',
          priority: 'normal',
          status: 'queued',
          createdAt: Date.now(),
          payload: event.payload,
        });
        await this.processQueue();
        break;
    }
  }

  private async handleContentEvent(event: AgentEvent): Promise<void> {
    const payload = event.payload as {
      contentId?: string;
      lastUpdated?: number;
      articleUrl?: string;
      contentType?: string;
    };

    switch (event.type) {
      case 'content.review_complete':
        // コンテンツレビュー完了 → SEOメタ最適化
        this.taskQueue.push({
          id: `task_meta_${Date.now()}`,
          type: 'meta_optimize',
          priority: 'normal',
          status: 'queued',
          createdAt: Date.now(),
          payload: event.payload,
        });
        await this.processQueue();
        break;

      case 'content.published':
        // T037: コンテンツ新規公開 → 鮮度チェックスケジュール設定
        this.taskQueue.push({
          id: `task_freshness_${Date.now()}`,
          type: 'content_audit',
          priority: 'low',
          status: 'queued',
          createdAt: Date.now(),
          payload: {
            ...payload,
            nextFreshnessCheckAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30日後
          },
        });
        await this.processQueue();
        break;
    }
  }

  /**
   * T037: コンテンツ鮮度監視タスク
   * 30日以上更新されていないコンテンツを検出し、更新提案を生成
   */
  async checkContentFreshness(): Promise<void> {
    // このメソッドはSchedulerから定期的に呼ばれることを想定
    this.taskQueue.push({
      id: `task_freshness_audit_${Date.now()}`,
      type: 'content_audit',
      priority: 'normal',
      status: 'queued',
      createdAt: Date.now(),
      payload: {
        checkType: 'freshness_audit',
        threshold_days: 30,
      },
    });
    await this.processQueue();
  }

  /** キャンペーンパイプライン */
  private async triggerCampaignPipeline(params: Record<string, unknown>): Promise<void> {
    // Step 1: キーワード調査
    this.taskQueue.push({
      id: `task_campaign_kw_${Date.now()}`,
      type: 'keyword_research',
      priority: 'high',
      status: 'queued',
      createdAt: Date.now(),
      payload: { ...params, step: 'keyword_research' },
    });

    // Step 2: コンテンツ生成
    this.taskQueue.push({
      id: `task_campaign_content_${Date.now()}`,
      type: 'write_article',
      priority: 'normal',
      status: 'queued',
      createdAt: Date.now(),
      payload: { ...params, step: 'content_creation' },
    });

    // Step 3: SEO最適化
    this.taskQueue.push({
      id: `task_campaign_seo_${Date.now()}`,
      type: 'meta_optimize',
      priority: 'normal',
      status: 'queued',
      createdAt: Date.now(),
      payload: { ...params, step: 'seo_optimize' },
    });

    await this.processQueue();
  }

  // ── 公開API ──

  getPipelines() {
    return [
      {
        id: 'P4',
        name: 'コンテンツ生成',
        agents: ['content-writer', 'seo-director', 'quality-auditor'],
        steps: ['キーワード選定', '記事生成', 'SEO最適化', '品質チェック', '承認・公開'],
      },
      {
        id: 'P5',
        name: 'SEO最適化',
        agents: ['seo-director', 'content-writer'],
        steps: ['ランキング分析', 'キーワード更新', 'メタ最適化', '効果測定'],
      },
      {
        id: 'P6',
        name: '価格最適化',
        agents: [], // Phase 2
        steps: ['競合分析', '需要予測', '価格提案', '承認・適用'],
      },
    ];
  }
}
