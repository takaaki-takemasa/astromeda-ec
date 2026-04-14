/**
 * Agent Blueprints — エージェント遺伝情報定義（Q-01分割）
 *
 * 生体対応: DNA設計図
 * 全30体のAIエージェントの能力・設定・依存関係を宣言的に定義する。
 * agent-registration.ts から分割: 純粋なデータ定義のみを含む。
 */

import type { AgentBlueprint } from '../core/types.js';

/** 汎用Blueprint生成（新規L2 Agent用フォールバック） */
export function createGenericBlueprint(id: string, team: string, capabilities: string[]): AgentBlueprint {
  return {
    id,
    agentType: 'L2-Worker',
    version: '1.0.0',
    config: { team },
    capabilities,
    dependencies: [`${team}-lead`],
    healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 },
  };
}

/**
 * 全30体のエージェントBlueprintを生成
 * L0(1) + L1(5) + L2(24) = 30体
 */
export function createAgentBlueprints(): Map<string, AgentBlueprint> {
  return new Map([
    // L0 Commander
    [
      'commander',
      {
        id: 'commander',
        agentType: 'L0-Commander',
        version: '1.0.0',
        config: {
          andonEnabled: true,
          wbrIntervalMs: 604800000, // 1 week
          cascadeTimeout: 30000,
        },
        capabilities: [
          'orchestration',
          'cascade_command',
          'andon_control',
          'system_health_monitoring',
        ],
        dependencies: [],
        healthCheck: {
          interval: 30000,
          timeout: 5000,
          unhealthyThreshold: 3,
        },
      },
    ],

    // L1 ProductLead
    [
      'product-lead',
      {
        id: 'product-lead',
        agentType: 'L1-Lead',
        version: '1.0.0',
        config: {
          teamName: 'Product',
          maxConcurrentTasks: 3,
          healthCheckIntervalMs: 30000,
        },
        capabilities: [
          'banner_generation',
          'product_catalog_management',
          'ux_optimization',
          'task_delegation',
        ],
        dependencies: ['commander'],
        healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 },
      },
    ],

    // L1 MarketingLead
    [
      'marketing-lead',
      {
        id: 'marketing-lead',
        agentType: 'L1-Lead',
        version: '1.0.0',
        config: {
          teamName: 'Marketing',
          maxConcurrentTasks: 2,
          healthCheckIntervalMs: 30000,
        },
        capabilities: [
          'seo_optimization',
          'content_generation',
          'keyword_research',
          'task_delegation',
        ],
        dependencies: ['commander'],
        healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 },
      },
    ],

    // L1 OperationsLead
    [
      'operations-lead',
      {
        id: 'operations-lead',
        agentType: 'L1-Lead',
        version: '1.0.0',
        config: {
          teamName: 'Operations',
          maxConcurrentTasks: 4,
          healthCheckIntervalMs: 30000,
        },
        capabilities: [
          'pricing_optimization',
          'promotion_management',
          'conversion_optimization',
          'task_delegation',
        ],
        dependencies: ['commander'],
        healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 },
      },
    ],

    // L1 TechnologyLead
    [
      'technology-lead',
      {
        id: 'technology-lead',
        agentType: 'L1-Lead',
        version: '1.0.0',
        config: {
          teamName: 'Technology',
          maxConcurrentTasks: 5,
          healthCheckIntervalMs: 20000,
        },
        capabilities: [
          'deployment',
          'security_audit',
          'performance_monitoring',
          'quality_assurance',
          'task_delegation',
        ],
        dependencies: ['commander'],
        healthCheck: { interval: 20000, timeout: 5000, unhealthyThreshold: 3 },
      },
    ],

    // L1 AnalyticsLead
    [
      'analytics-lead',
      {
        id: 'analytics-lead',
        agentType: 'L1-Lead',
        version: '1.0.0',
        config: {
          teamName: 'Analytics',
          maxConcurrentTasks: 3,
          healthCheckIntervalMs: 30000,
        },
        capabilities: [
          'data_analysis',
          'ab_testing',
          'insight_generation',
          'reporting',
          'task_delegation',
        ],
        dependencies: ['commander'],
        healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 },
      },
    ],

    // L2 ImageGenerator
    ['image-generator', { id: 'image-generator', agentType: 'L2-Worker', version: '1.0.0', config: { supportedFormats: ['webp', 'png', 'jpg'], maxConcurrentGenerations: 3 }, capabilities: ['image_generation', 'banner_creation', 'image_optimization'], dependencies: ['product-lead'], healthCheck: { interval: 20000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 ProductCatalog
    ['product-catalog', { id: 'product-catalog', agentType: 'L2-Worker', version: '1.0.0', config: { syncIntervalMs: 3600000, batchSize: 100 }, capabilities: ['product_sync', 'catalog_management', 'inventory_tracking', 'product_validation'], dependencies: ['product-lead'], healthCheck: { interval: 20000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 UXAgent
    ['ux-agent', { id: 'ux-agent', agentType: 'L2-Worker', version: '1.0.0', config: { lighthouseIntervalMs: 86400000, a2bTestDuration: 604800000 }, capabilities: ['ux_testing', 'lighthouse_audit', 'a_b_testing', 'performance_analysis'], dependencies: ['product-lead'], healthCheck: { interval: 20000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 ContentWriter
    ['content-writer', { id: 'content-writer', agentType: 'L2-Worker', version: '1.0.0', config: { maxArticleLength: 5000, supportedLanguages: ['ja', 'en'] }, capabilities: ['article_generation', 'content_writing', 'product_description'], dependencies: ['marketing-lead'], healthCheck: { interval: 20000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 SEODirector
    ['seo-director', { id: 'seo-director', agentType: 'L2-Worker', version: '1.0.0', config: { rankingCheckIntervalMs: 604800000, keywordTargetMin: 50 }, capabilities: ['seo_optimization', 'keyword_research', 'ranking_analysis', 'meta_tag_generation'], dependencies: ['marketing-lead'], healthCheck: { interval: 20000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 QualityAuditor
    ['quality-auditor', { id: 'quality-auditor', agentType: 'L2-Worker', version: '1.0.0', config: { auditIntervalMs: 86400000, scoreThreshold: 0.8 }, capabilities: ['quality_audit', 'content_validation', 'image_quality_check', 'seo_validation'], dependencies: [], healthCheck: { interval: 20000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 AgentFactory
    ['agent-factory', { id: 'agent-factory', agentType: 'L2-Worker', version: '1.0.0', config: { maxConcurrentCreations: 2, templatePath: './agent-templates' }, capabilities: ['agent_creation', 'template_instantiation', 'dynamic_provisioning'], dependencies: [], healthCheck: { interval: 20000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 PricingAgent（Sales Team — 価格決定の内分泌系）
    ['pricing-agent', { id: 'pricing-agent', agentType: 'L2-Worker', version: '1.0.0', config: { minMarginPercent: 15, maxDiscountPercent: 30, competitorCheckIntervalMs: 86400000, dynamicPricingEnabled: true, priceChangeRequiresApproval: true }, capabilities: ['competitor_price_analysis', 'dynamic_pricing', 'margin_calculation', 'discount_rule_management', 'price_history_tracking'], dependencies: ['operations-lead'], healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 PromotionAgent（Sales Team — キャンペーンの免疫記憶）
    ['promotion-agent', { id: 'promotion-agent', agentType: 'L2-Worker', version: '1.0.0', config: { maxActiveCampaigns: 5, defaultCampaignDurationDays: 14, scheduleLeadTimeHours: 24, discountCodePrefix: 'ASTRO_' }, capabilities: ['campaign_creation', 'discount_code_generation', 'sale_scheduling', 'landing_page_coordination', 'campaign_performance_tracking'], dependencies: ['operations-lead'], healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 ConversionAgent（Sales Team — 消化吸収効率の最適化）
    ['conversion-agent', { id: 'conversion-agent', agentType: 'L2-Worker', version: '1.0.0', config: { checkoutAnalysisIntervalMs: 86400000, abandonmentThresholdPercent: 70, funnelSteps: ['view', 'add_to_cart', 'checkout_start', 'payment', 'complete'] }, capabilities: ['checkout_funnel_analysis', 'cart_abandonment_detection', 'conversion_rate_optimization', 'ux_bottleneck_identification', 'checkout_flow_monitoring'], dependencies: ['operations-lead'], healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 DevOpsAgent（Engineering Team — 循環器外科医）
    ['devops-agent', { id: 'devops-agent', agentType: 'L2-Worker', version: '1.0.0', config: { stagingUrl: 'https://staging-mining-base.myshopify.com', productionStore: 'production-mining-base', deployTimeoutMs: 300000, requiresStagingVerification: true, rollbackEnabled: true }, capabilities: ['hydrogen_build', 'oxygen_deploy', 'staging_verification', 'production_deploy', 'rollback_execution', 'build_artifact_management'], dependencies: ['technology-lead'], healthCheck: { interval: 20000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 SecurityAgent（Engineering Team — 免疫系の白血球）
    ['security-agent', { id: 'security-agent', agentType: 'L2-Worker', version: '1.0.0', config: { vulnerabilityScanIntervalMs: 604800000, cspReviewEnabled: true, dependencyAuditEnabled: true, maxCriticalVulnerabilities: 0 }, capabilities: ['dependency_vulnerability_scan', 'csp_policy_review', 'hmac_verification', 'auth_token_audit', 'security_header_check', 'xss_prevention_audit'], dependencies: ['technology-lead'], healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 PerformanceAgent（Engineering Team — 心肺機能の計測師）
    ['performance-agent', { id: 'performance-agent', agentType: 'L2-Worker', version: '1.0.0', config: { lighthouseTargetScore: 90, cwvThresholds: { lcp: 2500, fid: 100, cls: 0.1 }, bundleSizeLimitKb: 500, monitoringIntervalMs: 86400000 }, capabilities: ['lighthouse_audit', 'core_web_vitals_measurement', 'bundle_size_analysis', 'image_optimization_check', 'ttfb_monitoring', 'render_blocking_detection'], dependencies: ['technology-lead'], healthCheck: { interval: 20000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 DataAnalyst（Data Team — 血液検査技師）
    ['data-analyst', { id: 'data-analyst', agentType: 'L2-Worker', version: '1.0.0', config: { dailyReportHour: 7, anomalyDetectionSensitivity: 2, dataRetentionDays: 90, revenueTrackingEnabled: true }, capabilities: ['daily_revenue_report', 'order_analysis', 'funnel_analysis', 'anomaly_detection', 'revenue_forecasting', 'customer_behavior_analysis'], dependencies: ['analytics-lead'], healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 ABTestAgent（Data Team — 臨床試験の治験責任医師）
    ['ab-test-agent', { id: 'ab-test-agent', agentType: 'L2-Worker', version: '1.0.0', config: { minSampleSize: 1000, significanceLevel: 0.05, maxConcurrentExperiments: 3, defaultTestDurationDays: 14 }, capabilities: ['experiment_design', 'traffic_splitting', 'statistical_significance_test', 'experiment_analysis', 'variant_comparison', 'winner_determination'], dependencies: ['analytics-lead'], healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 InsightAgent（Data Team — 病理診断医）
    ['insight-agent', { id: 'insight-agent', agentType: 'L2-Worker', version: '1.0.0', config: { segmentationMinClusterSize: 50, trendAnalysisWindowDays: 30, topInsightsCount: 5, aiAnalysisEnabled: true }, capabilities: ['customer_segmentation', 'trend_analysis', 'revenue_insight_generation', 'behavioral_pattern_detection', 'recommendation_engine', 'cohort_analysis'], dependencies: ['analytics-lead'], healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 SupportAgent（Support Team — 救急外来の受付医）
    ['support-agent', { id: 'support-agent', agentType: 'L2-Worker', version: '1.0.0', config: { responseTimeTargetMs: 30000, faqDatabaseEnabled: true, escalationThreshold: 3, feedbackCollectionEnabled: true }, capabilities: ['ticket_triage', 'faq_response', 'customer_feedback_analysis', 'escalation_management', 'satisfaction_tracking', 'response_template_management'], dependencies: ['commander'], healthCheck: { interval: 20000, timeout: 5000, unhealthyThreshold: 3 } }],

    // ── Phase 2A: 新規7体 ──

    // L2 InventoryMonitor（Product Team — 在庫水位センサー）
    ['inventory-monitor', { id: 'inventory-monitor', agentType: 'L2-Worker', version: '1.0.0', config: { checkIntervalMs: 3600000, defaultSafetyStock: 5, alertThresholdPercent: 30, demandForecastEnabled: true }, capabilities: ['stock_level_monitoring', 'demand_forecasting', 'reorder_alert_generation', 'stockout_prevention', 'inventory_reporting'], dependencies: ['product-lead'], healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 BusinessAnalyst（Data Team — 前頭葉戦略思考）
    ['business-analyst', { id: 'business-analyst', agentType: 'L2-Worker', version: '1.0.0', config: { revenueTarget: 10_000_000_000, kpiRetentionDays: 365, weeklyReportEnabled: true, simulationScenariosMax: 10 }, capabilities: ['executive_kpi_analysis', 'revenue_simulation', 'channel_roi_analysis', 'weekly_report_generation', 'dashboard_data_provision'], dependencies: ['analytics-lead'], healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 AuthManager（Engineering Team — MHC免疫識別）
    ['auth-manager', { id: 'auth-manager', agentType: 'L2-Worker', version: '1.0.0', config: { sessionDurationMs: 86400000, maxAuditLogEntries: 10000, rbacRoles: ['super_admin', 'admin', 'editor', 'viewer', 'guest'], requireMFAForAdmin: true }, capabilities: ['session_validation', 'permission_checking', 'audit_logging', 'user_management', 'role_assignment'], dependencies: ['technology-lead'], healthCheck: { interval: 20000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 InfraManager（Engineering Team — 骨格筋系統制御）
    ['infra-manager', { id: 'infra-manager', agentType: 'L2-Worker', version: '1.0.0', config: { healthCheckIntervalMs: 300000, requiredAPIs: ['shopify-storefront', 'shopify-admin', 'claude-api'], configValidationEnabled: true }, capabilities: ['infrastructure_health_check', 'configuration_validation', 'api_status_monitoring', 'registry_management', 'security_scanning'], dependencies: ['technology-lead'], healthCheck: { interval: 20000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 DeployManager（Engineering Team — 心臓弁膜制御）
    ['deploy-manager', { id: 'deploy-manager', agentType: 'L2-Worker', version: '1.0.0', config: { stagingVerificationRequired: true, productionDeployBlocked: true, rollbackEnabled: true, maxDeployHistory: 200 }, capabilities: ['staging_deployment', 'production_deployment', 'rollback_execution', 'preview_environment', 'deployment_status_tracking'], dependencies: ['technology-lead'], healthCheck: { interval: 20000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 ErrorMonitor（Engineering Team — 侵害受容器）
    ['error-monitor', { id: 'error-monitor', agentType: 'L2-Worker', version: '1.0.0', config: { errorRateWarningPercent: 1, errorRateCriticalPercent: 5, maxErrorHistory: 5000, autoRecoveryEnabled: true, uptimeTarget: 99.9 }, capabilities: ['error_rate_monitoring', 'http_error_detection', 'auto_recovery', 'uptime_tracking', 'error_report_generation'], dependencies: ['technology-lead'], healthCheck: { interval: 15000, timeout: 5000, unhealthyThreshold: 3 } }],

    // L2 AnalyticsAgent（Data Team — 視覚野）
    ['analytics-agent', { id: 'analytics-agent', agentType: 'L2-Worker', version: '1.0.0', config: { eventRetentionMax: 10000, sessionRetentionMax: 5000, cxScoreEnabled: true, funnelTrackingEnabled: true, integrations: ['ga4', 'meta_pixel', 'clarity', 'gtm'] }, capabilities: ['event_tracking_analysis', 'heatmap_analysis', 'session_analysis', 'cx_score_calculation', 'funnel_report_generation'], dependencies: ['analytics-lead'], healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 } }],
  ]);
}
