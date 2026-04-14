/**
 * Provider テスト — Phase 2-H 全プロバイダー検証
 * ProviderRegistry, StubProvider, SNS/Ads Providers
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProviderRegistry,
  StubProvider,
  StubSNSProvider,
  StubAdsProvider,
  StubAnalyticsProvider,
} from '../external-service-provider.js';
import { XTwitterProvider, InstagramProvider, TikTokProvider, createSNSProviders } from '../sns-providers.js';
import { GoogleAdsProvider, MetaAdsProvider, LINEAdsProvider, createAdsProviders } from '../ads-providers.js';

// ── ProviderRegistry ──

describe('ProviderRegistry — プロバイダー管理', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('プロバイダーを登録・取得できる', () => {
    const stub = new StubProvider({ id: 'test', name: 'Test', type: 'analytics' });
    registry.register(stub);
    expect(registry.size).toBe(1);
    expect(registry.get('test')).toBe(stub);
  });

  it('重複登録はエラー', () => {
    const stub = new StubProvider({ id: 'dup', name: 'Dup', type: 'analytics' });
    registry.register(stub);
    expect(() => registry.register(stub)).toThrow('already registered');
  });

  it('タイプ別取得が動作する', () => {
    registry.register(new StubProvider({ id: 'a1', name: 'A1', type: 'analytics' }));
    registry.register(new StubProvider({ id: 's1', name: 'S1', type: 'sns' }));
    registry.register(new StubProvider({ id: 'a2', name: 'A2', type: 'analytics' }));

    const analytics = registry.getByType('analytics');
    expect(analytics).toHaveLength(2);

    const sns = registry.getByType('sns');
    expect(sns).toHaveLength(1);
  });

  it('全プロバイダー初期化が動作する', async () => {
    registry.register(new StubProvider({ id: 'p1', name: 'P1', type: 'sns' }));
    registry.register(new StubProvider({ id: 'p2', name: 'P2', type: 'ads' }));

    const result = await registry.initializeAll();
    expect(result.success).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('ヘルスレポートが全プロバイダー分返る', async () => {
    registry.register(new StubProvider({ id: 'h1', name: 'H1', type: 'sns' }));
    registry.register(new StubProvider({ id: 'h2', name: 'H2', type: 'ads' }));
    await registry.initializeAll();

    const report = registry.getHealthReport();
    expect(Object.keys(report)).toHaveLength(2);
    expect(report['h1'].status).toBe('connected');
    expect(report['h2'].status).toBe('connected');
  });

  it('全プロバイダーシャットダウン', async () => {
    registry.register(new StubProvider({ id: 'sd1', name: 'SD1', type: 'sns' }));
    await registry.initializeAll();
    await registry.shutdownAll();
    expect(registry.size).toBe(0);
  });

  it('getRegisteredIds()がID一覧を返す', () => {
    registry.register(new StubProvider({ id: 'id1', name: 'ID1', type: 'sns' }));
    registry.register(new StubProvider({ id: 'id2', name: 'ID2', type: 'ads' }));
    const ids = registry.getRegisteredIds();
    expect(ids).toContain('id1');
    expect(ids).toContain('id2');
  });
});

// ── StubProvider ──

describe('StubProvider — 基本動作', () => {
  it('初期化前はdisconnected', () => {
    const stub = new StubProvider({ id: 'test', name: 'Test', type: 'analytics' });
    expect(stub.getHealth().status).toBe('disconnected');
  });

  it('初期化後はconnected', async () => {
    const stub = new StubProvider({ id: 'test', name: 'Test', type: 'analytics' });
    await stub.initialize();
    expect(stub.getHealth().status).toBe('connected');
  });

  it('execute()がスタブデータを返す', async () => {
    const stub = new StubProvider({ id: 'test', name: 'Test', type: 'analytics' });
    await stub.initialize();
    const result = await stub.execute('test_op', { key: 'value' });
    expect(result.success).toBe(true);
    expect(result.metadata.provider).toBe('test');
  });

  it('未初期化でexecute()はエラー', async () => {
    const stub = new StubProvider({ id: 'test', name: 'Test', type: 'analytics' });
    const result = await stub.execute('test_op', {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_INITIALIZED');
  });
});

// ── SNS Providers ──

describe('SNS Providers — X/Instagram/TikTok', () => {
  it('XTwitterProvider: メトリクス取得（Stub）', async () => {
    const provider = new XTwitterProvider();
    await provider.initialize();
    const result = await provider.getMetrics('2026-04');
    expect(result.success).toBe(true);
    expect(result.data?.followers).toBeGreaterThan(0);
    expect(result.data?.engagement.engagementRate).toBeGreaterThan(0);
  });

  it('InstagramProvider: メトリクス取得（Stub）', async () => {
    const provider = new InstagramProvider();
    await provider.initialize();
    const result = await provider.getMetrics('2026-04');
    expect(result.success).toBe(true);
    expect(result.data?.followers).toBeGreaterThan(0);
  });

  it('TikTokProvider: メトリクス取得（Stub）', async () => {
    const provider = new TikTokProvider();
    await provider.initialize();
    const result = await provider.getMetrics('2026-04');
    expect(result.success).toBe(true);
    expect(result.data?.engagement.engagementRate).toBeGreaterThan(0);
  });

  it('createSNSProviders()で5プロバイダー生成', () => {
    const providers = createSNSProviders();
    // X, Instagram, TikTok, LINE, Bluesky
    expect(providers).toHaveLength(5);
  });

  it('XTwitterProvider: 投稿（Stub）', async () => {
    const provider = new XTwitterProvider();
    await provider.initialize();
    const result = await provider.post({ content: 'Test post' });
    expect(result.success).toBe(true);
  });
});

// ── Ads Providers ──

describe('Ads Providers — Google/Meta/LINE', () => {
  it('GoogleAdsProvider: キャンペーン一覧（Stub）', async () => {
    const provider = new GoogleAdsProvider();
    await provider.initialize();
    const result = await provider.getCampaigns();
    expect(result.success).toBe(true);
    expect(result.data!.length).toBeGreaterThanOrEqual(3);
    expect(result.data![0].status).toBe('active');
  });

  it('GoogleAdsProvider: パフォーマンス（Stub）', async () => {
    const provider = new GoogleAdsProvider();
    await provider.initialize();
    const result = await provider.getPerformance('gads-001', '2026-04');
    expect(result.success).toBe(true);
    expect(result.data?.roas).toBeGreaterThan(0);
    expect(result.data?.spend).toBeGreaterThan(0);
  });

  it('MetaAdsProvider: キャンペーン一覧（Stub）', async () => {
    const provider = new MetaAdsProvider();
    await provider.initialize();
    const result = await provider.getCampaigns();
    expect(result.success).toBe(true);
    expect(result.data!.length).toBeGreaterThanOrEqual(2);
  });

  it('LINEAdsProvider: パフォーマンス（Stub）', async () => {
    const provider = new LINEAdsProvider();
    await provider.initialize();
    const result = await provider.getPerformance('line-001', '2026-04');
    expect(result.success).toBe(true);
    expect(result.data?.impressions).toBeGreaterThan(0);
  });

  it('createAdsProviders()で3プロバイダー生成', () => {
    const providers = createAdsProviders();
    expect(providers).toHaveLength(3);
  });
});
