/**
 * Phase 4 テスト: 臓器分化（Agent Data Hydrator + Admin連携）
 *
 * エージェントの初期データ注入が正しく機能し、
 * 管理画面が実データを表示できる状態になるか検証
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { InMemoryStorage } from '../storage.js';
import { setStorage } from '../storage.js';
import { hydrateAgentData } from '../agent-data-hydrator.js';
import { getDB, resetDB, DB } from '../../lib/databases/db-adapter.js';

describe('Phase 4: 臓器分化 — Agent Data Hydration', () => {
  let storage: InMemoryStorage;
  let db: DB;

  beforeEach(() => {
    resetDB();
    storage = new InMemoryStorage(10000);
    setStorage(storage);
    db = getDB(storage);
  });

  test('全モジュールの初期化成功', async () => {
    const result = await hydrateAgentData();
    expect(result.success).toBe(true);
    expect(result.failedModules).toHaveLength(0);
    expect(result.hydratedModules).toContain('system_settings');
    expect(result.hydratedModules).toContain('agent_config');
    expect(result.hydratedModules).toContain('cron_schedule');
    expect(result.hydratedModules).toContain('health_log');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('システム設定がシードされる', async () => {
    await hydrateAgentData();

    const version = await db.systemSettings.get('system.version');
    expect(version).toBe('2.0.0');

    const aiTier = await db.systemSettings.get('ai.default_tier');
    expect(aiTier).toBe('B');

    const aiSettings = await db.systemSettings.getByCategory('ai');
    expect(aiSettings.length).toBeGreaterThanOrEqual(2);
  });

  test('エージェント設定が26件シードされる', async () => {
    await hydrateAgentData();

    const allConfigs = await db.agentConfig.findMany();
    expect(allConfigs.length).toBeGreaterThanOrEqual(26);

    const l0 = await db.agentConfig.findByLevel('L0');
    expect(l0).toHaveLength(1);
    expect(l0[0].agentId).toBe('commander');

    const l1 = await db.agentConfig.findByLevel('L1');
    expect(l1.length).toBeGreaterThanOrEqual(5);

    const l2 = await db.agentConfig.findByLevel('L2');
    expect(l2.length).toBeGreaterThanOrEqual(20);
  });

  test('Cronスケジュールが12件シードされる', async () => {
    await hydrateAgentData();

    const allSchedules = await db.cronSchedule.findMany();
    expect(allSchedules.length).toBeGreaterThanOrEqual(12);

    // 有効スケジュールの確認
    const enabled = allSchedules.filter((s: any) => s.enabled === true);
    expect(enabled.length).toBeGreaterThanOrEqual(9);

    // 無効スケジュールも存在する
    const disabled = allSchedules.filter((s: any) => s.enabled === false);
    expect(disabled.length).toBeGreaterThanOrEqual(2);
  });

  test('ヘルスログがシードされる', async () => {
    await hydrateAgentData();

    const healthCount = await storage.count('health_history');
    expect(healthCount).toBeGreaterThanOrEqual(3);
  });

  test('AI Tierの多層構造（A/B/C/D）', async () => {
    await hydrateAgentData();

    const allConfigs = await db.agentConfig.findMany();
    const tiers = new Set(allConfigs.map((c: any) => c.aiTier));
    expect(tiers.has('A')).toBe(true); // Sonnet
    expect(tiers.has('B')).toBe(true); // Haiku
    expect(tiers.has('C')).toBe(true); // Gemini Flash
    expect(tiers.has('D')).toBe(true); // Gemini Lite
  });

  test('チーム構成の確認', async () => {
    await hydrateAgentData();

    const allConfigs = await db.agentConfig.findMany();
    const teams = new Set(allConfigs.map((c: any) => c.team));
    expect(teams.has('command')).toBe(true);
    expect(teams.has('product')).toBe(true);
    expect(teams.has('marketing')).toBe(true);
    expect(teams.has('operations')).toBe(true);
    expect(teams.has('technology')).toBe(true);
    expect(teams.has('analytics')).toBe(true);
  });

  test('二重実行でもエラーにならない（冪等性）', async () => {
    const result1 = await hydrateAgentData();
    const result2 = await hydrateAgentData();
    expect(result2.success).toBe(true);
  });
});
