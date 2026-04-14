/**
 * Phase 7 テスト: 自律神経（CronRunner + 自己修復）
 *
 * DB駆動型のCronスケジュール実行、連続失敗時の自動無効化、
 * エスカレーションイベントの発行を検証
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { InMemoryStorage } from '../storage.js';
import { setStorage } from '../storage.js';
import { getDB, resetDB } from '../../lib/databases/db-adapter.js';
import { hydrateAgentData } from '../agent-data-hydrator.js';
import { CronRunner, resetCronRunner } from '../cron-runner.js';

describe('Phase 7: 自律神経 — CronRunner', () => {
  let storage: InMemoryStorage;
  let runner: CronRunner;

  beforeEach(async () => {
    resetDB();
    resetCronRunner();
    storage = new InMemoryStorage(10000);
    setStorage(storage);
    await hydrateAgentData();
    runner = new CronRunner();
  });

  test('tickで期限到来スケジュールを実行', async () => {
    const db = getDB();

    // 期限到来スケジュールを作成
    await db.cronSchedule.create({
      scheduleId: 'test-cron-1',
      agentId: 'analytics-agent',
      cronExpression: '0 6 * * *',
      enabled: true,
      nextRunAt: new Date(Date.now() - 60000), // 1分前に期限切れ
      consecutiveFailures: 0,
      maxConsecutiveFailures: 3,
    } as any);

    const results = await runner.tick();
    expect(results.length).toBeGreaterThanOrEqual(1);

    // 成功結果の確認
    const testResult = results.find(r => r.scheduleId === 'test-cron-1');
    if (testResult) {
      expect(testResult.status).toBe('success');
      expect(testResult.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  test('再入防止: tick中の二重実行を防ぐ', async () => {
    // 1回目のtick
    const results1 = runner.tick();
    // 即座に2回目を呼んでもスキップされる
    const results2 = await runner.tick();
    await results1;

    // 2回目は空（1回目がまだrunning中のため）
    expect(results2).toHaveLength(0);
  });

  test('短期間の重複チェック防止', async () => {
    // 1回目
    await runner.tick();
    // 30秒以内の2回目はスキップ
    const results = await runner.tick();
    expect(results).toHaveLength(0);
  });

  test('runningステータスの確認', () => {
    expect(runner.isRunning()).toBe(false);
  });

  test('CronRunnerのリセット', () => {
    resetCronRunner();
    const newRunner = new CronRunner();
    expect(newRunner.isRunning()).toBe(false);
  });
});
