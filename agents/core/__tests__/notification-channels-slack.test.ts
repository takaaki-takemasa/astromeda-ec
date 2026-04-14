/**
 * Slack Notification Channel Test Suite
 *
 * Tests the Slack channel sender for severity-based routing,
 * payload formatting, and fallback behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackChannelSender } from '../notification-channels.js';
import type { NotificationPayload, DeliveryResult } from '../notification-channels.js';

// Mock fetch for testing
global.fetch = vi.fn();

function makePayload(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  return {
    id: `notif_${Math.random().toString(36).slice(2)}`,
    severity: 'normal',
    source: 'test-agent',
    title: 'Test Alert',
    message: 'This is a test alert message',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('SlackChannelSender', () => {
  let sender: SlackChannelSender;
  const webhookUrl = 'https://hooks.slack.com/services/TEST/WEBHOOK/URL';

  beforeEach(() => {
    vi.clearAllMocks();
    sender = new SlackChannelSender(webhookUrl);
  });

  describe('constructor and availability', () => {
    it('should create instance with webhook URL', () => {
      expect(sender).toBeDefined();
      expect(sender.channel).toBe('slack');
    });

    it('should be available when webhook URL is provided', () => {
      expect(sender.isAvailable()).toBe(true);
    });

    it('should not be available without webhook URL', () => {
      const emptySender = new SlackChannelSender();
      expect(emptySender.isAvailable()).toBe(false);
    });

    it('should not be available when webhook URL is undefined', () => {
      const emptySender = new SlackChannelSender(undefined);
      expect(emptySender.isAvailable()).toBe(false);
    });
  });

  describe('severity-based channel routing', () => {
    it('should route critical severity to #astromeda-critical', async () => {
      const payload = makePayload({ severity: 'critical' });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await sender.send(payload);

      expect(fetch).toHaveBeenCalledWith(webhookUrl, expect.any(Object));
      const call = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      expect(body.channel).toBe('#astromeda-critical');
    });

    it('should route high severity to #astromeda-alerts', async () => {
      const payload = makePayload({ severity: 'high' });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await sender.send(payload);

      const call = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      expect(body.channel).toBe('#astromeda-alerts');
    });

    it('should route normal severity to #astromeda-daily', async () => {
      const payload = makePayload({ severity: 'normal' });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await sender.send(payload);

      const call = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      expect(body.channel).toBe('#astromeda-daily');
    });

    it('should route low severity to #astromeda-weekly', async () => {
      const payload = makePayload({ severity: 'low' });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await sender.send(payload);

      const call = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      expect(body.channel).toBe('#astromeda-weekly');
    });
  });

  describe('payload formatting', () => {
    it('should format message with severity prefix and title', async () => {
      const payload = makePayload({
        severity: 'high',
        title: 'Database Connection Failed',
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await sender.send(payload);

      const call = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      expect(body.text).toBe('[HIGH] Database Connection Failed');
    });

    it('should include header, section, and context blocks', async () => {
      const payload = makePayload({
        severity: 'normal',
        title: 'Test Title',
        message: 'Test message content',
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await sender.send(payload);

      const call = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      expect(body.blocks).toBeDefined();
      expect(body.blocks.length).toBeGreaterThanOrEqual(3);

      const blockTypes = body.blocks.map((b: any) => b.type);
      expect(blockTypes).toContain('header');
      expect(blockTypes).toContain('section');
      expect(blockTypes).toContain('context');
    });

    it('should include action button when actionUrl provided', async () => {
      const payload = makePayload({
        severity: 'critical',
        actionUrl: 'https://example.com/incident/123',
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await sender.send(payload);

      const call = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      const actionBlock = body.blocks.find((b: any) => b.type === 'actions');
      expect(actionBlock).toBeDefined();
      expect(actionBlock?.elements[0].url).toBe('https://example.com/incident/123');
    });

    it('should not include action button when actionUrl is missing', async () => {
      const payload = makePayload({
        severity: 'normal',
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await sender.send(payload);

      const call = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      const actionBlock = body.blocks.find((b: any) => b.type === 'actions');
      expect(actionBlock).toBeUndefined();
    });

    it('should include source and timestamp in context', async () => {
      const timestamp = Date.now();
      const payload = makePayload({
        severity: 'high',
        source: 'health-monitor',
        timestamp,
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await sender.send(payload);

      const call = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      const contextBlock = body.blocks.find((b: any) => b.type === 'context');
      expect(contextBlock).toBeDefined();
      expect(contextBlock?.elements[0].text).toContain('health-monitor');
    });
  });

  describe('HTTP response handling', () => {
    it('should return success result when response is ok', async () => {
      const payload = makePayload();

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const result = await sender.send(payload);

      expect(result).toEqual({
        channel: 'slack',
        success: true,
        sentAt: expect.any(Number),
      });
    });

    it('should return retryable error on 5xx status', async () => {
      const payload = makePayload();

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 503,
      } as Response);

      const result = await sender.send(payload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('503');
      expect(result.retryable).toBe(true);
    });

    it('should return non-retryable error on 4xx status', async () => {
      const payload = makePayload();

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      const result = await sender.send(payload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('401');
      expect(result.retryable).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should return error result when fetch throws', async () => {
      const payload = makePayload();
      const error = new Error('Network timeout');

      vi.mocked(fetch).mockRejectedValueOnce(error);

      const result = await sender.send(payload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network timeout');
      expect(result.retryable).toBe(true);
    });

    it('should return retryable error on network failure', async () => {
      const payload = makePayload();

      vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await sender.send(payload);

      expect(result.retryable).toBe(true);
    });

    it('should return error when webhook not configured', async () => {
      const emptySender = new SlackChannelSender();
      const payload = makePayload();

      const result = await emptySender.send(payload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
      expect(result.retryable).toBe(false);
    });
  });

  describe('missing SLACK_WEBHOOK_URL handling', () => {
    it('should handle gracefully without webhook URL', async () => {
      const sender = new SlackChannelSender();
      const payload = makePayload();

      const result = await sender.send(payload);

      expect(result.channel).toBe('slack');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Webhook URL not configured');
      expect(result.retryable).toBe(false);
    });

    it('should indicate unavailable when webhook not set', () => {
      const sender = new SlackChannelSender();
      expect(sender.isAvailable()).toBe(false);
    });
  });

  describe('fallback chain specification', () => {
    it('should support fallback: Slack → Email → Webhook → Dashboard', () => {
      // This test documents the expected fallback behavior
      // In a real scenario, a NotificationBus would orchestrate these
      const slackSender = new SlackChannelSender();
      const canUseFallback = !slackSender.isAvailable();

      expect(canUseFallback).toBe(true); // No webhook, so fallback chain should trigger
    });
  });

  describe('content headers and encoding', () => {
    it('should set correct content-type header', async () => {
      const payload = makePayload();

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await sender.send(payload);

      const call = vi.mocked(fetch).mock.calls[0];
      const headers = call[1]?.headers as Record<string, string>;

      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should use POST method', async () => {
      const payload = makePayload();

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      await sender.send(payload);

      const call = vi.mocked(fetch).mock.calls[0];
      expect(call[1]?.method).toBe('POST');
    });
  });

  describe('integration scenarios', () => {
    it('should send critical alert with all components', async () => {
      const payload = makePayload({
        severity: 'critical',
        source: 'database-monitor',
        title: 'Database Replication Failed',
        message: 'Primary database replication lag exceeded 5 minutes',
        actionUrl: 'https://admin.example.com/db/status',
        metadata: { lag_seconds: 305 },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const result = await sender.send(payload);

      expect(result.success).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);

      const call = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      expect(body.channel).toBe('#astromeda-critical');
      expect(body.text).toContain('CRITICAL');
      expect(body.blocks.length).toBe(4); // header, section, context, actions
    });
  });
});
