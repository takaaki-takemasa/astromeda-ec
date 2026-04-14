/**
 * Data Collection Models — Phase 2-G データ収集基盤 スキーマ定義
 *
 * 生体対応: 血液検査パネル（Blood Panel）
 * GA4/GSC/競合/AI検索順位の全データを統一フォーマットで管理。
 * StorageAdapter経由でInMemory→KV→D1→PostgreSQLに段階移行可能。
 *
 * 6テーブル:
 *   1. analytics_daily — GA4日次集計
 *   2. gsc_daily — Google Search Console日次データ
 *   3. ai_visibility — AI推薦順位（ChatGPT/Gemini/Perplexity）
 *   4. competitor_data — 競合PCメーカー7社 + ガジェット競合
 *   5. approval_log — 承認ワークフロー記録
 *   6. feedback — エージェント学習フィードバック
 */

import type { StorageRecord } from '../core/storage';

// ── 1. GA4 日次集計テーブル ──

export interface AnalyticsDailyRecord extends StorageRecord {
  /** YYYY-MM-DD */
  date: string;
  /** セッション数 */
  sessions: number;
  /** ユニークユーザー数 */
  users: number;
  /** 新規ユーザー数 */
  newUsers: number;
  /** PV数 */
  pageviews: number;
  /** 平均セッション時間（秒） */
  avgSessionDuration: number;
  /** 直帰率（0-1） */
  bounceRate: number;
  /** eコマース収益（JPY） */
  revenue: number;
  /** トランザクション数 */
  transactions: number;
  /** 平均注文額（JPY） */
  avgOrderValue: number;
  /** コンバージョン率（0-1） */
  conversionRate: number;
  /** デバイス別内訳 */
  deviceBreakdown: {
    desktop: number;
    mobile: number;
    tablet: number;
  };
  /** トラフィックソース別 */
  trafficSources: TrafficSourceEntry[];
  /** 収集元 */
  source: 'ga4_api' | 'manual' | 'estimated';
}

export interface TrafficSourceEntry {
  medium: string; // organic, cpc, social, referral, direct, email
  source: string; // google, yahoo, instagram, etc.
  sessions: number;
  revenue: number;
}

// ── 2. GSC 日次データテーブル ──

export interface GSCDailyRecord extends StorageRecord {
  /** YYYY-MM-DD */
  date: string;
  /** クエリ */
  query: string;
  /** 表示URL */
  page: string;
  /** 表示回数 */
  impressions: number;
  /** クリック数 */
  clicks: number;
  /** CTR（0-1） */
  ctr: number;
  /** 平均掲載順位 */
  position: number;
  /** デバイス */
  device: 'DESKTOP' | 'MOBILE' | 'TABLET';
  /** 国 */
  country: string;
}

// ── 3. AI推薦順位テーブル ──

export type AISearchEngine = 'chatgpt' | 'gemini' | 'perplexity' | 'copilot' | 'claude';

export interface AIVisibilityRecord extends StorageRecord {
  /** YYYY-MM-DD */
  date: string;
  /** 検索エンジン */
  engine: AISearchEngine;
  /** 検索クエリ */
  query: string;
  /** Astromedaが推薦に含まれたか */
  mentioned: boolean;
  /** 推薦順位（1=最初の推薦、0=推薦なし） */
  position: number;
  /** 推薦テキスト抜粋 */
  snippet: string;
  /** 競合の推薦状況 */
  competitors: Array<{
    name: string;
    position: number;
    mentioned: boolean;
  }>;
  /** クエリカテゴリ */
  queryCategory: 'gaming_pc' | 'collab_pc' | 'brand' | 'comparison' | 'general';
}

// ── 4. 競合データテーブル ──

export type CompetitorType = 'pc_maker' | 'gadget_seller';

export interface CompetitorDataRecord extends StorageRecord {
  /** YYYY-MM-DD */
  date: string;
  /** 競合名 */
  competitorName: string;
  /** 競合タイプ */
  competitorType: CompetitorType;
  /** データソース */
  dataSource: 'web_scrape' | 'amazon_pa' | 'rakuten' | 'manual';
  /** 価格帯情報 */
  priceRange: {
    min: number;
    max: number;
    avg: number;
    currency: 'JPY';
  };
  /** 商品数 */
  productCount: number;
  /** 注目商品 */
  featuredProducts: Array<{
    name: string;
    price: number;
    url: string;
    rating?: number;
  }>;
  /** プロモーション情報 */
  activePromotions: Array<{
    title: string;
    discountPercent?: number;
    startDate?: string;
    endDate?: string;
  }>;
  /** SNSフォロワー数 */
  socialMetrics?: {
    twitter?: number;
    instagram?: number;
    youtube?: number;
    tiktok?: number;
  };
}

// ── 5. 承認ログテーブル ──

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'auto_approved';
export type ApprovalCategory = 'content' | 'pricing' | 'promotion' | 'deployment' | 'seo' | 'design' | 'other';

export interface ApprovalLogRecord extends StorageRecord {
  /** 承認リクエストID */
  requestId: string;
  /** リクエスト元Agent ID */
  agentId: string;
  /** パイプラインID（あれば） */
  pipelineId?: string;
  /** カテゴリ */
  category: ApprovalCategory;
  /** 承認ステータス */
  status: ApprovalStatus;
  /** リクエスト内容 */
  title: string;
  description: string;
  /** 変更内容のプレビュー */
  preview?: Record<string, unknown>;
  /** 承認者（人間 or auto） */
  approver?: string;
  /** 承認/却下理由 */
  reason?: string;
  /** リクエスト時刻 */
  requestedAt: number;
  /** 応答時刻 */
  respondedAt?: number;
  /** 自動承認基準を満たしたか */
  autoApprovalEligible: boolean;
  /** 信頼スコア（0-1: エージェントの過去実績に基づく） */
  confidenceScore: number;
}

// ── 6. フィードバックテーブル ──

export type FeedbackType = 'approval_result' | 'kpi_outcome' | 'user_satisfaction' | 'error_correction' | 'performance';
export type FeedbackSentiment = 'positive' | 'negative' | 'neutral';

export interface FeedbackRecord extends StorageRecord {
  /** 対象Agent ID */
  agentId: string;
  /** フィードバック種別 */
  type: FeedbackType;
  /** 元アクションID（承認ID、パイプライン実行IDなど） */
  sourceActionId: string;
  /** 評価 */
  sentiment: FeedbackSentiment;
  /** スコア（0-100） */
  score: number;
  /** 詳細メッセージ */
  message: string;
  /** KPIへの影響（あれば） */
  kpiImpact?: {
    metric: string;
    before: number;
    after: number;
    changePercent: number;
  };
  /** 学習に使用されたか */
  appliedToLearning: boolean;
  /** 学習適用日時 */
  appliedAt?: number;
}

// ── テーブル名定数 ──

export const DATA_TABLES = {
  ANALYTICS_DAILY: 'analytics_daily',
  GSC_DAILY: 'gsc_daily',
  AI_VISIBILITY: 'ai_visibility',
  COMPETITOR_DATA: 'competitor_data',
  APPROVAL_LOG: 'approval_log',
  FEEDBACK: 'feedback',
} as const;

// ── ヘルパー型 ──

/** 日次データの集計サマリー */
export interface DailySummary {
  date: string;
  revenue: number;
  sessions: number;
  conversionRate: number;
  avgOrderValue: number;
  topQueries: Array<{ query: string; clicks: number; position: number }>;
  aiVisibilityScore: number; // 0-100: AI検索での露出度
  competitorAlerts: number;
}

/** 週次レポート用集約 */
export interface WeeklyAggregate {
  weekStart: string;
  weekEnd: string;
  totalRevenue: number;
  totalSessions: number;
  avgConversionRate: number;
  avgOrderValue: number;
  revenueGrowthPercent: number;
  sessionsGrowthPercent: number;
  topPerformingPages: Array<{ page: string; revenue: number }>;
  aiVisibilityTrend: number; // -100 to 100
}

/** 100億円目標トラッカー */
export interface RevenueTargetTracker {
  /** 年間目標（JPY） */
  annualTarget: number;
  /** 累計達成額 */
  currentRevenue: number;
  /** 達成率（0-1） */
  progressRate: number;
  /** 月次必要額 */
  monthlyRequired: number;
  /** 残り月数 */
  remainingMonths: number;
  /** 予測到達日 */
  projectedAchievementDate?: string;
  /** シナリオ別予測 */
  scenarios: Array<{
    name: string;
    monthlyGrowthRate: number;
    projectedRevenue: number;
    achievable: boolean;
  }>;
}
