/**
 * TechnologyLead — 技術チームリード（L1）
 *
 * 生体対応: 視床下部 視交叉上核（体内時計の制御中枢）
 * = システム全体のリズム（デプロイサイクル、監視周期）を統括
 *
 * 配下L2 Agent:
 * - DevOpsAgent: デプロイ・CI/CD・インフラ管理
 * - SecurityAgent: セキュリティ監査・脆弱性チェック
 * - PerformanceAgent: パフォーマンス監視・Core Web Vitals最適化
 * - QualityAuditor: コード品質・テスト自動化
 *
 * 管理パイプライン:
 * - P10: デプロイパイプライン
 * - P11: セキュリティ監査パイプライン
 * - P12: パフォーマンス最適化パイプライン
 */

import { BaseLead, type TaskItem } from './base-lead.js';
import type { AgentId, AgentEvent } from '../core/types.js';
import type { AgentBus } from '../core/agent-bus.js';
import type { AgentRegistry } from '../registry/agent-registry.js';
import type { CascadeEngine } from '../core/cascade-engine.js';

export class TechnologyLead extends BaseLead {
  readonly id: AgentId = {
    id: 'technology-lead',
    name: 'Technology Lead',
    level: 'L1',
    team: 'technology',
    version: '1.0.0',
  };

  private taskAgentMap: Record<string, string> = {
    // DevOps系
    'deploy_staging': 'devops-agent',
    'deploy_production': 'devops-agent',
    'rollback': 'devops-agent',
    'env_config': 'devops-agent',
    'build_check': 'devops-agent',
    // セキュリティ系
    'security_audit': 'security-agent',
    'vulnerability_scan': 'security-agent',
    'csp_review': 'security-agent',
    'dependency_check': 'security-agent',
    // パフォーマンス系
    'lighthouse_audit': 'performance-agent',
    'cwv_check': 'performance-agent',
    'bundle_analysis': 'performance-agent',
    'cache_optimization': 'performance-agent',
    // 品質系
    'code_review': 'quality-auditor',
    'test_coverage': 'quality-auditor',
    'regression_test': 'quality-auditor',
    'type_check': 'quality-auditor',
  };

  constructor(
    bus: AgentBus,
    registry: AgentRegistry,
    cascadeEngine: CascadeEngine,
  ) {
    super(bus, registry, cascadeEngine, {
      teamName: 'Technology',
      maxConcurrentTasks: 5,
      healthCheckIntervalMs: 20000,
    });
  }

  protected async onInitialize(): Promise<void> {
    // デプロイイベントの購読
    this.bus.subscribe('deploy.*', async (event) => {
      await this.handleDeployEvent(event);
    });

    // セキュリティアラートの購読
    this.bus.subscribe('security.*', async (event) => {
      await this.handleSecurityEvent(event);
    });

    // パフォーマンスアラートの購読
    this.bus.subscribe('performance.*', async (event) => {
      await this.handlePerformanceEvent(event);
    });

    // ビルドイベントの購読
    this.bus.subscribe('build.*', async (event) => {
      await this.handleBuildEvent(event);
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
    // T040: 並行タスク上限チェック
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
    return ['devops-agent', 'security-agent', 'performance-agent', 'quality-auditor'];
  }

  protected async onTeamMemberHealthChange(
    agentId: string,
    status: string,
  ): Promise<void> {
    if (status === 'error' || status === 'shutdown') {
      // セキュリティAgentダウンは最優先で報告
      const priority = agentId === 'security-agent' ? 'critical' : 'high';

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
        priority,
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
    if (event.type.startsWith('deploy.')) {
      await this.handleDeployEvent(event);
    } else if (event.type.startsWith('security.')) {
      await this.handleSecurityEvent(event);
    }
  }

  // ── 技術固有ロジック ──

  private async handleDeployEvent(event: AgentEvent): Promise<void> {
    switch (event.type) {
      case 'deploy.request':
        this.taskQueue.push({
          id: `task_deploy_${Date.now()}`,
          type: event.payload && typeof event.payload === 'object' && 'env' in event.payload && (event.payload as Record<string, unknown>).env === 'production'
            ? 'deploy_production'
            : 'deploy_staging',
          priority: 'critical',
          status: 'queued',
          createdAt: Date.now(),
          payload: event.payload,
        });
        await this.processQueue();
        break;

      case 'deploy.failed':
        // デプロイ失敗 → ロールバック指示
        this.taskQueue.push({
          id: `task_rollback_${Date.now()}`,
          type: 'rollback',
          priority: 'critical',
          status: 'queued',
          createdAt: Date.now(),
          payload: event.payload,
        });
        await this.processQueue();
        break;
    }
  }

  private async handleSecurityEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'security.vulnerability_detected') {
      this.taskQueue.push({
        id: `task_vuln_${Date.now()}`,
        type: 'vulnerability_scan',
        priority: 'critical',
        status: 'queued',
        createdAt: Date.now(),
        payload: event.payload,
      });
      await this.processQueue();
    }
  }

  private async handlePerformanceEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'performance.degradation') {
      this.taskQueue.push({
        id: `task_perf_${Date.now()}`,
        type: 'lighthouse_audit',
        priority: 'high',
        status: 'queued',
        createdAt: Date.now(),
        payload: event.payload,
      });
      await this.processQueue();
    }
  }

  private async handleBuildEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'build.failed') {
      this.taskQueue.push({
        id: `task_build_${Date.now()}`,
        type: 'build_check',
        priority: 'critical',
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
        id: 'P10',
        name: 'デプロイパイプライン',
        agents: ['devops-agent', 'quality-auditor'],
        steps: ['ビルド', 'テスト', 'ステージング', '検証', '本番'],
      },
      {
        id: 'P11',
        name: 'セキュリティ監査',
        agents: ['security-agent'],
        steps: ['依存関係スキャン', 'CSPチェック', '脆弱性報告', '修正', '再監査'],
      },
      {
        id: 'P12',
        name: 'パフォーマンス最適化',
        agents: ['performance-agent', 'devops-agent'],
        steps: ['Lighthouse監査', 'CWV測定', 'ボトルネック分析', '最適化', '再計測'],
      },
    ];
  }
}
