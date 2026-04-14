/**
 * Phase 1 テスト: 胚盤胞（コア基盤強化）
 *
 * 通知多チャネル化・Cron式パーサー・チャネルオーケストレータの検証
 * 医学メタファー: 胚盤胞が子宮壁に着床し、栄養吸収回路が確立される段階
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
  parseCronExpression,
  getNextRunTime,
  getSecondsUntilNextRun,
  validateCronExpression,
  describeCronExpression,
} from '../cron-parser.js';
import {
  ChannelOrchestrator,
  DashboardChannelSender,
  SlackChannelSender,
  EmailChannelSender,
  WebhookChannelSender,
  resetChannelOrchestrator,
} from '../notification-channels.js';
import type { NotificationPayload, IChannelSender, DeliveryResult } from '../notification-channels.js';

// ─── CronParser テスト ───

describe('CronParser — 松果体リズム解析', () => {
  test('基本的なCron式パース: 毎日9時', () => {
    const fields = parseCronExpression('0 9 * * *');
    expect(fields.minutes).toEqual([0]);
    expect(fields.hours).toEqual([9]);
    expect(fields.daysOfMonth).toHaveLength(31);
    expect(fields.months).toHaveLength(12);
    expect(fields.daysOfWeek).toHaveLength(7);
  });

  test('ステップ式: */5 = 5分ごと', () => {
    const fields = parseCronExpression('*/5 * * * *');
    expect(fields.minutes).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  });

  test('範囲式: 月-金（1-5）', () => {
    const fields = parseCronExpression('0 9 * * 1-5');
    expect(fields.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  test('リスト式: 1,15日', () => {
    const fields = parseCronExpression('0 0 1,15 * *');
    expect(fields.daysOfMonth).toEqual([1, 15]);
  });

  test('複合式: 毎時30分、平日のみ', () => {
    const fields = parseCronExpression('30 * * * 1-5');
    expect(fields.minutes).toEqual([30]);
    expect(fields.hours).toHaveLength(24);
    expect(fields.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  test('曜日7は0（日曜日）に正規化', () => {
    const fields = parseCronExpression('0 0 * * 7');
    expect(fields.daysOfWeek).toContain(0);
    expect(fields.daysOfWeek).not.toContain(7);
  });

  test('無効なCron式でエラー', () => {
    expect(() => parseCronExpression('invalid')).toThrow();
    expect(() => parseCronExpression('60 * * * *')).toThrow();
    expect(() => parseCronExpression('* 25 * * *')).toThrow();
  });

  test('次回実行時刻の計算', () => {
    // 2026-04-10 15:00:00 から毎時0分の次回
    const from = new Date(2026, 3, 10, 15, 0, 0);
    const next = getNextRunTime('0 * * * *', from);
    expect(next.getHours()).toBe(16);
    expect(next.getMinutes()).toBe(0);
  });

  test('次回実行時刻: 翌日への繰り越し', () => {
    const from = new Date(2026, 3, 10, 23, 30, 0);
    const next = getNextRunTime('0 9 * * *', from);
    expect(next.getDate()).toBe(11);
    expect(next.getHours()).toBe(9);
  });

  test('次回実行までの秒数', () => {
    const from = new Date(2026, 3, 10, 8, 55, 0);
    const seconds = getSecondsUntilNextRun('0 9 * * *', from);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(300); // 5分以内
  });

  test('バリデーション: 有効', () => {
    expect(validateCronExpression('0 9 * * *')).toBeNull();
    expect(validateCronExpression('*/5 * * * 1-5')).toBeNull();
  });

  test('バリデーション: 無効', () => {
    expect(validateCronExpression('invalid')).not.toBeNull();
    expect(validateCronExpression('')).not.toBeNull();
  });

  test('人間可読な説明', () => {
    const desc = describeCronExpression('0 9 * * 1-5');
    expect(desc).toContain('0分');
    expect(desc).toContain('9時');
    expect(desc).toContain('月');
    expect(desc).toContain('金');
  });
});

// ─── NotificationChannels テスト ───

describe('NotificationChannels — 感覚神経系の多チャネル配信', () => {
  // Mock チャネル送信者
  class MockSender implements IChannelSender {
    readonly channel;
    private shouldFail: boolean;
    sent: NotificationPayload[] = [];

    constructor(channel: 'slack' | 'email' | 'webhook' | 'dashboard' | 'sms', shouldFail = false) {
      this.channel = channel;
      this.shouldFail = shouldFail;
    }

    isAvailable(): boolean { return true; }

    async send(payload: NotificationPayload): Promise<DeliveryResult> {
      if (this.shouldFail) {
        return { channel: this.channel, success: false, error: 'Mock failure', retryable: true };
      }
      this.sent.push(payload);
      return { channel: this.channel, success: true, sentAt: Date.now() };
    }
  }

  const testPayload: NotificationPayload = {
    id: 'test-notif-1',
    severity: 'critical',
    source: 'seo-director',
    title: 'SEO Alert',
    message: 'Ranking dropped for gaming PC keywords',
    timestamp: Date.now(),
  };

  beforeEach(() => {
    resetChannelOrchestrator();
  });

  test('DashboardChannelSender は常にキューに蓄積', async () => {
    const dashboard = new DashboardChannelSender();
    expect(dashboard.isAvailable()).toBe(true);

    const result = await dashboard.send(testPayload);
    expect(result.success).toBe(true);
    expect(result.channel).toBe('dashboard');

    const drained = dashboard.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0].title).toBe('SEO Alert');
  });

  test('DashboardChannelSender のキュー上限', async () => {
    const dashboard = new DashboardChannelSender();
    for (let i = 0; i < 600; i++) {
      await dashboard.send({ ...testPayload, id: `notif-${i}` });
    }
    expect(dashboard.getQueueSize()).toBe(500);
  });

  test('SlackChannelSender: webhookURL未設定→失敗', async () => {
    const slack = new SlackChannelSender(); // URL なし
    expect(slack.isAvailable()).toBe(false);
    const result = await slack.send(testPayload);
    expect(result.success).toBe(false);
    expect(result.retryable).toBe(false);
  });

  test('EmailChannelSender: 設定未完→失敗', async () => {
    const email = new EmailChannelSender(); // apiKey なし
    expect(email.isAvailable()).toBe(false);
    const result = await email.send(testPayload);
    expect(result.success).toBe(false);
  });

  // ─── ChannelOrchestrator テスト ───

  describe('ChannelOrchestrator — フォールバック配信', () => {
    test('正常配信: Slack→Dashboard両方に送信', async () => {
      const orchestrator = new ChannelOrchestrator({
        fallbackOrder: ['slack', 'dashboard'],
        channels: {
          slack: { enabled: true, priority: ['critical', 'high', 'normal', 'low'] },
          dashboard: { enabled: true, priority: ['critical', 'high', 'normal', 'low'] },
        },
      });

      const mockSlack = new MockSender('slack');
      const mockDashboard = new MockSender('dashboard');
      orchestrator.registerSender(mockSlack);
      orchestrator.registerSender(mockDashboard);

      const results = await orchestrator.deliver(testPayload);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.channel === 'slack' && r.success)).toBe(true);
      expect(mockSlack.sent).toHaveLength(1);
    });

    test('フォールバック: Slack失敗→Email成功', async () => {
      const orchestrator = new ChannelOrchestrator({
        fallbackOrder: ['slack', 'email', 'dashboard'],
        channels: {
          slack: { enabled: true, priority: ['critical'] },
          email: { enabled: true, priority: ['critical'] },
          dashboard: { enabled: true, priority: ['critical'] },
        },
      });

      const failSlack = new MockSender('slack', true); // 失敗
      const mockEmail = new MockSender('email');
      const mockDashboard = new MockSender('dashboard');
      orchestrator.registerSender(failSlack);
      orchestrator.registerSender(mockEmail);
      orchestrator.registerSender(mockDashboard);

      const results = await orchestrator.deliver(testPayload);
      expect(results.some(r => r.channel === 'slack' && !r.success)).toBe(true);
      expect(results.some(r => r.channel === 'email' && r.success)).toBe(true);
      expect(mockEmail.sent).toHaveLength(1);
    });

    test('全チャネル失敗→Dashboardにフォールバック', async () => {
      const orchestrator = new ChannelOrchestrator({
        fallbackOrder: ['slack', 'email', 'dashboard'],
        channels: {
          slack: { enabled: true, priority: ['critical'] },
          email: { enabled: true, priority: ['critical'] },
          dashboard: { enabled: true, priority: ['critical'] },
        },
      });

      const failSlack = new MockSender('slack', true);
      const failEmail = new MockSender('email', true);
      const mockDashboard = new MockSender('dashboard');
      orchestrator.registerSender(failSlack);
      orchestrator.registerSender(failEmail);
      orchestrator.registerSender(mockDashboard);

      const results = await orchestrator.deliver(testPayload);
      // Dashboardは常に最終的に配信される
      expect(results.some(r => r.channel === 'dashboard' && r.success)).toBe(true);
    });

    test('重要度フィルタ: low通知はSlackのみ配信（emailは対象外）', async () => {
      const orchestrator = new ChannelOrchestrator({
        fallbackOrder: ['slack', 'email', 'dashboard'],
        channels: {
          slack: { enabled: true, priority: ['critical', 'high', 'normal', 'low'] },
          email: { enabled: true, priority: ['critical', 'high'] }, // lowは対象外
          dashboard: { enabled: true, priority: ['critical', 'high', 'normal', 'low'] },
        },
      });

      const mockSlack = new MockSender('slack');
      const mockEmail = new MockSender('email');
      const mockDashboard = new MockSender('dashboard');
      orchestrator.registerSender(mockSlack);
      orchestrator.registerSender(mockEmail);
      orchestrator.registerSender(mockDashboard);

      const lowPayload = { ...testPayload, severity: 'low' as const };
      const results = await orchestrator.deliver(lowPayload);

      expect(mockSlack.sent).toHaveLength(1);
      expect(mockEmail.sent).toHaveLength(0); // emailには送信されない
    });

    test('チャネル状態一覧', () => {
      const orchestrator = new ChannelOrchestrator({
        channels: {
          slack: { enabled: true, priority: ['critical'] },
          email: { enabled: false, priority: [] },
          dashboard: { enabled: true, priority: ['critical'] },
        },
      });

      orchestrator.registerSender(new MockSender('slack'));
      orchestrator.registerSender(new MockSender('dashboard'));

      const status = orchestrator.getChannelStatus();
      expect(status.slack.enabled).toBe(true);
      expect(status.slack.available).toBe(true);
      expect(status.email.enabled).toBe(false);
      expect(status.dashboard.enabled).toBe(true);
    });

    test('Dashboardキューのドレイン', async () => {
      const orchestrator = new ChannelOrchestrator({
        fallbackOrder: ['dashboard'],
        channels: { dashboard: { enabled: true, priority: ['critical', 'high', 'normal', 'low'] } },
      });

      const dashboardSender = new DashboardChannelSender();
      orchestrator.registerSender(dashboardSender);

      await orchestrator.deliver(testPayload);
      await orchestrator.deliver({ ...testPayload, id: 'test-2', title: 'Alert 2' });

      const drained = orchestrator.drainDashboardQueue();
      expect(drained).toHaveLength(2);

      const drainedAgain = orchestrator.drainDashboardQueue();
      expect(drainedAgain).toHaveLength(0);
    });
  });
});
