/**
 * Health Notification Bridge — HealthMonitorをNotificationBusに接続
 *
 * 医学的メタファー: 自律神経系（HealthMonitor）を中枢神経警告システムに統合
 * HealthMonitor の health.critical, health.error, health.degraded イベントを
 * NotificationBus にマップし、Slack に通知。
 *
 * 接続原理: HealthMonitorが AgentBus を通じて発火する イベントを購読し、
 * 重複排除してNotificationBusに送信する。
 */

import { getAgentBus } from './agent-bus.js';
import { getNotificationBus } from './notification-bus.js';
import { getEscalation } from './escalation.js';
import type { IAgentBus, AgentEvent } from './types.js';
import type { NotificationBus } from './notification-bus.js';
import type { Escalation } from './escalation.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('health-notification-bridge');


interface HealthEventCache {
  agentId: string;
  status: string;
  lastNotifiedAt: number;
}

/**
 * Health Notification Bridge
 */
export class HealthNotificationBridge {
  private bus: IAgentBus;
  private notificationBus: NotificationBus;
  private escalation: Escalation;
  private subscriptionIds: string[] = [];
  private eventCache = new Map<string, HealthEventCache>();
  private readonly DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30分の重複排除ウィンドウ

  constructor() {
    this.bus = getAgentBus();
    this.notificationBus = getNotificationBus();
    this.escalation = getEscalation();
  }

  /**
   * HealthMonitor イベントの購読を開始
   */
  connect(): void {
    // health.critical イベント → 即座にCritical通知 + エスカレーション
    const criticalSub = this.bus.subscribe('health.critical', async (event: AgentEvent) => {
      await this.handleCriticalHealth(event);
    });
    this.subscriptionIds.push(criticalSub);

    // health.error イベント → High優先度通知
    const errorSub = this.bus.subscribe('health.error', async (event: AgentEvent) => {
      await this.handleErrorHealth(event);
    });
    this.subscriptionIds.push(errorSub);

    // health.degraded イベント → Medium優先度通知（ダイジェスト）
    const degradedSub = this.bus.subscribe('health.degraded', async (event: AgentEvent) => {
      await this.handleDegradedHealth(event);
    });
    this.subscriptionIds.push(degradedSub);

    log.info('[HealthNotificationBridge] Connected to AgentBus');
  }

  /**
   * Critical ヘルス状態の処理
   * → 即座にCritical通知 + エスカレーション開始
   */
  private async handleCriticalHealth(event: AgentEvent): Promise<void> {
    const { agentId, health } = event.payload as {
      agentId: string;
      health: { status: string; errorCount: number };
    };

    // 重複チェック
    if (this.isDuplicate(agentId, 'critical')) {
      log.info(`[HealthNotificationBridge] Deduplicated critical event for ${agentId}`);
      return;
    }

    this.recordEvent(agentId, 'critical');

    const title = `🚨 Agent ${agentId} - CRITICAL`;
    const message = `Agent has entered critical state. Error count: ${health.errorCount}. Immediate action required.`;

    // Critical通知を送信
    await this.notificationBus.sendNotification({
      id: `health-crit-${Date.now()}-${agentId}`,
      severity: 'critical',
      source: agentId,
      title,
      message,
      timestamp: Date.now(),
      actionUrl: `/admin/agents/${agentId}`,
    });

    // エスカレーション開始
    await this.escalation.escalate({
      id: `esc-health-${Date.now()}`,
      sourceAgentId: agentId,
      title,
      message: `${message} Current status: ${health.status}`,
      severity: 'critical',
      timestamp: Date.now(),
      currentLevel: 0,
      escalationHistory: [],
      resolved: false,
    });

    log.info(`[HealthNotificationBridge] Critical health: ${agentId}`);
  }

  /**
   * Error ヘルス状態の処理
   * → High優先度通知（1時間ごとバッチ）
   */
  private async handleErrorHealth(event: AgentEvent): Promise<void> {
    const { agentId, health } = event.payload as {
      agentId: string;
      health: { status: string; errorCount: number };
    };

    // 重複チェック
    if (this.isDuplicate(agentId, 'error')) {
      log.info(`[HealthNotificationBridge] Deduplicated error event for ${agentId}`);
      return;
    }

    this.recordEvent(agentId, 'error');

    const title = `⚠️ Agent ${agentId} - ERROR`;
    const message = `Agent is in error state. Error count: ${health.errorCount}. Status: ${health.status}`;

    await this.notificationBus.sendNotification({
      id: `health-err-${Date.now()}-${agentId}`,
      severity: 'high',
      source: agentId,
      title,
      message,
      timestamp: Date.now(),
      actionUrl: `/admin/agents/${agentId}`,
    });

    log.info(`[HealthNotificationBridge] Error health: ${agentId}`);
  }

  /**
   * Degraded ヘルス状態の処理
   * → Medium優先度通知（日次ダイジェスト）
   */
  private async handleDegradedHealth(event: AgentEvent): Promise<void> {
    const { agentId, health } = event.payload as {
      agentId: string;
      health: { status: string; errorCount: number };
    };

    // 重複チェック
    if (this.isDuplicate(agentId, 'degraded')) {
      log.info(`[HealthNotificationBridge] Deduplicated degraded event for ${agentId}`);
      return;
    }

    this.recordEvent(agentId, 'degraded');

    const title = `📊 Agent ${agentId} - DEGRADED`;
    const message = `Agent performance has degraded. Error count: ${health.errorCount}. Status: ${health.status}. Monitor closely.`;

    await this.notificationBus.sendNotification({
      id: `health-deg-${Date.now()}-${agentId}`,
      severity: 'normal',
      source: agentId,
      title,
      message,
      timestamp: Date.now(),
      actionUrl: `/admin/agents/${agentId}`,
    });

    log.info(`[HealthNotificationBridge] Degraded health: ${agentId}`);
  }

  /**
   * 重複チェック
   */
  private isDuplicate(agentId: string, status: string): boolean {
    const key = `${agentId}:${status}`;
    const cached = this.eventCache.get(key);

    if (!cached) {
      return false;
    }

    return Date.now() - cached.lastNotifiedAt < this.DEDUP_WINDOW_MS;
  }

  /**
   * イベント記録
   */
  private recordEvent(agentId: string, status: string): void {
    const key = `${agentId}:${status}`;
    this.eventCache.set(key, {
      agentId,
      status,
      lastNotifiedAt: Date.now(),
    });
  }

  // ── 3B: 診断API（通知チャネル統計） ──

  /** 通知統計（重複排除の効果測定） */
  getStats(): {
    cachedEvents: number;
    subscriptions: number;
    dedupWindowMs: number;
  } {
    return {
      cachedEvents: this.eventCache.size,
      subscriptions: this.subscriptionIds.length,
      dedupWindowMs: this.DEDUP_WINDOW_MS,
    };
  }

  /** キャッシュされたイベントの一覧（診断用） */
  getCachedEvents(): Array<{agentId: string; status: string; lastNotifiedAt: number}> {
    return [...this.eventCache.values()];
  }

  /**
   * 購読を解除してシャットダウン
   */
  disconnect(): void {
    for (const subId of this.subscriptionIds) {
      this.bus.unsubscribe(subId);
    }
    this.subscriptionIds = [];
    this.eventCache.clear();
    log.info('[HealthNotificationBridge] Disconnected from AgentBus');
  }
}

// ── シングルトン ──
let bridgeInstance: HealthNotificationBridge | null = null;

/**
 * HealthNotificationBridge のシングルトン取得
 */
export function getHealthNotificationBridge(): HealthNotificationBridge {
  if (!bridgeInstance) {
    bridgeInstance = new HealthNotificationBridge();
  }
  return bridgeInstance;
}
