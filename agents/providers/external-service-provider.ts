/**
 * ExternalServiceProvider — Phase 2-H 外部サービス統合基盤
 *
 * 生体対応: 内分泌系受容体（Endocrine Receptors）
 * 外部サービス（SNS/Ads/Analytics API）との接続を統一インターフェースで管理。
 * StubProvider→実装Providerへの段階的差し替えを可能にする。
 *
 * Circuit Breakerと連携し、外部API障害時の自動遮断を実現。
 */

import type { IAgentBus } from '../core/types';

// ── Provider基底インターフェース ──

export type ProviderType = 'sns' | 'ads' | 'analytics' | 'search' | 'marketplace' | 'notification';
export type ProviderStatus = 'connected' | 'disconnected' | 'error' | 'rate_limited' | 'initializing';

export interface ProviderConfig {
  /** プロバイダーID（一意） */
  id: string;
  /** 表示名 */
  name: string;
  /** プロバイダータイプ */
  type: ProviderType;
  /** APIキー/トークン（環境変数から取得） */
  credentials: Record<string, string>;
  /** レートリミット設定 */
  rateLimit: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
  /** タイムアウト（ms） */
  timeout: number;
  /** リトライ設定 */
  retry: {
    maxRetries: number;
    backoffMs: number;
  };
  /** 有効/無効 */
  enabled: boolean;
}

export interface ProviderHealthInfo {
  status: ProviderStatus;
  lastSuccessAt?: number;
  lastErrorAt?: number;
  errorCount: number;
  requestCount: number;
  avgResponseTimeMs: number;
  rateLimitRemaining?: number;
}

/** 外部サービスプロバイダーの共通インターフェース */
export interface IExternalServiceProvider {
  /** プロバイダー設定 */
  readonly config: ProviderConfig;
  /** 現在のヘルス情報 */
  getHealth(): ProviderHealthInfo;
  /** 初期化（認証含む） */
  initialize(): Promise<void>;
  /** 接続テスト */
  testConnection(): Promise<boolean>;
  /** シャットダウン */
  shutdown(): Promise<void>;
  /** APIリクエスト実行（共通ラッパー） */
  execute<T>(operation: string, params: Record<string, unknown>): Promise<ProviderResponse<T>>;
}

export interface ProviderResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  metadata: {
    provider: string;
    operation: string;
    durationMs: number;
    timestamp: number;
    rateLimitRemaining?: number;
  };
}

// ── SNS Provider インターフェース ──

export interface SNSPostRequest {
  content: string;
  mediaUrls?: string[];
  scheduledAt?: number;
  tags?: string[];
  targetAudience?: string;
}

export interface SNSPostResult {
  postId: string;
  url: string;
  publishedAt: number;
  platform: string;
}

export interface SNSMetrics {
  followers: number;
  following: number;
  posts: number;
  engagement: {
    likes: number;
    comments: number;
    shares: number;
    impressions: number;
    engagementRate: number;
  };
  period: string;
}

export interface ISNSProvider extends IExternalServiceProvider {
  /** 投稿 */
  post(request: SNSPostRequest): Promise<ProviderResponse<SNSPostResult>>;
  /** メトリクス取得 */
  getMetrics(period: string): Promise<ProviderResponse<SNSMetrics>>;
  /** 投稿一覧 */
  getRecentPosts(limit: number): Promise<ProviderResponse<SNSPostResult[]>>;
}

// ── Ads Provider インターフェース ──

export interface AdCampaign {
  campaignId: string;
  name: string;
  status: 'active' | 'paused' | 'ended' | 'draft';
  budget: { daily: number; total: number; currency: 'JPY' };
  targeting: Record<string, unknown>;
  startDate: string;
  endDate?: string;
}

export interface AdPerformance {
  campaignId: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  conversionRate: number;
  spend: number;
  roas: number; // Return on Ad Spend
  period: string;
}

export interface IAdsProvider extends IExternalServiceProvider {
  /** キャンペーン一覧 */
  getCampaigns(): Promise<ProviderResponse<AdCampaign[]>>;
  /** パフォーマンス取得 */
  getPerformance(campaignId: string, period: string): Promise<ProviderResponse<AdPerformance>>;
  /** キャンペーン更新（予算/ステータス） */
  updateCampaign(campaignId: string, updates: Partial<AdCampaign>): Promise<ProviderResponse<AdCampaign>>;
}

// ── Analytics Provider インターフェース ──

export interface AnalyticsQuery {
  metrics: string[];
  dimensions?: string[];
  dateRange: { startDate: string; endDate: string };
  filters?: Record<string, unknown>;
  limit?: number;
}

export interface AnalyticsResult {
  rows: Array<Record<string, string | number>>;
  totals?: Record<string, number>;
  rowCount: number;
  samplingRate?: number;
}

export interface IAnalyticsProvider extends IExternalServiceProvider {
  /** データ取得 */
  query(request: AnalyticsQuery): Promise<ProviderResponse<AnalyticsResult>>;
  /** リアルタイムデータ */
  getRealtime(): Promise<ProviderResponse<Record<string, number>>>;
}

// ── Provider Registry ──

export class ProviderRegistry {
  private providers: Map<string, IExternalServiceProvider> = new Map();
  private bus?: IAgentBus;

  constructor(bus?: IAgentBus) {
    this.bus = bus;
  }

  /** プロバイダー登録 */
  register(provider: IExternalServiceProvider): void {
    if (this.providers.has(provider.config.id)) {
      throw new Error(`Provider already registered: ${provider.config.id}`);
    }
    this.providers.set(provider.config.id, provider);
  }

  /** プロバイダー取得 */
  get<T extends IExternalServiceProvider>(id: string): T | undefined {
    return this.providers.get(id) as T | undefined;
  }

  /** タイプ別取得 */
  getByType(type: ProviderType): IExternalServiceProvider[] {
    return Array.from(this.providers.values())
      .filter(p => p.config.type === type);
  }

  /** 全プロバイダー初期化 */
  async initializeAll(): Promise<{ success: number; failed: number; errors: string[] }> {
    const errors: string[] = [];
    let success = 0;
    let failed = 0;

    for (const [id, provider] of this.providers) {
      if (!provider.config.enabled) continue;
      try {
        await provider.initialize();
        success++;
        this.emitEvent('provider.initialized', { providerId: id });
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${id}: ${message}`);
        this.emitEvent('provider.error', { providerId: id, error: message });
      }
    }

    return { success, failed, errors };
  }

  /** 全プロバイダーヘルスチェック */
  getHealthReport(): Record<string, ProviderHealthInfo> {
    const report: Record<string, ProviderHealthInfo> = {};
    for (const [id, provider] of this.providers) {
      report[id] = provider.getHealth();
    }
    return report;
  }

  /** 全プロバイダーシャットダウン */
  async shutdownAll(): Promise<void> {
    for (const [, provider] of this.providers) {
      try {
        await provider.shutdown();
      } catch {
        // シャットダウン時のエラーはログのみ
      }
    }
    this.providers.clear();
  }

  /** 登録数 */
  get size(): number {
    return this.providers.size;
  }

  /** 全プロバイダーID */
  getRegisteredIds(): string[] {
    return Array.from(this.providers.keys());
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    if (!this.bus) return;
    void this.bus.publish({
      id: `provider-${Date.now()}`,
      type,
      source: 'provider-registry',
      priority: 'normal',
      payload,
      timestamp: Date.now(),
    });
  }
}

// ── Stub Provider（開発用フォールバック） ──

export class StubProvider implements IExternalServiceProvider {
  readonly config: ProviderConfig;
  private health: ProviderHealthInfo;
  private initialized = false;

  constructor(config: Partial<ProviderConfig> & { id: string; name: string; type: ProviderType }) {
    this.config = {
      id: config.id,
      name: config.name,
      type: config.type,
      credentials: config.credentials ?? {},
      rateLimit: config.rateLimit ?? { requestsPerMinute: 60, requestsPerDay: 10000 },
      timeout: config.timeout ?? 30000,
      retry: config.retry ?? { maxRetries: 3, backoffMs: 1000 },
      enabled: config.enabled ?? true,
    };
    this.health = {
      status: 'disconnected',
      errorCount: 0,
      requestCount: 0,
      avgResponseTimeMs: 0,
    };
  }

  getHealth(): ProviderHealthInfo {
    return { ...this.health };
  }

  async initialize(): Promise<void> {
    this.initialized = true;
    this.health.status = 'connected';
    this.health.lastSuccessAt = Date.now();
  }

  async testConnection(): Promise<boolean> {
    return this.initialized;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    this.health.status = 'disconnected';
  }

  async execute<T>(operation: string, params: Record<string, unknown>): Promise<ProviderResponse<T>> {
    this.health.requestCount++;
    const start = Date.now();

    if (!this.initialized) {
      this.health.errorCount++;
      return {
        success: false,
        error: { code: 'NOT_INITIALIZED', message: 'Provider not initialized', retryable: true },
        metadata: {
          provider: this.config.id,
          operation,
          durationMs: Date.now() - start,
          timestamp: Date.now(),
        },
      };
    }

    // Stub: 空データを返す
    const durationMs = Date.now() - start;
    this.health.lastSuccessAt = Date.now();
    this.health.avgResponseTimeMs =
      (this.health.avgResponseTimeMs * (this.health.requestCount - 1) + durationMs) / this.health.requestCount;

    return {
      success: true,
      data: { stub: true, operation, params } as unknown as T,
      metadata: {
        provider: this.config.id,
        operation,
        durationMs,
        timestamp: Date.now(),
      },
    };
  }
}

// ── SNS Stub Provider ──

export class StubSNSProvider extends StubProvider implements ISNSProvider {
  constructor(platform: string) {
    super({
      id: `sns-${platform}-stub`,
      name: `${platform} (Stub)`,
      type: 'sns',
    });
  }

  async post(request: SNSPostRequest): Promise<ProviderResponse<SNSPostResult>> {
    return this.execute<SNSPostResult>('post', request as unknown as Record<string, unknown>);
  }

  async getMetrics(period: string): Promise<ProviderResponse<SNSMetrics>> {
    return this.execute<SNSMetrics>('getMetrics', { period });
  }

  async getRecentPosts(limit: number): Promise<ProviderResponse<SNSPostResult[]>> {
    return this.execute<SNSPostResult[]>('getRecentPosts', { limit });
  }
}

// ── Ads Stub Provider ──

export class StubAdsProvider extends StubProvider implements IAdsProvider {
  constructor(platform: string) {
    super({
      id: `ads-${platform}-stub`,
      name: `${platform} Ads (Stub)`,
      type: 'ads',
    });
  }

  async getCampaigns(): Promise<ProviderResponse<AdCampaign[]>> {
    return this.execute<AdCampaign[]>('getCampaigns', {});
  }

  async getPerformance(campaignId: string, period: string): Promise<ProviderResponse<AdPerformance>> {
    return this.execute<AdPerformance>('getPerformance', { campaignId, period });
  }

  async updateCampaign(campaignId: string, updates: Partial<AdCampaign>): Promise<ProviderResponse<AdCampaign>> {
    return this.execute<AdCampaign>('updateCampaign', { campaignId, ...updates });
  }
}

// ── Analytics Stub Provider ──

export class StubAnalyticsProvider extends StubProvider implements IAnalyticsProvider {
  constructor(platform: string) {
    super({
      id: `analytics-${platform}-stub`,
      name: `${platform} Analytics (Stub)`,
      type: 'analytics',
    });
  }

  async query(request: AnalyticsQuery): Promise<ProviderResponse<AnalyticsResult>> {
    return this.execute<AnalyticsResult>('query', request as unknown as Record<string, unknown>);
  }

  async getRealtime(): Promise<ProviderResponse<Record<string, number>>> {
    return this.execute<Record<string, number>>('getRealtime', {});
  }
}
