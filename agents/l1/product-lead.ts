/**
 * ProductLead — 商品チームリード（L1）
 *
 * 生体対応: 視床下部 腹内側核（栄養代謝の制御中枢）
 * 商品に関する全てのAI活動を統括。
 *
 * 配下L2 Agent:
 * - ImageGenerator: バナー・商品画像の自動生成
 * - ProductCatalog: 商品カタログの管理・最適化
 * - UXAgent: UI/UXの自動テスト・改善提案
 *
 * 管理パイプライン:
 * - P1: バナー自動生成
 * - P2: 商品カタログ更新
 * - P3: UX最適化
 */

import { BaseLead, type TaskItem } from './base-lead.js';
import type { AgentId, AgentEvent } from '../core/types.js';
import type { AgentBus } from '../core/agent-bus.js';
import type { AgentRegistry } from '../registry/agent-registry.js';
import type { CascadeEngine } from '../core/cascade-engine.js';

export class ProductLead extends BaseLead {
  readonly id: AgentId = {
    id: 'product-lead',
    name: 'Product Lead',
    level: 'L1',
    team: 'product-lead',
    version: '1.0.0',
  };

  // タスクタイプ → 対応L2 Agent のマッピング
  private taskAgentMap: Record<string, string> = {
    'generate_banner': 'image-generator',
    'update_banner': 'image-generator',
    'regenerate_all_banners': 'image-generator',
    'update_catalog': 'product-catalog',
    'sync_products': 'product-catalog',
    'audit_catalog': 'product-catalog',
    'ux_audit': 'ux-agent',
    'ux_test': 'ux-agent',
    'lighthouse_run': 'ux-agent',
  };

  constructor(
    bus: AgentBus,
    registry: AgentRegistry,
    cascadeEngine: CascadeEngine,
  ) {
    super(bus, registry, cascadeEngine, {
      teamName: 'Product',
      maxConcurrentTasks: 3,
      healthCheckIntervalMs: 30000,
    });
  }

  // ── 抽象メソッド実装 ──

  protected async onInitialize(): Promise<void> {
    // 商品関連イベントの購読
    this.bus.subscribe('product.*', async (event) => {
      await this.handleProductEvent(event);
    });

    // Shopifyウェブフック（商品追加・更新・削除）
    this.bus.subscribe('shopify.product.*', async (event) => {
      await this.handleShopifyWebhook(event);
    });
  }

  protected async onShutdown(): Promise<void> {
    // アクティブタスクのクリーンアップ
    for (const [taskId, task] of this.activeTasks) {
      task.status = 'failed';
      task.error = 'Lead shutdown';
    }
    this.activeTasks.clear();
  }

  protected async selectAgent(task: TaskItem): Promise<string | null> {
    // T039: 並行タスク上限チェック
    if (this.activeTasks.size >= this.config.maxConcurrentTasks) {
      return null;
    }

    // タスクタイプに基づくAgent選定
    const agentId = this.taskAgentMap[task.type];

    if (!agentId) {
      // 未知のタスクタイプはnull（キューに戻される）
      return null;
    }

    // Agentが登録されているか確認
    const agentInfo = this.registry.get(agentId);
    if (!agentInfo) {
      // まだ未構築のAgent
      return null;
    }

    return agentId;
  }

  protected getTeamAgentIds(): string[] {
    return ['image-generator', 'product-catalog', 'ux-agent'];
  }

  protected async onTeamMemberHealthChange(
    agentId: string,
    status: string,
  ): Promise<void> {
    if (status === 'error' || status === 'shutdown') {
      // 該当Agentに割り当て済みのタスクを再キュー
      for (const [taskId, task] of this.activeTasks) {
        if (task.assignedTo === agentId) {
          task.status = 'queued';
          task.assignedTo = undefined;
          this.taskQueue.push(task);
          this.activeTasks.delete(taskId);
        }
      }

      // Commanderに障害報告
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
    // 商品チーム固有イベント
    if (event.type.startsWith('product.')) {
      await this.handleProductEvent(event);
    }
  }

  // ── 商品固有ロジック ──

  private async handleProductEvent(event: AgentEvent): Promise<void> {
    switch (event.type) {
      case 'product.new_collab':
        // 新IPコラボ追加 → バナー生成 + カタログ更新のパイプライン
        await this.triggerNewCollabPipeline(event.payload as Record<string, unknown>);
        break;

      case 'product.price_change':
        // 価格変更 → カタログ更新
        this.taskQueue.push({
          id: `task_price_${Date.now()}`,
          type: 'update_catalog',
          priority: 'high',
          status: 'queued',
          createdAt: Date.now(),
          payload: event.payload,
        });
        await this.processQueue();
        break;

      case 'product.image_request':
        // 画像生成リクエスト
        this.taskQueue.push({
          id: `task_img_${Date.now()}`,
          type: 'generate_banner',
          priority: 'normal',
          status: 'queued',
          createdAt: Date.now(),
          payload: event.payload,
        });
        await this.processQueue();
        break;
    }
  }

  private async handleShopifyWebhook(event: AgentEvent): Promise<void> {
    const payload = event.payload as { action: string; productId: string };

    switch (payload.action) {
      case 'create':
      case 'update':
        this.taskQueue.push({
          id: `task_shopify_${Date.now()}`,
          type: 'sync_products',
          priority: 'normal',
          status: 'queued',
          createdAt: Date.now(),
          payload,
        });
        break;

      case 'delete':
        this.taskQueue.push({
          id: `task_shopify_del_${Date.now()}`,
          type: 'audit_catalog',
          priority: 'high',
          status: 'queued',
          createdAt: Date.now(),
          payload,
        });
        break;
    }

    await this.processQueue();
  }

  /** 新IPコラボパイプライン（P1のサブセット） */
  private async triggerNewCollabPipeline(params: Record<string, unknown>): Promise<void> {
    // Step 1: カタログ登録
    this.taskQueue.push({
      id: `task_collab_catalog_${Date.now()}`,
      type: 'update_catalog',
      priority: 'high',
      status: 'queued',
      createdAt: Date.now(),
      payload: { ...params, step: 'catalog_register' },
    });

    // Step 2: バナー生成（カタログ完了後に実行 → 依存関係あり）
    this.taskQueue.push({
      id: `task_collab_banner_${Date.now()}`,
      type: 'generate_banner',
      priority: 'normal',
      status: 'queued',
      createdAt: Date.now(),
      payload: { ...params, step: 'banner_generate' },
    });

    await this.processQueue();
  }

  // ── 公開API ──

  /** パイプライン一覧 */
  getPipelines() {
    return [
      {
        id: 'P1',
        name: 'バナー自動生成',
        agents: ['image-generator', 'quality-auditor'],
        steps: ['画像生成', '品質チェック', '承認待ち', '公開'],
      },
      {
        id: 'P2',
        name: '商品カタログ更新',
        agents: ['product-catalog', 'seo-director'],
        steps: ['Shopify同期', 'SEO最適化', 'メタデータ更新', '検証'],
      },
      {
        id: 'P3',
        name: 'UX最適化',
        agents: ['ux-agent'],
        steps: ['Lighthouse監査', '改善提案', 'A/Bテスト', '適用'],
      },
    ];
  }
}
