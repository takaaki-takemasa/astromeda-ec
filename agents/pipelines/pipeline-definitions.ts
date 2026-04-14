/**
 * Pipeline Definitions — デフォルトパイプライン定義
 *
 * Astromeda AIエージェントシステムの6つの主要パイプラインを定義。
 * 各パイプラインは複数のL2エージェントを連携させて、
 * バナー生成、カタログ更新、コンテンツ生成などの複合タスクを実行する。
 *
 * P01-P06: 血管系を通じた物質輸送フロー
 */

import type { PipelineDefinition } from '../core/types.js';

/**
 * P01: バナー自動生成パイプライン
 * 画像生成 → 品質監査
 * IPコラボレーション用のバナー画像を自動生成し、品質を検査する
 */
const P01_BANNER_GENERATION: PipelineDefinition = {
  id: 'P01',
  name: 'バナー自動生成パイプライン',
  trigger: {
    type: 'manual',
  },
  onFailure: 'retry',
  steps: [
    {
      id: 'P01_S01',
      agentId: 'image-generator',
      action: 'generate_banner',
      timeout: 60000, // 60秒
      retryCount: 2,
      retryDelay: 5000, // 5秒待機後リトライ
    },
    {
      id: 'P01_S02',
      agentId: 'quality-auditor',
      action: 'banner_review',
      inputFrom: 'P01_S01',
      timeout: 45000, // 45秒
      retryCount: 1,
      retryDelay: 3000,
    },
  ],
};

/**
 * P02: 商品カタログ更新パイプライン
 * カタログ同期 → コンテンツ作成 → SEO最適化 → 品質監査
 * Shopifyから商品情報を取得し、説明文とSEOメタデータを生成・検査する
 */
const P02_CATALOG_UPDATE: PipelineDefinition = {
  id: 'P02',
  name: '商品カタログ更新パイプライン',
  trigger: {
    type: 'schedule',
    cron: '0 2 * * *', // 毎日午前2時
  },
  onFailure: 'skip',
  steps: [
    {
      id: 'P02_S01',
      agentId: 'product-catalog',
      action: 'sync_products',
      timeout: 120000, // 2分
      retryCount: 3,
      retryDelay: 10000,
    },
    {
      id: 'P02_S02',
      agentId: 'content-writer',
      action: 'write_product_desc',
      inputFrom: 'P02_S01',
      timeout: 90000, // 90秒
      retryCount: 2,
      retryDelay: 5000,
    },
    {
      id: 'P02_S03',
      agentId: 'seo-director',
      action: 'meta_optimize',
      inputFrom: 'P02_S02',
      timeout: 60000, // 60秒
      retryCount: 1,
      retryDelay: 3000,
    },
    {
      id: 'P02_S04',
      agentId: 'quality-auditor',
      action: 'content_review',
      inputFrom: 'P02_S03',
      timeout: 45000, // 45秒
      retryCount: 1,
      retryDelay: 2000,
    },
  ],
};

/**
 * P03: コンテンツ生成パイプライン
 * コンテンツ作成 → SEO最適化 → 品質監査
 * ブログ記事やランディングページのコンテンツを生成・最適化する
 */
const P03_CONTENT_GENERATION: PipelineDefinition = {
  id: 'P03',
  name: 'コンテンツ生成パイプライン',
  trigger: {
    type: 'event',
    eventType: 'content.requested',
  },
  onFailure: 'retry',
  steps: [
    {
      id: 'P03_S01',
      agentId: 'content-writer',
      action: 'write_article',
      timeout: 120000, // 2分
      retryCount: 2,
      retryDelay: 5000,
    },
    {
      id: 'P03_S02',
      agentId: 'seo-director',
      action: 'seo_audit',
      inputFrom: 'P03_S01',
      timeout: 60000, // 60秒
      retryCount: 1,
      retryDelay: 3000,
    },
    {
      id: 'P03_S03',
      agentId: 'quality-auditor',
      action: 'content_review',
      inputFrom: 'P03_S02',
      timeout: 45000, // 45秒
      retryCount: 1,
      retryDelay: 2000,
    },
  ],
};

/**
 * P04: SEO最適化パイプライン
 * キーワード調査 → コンテンツ更新 → 品質監査
 * 既存コンテンツのSEO改善と検索ランキング向上を目指す
 */
const P04_SEO_OPTIMIZATION: PipelineDefinition = {
  id: 'P04',
  name: 'SEO最適化パイプライン',
  trigger: {
    type: 'schedule',
    cron: '0 3 * * 0', // 毎週日曜午前3時
  },
  onFailure: 'skip',
  steps: [
    {
      id: 'P04_S01',
      agentId: 'seo-director',
      action: 'keyword_research',
      timeout: 120000, // 2分
      retryCount: 2,
      retryDelay: 5000,
    },
    {
      id: 'P04_S02',
      agentId: 'content-writer',
      action: 'update_content',
      inputFrom: 'P04_S01',
      timeout: 90000, // 90秒
      retryCount: 1,
      retryDelay: 3000,
    },
    {
      id: 'P04_S03',
      agentId: 'quality-auditor',
      action: 'quality_check',
      inputFrom: 'P04_S02',
      timeout: 45000, // 45秒
      retryCount: 1,
      retryDelay: 2000,
    },
  ],
};

/**
 * P05: 品質監査パイプライン
 * 品質監査のみ → SEO監査
 * 全体的なサイトコンテンツの品質をチェックし、改善を検討する
 */
const P05_QUALITY_AUDIT: PipelineDefinition = {
  id: 'P05',
  name: '品質監査パイプライン',
  trigger: {
    type: 'schedule',
    cron: '0 4 * * *', // 毎日午前4時
  },
  onFailure: 'skip',
  steps: [
    {
      id: 'P05_S01',
      agentId: 'quality-auditor',
      action: 'full_audit',
      timeout: 180000, // 3分
      retryCount: 1,
      retryDelay: 10000,
    },
    {
      id: 'P05_S02',
      agentId: 'seo-director',
      action: 'seo_audit',
      inputFrom: 'P05_S01',
      timeout: 60000, // 60秒
      retryCount: 1,
      retryDelay: 3000,
    },
  ],
};

/**
 * P06: カタログ監査パイプライン
 * カタログ監査 → 品質確認
 * 商品カタログをベースに、データの整合性と完全性を検証する
 */
const P06_PRICING_OPTIMIZATION: PipelineDefinition = {
  id: 'P06',
  name: 'カタログ監査パイプライン',
  trigger: {
    type: 'schedule',
    cron: '0 1 * * *', // 毎日午前1時
  },
  onFailure: 'retry',
  steps: [
    {
      id: 'P06_S01',
      agentId: 'product-catalog',
      action: 'audit_catalog',
      timeout: 120000, // 2分
      retryCount: 2,
      retryDelay: 5000,
    },
    {
      id: 'P06_S02',
      agentId: 'quality-auditor',
      action: 'quality_check',
      inputFrom: 'P06_S01',
      timeout: 90000, // 90秒
      retryCount: 1,
      retryDelay: 3000,
    },
  ],
};

/**
 * デフォルトパイプライン定義を返す
 * 6つの主要パイプラインを含む
 */
/**
 * P07: 価格最適化パイプライン（Sales Team）
 * 競合分析 → 需要予測 → 価格提案 → 承認 → 適用
 */
const P07_PRICE_OPTIMIZATION: PipelineDefinition = {
  id: 'P07',
  name: '価格最適化パイプライン',
  trigger: { type: 'schedule', cron: '0 6 * * 1' },
  onFailure: 'skip',
  steps: [
    { id: 'P07_S01', agentId: 'pricing-agent', action: 'competitor_price_check', timeout: 60000, retryCount: 2, retryDelay: 5000 },
    { id: 'P07_S02', agentId: 'data-analyst', action: 'revenue_forecast', inputFrom: 'P07_S01', timeout: 60000, retryCount: 1, retryDelay: 3000 },
    { id: 'P07_S03', agentId: 'pricing-agent', action: 'dynamic_pricing', inputFrom: 'P07_S02', timeout: 30000, retryCount: 1, retryDelay: 3000 },
  ],
};

/**
 * P08: キャンペーン実行パイプライン（Sales Team）
 * 企画 → クリエイティブ → スケジュール → 配信 → 効果測定
 */
const P08_CAMPAIGN: PipelineDefinition = {
  id: 'P08',
  name: 'キャンペーン実行パイプライン',
  trigger: { type: 'manual' },
  onFailure: 'skip',
  steps: [
    { id: 'P08_S01', agentId: 'promotion-agent', action: 'create_campaign', timeout: 60000, retryCount: 1, retryDelay: 5000 },
    { id: 'P08_S02', agentId: 'content-writer', action: 'write_landing_page', inputFrom: 'P08_S01', timeout: 90000, retryCount: 1, retryDelay: 5000 },
    { id: 'P08_S03', agentId: 'promotion-agent', action: 'schedule_sale', inputFrom: 'P08_S02', timeout: 30000, retryCount: 1, retryDelay: 3000 },
  ],
};

/**
 * P09: コンバージョン改善パイプライン（Sales Team）
 * ファネル分析 → ボトルネック特定 → 改善提案
 */
const P09_CONVERSION: PipelineDefinition = {
  id: 'P09',
  name: 'コンバージョン改善パイプライン',
  trigger: { type: 'schedule', cron: '0 3 * * *' },
  onFailure: 'skip',
  steps: [
    { id: 'P09_S01', agentId: 'conversion-agent', action: 'checkout_analysis', timeout: 60000, retryCount: 2, retryDelay: 5000 },
    { id: 'P09_S02', agentId: 'conversion-agent', action: 'abandonment_analysis', inputFrom: 'P09_S01', timeout: 60000, retryCount: 1, retryDelay: 3000 },
    { id: 'P09_S03', agentId: 'ux-agent', action: 'ux_audit', inputFrom: 'P09_S02', timeout: 90000, retryCount: 1, retryDelay: 5000 },
  ],
};

/**
 * P10: デプロイパイプライン（Engineering Team）
 * ビルド → テスト → ステージング → 検証 → 本番
 */
const P10_DEPLOY: PipelineDefinition = {
  id: 'P10',
  name: 'デプロイパイプライン',
  trigger: { type: 'manual' },
  onFailure: 'halt',
  steps: [
    { id: 'P10_S01', agentId: 'devops-agent', action: 'build_check', timeout: 120000, retryCount: 1, retryDelay: 10000 },
    { id: 'P10_S02', agentId: 'quality-auditor', action: 'code_review', inputFrom: 'P10_S01', timeout: 90000, retryCount: 1, retryDelay: 5000 },
    { id: 'P10_S03', agentId: 'devops-agent', action: 'deploy_staging', inputFrom: 'P10_S02', timeout: 180000, retryCount: 1, retryDelay: 10000 },
    { id: 'P10_S04', agentId: 'devops-agent', action: 'deploy_production', inputFrom: 'P10_S03', timeout: 180000, retryCount: 0, retryDelay: 0 },
  ],
};

/**
 * P11: セキュリティ監査パイプライン（Engineering Team）
 */
const P11_SECURITY: PipelineDefinition = {
  id: 'P11',
  name: 'セキュリティ監査パイプライン',
  trigger: { type: 'schedule', cron: '0 4 * * 0' },
  onFailure: 'halt',
  steps: [
    { id: 'P11_S01', agentId: 'security-agent', action: 'dependency_check', timeout: 90000, retryCount: 2, retryDelay: 5000 },
    { id: 'P11_S02', agentId: 'security-agent', action: 'vulnerability_scan', inputFrom: 'P11_S01', timeout: 120000, retryCount: 1, retryDelay: 10000 },
    { id: 'P11_S03', agentId: 'security-agent', action: 'csp_review', inputFrom: 'P11_S02', timeout: 60000, retryCount: 1, retryDelay: 5000 },
  ],
};

/**
 * P12: パフォーマンス最適化パイプライン（Engineering Team）
 */
const P12_PERFORMANCE: PipelineDefinition = {
  id: 'P12',
  name: 'パフォーマンス最適化パイプライン',
  trigger: { type: 'schedule', cron: '0 5 * * *' },
  onFailure: 'skip',
  steps: [
    { id: 'P12_S01', agentId: 'performance-agent', action: 'lighthouse_audit', timeout: 120000, retryCount: 2, retryDelay: 10000 },
    { id: 'P12_S02', agentId: 'performance-agent', action: 'cwv_check', inputFrom: 'P12_S01', timeout: 60000, retryCount: 1, retryDelay: 5000 },
    { id: 'P12_S03', agentId: 'performance-agent', action: 'bundle_analysis', inputFrom: 'P12_S02', timeout: 60000, retryCount: 1, retryDelay: 5000 },
  ],
};

/**
 * P13: データ分析パイプライン（Data Team）
 */
const P13_DATA_ANALYSIS: PipelineDefinition = {
  id: 'P13',
  name: 'データ分析パイプライン',
  trigger: { type: 'schedule', cron: '0 7 * * *' },
  onFailure: 'skip',
  steps: [
    { id: 'P13_S01', agentId: 'data-analyst', action: 'daily_report', timeout: 120000, retryCount: 2, retryDelay: 10000 },
    { id: 'P13_S02', agentId: 'insight-agent', action: 'anomaly_detection', inputFrom: 'P13_S01', timeout: 60000, retryCount: 1, retryDelay: 5000 },
    { id: 'P13_S03', agentId: 'insight-agent', action: 'generate_insights', inputFrom: 'P13_S02', timeout: 90000, retryCount: 1, retryDelay: 5000 },
  ],
};

/**
 * P14: A/Bテストパイプライン（Data Team）
 */
const P14_AB_TEST: PipelineDefinition = {
  id: 'P14',
  name: 'A/Bテストパイプライン',
  trigger: { type: 'manual' },
  onFailure: 'skip',
  steps: [
    { id: 'P14_S01', agentId: 'ab-test-agent', action: 'create_experiment', timeout: 60000, retryCount: 1, retryDelay: 5000 },
    { id: 'P14_S02', agentId: 'ab-test-agent', action: 'analyze_experiment', inputFrom: 'P14_S01', timeout: 120000, retryCount: 2, retryDelay: 10000 },
    { id: 'P14_S03', agentId: 'ab-test-agent', action: 'significance_test', inputFrom: 'P14_S02', timeout: 60000, retryCount: 1, retryDelay: 5000 },
  ],
};

/**
 * P15: インサイト生成パイプライン（Data Team）
 */
const P15_INSIGHTS: PipelineDefinition = {
  id: 'P15',
  name: 'インサイト生成パイプライン',
  trigger: { type: 'schedule', cron: '0 8 * * 1' },
  onFailure: 'skip',
  steps: [
    { id: 'P15_S01', agentId: 'data-analyst', action: 'funnel_analysis', timeout: 90000, retryCount: 2, retryDelay: 5000 },
    { id: 'P15_S02', agentId: 'insight-agent', action: 'customer_segmentation', inputFrom: 'P15_S01', timeout: 90000, retryCount: 1, retryDelay: 5000 },
    { id: 'P15_S03', agentId: 'insight-agent', action: 'trend_analysis', inputFrom: 'P15_S02', timeout: 60000, retryCount: 1, retryDelay: 5000 },
  ],
};

/**
 * P16: カスタマーサポートパイプライン（Support Team）
 */
const P16_SUPPORT: PipelineDefinition = {
  id: 'P16',
  name: 'カスタマーサポートパイプライン',
  trigger: { type: 'event', eventType: 'support.ticket.created' },
  onFailure: 'skip',
  steps: [
    { id: 'P16_S01', agentId: 'support-agent', action: 'ticket_response', timeout: 30000, retryCount: 2, retryDelay: 3000 },
    { id: 'P16_S02', agentId: 'support-agent', action: 'customer_feedback_analyze', inputFrom: 'P16_S01', timeout: 60000, retryCount: 1, retryDelay: 5000 },
  ],
};

/**
 * P17: 注文リアルタイム処理パイプライン（Revenue Team）
 * 障害#6修正: Webhook→Pipeline接続ギャップを埋める
 * Webhookが発行する webhook.orders.paid イベントを受信し、
 * データ分析 → インサイト抽出 → アトリビューション計算を実行。
 * これがないと注文データはBusに流れるだけで誰も処理しない（血液が流れても酸素交換されない状態）
 */
const P17_ORDER_PROCESSING: PipelineDefinition = {
  id: 'P17',
  name: '注文リアルタイム処理パイプライン',
  trigger: { type: 'event', eventType: 'webhook.orders.paid' },
  onFailure: 'skip',
  steps: [
    { id: 'P17_S01', agentId: 'data-analyst', action: 'order_analysis', timeout: 60000, retryCount: 2, retryDelay: 5000 },
    { id: 'P17_S02', agentId: 'insight-agent', action: 'revenue_insight', inputFrom: 'P17_S01', timeout: 60000, retryCount: 1, retryDelay: 5000 },
  ],
};

// ── Phase 2A: 新エージェント用パイプライン（血管新生 — 新臓器への血液供給） ──

/**
 * P18: 在庫最適化パイプライン（Product Team — InventoryMonitor配線）
 * 在庫チェック → 需要予測 → 欠品防止 → レポート
 */
const P18_INVENTORY: PipelineDefinition = {
  id: 'P18',
  name: '在庫最適化パイプライン',
  trigger: { type: 'schedule', cron: '0 */4 * * *' }, // 4時間毎
  onFailure: 'retry',
  steps: [
    { id: 'P18_S01', agentId: 'inventory-monitor', action: 'check_stock', timeout: 120000, retryCount: 2, retryDelay: 10000 },
    { id: 'P18_S02', agentId: 'inventory-monitor', action: 'forecast_demand', inputFrom: 'P18_S01', timeout: 60000, retryCount: 1, retryDelay: 5000 },
    { id: 'P18_S03', agentId: 'inventory-monitor', action: 'stockout_prevention', inputFrom: 'P18_S02', timeout: 30000, retryCount: 1, retryDelay: 3000 },
  ],
};

/**
 * P19: エグゼクティブレポートパイプライン（Data Team — BusinessAnalyst + AnalyticsAgent配線）
 * KPI分析 → CXスコア → ファネルレポート → 100億シミュレーション → 週次レポート
 */
const P19_EXECUTIVE_REPORT: PipelineDefinition = {
  id: 'P19',
  name: 'エグゼクティブレポートパイプライン',
  trigger: { type: 'schedule', cron: '0 9 * * 1' }, // 毎週月曜9時
  onFailure: 'skip',
  steps: [
    { id: 'P19_S01', agentId: 'business-analyst', action: 'executive_kpi', timeout: 60000, retryCount: 2, retryDelay: 5000 },
    { id: 'P19_S02', agentId: 'analytics-agent', action: 'cx_score', inputFrom: 'P19_S01', timeout: 60000, retryCount: 1, retryDelay: 5000 },
    { id: 'P19_S03', agentId: 'analytics-agent', action: 'funnel_report', inputFrom: 'P19_S02', timeout: 60000, retryCount: 1, retryDelay: 5000 },
    { id: 'P19_S04', agentId: 'business-analyst', action: 'revenue_simulation', inputFrom: 'P19_S03', timeout: 60000, retryCount: 1, retryDelay: 5000 },
    { id: 'P19_S05', agentId: 'business-analyst', action: 'weekly_report', inputFrom: 'P19_S04', timeout: 90000, retryCount: 1, retryDelay: 5000 },
  ],
};

/**
 * P20: インフラ保守パイプライン（Engineering Team — InfraManager + ErrorMonitor + AuthManager配線）
 * インフラヘルスチェック → セキュリティスキャン → エラーレポート → 稼働率チェック
 */
const P20_INFRA_MAINTENANCE: PipelineDefinition = {
  id: 'P20',
  name: 'インフラ保守パイプライン',
  trigger: { type: 'schedule', cron: '0 */6 * * *' }, // 6時間毎
  onFailure: 'retry',
  steps: [
    { id: 'P20_S01', agentId: 'infra-manager', action: 'health_check_infra', timeout: 120000, retryCount: 2, retryDelay: 10000 },
    { id: 'P20_S02', agentId: 'infra-manager', action: 'security_scan', inputFrom: 'P20_S01', timeout: 90000, retryCount: 1, retryDelay: 5000 },
    { id: 'P20_S03', agentId: 'error-monitor', action: 'error_report', inputFrom: 'P20_S02', timeout: 60000, retryCount: 1, retryDelay: 5000 },
    { id: 'P20_S04', agentId: 'error-monitor', action: 'uptime_check', inputFrom: 'P20_S03', timeout: 30000, retryCount: 1, retryDelay: 3000 },
  ],
};

/**
 * P21: 安全デプロイパイプライン（Engineering Team — DeployManager + AuthManager配線）
 * 認証確認 → ステージングデプロイ → インフラ検証 → エラー監視 → 完了通知
 */
const P21_SAFE_DEPLOY: PipelineDefinition = {
  id: 'P21',
  name: '安全デプロイパイプライン',
  trigger: { type: 'manual' },
  onFailure: 'halt',
  steps: [
    { id: 'P21_S01', agentId: 'auth-manager', action: 'validate_session', timeout: 10000, retryCount: 1, retryDelay: 2000 },
    { id: 'P21_S02', agentId: 'deploy-manager', action: 'deploy_staging', inputFrom: 'P21_S01', timeout: 300000, retryCount: 1, retryDelay: 30000 },
    { id: 'P21_S03', agentId: 'infra-manager', action: 'health_check_infra', inputFrom: 'P21_S02', timeout: 120000, retryCount: 2, retryDelay: 10000 },
    { id: 'P21_S04', agentId: 'error-monitor', action: 'monitor_errors', inputFrom: 'P21_S03', timeout: 60000, retryCount: 1, retryDelay: 5000 },
  ],
};

// ── Phase 2C パイプライン（#46-50） ──

/**
 * P22: SNS/広告チャネル最適化パイプライン（#46: 動的チャネル連携）
 * SNSメトリクス収集 → 広告パフォーマンス分析 → コンテンツ最適化提案 → 承認
 * Phase 2BのProvider群とApprovalOrchestratorを統合。
 */
const P22_CHANNEL_OPTIMIZATION: PipelineDefinition = {
  id: 'P22',
  name: 'SNS/広告チャネル最適化パイプライン',
  trigger: { type: 'schedule', cron: '0 8 * * 1' }, // 毎週月曜8時
  onFailure: 'skip',
  steps: [
    { id: 'P22_S01', agentId: 'analytics-agent', action: 'event_tracking', timeout: 60000, retryCount: 2, retryDelay: 5000 },
    { id: 'P22_S02', agentId: 'data-analyst', action: 'analyze_data', inputFrom: 'P22_S01', timeout: 60000, retryCount: 1, retryDelay: 5000 },
    { id: 'P22_S03', agentId: 'content-writer', action: 'generate_content', inputFrom: 'P22_S02', timeout: 90000, retryCount: 1, retryDelay: 5000 },
    { id: 'P22_S04', agentId: 'quality-auditor', action: 'content_review', inputFrom: 'P22_S03', timeout: 45000, retryCount: 1, retryDelay: 3000 },
  ],
};

/**
 * P23: 競合インテリジェンスパイプライン（#46: サービス連携）
 * 競合データ収集 → AI可視性チェック → GSCデータ統合 → インサイト生成
 */
const P23_COMPETITIVE_INTELLIGENCE: PipelineDefinition = {
  id: 'P23',
  name: '競合インテリジェンスパイプライン',
  trigger: { type: 'schedule', cron: '0 6 * * 0' }, // 毎週日曜6時
  onFailure: 'skip',
  steps: [
    { id: 'P23_S01', agentId: 'data-analyst', action: 'analyze_data', timeout: 120000, retryCount: 2, retryDelay: 10000 },
    { id: 'P23_S02', agentId: 'seo-director', action: 'ranking_check', inputFrom: 'P23_S01', timeout: 60000, retryCount: 2, retryDelay: 5000 },
    { id: 'P23_S03', agentId: 'insight-agent', action: 'generate_insights', inputFrom: 'P23_S02', timeout: 60000, retryCount: 1, retryDelay: 5000 },
    { id: 'P23_S04', agentId: 'business-analyst', action: 'executive_kpi', inputFrom: 'P23_S03', timeout: 60000, retryCount: 1, retryDelay: 5000 },
  ],
};

/**
 * P24: 多段階品質検証パイプライン（#47: 多段階検証PoC）
 * コード品質 → セキュリティスキャン → パフォーマンステスト → UX検証 → 最終承認
 * 5段階の検証ゲートを通過しないとデプロイ不可。
 */
const P24_MULTI_STAGE_VALIDATION: PipelineDefinition = {
  id: 'P24',
  name: '多段階品質検証パイプライン',
  trigger: { type: 'event', eventType: 'deploy.staging.requested' },
  onFailure: 'halt', // 1段階でも失敗したら停止
  steps: [
    { id: 'P24_S01', agentId: 'quality-auditor', action: 'code_review', timeout: 120000, retryCount: 1, retryDelay: 5000 },
    { id: 'P24_S02', agentId: 'security-agent', action: 'security_scan', inputFrom: 'P24_S01', timeout: 120000, retryCount: 1, retryDelay: 10000 },
    { id: 'P24_S03', agentId: 'performance-agent', action: 'performance_audit', inputFrom: 'P24_S02', timeout: 180000, retryCount: 1, retryDelay: 10000 },
    { id: 'P24_S04', agentId: 'ux-agent', action: 'ux_audit', inputFrom: 'P24_S03', timeout: 60000, retryCount: 1, retryDelay: 5000 },
    { id: 'P24_S05', agentId: 'error-monitor', action: 'uptime_check', inputFrom: 'P24_S04', timeout: 30000, retryCount: 1, retryDelay: 5000 },
  ],
};

/**
 * P25: レッドチームセキュリティパイプライン（#48: セキュリティ監査）
 * 攻撃シミュレーション → 脆弱性検出 → CSPレビュー → インフラ検証 → レポート
 */
const P25_RED_TEAM_SECURITY: PipelineDefinition = {
  id: 'P25',
  name: 'レッドチームセキュリティパイプライン',
  trigger: { type: 'manual' },
  onFailure: 'halt',
  steps: [
    { id: 'P25_S01', agentId: 'security-agent', action: 'vulnerability_scan', timeout: 300000, retryCount: 1, retryDelay: 30000 },
    { id: 'P25_S02', agentId: 'auth-manager', action: 'validate_session', inputFrom: 'P25_S01', timeout: 30000, retryCount: 1, retryDelay: 5000 },
    { id: 'P25_S03', agentId: 'infra-manager', action: 'security_scan', inputFrom: 'P25_S02', timeout: 120000, retryCount: 1, retryDelay: 10000 },
    { id: 'P25_S04', agentId: 'error-monitor', action: 'error_report', inputFrom: 'P25_S03', timeout: 30000, retryCount: 1, retryDelay: 5000 },
  ],
};

/**
 * P26: A/Bテスト自動化パイプライン（#49: GrowthBook統合）
 * テスト設計 → バリアント生成 → 計測開始 → 統計分析 → 勝者適用
 */
const P26_AB_TEST_AUTOMATION: PipelineDefinition = {
  id: 'P26',
  name: 'A/Bテスト自動化パイプライン',
  trigger: { type: 'event', eventType: 'ab_test.requested' },
  onFailure: 'retry',
  steps: [
    { id: 'P26_S01', agentId: 'ab-test-agent', action: 'design_test', timeout: 60000, retryCount: 1, retryDelay: 5000 },
    { id: 'P26_S02', agentId: 'analytics-agent', action: 'event_tracking', inputFrom: 'P26_S01', timeout: 30000, retryCount: 1, retryDelay: 5000 },
    { id: 'P26_S03', agentId: 'data-analyst', action: 'analyze_data', inputFrom: 'P26_S02', timeout: 60000, retryCount: 1, retryDelay: 5000 },
    { id: 'P26_S04', agentId: 'insight-agent', action: 'generate_insights', inputFrom: 'P26_S03', timeout: 30000, retryCount: 1, retryDelay: 5000 },
  ],
};

/**
 * P27: GEO（AI推薦最適化）パイプライン（#50: AI検索対応）
 * AI可視性チェック → 構造化データ最適化 → コンテンツ最適化 → 効果測定
 * ChatGPT/Gemini/PerplexityでのAstromeda推薦順位向上施策。
 */
const P27_GEO_AI_OPTIMIZATION: PipelineDefinition = {
  id: 'P27',
  name: 'GEO（AI推薦最適化）パイプライン',
  trigger: { type: 'schedule', cron: '0 7 * * 3' }, // 毎週水曜7時
  onFailure: 'skip',
  steps: [
    { id: 'P27_S01', agentId: 'seo-director', action: 'seo_audit', timeout: 120000, retryCount: 2, retryDelay: 10000 },
    { id: 'P27_S02', agentId: 'content-writer', action: 'generate_content', inputFrom: 'P27_S01', timeout: 90000, retryCount: 1, retryDelay: 5000 },
    { id: 'P27_S03', agentId: 'quality-auditor', action: 'content_review', inputFrom: 'P27_S02', timeout: 45000, retryCount: 1, retryDelay: 3000 },
    { id: 'P27_S04', agentId: 'analytics-agent', action: 'event_tracking', inputFrom: 'P27_S03', timeout: 30000, retryCount: 1, retryDelay: 5000 },
  ],
};

/** 全パイプライン定義の配列（循環系の全血管定義） — Phase 2C: 21→27本 */
export const ALL_PIPELINES: PipelineDefinition[] = [
  P01_BANNER_GENERATION, P02_CATALOG_UPDATE, P03_CONTENT_GENERATION,
  P04_SEO_OPTIMIZATION, P05_QUALITY_AUDIT, P06_PRICING_OPTIMIZATION,
  P07_PRICE_OPTIMIZATION, P08_CAMPAIGN, P09_CONVERSION, P10_DEPLOY,
  P11_SECURITY, P12_PERFORMANCE, P13_DATA_ANALYSIS, P14_AB_TEST,
  P15_INSIGHTS, P16_SUPPORT, P17_ORDER_PROCESSING,
  P18_INVENTORY, P19_EXECUTIVE_REPORT, P20_INFRA_MAINTENANCE, P21_SAFE_DEPLOY,
  P22_CHANNEL_OPTIMIZATION, P23_COMPETITIVE_INTELLIGENCE, P24_MULTI_STAGE_VALIDATION,
  P25_RED_TEAM_SECURITY, P26_AB_TEST_AUTOMATION, P27_GEO_AI_OPTIMIZATION,
];

export function getDefaultPipelines(): PipelineDefinition[] {
  return [...ALL_PIPELINES];
}

/**
 * 特定パイプライン定義を取得
 */
export function getPipelineDefinition(pipelineId: string): PipelineDefinition | undefined {
  const all = getDefaultPipelines();
  return all.find((p) => p.id === pipelineId);
}

/**
 * パイプラインの説明を取得
 */
export function getPipelineDescription(pipelineId: string): string {
  const descriptions: Record<string, string> = {
    P01: 'IPコラボレーション用バナー画像を自動生成し、品質検査を実施します',
    P02: 'Shopify商品カタログを定期的に更新し、説明文とSEOメタデータを生成します',
    P03: 'ブログ記事やランディングページのコンテンツを生成・最適化します',
    P04: 'キーワード分析とコンテンツ改善により、SEOランキングを向上させます',
    P05: 'サイト全体の品質をチェックし、改善レポートを生成します',
    P06: '商品カタログの整合性と完全性を定期監査します',
    P07: '競合価格分析・需要予測に基づき、動的価格最適化を実行します',
    P08: 'キャンペーン企画からクリエイティブ制作・配信スケジュールまで一貫実行します',
    P09: 'チェックアウトファネル分析と離脱要因の特定・改善提案を行います',
    P10: 'ビルド→コードレビュー→ステージング→本番の安全なデプロイフローを実行します',
    P11: '依存関係チェック・脆弱性スキャン・CSPレビューのセキュリティ監査を実施します',
    P12: 'Lighthouse監査・CWV計測・バンドル分析によりパフォーマンスを最適化します',
    P13: '日次レポート生成・異常値検知・インサイト抽出のデータ分析を実行します',
    P14: 'A/Bテストの設計・実行・統計的有意性検定を一貫して管理します',
    P15: 'ファネル分析・顧客セグメント・トレンド分析から戦略的インサイトを生成します',
    P16: 'サポートチケット対応とカスタマーフィードバック分析を実行します',
    P17: 'Webhook注文イベントを受信し、リアルタイムで売上分析とインサイト抽出を実行します',
    P18: '在庫レベルを定期監視し、需要予測・欠品防止アラートを生成します',
    P19: 'エグゼクティブ向けKPI・CX・ファネル・100億シミュレーションレポートを生成します',
    P20: 'インフラヘルスチェック・セキュリティスキャン・エラー監視・稼働率追跡を実行します',
    P21: '認証確認→ステージングデプロイ→検証→エラー監視の安全デプロイフローを実行します',
    P22: 'SNSメトリクス・広告パフォーマンスを分析し、コンテンツ最適化提案を生成します',
    P23: '競合7社+AI可視性+GSCデータを統合し、競争優位インサイトを生成します',
    P24: 'コード品質→セキュリティ→パフォーマンス→UX→稼働率の5段階検証ゲートを実行します',
    P25: '攻撃シミュレーション・脆弱性検出・CSPレビュー・インフラ検証のレッドチーム監査を実行します',
    P26: 'A/Bテスト設計→バリアント生成→計測→統計分析→勝者適用を自動化します',
    P27: 'AI検索エンジンでの推薦順位向上のためコンテンツ・構造化データを最適化します',
  };
  return descriptions[pipelineId] || '未知のパイプライン';
}
