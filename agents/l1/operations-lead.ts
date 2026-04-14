/**
 * OperationsLead — 運用チームリード（L1）
 *
 * 生体対応: 視床下部 背内側核（生体リズム、恒常性維持）
 * = システム運用の継続性・信頼性の管理
 *
 * 配下L2 Agent:
 * - InventoryWatcher: 在庫管理・補充・廃棄検知
 * - DeploymentAgent: デプロイ・リリース管理
 * - MonitoringAgent: システム監視・アラート・ダッシュボード
 * - DataSyncAgent: Shopify同期・連携
 *
 * 管理パイプライン:
 * - P10: 在庫管理パイプライン
 * - P11: デプロイメントパイプライン
 * - P12: 監視・アラートパイプライン
 */

import { BaseLead, type TaskItem } from './base-lead.js';
import type { AgentId, AgentEvent } from '../core/types.js';
import type { AgentBus } from '../core/agent-bus.js';
import type { AgentRegistry } from '../registry/agent-registry.js';
import type { CascadeEngine } from '../core/cascade-engine.js';

export class OperationsLead extends BaseLead {
  readonly id: AgentId = {
    id: 'operations-lead',
    name: 'Operations Lead',
    level: 'L1',
    team: 'operations',
    version: '1.0.0',
  };

  private taskAgentMap: Record<string, string> = {
    // 在庫系
    'inventory_check': 'inventory-watcher',
    'low_stock_alert': 'inventory-watcher',
    'stock_reorder': 'inventory-watcher',
    'inventory_forecast': 'inventory-watcher',
    // デプロイ系
    'create_deployment': 'deployment-agent',
    'rollback_deployment': 'deployment-agent',
    'canary_release': 'deployment-agent',
    'deployment_status': 'deployment-agent',
    // 監視系
    'health_check': 'monitoring-agent',
    'alert_trigger': 'monitoring-agent',
    'performance_report': 'monitoring-agent',
    'incident_report': 'monitoring-agent',
    // データ同期系
    'sync_shopify': 'data-sync-agent',
    'catalog_sync': 'data-sync-agent',
    'customer_sync': 'data-sync-agent',
  };

  constructor(
    bus: AgentBus,
    registry: AgentRegistry,
    cascadeEngine: CascadeEngine,
  ) {
    super(bus, registry, cascadeEngine, {
      teamName: 'Operations',
      maxConcurrentTasks: 5,
      healthCheckIntervalMs: 30000,
    });
  }

  protected async onInitialize(): Promise<void> {
    // インベントリイベント購読
    this.bus.subscribe('inventory.*', async (event) => {
      await this.handleInventoryEvent(event);
    });

    // デプロイメントイベント購読
    this.bus.subscribe('deployment.*', async (event) => {
      await this.handleDeploymentEvent(event);
    });

    // システム監視イベント購読
    this.bus.subscribe('system.*', async (event) => {
      await this.handleSystemEvent(event);
    });

    // Shopify同期イベント購読
    this.bus.subscribe('sync.*', async (event) => {
      await this.handleSyncEvent(event);
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
    // T038: 並行タスク上限チェック
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
    return ['inventory-watcher', 'deployment-agent', 'monitoring-agent', 'data-sync-agent'];
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
    // 詳細なイベントハンドリングはハンドラメソッドで実施
  }

  // ── 運用固有ロジック ──

  private async handleInventoryEvent(event: AgentEvent): Promise<void> {
    const payload = event.payload as {
      sku?: string;
      stockLevel?: number;
      threshold?: number;
    };

    switch (event.type) {
      case 'inventory.low_stock':
        // T038: 低在庫アラート → 補充タスク
        this.taskQueue.push({
          id: `task_reorder_${Date.now()}`,
          type: 'stock_reorder',
          priority: 'high',
          status: 'queued',
          createdAt: Date.now(),
          payload,
        });
        await this.processQueue();
        break;

      case 'inventory.check':
        // 在庫確認タスク
        this.taskQueue.push({
          id: `task_inv_check_${Date.now()}`,
          type: 'inventory_check',
          priority: 'normal',
          status: 'queued',
          createdAt: Date.now(),
          payload,
        });
        await this.processQueue();
        break;
    }
  }

  private async handleDeploymentEvent(event: AgentEvent): Promise<void> {
    const payload = event.payload as {
      version?: string;
      environment?: 'staging' | 'production';
    };

    switch (event.type) {
      case 'deployment.request':
        // T038: デプロイリクエスト → デプロイメント実行
        this.taskQueue.push({
          id: `task_deploy_${Date.now()}`,
          type: 'create_deployment',
          priority: payload.environment === 'production' ? 'high' : 'normal',
          status: 'queued',
          createdAt: Date.now(),
          payload,
        });
        await this.processQueue();
        break;

      case 'deployment.rollback':
        // ロールバック要求（高優先度）
        this.taskQueue.push({
          id: `task_rollback_${Date.now()}`,
          type: 'rollback_deployment',
          priority: 'critical',
          status: 'queued',
          createdAt: Date.now(),
          payload,
        });
        await this.processQueue();
        break;
    }
  }

  private async handleSystemEvent(event: AgentEvent): Promise<void> {
    switch (event.type) {
      case 'system.health_check':
        // T038: システム健全性チェック
        this.taskQueue.push({
          id: `task_health_${Date.now()}`,
          type: 'health_check',
          priority: 'normal',
          status: 'queued',
          createdAt: Date.now(),
          payload: event.payload,
        });
        await this.processQueue();
        break;

      case 'system.alert':
        // システムアラート（高優先度）
        this.taskQueue.push({
          id: `task_alert_${Date.now()}`,
          type: 'alert_trigger',
          priority: 'high',
          status: 'queued',
          createdAt: Date.now(),
          payload: event.payload,
        });
        await this.processQueue();
        break;
    }
  }

  private async handleSyncEvent(event: AgentEvent): Promise<void> {
    switch (event.type) {
      case 'sync.shopify_request':
        // T038: Shopify同期リクエスト
        this.taskQueue.push({
          id: `task_sync_${Date.now()}`,
          type: 'sync_shopify',
          priority: 'normal',
          status: 'queued',
          createdAt: Date.now(),
          payload: event.payload,
        });
        await this.processQueue();
        break;
    }
  }

  getPipelines() {
    return [
      {
        id: 'P10',
        name: '在庫管理',
        agents: ['inventory-watcher', 'data-analyst'],
        steps: ['在庫確認', '予測', '補充判定', '発注', '確認'],
      },
      {
        id: 'P11',
        name: 'デプロイメント',
        agents: ['deployment-agent', 'monitoring-agent'],
        steps: ['準備', 'ステージング検証', 'カナリア', '本番デプロイ', '監視'],
      },
      {
        id: 'P12',
        name: '監視・アラート',
        agents: ['monitoring-agent', 'incident-responder'],
        steps: ['メトリクス収集', '分析', 'アラート判定', '通知', 'エスカレーション'],
      },
    ];
  }
}
