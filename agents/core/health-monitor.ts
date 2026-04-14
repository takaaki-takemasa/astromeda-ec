/**
 * HealthMonitor — 自律神経系（全Agent生命徴候の監視）
 *
 * 生体対応: 自律神経系（交感神経+副交感神経）
 * 心拍（heartbeat）を定期的に確認し、
 * 異常を検知したら自動的に対処する。
 *
 * 3段階対応:
 * 1. 注意（degraded）: ログ記録 + 監視強化
 * 2. 警告（error）: Commander + Error Monitorに通知
 * 3. 緊急（shutdown）: 自動再起動試行 + Andon Cord
 */

import type { AgentHealth, AgentStatus, IAgent, IAgentBus, AgentEvent } from './types.js';
import { z } from 'zod';
import { createLogger } from '../core/logger.js';
import { AgentRegistry } from '../registry/agent-registry.js';

const log = createLogger('health-monitor');


// ── Zodスキーマ（T016: ヘルス監視検証） ──

/** ヘルスレポート（agentId, status, metrics必須）のZodスキーマ */
export const HealthReportSchema = z.object({
  agentId: z.string().min(1),
  status: z.enum(['initializing', 'healthy', 'degraded', 'error', 'shutdown']),
  lastHeartbeat: z.number().positive(),
  uptime: z.number().nonnegative(),
  errorCount: z.number().nonnegative(),
  memoryUsage: z.number().nonnegative(),
  taskQueue: z.number().nonnegative(),
  metadata: z.record(z.unknown()).optional(),
});

/** ヘルス閾値のZodスキーマ — 正の数のみ許可 */
export const HealthThresholdsSchema = z.object({
  degraded: z.number().positive().optional(),
  error: z.number().positive().optional(),
  shutdown: z.number().positive().optional(),
  maxHistory: z.number().positive().optional(),
  defaultCheckIntervalMs: z.number().positive().optional(),
});


interface MonitoredAgent {
  agent: IAgent;
  lastHealth: AgentHealth;
  checkInterval: number;    // ms
  timer?: ReturnType<typeof setInterval>;
  consecutiveFailures: number;
  maxFailures: number;       // これを超えたらshutdown判定
  restartCount: number;      // T069: 再起動試行回数
  lastRestartTime?: number;  // T069: 最後の再起動時刻
}

/** HealthMonitorの閾値設定（外部から注入可能） */
export interface HealthThresholds {
  /** 連続失敗N回でdegraded（デフォルト: 3） */
  degraded?: number;
  /** 連続失敗N回でerror（デフォルト: 5） */
  error?: number;
  /** 連続失敗N回でshutdown判定（デフォルト: 10） */
  shutdown?: number;
  /** 履歴保持上限（デフォルト: 500） */
  maxHistory?: number;
  /** デフォルトチェック間隔ms（デフォルト: 30000） */
  defaultCheckIntervalMs?: number;
}

/** デフォルト閾値（自律神経の基準反応速度） */
const DEFAULT_THRESHOLDS: Required<HealthThresholds> = {
  degraded: 3,
  error: 5,
  shutdown: 10,
  maxHistory: 500,
  defaultCheckIntervalMs: 30000,
};

/** 外部通知チャネル設定（1B.02: Slack/Webhook escalation） */
export interface NotificationChannel {
  type: 'webhook' | 'slack';
  url: string;
  /** 通知対象レベル（デフォルト: ['critical']） */
  levels?: Array<'degraded' | 'error' | 'critical'>;
  /** ヘッダー（認証トークン等） */
  headers?: Record<string, string>;
}

/** 指数バックオフ設定（1B.01） */
interface BackoffConfig {
  /** 基本間隔（ms） */
  baseInterval: number;
  /** 最大間隔（ms）— デフォルト5分 */
  maxInterval: number;
  /** バックオフ倍率（デフォルト: 2） */
  multiplier: number;
}

/** デフォルトバックオフ設定 */
const DEFAULT_BACKOFF: BackoffConfig = {
  baseInterval: 30000,  // 30秒
  maxInterval: 300000,  // 5分
  multiplier: 2,
};

export class HealthMonitor {
  private agents = new Map<string, MonitoredAgent>();
  private bus?: IAgentBus;
  private running = false;
  private subscriptionIds: string[] = [];
  private healthHistory: Array<{agentId: string; health: AgentHealth; timestamp: number}> = [];
  private registry?: AgentRegistry;   // T069: Agent registry for restart lookup

  // 自律神経の閾値設定（外部から設定可能）
  private thresholds: Required<HealthThresholds>;

  // 1B.01: 指数バックオフ設定
  private backoffConfig: BackoffConfig;

  // 1B.02: 外部通知チャネル
  private notificationChannels: NotificationChannel[] = [];

  // 1B.02: 通知デバウンス（同一agentId+level で N秒以内の重複を抑制）
  private lastNotifications = new Map<string, number>();
  private notificationCooldownMs = 60_000; // 1分間のクールダウン

  constructor(thresholds?: HealthThresholds, registry?: AgentRegistry) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    this.registry = registry;
    this.backoffConfig = { ...DEFAULT_BACKOFF, baseInterval: this.thresholds.defaultCheckIntervalMs };
  }

  /** 閾値を動的に更新（運用中のチューニング） */
  updateThresholds(newThresholds: HealthThresholds): void {
    // T016: 新しい閾値をZodで検証
    const validation = HealthThresholdsSchema.safeParse(newThresholds);
    if (!validation.success) {
      log.error('[HealthMonitor] updateThresholds validation failed:', validation.error.message);
      throw new Error(`[HealthMonitor] updateThresholds validation failed — ${validation.error.message}`);
    }

    this.thresholds = { ...this.thresholds, ...newThresholds };
    // 既存エージェントのmaxFailuresも更新
    for (const monitored of this.agents.values()) {
      monitored.maxFailures = this.thresholds.shutdown;
    }
  }

  /** 現在の閾値を取得（診断用） */
  getThresholds(): Required<HealthThresholds> {
    return { ...this.thresholds };
  }

  /**
   * 1B.02: 外部通知チャネルを登録（Slack, Webhook等）
   * 自律神経系から外界（運用チーム）への通報路を開設する
   */
  addNotificationChannel(channel: NotificationChannel): void {
    this.notificationChannels.push({
      ...channel,
      levels: channel.levels || ['critical'],
    });
  }

  /** 登録済み通知チャネルを取得（診断用） */
  getNotificationChannels(): NotificationChannel[] {
    return [...this.notificationChannels];
  }

  /** 通知チャネルを全削除 */
  clearNotificationChannels(): void {
    this.notificationChannels = [];
  }

  /**
   * 1B.01: 指数バックオフでチェック間隔を計算
   * 連続失敗が増えるほど間隔を伸ばす（ノイズ削減 + リソース節約）
   * base * multiplier^failures （上限: maxInterval）
   */
  private calculateBackoffInterval(consecutiveFailures: number, baseInterval: number): number {
    if (consecutiveFailures <= 0) return baseInterval;
    const interval = baseInterval * Math.pow(this.backoffConfig.multiplier, consecutiveFailures);
    return Math.min(interval, this.backoffConfig.maxInterval);
  }

  /**
   * 1B.01: 動的チェック間隔の更新
   * 失敗→間隔延長、回復→基本間隔に戻す
   */
  private updateCheckInterval(agentId: string, monitored: MonitoredAgent): void {
    if (!this.running) return;

    const newInterval = this.calculateBackoffInterval(
      monitored.consecutiveFailures,
      monitored.checkInterval,
    );

    // タイマーを再設定
    if (monitored.timer) clearInterval(monitored.timer);
    monitored.timer = setInterval(() => {
      this.checkAgent(agentId);
    }, newInterval);
  }

  /**
   * Agent Bus に接続し、ヘルスイベントを購読
   * 自律神経系がBus（脊髄）に接続され、全身からの信号を受信可能にする
   */
  connectBus(bus: IAgentBus): void {
    this.bus = bus;

    // Agentからの自己報告ヘルスイベントを購読（求心性神経路）
    const healthReportSub = bus.subscribe('agent.health.report', async (event) => {
      const { agentId, health } = event.payload as { agentId: string; health: AgentHealth };
      this.processHealthReport(agentId, health);
    });
    this.subscriptionIds.push(healthReportSub);

    // Agent再起動完了イベントを購読（回復確認）
    const restartSub = bus.subscribe('agent.restarted', async (event) => {
      const { agentId } = event.payload as { agentId: string };
      const monitored = this.agents.get(agentId);
      if (monitored) {
        monitored.consecutiveFailures = 0;
        log.info(`[HealthMonitor] Agent ${agentId} restart confirmed, failures reset`);
      }
    });
    this.subscriptionIds.push(restartSub);

    // Pipeline失敗イベントを購読（関連Agentの健康を確認）
    const pipelineFailSub = bus.subscribe('pipeline.failed', async (event) => {
      const { failedStep } = event.payload as { failedStep?: string };
      if (failedStep) {
        // 失敗ステップのAgentを緊急チェック
        for (const [id, m] of this.agents) {
          if (m.agent.id.id === failedStep) {
            await this.checkAgent(id);
          }
        }
      }
    });
    this.subscriptionIds.push(pipelineFailSub);

    // N-03: restart要求イベントを購読 → 自動再起動実行
    const restartRequestSub = bus.subscribe('agent.restart.requested', async (event) => {
      const { agentId } = event.payload as { agentId: string };
      if (agentId && this.agents.has(agentId)) {
        log.info(`[HealthMonitor] Restart requested for ${agentId} — initiating restart`);
        await this.restartAgent(agentId);
      }
    });
    this.subscriptionIds.push(restartRequestSub);
  }

  /**
   * 外部からのヘルスレポートを処理（求心性神経信号の受信）
   */
  private processHealthReport(agentId: string, health: AgentHealth): void {
    // T016: ヘルスレポートをZodで検証
    const validation = HealthReportSchema.safeParse(health);
    if (!validation.success) {
      log.warn('[HealthMonitor] processHealthReport validation failed:', validation.error.message);
      return; // 無効なレポートは黙然と無視（警告のみ）
    }

    const monitored = this.agents.get(agentId);
    if (!monitored) return;

    monitored.lastHealth = health;
    this.recordHistory(agentId, health);

    if (health.status === 'healthy') {
      monitored.consecutiveFailures = 0;
    }
  }

  /**
   * 健康記録を履歴に保存（カルテ記録）
   */
  private recordHistory(agentId: string, health: AgentHealth): void {
    this.healthHistory.push({ agentId, health, timestamp: Date.now() });
    if (this.healthHistory.length > this.thresholds.maxHistory) {
      this.healthHistory = this.healthHistory.slice(-this.thresholds.maxHistory);
    }
  }

  /** Agent を監視対象に登録
   * HealthMonitorが既に起動中(running=true)の場合、即座にタイマーを開始する。
   * 人体メタファー: 新しい臓器移植後、心電図モニターに直ちに接続する。
   */
  register(agent: IAgent, checkIntervalMs?: number): void {
    const id = agent.id.id;
    const monitored: MonitoredAgent = {
      agent,
      lastHealth: agent.getHealth(),
      checkInterval: checkIntervalMs ?? this.thresholds.defaultCheckIntervalMs,
      consecutiveFailures: 0,
      maxFailures: this.thresholds.shutdown,
      restartCount: 0,
      lastRestartTime: undefined,
    };
    this.agents.set(id, monitored);

    // 既にモニターが起動中であれば、新エージェントの監視も即座に開始
    if (this.running) {
      this.checkAgent(id);
      monitored.timer = setInterval(() => {
        this.checkAgent(id);
      }, monitored.checkInterval);
    }
  }

  /** 監視開始（心臓のペースメーカー始動）
   * 障害#4修正: start直後に全エージェントの即時チェックを実行。
   * 新生児の出生直後にAPGARスコアを測定するのと同様、
   * 最初の30秒間の異常を見逃さない。
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    for (const [id, monitored] of this.agents) {
      // 即時チェック（APGARスコア測定 — 出生直後）
      this.checkAgent(id);
      // 定期チェック（定期健診）
      monitored.timer = setInterval(() => {
        this.checkAgent(id);
      }, monitored.checkInterval);
    }
  }

  /** 監視停止（全タイマー + Bus購読解除） */
  stop(): void {
    this.running = false;
    for (const monitored of this.agents.values()) {
      if (monitored.timer) clearInterval(monitored.timer);
    }
    // Bus購読の解除（自律神経の切断）
    if (this.bus) {
      for (const subId of this.subscriptionIds) {
        this.bus.unsubscribe(subId);
      }
      this.subscriptionIds = [];
    }
  }

  /** 単一Agentのヘルスチェック */
  private async checkAgent(agentId: string): Promise<void> {
    const monitored = this.agents.get(agentId);
    if (!monitored) return;

    try {
      const health = monitored.agent.getHealth();
      monitored.lastHealth = health;

      if (health.status === 'healthy') {
        const wasUnhealthy = monitored.consecutiveFailures > 0;
        monitored.consecutiveFailures = 0;
        // 1B.01: 回復時にチェック間隔を基本値に戻す
        if (wasUnhealthy) this.updateCheckInterval(agentId, monitored);
        return;
      }

      monitored.consecutiveFailures++;
      await this.handleUnhealthy(agentId, monitored);
    } catch (err) {
      log.warn(`[HealthMonitor] Health check failed for ${agentId}:`, err instanceof Error ? err.message : err);
      monitored.consecutiveFailures++;
      await this.handleUnhealthy(agentId, monitored);
    }
  }

  /** 異常対応（自律神経反応）— 1B.01: バックオフ適用 + 1B.02: 外部通知 */
  private async handleUnhealthy(agentId: string, monitored: MonitoredAgent): Promise<void> {
    const failures = monitored.consecutiveFailures;

    // 1B.01: 失敗増加に応じてチェック間隔を延長（指数バックオフ）
    this.updateCheckInterval(agentId, monitored);

    let level: 'degraded' | 'error' | 'critical' = 'degraded';

    if (failures >= this.thresholds.shutdown) {
      level = 'critical';
      // 緊急: Andon Cord相当 — 自動再起動要求を発行（1-06）
      await this.emitEvent(agentId, 'health.critical', {
        agentId,
        level: 'critical',
        failures,
        lastHealth: monitored.lastHealth,
        action: 'restart_required',
      });
      // 1-06: 3段階エスカレーション — 3回連続=restart, 5回=replace, 5回超=human escalation
      if (failures >= 5) {
        await this.emitEvent(agentId, 'agent.escalate.human', {
          agentId, failures, reason: 'consecutive_failures_exceeded_5',
        });
      } else {
        await this.emitEvent(agentId, 'agent.restart.requested', {
          agentId, failures, reason: 'consecutive_failures_threshold',
        });
      }
    } else if (failures >= this.thresholds.error) {
      level = 'error';
      // 警告
      await this.emitEvent(agentId, 'health.error', {
        agentId,
        level: 'error',
        failures,
        lastHealth: monitored.lastHealth,
      });
    } else if (failures >= this.thresholds.degraded) {
      level = 'degraded';
      // 注意
      await this.emitEvent(agentId, 'health.degraded', {
        agentId,
        level: 'degraded',
        failures,
        lastHealth: monitored.lastHealth,
      });
    }

    // 1B.02: 外部通知チャネルへ発報
    await this.sendExternalNotification(agentId, level, failures, monitored.lastHealth);
  }

  /**
   * T069: Agent自動再起動メソッド
   *
   * 人体メタファー: 麻痺した神経を電気刺激で再活性化する
   *
   * 段階:
   * 1. agent.shutdown() を呼び出し
   * 2. 2秒待機
   * 3. agent.initialize() を呼び出し
   * 4. 再起動カウントを記録
   * 5. 3回失敗したら 'agent.escalate.human' イベントを発行
   */
  /** restart loop暴走防止: 最小30秒間隔を強制 */
  private static readonly RESTART_COOLDOWN_MS = 30_000;
  /** restart loop暴走防止: 5分以内に最大3回まで */
  private static readonly MAX_RESTARTS_PER_WINDOW = 3;
  private static readonly RESTART_WINDOW_MS = 5 * 60_000;

  async restartAgent(agentId: string): Promise<boolean> {
    const monitored = this.agents.get(agentId);
    if (!monitored) {
      log.warn(`[HealthMonitor] restartAgent: Agent not found: ${agentId}`);
      return false;
    }

    // 暴走防止ガード: 最終再起動から30秒以内は拒否
    const now = Date.now();
    if (monitored.lastRestartTime && (now - monitored.lastRestartTime) < HealthMonitor.RESTART_COOLDOWN_MS) {
      log.warn(`[HealthMonitor] Restart throttled for ${agentId}: cooldown ${HealthMonitor.RESTART_COOLDOWN_MS}ms not elapsed`);
      return false;
    }

    // 暴走防止ガード: 5分間に3回以上の再起動は人間エスカレーション
    if (monitored.restartCount >= HealthMonitor.MAX_RESTARTS_PER_WINDOW) {
      log.error(`[HealthMonitor] Restart loop detected for ${agentId}: ${monitored.restartCount} restarts in window. Escalating to human.`);
      await this.emitEvent(agentId, 'agent.escalate.human', {
        agentId,
        restartCount: monitored.restartCount,
        reason: 'restart_loop_detected',
        lastRestartTime: monitored.lastRestartTime,
      });
      return false;
    }

    const { agent } = monitored;

    try {
      log.info(`[HealthMonitor] Restarting agent: ${agentId} (attempt ${monitored.restartCount + 1})`);

      // Stage 1: Shutdown
      try {
        await agent.shutdown();
        log.debug(`[HealthMonitor] Agent shutdown completed: ${agentId}`);
      } catch (err) {
        log.warn(`[HealthMonitor] Agent shutdown error: ${agentId}:`, err instanceof Error ? err.message : err);
      }

      // Stage 2: Wait 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Stage 3: Initialize
      try {
        await agent.initialize();
        log.info(`[HealthMonitor] Agent reinitialization completed: ${agentId}`);
      } catch (err) {
        log.error(`[HealthMonitor] Agent reinitialization failed: ${agentId}:`, err instanceof Error ? err.message : err);
        monitored.restartCount++;
        monitored.lastRestartTime = Date.now();

        // Stage 5: If restart fails 3 times, escalate to human
        if (monitored.restartCount >= 3) {
          await this.emitEvent(agentId, 'agent.escalate.human', {
            agentId,
            restartCount: monitored.restartCount,
            reason: 'restart_failed_3_times',
            lastError: err instanceof Error ? err.message : String(err),
          });
        }

        return false;
      }

      // Stage 4: Reset failure counter on success
      monitored.consecutiveFailures = 0;
      monitored.restartCount = 0;
      monitored.lastRestartTime = Date.now();

      // Emit success event
      await this.emitEvent(agentId, 'agent.restarted', {
        agentId,
        restartCount: 0,
        timestamp: Date.now(),
      });

      return true;
    } catch (err) {
      log.error(`[HealthMonitor] Unexpected error during restart: ${agentId}:`, err instanceof Error ? err.message : err);
      return false;
    }
  }

  /** イベント発行（Bus障害耐性付き — 発行失敗でも監視は継続する） */
  private async emitEvent(agentId: string, type: string, payload: unknown): Promise<void> {
    if (!this.bus) return;

    const event: AgentEvent = {
      id: `hm_${Date.now()}_${agentId}`,
      type,
      source: 'health-monitor',
      priority: type.includes('critical') ? 'critical' : type.includes('error') ? 'high' : 'normal',
      payload,
      timestamp: Date.now(),
    };

    try {
      await this.bus.publish(event);
    } catch (err) {
      // Bus障害時にも監視を止めない（FATAL修正: 発行失敗で黙死を防止）
      log.error(
        `[HealthMonitor] Bus publish failed for ${type}@${agentId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 1B.02: 外部通知チャネルへ発報
   * デバウンス付き — 同一agent+levelの通知は cooldownMs 以内に重複しない
   */
  private async sendExternalNotification(
    agentId: string,
    level: 'degraded' | 'error' | 'critical',
    failures: number,
    lastHealth: AgentHealth,
  ): Promise<void> {
    if (this.notificationChannels.length === 0) return;

    // デバウンスチェック
    const key = `${agentId}:${level}`;
    const lastSent = this.lastNotifications.get(key) || 0;
    if (Date.now() - lastSent < this.notificationCooldownMs) return;

    for (const channel of this.notificationChannels) {
      if (!channel.levels?.includes(level)) continue;

      try {
        const payload = this.buildNotificationPayload(channel.type, agentId, level, failures, lastHealth);
        await fetch(channel.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(channel.headers || {}),
          },
          body: JSON.stringify(payload),
        });
        this.lastNotifications.set(key, Date.now());
      } catch (err) {
        log.warn(`[HealthMonitor] External notification failed (${channel.type}):`, err instanceof Error ? err.message : err);
      }
    }
  }

  /** 通知ペイロード構築（Slack/Webhook対応） */
  private buildNotificationPayload(
    type: 'webhook' | 'slack',
    agentId: string,
    level: string,
    failures: number,
    health: AgentHealth,
  ): Record<string, unknown> {
    if (type === 'slack') {
      const emoji = level === 'critical' ? ':rotating_light:' : level === 'error' ? ':warning:' : ':large_yellow_circle:';
      return {
        text: `${emoji} *Astromeda Health Alert*\nAgent: \`${agentId}\` | Level: *${level.toUpperCase()}*\nConsecutive failures: ${failures} | Status: ${health.status}\nError count: ${health.errorCount} | Memory: ${(health.memoryUsage / 1024 / 1024).toFixed(1)}MB`,
        channel: undefined, // Uses webhook default channel
      };
    }
    // Generic webhook
    return {
      event: 'health.alert',
      agentId,
      level,
      failures,
      health: {
        status: health.status,
        errorCount: health.errorCount,
        memoryUsage: health.memoryUsage,
        taskQueue: health.taskQueue,
      },
      timestamp: new Date().toISOString(),
    };
  }

  // ── 診断API ──

  /** 全Agent健康状態の一覧（カルテ） */
  getAllHealth(): Record<string, AgentHealth & { consecutiveFailures: number }> {
    const result: Record<string, AgentHealth & { consecutiveFailures: number }> = {};
    for (const [id, m] of this.agents) {
      result[id] = { ...m.lastHealth, consecutiveFailures: m.consecutiveFailures };
    }
    return result;
  }

  /** 異常Agentのみ抽出 */
  getUnhealthyAgents(): string[] {
    return [...this.agents.entries()]
      .filter(([_, m]) => m.lastHealth.status !== 'healthy')
      .map(([id]) => id);
  }

  /** 全体サマリー（バイタルサイン一覧表） */
  getStats() {
    const all = [...this.agents.values()];
    return {
      totalAgents: all.length,
      healthy: all.filter((m) => m.lastHealth.status === 'healthy').length,
      degraded: all.filter((m) => m.lastHealth.status === 'degraded').length,
      error: all.filter((m) => m.lastHealth.status === 'error').length,
      shutdown: all.filter((m) => m.lastHealth.status === 'shutdown').length,
    };
  }

  /** T069: 再起動統計を取得（診断用） */
  getRestartStats(): Record<string, {restartCount: number; lastRestartTime?: number; consecutiveFailures: number}> {
    const result: Record<string, {restartCount: number; lastRestartTime?: number; consecutiveFailures: number}> = {};
    for (const [id, m] of this.agents) {
      result[id] = {
        restartCount: m.restartCount,
        lastRestartTime: m.lastRestartTime,
        consecutiveFailures: m.consecutiveFailures,
      };
    }
    return result;
  }

  /** テスト用: 再起動クールダウンをリセット */
  _resetRestartCooldown(agentId: string): void {
    const monitored = this.agents.get(agentId);
    if (monitored) {
      monitored.lastRestartTime = 0;
    }
  }

  // ── 自己監視（Meta-Monitor: 心電図モニターの心電図） ──

  private selfCheckTimer: ReturnType<typeof setInterval> | null = null;
  private selfCheckFailures = 0;

  /**
   * 自己監視を開始（「監視者を監視する」メカニズム）
   *
   * HealthMonitor自身がBus経由でハートビートを30秒ごとに発行。
   * もしこのハートビートが120秒途切れたら、Watchdog等が検知できる。
   * Bus自体が死んだ場合、ハートビートが止まる = 外部監視で検知可能。
   */
  startSelfMonitoring(): void {
    if (this.selfCheckTimer) return;

    this.selfCheckTimer = setInterval(() => {
      this.emitSelfHeartbeat();
    }, 30000); // 30秒間隔

    // 即時発行
    this.emitSelfHeartbeat();
  }

  /** 自己ハートビート発行 */
  private async emitSelfHeartbeat(): Promise<void> {
    try {
      if (this.bus) {
        await this.bus.publish({
          id: `hm_heartbeat_${Date.now()}`,
          type: 'health.monitor.heartbeat',
          source: 'health-monitor',
          priority: 'low',
          payload: {
            running: this.running,
            monitoredAgents: this.agents.size,
            stats: this.getStats(),
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        });
        this.selfCheckFailures = 0;
      }
    } catch {
      this.selfCheckFailures++;
      // Bus障害3回連続でコンソール警告（最低限の可視性確保）
      if (this.selfCheckFailures >= 3) {
        log.error(`[HealthMonitor] CRITICAL: Bus障害 — 自己ハートビート ${this.selfCheckFailures}回連続発行失敗。監視がブラインド状態です。`);
      }
    }
  }

  /** 自己監視停止 */
  stopSelfMonitoring(): void {
    if (this.selfCheckTimer) {
      clearInterval(this.selfCheckTimer);
      this.selfCheckTimer = null;
    }
  }
}
