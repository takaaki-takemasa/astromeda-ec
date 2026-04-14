/**
 * NotificationBus — 通知・警告ルーティング（中枢神経系の警告受信）
 *
 * 医学的メタファー: 脊髄神経の警告伝達経路
 * 重要度別（Critical/High/Medium/Low）の通知を適切なSlackチャネルに
 * ルーティングし、バッチ化・重複排除・リトライを実施。
 *
 * ルーティング:
 * - Critical → 即座に #astromeda-critical に送信
 * - High → 1時間ごとにバッチで #astromeda-alerts に送信
 * - Medium → 日次ダイジェストで #astromeda-daily に送信
 * - Low → 週次サマリーで #astromeda-weekly に送信
 */

import { getSlackClient } from './slack-client.js';
import type { SlackClient } from './slack-client.js';
import type { EventPriority } from './types.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('notification-bus');


export interface Notification {
  id: string;
  severity: EventPriority;
  source: string; // agentId
  title: string;
  message: string;
  timestamp: number;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

interface NotificationStats {
  totalSent: number;
  byCritical: number;
  byHigh: number;
  byMedium: number;
  byLow: number;
  deduplicated: number;
  retryCount: number;
  failureCount: number;
}

interface BatchedNotification {
  notifications: Notification[];
  scheduledTime: number;
  sent: boolean;
}

/**
 * NotificationBus — 通知ルーティングと配信管理
 */
export class NotificationBus {
  private slackClient: SlackClient;
  private stats: NotificationStats;
  private deduplicationMap = new Map<string, number>(); // key: `${source}:${title}` → timestamp
  private readonly DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30分
  private readonly DEDUP_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10分ごとに古いエントリを削除

  // バッチ蓄積
  private highBatch: Notification[] = [];
  private mediumBatch: Notification[] = [];
  private lowBatch: Notification[] = [];

  // スケジュール
  private highBatchTimer?: ReturnType<typeof setInterval>;
  private mediumBatchTimer?: ReturnType<typeof setInterval>;
  private lowBatchTimer?: ReturnType<typeof setInterval>;
  private dedupCleanupTimer?: ReturnType<typeof setInterval>;

  // リトライ設定
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS = [1000, 2000, 4000]; // exponential backoff

  constructor() {
    this.slackClient = getSlackClient();
    this.stats = {
      totalSent: 0,
      byCritical: 0,
      byHigh: 0,
      byMedium: 0,
      byLow: 0,
      deduplicated: 0,
      retryCount: 0,
      failureCount: 0,
    };

    this.startScheduledBatches();
    this.startDeduplicationCleanup();
  }

  /**
   * 通知を送信（重要度に応じてルーティング）
   */
  async sendNotification(notification: Notification): Promise<boolean> {
    // 重複チェック
    if (this.isDuplicate(notification)) {
      this.stats.deduplicated += 1;
      log.info(`[NotificationBus] Deduplicated notification: ${notification.title}`);
      return true;
    }

    // 重複マップに記録
    this.recordNotification(notification);

    switch (notification.severity) {
      case 'critical':
        return await this.sendCritical(notification);
      case 'high':
        this.highBatch.push(notification);
        return true;
      case 'normal':
        this.mediumBatch.push(notification);
        return true;
      case 'low':
        this.lowBatch.push(notification);
        return true;
      default:
        return false;
    }
  }

  /**
   * Critical通知を即座に送信
   */
  private async sendCritical(notification: Notification): Promise<boolean> {
    const message = this.formatNotificationMessage(notification);
    const blocks = this.createSlackBlocks(notification, 'critical');

    let success = false;
    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        success = await this.slackClient.sendMessage(
          'astromeda-critical',
          message,
          blocks,
        );
        if (success) {
          this.stats.byCritical += 1;
          this.stats.totalSent += 1;
          log.info(`[NotificationBus] Sent critical notification: ${notification.title}`);
          return true;
        }
      } catch (err) {
        log.error(`[NotificationBus] Critical notification attempt ${attempt + 1} failed:`, err);
      }

      // リトライ遅延
      if (attempt < this.MAX_RETRIES) {
        this.stats.retryCount += 1;
        await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAYS[attempt]));
      }
    }

    this.stats.failureCount += 1;
    return false;
  }

  /**
   * High通知をバッチで送信（1時間ごと）
   */
  private async flushHighBatch(): Promise<void> {
    if (this.highBatch.length === 0) {
      return;
    }

    const notifications = this.highBatch.splice(0);
    const message = `🔴 *高優先度通知* (${notifications.length}件)\n\n${notifications
      .map((n) => `• ${n.title}: ${n.message}`)
      .join('\n')}`;

    let success = false;
    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        success = await this.slackClient.sendMessage('astromeda-alerts', message);
        if (success) {
          this.stats.byHigh += notifications.length;
          this.stats.totalSent += notifications.length;
          log.info(`[NotificationBus] Sent ${notifications.length} high-priority notifications`);
          return;
        }
      } catch (err) {
        log.error(`[NotificationBus] High batch attempt ${attempt + 1} failed:`, err);
      }

      if (attempt < this.MAX_RETRIES) {
        this.stats.retryCount += 1;
        await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAYS[attempt]));
      }
    }

    // 送信失敗時は再度キューに戻す
    this.highBatch.push(...notifications);
    this.stats.failureCount += 1;
  }

  /**
   * Medium通知を日次で送信
   */
  private async flushMediumBatch(): Promise<void> {
    if (this.mediumBatch.length === 0) {
      return;
    }

    const notifications = this.mediumBatch.splice(0);
    const message = `🟡 *日次レポート* (${notifications.length}件)\n\n${notifications
      .map((n) => `• ${n.title}: ${n.message}`)
      .join('\n')}`;

    let success = false;
    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        success = await this.slackClient.sendMessage('astromeda-daily', message);
        if (success) {
          this.stats.byMedium += notifications.length;
          this.stats.totalSent += notifications.length;
          return;
        }
      } catch (err) {
        log.error(`[NotificationBus] Medium batch attempt ${attempt + 1} failed:`, err);
      }

      if (attempt < this.MAX_RETRIES) {
        this.stats.retryCount += 1;
        await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAYS[attempt]));
      }
    }

    this.mediumBatch.push(...notifications);
    this.stats.failureCount += 1;
  }

  /**
   * Low通知を週次で送信
   */
  private async flushLowBatch(): Promise<void> {
    if (this.lowBatch.length === 0) {
      return;
    }

    const notifications = this.lowBatch.splice(0);
    const message = `⚪ *週次サマリー* (${notifications.length}件)\n\n${notifications
      .map((n) => `• ${n.title}: ${n.message}`)
      .join('\n')}`;

    let success = false;
    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        success = await this.slackClient.sendMessage('astromeda-weekly', message);
        if (success) {
          this.stats.byLow += notifications.length;
          this.stats.totalSent += notifications.length;
          return;
        }
      } catch (err) {
        log.error(`[NotificationBus] Low batch attempt ${attempt + 1} failed:`, err);
      }

      if (attempt < this.MAX_RETRIES) {
        this.stats.retryCount += 1;
        await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAYS[attempt]));
      }
    }

    this.lowBatch.push(...notifications);
    this.stats.failureCount += 1;
  }

  /**
   * スケジュール済みバッチを開始
   */
  private startScheduledBatches(): void {
    // High: 1時間ごと
    this.highBatchTimer = setInterval(() => {
      this.flushHighBatch().catch((err) => {
        log.error('[NotificationBus] High batch flush error:', err);
      });
    }, 60 * 60 * 1000);

    // Medium: 24時間ごと
    this.mediumBatchTimer = setInterval(() => {
      this.flushMediumBatch().catch((err) => {
        log.error('[NotificationBus] Medium batch flush error:', err);
      });
    }, 24 * 60 * 60 * 1000);

    // Low: 7日ごと
    this.lowBatchTimer = setInterval(() => {
      this.flushLowBatch().catch((err) => {
        log.error('[NotificationBus] Low batch flush error:', err);
      });
    }, 7 * 24 * 60 * 60 * 1000);
  }

  /**
   * 重複排除マップの自動クリーンアップ
   */
  private startDeduplicationCleanup(): void {
    this.dedupCleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, timestamp] of this.deduplicationMap) {
        if (now - timestamp > this.DEDUP_WINDOW_MS) {
          this.deduplicationMap.delete(key);
        }
      }
    }, this.DEDUP_CHECK_INTERVAL_MS);
  }

  /**
   * 重複チェック
   */
  private isDuplicate(notification: Notification): boolean {
    const key = `${notification.source}:${notification.title}`;
    const lastTime = this.deduplicationMap.get(key);
    if (!lastTime) {
      return false;
    }
    return Date.now() - lastTime < this.DEDUP_WINDOW_MS;
  }

  /**
   * 通知を記録（重複チェック用）
   */
  private recordNotification(notification: Notification): void {
    const key = `${notification.source}:${notification.title}`;
    this.deduplicationMap.set(key, Date.now());
  }

  /**
   * 通知メッセージのフォーマット
   */
  private formatNotificationMessage(notification: Notification): string {
    return `[${notification.severity.toUpperCase()}] ${notification.title}\n${notification.message}`;
  }

  /**
   * Slack Blocks の生成
   */
  private createSlackBlocks(
    notification: Notification,
    severity: string,
  ): Record<string, unknown>[] {
    const colorMap: Record<string, string> = {
      critical: '#FF0000',
      high: '#FF9900',
      normal: '#0099FF',
      low: '#999999',
    };

    return [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: notification.title,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: notification.message,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*Source:* ${notification.source} | *Time:* <!date^${Math.floor(
              notification.timestamp / 1000,
            )}^{date_num} {time_secs}|${new Date(notification.timestamp).toISOString()}>`,
          },
        ],
      },
      ...(notification.actionUrl
        ? [
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'View Details',
                  },
                  url: notification.actionUrl,
                },
              ],
            },
          ]
        : []),
    ];
  }

  /**
   * 手動フラッシュ（全バッチを今すぐ送信）
   */
  async flush(): Promise<void> {
    await Promise.all([
      this.flushHighBatch(),
      this.flushMediumBatch(),
      this.flushLowBatch(),
    ]);
  }

  /**
   * 統計情報を取得
   */
  getStats(): NotificationStats {
    return { ...this.stats };
  }

  /**
   * シャットダウン（タイマーをクリア）
   */
  shutdown(): void {
    if (this.highBatchTimer) clearInterval(this.highBatchTimer);
    if (this.mediumBatchTimer) clearInterval(this.mediumBatchTimer);
    if (this.lowBatchTimer) clearInterval(this.lowBatchTimer);
    if (this.dedupCleanupTimer) clearInterval(this.dedupCleanupTimer);
  }
}

// ── シングルトン ──
let notificationBusInstance: NotificationBus | null = null;

/**
 * NotificationBus シングルトン取得
 */
export function getNotificationBus(): NotificationBus {
  if (!notificationBusInstance) {
    notificationBusInstance = new NotificationBus();
  }
  return notificationBusInstance;
}
