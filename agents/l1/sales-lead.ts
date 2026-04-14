/**
 * SalesLead — 営業・収益チームリード（L1）
 *
 * 生体対応: 視床下部 外側核（摂食中枢 = エネルギー獲得）
 * = 売上＝エネルギー獲得を統括する制御中枢
 *
 * 配下L2 Agent:
 * - PricingAgent: 価格最適化・ダイナミックプライシング
 * - PromotionAgent: セール・キャンペーン企画・実行
 * - ConversionAgent: カート最適化・CVR改善
 * - SupportAgent: カスタマーサポート・FAQ・フィードバック分析
 *
 * 管理パイプライン:
 * - P7: 価格最適化パイプライン
 * - P8: キャンペーン実行パイプライン
 * - P9: コンバージョン改善パイプライン
 */

import { BaseLead, type TaskItem } from './base-lead.js';
import type { AgentId, AgentEvent } from '../core/types.js';
import type { AgentBus } from '../core/agent-bus.js';
import type { AgentRegistry } from '../registry/agent-registry.js';
import type { CascadeEngine } from '../core/cascade-engine.js';

export class SalesLead extends BaseLead {
  readonly id: AgentId = {
    id: 'sales-lead',
    name: 'Sales Lead',
    level: 'L1',
    team: 'sales',
    version: '1.0.0',
  };

  private taskAgentMap: Record<string, string> = {
    // 価格最適化系
    'price_analysis': 'pricing-agent',
    'dynamic_pricing': 'pricing-agent',
    'competitor_price_check': 'pricing-agent',
    'margin_optimization': 'pricing-agent',
    // プロモーション系
    'create_campaign': 'promotion-agent',
    'schedule_sale': 'promotion-agent',
    'discount_code_generate': 'promotion-agent',
    'campaign_analytics': 'promotion-agent',
    // コンバージョン系
    'cart_optimization': 'conversion-agent',
    'checkout_analysis': 'conversion-agent',
    'upsell_optimization': 'conversion-agent',
    'abandonment_analysis': 'conversion-agent',
    // カスタマーサポート系（顧客対応は営業チームの管轄）
    'ticket_response': 'support-agent',
    'faq_update': 'support-agent',
    'escalate': 'support-agent',
    'customer_feedback_analyze': 'support-agent',
  };

  constructor(
    bus: AgentBus,
    registry: AgentRegistry,
    cascadeEngine: CascadeEngine,
  ) {
    super(bus, registry, cascadeEngine, {
      teamName: 'Sales',
      maxConcurrentTasks: 4,
      healthCheckIntervalMs: 30000,
    });
  }

  protected async onInitialize(): Promise<void> {
    // 売上関連イベントの購読
    this.bus.subscribe('sales.*', async (event) => {
      await this.handleSalesEvent(event);
    });

    // Shopify注文イベント
    this.bus.subscribe('shopify.order.*', async (event) => {
      await this.handleOrderEvent(event);
    });

    // カート関連イベント
    this.bus.subscribe('cart.*', async (event) => {
      await this.handleCartEvent(event);
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
    // T036: 並行タスク管理を強化
    // maxConcurrentTasks を超えないよう事前チェック
    if (this.activeTasks.size >= this.config.maxConcurrentTasks) {
      return null;
    }

    const agentId = this.taskAgentMap[task.type];
    if (!agentId) {
      // 未対応のタスク型
      return null;
    }

    const agentInfo = this.registry.get(agentId);
    if (!agentInfo) return null;

    return agentId;
  }

  protected getTeamAgentIds(): string[] {
    return ['pricing-agent', 'promotion-agent', 'conversion-agent', 'support-agent'];
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
    if (event.type.startsWith('sales.')) {
      await this.handleSalesEvent(event);
    }
  }

  // ── 営業固有ロジック ──

  private async handleSalesEvent(event: AgentEvent): Promise<void> {
    switch (event.type) {
      case 'sales.conversion_drop':
        // CVR低下検知 → コンバージョン分析
        this.taskQueue.push({
          id: `task_cvr_${Date.now()}`,
          type: 'checkout_analysis',
          priority: 'high',
          status: 'queued',
          createdAt: Date.now(),
          payload: event.payload,
        });
        await this.processQueue();
        break;

      case 'sales.competitor_alert':
        // 競合価格変動 → 価格分析
        this.taskQueue.push({
          id: `task_comp_${Date.now()}`,
          type: 'competitor_price_check',
          priority: 'high',
          status: 'queued',
          createdAt: Date.now(),
          payload: event.payload,
        });
        await this.processQueue();
        break;

      case 'sales.campaign_request':
        // キャンペーン依頼 → プロモーション企画
        this.taskQueue.push({
          id: `task_camp_${Date.now()}`,
          type: 'create_campaign',
          priority: 'normal',
          status: 'queued',
          createdAt: Date.now(),
          payload: event.payload,
        });
        await this.processQueue();
        break;
    }
  }

  private async handleOrderEvent(event: AgentEvent): Promise<void> {
    const payload = event.payload as {
      action: string;
      orderValue?: number;
      orderId?: string;
      itemCount?: number;
      customerId?: string;
    };

    if (payload.action === 'create') {
      // T036: 注文イベント分類とビジネスルール
      const orderValue = payload.orderValue || 0;
      let priority: TaskItem['priority'] = 'low';
      let taskType = 'upsell_optimization';

      // ビジネスルール: 注文額が100,000円以上 → レビュー対象フラグ
      if (orderValue >= 100000) {
        priority = 'high';
        // 高額注文は別途マージン最適化の対象にもなる
      }

      // 新規注文 → アップセル最適化のフィードバック
      this.taskQueue.push({
        id: `task_order_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: taskType,
        priority,
        status: 'queued',
        createdAt: Date.now(),
        payload: {
          ...payload,
          flaggedForReview: orderValue >= 100000,
          tier: orderValue >= 100000 ? 'vip' : 'standard',
        },
      });
      await this.processQueue();
    } else if (payload.action === 'fulfilled') {
      // T036: 注文履行イベント → 在庫監視
      this.taskQueue.push({
        id: `task_inventory_check_${Date.now()}`,
        type: 'inventory_check', // InventoryWatcherへ
        priority: 'normal',
        status: 'queued',
        createdAt: Date.now(),
        payload,
      });
      await this.processQueue();
    }
  }

  private async handleCartEvent(event: AgentEvent): Promise<void> {
    const payload = event.payload as {
      cartValue?: number;
      itemCount?: number;
      customerId?: string;
    };

    if (event.type === 'cart.abandoned') {
      // T036: カート放棄分析（CVR改善へ）
      this.taskQueue.push({
        id: `task_abandon_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'abandonment_analysis',
        priority: 'normal',
        status: 'queued',
        createdAt: Date.now(),
        payload: {
          ...payload,
          recoveryValue: payload.cartValue || 0,
        },
      });
      await this.processQueue();
    } else if (event.type === 'cart.updated') {
      // T036: カート更新時の価格変動チェック
      this.taskQueue.push({
        id: `task_cart_price_${Date.now()}`,
        type: 'cart_optimization',
        priority: 'normal',
        status: 'queued',
        createdAt: Date.now(),
        payload,
      });
      await this.processQueue();
    }
  }

  getPipelines() {
    return [
      {
        id: 'P7',
        name: '価格最適化',
        agents: ['pricing-agent', 'data-analyst'],
        steps: ['競合分析', '需要予測', '価格提案', '承認', '適用'],
      },
      {
        id: 'P8',
        name: 'キャンペーン実行',
        agents: ['promotion-agent', 'content-writer'],
        steps: ['企画', 'クリエイティブ', 'スケジュール', '配信', '効果測定'],
      },
      {
        id: 'P9',
        name: 'コンバージョン改善',
        agents: ['conversion-agent', 'ux-agent'],
        steps: ['ファネル分析', 'ボトルネック特定', '改善提案', 'A/Bテスト', '適用'],
      },
    ];
  }
}
