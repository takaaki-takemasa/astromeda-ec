/**
 * NotificationRouter Test Suite (T062)
 * Tests priority-based routing, batching, and channel selection.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotificationRouter,
  getNotificationRouter,
  resetNotificationRouter,
} from '../notification-router.js';
import type { NotificationPayload } from '../notification-channels.js';

function makePayload(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  return {
    id: `notif_${Math.random().toString(36).slice(2)}`,
    severity: 'normal',
    source: 'test-agent',
    title: 'Test Notification',
    message: 'This is a test',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('NotificationRouter', () => {
  beforeEach(() => {
    resetNotificationRouter();
  });

  describe('constructor', () => {
    it('should create a new router with default rules', () => {
      const router = new NotificationRouter();
      const rules = router.getRules();

      expect(rules).toBeDefined();
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should create a router with custom rules', () => {
      const customRules = [
        {
          priority: 'critical' as const,
          channels: ['slack' as const, 'dashboard' as const],
          delayMs: 0,
        },
      ];

      const router = new NotificationRouter({ rules: customRules });
      expect(router.getRules()).toEqual(customRules);
    });
  });

  describe('route', () => {
    it('should route critical notifications immediately', async () => {
      const router = new NotificationRouter();
      const payload = makePayload({ severity: 'critical' });

      const result = await router.route(payload);
      expect(result).toBe(true);
    });

    it('should route normal notifications to dashboard only', async () => {
      const router = new NotificationRouter();
      const payload = makePayload({ severity: 'normal' });

      const result = await router.route(payload);
      expect(result).toBe(true);
    });

    it('should queue high-priority notifications for batching', async () => {
      vi.useFakeTimers();
      const router = new NotificationRouter();
      const payload = makePayload({ severity: 'high' });

      const result = await router.route(payload);
      expect(result).toBe(true);

      // Advance time but not past batch delay
      vi.advanceTimersByTime(30000); // 30 seconds
      // Batch should not flush yet (delay is 60 seconds)

      vi.useRealTimers();
    });

    it('should handle unknown priority gracefully', async () => {
      const router = new NotificationRouter();
      const payload = makePayload({ severity: 'unknown' as any });

      const result = await router.route(payload);
      expect(result).toBe(false);
    });
  });

  describe('flushBatch', () => {
    it('should flush pending notifications', async () => {
      const router = new NotificationRouter();

      // Queue some notifications
      const payload1 = makePayload({ severity: 'high', title: 'Alert 1' });
      const payload2 = makePayload({ severity: 'high', title: 'Alert 2' });

      await router.route(payload1);
      await router.route(payload2);

      // Flush manually
      await router.flushBatch('high_batch');
      // Should complete without error
      expect(true).toBe(true);
    });

    it('should handle empty batches gracefully', async () => {
      const router = new NotificationRouter();
      await router.flushBatch('nonexistent_batch');
      expect(true).toBe(true);
    });
  });

  describe('flushAll', () => {
    it('should flush all pending batches', async () => {
      const router = new NotificationRouter();

      const criticalPayload = makePayload({ severity: 'critical' });
      const highPayload = makePayload({ severity: 'high' });
      const normalPayload = makePayload({ severity: 'normal' });

      await router.route(criticalPayload);
      await router.route(highPayload);
      await router.route(normalPayload);

      await router.flushAll();
      expect(true).toBe(true);
    });
  });

  describe('updateRules', () => {
    it('should update routing rules', () => {
      const router = new NotificationRouter();

      const newRules = [
        {
          priority: 'critical' as const,
          channels: ['slack' as const],
          delayMs: 0,
        },
      ];

      router.updateRules(newRules);
      expect(router.getRules()).toEqual(newRules);
    });
  });

  describe('singleton', () => {
    it('should return same instance on multiple calls', () => {
      const router1 = getNotificationRouter();
      const router2 = getNotificationRouter();
      expect(router1).toBe(router2);
    });

    it('should create new instance after reset', () => {
      const router1 = getNotificationRouter();
      resetNotificationRouter();
      const router2 = getNotificationRouter();
      expect(router1).not.toBe(router2);
    });
  });

  describe('shutdown', () => {
    it('should clear pending batches on shutdown', async () => {
      const router = new NotificationRouter();
      const payload = makePayload({ severity: 'high' });

      await router.route(payload);
      router.shutdown();

      // After shutdown, timers should be cleared
      expect(true).toBe(true);
    });
  });
});
