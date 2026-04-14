/**
 * Commander — L0 司令塔（大脳皮質=最高意思決定機関）
 *
 * 生体対応: 前頭前皮質（prefrontal cortex）
 * 全システムの最高意思決定機関。L1チームリードに指示を出し、
 * 全体の健全性を監視し、WBR（Weekly Business Review）を自動化する。
 *
 * 責務:
 * - 全Agent統括・オーケストレーション
 * - カスケード指令の発行
 * - Andon Cord（緊急停止）の制御
 * - WBR自動生成
 * - マイルストーン進捗管理
 */

import type {
  IAgent, AgentId, AgentHealth, AgentEvent, CascadeCommand, AgentStatus,
} from '../core/types.js';
import type { AgentBus } from '../core/agent-bus.js';
import type { AgentRegistry } from '../registry/agent-registry.js';
import type { CascadeEngine } from '../core/cascade-engine.js';
import type { HealthMonitor } from '../core/health-monitor.js';
import { createLogger } from '../core/logger.js';
import { getAIBrain } from '../core/ai-brain.js';

const log = createLogger('commander');

// ── T033-T035: Decision Logic Structures ──

interface CommanderDecision {
  action: string;
  target: string | string[];  // Target agent(s) or L1 lead
  priority: 'critical' | 'high' | 'normal' | 'low';
  reasoning: string;
  requiresHumanApproval: boolean;
}

type UrgencyLevel = 'red' | 'yellow' | 'green';

interface UrgencyClassification {
  level: UrgencyLevel;
  category: 'security' | 'data_integrity' | 'performance' | 'operational' | 'routine';
  requiresImmediateAction: boolean;
}


type AndonStatus = 'green' | 'yellow' | 'red';

interface SystemState {
  andonStatus: AndonStatus;
  activeAgents: number;
  totalAgents: number;
  healthySystems: number;
  activePipelines: number;
  lastWBR?: number;
  uptime: number;
}

export class Commander implements IAgent {
  readonly id: AgentId = {
    id: 'commander',
    name: 'Commander',
    level: 'L0',
    team: 'command',
    version: '1.0.0',
  };

  private status: AgentStatus = 'initializing';
  private startTime = Date.now();
  private errorCount = 0;
  private andonStatus: AndonStatus = 'green';
  private andonHistory: Array<{ status: AndonStatus; timestamp: number; reason: string }> = [];

  private bus: AgentBus;
  private registry: AgentRegistry;
  private cascadeEngine: CascadeEngine;
  private healthMonitor: HealthMonitor;
  private subscribed = false; // 重複subscribe防止フラグ
  // I-01: 5分サイクルタイマー（松果体の日内リズム＝定期巡回）
  private cycleTimer: ReturnType<typeof setInterval> | null = null;
  private lastCycleAt = 0;

  constructor(
    bus: AgentBus,
    registry: AgentRegistry,
    cascadeEngine: CascadeEngine,
    healthMonitor: HealthMonitor,
  ) {
    this.bus = bus;
    this.registry = registry;
    this.cascadeEngine = cascadeEngine;
    this.healthMonitor = healthMonitor;
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
      taskQueue: 0,
    };
  }

  async initialize(): Promise<void> {
    // 蘇生時に重複subscribe防止（2回目のinitialize()呼び出しでハンドラが蓄積しない）
    // 人体メタファー: 心臓マッサージで蘇生した時、新しい神経接続を作るのではなく既存を再活性化
    if (!this.subscribed) {
      // ヘルスイベント購読（自律神経系の情報を受信）
      this.bus.subscribe('health.critical', async (event) => {
        await this.handleHealthCritical(event);
      });

      this.bus.subscribe('health.error', async (event) => {
        await this.handleHealthError(event);
      });

      // カスケード結果購読
      this.bus.subscribe('cascade.*', async (_event) => {
        // カスケード完了の記録
      });

      this.subscribed = true;
    }

    this.status = 'healthy';
    this.errorCount = 0; // 蘇生後はエラーカウントリセット

    // I-01: 5分サイクル開始（定期巡回＝前頭前皮質の覚醒維持）
    this.startCycle(300_000);
  }

  // ── I-01: 5分サイクル（自律的健康チェック＋システム状態発行） ──

  /**
   * I-01: Commander定期巡回サイクル
   *
   * 医学メタファー: 前頭前皮質は5分おきに全身スキャンを行い、
   * 問題があれば自律神経系に指令を出す。睡眠中も脳幹が監視を継続。
   *
   * 1. システム状態を発行（SSE経由でAdmin GUIに送信）
   * 2. HealthMonitorから異常エージェントを検出
   * 3. 異常があればmakeDecisionで判断→カスケード指令
   */
  async runCycle(): Promise<void> {
    if (this.status === 'shutdown') return;
    this.lastCycleAt = Date.now();

    try {
      // 1. システム状態を発行
      await this.publishSystemState();

      // 2. HealthMonitorから全エージェント健康状態を取得
      const healthStats = this.healthMonitor.getStats();

      // 3. 異常検知 → 自動判断
      if (healthStats.critical > 0 || healthStats.errored > 0) {
        const syntheticEvent: AgentEvent = {
          id: `cycle_health_${Date.now()}`,
          type: 'health.degraded',
          source: 'commander-cycle',
          priority: healthStats.critical > 0 ? 'critical' : 'high',
          payload: {
            critical: healthStats.critical,
            errored: healthStats.errored,
            healthy: healthStats.healthy,
            total: healthStats.total,
          },
          timestamp: Date.now(),
        };
        const decision = await this.makeDecision(syntheticEvent);
        if (decision.priority !== 'normal') {
          await this.publishCascadeCommand(decision);
        }
      }

      // 4. Andon Yellow状態が30分以上続いている場合、自動解除判定
      if (this.andonStatus === 'yellow' && this.andonHistory.length > 0) {
        const lastYellow = this.andonHistory.filter(h => h.status === 'yellow').pop();
        if (lastYellow && Date.now() - lastYellow.timestamp > 1800_000) {
          // 30分経過 + 現在の健康状態がGreenなら自動解除
          if (healthStats.critical === 0 && healthStats.errored === 0) {
            await this.clearAndonCord('Auto-cleared: all systems healthy for 30+ minutes');
          }
        }
      }
    } catch (err) {
      this.errorCount++;
      log.warn('[Commander] Cycle error:', err instanceof Error ? err.message : String(err));
    }
  }

  /** 5分サイクル開始 */
  startCycle(intervalMs = 300_000): void {
    if (this.cycleTimer) return; // 二重起動防止
    this.cycleTimer = setInterval(() => {
      this.runCycle().catch(() => {});
    }, intervalMs);
    // 初回即時実行
    this.runCycle().catch(() => {});
  }

  /** サイクル停止 */
  stopCycle(): void {
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
  }

  /** サイクル稼働中か */
  isCycleActive(): boolean {
    return this.cycleTimer !== null;
  }

  /** 最終サイクル実行時刻 */
  getLastCycleAt(): number {
    return this.lastCycleAt;
  }

  /**
   * Graceful Shutdown（組織解体 — 成長の逆順で安全に停止）
   *
   * 人体メタファー: 手術終了→ICU管理→覚醒→退院
   * 1. 新タスク受付停止（麻酔投入）
   * 2. 進行中カスケード完了待機（手術終了）
   * 3. L2 Workers → L1 Leads の順でシャットダウン（細胞→臓器の逆順）
   * 4. HealthMonitor停止（ICU退室）
   * 5. Bus購読解除（神経遮断）
   * 6. 自身の状態をshutdownに設定
   */
  async shutdown(): Promise<void> {
    log.info('[Commander] Graceful Shutdown開始 — 組織解体シーケンス');
    this.status = 'shutdown';

    // I-01: サイクルタイマー停止（脳波停止）
    this.stopCycle();

    // Phase 1: Andon Cord発動（新タスク受付停止）
    this.andonStatus = 'red';
    this.andonHistory.push({
      status: 'red',
      timestamp: Date.now(),
      reason: 'Graceful shutdown initiated',
    });

    // Phase 2: 全エージェントにシャットダウン通知（細胞→臓器の逆順）
    const allAgents = this.registry.listAll();
    const l2Agents = allAgents.filter(a => a.id.level === 'L2');
    const l1Agents = allAgents.filter(a => a.id.level === 'L1');

    // L2 Workers first（末端の細胞から停止）
    for (const agent of l2Agents) {
      try {
        if (agent.instance && agent.instance !== this) {
          await Promise.race([
            agent.instance.shutdown(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
          ]);
        }
      } catch {
        log.warn(`[Commander] Agent ${agent.id.id} shutdown timeout/error — forced`);
      }
    }

    // L1 Leads next（臓器リーダーを停止）
    for (const agent of l1Agents) {
      try {
        if (agent.instance && agent.instance !== this) {
          await Promise.race([
            agent.instance.shutdown(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
          ]);
        }
      } catch {
        log.warn(`[Commander] Agent ${agent.id.id} shutdown timeout/error — forced`);
      }
    }

    // Phase 3: HealthMonitor停止（生命維持装置オフ）
    this.healthMonitor.stop();

    // Phase 4: シャットダウン完了通知（Bus経由、最後のメッセージ）
    try {
      await this.bus.publish({
        id: `shutdown_${Date.now()}`,
        type: 'system.shutdown',
        source: this.id.id,
        priority: 'critical',
        payload: { timestamp: Date.now(), reason: 'graceful_shutdown' },
        timestamp: Date.now(),
      });
    } catch {
      // Bus障害でもシャットダウンは続行
    }

    log.info('[Commander] Graceful Shutdown完了 — 全システム停止');
  }

  async handleEvent(event: AgentEvent): Promise<void> {
    switch (event.type) {
      case 'health.critical':
        await this.handleHealthCritical(event);
        break;
      case 'system.status.request':
        await this.publishSystemState();
        break;
    }
  }

  async handleCommand(command: CascadeCommand): Promise<unknown> {
    return { received: true, commander: this.id.id };
  }

  // ── Andon Cord（緊急制御） ──

  /** Andon Cord 発動（緊急停止ボタン） */
  async pullAndonCord(reason: string): Promise<void> {
    this.andonStatus = 'red';
    this.andonHistory.push({ status: 'red', timestamp: Date.now(), reason });

    // 全L1リードに緊急停止指令
    const command: CascadeCommand = {
      id: `andon_${Date.now()}`,
      from: this.id.id,
      to: this.registry.getByLevel('L1').map((a) => a.id.id),
      action: 'emergency_halt',
      params: { reason },
      priority: 'critical',
    };

    await this.cascadeEngine.execute(command);

    // 人間への通知
    await this.bus.publish({
      id: `andon_notify_${Date.now()}`,
      type: 'notification.andon',
      source: this.id.id,
      priority: 'critical',
      payload: { andonStatus: 'red', reason, timestamp: Date.now() },
      timestamp: Date.now(),
    });
  }

  /** Andon 解除 */
  async clearAndonCord(reason: string): Promise<void> {
    this.andonStatus = 'green';
    this.andonHistory.push({ status: 'green', timestamp: Date.now(), reason });

    // 全L1リードに再開指令
    const command: CascadeCommand = {
      id: `andon_clear_${Date.now()}`,
      from: this.id.id,
      to: this.registry.getByLevel('L1').map((a) => a.id.id),
      action: 'resume_operations',
      params: { reason },
      priority: 'high',
    };

    await this.cascadeEngine.execute(command);
  }

  // ── T033: Decision Logic ──

  /**
   * T033: makeDecision(event) — AI Brain連携による複雑判断
   * 単純なルールでは判定不可能なイベントに対し、AI（Claude）に判断を委ねる。
   * ルールベース判定が不可能な場合のみAI呼び出しを行う。
   */
  async makeDecision(event: AgentEvent): Promise<CommanderDecision> {
    // Step 1: 緊急度分類（ルールベース）
    const urgency = this.classifyUrgency(event);

    // Step 2: 緊急度に応じた判定
    if (urgency.level === 'red') {
      // Andon Red: 即座に緊急停止（AI判断なし）
      return {
        action: 'pull_andon_cord',
        target: this.registry.getByLevel('L1').map((a) => a.id.id),
        priority: 'critical',
        reasoning: `Security breach or critical data integrity issue detected. Immediate halt required. Category: ${urgency.category}`,
        requiresHumanApproval: true,
      };
    }

    if (urgency.level === 'yellow') {
      // Andon Yellow: アラート＋監視継続（AI判断あり）
      try {
        const aiBrain = getAIBrain();
        if (aiBrain.available) {
          const aiDecision = await aiBrain.decide({
            agentId: this.id.id,
            agentName: 'Commander',
            context: `Performance degradation or error rate spike detected. Event: ${event.type}, Source: ${event.source}. Payload: ${JSON.stringify(event.payload)}`,
            options: [
              'Escalate to L1 monitoring-lead for investigation',
              'Increase health check frequency (reduce from 10s to 5s)',
              'Send alert to infrastructure-lead only (no escalation)',
              'Log only, continue monitoring',
            ],
            category: 'operations',
            priority: urgency.requiresImmediateAction ? 'high' : 'normal',
          });

          return {
            action: aiDecision.action,
            target: this.getL1TargetForDecision(aiDecision.action),
            priority: urgency.requiresImmediateAction ? 'high' : 'normal',
            reasoning: aiDecision.reasoning,
            requiresHumanApproval: aiDecision.requiresApproval,
          };
        }
      } catch (err) {
        log.warn('[Commander] AI decision failed, falling back to rule-based:', err);
      }

      // AI不可またはエラー時: ルールベースフォールバック
      return {
        action: 'alert_and_monitor',
        target: ['monitoring-lead'],
        priority: 'high',
        reasoning: `Performance issue detected. Escalating to monitoring team. Category: ${urgency.category}`,
        requiresHumanApproval: false,
      };
    }

    // Andon Green: 通常運用（ルールベース）
    return {
      action: 'log_and_continue',
      target: [],
      priority: 'normal',
      reasoning: `Routine operation. Event: ${event.type}, Source: ${event.source}`,
      requiresHumanApproval: false,
    };
  }

  /**
   * T034: classifyUrgency(event) — Andon Cord状態遷移判定
   * セキュリティ、データ整合性、パフォーマンスの3軸で緊急度を判定
   */
  private classifyUrgency(event: AgentEvent): UrgencyClassification {
    const eventType = event.type.toLowerCase();
    const source = event.source.toLowerCase();
    const priority = event.priority;

    // Red（即座に停止が必要）
    if (eventType.includes('security') || eventType.includes('breach')) {
      return { level: 'red', category: 'security', requiresImmediateAction: true };
    }
    if (eventType.includes('data.loss') || eventType.includes('data.corruption')) {
      return { level: 'red', category: 'data_integrity', requiresImmediateAction: true };
    }
    if (eventType.includes('payment') && eventType.includes('fail')) {
      return { level: 'red', category: 'data_integrity', requiresImmediateAction: true };
    }
    if (priority === 'critical') {
      return { level: 'red', category: 'security', requiresImmediateAction: true };
    }

    // Yellow（アラート＋継続監視）
    if (eventType.includes('performance') || eventType.includes('degraded')) {
      return { level: 'yellow', category: 'performance', requiresImmediateAction: false };
    }
    if (eventType.includes('error') && priority === 'high') {
      return { level: 'yellow', category: 'operational', requiresImmediateAction: false };
    }
    if (eventType.includes('health') && eventType.includes('critical')) {
      return { level: 'yellow', category: 'operational', requiresImmediateAction: true };
    }
    if (source.includes('rate.limiter') || source.includes('throttle')) {
      return { level: 'yellow', category: 'performance', requiresImmediateAction: false };
    }
    if (priority === 'high') {
      return { level: 'yellow', category: 'operational', requiresImmediateAction: false };
    }

    // Green（通常運用）
    return { level: 'green', category: 'routine', requiresImmediateAction: false };
  }

  /**
   * T035: routeToL1(decision) — 意思決定の各L1リードへのルーティング
   */
  private getL1TargetForDecision(action: string): string | string[] {
    const actionStr = action.toLowerCase();

    // Price/Order/Inventory → commerce-lead (sales-lead)
    if (actionStr.includes('price') || actionStr.includes('order') || actionStr.includes('inventory')) {
      return 'sales-lead';
    }

    // Content/SEO → content-lead (marketing-lead)
    if (actionStr.includes('content') || actionStr.includes('seo') || actionStr.includes('blog')) {
      return 'marketing-lead';
    }

    // Campaigns/Ads → marketing-lead
    if (actionStr.includes('campaign') || actionStr.includes('ad') || actionStr.includes('promotion')) {
      return 'marketing-lead';
    }

    // Monitoring/Deploy → operations-lead
    if (actionStr.includes('monitor') || actionStr.includes('deploy') || actionStr.includes('health')) {
      return 'operations-lead';
    }

    // Support/Reviews → customer-lead (support via sales)
    if (actionStr.includes('support') || actionStr.includes('review') || actionStr.includes('feedback')) {
      return 'sales-lead';
    }

    // Default: all L1 leads
    return this.registry.getByLevel('L1').map((a) => a.id.id);
  }

  /**
   * T035 continued: publishCascadeCommand — 意思決定をカスケード指令に変換し発行
   */
  async publishCascadeCommand(decision: CommanderDecision): Promise<void> {
    const targets = Array.isArray(decision.target) ? decision.target : [decision.target];

    const command: CascadeCommand = {
      id: `cmd_${Date.now()}`,
      from: this.id.id,
      to: targets,
      action: decision.action,
      params: {
        reasoning: decision.reasoning,
        priority: decision.priority,
        requiresApproval: decision.requiresHumanApproval.toString(),
      },
      priority: decision.priority,
    };

    await this.cascadeEngine.execute(command);

    // 意思決定のログ
    log.info(`[Commander] Decision published: ${decision.action} → ${targets.join(', ')}, Reasoning: ${decision.reasoning}`);
  }

  // ── イベントハンドラ ──

  private async handleHealthCritical(event: AgentEvent): Promise<void> {
    this.errorCount++;
    const payload = event.payload as { level: string; failures: number; lastHealth?: { status: string }; action?: string };

    // T033: makeDecisionで複雑判断を行う
    const decision = await this.makeDecision(event);

    if (decision.priority === 'critical' && this.andonStatus !== 'red') {
      this.andonStatus = 'yellow';
      this.andonHistory.push({
        status: 'yellow',
        timestamp: Date.now(),
        reason: `Health critical: ${decision.reasoning}`,
      });
    }

    // 障害#7修正: Agent再起動メカニズム
    // HealthMonitorがcritical判定→Commanderが再起動指令を発行
    // 人体で言えば: 自律神経（HealthMonitor）が心停止を検知→脳幹（Commander）が蘇生指令を出す
    if (payload.action === 'restart_required') {
      const agentId = (event.payload as { agentId?: string })?.agentId
        ?? event.source;
      log.info(`[Commander] Agent再起動指令: ${agentId} (failures: ${payload.failures})`);

      // レジストリからエージェントを取得して再初期化を試行
      const registered = this.registry.get(agentId);
      if (registered?.instance) {
        try {
          await registered.instance.initialize();
          // 再起動完了をBusに通知
          await this.bus.publish({
            id: `restart_${Date.now()}_${agentId}`,
            type: 'agent.restarted',
            source: this.id.id,
            priority: 'high',
            payload: { agentId, restartedBy: 'commander', timestamp: Date.now() },
            timestamp: Date.now(),
          });
          log.info(`[Commander] Agent ${agentId} 再起動成功`);
        } catch (err) {
          log.error(`[Commander] Agent ${agentId} 再起動失敗:`, err instanceof Error ? err.message : err);
          // 再起動失敗→Andon Cord発動
          if (this.andonStatus !== 'red') {
            await this.pullAndonCord(`Agent ${agentId} restart failed after ${payload.failures} consecutive failures`);
          }
        }
      }
    }

    // T035: 意思決定をカスケード指令として発行
    await this.publishCascadeCommand(decision);
  }

  private async handleHealthError(event: AgentEvent): Promise<void> {
    // Error Monitorに調査依頼
    await this.bus.publish({
      id: `investigate_${Date.now()}`,
      type: 'error.investigate',
      source: this.id.id,
      target: 'error-monitor',
      priority: 'high',
      payload: event.payload,
      timestamp: Date.now(),
    });
  }

  // ── システム状態 ──

  /** システム全体の状態を取得・発行 */
  async publishSystemState(): Promise<SystemState> {
    const healthStats = this.healthMonitor.getStats();
    const registryStats = this.registry.getStats();
    const cascadeStats = this.cascadeEngine.getStats();

    const state: SystemState = {
      andonStatus: this.andonStatus,
      activeAgents: registryStats.active,
      totalAgents: registryStats.total,
      healthySystems: healthStats.healthy,
      activePipelines: cascadeStats.running,
      uptime: Date.now() - this.startTime,
    };

    await this.bus.publish({
      id: `state_${Date.now()}`,
      type: 'system.state',
      source: this.id.id,
      priority: 'normal',
      payload: state,
      timestamp: Date.now(),
    });

    return state;
  }

  /** Andon履歴 */
  getAndonHistory() {
    return this.andonHistory;
  }
}
