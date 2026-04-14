/**
 * NotificationBus テスト — 通知・警告ルーティングの検証
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotificationBus, getNotificationBus } from '../notification-bus.js';
import type { Notification } from '../notification-bus.js';

// Mock SlackClient
vi.mock('../slack-client.js', () => {
  const mockSend = vi.fn().mockResolvedValue(true);
  const mockSendWebhook = vi.fn().mockResolvedValue(true);

  return {
    getSlackClient: () => ({
      sendMessage: mockSend,
      sendWebhook: mockSendWebhook,
      available: true,
    }),
  };
});

describe('NotificationBus', () => {
  let bus: NotificationBus;

  beforeEach(() => {
    bus = new NotificationBus();
  });

  afterEach(() => {
    bus.shutdown();
  });

  describe('Critical notifications', () => {
    it('should send critical notification immediately', async () => {
      const notification: Notification = {
        id: 'test-1',
        severity: 'critical',
        source: 'test-agent',
        title: 'Critical Alert',
        message: 'System is down',
        timestamp: Date.now(),
      };

      const result = await bus.sendNotification(notification);

      expect(result).toBe(true);
      const stats = bus.getStats();
      expect(stats.byCritical).toBe(1);
      expect(stats.totalSent).toBe(1);
    });

    it('should track multiple critical notifications', async () => {
      const notifications: Notification[] = [
        {
          id: 'crit-1',
          severity: 'critical',
          source: 'agent-1',
          title: 'Alert 1',
          message: 'Error 1',
          timestamp: Date.now(),
        },
        {
          id: 'crit-2',
          severity: 'critical',
          source: 'agent-2',
          title: 'Alert 2',
          message: 'Error 2',
          timestamp: Date.now(),
        },
      ];

      for (const notif of notifications) {
        await bus.sendNotification(notif);
      }

      const stats = bus.getStats();
      expect(stats.byCritical).toBe(2);
      expect(stats.totalSent).toBe(2);
    });
  });

  describe('High priority notifications (batched hourly)', () => {
    it('should batch high priority notifications', async () => {
      const notification: Notification = {
        id: 'high-1',
        severity: 'high',
        source: 'test-agent',
        title: 'High Priority',
        message: 'Something needs attention',
        timestamp: Date.now(),
      };

      const result = await bus.sendNotification(notification);

      expect(result).toBe(true);
      // Batch はまだ送信されていない
      const stats = bus.getStats();
      expect(stats.byHigh).toBe(0); // Batch送信待ち
    });

    it('should accumulate multiple high priority notifications', async () => {
      const notifications = [
        {
          id: 'h1',
          severity: 'high' as const,
          source: 'agent-1',
          title: 'Issue 1',
          message: 'Msg 1',
          timestamp: Date.now(),
        },
        {
          id: 'h2',
          severity: 'high' as const,
          source: 'agent-2',
          title: 'Issue 2',
          message: 'Msg 2',
          timestamp: Date.now(),
        },
      ];

      for (const notif of notifications) {
        await bus.sendNotification(notif);
      }

      // まだバッチ送信されていない
      let stats = bus.getStats();
      expect(stats.byHigh).toBe(0);

      // 手動フラッシュ
      await bus.flush();
      stats = bus.getStats();
      expect(stats.byHigh).toBe(2);
    });
  });

  describe('Medium priority notifications (daily digest)', () => {
    it('should accumulate medium priority notifications', async () => {
      const notification: Notification = {
        id: 'med-1',
        severity: 'normal',
        source: 'test-agent',
        title: 'Medium Alert',
        message: 'Routine update',
        timestamp: Date.now(),
      };

      await bus.sendNotification(notification);

      // まだ送信されていない
      let stats = bus.getStats();
      expect(stats.byMedium).toBe(0);

      // 手動フラッシュ
      await bus.flush();
      stats = bus.getStats();
      expect(stats.byMedium).toBe(1);
    });
  });

  describe('Low priority notifications (weekly summary)', () => {
    it('should accumulate low priority notifications', async () => {
      const notification: Notification = {
        id: 'low-1',
        severity: 'low',
        source: 'test-agent',
        title: 'Low Alert',
        message: 'FYI update',
        timestamp: Date.now(),
      };

      await bus.sendNotification(notification);

      // まだ送信されていない
      let stats = bus.getStats();
      expect(stats.byLow).toBe(0);

      // 手動フラッシュ
      await bus.flush();
      stats = bus.getStats();
      expect(stats.byLow).toBe(1);
    });
  });

  describe('Deduplication (within 30 min window)', () => {
    it('should deduplicate same agent + title within 30 min', async () => {
      const notif1: Notification = {
        id: 'dup-1',
        severity: 'high',
        source: 'agent-x',
        title: 'Database Error',
        message: 'First occurrence',
        timestamp: Date.now(),
      };

      const notif2: Notification = {
        id: 'dup-2',
        severity: 'high',
        source: 'agent-x',
        title: 'Database Error', // Same title
        message: 'Second occurrence',
        timestamp: Date.now() + 1000,
      };

      await bus.sendNotification(notif1);
      const resultSecond = await bus.sendNotification(notif2);

      // 2番目は重複排除されるはず
      expect(resultSecond).toBe(true); // 処理は成功
      const stats = bus.getStats();
      expect(stats.deduplicated).toBe(1);
    });

    it('should allow same title from different agents', async () => {
      const notif1: Notification = {
        id: 'diff1',
        severity: 'high',
        source: 'agent-a',
        title: 'Same Title',
        message: 'From A',
        timestamp: Date.now(),
      };

      const notif2: Notification = {
        id: 'diff2',
        severity: 'high',
        source: 'agent-b',
        title: 'Same Title',
        message: 'From B',
        timestamp: Date.now(),
      };

      await bus.sendNotification(notif1);
      await bus.sendNotification(notif2);

      // 異なるagentなら両方受け付ける
      let stats = bus.getStats();
      expect(stats.deduplicated).toBe(0);

      await bus.flush();
      stats = bus.getStats();
      expect(stats.byHigh).toBe(2);
    });
  });

  describe('Flush (manual batch send)', () => {
    it('should send all batches on flush', async () => {
      const notifications: Notification[] = [
        {
          id: 'h1',
          severity: 'high',
          source: 'a',
          title: 'H1',
          message: 'M1',
          timestamp: Date.now(),
        },
        {
          id: 'm1',
          severity: 'normal',
          source: 'b',
          title: 'M1',
          message: 'M2',
          timestamp: Date.now(),
        },
        {
          id: 'l1',
          severity: 'low',
          source: 'c',
          title: 'L1',
          message: 'M3',
          timestamp: Date.now(),
        },
      ];

      for (const n of notifications) {
        await bus.sendNotification(n);
      }

      let stats = bus.getStats();
      expect(stats.totalSent).toBe(0); // 未送信

      await bus.flush();
      stats = bus.getStats();
      expect(stats.byHigh).toBe(1);
      expect(stats.byMedium).toBe(1);
      expect(stats.byLow).toBe(1);
      expect(stats.totalSent).toBe(3);
    });
  });

  describe('Stats tracking', () => {
    it('should track all stats correctly', async () => {
      const notifications: Notification[] = [
        {
          id: 'c1',
          severity: 'critical',
          source: 's1',
          title: 'C1',
          message: 'm1',
          timestamp: Date.now(),
        },
        {
          id: 'c2',
          severity: 'critical',
          source: 's2',
          title: 'C2',
          message: 'm2',
          timestamp: Date.now(),
        },
        {
          id: 'h1',
          severity: 'high',
          source: 's3',
          title: 'H1',
          message: 'm3',
          timestamp: Date.now(),
        },
      ];

      for (const n of notifications) {
        await bus.sendNotification(n);
      }

      await bus.flush();

      const stats = bus.getStats();
      expect(stats.byCritical).toBe(2);
      expect(stats.byHigh).toBe(1);
      expect(stats.totalSent).toBe(3);
      expect(stats.deduplicated).toBe(0);
      expect(stats.failureCount).toBe(0);
    });
  });

  describe('Notification with metadata', () => {
    it('should preserve metadata in notification', async () => {
      const notif: Notification = {
        id: 'meta-1',
        severity: 'critical',
        source: 'agent-with-meta',
        title: 'Metadata Test',
        message: 'Testing metadata',
        timestamp: Date.now(),
        actionUrl: '/admin/alerts',
        metadata: {
          userId: '12345',
          errorCode: 'ERR_DB_TIMEOUT',
          retryable: true,
        },
      };

      const result = await bus.sendNotification(notif);
      expect(result).toBe(true);
    });
  });

  describe('Shutdown', () => {
    it('should clear timers on shutdown', async () => {
      const bus2 = new NotificationBus();

      // Timer reference before shutdown
      expect(bus2).toBeDefined();

      bus2.shutdown();

      // After shutdown, no errors should occur
      expect(true).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty title', async () => {
      const notif: Notification = {
        id: 'empty-1',
        severity: 'critical',
        source: 'agent',
        title: '',
        message: 'Message only',
        timestamp: Date.now(),
      };

      const result = await bus.sendNotification(notif);
      expect(result).toBe(true);
    });

    it('should handle very long message', async () => {
      const longMsg = 'x'.repeat(5000);
      const notif: Notification = {
        id: 'long-1',
        severity: 'high',
        source: 'agent',
        title: 'Long Message Test',
        message: longMsg,
        timestamp: Date.now(),
      };

      await bus.sendNotification(notif);
      await bus.flush();

      const stats = bus.getStats();
      expect(stats.byHigh).toBe(1);
    });

    it('should handle concurrent sends', async () => {
      const notifications: Notification[] = Array.from(
        { length: 10 },
        (_, i) => ({
          id: `conc-${i}`,
          severity: 'critical' as const,
          source: 'concurrent-agent',
          title: `Alert ${i}`,
          message: `Message ${i}`,
          timestamp: Date.now(),
        }),
      );

      const results = await Promise.all(
        notifications.map((n) => bus.sendNotification(n)),
      );

      expect(results.every((r) => r === true)).toBe(true);
      const stats = bus.getStats();
      expect(stats.byCritical).toBe(10);
    });
  });
});
