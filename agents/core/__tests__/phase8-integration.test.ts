/**
 * Phase 8 テスト: 骨格→筋肉（SystemInitializer統合テスト）
 *
 * 全フェーズの初期化が正しい順序で行われ、
 * システム全体が「出生」状態になることを検証
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { InMemoryStorage, setStorage } from '../storage.js';
import { resetDB, getDB } from '../../lib/databases/db-adapter.js';
import { initializeSystem, isSystemInitialized, resetSystemInitializer, getInitResult } from '../system-initializer.js';
import { resetSSEBridge, getSSEBridge } from '../sse-bridge.js';
import { resetChannelOrchestrator } from '../notification-channels.js';
import { resetCronRunner } from '../cron-runner.js';

describe('Phase 8: 骨格→筋肉 — SystemInitializer統合', () => {
  beforeEach(() => {
    resetSystemInitializer();
    resetDB();
    resetSSEBridge();
    resetChannelOrchestrator();
    resetCronRunner();
    const storage = new InMemoryStorage(10000);
    setStorage(storage);
  });

  test('初期化前はfalse', () => {
    expect(isSystemInitialized()).toBe(false);
    expect(getInitResult()).toBeNull();
  });

  test('全7フェーズが正しい順序で初期化される', async () => {
    const result = await initializeSystem({});

    expect(result.success).toBe(true);
    expect(result.phases).toHaveLength(8);

    // 順序検証（医療成熟モデル準拠）
    expect(result.phases[0].name).toBe('Storage');
    expect(result.phases[1].name).toBe('DB Adapter');
    expect(result.phases[2].name).toBe('AgentBus');
    expect(result.phases[3].name).toBe('Data Hydration');
    expect(result.phases[4].name).toBe('SSE Bridge');
    expect(result.phases[5].name).toBe('Notification Channels');
    expect(result.phases[6].name).toBe('CronRunner');
    expect(result.phases[7].name).toBe('ConfigReloader');

    // 全フェーズ成功
    for (const phase of result.phases) {
      expect(phase.status).toBe('success');
      expect(phase.durationMs).toBeGreaterThanOrEqual(0);
    }

    expect(isSystemInitialized()).toBe(true);
    expect(result.storageType).toBe('in_memory');
    expect(result.agentsInitialized).toBeGreaterThanOrEqual(3);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  test('二重初期化は即座にキャッシュを返す', async () => {
    const result1 = await initializeSystem({});
    const result2 = await initializeSystem({});

    expect(result1).toBe(result2); // 同一オブジェクト
  });

  test('初期化後にDBデータが利用可能', async () => {
    await initializeSystem({});

    const db = getDB();
    const configs = await db.agentConfig.findMany();
    expect(configs.length).toBeGreaterThanOrEqual(26);

    const schedules = await db.cronSchedule.findMany();
    expect(schedules.length).toBeGreaterThanOrEqual(12);

    const version = await db.systemSettings.get('system.version');
    expect(version).toBe('2.0.0');
  });

  test('初期化後にSSEBridgeが稼働中', async () => {
    await initializeSystem({});

    const bridge = getSSEBridge();
    const stats = bridge.getStats();
    // bridge が起動されていれば bridgeStartedAt が設定されている
    expect(stats.bridgeStartedAt).toBeGreaterThan(0);
  });

  test('リセット後に再初期化可能', async () => {
    await initializeSystem({});
    expect(isSystemInitialized()).toBe(true);

    resetSystemInitializer();
    expect(isSystemInitialized()).toBe(false);

    // 再初期化
    resetDB();
    const result = await initializeSystem({});
    expect(result.success).toBe(true);
  });

  test('初期化結果の取得', async () => {
    await initializeSystem({});
    const result = getInitResult();
    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.phases.length).toBe(8); // Phase 8: ConfigReloader追加
  });
});
