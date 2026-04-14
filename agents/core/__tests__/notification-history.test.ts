/**
 * NotificationHistory Test Suite (T063)
 * Tests persistence, filtering, and retrieval of notifications.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotificationHistory,
  getNotificationHistory,
  resetNotificationHistory,
} from '../notification-history.js';
import type { NotificationRecord } from '../notification-history.js';
import { InMemoryStorage } from '../storage.js';

function makeRecord(overrides: Partial<NotificationRecord> = {}): Omit<NotificationRecord, 'id'> {
  return {
    channel: 'slack',
    priority: 'normal',
    source: 'test-agent',
    subject: 'Test Subject',
    body: 'Test body',
    sentAt: Date.now(),
    status: 'sent',
    ...overrides,
  };
}

describe('NotificationHistory', () => {
  let history: NotificationHistory;
  let storage: InMemoryStorage;

  beforeEach(() => {
    resetNotificationHistory();
    storage = new InMemoryStorage();
    history = new NotificationHistory(storage);
  });

  describe('save', () => {
    it('should save a notification and return an ID', async () => {
      const record = makeRecord();
      const id = await history.save(record);

      expect(id).toBeDefined();
      expect(id).toMatch(/^notif_/);
    });

    it('should persist multiple notifications', async () => {
      const id1 = await history.save(makeRecord({ subject: 'Notification 1' }));
      const id2 = await history.save(makeRecord({ subject: 'Notification 2' }));

      expect(id1).not.toBe(id2);
      const all = await history.getAll();
      expect(all.length).toBe(2);
    });
  });

  describe('getAll', () => {
    it('should return all notifications', async () => {
      await history.save(makeRecord({ subject: 'Notif 1' }));
      await history.save(makeRecord({ subject: 'Notif 2' }));

      const all = await history.getAll();
      expect(all.length).toBe(2);
    });

    it('should return empty array when no notifications exist', async () => {
      const all = await history.getAll();
      expect(all).toEqual([]);
    });
  });

  describe('getRecent', () => {
    it('should return recent notifications', async () => {
      await history.save(makeRecord({ subject: 'First' }));
      await new Promise((r) => setTimeout(r, 10)); // Small delay
      await history.save(makeRecord({ subject: 'Second' }));

      const recent = await history.getRecent(10);
      expect(recent.length).toBe(2);
      // getRecent returns in reverse chronological order
      const subjects = recent.map(r => r.subject);
      expect(subjects).toContain('First');
      expect(subjects).toContain('Second');
    });

    it('should respect limit parameter', async () => {
      await history.save(makeRecord());
      await history.save(makeRecord());
      await history.save(makeRecord());

      const recent = await history.getRecent(2);
      expect(recent.length).toBe(2);
    });
  });

  describe('getUnread', () => {
    it('should return only unread notifications', async () => {
      const id1 = await history.save(makeRecord({ status: 'sent' }));
      const id2 = await history.save(makeRecord({ status: 'sent' }));

      await history.markAsRead(id1);

      const unread = await history.getUnread();
      expect(unread.length).toBe(1);
      expect(unread[0].id).toBe(id2);
    });
  });

  describe('getByPriority', () => {
    it('should filter notifications by priority', async () => {
      await history.save(makeRecord({ priority: 'critical' }));
      await history.save(makeRecord({ priority: 'high' }));
      await history.save(makeRecord({ priority: 'normal' }));

      const criticals = await history.getByPriority('critical');
      expect(criticals.length).toBe(1);
      expect(criticals[0].priority).toBe('critical');
    });
  });

  describe('getByChannel', () => {
    it('should filter notifications by channel', async () => {
      await history.save(makeRecord({ channel: 'slack' }));
      await history.save(makeRecord({ channel: 'email' }));
      await history.save(makeRecord({ channel: 'slack' }));

      const slackNotifs = await history.getByChannel('slack');
      expect(slackNotifs.length).toBe(2);
      expect(slackNotifs.every((n) => n.channel === 'slack')).toBe(true);
    });
  });

  describe('getInRange', () => {
    it('should return notifications in a time range', async () => {
      const now = Date.now();
      const pastTime = now - 60000; // 1 minute ago
      const futureTime = now + 60000; // 1 minute from now

      await history.save(makeRecord({ sentAt: pastTime + 10000 }));
      await history.save(makeRecord({ sentAt: now }));

      const inRange = await history.getInRange(pastTime, futureTime);
      expect(inRange.length).toBe(2);
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read', async () => {
      const id = await history.save(makeRecord({ status: 'sent' }));

      const result = await history.markAsRead(id);
      expect(result).toBe(true);

      const all = await history.getAll();
      expect(all[0].status).toBe('read');
    });

    it('should return false for non-existent IDs', async () => {
      const result = await history.markAsRead('nonexistent_id');
      expect(result).toBe(false);
    });
  });

  describe('markMultipleAsRead', () => {
    it('should mark multiple notifications as read', async () => {
      const id1 = await history.save(makeRecord());
      const id2 = await history.save(makeRecord());
      const id3 = await history.save(makeRecord());

      const updated = await history.markMultipleAsRead([id1, id2]);
      expect(updated).toBe(2);

      const all = await history.getAll();
      const record1 = all.find(r => r.id === id1);
      const record2 = all.find(r => r.id === id2);
      const record3 = all.find(r => r.id === id3);

      expect(record1?.status).toBe('read');
      expect(record2?.status).toBe('read');
      expect(record3?.status).toBe('sent');
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      await history.save(makeRecord({ priority: 'critical', channel: 'slack' }));
      await history.save(makeRecord({ priority: 'high', channel: 'email' }));
      await history.save(makeRecord({ priority: 'normal', channel: 'dashboard' }));

      const stats = await history.getStats();
      expect(stats.total).toBe(3);
      expect(stats.unread).toBe(3);
      expect(stats.bySeverity.critical).toBe(1);
      expect(stats.bySeverity.high).toBe(1);
      expect(stats.bySeverity.normal).toBe(1);
      expect(stats.byChannel.slack).toBe(1);
      expect(stats.byChannel.email).toBe(1);
      expect(stats.byChannel.dashboard).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('should remove old notifications', async () => {
      const oldTime = Date.now() - 35 * 24 * 60 * 60 * 1000; // 35 days ago
      const recentTime = Date.now() - 5 * 24 * 60 * 60 * 1000; // 5 days ago

      await history.save(makeRecord({ sentAt: oldTime }));
      await history.save(makeRecord({ sentAt: recentTime }));

      const removed = await history.cleanup(30);
      expect(removed).toBe(1);

      const all = await history.getAll();
      expect(all.length).toBe(1);
      expect(all[0].sentAt).toBe(recentTime);
    });
  });

  describe('clear', () => {
    it('should delete all notifications', async () => {
      await history.save(makeRecord());
      await history.save(makeRecord());

      await history.clear();
      const all = await history.getAll();
      expect(all.length).toBe(0);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const h1 = getNotificationHistory();
      const h2 = getNotificationHistory();
      expect(h1).toBe(h2);
    });
  });
});
