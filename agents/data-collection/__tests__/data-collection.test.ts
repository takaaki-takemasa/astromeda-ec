/**
 * Data Collection テスト — Phase 2-G 全モジュール検証
 * GA4 Client, GSC Client, AI Visibility Checker, Competitor Scraper
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GA4Client } from '../ga4-client.js';
import { GSCClient } from '../gsc-client.js';
import { AIVisibilityChecker } from '../ai-visibility-checker.js';
import { CompetitorScraper } from '../competitor-scraper.js';
import { DATA_TABLES } from '../data-models.js';

// ── Data Models ──

describe('Data Models — スキーマ定義', () => {
  it('6テーブル定数が全て定義されている', () => {
    expect(DATA_TABLES.ANALYTICS_DAILY).toBe('analytics_daily');
    expect(DATA_TABLES.GSC_DAILY).toBe('gsc_daily');
    expect(DATA_TABLES.AI_VISIBILITY).toBe('ai_visibility');
    expect(DATA_TABLES.COMPETITOR_DATA).toBe('competitor_data');
    expect(DATA_TABLES.APPROVAL_LOG).toBe('approval_log');
    expect(DATA_TABLES.FEEDBACK).toBe('feedback');
  });
});

// ── GA4 Client ──

describe('GA4Client — Google Analytics 4 Data API', () => {
  let client: GA4Client;

  beforeEach(async () => {
    client = new GA4Client({ propertyId: 'properties/test' });
    await client.initialize();
  });

  it('初期化が正常に完了する', () => {
    const health = client.getHealth();
    expect(health.status).toBe('connected');
    expect(health.errorCount).toBe(0);
  });

  it('Stubモードで日次サマリーを取得できる', async () => {
    const record = await client.getDailySummary('2026-04-06');
    expect(record.date).toBe('2026-04-06');
    expect(record.sessions).toBeGreaterThan(0);
    expect(record.revenue).toBeGreaterThan(0);
    expect(record.conversionRate).toBeGreaterThan(0);
    expect(record.deviceBreakdown.desktop).toBeGreaterThan(0);
    expect(record.deviceBreakdown.mobile).toBeGreaterThan(0);
    expect(record.trafficSources.length).toBeGreaterThan(0);
    expect(record.source).toBe('estimated');
  });

  it('バッチ収集で複数日分取得できる', async () => {
    const records = await client.batchCollect('2026-04-01', '2026-04-03');
    expect(records).toHaveLength(3);
    expect(records[0].date).toBe('2026-04-01');
    expect(records[2].date).toBe('2026-04-03');
  });

  it('日次サマリーのフィールドが全て適切な型', async () => {
    const record = await client.getDailySummary('2026-04-06');
    expect(typeof record.sessions).toBe('number');
    expect(typeof record.users).toBe('number');
    expect(typeof record.revenue).toBe('number');
    expect(typeof record.bounceRate).toBe('number');
    expect(typeof record.avgOrderValue).toBe('number');
    expect(record.id).toContain('analytics-');
  });

  it('execute()でgetDailySummaryオペレーションが動作する', async () => {
    const result = await client.execute('getDailySummary', { date: '2026-04-06' });
    expect(result.success).toBe(true);
    expect(result.metadata.provider).toBe('ga4-data-api');
  });

  it('execute()で未知のオペレーションはエラー', async () => {
    const result = await client.execute('unknown_op', {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('GA4_ERROR');
  });

  it('シャットダウン後はエラー', async () => {
    await client.shutdown();
    const health = client.getHealth();
    expect(health.status).toBe('disconnected');
  });

  it('testConnection()がStubモードでtrue', async () => {
    const connected = await client.testConnection();
    expect(connected).toBe(true);
  });
});

// ── GSC Client ──

describe('GSCClient — Google Search Console', () => {
  let client: GSCClient;

  beforeEach(async () => {
    client = new GSCClient({ siteUrl: 'https://shop.mining-base.co.jp' });
    await client.initialize();
  });

  it('初期化が正常に完了する', () => {
    const health = client.getHealth();
    expect(health.initialized).toBe(true);
    expect(health.errorCount).toBe(0);
  });

  it('Stubモードで日次データを取得できる', async () => {
    const records = await client.getDailyData('2026-04-06');
    expect(records.length).toBeGreaterThan(0);
    expect(records[0].date).toBe('2026-04-06');
    expect(records[0].query).toBeTruthy();
    expect(records[0].impressions).toBeGreaterThan(0);
  });

  it('バッチ収集で複数日分取得できる', async () => {
    const records = await client.batchCollect('2026-04-01', '2026-04-03');
    expect(records.length).toBeGreaterThan(0);
    // 3日分×12クエリ×2デバイス = ~72件
    expect(records.length).toBeGreaterThanOrEqual(30);
  });

  it('トップクエリを取得できる', async () => {
    const topQueries = await client.getTopQueries('2026-04-06', 5);
    expect(topQueries.length).toBeLessThanOrEqual(5);
    expect(topQueries.length).toBeGreaterThan(0);
    // クリック数降順
    for (let i = 1; i < topQueries.length; i++) {
      expect(topQueries[i - 1].clicks).toBeGreaterThanOrEqual(topQueries[i].clicks);
    }
  });

  it('順位変動を検出できる', async () => {
    const alerts = await client.detectRankingChanges('2026-04-06', '2026-04-05', 1);
    // Stubデータではランダム変動があるので0件もありうる
    expect(Array.isArray(alerts)).toBe(true);
    for (const alert of alerts) {
      expect(alert.query).toBeTruthy();
      expect(['critical', 'warning', 'info']).toContain(alert.severity);
    }
  });

  it('シャットダウンが正常', async () => {
    await client.shutdown();
    const health = client.getHealth();
    expect(health.initialized).toBe(false);
  });
});

// ── AI Visibility Checker ──

describe('AIVisibilityChecker — AI検索推薦モニタリング', () => {
  let checker: AIVisibilityChecker;

  beforeEach(async () => {
    checker = new AIVisibilityChecker();
    await checker.initialize();
  });

  it('初期化が正常', () => {
    const health = checker.getHealth();
    expect(health.initialized).toBe(true);
    expect(health.recordCount).toBe(0);
  });

  it('週次チェックでレコードが生成される', async () => {
    const records = await checker.runWeeklyCheck('2026-04-06');
    // 4エンジン × 10クエリ = 40件
    expect(records).toHaveLength(40);
    expect(records[0].date).toBe('2026-04-06');
    expect(['chatgpt', 'gemini', 'perplexity', 'copilot']).toContain(records[0].engine);
  });

  it('スコアが計算される', async () => {
    const records = await checker.runWeeklyCheck('2026-04-06');
    const score = checker.calculateScore(records, '2026-04-06');
    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
    expect(score.totalChecks).toBe(40);
    expect(score.date).toBe('2026-04-06');
  });

  it('エンジン別スコアが含まれる', async () => {
    await checker.runWeeklyCheck('2026-04-06');
    const score = checker.calculateScore(undefined, '2026-04-06');
    expect(score.byEngine).toBeDefined();
    expect(typeof score.byEngine.chatgpt).toBe('number');
    expect(typeof score.byEngine.gemini).toBe('number');
  });

  it('シャットダウンでレコードがクリアされる', async () => {
    await checker.runWeeklyCheck('2026-04-06');
    await checker.shutdown();
    const health = checker.getHealth();
    expect(health.recordCount).toBe(0);
  });
});

// ── Competitor Scraper ──

describe('CompetitorScraper — 競合モニタリング', () => {
  let scraper: CompetitorScraper;

  beforeEach(async () => {
    scraper = new CompetitorScraper();
    await scraper.initialize();
  });

  it('初期化が正常', () => {
    const health = scraper.getHealth();
    expect(health.initialized).toBe(true);
    expect(health.pcCompetitors).toBe(7);
  });

  it('週次PC競合チェックで7社分のレコード', async () => {
    const records = await scraper.runWeeklyPCCheck('2026-04-06');
    expect(records).toHaveLength(7);
    expect(records[0].competitorType).toBe('pc_maker');
    expect(records[0].priceRange.currency).toBe('JPY');
    expect(records[0].priceRange.min).toBeGreaterThan(0);
  });

  it('週次ガジェットチェックでレコードが生成される', async () => {
    const records = await scraper.runWeeklyGadgetCheck('2026-04-06');
    // 4カテゴリ × 2ソース(Amazon+楽天) = 8件
    expect(records).toHaveLength(8);
    expect(records[0].competitorType).toBe('gadget_seller');
  });

  it('競合サマリーが正しい', async () => {
    await scraper.runWeeklyPCCheck('2026-04-06');
    const summary = scraper.getCompetitiveSummary();
    expect(summary.totalCompetitors).toBe(7);
    expect(summary.avgPriceRange.min).toBeGreaterThan(0);
    expect(summary.avgPriceRange.max).toBeGreaterThan(summary.avgPriceRange.min);
    expect(summary.latestDate).toBe('2026-04-06');
  });

  it('価格変動検出が動作する', async () => {
    await scraper.runWeeklyPCCheck('2026-04-01');
    await scraper.runWeeklyPCCheck('2026-04-08');
    const alerts = scraper.detectPriceChanges('2026-04-08', '2026-04-01', 0);
    expect(Array.isArray(alerts)).toBe(true);
  });

  it('シャットダウンでレコードがクリア', async () => {
    await scraper.runWeeklyPCCheck('2026-04-06');
    await scraper.shutdown();
    const health = scraper.getHealth();
    expect(health.initialized).toBe(false);
    expect(health.recordCount).toBe(0);
  });
});
