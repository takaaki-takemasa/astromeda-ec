/**
 * BaseLead — L1チームリード基底クラス（視床下部=ホルモン調節中枢）
 *
 * 生体対応: 視床下部の各核（制御中枢）
 * Commanderからのカスケード指令を受け取り、
 * 配下のL2 Agentに適切に分配・管理する。
 *
 * 全L1リードに共通の機能:
 * - カスケード指令の受信・分配
 * - 配下Agent健全性管理
 * - チーム内タスクキュー管理
 * - 成果の上位報告（Commander宛て）
 */

import type {
  IAgent,
  AgentId,
  AgentHealth,
  AgentEvent,
  CascadeCommand,
  AgentStatus,
} from '../core/types.js';
import type { AgentBus } from '../core/agent-bus.js';
import type { AgentRegistry } from '../registry/agent-registry.js';
import type { CascadeEngine } from '../core/cascade-engine.js';
import { getAIBrain } from '../core/ai-brain.js';
import type { AIDecision, AIAnalysis } from '../core/ai-brain.js';
import type { ApprovalRequest } from '../core/approval-queue.js';

export interface TeamConfig {
  teamName: string;
  maxConcurrentTasks: number;
  healthCheckIntervalMs: number;
}

export interface TaskItem {
  id: string;
  type: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  assignedTo?: string;
  status: 'queued' | 'assigned' | 'running' | 'completed' | 'failed';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  payload: unknown;
  result?: unknown;
  error?: string;
}

export abstract class BaseLead implements IAgent {
  abstract readonly id: AgentId;

  protected status: AgentStatus = 'initializing';
  protected startTime = Date.now();
  protected errorCount = 0;
  protected taskQueue: TaskItem[] = [];
  protected activeTasks = new Map<string, TaskItem>();

  protected bus: AgentBus;
  protected registry: AgentRegistry;
  protected cascadeEngine: CascadeEngine;
  protected config: TeamConfig;

  constructor(
    bus: AgentBus,
    registry: AgentRegistry,
    cascadeEngine: CascadeEngine,
    config: TeamConfig,
  ) {
    this.bus = bus;
    this.registry = registry;
    this.cascadeEngine = cascadeEngine;
    this.config = config;
  }

  // ── IAgent実装 ──

  getHealth(): AgentHealth {
    return {
      agentId: this.id.id,
      status: this.status,
      lastHeartbeat: Date.now(),
      uptime: Date.now() - this.startTime,
      errorCount: this.errorCount,
      memoryUsage: 0,
      taskQueue: this.taskQueue.length + this.activeTasks.size,
    };
  }

  async initialize(): Promise<void> {
    try {
      // パイプラインコマンドを受信（血管系からの指令を受け付ける受容体）
      // agentIdを設定: ターゲット指定イベントの受容体として自身を登録
      this.bus.subscribe('command.*', async (event) => {
        if (event.target === this.id.id) {
          const command: CascadeCommand = {
            id: event.correlationId || event.id,
            from: event.source,
            to: [this.id.id],
            action: (event.payload && typeof event.payload === 'object' && 'action' in event.payload ? String((event.payload as Record<string, unknown>).action) : '') || event.type.replace('command.', ''),
            params: (event.payload && typeof event.payload === 'object' ? event.payload as Record<string, unknown> : {}),
            priority: event.priority,
          };
          await this.handleCommand(command);
        }
      }, undefined, { agentId: this.id.id });

      // カスケード指令の購読（ターゲットフィルタ: 自分宛のみ受信）
      this.bus.subscribe('cascade.command', async (event) => {
        if (event.target === this.id.id) {
          await this.handleCascadeCommand(event);
        }
      }, undefined, { agentId: this.id.id });

      // チーム内Agent健全性監視（全健全性イベントを受信）
      this.bus.subscribe('health.*', async (event) => {
        await this.handleTeamHealth(event);
      });

      // チーム固有の初期化
      await this.onInitialize();

      this.status = 'healthy';
    } catch (err) {
      this.errorCount++;
      this.status = 'error';
      throw err;
    }
  }

  async shutdown(): Promise<void> {
    this.status = 'shutdown';
    await this.onShutdown();
  }

  async handleEvent(event: AgentEvent): Promise<void> {
    switch (event.type) {
      case 'cascade.command':
        await this.handleCascadeCommand(event);
        break;
      case 'task.result':
        await this.handleTaskResult(event);
        break;
      default:
        await this.onCustomEvent(event);
    }
  }

  async handleCommand(command: CascadeCommand): Promise<unknown> {
    // タスクとしてキューに追加
    const task: TaskItem = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: command.action,
      priority: command.priority,
      status: 'queued',
      createdAt: Date.now(),
      payload: command.params,
    };

    this.taskQueue.push(task);
    await this.processQueue();

    return { taskId: task.id, queued: true };
  }

  // ── タスクキュー管理 ──

  /** キューからタスクを取り出してL2 Agentに割り当て（A-01: finally保証付き） */
  protected async processQueue(): Promise<void> {
    while (
      this.taskQueue.length > 0 &&
      this.activeTasks.size < this.config.maxConcurrentTasks
    ) {
      // 優先度順にソート
      this.taskQueue.sort((a, b) => {
        const order = { critical: 0, high: 1, normal: 2, low: 3 };
        return order[a.priority] - order[b.priority];
      });

      const task = this.taskQueue.shift()!;
      task.status = 'assigned';
      task.startedAt = Date.now();

      // 最適なL2 Agentを選定（try/catchで保護: A-01）
      let targetAgent: string | null = null;
      try {
        targetAgent = await this.selectAgent(task);
      } catch (err) {
        // selectAgent失敗 → タスク失敗として記録（リソースリーク防止）
        task.status = 'failed';
        task.error = `Agent selection failed: ${err instanceof Error ? err.message : String(err)}`;
        this.errorCount++;
        continue; // 次のタスクへ
      }

      if (targetAgent) {
        task.assignedTo = targetAgent;
        task.status = 'running';
        this.activeTasks.set(task.id, task);

        // L2にカスケード配信（finally: activeTasks整合性保証）
        try {
          await this.cascadeEngine.execute({
            id: task.id,
            from: this.id.id,
            to: [targetAgent],
            action: task.type,
            params: task.payload as Record<string, unknown>,
            priority: task.priority,
          });
        } catch (err) {
          task.status = 'failed';
          task.error = err instanceof Error ? err.message : String(err);
          this.errorCount++;
        } finally {
          // 失敗した場合のみactiveTasksからクリーンアップ
          if (task.status === 'failed') {
            this.activeTasks.delete(task.id);
          }
        }
      } else {
        // I-02: null処理強化 — リトライ上限3回で打ち切り（無限キュー待ち防止）
        const retryCount = ((task as any)._retryCount ?? 0) + 1;
        (task as any)._retryCount = retryCount;

        if (retryCount >= 3) {
          // 3回AgentマッチングでNull→タスク失敗として処理
          task.status = 'failed';
          task.error = 'No available L2 agent after 3 attempts';
          this.errorCount++;
          // Commanderに失敗報告
          try {
            await this.bus.publish({
              id: `no_agent_${task.id}`,
              type: 'task.completed',
              source: this.id.id,
              target: 'commander',
              priority: 'high',
              payload: {
                taskId: task.id,
                type: task.type,
                status: 'failed',
                error: 'No L2 agent available for delegation',
              },
              timestamp: Date.now(),
            });
          } catch { /* Bus障害時は通知断念 */ }
        } else {
          // 対応可能なAgentがいない場合はキューに戻す
          task.status = 'queued';
          this.taskQueue.unshift(task);
        }
        break;
      }
    }
  }

  // ── カスケード指令処理 ──

  private async handleCascadeCommand(event: AgentEvent): Promise<void> {
    try {
      const payload = event.payload as {
        action: string;
        params: Record<string, unknown>;
        cascadeId: string;
      };

      // L0からの指令をタスクに変換
      const task: TaskItem = {
        id: `task_${payload.cascadeId}`,
        type: payload.action,
        priority: event.priority as TaskItem['priority'],
        status: 'queued',
        createdAt: Date.now(),
        payload: payload.params,
      };

      this.taskQueue.push(task);
      await this.processQueue();

      // 受領レスポンスを返す
      await this.bus.publish({
        id: `resp_${event.id}`,
        type: 'cascade.command.response',
        source: this.id.id,
        priority: 'normal',
        payload: { status: 'accepted', taskId: task.id },
        timestamp: Date.now(),
        correlationId: event.id,
      });
    } catch (err) {
      this.errorCount++;
      // カスケード指令処理失敗は上位に通知（免疫不全の警報）
      try {
        await this.bus.publish({
          id: `err_cascade_${event.id}`,
          type: 'cascade.command.response',
          source: this.id.id,
          priority: 'high',
          payload: { status: 'error', error: err instanceof Error ? err.message : String(err) },
          timestamp: Date.now(),
          correlationId: event.id,
        });
      } catch { /* Bus障害時は通知断念 */ }
    }
  }

  // ── タスク結果処理 ──

  private async handleTaskResult(event: AgentEvent): Promise<void> {
    try {
      const payload = event.payload as { taskId: string; result: unknown; status: string };
      const task = this.activeTasks.get(payload.taskId);

      if (task) {
        task.status = payload.status === 'success' ? 'completed' : 'failed';
        task.completedAt = Date.now();
        task.result = payload.result;
        this.activeTasks.delete(task.id);

        // Commanderに結果報告
        try {
          await this.bus.publish({
            id: `report_${task.id}`,
            type: 'task.completed',
            source: this.id.id,
            target: 'commander',
            priority: 'normal',
            payload: {
              taskId: task.id,
              type: task.type,
              status: task.status,
              duration: (task.completedAt ?? 0) - (task.startedAt ?? 0),
              result: task.result,
            },
            timestamp: Date.now(),
          });
        } catch { /* Bus障害時は結果報告断念 */ }

        // キューに待ちタスクがあれば処理続行
        await this.processQueue();
      }
    } catch (err) {
      this.errorCount++;
    }
  }

  // ── チーム健全性 ──

  private async handleTeamHealth(event: AgentEvent): Promise<void> {
    try {
      const payload = event.payload as { agentId: string; status: string };
      const teamAgents = this.getTeamAgentIds();

      if (teamAgents.includes(payload.agentId)) {
        // チームメンバーの健全性変化をチーム固有ロジックで処理
        await this.onTeamMemberHealthChange(payload.agentId, payload.status);
      }
    } catch (err) {
      this.errorCount++;
    }
  }

  // ── 診断API ──

  /** チーム状態の取得 */
  getTeamStatus() {
    return {
      teamName: this.config.teamName,
      leadStatus: this.status,
      queueLength: this.taskQueue.length,
      activeTasks: this.activeTasks.size,
      maxConcurrent: this.config.maxConcurrentTasks,
      totalProcessed: this.getProcessedCount(),
      errorCount: this.errorCount,
      uptime: Date.now() - this.startTime,
    };
  }

  private getProcessedCount(): number {
    // 完了 + 失敗したタスク数（activeTasks から外れたもの）
    return this.errorCount; // 簡易版、将来的にはカウンターを別途持つ
  }

  // ── AI Brain統合（大脳新皮質への接続 — L1リードレベル） ──

  /**
   * AI Brain に戦略的判断を要求する
   * L1リードがチームの方針決定をAIに委ねる際に使用。
   */
  protected async requestAIDecision(
    context: string,
    options: string[],
    currentData?: Record<string, unknown>,
    category?: ApprovalRequest['category'],
  ): Promise<AIDecision> {
    const brain = getAIBrain();
    return brain.decide({
      agentId: this.id.id,
      agentName: this.id.name,
      context,
      options,
      currentData,
      category,
    });
  }

  /**
   * AI Brain にデータ分析を要求する
   */
  protected async requestAIAnalysis(
    data: Record<string, unknown>,
    question: string,
  ): Promise<AIAnalysis> {
    const brain = getAIBrain();
    return brain.analyze({
      agentId: this.id.id,
      data,
      question,
    });
  }

  /** AI Brain が利用可能か */
  protected get aiAvailable(): boolean {
    return getAIBrain().available;
  }

  // ── サブクラスが実装する抽象メソッド ──

  /** チーム固有の初期化処理 */
  protected abstract onInitialize(): Promise<void>;

  /** チーム固有のシャットダウン処理 */
  protected abstract onShutdown(): Promise<void>;

  /** タスクに対して最適なL2 Agentを選定 */
  protected abstract selectAgent(task: TaskItem): Promise<string | null>;

  /** チームに所属するAgent IDの一覧 */
  protected abstract getTeamAgentIds(): string[];

  /** チームメンバーの健全性変化ハンドラ */
  protected abstract onTeamMemberHealthChange(
    agentId: string,
    status: string,
  ): Promise<void>;

  /** チーム固有イベントハンドラ */
  protected abstract onCustomEvent(event: AgentEvent): Promise<void>;
}
