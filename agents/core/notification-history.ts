/**
 * NotificationHistory — 通知履歴管理（T063完成）
 *
 * 医学的メタファー: カルテ・電子健康記録（EHR）
 * 全通知をストレージに永続化し、監査とトレンド分析を可能にする。
 *
 * 注意: InMemoryStorageはテーブル対応。各通知は個別レコード(id=notif_xxx)として保存。
 */

import type { EventPriority } from './types.js';
import type { IStorageAdapter } from './storage.js';
import { createLogger } from '../core/logger.js';
import { getStorage } from './storage.js';

const log = createLogger('notification-history');

export interface NotificationRecord {
  id: string;
  channel: 'slack' | 'email' | 'webhook' | 'dashboard' | 'sms';
  priority: EventPriority;
  source: string;
  subject: string;
  body: string;
  sentAt: number;
  deliveredAt?: number;
  status: 'pending' | 'sent' | 'failed' | 'read';
  metadata?: Record<string, unknown>;
  retryCount?: number;
}

// Notification Record for storage (with required IStorageAdapter fields)
interface StoredNotification extends NotificationRecord {
  createdAt: number;
  updatedAt: number;
}

const TABLE_NAME = 'notification_records';
const MAX_RECORDS = 10000; // ストレージ圧迫防止

export class NotificationHistory {
  private storage: IStorageAdapter;

  constructor(storage?: IStorageAdapter) {
    this.storage = storage || getStorage();
  }

  /**
   * 通知を記録
   */
  async save(record: Omit<NotificationRecord, 'id'>): Promise<string> {
    const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const now = Date.now();
    const fullRecord: StoredNotification = { ...record, id, createdAt: now, updatedAt: now } as StoredNotification;

    try {
      await this.storage.put(TABLE_NAME, fullRecord);
      log.debug(`[NotificationHistory] Saved notification ${id}`);
      return id;
    } catch (err) {
      log.error('[NotificationHistory] Failed to save notification:', err);
      throw err;
    }
  }

  /**
   * 全通知取得（デバッグ用 — 大量データに注意）
   */
  async getAll(): Promise<NotificationRecord[]> {
    try {
      const all = await this.storage.query(TABLE_NAME, { limit: MAX_RECORDS });
      return all as NotificationRecord[];
    } catch (err) {
      log.error('[NotificationHistory] Failed to load all notifications:', err);
      return [];
    }
  }

  /**
   * 最近のN件を取得
   */
  async getRecent(limit = 100): Promise<NotificationRecord[]> {
    const all = await this.getAll();
    return all.slice(-limit).reverse(); // 新しい順
  }

  /**
   * 未読通知を取得
   */
  async getUnread(): Promise<NotificationRecord[]> {
    const all = await this.getAll();
    return all.filter((r) => r.status !== 'read').reverse();
  }

  /**
   * 優先度別フィルター
   */
  async getByPriority(priority: EventPriority, limit = 100): Promise<NotificationRecord[]> {
    const all = await this.getAll();
    return all.filter((r) => r.priority === priority).slice(-limit).reverse();
  }

  /**
   * チャネル別フィルター
   */
  async getByChannel(channel: string, limit = 100): Promise<NotificationRecord[]> {
    const all = await this.getAll();
    return all.filter((r) => r.channel === channel).slice(-limit).reverse();
  }

  /**
   * 期間内の通知を取得
   */
  async getInRange(startTime: number, endTime: number): Promise<NotificationRecord[]> {
    const all = await this.getAll();
    return all.filter((r) => r.sentAt >= startTime && r.sentAt <= endTime);
  }

  /**
   * 通知を既読にマーク
   */
  async markAsRead(id: string): Promise<boolean> {
    try {
      const record = await this.storage.get(TABLE_NAME, id);
      if (!record) {
        log.warn(`[NotificationHistory] Notification not found: ${id}`);
        return false;
      }

      const updated = { ...record, status: 'read', updatedAt: Date.now() } as StoredNotification;
      await this.storage.put(TABLE_NAME, updated);
      return true;
    } catch (err) {
      log.error(`[NotificationHistory] Failed to mark as read: ${id}`, err);
      return false;
    }
  }

  /**
   * 複数の通知を既読にマーク
   */
  async markMultipleAsRead(ids: string[]): Promise<number> {
    try {
      let updated = 0;

      for (const id of ids) {
        const record = await this.storage.get(TABLE_NAME, id);
        if (record && (record as any).status !== 'read') {
          const updated_record = { ...record, status: 'read', updatedAt: Date.now() } as StoredNotification;
          await this.storage.put(TABLE_NAME, updated_record);
          updated++;
        }
      }

      return updated;
    } catch (err) {
      log.error('[NotificationHistory] Failed to mark multiple as read:', err);
      return 0;
    }
  }

  /**
   * 統計情報
   */
  async getStats(): Promise<{
    total: number;
    unread: number;
    bySeverity: Record<EventPriority, number>;
    byChannel: Record<string, number>;
  }> {
    const all = await this.getAll();
    const stats = {
      total: all.length,
      unread: all.filter((r) => r.status !== 'read').length,
      bySeverity: {
        critical: 0,
        high: 0,
        normal: 0,
        low: 0,
      } as Record<EventPriority, number>,
      byChannel: {} as Record<string, number>,
    };

    for (const record of all) {
      stats.bySeverity[record.priority]++;
      stats.byChannel[record.channel] = (stats.byChannel[record.channel] || 0) + 1;
    }

    return stats;
  }

  /**
   * 古い通知を削除（保有期限：30日）
   */
  async cleanup(retentionDays = 30): Promise<number> {
    try {
      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const all = await this.getAll();
      const original = all.length;
      let removed = 0;

      // 古いレコードを削除
      for (const record of all) {
        if (record.sentAt <= cutoffTime) {
          await this.storage.delete(TABLE_NAME, record.id);
          removed++;
        }
      }

      if (removed > 0) {
        log.info(
          `[NotificationHistory] Cleanup: removed ${removed} old notifications`,
        );
      }

      return removed;
    } catch (err) {
      log.error('[NotificationHistory] Cleanup failed:', err);
      return 0;
    }
  }

  /**
   * 全通知削除（危険 — 管理画面のみ）
   */
  async clear(): Promise<void> {
    try {
      const all = await this.getAll();
      for (const record of all) {
        await this.storage.delete(TABLE_NAME, record.id);
      }
      log.warn('[NotificationHistory] All notifications cleared');
    } catch (err) {
      log.error('[NotificationHistory] Failed to clear:', err);
      throw err;
    }
  }
}

// シングルトン
let historyInstance: NotificationHistory | null = null;

export function getNotificationHistory(): NotificationHistory {
  if (!historyInstance) {
    historyInstance = new NotificationHistory();
  }
  return historyInstance;
}

export function resetNotificationHistory(): void {
  historyInstance = null;
}
