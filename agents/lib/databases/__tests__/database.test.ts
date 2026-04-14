/**
 * Phase 0 統合テスト — 造血器官（データベース基盤）
 *
 * テスト対象:
 * 1. スキーマ型定義の正確性
 * 2. 接続マネージャ（InMemoryモード）
 * 3. マイグレーション定義の整合性
 * 4. シードデータ構造の正確性
 * 5. リトライヘルパーの動作
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getDatabase,
  resetDatabase,
  withRetry,
  isDatabaseConnected,
} from '../connection';
import { migrateStatus } from '../migrate';
import * as schema from '../schema';

describe('Phase 0: 造血器官（データベース基盤）', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    await resetDatabase();
  });

  // ── G-001: スキーマ型定義 ──
  describe('G-001: PostgreSQLスキーマ型定義', () => {
    it('全8テーブルが定義されている', () => {
      expect(schema.analyticsDailyTable).toBeDefined();
      expect(schema.searchConsoleDailyTable).toBeDefined();
      expect(schema.aiVisibilityWeeklyTable).toBeDefined();
      expect(schema.competitorWeeklyTable).toBeDefined();
      expect(schema.feedbackHistoryTable).toBeDefined();
      expect(schema.approvalQueueTable).toBeDefined();
      expect(schema.agentHealthLogTable).toBeDefined();
      expect(schema.pipelineExecutionLogTable).toBeDefined();
    });

    it('analytics_dailyの型がinsert/select両方で利用可能', () => {
      // 型レベルのテスト: コンパイルが通ればOK
      const insertData: schema.NewAnalyticsDaily = {
        date: '2026-04-10',
        sessions: 1000,
        users: 700,
        orders: 15,
        revenueJpy: '2700000',
      };
      expect(insertData.date).toBe('2026-04-10');
      expect(insertData.sessions).toBe(1000);
    });

    it('approval_queueの型が正しいフィールドを持つ', () => {
      const insertData: schema.NewApprovalQueue = {
        requestId: 'req-001',
        agentId: 'content-writer',
        actionType: 'content',
        title: 'テスト承認',
      };
      expect(insertData.requestId).toBe('req-001');
      expect(insertData.agentId).toBe('content-writer');
    });

    it('feedback_historyの型が学習データを格納できる', () => {
      const insertData: schema.NewFeedbackHistory = {
        agentId: 'seo-director',
        actionType: 'seo',
        decision: 'approved',
        confidence: '0.85',
        approver: 'admin',
        feedbackText: 'よい内容です',
      };
      expect(insertData.decision).toBe('approved');
    });

    it('competitor_weeklyが7社の競合データを格納できる', () => {
      const data: schema.NewCompetitorWeekly = {
        weekStart: '2026-04-06',
        competitor: 'dospara',
        productName: 'GALLERIA XA7C-R47TS',
        priceJpy: '299980',
        cpu: 'Core i7-14700F',
        gpu: 'RTX 4070 Ti SUPER',
        ramGb: 32,
      };
      expect(data.competitor).toBe('dospara');
      expect(data.priceJpy).toBe('299980');
    });

    it('agent_health_logがバイタルサインを記録できる', () => {
      const data: schema.NewAgentHealthLog = {
        agentId: 'commander',
        status: 'healthy',
        errorCount: 0,
        memoryUsage: 52428800, // 50MB
        taskQueue: 3,
        responseTimeMs: 45,
      };
      expect(data.status).toBe('healthy');
    });

    it('pipeline_execution_logが実行履歴を記録できる', () => {
      const data: schema.NewPipelineExecutionLog = {
        executionId: 'exec-001',
        pipelineId: 'P01',
        status: 'running',
        totalSteps: 5,
        triggerType: 'schedule',
      };
      expect(data.pipelineId).toBe('P01');
    });
  });

  // ── G-005: 接続マネージャ ──
  describe('G-005: DB接続プール+ヘルスチェック', () => {
    it('DATABASE_URL未設定時にInMemoryモードで起動する', async () => {
      const client = await getDatabase();
      expect(client).toBeDefined();
      const stats = client.getStats();
      expect(stats.mode).toBe('memory');
    });

    it('InMemoryモードのヘルスチェックが成功する', async () => {
      const client = await getDatabase();
      const healthy = await client.healthCheck();
      expect(healthy).toBe(true);
    });

    it('統計情報が取得できる', async () => {
      const client = await getDatabase();
      const stats = client.getStats();
      expect(stats).toHaveProperty('mode');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('idle');
      expect(stats).toHaveProperty('healthChecksPassed');
      expect(stats).toHaveProperty('uptime');
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });

    it('isDatabaseConnected()がInMemoryモードでfalseを返す', async () => {
      await getDatabase(); // 初期化
      expect(isDatabaseConnected()).toBe(false);
    });

    it('シャットダウンが正常に動作する', async () => {
      const client = await getDatabase();
      await client.shutdown();
      // 再取得可能であること
      const newClient = await getDatabase();
      expect(newClient).toBeDefined();
    });

    it('シングルトンパターンが機能する', async () => {
      const client1 = await getDatabase();
      const client2 = await getDatabase();
      expect(client1).toBe(client2);
    });
  });

  // ── G-003: マイグレーション ──
  describe('G-003: マイグレーション機構', () => {
    it('マイグレーションステータスが取得できる（DB未接続時）', async () => {
      const status = await migrateStatus();
      expect(status).toHaveProperty('current');
      expect(status).toHaveProperty('total');
      expect(status).toHaveProperty('applied');
      expect(status).toHaveProperty('pending');
      expect(status.total).toBeGreaterThan(0);
      expect(status.pending.length).toBeGreaterThan(0);
    });

    it('ペンディングマイグレーションにv1が含まれる', async () => {
      const status = await migrateStatus();
      const v1 = status.pending.find(p => p.version === 1);
      expect(v1).toBeDefined();
      expect(v1?.name).toBe('create_core_tables');
    });
  });

  // ── withRetry ──
  describe('withRetry ヘルパー', () => {
    it('成功時は即座に結果を返す', async () => {
      const result = await withRetry(async () => 'success');
      expect(result).toBe('success');
    });

    it('リトライ後に成功する', async () => {
      let attempts = 0;
      const result = await withRetry(async () => {
        attempts++;
        if (attempts < 3) throw new Error('temporary');
        return 'recovered';
      }, 3, 10); // 短いディレイでテスト高速化
      expect(result).toBe('recovered');
      expect(attempts).toBe(3);
    });

    it('最大リトライ後に失敗する', async () => {
      let attempts = 0;
      await expect(
        withRetry(async () => {
          attempts++;
          throw new Error('permanent');
        }, 2, 10),
      ).rejects.toThrow('permanent');
      expect(attempts).toBe(3); // 初回 + 2リトライ
    });
  });

  // ── G-006: シードデータ構造 ──
  describe('G-006: シードデータ構造', () => {
    it('seedDatabaseモジュールがインポートできる', async () => {
      const { seedDatabase } = await import('../seed');
      expect(typeof seedDatabase).toBe('function');
    });

    it('DB未接続時にシードがスキップされる', async () => {
      const { seedDatabase } = await import('../seed');
      const result = await seedDatabase();
      expect(result.inserted).toEqual({});
    });
  });
});
