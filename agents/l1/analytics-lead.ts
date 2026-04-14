/**
 * AnalyticsLead — 分析チームリード（L1）
 *
 * 生体対応: 視床下部 室傍核（ストレス応答・ホメオスタシス調節）
 * = データに基づくシステムの恒常性維持（数値が示す健康状態の監視）
 *
 * 配下L2 Agent:
 * - DataAnalyst: 売上・アクセスデータの分析・レポート
 * - ABTestAgent: A/Bテスト設計・実行・判定
 * - InsightAgent: データ統合洞察・予測モデル
 *
 * 管理パイプライン:
 * - P13: データ分析パイプライン
 * - P14: A/Bテストパイプライン
 * - P15: インサイト生成パイプライン
 */

import { BaseLead, type TaskItem } from './base-lead.js';
import type { AgentId, AgentEvent } from '../core/types.js';
import type { AgentBus } from '../core/agent-bus.js';
import type { AgentRegistry } from '../registry/agent-registry.js';
import type { CascadeEngine } from '../core/cascade-engine.js';

export class AnalyticsLead extends BaseLead {
  readonly id: AgentId = {
    id: 'analytics-lead',
    name: 'Analytics Lead',
    level: 'L1',
    team: 'analytics',
    version: '1.0.0',
  };

  private taskAgentMap: Record<string, string> = {
    // データ分析系
    'daily_report': 'data-analyst',
    'weekly_report': 'data-analyst',
    'monthly_report': 'data-analyst',
    'funnel_analysis': 'data-analyst',
    'cohort_analysis': 'data-analyst',
    'revenue_forecast': 'data-analyst',
    // A/Bテスト系
    'create_experiment': 'ab-test-agent',
    'analyze_experiment': 'ab-test-agent',
    'stop_experiment': 'ab-test-agent',
    'significance_test': 'ab-test-agent',
    // インサイト系
    'generate_insights': 'insight-agent',
    'anomaly_detection': 'insight-agent',
    'trend_analysis': 'insight-agent',
    'customer_segmentation': 'insight-agent',
  };

  constructor(
    bus: AgentBus,
    registry: AgentRegistry,
    cascadeEngine: CascadeEngine,
  ) {
    super(bus, registry, cascadeEngine, {
      teamName: 'Analytics',
      maxConcurrentTasks: 3,
      healthCheckIntervalMs: 30000,
    });
  }

  protected async onInitialize(): Promise<void> {
    // データ関連イベントの購読
    this.bus.subscribe('data.*', async (event) => {
      await this.handleDataEvent(event);
    });

    // 分析リクエストの購読
    this.bus.subscribe('analytics.*', async (event) => {
      await this.handleAnalyticsEvent(event);
    });

    // 定期レポートスケジュール（CronJobからのトリガー）
    this.bus.subscribe('schedule.*', async (event) => {
      await this.handleScheduleEvent(event);
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
    const agentId = this.taskAgentMap[task.type];
    if (!agentId) return null;

    const agentInfo = this.registry.get(agentId);
    if (!agentInfo) return null;

    return agentId;
  }

  protected getTeamAgentIds(): string[] {
    return ['data-analyst', 'ab-test-agent', 'insight-agent'];
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
    if (event.type.startsWith('data.')) {
      await this.handleDataEvent(event);
    } else if (event.type.startsWith('analytics.')) {
      await this.handleAnalyticsEvent(event);
    }
  }

  // ── データ固有ロジック ──

  private async handleDataEvent(event: AgentEvent): Promise<void> {
    switch (event.type) {
      case 'data.anomaly':
        // 異常値検知 → インサイトAgentで分析
        this.taskQueue.push({
          id: `task_anomaly_${Date.now()}`,
          type: 'anomaly_detection',
          priority: 'high',
          status: 'queued',
          createdAt: Date.now(),
          payload: event.payload,
        });
        await this.processQueue();
        break;

      case 'data.segment_request':
        // 顧客セグメント分析依頼
        this.taskQueue.push({
          id: `task_segment_${Date.now()}`,
          type: 'customer_segmentation',
          priority: 'normal',
          status: 'queued',
          createdAt: Date.now(),
          payload: event.payload,
        });
        await this.processQueue();
        break;
    }
  }

  private async handleAnalyticsEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'analytics.report_request') {
      const payload = event.payload as { reportType?: string } | undefined;
      const reportType = payload?.reportType || 'daily_report';

      this.taskQueue.push({
        id: `task_report_${Date.now()}`,
        type: reportType,
        priority: 'normal',
        status: 'queued',
        createdAt: Date.now(),
        payload: event.payload,
      });
      await this.processQueue();
    }
  }

  private async handleScheduleEvent(event: AgentEvent): Promise<void> {
    const payload = event.payload as { task?: string } | undefined;

    if (payload?.task) {
      this.taskQueue.push({
        id: `task_sched_${Date.now()}`,
        type: payload.task,
        priority: 'normal',
        status: 'queued',
        createdAt: Date.now(),
        payload: event.payload,
      });
      await this.processQueue();
    }
  }

  getPipelines() {
    return [
      {
        id: 'P13',
        name: 'データ分析パイプライン',
        agents: ['data-analyst'],
        steps: ['データ収集', 'クレンジング', '分析', 'レポート生成', '配信'],
      },
      {
        id: 'P14',
        name: 'A/Bテストパイプライン',
        agents: ['ab-test-agent', 'data-analyst'],
        steps: ['仮説設計', 'バリアント作成', '実行', '統計検定', '判定・適用'],
      },
      {
        id: 'P15',
        name: 'インサイト生成',
        agents: ['insight-agent', 'data-analyst'],
        steps: ['データ統合', 'パターン検出', '洞察生成', '提案', 'アクション'],
      },
    ];
  }
}
