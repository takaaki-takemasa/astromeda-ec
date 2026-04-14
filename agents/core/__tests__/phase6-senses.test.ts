/**
 * Phase 6 テスト: 感覚器（管理画面実データ供給）
 *
 * AdminDataConnectorが正しくDBからデータを集約し、
 * 管理画面が必要とする形式で返すことを検証
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { InMemoryStorage } from '../storage.js';
import { setStorage, TABLES } from '../storage.js';
import { getDB, resetDB, DB } from '../../lib/databases/db-adapter.js';
import { hydrateAgentData } from '../agent-data-hydrator.js';
import { getAdminDashboardData } from '../admin-data-connector.js';

describe('Phase 6: 感覚器 — 管理画面実データ供給', () => {
  let storage: InMemoryStorage;

  beforeEach(async () => {
    resetDB();
    storage = new InMemoryStorage(10000);
    setStorage(storage);
    // Phase 4のhydrationを実行
    await hydrateAgentData();
  });

  test('ダッシュボードデータの全フィールドが取得できる', async () => {
    const data = await getAdminDashboardData();

    expect(data.timestamp).toBeGreaterThan(0);
    expect(data.system).toBeTruthy();
    expect(data.agents).toBeTruthy();
    expect(data.pipelines).toBeTruthy();
    expect(data.notifications).toBeTruthy();
    expect(data.schedules).toBeTruthy();
    expect(data.shopifySync).toBeTruthy();
    expect(data.auditTrail).toBeTruthy();
  });

  test('システム概要: バージョン・フェーズ・ANDON', async () => {
    const data = await getAdminDashboardData();

    expect(data.system.version).toBe('2.0.0');
    expect(data.system.phase).toContain('Phase2');
    expect(['green', 'yellow', 'red']).toContain(data.system.andonStatus);
    expect(data.system.totalAgents).toBeGreaterThanOrEqual(26);
    expect(data.system.activeAgents).toBeGreaterThanOrEqual(26);
  });

  test('エージェント一覧: 全47体+メタデータ', async () => {
    const data = await getAdminDashboardData();

    expect(data.agents.length).toBeGreaterThanOrEqual(26);

    // L0 Commander存在確認
    const commander = data.agents.find(a => a.agentId === 'commander');
    expect(commander).toBeTruthy();
    expect(commander!.level).toBe('L0');
    expect(commander!.status).toBeTruthy();

    // AI Tierの確認
    const tiers = new Set(data.agents.map(a => a.aiTier));
    expect(tiers.size).toBeGreaterThanOrEqual(3); // A, B, C minimum
  });

  test('スケジュール一覧', async () => {
    const data = await getAdminDashboardData();

    expect(data.schedules.totalSchedules).toBeGreaterThanOrEqual(12);
    expect(data.schedules.enabledSchedules).toBeGreaterThanOrEqual(9);
  });

  test('通知サマリー（初期状態=空）', async () => {
    const data = await getAdminDashboardData();

    expect(data.notifications.unreadCount).toBe(0);
    expect(data.notifications.criticalCount).toBe(0);
    expect(data.notifications.recentNotifications).toHaveLength(0);
  });

  test('通知追加後のサマリー', async () => {
    const db = getDB();
    await db.notificationLog.create({
      notificationId: 'n-test-1',
      channel: 'slack',
      priority: 'critical',
      body: 'Agent error detected',
      status: 'sent',
    } as any);
    await db.notificationLog.create({
      notificationId: 'n-test-2',
      channel: 'dashboard',
      priority: 'normal',
      body: 'Daily report ready',
      status: 'read',
    } as any);

    const data = await getAdminDashboardData();
    expect(data.notifications.unreadCount).toBe(1);
    expect(data.notifications.criticalCount).toBe(1);
  });

  test('Shopify同期サマリー（初期状態=空）', async () => {
    const data = await getAdminDashboardData();
    expect(data.shopifySync.last24h.total).toBe(0);
    expect(data.shopifySync.lastSync).toBeNull();
  });

  test('監査証跡サマリー', async () => {
    const db = getDB();
    await db.auditTrail.log({
      actorType: 'agent',
      actorId: 'seo-director',
      action: 'execute',
      targetType: 'content',
      targetId: '1',
      riskLevel: 'low',
    });
    await db.auditTrail.log({
      actorType: 'admin',
      actorId: 'takemasa',
      action: 'config_change',
      targetType: 'setting',
      targetId: '2',
      riskLevel: 'high',
    });

    const data = await getAdminDashboardData();
    expect(data.auditTrail.totalEntries).toBe(2);
    expect(data.auditTrail.highRiskCount).toBe(1);
    expect(data.auditTrail.recentActions).toHaveLength(2);
  });

  test('ヘルス異常時のANDONステータス変化', async () => {
    // errorステータスのヘルスログを注入
    await storage.put(TABLES.HEALTH_HISTORY, {
      id: `health_err_${Date.now()}`,
      agentId: 'seo-director',
      status: 'error',
      errorCount: 5,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const data = await getAdminDashboardData();
    expect(data.system.andonStatus).toBe('red');
    expect(data.system.errorAgents).toBeGreaterThanOrEqual(1);
  });
});
