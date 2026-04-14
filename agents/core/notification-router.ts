/**
 * NotificationRouter — 優先度別ルーティング（T062完成）
 *
 * 医学的メタファー: 救急外来のトリアージ（優先度判定）
 * - Critical → 即座に全チャネル（Slack + Email + Dashboard）
 * - Warning → Slack + Dashboard（1分バッチ）
 * - Info → Dashboard のみ
 */

import type { EventPriority, AgentEvent, IAgentBus } from './types.js';
import { createLogger } from '../core/logger.js';
import { getChannelOrchestrator } from './notification-channels.js';
import type { NotificationPayload } from './notification-channels.js';

const log = createLogger('notification-router');

export interface RoutingRule {
  priority: EventPriority;
  channels: Array<'slack' | 'email' | 'webhook' | 'dashboard' | 'sms'>;
  delayMs?: number; // バッチ遅延（0=即座）
}

export interface RoutingConfig {
  rules: RoutingRule[];
  enableFallback: boolean;
}

const DEFAULT_ROUTING: RoutingConfig = {
  enableFallback: true,
  rules: [
    {
      priority: 'critical',
      channels: ['slack', 'email', 'webhook', 'dashboard'],
      delayMs: 0, // 即座
    },
    {
      priority: 'high',
      channels: ['slack', 'dashboard'],
      delayMs: 60000, // 1分バッチ
    },
    {
      priority: 'normal',
      channels: ['dashboard'],
      delayMs: 0,
    },
    {
      priority: 'low',
      channels: ['dashboard'],
      delayMs: 300000, // 5分バッチ
    },
  ],
};

interface PendingNotification {
  payload: NotificationPayload;
  channels: string[];
  scheduledTime: number;
}

export class NotificationRouter {
  private config: RoutingConfig;
  private pendingBatches = new Map<string, PendingNotification[]>(); // batchKey → notifications
  private batchTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private orchestrator = getChannelOrchestrator();

  constructor(config?: Partial<RoutingConfig>) {
    this.config = {
      ...DEFAULT_ROUTING,
      ...config,
    };
  }

  /**
   * 通知をルーティング（優先度とチャネルルールに基づいて配信）
   */
  async route(payload: NotificationPayload): Promise<boolean> {
    const rule = this.config.rules.find((r) => r.priority === payload.severity);

    if (!rule) {
      log.warn(`[NotificationRouter] No routing rule for priority: ${payload.severity}`);
      return false;
    }

    log.info(
      `[NotificationRouter] Routing notification "${payload.title}" to channels: ${rule.channels.join(', ')}`,
    );

    // バッチ遅延なし → 即座に配信
    if (!rule.delayMs || rule.delayMs === 0) {
      const results = await this.orchestrator.deliver(payload);
      const anySuccess = results.some((r) => r.success);
      return anySuccess;
    }

    // バッチ遅延あり → キューに溜める
    const batchKey = `${payload.severity}_batch`;
    if (!this.pendingBatches.has(batchKey)) {
      this.pendingBatches.set(batchKey, []);
    }

    const batch = this.pendingBatches.get(batchKey)!;
    batch.push({
      payload,
      channels: rule.channels,
      scheduledTime: Date.now() + rule.delayMs,
    });

    // 初回のみタイマーセット
    if (batch.length === 1) {
      this.scheduleBatchFlush(batchKey, rule.delayMs);
    }

    return true;
  }

  /**
   * バッチをスケジュール
   */
  private scheduleBatchFlush(batchKey: string, delayMs: number): void {
    // 既に設定済みなら上書きしない
    if (this.batchTimers.has(batchKey)) {
      return;
    }

    const timer = setTimeout(
      () => {
        this.flushBatch(batchKey).catch((err) => {
          log.error(`[NotificationRouter] Batch flush error for ${batchKey}:`, err);
        });
      },
      delayMs,
    );

    this.batchTimers.set(batchKey, timer);
  }

  /**
   * バッチを即座にフラッシュ（手動トリガー）
   */
  async flushBatch(batchKey: string): Promise<void> {
    const batch = this.pendingBatches.get(batchKey);
    if (!batch || batch.length === 0) {
      return;
    }

    const notifications = this.pendingBatches.get(batchKey)!.splice(0);
    log.info(`[NotificationRouter] Flushing batch ${batchKey} with ${notifications.length} notifications`);

    // 全通知を送信
    const results = await Promise.all(notifications.map((n) => this.orchestrator.deliver(n.payload)));

    const successCount = results.flat().filter((r) => r.success).length;
    log.info(
      `[NotificationRouter] Batch ${batchKey} delivered: ${successCount}/${notifications.length * 4} successful`,
    );

    // タイマーをクリア
    const timer = this.batchTimers.get(batchKey);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(batchKey);
    }
  }

  /**
   * 全バッチを即座にフラッシュ
   */
  async flushAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const batchKey of this.pendingBatches.keys()) {
      promises.push(this.flushBatch(batchKey));
    }
    await Promise.all(promises);
  }

  /**
   * ルーティングルール更新
   */
  updateRules(rules: RoutingRule[]): void {
    this.config.rules = rules;
    log.info(`[NotificationRouter] Updated ${rules.length} routing rules`);
  }

  /**
   * 現在のルール一覧
   */
  getRules(): RoutingRule[] {
    return [...this.config.rules];
  }

  // N-02: AgentBusに接続してイベントを自動ルーティング
  private busSubscriptionId: string | null = null;

  connectBus(bus: IAgentBus): void {
    if (this.busSubscriptionId) return; // 二重接続防止

    // 重要イベントパターンを購読: health異常, pipeline失敗, escalation, DLQ閾値
    const notifiablePatterns = [
      'health.critical', 'health.degraded',
      'pipeline.failed', 'pipeline.timeout',
      'system.deadletter.threshold',
      'event.escalated',
      'system.schedule.disabled',
      'circuit.opened',
      'security.vulnerability.critical',
    ];

    this.busSubscriptionId = bus.subscribe('*', async (event: AgentEvent) => {
      // 通知対象のイベントのみルーティング
      const isNotifiable = notifiablePatterns.some(p => event.type === p || event.type.startsWith(p + '.'));
      const isCritical = event.priority === 'critical';

      if (!isNotifiable && !isCritical) return;

      const severity: EventPriority = event.priority ?? 'normal';
      try {
        await this.route({
          title: `[${event.source}] ${event.type}`,
          body: typeof event.payload === 'object' && event.payload
            ? JSON.stringify(event.payload).substring(0, 500)
            : String(event.payload ?? ''),
          severity,
          source: event.source ?? 'unknown',
          metadata: { eventId: event.id, eventType: event.type },
        });
      } catch (err) {
        log.error('[NotificationRouter] Bus event routing failed:', err instanceof Error ? err.message : String(err));
      }
    });

    log.info('[NotificationRouter] Connected to AgentBus — monitoring critical events');
  }

  /**
   * シャットダウン
   */
  shutdown(): void {
    for (const timer of this.batchTimers.values()) {
      clearTimeout(timer);
    }
    this.batchTimers.clear();
    this.pendingBatches.clear();
  }
}

// シングルトン
let routerInstance: NotificationRouter | null = null;

export function getNotificationRouter(): NotificationRouter {
  if (!routerInstance) {
    routerInstance = new NotificationRouter();
  }
  return routerInstance;
}

export function resetNotificationRouter(): void {
  routerInstance?.shutdown();
  routerInstance = null;
}
