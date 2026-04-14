/**
 * L2 Agent 基底クラス（幹細胞 = 全L2共通の分化元）
 *
 * 生体対応: 幹細胞
 * L1リードから指令を受け、専門タスクを実行するワーカーセルの共通基盤。
 */

import type {
  IAgent,
  IAgentBus,
  AgentId,
  AgentHealth,
  AgentStatus,
  AgentEvent,
  CascadeCommand,
} from '../core/types';
import { getAIBrain } from '../core/ai-brain.js';
import type { AIDecision, AIAnalysis } from '../core/ai-brain.js';
import type { ApprovalRequest } from '../core/approval-queue.js';

export abstract class BaseL2Agent implements IAgent {
  abstract readonly id: AgentId;

  protected bus: IAgentBus;
  protected status: AgentStatus = 'initializing';
  protected startTime = 0;
  protected errorCount = 0;
  protected taskQueue = 0;
  protected subscriptionIds: string[] = [];

  constructor(bus: IAgentBus) {
    this.bus = bus;
  }

  // ── IAgent implementation ──

  getHealth(): AgentHealth {
    return {
      agentId: this.id.id,
      status: this.status,
      lastHeartbeat: Date.now(),
      uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
      errorCount: this.errorCount,
      memoryUsage: 0,
      taskQueue: this.taskQueue,
    };
  }

  async initialize(): Promise<void> {
    this.startTime = Date.now();
    this.status = 'initializing';
    try {
      // パイプラインコマンドを受信する購読を登録（血管系からの指令を受け付ける受容体）
      this.subscribe('command.*');
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
    for (const subId of this.subscriptionIds) {
      this.bus.unsubscribe(subId);
    }
    this.subscriptionIds = [];
    await this.onShutdown();
  }

  async handleEvent(event: AgentEvent): Promise<void> {
    // コマンドイベントの場合、対象エージェントかチェック（シナプス結合の適合性確認）
    if (event.type.startsWith('command.') && (event.target === this.id.id)) {
      // CascadeCommand形式に変換してhandleCommand経由で処理
      const payload = (event.payload && typeof event.payload === 'object') ? event.payload as Record<string, unknown> : {};
      const command: CascadeCommand = {
        id: event.correlationId || event.id,
        from: event.source,
        to: [this.id.id],
        action: (typeof payload.action === 'string' ? payload.action : '') || event.type.replace('command.', ''),
        params: payload,
        priority: event.priority,
      };
      await this.handleCommand(command);
      return;
    }

    // 通常のイベント処理
    try {
      await this.onEvent(event);
    } catch (err) {
      this.errorCount++;
      if (this.errorCount >= 5) this.status = 'degraded';
      try { await this.publishResult(event.correlationId ?? event.id, 'failure', null, String(err)); } catch { /* Bus障害時は無視 */ }
    }
  }

  async handleCommand(command: CascadeCommand): Promise<unknown> {
    this.taskQueue++;
    try {
      const result = await this.onCommand(command);
      try { await this.publishResult(command.id, 'success', result); } catch { this.errorCount++; }
      return result;
    } catch (err) {
      this.errorCount++;
      if (this.errorCount >= 5) this.status = 'degraded';
      try { await this.publishResult(command.id, 'failure', null, String(err)); } catch { /* Bus障害時は結果通知を断念 */ }
      return { status: 'error', error: String(err) };
    } finally {
      // A-03: finally保証 — taskQueueカウンターは必ず減算（成功/失敗/例外のいずれでも）
      this.taskQueue--;
    }
  }

  // ── Helpers ──

  protected subscribe(eventType: string): void {
    const subId = this.bus.subscribe(eventType, (event) => this.handleEvent(event));
    this.subscriptionIds.push(subId);
  }

  protected async publishResult(
    taskId: string,
    status: 'success' | 'failure',
    result: unknown,
    error?: string,
  ): Promise<void> {
    await this.bus.publish({
      id: `result_${taskId}_${Date.now()}`,
      type: 'task.result.response',
      source: this.id.id,
      priority: 'normal',
      payload: { taskId, status, result, error },
      timestamp: Date.now(),
      correlationId: taskId,
    });
  }

  protected async publishEvent(type: string, payload: unknown, priority: 'critical' | 'high' | 'normal' | 'low' = 'normal'): Promise<void> {
    try {
      await this.bus.publish({
        id: `${this.id.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type,
        source: this.id.id,
        priority,
        payload,
        timestamp: Date.now(),
      });
    } catch {
      // イベント発行失敗はエージェント動作を止めない（神経伝達の一時的障害は臓器を停止させない）
      this.errorCount++;
    }
  }

  // ── AI Brain統合（大脳新皮質への接続） ──

  /**
   * AI Brain に判断を要求する
   * 各L2エージェントが onCommand 内で複雑な判断をAIに委ねる際に使用。
   * API未設定時はルールベースフォールバックが自動的に機能する。
   *
   * 使用例:
   * ```typescript
   * const decision = await this.requestAIDecision(
   *   '新しいIPコラボバナーの色調を決定',
   *   ['明るい暖色系', '落ち着いた寒色系', 'IPキャラクターに合わせた配色'],
   *   { ipName: 'ONE PIECE', currentTheme: 'ocean' }
   * );
   * if (!decision.requiresApproval) {
   *   // 自動承認→即実行
   * }
   * ```
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
   * 売上データ、アクセスデータなどの分析をAIに委ねる際に使用。
   *
   * 使用例:
   * ```typescript
   * const analysis = await this.requestAIAnalysis(
   *   { todayRevenue: 1500000, yesterdayRevenue: 1200000, topProduct: 'Astromeda RGB' },
   *   '前日比の売上変動の原因と改善策を分析してください'
   * );
   * ```
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

  /**
   * AI Brain が利用可能かチェック
   * API key未設定の場合はfalse — その場合はルールベース判断のみ
   */
  protected get aiAvailable(): boolean {
    return getAIBrain().available;
  }

  // ── Abstract methods (each L2 specialization implements) ──

  protected abstract onInitialize(): Promise<void>;
  protected abstract onShutdown(): Promise<void>;
  protected abstract onEvent(event: AgentEvent): Promise<void>;
  protected abstract onCommand(command: CascadeCommand): Promise<unknown>;
}
