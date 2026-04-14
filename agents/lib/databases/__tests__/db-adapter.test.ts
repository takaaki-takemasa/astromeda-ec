/**
 * DB Adapter テスト — 遺伝子コード検証（染色体異常の検出）
 *
 * Phase 0: 全14テーブルが正しく動作し、CRUD操作が型安全であることを検証
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { InMemoryStorage } from '../../../core/storage.js';
import {
  DB, getDB, resetDB,
  Repository,
  AgentConfigRepository,
  CronScheduleRepository,
  NotificationLogRepository,
  ShopifySyncLogRepository,
  AuditTrailRepository,
  SystemSettingsRepository,
} from '../db-adapter.js';
import { ALL_TABLES } from '../schema.js';

describe('Phase 0: DB基盤 — 受精卵→胚盤胞', () => {
  let storage: InMemoryStorage;
  let db: DB;

  beforeEach(() => {
    resetDB();
    storage = new InMemoryStorage(1000);
    db = new DB(storage);
  });

  // ─── スキーマ完全性テスト ───

  test('ALL_TABLES定数が15テーブルを含む', () => {
    const tableNames = Object.values(ALL_TABLES);
    expect(tableNames).toHaveLength(15);
    expect(tableNames).toContain('analytics_daily');
    expect(tableNames).toContain('agent_config');
    expect(tableNames).toContain('system_settings');
    expect(tableNames).toContain('notification_log');
    expect(tableNames).toContain('cron_schedule');
    expect(tableNames).toContain('shopify_sync_log');
    expect(tableNames).toContain('audit_trail');
  });

  // ─── AgentConfig（DNA配列） ───

  describe('AgentConfigRepository', () => {
    test('エージェント設定のCRUD', async () => {
      const id = await db.agentConfig.create({
        agentId: 'l2-seo-director',
        agentName: 'SEO Director',
        level: 'L2',
        team: 'marketing',
        enabled: true,
        aiTier: 'A',
      } as any);

      expect(id).toBeTruthy();

      const found = await db.agentConfig.findByAgentId('l2-seo-director');
      expect(found).toBeTruthy();
      expect(found!.agentName).toBe('SEO Director');
      expect(found!.level).toBe('L2');
      expect(found!.aiTier).toBe('A');
    });

    test('レベル別検索', async () => {
      await db.agentConfig.create({ agentId: 'commander', agentName: 'Commander', level: 'L0' } as any);
      await db.agentConfig.create({ agentId: 'product-lead', agentName: 'Product Lead', level: 'L1' } as any);
      await db.agentConfig.create({ agentId: 'seo-director', agentName: 'SEO Director', level: 'L2' } as any);
      await db.agentConfig.create({ agentId: 'content-writer', agentName: 'Content Writer', level: 'L2' } as any);

      const l2Agents = await db.agentConfig.findByLevel('L2');
      expect(l2Agents).toHaveLength(2);
    });

    test('有効なエージェントのみ取得', async () => {
      await db.agentConfig.create({ agentId: 'active-agent', agentName: 'Active', level: 'L2', enabled: true } as any);
      await db.agentConfig.create({ agentId: 'disabled-agent', agentName: 'Disabled', level: 'L2', enabled: false } as any);

      const enabled = await db.agentConfig.findEnabled();
      expect(enabled).toHaveLength(1);
      expect(enabled[0].agentId).toBe('active-agent');
    });

    test('設定更新', async () => {
      await db.agentConfig.create({
        agentId: 'test-agent',
        agentName: 'Test',
        level: 'L2',
        aiTier: 'B',
      } as any);

      await db.agentConfig.updateConfig('test-agent', { aiTier: 'A' } as any);

      const updated = await db.agentConfig.findByAgentId('test-agent');
      expect(updated!.aiTier).toBe('A');
    });
  });

  // ─── CronSchedule（松果体） ───

  describe('CronScheduleRepository', () => {
    test('スケジュール作成と期限検索', async () => {
      const pastDate = new Date(Date.now() - 60000);
      const futureDate = new Date(Date.now() + 3600000);

      await db.cronSchedule.create({
        scheduleId: 'sched-1',
        agentId: 'seo-director',
        cronExpression: '0 9 * * *',
        enabled: true,
        nextRunAt: pastDate,
      } as any);

      await db.cronSchedule.create({
        scheduleId: 'sched-2',
        agentId: 'analytics-agent',
        cronExpression: '0 6 * * *',
        enabled: true,
        nextRunAt: futureDate,
      } as any);

      const due = await db.cronSchedule.findDueSchedules();
      expect(due).toHaveLength(1);
      expect(due[0].scheduleId).toBe('sched-1');
    });

    test('実行記録の更新', async () => {
      await db.cronSchedule.create({
        scheduleId: 'sched-run-test',
        agentId: 'test-agent',
        cronExpression: '*/30 * * * *',
        enabled: true,
        consecutiveFailures: 0,
      } as any);

      await db.cronSchedule.recordRun(
        'sched-run-test',
        'success',
        1500,
        new Date(Date.now() + 1800000),
      );

      const updated = await db.cronSchedule.findOne({ scheduleId: 'sched-run-test' });
      expect(updated!.lastRunStatus).toBe('success');
      expect(updated!.lastRunDurationMs).toBe(1500);
      expect(updated!.consecutiveFailures).toBe(0);
    });

    test('連続失敗カウント', async () => {
      await db.cronSchedule.create({
        scheduleId: 'sched-fail-test',
        agentId: 'test-agent',
        cronExpression: '0 * * * *',
        enabled: true,
        consecutiveFailures: 2,
      } as any);

      await db.cronSchedule.recordRun(
        'sched-fail-test',
        'failure',
        500,
        new Date(Date.now() + 3600000),
      );

      const updated = await db.cronSchedule.findOne({ scheduleId: 'sched-fail-test' });
      expect(updated!.consecutiveFailures).toBe(3);
    });
  });

  // ─── NotificationLog（感覚神経） ───

  describe('NotificationLogRepository', () => {
    test('通知作成と未読検索', async () => {
      await db.notificationLog.create({
        notificationId: 'notif-1',
        channel: 'slack',
        priority: 'high',
        recipientId: 'admin-takemasa',
        body: 'Agent error detected',
        status: 'sent',
      } as any);

      await db.notificationLog.create({
        notificationId: 'notif-2',
        channel: 'email',
        priority: 'low',
        recipientId: 'admin-takemasa',
        body: 'Daily report ready',
        status: 'read',
      } as any);

      const unread = await db.notificationLog.findUnread('admin-takemasa');
      expect(unread).toHaveLength(1);
      expect(unread[0].notificationId).toBe('notif-1');
    });

    test('既読マーク', async () => {
      await db.notificationLog.create({
        notificationId: 'notif-read-test',
        channel: 'dashboard',
        body: 'Test notification',
        status: 'sent',
      } as any);

      await db.notificationLog.markRead('notif-read-test');

      const notification = await db.notificationLog.findOne({ notificationId: 'notif-read-test' });
      expect(notification!.status).toBe('read');
    });

    test('チャネル別検索', async () => {
      await db.notificationLog.create({ notificationId: 'n1', channel: 'slack', body: 'a', status: 'sent' } as any);
      await db.notificationLog.create({ notificationId: 'n2', channel: 'slack', body: 'b', status: 'sent' } as any);
      await db.notificationLog.create({ notificationId: 'n3', channel: 'email', body: 'c', status: 'sent' } as any);

      const slack = await db.notificationLog.findByChannel('slack');
      expect(slack).toHaveLength(2);
    });
  });

  // ─── ShopifySyncLog（臍帯） ───

  describe('ShopifySyncLogRepository', () => {
    test('同期ログ記録と検索', async () => {
      await db.shopifySyncLog.create({
        syncId: 'sync-1',
        direction: 'read',
        resourceType: 'product',
        operation: 'bulk_read',
        status: 'success',
        itemsProcessed: 731,
        durationMs: 3500,
      } as any);

      const productSyncs = await db.shopifySyncLog.findByResource('product');
      expect(productSyncs).toHaveLength(1);
      expect(productSyncs[0].itemsProcessed).toBe(731);
    });

    test('失敗ログ検索', async () => {
      await db.shopifySyncLog.create({
        syncId: 'sync-ok', direction: 'write', resourceType: 'product',
        operation: 'update', status: 'success',
      } as any);
      await db.shopifySyncLog.create({
        syncId: 'sync-fail', direction: 'write', resourceType: 'inventory',
        operation: 'update', status: 'failure',
        errorDetails: [{ message: 'Rate limited' }],
      } as any);

      const failures = await db.shopifySyncLog.findFailures();
      expect(failures).toHaveLength(1);
      expect(failures[0].syncId).toBe('sync-fail');
    });

    test('直近同期統計', async () => {
      await db.shopifySyncLog.create({
        syncId: 's1', direction: 'read', resourceType: 'product',
        operation: 'sync', status: 'success', durationMs: 1000,
      } as any);
      await db.shopifySyncLog.create({
        syncId: 's2', direction: 'write', resourceType: 'product',
        operation: 'update', status: 'success', durationMs: 2000,
      } as any);
      await db.shopifySyncLog.create({
        syncId: 's3', direction: 'write', resourceType: 'order',
        operation: 'sync', status: 'failure', durationMs: 500,
      } as any);

      const stats = await db.shopifySyncLog.getRecentSyncStats();
      expect(stats.total).toBe(3);
      expect(stats.success).toBe(2);
      expect(stats.failure).toBe(1);
    });
  });

  // ─── AuditTrail（免疫記憶） ───

  describe('AuditTrailRepository', () => {
    test('監査ログの自動記録', async () => {
      const id = await db.auditTrail.log({
        actorType: 'agent',
        actorId: 'seo-director',
        action: 'execute',
        targetType: 'content',
        targetId: 'blog-post-123',
        description: 'Generated SEO content for gaming PC page',
        riskLevel: 'low',
      });

      expect(id).toBeTruthy();

      const trail = await db.auditTrail.findById(id);
      expect(trail).toBeTruthy();
    });

    test('アクター別検索', async () => {
      await db.auditTrail.log({ actorType: 'agent', actorId: 'seo-director', action: 'execute', targetType: 'content', targetId: '1' });
      await db.auditTrail.log({ actorType: 'agent', actorId: 'seo-director', action: 'update', targetType: 'meta', targetId: '2' });
      await db.auditTrail.log({ actorType: 'admin', actorId: 'takemasa', action: 'approve', targetType: 'content', targetId: '1' });

      const seoTrail = await db.auditTrail.findByActor('agent', 'seo-director');
      expect(seoTrail).toHaveLength(2);
    });

    test('高リスク操作の検出', async () => {
      await db.auditTrail.log({ actorType: 'agent', actorId: 'a1', action: 'execute', targetType: 'content', targetId: '1', riskLevel: 'low' });
      await db.auditTrail.log({ actorType: 'agent', actorId: 'a2', action: 'delete', targetType: 'product', targetId: '2', riskLevel: 'critical' });
      await db.auditTrail.log({ actorType: 'system', actorId: 'cron', action: 'config_change', targetType: 'setting', targetId: '3', riskLevel: 'high' });

      const highRisk = await db.auditTrail.findHighRisk();
      expect(highRisk).toHaveLength(2);
    });
  });

  // ─── SystemSettings（視床下部） ───

  describe('SystemSettingsRepository', () => {
    test('設定値のget/set', async () => {
      await db.systemSettings.set(
        'notification.slack.enabled',
        true,
        'notification',
        'Slack通知の有効/無効',
        'admin-takemasa',
      );

      const value = await db.systemSettings.get('notification.slack.enabled');
      expect(value).toBe(true);
    });

    test('カテゴリ別設定一覧', async () => {
      await db.systemSettings.set('ai.default_tier', 'B', 'ai');
      await db.systemSettings.set('ai.max_tokens', 4096, 'ai');
      await db.systemSettings.set('security.rate_limit', 30, 'security');

      const aiSettings = await db.systemSettings.getByCategory('ai');
      expect(aiSettings).toHaveLength(2);
    });

    test('設定の上書き', async () => {
      await db.systemSettings.set('test.key', 'old', 'general');
      await db.systemSettings.set('test.key', 'new', 'general');

      const value = await db.systemSettings.get('test.key');
      expect(value).toBe('new');
    });
  });

  // ─── 汎用Repository（既存テーブル） ───

  describe('汎用Repository', () => {
    test('Agent Health Log のCRUD', async () => {
      await db.agentHealthLog.create({
        agentId: 'commander',
        status: 'healthy',
        errorCount: 0,
        memoryUsage: 50000,
        taskQueue: 3,
      } as any);

      const count = await db.agentHealthLog.count();
      expect(count).toBe(1);
    });

    test('Pipeline Execution Log のCRUD', async () => {
      await db.pipelineExecutionLog.create({
        executionId: 'exec-001',
        pipelineId: 'P01',
        pipelineName: 'Daily SEO Report',
        status: 'completed',
        totalSteps: 5,
        currentStep: 5,
      } as any);

      const logs = await db.pipelineExecutionLog.findMany();
      expect(logs).toHaveLength(1);
    });
  });

  // ─── シングルトン・ライフサイクル ───

  describe('DB シングルトン', () => {
    test('getDB()でインスタンスを取得', () => {
      resetDB();
      const db1 = getDB(storage);
      const db2 = getDB();
      expect(db1).toBe(db2);
    });

    test('resetDB()でインスタンスをクリア', () => {
      const db1 = getDB(storage);
      resetDB();
      const db2 = getDB(storage);
      expect(db1).not.toBe(db2);
    });
  });

  // ─── パージ・データ保全 ───

  describe('データライフサイクル', () => {
    test('古いレコードのパージ', async () => {
      // 古いレコード
      const oldRecord = {
        id: 'old-1',
        agentId: 'test',
        status: 'healthy',
        createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000, // 90日前
        updatedAt: Date.now(),
      };
      await storage.put(ALL_TABLES.AGENT_HEALTH_LOG, oldRecord);

      // 新しいレコード
      await db.agentHealthLog.create({
        agentId: 'test',
        status: 'healthy',
      } as any);

      const countBefore = await db.agentHealthLog.count();
      expect(countBefore).toBe(2);

      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const purged = await db.agentHealthLog.purge(thirtyDaysAgo);
      expect(purged).toBe(1);

      const countAfter = await db.agentHealthLog.count();
      expect(countAfter).toBe(1);
    });
  });
});
