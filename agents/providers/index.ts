/**
 * Provider Module — Phase 2-H エクスポート
 */

// 基底インターフェース
export {
  ProviderRegistry,
  StubProvider,
  StubSNSProvider,
  StubAdsProvider,
  StubAnalyticsProvider,
} from './external-service-provider';

export type {
  IExternalServiceProvider,
  ISNSProvider,
  IAdsProvider,
  IAnalyticsProvider,
  ProviderType,
  ProviderStatus,
  ProviderConfig,
  ProviderHealthInfo,
  ProviderResponse,
  SNSPostRequest,
  SNSPostResult,
  SNSMetrics,
  AdCampaign,
  AdPerformance,
  AnalyticsQuery,
  AnalyticsResult,
} from './external-service-provider';

// SNS Providers
export { XTwitterProvider, InstagramProvider, TikTokProvider, createSNSProviders } from './sns-providers';

// Ads Providers
export { GoogleAdsProvider, MetaAdsProvider, LINEAdsProvider, createAdsProviders } from './ads-providers';
