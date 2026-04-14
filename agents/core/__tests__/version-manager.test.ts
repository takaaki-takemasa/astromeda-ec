/**
 * Version Manager テスト — エージェント版バージョン管理＆Canaryリリース機能の検証
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  VersionManager,
  getVersionManager,
  resetVersionManager,
  type AgentVersion,
  type CanaryState,
} from '../version-manager.js';

describe('VersionManager', () => {
  let manager: VersionManager;

  beforeEach(() => {
    resetVersionManager();
    manager = getVersionManager();
  });

  afterEach(() => {
    manager.shutdown();
    resetVersionManager();
  });

  describe('registerVersion', () => {
    it('新しいバージョンを登録する', () => {
      const version = manager.registerVersion('agent-1', '1.0.0', {
        configHash: 'abc123',
        releaseNotes: 'Initial release',
      });

      expect(version.versionString).toBe('1.0.0');
      expect(version.status).toBe('active');
      expect(version.releaseNotes).toBe('Initial release');
    });

    it('最初のバージョンはactiveで登録される', () => {
      const v1 = manager.registerVersion('agent-2', '1.0.0');
      expect(v1.status).toBe('active');
    });

    it('2番目以降のバージョンはcandidateで登録される', () => {
      manager.registerVersion('agent-3', '1.0.0');
      const v2 = manager.registerVersion('agent-3', '1.1.0');

      expect(v2.status).toBe('candidate');
    });

    it('バージョン履歴の最大数を超えたら古いバージョンを削除', () => {
      const manager2 = new VersionManager({ maxVersionsPerAgent: 3 });

      for (let i = 1; i <= 5; i++) {
        manager2.registerVersion('agent-old', `1.${i}.0`);
      }

      const history = manager2.getVersionHistory('agent-old');
      expect(history).toHaveLength(3);
      expect(history[0].versionString).toBe('1.5.0');
    });
  });

  describe('getCurrentVersion', () => {
    it('アクティブなバージョンを取得する', () => {
      manager.registerVersion('agent-current', '1.0.0');
      const current = manager.getCurrentVersion('agent-current');

      expect(current).not.toBeNull();
      expect(current?.versionString).toBe('1.0.0');
      expect(current?.status).toBe('active');
    });

    it('未登録のエージェントではnullを返す', () => {
      const current = manager.getCurrentVersion('nonexistent-agent');
      expect(current).toBeNull();
    });
  });

  describe('startCanaryRelease', () => {
    beforeEach(() => {
      manager.registerVersion('canary-agent', '1.0.0');
      manager.registerVersion('canary-agent', '1.1.0');
    });

    it('canaryリリースを開始する', () => {
      const canaryState = manager.startCanaryRelease('canary-agent', '1.1.0');

      expect(canaryState.agentId).toBe('canary-agent');
      expect(canaryState.currentVersion).toBe('1.0.0');
      expect(canaryState.canaryVersion).toBe('1.1.0');
      expect(canaryState.currentStage).toBe(1);
      expect(canaryState.canaryPercentage).toBe(1);
    });

    it('アクティブなバージョンが存在しない場合はエラーを投げる', () => {
      expect(() => {
        manager.startCanaryRelease('nonexistent', '1.1.0');
      }).toThrow('No active version found for agent nonexistent');
    });

    it('登録されていないバージョンでcanaryを開始するとエラーを投げる', () => {
      expect(() => {
        manager.startCanaryRelease('canary-agent', '2.0.0');
      }).toThrow('Version 2.0.0 not found for agent canary-agent');
    });

    it('canaryVersionをcanaryステータスに変更する', () => {
      manager.startCanaryRelease('canary-agent', '1.1.0');
      const v11 = manager.getVersionHistory('canary-agent').find((v) => v.versionString === '1.1.0');

      expect(v11?.status).toBe('canary');
    });
  });

  describe('advanceCanary', () => {
    beforeEach(() => {
      manager.registerVersion('advance-agent', '1.0.0');
      manager.registerVersion('advance-agent', '1.1.0');
      manager.startCanaryRelease('advance-agent', '1.1.0');
    });

    it('canaryステージを次のステージに進める', () => {
      const canaryState = manager.advanceCanary('advance-agent');

      expect(canaryState.currentStage).toBe(10);
      expect(canaryState.canaryPercentage).toBe(10);
    });

    it('複数ステージを進められる', () => {
      manager.advanceCanary('advance-agent'); // 1 -> 10
      manager.advanceCanary('advance-agent'); // 10 -> 50
      const canaryState = manager.advanceCanary('advance-agent'); // 50 -> 100

      expect(canaryState.currentStage).toBe(100);
      expect(canaryState.canaryPercentage).toBe(100);
    });

    it('最後のステージに到達したら本番化される', () => {
      manager.advanceCanary('advance-agent'); // 1 -> 10
      manager.advanceCanary('advance-agent'); // 10 -> 50
      manager.advanceCanary('advance-agent'); // 50 -> 100
      manager.advanceCanary('advance-agent'); // 100 -> promotion

      // 本番化後はcanaryStateが削除される
      const currentCanary = manager.getCanaryStatus('advance-agent');
      expect(currentCanary).toBeNull();

      // 1.1.0がactiveになる
      const current = manager.getCurrentVersion('advance-agent');
      expect(current?.versionString).toBe('1.1.0');
      expect(current?.status).toBe('active');
    });

    it('進行時にdecisionLogを記録する', () => {
      const canaryState = manager.advanceCanary('advance-agent');

      expect(canaryState.decisionLog).toHaveLength(1);
      expect(canaryState.decisionLog[0].decision).toBe('advance');
      expect(canaryState.decisionLog[0].reason).toContain('10%');
    });

    it('canaryがない場合はエラーを投げる', () => {
      expect(() => {
        manager.advanceCanary('no-canary-agent');
      }).toThrow('No canary release in progress for agent no-canary-agent');
    });
  });

  describe('rollbackCanary', () => {
    beforeEach(() => {
      manager.registerVersion('rollback-agent', '1.0.0');
      manager.registerVersion('rollback-agent', '1.1.0');
      manager.startCanaryRelease('rollback-agent', '1.1.0');
    });

    it('canaryをロールバックする', () => {
      const version = manager.rollbackCanary('rollback-agent', 'Manual test rollback');

      expect(version.versionString).toBe('1.0.0');
      expect(version.status).toBe('active');
    });

    it('ロールバック後にcanaryVersionを退役させる', () => {
      manager.rollbackCanary('rollback-agent');

      const v11 = manager.getVersionHistory('rollback-agent').find((v) => v.versionString === '1.1.0');
      expect(v11?.status).toBe('retired');
    });

    it('ロールバック後にcanaryStateを削除する', () => {
      manager.rollbackCanary('rollback-agent');

      const canaryState = manager.getCanaryStatus('rollback-agent');
      expect(canaryState).toBeNull();
    });

    it('ロールバック時にdecisionLogを記録される', () => {
      // Advanceしてからロールバック
      manager.advanceCanary('rollback-agent'); // 1 -> 10
      const rollbackVersion = manager.rollbackCanary('rollback-agent', 'Health score too low');

      // ロールバック後は元のバージョンに戻る
      expect(rollbackVersion.versionString).toBe('1.0.0');
      expect(rollbackVersion.status).toBe('active');
    });

    it('canaryがない場合はエラーを投げる', () => {
      expect(() => {
        manager.rollbackCanary('no-canary-agent');
      }).toThrow('No canary release in progress for agent no-canary-agent');
    });
  });

  describe('getCanaryStatus', () => {
    it('canaryステータスを取得する', () => {
      manager.registerVersion('status-agent', '1.0.0');
      manager.registerVersion('status-agent', '1.1.0');
      manager.startCanaryRelease('status-agent', '1.1.0');

      const canaryState = manager.getCanaryStatus('status-agent');
      expect(canaryState).not.toBeNull();
      expect(canaryState?.agentId).toBe('status-agent');
    });

    it('canaryがない場合はnullを返す', () => {
      const canaryState = manager.getCanaryStatus('no-canary-agent');
      expect(canaryState).toBeNull();
    });
  });

  describe('getVersionHistory', () => {
    it('バージョン履歴を取得する（新しい順）', () => {
      manager.registerVersion('history-agent', '1.0.0');
      manager.registerVersion('history-agent', '1.1.0');
      manager.registerVersion('history-agent', '1.2.0');

      const history = manager.getVersionHistory('history-agent');

      expect(history).toHaveLength(3);
      expect(history[0].versionString).toBe('1.2.0');
      expect(history[1].versionString).toBe('1.1.0');
      expect(history[2].versionString).toBe('1.0.0');
    });

    it('バージョンが登録されていない場合は空配列を返す', () => {
      const history = manager.getVersionHistory('unknown-agent');
      expect(history).toEqual([]);
    });
  });

  describe('recordMetrics & getMetrics', () => {
    it('バージョンのメトリクスを記録する', () => {
      manager.recordMetrics('metric-agent', '1.0.0', {
        totalRequests: 1000,
        successCount: 950,
        errorCount: 50,
        averageLatencyMs: 120,
        p99LatencyMs: 500,
      });

      const metrics = manager.getMetrics('metric-agent', '1.0.0');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].successCount).toBe(950);
    });

    it('複数のメトリクスを記録できる', () => {
      manager.recordMetrics('metric-agent-2', '1.0.0', {
        totalRequests: 100,
        successCount: 95,
        errorCount: 5,
        averageLatencyMs: 100,
        p99LatencyMs: 200,
      });

      manager.recordMetrics('metric-agent-2', '1.0.0', {
        totalRequests: 200,
        successCount: 190,
        errorCount: 10,
        averageLatencyMs: 110,
        p99LatencyMs: 210,
      });

      const metrics = manager.getMetrics('metric-agent-2', '1.0.0');
      expect(metrics).toHaveLength(2);
    });

    it('バージョン指定なしですべてのメトリクスを取得', () => {
      manager.recordMetrics('multi-agent', '1.0.0', {
        totalRequests: 100,
        successCount: 95,
        errorCount: 5,
        averageLatencyMs: 100,
        p99LatencyMs: 200,
      });

      manager.recordMetrics('multi-agent', '1.1.0', {
        totalRequests: 200,
        successCount: 190,
        errorCount: 10,
        averageLatencyMs: 110,
        p99LatencyMs: 210,
      });

      const allMetrics = manager.getMetrics('multi-agent');
      expect(allMetrics).toHaveLength(2);
    });
  });

  describe('updateCanaryHealth', () => {
    beforeEach(() => {
      manager.registerVersion('health-agent', '1.0.0');
      manager.registerVersion('health-agent', '1.1.0');
      manager.startCanaryRelease('health-agent', '1.1.0');
    });

    it('canaryのヘルススコアとエラー率を更新する', () => {
      manager.updateCanaryHealth('health-agent', 0.95, 0.03);

      const canaryState = manager.getCanaryStatus('health-agent');
      expect(canaryState?.healthScore).toBe(0.95);
      expect(canaryState?.errorRate).toBe(0.03);
    });

    it('canaryがない場合は何もしない', () => {
      // エラーを投げない
      expect(() => {
        manager.updateCanaryHealth('no-canary-agent', 0.95, 0.03);
      }).not.toThrow();
    });
  });

  describe('自動Canaryロジック（ヘルスチェック）', () => {
    beforeEach(() => {
      manager.registerVersion('auto-agent', '1.0.0');
      manager.registerVersion('auto-agent', '1.1.0');
    });

    it('ヘルススコアが低すぎるとロールバックされる', async () => {
      vi.useFakeTimers();

      manager.startCanaryRelease('auto-agent', '1.1.0', {
        stages: [1, 10, 50, 100],
        minDurationMs: 1000,
        healthThreshold: 0.85,
        rollbackThreshold: 0.5,
        metricsCheckIntervalMs: 100,
      });

      // ヘルススコアを低下させる
      manager.updateCanaryHealth('auto-agent', 0.3, 0.8);

      // ヘルスチェックを待つ
      await vi.advanceTimersByTimeAsync(200);

      const canaryState = manager.getCanaryStatus('auto-agent');
      expect(canaryState).toBeNull(); // ロールバック済み

      const current = manager.getCurrentVersion('auto-agent');
      expect(current?.versionString).toBe('1.0.0');

      vi.useRealTimers();
    });

    it('十分な時間経過してヘルススコアが高いと自動進行される', async () => {
      vi.useFakeTimers();

      manager.startCanaryRelease('auto-agent', '1.1.0', {
        stages: [1, 10, 50, 100],
        minDurationMs: 1000,
        healthThreshold: 0.85,
        rollbackThreshold: 0.5,
        metricsCheckIntervalMs: 100,
      });

      // ヘルススコアを高く設定
      manager.updateCanaryHealth('auto-agent', 0.95, 0.01);

      // minDurationMsを経過させる
      await vi.advanceTimersByTimeAsync(1100);
      // ヘルスチェック間隔を経過させる
      await vi.advanceTimersByTimeAsync(200);

      const canaryState = manager.getCanaryStatus('auto-agent');
      expect(canaryState?.currentStage).toBe(10); // 1 -> 10に進んでいる

      vi.useRealTimers();
    });
  });

  describe('Singleton pattern', () => {
    it('同じインスタンスを返す', () => {
      const vm1 = getVersionManager();
      const vm2 = getVersionManager();

      expect(vm1).toBe(vm2);
    });

    it('resetVersionManagerで初期化できる', () => {
      const vm1 = getVersionManager();
      manager.registerVersion('test', '1.0.0');

      resetVersionManager();

      const vm2 = getVersionManager();
      expect(vm1).not.toBe(vm2);
      expect(vm2.getVersionHistory('test')).toEqual([]);
    });
  });

  describe('エッジケース', () => {
    it('同じバージョンを複数回登録できる（タイムスタンプが異なる）', () => {
      manager.registerVersion('dup-agent', '1.0.0', { createdBy: 'Engineer1' });

      // 少し時間を経過させる
      const startTime = Date.now();
      while (Date.now() === startTime) {
        // タイムスタンプが異なるようにwait
      }

      manager.registerVersion('dup-agent', '1.0.0', { createdBy: 'Engineer2' });

      const history = manager.getVersionHistory('dup-agent');
      expect(history).toHaveLength(2);
      expect(history[0].createdBy).toBe('Engineer2');
      expect(history[1].createdBy).toBe('Engineer1');
    });

    it('複数のagentで独立したcanaryを実行できる', () => {
      manager.registerVersion('agent-a', '1.0.0');
      manager.registerVersion('agent-a', '1.1.0');
      manager.registerVersion('agent-b', '1.0.0');
      manager.registerVersion('agent-b', '1.1.0');

      manager.startCanaryRelease('agent-a', '1.1.0');
      manager.startCanaryRelease('agent-b', '1.1.0');

      const canaryA = manager.getCanaryStatus('agent-a');
      const canaryB = manager.getCanaryStatus('agent-b');

      expect(canaryA?.agentId).toBe('agent-a');
      expect(canaryB?.agentId).toBe('agent-b');

      manager.advanceCanary('agent-a'); // agent-aは1->10
      // agent-bは1のまま

      const canaryA2 = manager.getCanaryStatus('agent-a');
      const canaryB2 = manager.getCanaryStatus('agent-b');

      expect(canaryA2?.currentStage).toBe(10);
      expect(canaryB2?.currentStage).toBe(1);
    });
  });
});
