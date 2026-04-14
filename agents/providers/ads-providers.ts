/**
 * Ads Providers — Phase 2-H #H-03
 *
 * 生体対応: 筋肉系（Muscular System）
 * 広告出稿は「筋力」。Google Ads/Meta Ads/LINE広告を統一管理。
 * ROAS最適化のためのデータ収集と予算制御。
 *
 * 全プロバイダーがCircuit Breaker保護下で動作。
 */

import {
  StubAdsProvider,
  type IAdsProvider,
  type AdCampaign,
  type AdPerformance,
  type ProviderResponse,
  type ProviderConfig,
} from './external-service-provider';

// ── Google Ads Provider ──

export class GoogleAdsProvider extends StubAdsProvider {
  constructor(config?: { customerId?: string; developerToken?: string; refreshToken?: string }) {
    super('google-ads');
    if (config?.developerToken) {
      (this.config as ProviderConfig).credentials = {
        customerId: config.customerId ?? '',
        developerToken: config.developerToken,
        refreshToken: config.refreshToken ?? '',
      };
    }
  }

  async getCampaigns(): Promise<ProviderResponse<AdCampaign[]>> {
    if (this.config.credentials.developerToken) {
      return this.executeRealGetCampaigns();
    }
    // Stub: Astromeda広告キャンペーンデモ
    return {
      success: true,
      data: [
        {
          campaignId: 'gads-001',
          name: 'Astromeda ブランド検索',
          status: 'active',
          budget: { daily: 50000, total: 1500000, currency: 'JPY' },
          targeting: { keywords: ['Astromeda', 'マイニングベース', 'アストロメダ'] },
          startDate: '2026-04-01',
        },
        {
          campaignId: 'gads-002',
          name: 'ゲーミングPC 一般',
          status: 'active',
          budget: { daily: 100000, total: 3000000, currency: 'JPY' },
          targeting: { keywords: ['ゲーミングPC', 'BTO PC', 'ゲーミングPC おすすめ'] },
          startDate: '2026-04-01',
        },
        {
          campaignId: 'gads-003',
          name: 'コラボPC リマーケティング',
          status: 'active',
          budget: { daily: 30000, total: 900000, currency: 'JPY' },
          targeting: { audiences: ['website_visitors', 'collab_page_viewers'] },
          startDate: '2026-04-01',
        },
      ],
      metadata: { provider: 'google-ads', operation: 'getCampaigns', durationMs: 0, timestamp: Date.now() },
    };
  }

  async getPerformance(campaignId: string, period: string): Promise<ProviderResponse<AdPerformance>> {
    if (this.config.credentials.developerToken) {
      return this.executeRealGetPerformance(campaignId, period);
    }
    // Stub: リアルな広告パフォーマンスデモ
    const performances: Record<string, Partial<AdPerformance>> = {
      'gads-001': { impressions: 45000, clicks: 3200, ctr: 7.1, cpc: 85, conversions: 28, spend: 272000, roas: 4.2 },
      'gads-002': { impressions: 180000, clicks: 5400, ctr: 3.0, cpc: 120, conversions: 42, spend: 648000, roas: 2.8 },
      'gads-003': { impressions: 25000, clicks: 1800, ctr: 7.2, cpc: 65, conversions: 18, spend: 117000, roas: 5.5 },
    };

    const perf = performances[campaignId] ?? {};

    return {
      success: true,
      data: {
        campaignId,
        impressions: perf.impressions ?? 0,
        clicks: perf.clicks ?? 0,
        ctr: perf.ctr ?? 0,
        cpc: perf.cpc ?? 0,
        conversions: perf.conversions ?? 0,
        conversionRate: perf.clicks ? ((perf.conversions ?? 0) / perf.clicks) * 100 : 0,
        spend: perf.spend ?? 0,
        roas: perf.roas ?? 0,
        period,
      },
      metadata: { provider: 'google-ads', operation: 'getPerformance', durationMs: 0, timestamp: Date.now() },
    };
  }

  private async executeRealGetCampaigns(): Promise<ProviderResponse<AdCampaign[]>> {
    const start = Date.now();
    try {
      const customerId = this.config.credentials.customerId?.replace(/-/g, '');
      const response = await fetch(
        `https://googleads.googleapis.com/v17/customers/${customerId}/campaigns?fields=campaign.id,campaign.name,campaign.status,campaign.budget,campaign.start_date,campaign.end_date`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.credentials.developerToken}`,
            'developer-token': this.config.credentials.developerToken,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Google Ads API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        results?: Array<{
          campaign: {
            id: string;
            name: string;
            status: string;
            budget?: { amount_micros: number };
            start_date: string;
            end_date?: string;
          };
        }>;
      };
      const durationMs = Date.now() - start;

      const campaigns: AdCampaign[] = (data.results ?? []).map(r => ({
        campaignId: r.campaign.id,
        name: r.campaign.name,
        status: r.campaign.status.toLowerCase() as 'active' | 'paused' | 'ended' | 'draft',
        budget: {
          daily: (r.campaign.budget?.amount_micros ?? 0) / 1000000,
          total: 0,
          currency: 'JPY',
        },
        targeting: {},
        startDate: r.campaign.start_date,
        endDate: r.campaign.end_date,
      }));

      return {
        success: true,
        data: campaigns,
        metadata: { provider: 'google-ads', operation: 'getCampaigns', durationMs, timestamp: Date.now() },
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      return {
        success: false,
        error: {
          code: 'GOOGLE_ADS_ERROR',
          message: err instanceof Error ? err.message : String(err),
          retryable: true,
        },
        metadata: { provider: 'google-ads', operation: 'getCampaigns', durationMs, timestamp: Date.now() },
      };
    }
  }

  private async executeRealGetPerformance(campaignId: string, period: string): Promise<ProviderResponse<AdPerformance>> {
    const start = Date.now();
    try {
      const customerId = this.config.credentials.customerId?.replace(/-/g, '');
      const response = await fetch(
        `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:search`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.credentials.developerToken}`,
            'developer-token': this.config.credentials.developerToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `SELECT campaign.id, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.conversions, metrics.cost_micros FROM campaign WHERE campaign.id = ${campaignId}`,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Google Ads API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        results?: Array<{
          metrics: {
            impressions: string;
            clicks: string;
            ctr: string;
            average_cpc: string;
            conversions: string;
            cost_micros: string;
          };
        }>;
      };
      const durationMs = Date.now() - start;

      const row = data.results?.[0];
      if (!row) {
        return super.getPerformance(campaignId, period);
      }

      const metrics = row.metrics;
      const spend = parseInt(metrics.cost_micros) / 1000000;
      const conversions = parseInt(metrics.conversions);

      return {
        success: true,
        data: {
          campaignId,
          impressions: parseInt(metrics.impressions),
          clicks: parseInt(metrics.clicks),
          ctr: parseFloat(metrics.ctr),
          cpc: parseFloat(metrics.average_cpc),
          conversions,
          conversionRate: parseInt(metrics.clicks) > 0 ? conversions / parseInt(metrics.clicks) : 0,
          spend,
          roas: spend > 0 ? (conversions * 100000) / spend : 0,
          period,
        },
        metadata: { provider: 'google-ads', operation: 'getPerformance', durationMs, timestamp: Date.now() },
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      return {
        success: false,
        error: {
          code: 'GOOGLE_ADS_ERROR',
          message: err instanceof Error ? err.message : String(err),
          retryable: true,
        },
        metadata: { provider: 'google-ads', operation: 'getPerformance', durationMs, timestamp: Date.now() },
      };
    }
  }
}

// ── Meta (Facebook/Instagram) Ads Provider ──

export class MetaAdsProvider extends StubAdsProvider {
  constructor(accessToken?: string) {
    super('meta-ads');
    if (accessToken) {
      (this.config as ProviderConfig).credentials = { accessToken };
    }
  }

  async getCampaigns(): Promise<ProviderResponse<AdCampaign[]>> {
    if (this.config.credentials.accessToken) {
      return this.executeRealGetCampaigns();
    }
    return {
      success: true,
      data: [
        {
          campaignId: 'meta-001',
          name: 'Astromeda コラボPC Instagram',
          status: 'active',
          budget: { daily: 40000, total: 1200000, currency: 'JPY' },
          targeting: { interests: ['ゲーミング', 'アニメ', 'PC'], age: '18-35' },
          startDate: '2026-04-01',
        },
        {
          campaignId: 'meta-002',
          name: 'リード獲得 Facebook',
          status: 'active',
          budget: { daily: 25000, total: 750000, currency: 'JPY' },
          targeting: { interests: ['ゲーミングPC'], lookalike: 'purchasers_1pct' },
          startDate: '2026-04-01',
        },
      ],
      metadata: { provider: 'meta-ads', operation: 'getCampaigns', durationMs: 0, timestamp: Date.now() },
    };
  }

  async getPerformance(campaignId: string, period: string): Promise<ProviderResponse<AdPerformance>> {
    if (this.config.credentials.accessToken) {
      return this.executeRealGetPerformance(campaignId, period);
    }
    const isInstagram = campaignId === 'meta-001';
    return {
      success: true,
      data: {
        campaignId,
        impressions: isInstagram ? 120000 : 85000,
        clicks: isInstagram ? 4800 : 2100,
        ctr: isInstagram ? 4.0 : 2.5,
        cpc: isInstagram ? 95 : 110,
        conversions: isInstagram ? 22 : 12,
        conversionRate: isInstagram ? 0.46 : 0.57,
        spend: isInstagram ? 456000 : 231000,
        roas: isInstagram ? 3.1 : 2.3,
        period,
      },
      metadata: { provider: 'meta-ads', operation: 'getPerformance', durationMs: 0, timestamp: Date.now() },
    };
  }

  private async executeRealGetCampaigns(): Promise<ProviderResponse<AdCampaign[]>> {
    const start = Date.now();
    try {
      const response = await fetch(
        'https://graph.instagram.com/v21.0/me/campaigns?fields=id,name,status,budget,start_time,stop_time,objective&access_token=' +
          encodeURIComponent(this.config.credentials.accessToken),
        { headers: { 'Accept': 'application/json' } }
      );

      if (!response.ok) {
        throw new Error(`Meta API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        data?: Array<{
          id: string;
          name: string;
          status: string;
          budget: number;
          start_time: string;
          stop_time?: string;
        }>;
      };
      const durationMs = Date.now() - start;

      const campaigns: AdCampaign[] = (data.data ?? []).map(c => ({
        campaignId: c.id,
        name: c.name,
        status: c.status.toLowerCase() as 'active' | 'paused' | 'ended' | 'draft',
        budget: {
          daily: c.budget / 30,
          total: c.budget,
          currency: 'JPY',
        },
        targeting: {},
        startDate: c.start_time,
        endDate: c.stop_time,
      }));

      return {
        success: true,
        data: campaigns,
        metadata: { provider: 'meta-ads', operation: 'getCampaigns', durationMs, timestamp: Date.now() },
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      return {
        success: false,
        error: {
          code: 'META_ADS_ERROR',
          message: err instanceof Error ? err.message : String(err),
          retryable: true,
        },
        metadata: { provider: 'meta-ads', operation: 'getCampaigns', durationMs, timestamp: Date.now() },
      };
    }
  }

  private async executeRealGetPerformance(campaignId: string, period: string): Promise<ProviderResponse<AdPerformance>> {
    const start = Date.now();
    try {
      const response = await fetch(
        `https://graph.instagram.com/v21.0/${campaignId}/insights?fields=impressions,clicks,actions,spend&access_token=` +
          encodeURIComponent(this.config.credentials.accessToken),
        { headers: { 'Accept': 'application/json' } }
      );

      if (!response.ok) {
        throw new Error(`Meta API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        data?: Array<{
          impressions: string;
          clicks: string;
          actions: Array<{ action_type: string; value: string }>;
          spend: string;
        }>;
      };
      const durationMs = Date.now() - start;

      const row = data.data?.[0];
      if (!row) {
        return super.getPerformance(campaignId, period);
      }

      const impressions = parseInt(row.impressions) || 0;
      const clicks = parseInt(row.clicks) || 0;
      const spend = parseFloat(row.spend) || 0;
      const conversions = row.actions?.filter(a => a.action_type === 'purchase').length || 0;

      return {
        success: true,
        data: {
          campaignId,
          impressions,
          clicks,
          ctr: impressions > 0 ? clicks / impressions : 0,
          cpc: clicks > 0 ? spend / clicks : 0,
          conversions,
          conversionRate: clicks > 0 ? conversions / clicks : 0,
          spend,
          roas: spend > 0 ? (conversions * 100000) / spend : 0,
          period,
        },
        metadata: { provider: 'meta-ads', operation: 'getPerformance', durationMs, timestamp: Date.now() },
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      return {
        success: false,
        error: {
          code: 'META_ADS_ERROR',
          message: err instanceof Error ? err.message : String(err),
          retryable: true,
        },
        metadata: { provider: 'meta-ads', operation: 'getPerformance', durationMs, timestamp: Date.now() },
      };
    }
  }
}

// ── LINE Ads Provider ──

export class LINEAdsProvider extends StubAdsProvider {
  constructor(accessToken?: string) {
    super('line-ads');
    if (accessToken) {
      (this.config as ProviderConfig).credentials = { accessToken };
    }
  }

  async getCampaigns(): Promise<ProviderResponse<AdCampaign[]>> {
    return {
      success: true,
      data: [
        {
          campaignId: 'line-001',
          name: 'LINE公式アカウント広告',
          status: 'active',
          budget: { daily: 20000, total: 600000, currency: 'JPY' },
          targeting: { demographics: 'M18-34', interests: ['ゲーム', 'アニメ'] },
          startDate: '2026-04-01',
        },
      ],
      metadata: { provider: 'line-ads', operation: 'getCampaigns', durationMs: 0, timestamp: Date.now() },
    };
  }

  async getPerformance(campaignId: string, period: string): Promise<ProviderResponse<AdPerformance>> {
    return {
      success: true,
      data: {
        campaignId,
        impressions: 95000,
        clicks: 2800,
        ctr: 2.9,
        cpc: 78,
        conversions: 8,
        conversionRate: 0.29,
        spend: 218400,
        roas: 1.8,
        period,
      },
      metadata: { provider: 'line-ads', operation: 'getPerformance', durationMs: 0, timestamp: Date.now() },
    };
  }
}

// ── Ads Provider Factory ──

export function createAdsProviders(env?: Record<string, string>): IAdsProvider[] {
  return [
    new GoogleAdsProvider({
      customerId: env?.GOOGLE_ADS_CUSTOMER_ID,
      developerToken: env?.GOOGLE_ADS_DEVELOPER_TOKEN,
      refreshToken: env?.GOOGLE_ADS_REFRESH_TOKEN,
    }),
    new MetaAdsProvider(env?.META_ADS_ACCESS_TOKEN),
    new LINEAdsProvider(env?.LINE_ADS_ACCESS_TOKEN),
  ];
}
