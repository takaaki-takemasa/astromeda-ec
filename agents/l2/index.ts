/**
 * L2 Agents — 実行ワーカー層（分化細胞群）
 *
 * 全24体のL2専門エージェントをエクスポート。
 * L1リードから指令を受けて専門タスクを実行する。
 */

// 基底クラス
export {BaseL2Agent} from './base-l2-agent';

// Product Team (ProductLead管轄)
export {ImageGenerator} from './image-generator';
export {ProductCatalog} from './product-catalog';
export {UXAgent} from './ux-agent';
export {InventoryMonitor} from './inventory-monitor'; // Phase 2A #25

// Marketing Team (MarketingLead管轄)
export {ContentWriter} from './content-writer';
export {SEODirector} from './seo-director';

// Sales Team (SalesLead管轄)
export {PricingAgent} from './pricing-agent';
export {PromotionAgent} from './promotion-agent';
export {ConversionAgent} from './conversion-agent';

// Engineering Team (EngineeringLead管轄)
export {DevOpsAgent} from './devops-agent';
export {SecurityAgent} from './security-agent';
export {AISecurityAuditor} from './ai-security-auditor'; // Phase 2B G-040 適応免疫
export {PerformanceAgent} from './performance-agent';
export {AuthManager} from './auth-manager'; // Phase 2A #27
export {InfraManager} from './infra-manager'; // Phase 2A #28
export {DeployManager} from './deploy-manager'; // Phase 2A #29
export {ErrorMonitor} from './error-monitor'; // Phase 2A #31

// Data Team (DataLead管轄)
export {DataAnalyst} from './data-analyst';
export {ABTestAgent} from './ab-test-agent';
export {InsightAgent} from './insight-agent';
export {BusinessAnalyst} from './business-analyst'; // Phase 2A #26
export {AnalyticsAgent} from './analytics-agent'; // Phase 2A #32

// Support Team (SupportLead管轄)
export {SupportAgent} from './support-agent';

// Intelligence Team (横断監査)
export {QualityAuditor} from './quality-auditor';

// Infrastructure (動的エージェント生成)
export {AgentFactory} from './agent-factory';
