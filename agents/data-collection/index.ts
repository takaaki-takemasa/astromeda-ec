/**
 * Data Collection Module — Phase 2-G エクスポート
 *
 * 生体対応: 消化器系（Digestive System）
 * 外部データを消化・吸収し、内部テーブルに栄養として蓄積。
 */

// データモデル（スキーマ）
export type {
  AnalyticsDailyRecord,
  TrafficSourceEntry,
  GSCDailyRecord,
  AIVisibilityRecord,
  AISearchEngine,
  CompetitorDataRecord,
  CompetitorType,
  ApprovalLogRecord,
  ApprovalStatus,
  ApprovalCategory,
  FeedbackRecord,
  FeedbackType,
  FeedbackSentiment,
  DailySummary,
  WeeklyAggregate,
  RevenueTargetTracker,
} from './data-models';

export { DATA_TABLES } from './data-models';

// GA4 Client
export { GA4Client } from './ga4-client';
export type { GA4Config } from './ga4-client';

// GSC Client
export { GSCClient } from './gsc-client';
export type { GSCConfig, RankingChangeAlert } from './gsc-client';

// AI Visibility Checker
export { AIVisibilityChecker } from './ai-visibility-checker';
export type { AIVisibilityConfig, AIVisibilityScore } from './ai-visibility-checker';

// Competitor Scraper
export { CompetitorScraper } from './competitor-scraper';
export type { CompetitorConfig, PriceChangeAlert, PromotionAlert } from './competitor-scraper';
