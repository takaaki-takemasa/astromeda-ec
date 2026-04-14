/**
 * Escalation — エスカレーション管理（警告伝達の段階化）
 *
 * 医学的メタファー: 脊髄反射から大脳皮質への段階的信号伝達
 * 重大な問題が自動解決しない場合、段階的に上位のリーダーに報告。
 *
 * エスカレーション階層:
 * - L2 (5分) → 現場チーム リーダー
 * - L1 (15分) → チーム統括責任者
 * - L0 (30分) → システム司令官（Commander）
 * - Admin (30分経過後) → Slack DM で Admin に通知
 */

import { getSlackClient } from './slack-client.js';
import { getNotificationBus } from './notification-bus.js';
import type { SlackClient } from './slack-client.js';
import type { NotificationBus } from './notification-bus.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('escalation');


export interface EscalationEvent {
  id: string;
  sourceAgentId: string;
  title: string;
  message: string;
  severity: 'critical' | 'high';
  timestamp: number;
  currentLevel: number; // 0=L2, 1=L1, 2=L0, 3=Admin
  escalationHistory: Array<{
    level: number;
    notifiedAt: number;
    recipient: string;
  }>;
  resolved: boolean;
  resolvedAt?: number;
}

interface EscalationConfig {
  l2TimeoutMs: number; // 5分
  l1TimeoutMs: number; // 15分
  l0TimeoutMs: number; // 30分
  adminTimeoutMs: number; // 30分経過後
}

const DEFAULT_CONFIG: EscalationConfig = {
  l2TimeoutMs: 5 * 60 * 1000,
  l1TimeoutMs: 15 * 60 * 1000,
  l0TimeoutMs: 30 * 60 * 1000,
  adminTimeoutMs: 30 * 60 * 1000,
};

/**
 * Escalation マネージャー
 */
export class Escalation {
  private slackClient: SlackClient;
  private notificationBus: NotificationBus;
  private escalationMap = new Map<string, EscalationEvent>();
  private escalationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private config: EscalationConfig;
  private readonly MAX_HISTORY = 500;

  // リーダー情報（外部から設定可能）
  private l2Lead = 'l2-lead'; // L2リーダーのSlack user ID or DM channel
  private l1Lead = 'l1-lead'; // L1リーダーのSlack user ID or DM channel
  private l0Commander = 'l0-commander'; // Commanderのuser ID
  private adminDm = 'admin-dm'; // AdminのDM channel ID

  constructor(config?: Partial<EscalationConfig>) {
    this.slackClient = getSlackClient();
    this.notificationBus = getNotificationBus();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * エスカレーション開始
   */
  async escalate(event: EscalationEvent): Promise<string> {
    // 既存のエスカレーション取得（同じ sourceAgentId ）
    let escalation = this.escalationMap.get(event.sourceAgentId);

    if (!escalation) {
      escalation = {
        id: `esc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sourceAgentId: event.sourceAgentId,
        title: event.title,
        message: event.message,
        severity: event.severity,
        timestamp: Date.now(),
        currentLevel: 0,
        escalationHistory: [],
        resolved: false,
      };

      this.escalationMap.set(event.sourceAgentId, escalation);
    }

    // L2にエスカレーション
    await this.notifyL2(escalation);

    // L1へのタイマーをセット
    const l1Timer = setTimeout(() => {
      this.notifyL1(escalation!).catch((err) => {
        log.error('[Escalation] L1 notification failed:', err);
      });
    }, this.config.l2TimeoutMs);

    this.escalationTimers.set(`${escalation.id}-l1`, l1Timer);

    // L0へのタイマーをセット
    const l0Timer = setTimeout(() => {
      this.notifyL0(escalation!).catch((err) => {
        log.error('[Escalation] L0 notification failed:', err);
      });
    }, this.config.l1TimeoutMs);

    this.escalationTimers.set(`${escalation.id}-l0`, l0Timer);

    // Adminへのタイマーをセット
    const adminTimer = setTimeout(() => {
      this.notifyAdmin(escalation!).catch((err) => {
        log.error('[Escalation] Admin notification failed:', err);
      });
    }, this.config.adminTimeoutMs);

    this.escalationTimers.set(`${escalation.id}-admin`, adminTimer);

    return escalation.id;
  }

  /**
   * L2リーダーに通知
   */
  private async notifyL2(event: EscalationEvent): Promise<void> {
    event.currentLevel = 0;
    const message = `🔴 *エスカレーション L2* (${event.severity})\n*${event.title}*\n${event.message}\n\nAgent: ${event.sourceAgentId}`;

    const success = await this.slackClient.sendMessage(this.l2Lead, message);

    if (success) {
      event.escalationHistory.push({
        level: 0,
        notifiedAt: Date.now(),
        recipient: this.l2Lead,
      });

      await this.notificationBus.sendNotification({
        id: `notif-${Date.now()}-l2`,
        severity: 'high',
        source: 'escalation',
        title: `L2 Escalation: ${event.title}`,
        message,
        timestamp: Date.now(),
        metadata: { escalationId: event.id },
      });
    }
  }

  /**
   * L1リーダーに通知（L2が対応できなかった場合）
   */
  private async notifyL1(event: EscalationEvent): Promise<void> {
    if (event.resolved) {
      return;
    }

    event.currentLevel = 1;
    const message = `🟠 *エスカレーション L1* (${event.severity})\n*${event.title}*\n${event.message}\n\nAgent: ${event.sourceAgentId}\n\n⚠️ L2リーダーが15分内に対応しませんでした`;

    const success = await this.slackClient.sendMessage(this.l1Lead, message);

    if (success) {
      event.escalationHistory.push({
        level: 1,
        notifiedAt: Date.now(),
        recipient: this.l1Lead,
      });

      await this.notificationBus.sendNotification({
        id: `notif-${Date.now()}-l1`,
        severity: 'critical',
        source: 'escalation',
        title: `L1 Escalation: ${event.title}`,
        message,
        timestamp: Date.now(),
        metadata: { escalationId: event.id },
      });
    }
  }

  /**
   * L0 Commander に通知（L1が対応できなかった場合）
   */
  private async notifyL0(event: EscalationEvent): Promise<void> {
    if (event.resolved) {
      return;
    }

    event.currentLevel = 2;
    const message = `🔴 *エスカレーション L0 - CRITICAL* (${event.severity})\n*${event.title}*\n${event.message}\n\nAgent: ${event.sourceAgentId}\n\n⚠️️ L1リーダーが30分内に対応できませんでした`;

    const success = await this.slackClient.sendMessage(this.l0Commander, message);

    if (success) {
      event.escalationHistory.push({
        level: 2,
        notifiedAt: Date.now(),
        recipient: this.l0Commander,
      });

      await this.notificationBus.sendNotification({
        id: `notif-${Date.now()}-l0`,
        severity: 'critical',
        source: 'escalation',
        title: `L0 CRITICAL Escalation: ${event.title}`,
        message,
        timestamp: Date.now(),
        actionUrl: '/admin/escalations',
        metadata: { escalationId: event.id },
      });
    }
  }

  /**
   * Admin に Slack DM で通知（全段階が失敗した場合）
   */
  private async notifyAdmin(event: EscalationEvent): Promise<void> {
    if (event.resolved) {
      return;
    }

    event.currentLevel = 3;
    const message = `🚨 *システム エスカレーション失敗* 🚨\n*${event.title}*\n${event.message}\n\nAgent: ${event.sourceAgentId}\n\n全段階のリーダーが対応しませんでした。直ちに対応が必要です。`;

    const success = await this.slackClient.sendMessage(this.adminDm, message);

    if (success) {
      event.escalationHistory.push({
        level: 3,
        notifiedAt: Date.now(),
        recipient: this.adminDm,
      });

      await this.notificationBus.sendNotification({
        id: `notif-${Date.now()}-admin`,
        severity: 'critical',
        source: 'escalation',
        title: `ADMIN ALERT: ${event.title}`,
        message,
        timestamp: Date.now(),
        actionUrl: '/admin/escalations',
        metadata: { escalationId: event.id, critical: true },
      });
    }
  }

  /**
   * エスカレーションを手動解決
   */
  async resolveEscalation(escalationId: string): Promise<boolean> {
    // escalationId でマップから検索
    for (const [sourceId, event] of this.escalationMap) {
      if (event.id === escalationId) {
        event.resolved = true;
        event.resolvedAt = Date.now();

        // タイマーをクリア
        this.escalationTimers.delete(`${escalationId}-l1`);
        this.escalationTimers.delete(`${escalationId}-l0`);
        this.escalationTimers.delete(`${escalationId}-admin`);

        log.info(`[Escalation] Escalation ${escalationId} resolved`);

        return true;
      }
    }

    return false;
  }

  /**
   * エスカレーション履歴を取得
   */
  getHistory(sourceAgentId?: string): EscalationEvent[] {
    if (sourceAgentId) {
      const event = this.escalationMap.get(sourceAgentId);
      return event ? [event] : [];
    }

    const history = Array.from(this.escalationMap.values());
    if (history.length > this.MAX_HISTORY) {
      return history.slice(-this.MAX_HISTORY);
    }
    return history;
  }

  /**
   * エスカレーション統計
   */
  getStats(): {
    total: number;
    resolved: number;
    pending: number;
    averageResolutionTimeMs: number;
  } {
    const all = Array.from(this.escalationMap.values());
    const resolved = all.filter((e) => e.resolved);
    const pending = all.filter((e) => !e.resolved);

    const avgTime =
      resolved.length > 0
        ? resolved.reduce((sum, e) => sum + ((e.resolvedAt || Date.now()) - e.timestamp), 0) /
          resolved.length
        : 0;

    return {
      total: all.length,
      resolved: resolved.length,
      pending: pending.length,
      averageResolutionTimeMs: avgTime,
    };
  }

  /**
   * リーダー情報をセット
   */
  setLeadership(config: {
    l2Lead?: string;
    l1Lead?: string;
    l0Commander?: string;
    adminDm?: string;
  }): void {
    if (config.l2Lead) this.l2Lead = config.l2Lead;
    if (config.l1Lead) this.l1Lead = config.l1Lead;
    if (config.l0Commander) this.l0Commander = config.l0Commander;
    if (config.adminDm) this.adminDm = config.adminDm;
  }

  /**
   * シャットダウン（タイマーをクリア）
   */
  shutdown(): void {
    for (const timer of this.escalationTimers.values()) {
      clearTimeout(timer);
    }
    this.escalationTimers.clear();
  }
}

// ── シングルトン ──
let escalationInstance: Escalation | null = null;

/**
 * Escalation マネージャーのシングルトン取得
 */
export function getEscalation(): Escalation {
  if (!escalationInstance) {
    escalationInstance = new Escalation();
  }
  return escalationInstance;
}
