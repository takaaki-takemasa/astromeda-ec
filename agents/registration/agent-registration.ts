/**
 * Agent Registration Module — エージェント登録システム（細胞構成図）
 *
 * 生体対応: 細胞構成図（Cellularity Map）
 * 全30体のAIエージェント（L0 Commander x1 + L1 Lead x5 + L2 Worker x24）+
 * Phase 2Bインフラ（Data Collection/Provider/Approval/Feedback）を
 * AgentBusおよびAgentRegistryに登録し、システムを初期化する。
 *
 * 登録階層:
 * - L0: Commander（1体）
 * - L1: ProductLead, MarketingLead, OperationsLead, TechnologyLead, AnalyticsLead（5体）
 * - L2: ImageGenerator, ProductCatalog, UXAgent, ContentWriter, SEODirector,
 *       QualityAuditor, AgentFactory, PricingAgent, PromotionAgent, ConversionAgent,
 *       DevOpsAgent, SecurityAgent, PerformanceAgent, DataAnalyst, ABTestAgent,
 *       InsightAgent, SupportAgent, InventoryMonitor, BusinessAnalyst, AuthManager,
 *       InfraManager, DeployManager, ErrorMonitor, AnalyticsAgent（24体）
 *
 * 登録フロー:
 * 1. インフラ層（Bus, Registry, CascadeEngine等）を初期化
 * 2. L0 Commanderを初期化・登録
 * 3. L1 Lead（5体）を初期化・登録
 * 4. L2 Worker（24体の専門エージェント）を初期化・登録
 * 5. PipelineEngine初期化（17本のパイプライン登録）
 * 6. 各エージェントの健全性を検証
 * 7. HealthMonitor + Watchdog起動
 * 8. Commanderに「システム準備完了」を通知
 */

import type {
  IAgent,
  AgentId,
  AgentBlueprint,
  IAgentBus,
} from '../core/types.js';
import { AgentBus } from '../core/agent-bus.js';
import { AgentRegistry } from '../registry/agent-registry.js';
import { CascadeEngine } from '../core/cascade-engine.js';
import { HealthMonitor } from '../core/health-monitor.js';
import { SecurityGuard } from '../core/security-guard.js';
import { FeedbackCollector } from '../core/feedback-collector.js';

// L0
import { Commander } from '../l0/commander.js';

// L1
import { ProductLead } from '../l1/product-lead.js';
import { MarketingLead } from '../l1/marketing-lead.js';
import { OperationsLead } from '../l1/operations-lead.js';
import { TechnologyLead } from '../l1/technology-lead.js';
import { AnalyticsLead } from '../l1/analytics-lead.js';

// L2
import { ImageGenerator } from '../l2/image-generator.js';
import { ProductCatalog } from '../l2/product-catalog.js';
import { UXAgent } from '../l2/ux-agent.js';
import { ContentWriter } from '../l2/content-writer.js';
import { SEODirector } from '../l2/seo-director.js';
import { QualityAuditor } from '../l2/quality-auditor.js';
import { AgentFactory } from '../l2/agent-factory.js';

// L2 — Sales Team
import { PricingAgent } from '../l2/pricing-agent.js';
import { PromotionAgent } from '../l2/promotion-agent.js';
import { ConversionAgent } from '../l2/conversion-agent.js';

// L2 — Engineering Team
import { DevOpsAgent } from '../l2/devops-agent.js';
import { SecurityAgent } from '../l2/security-agent.js';
import { PerformanceAgent } from '../l2/performance-agent.js';

// L2 — Data Team
import { DataAnalyst } from '../l2/data-analyst.js';
import { ABTestAgent } from '../l2/ab-test-agent.js';
import { InsightAgent } from '../l2/insight-agent.js';

// L2 — Support Team
import { SupportAgent } from '../l2/support-agent.js';

// L2 — Phase 2A: New Agents (#25-32)
import { InventoryMonitor } from '../l2/inventory-monitor.js';
import { BusinessAnalyst } from '../l2/business-analyst.js';
import { AuthManager } from '../l2/auth-manager.js';
import { InfraManager } from '../l2/infra-manager.js';
import { DeployManager } from '../l2/deploy-manager.js';
import { ErrorMonitor } from '../l2/error-monitor.js';
import { AnalyticsAgent } from '../l2/analytics-agent.js';

// Pipeline System（循環系 — 心臓+血管）
import { PipelineEngine } from '../pipelines/pipeline-engine.js';
import { ALL_PIPELINES } from '../pipelines/pipeline-definitions.js';

// Phase 2B: Data Collection（消化器系 — 外部データ消化・吸収）
import { GA4Client } from '../data-collection/ga4-client.js';
import { GSCClient } from '../data-collection/gsc-client.js';
import { AIVisibilityChecker } from '../data-collection/ai-visibility-checker.js';
import { CompetitorScraper } from '../data-collection/competitor-scraper.js';

// Phase 2B: Provider Registry（内分泌系 — 外部サービス接続）
import { ProviderRegistry } from '../providers/external-service-provider.js';
import { createSNSProviders } from '../providers/sns-providers.js';
import { createAdsProviders } from '../providers/ads-providers.js';

// Phase 2B: Approval & Learning Loop（前頭前皮質+海馬）
import { ApprovalOrchestrator } from '../approval/approval-orchestrator.js';
import { FeedbackAnalyzer } from '../approval/feedback-analyzer.js';

// Record Keeping（神経記録系 — 早期接続が必要）
import { getActionLogger } from '../core/action-logger.js';
import { getAttributionEngine } from '../core/attribution-engine.js';

// Watchdog（ICU生命維持装置 — Commander独立監視）
import { createWatchdog } from '../core/commander-watchdog.js';
import { createLogger } from '../core/logger.js';

// Q-01: Blueprint定義を分離（agent-blueprints.ts）
import { createAgentBlueprints } from './agent-blueprints.js';

const log = createLogger('agent-registration');


/**
 * 登録済みエージェント情報を保持する構造体
 */
export interface RegisteredAgentInfo {
  id: string;
  name: string;
  level: 'L0' | 'L1' | 'L2';
  team: string;
  instance: IAgent;
  blueprint: AgentBlueprint;
  initTime: number;
  status: 'initialized' | 'failed';
  /** Get agent's current state (convenience accessor) */
  getState?: () => Record<string, unknown>;
  /** Handle on-demand commands (convenience accessor) */
  onCommand?: (cmd: {action: string; params?: Record<string, unknown>}) => Promise<unknown>;
}

/**
 * 登録システムの全体状態
 */
export interface RegistrationState {
  isInitialized: boolean;
  totalAgents: number;
  successCount: number;
  failureCount: number;
  agents: Map<string, RegisteredAgentInfo>;
  bus?: AgentBus;
  registry?: AgentRegistry;
  cascadeEngine?: CascadeEngine;
  healthMonitor?: HealthMonitor;
  securityGuard?: SecurityGuard;
  feedbackCollector?: FeedbackCollector;
  pipelineEngine?: PipelineEngine;
  // Phase 2B: Data Collection & Approval
  ga4Client?: GA4Client;
  gscClient?: GSCClient;
  aiVisibilityChecker?: AIVisibilityChecker;
  competitorScraper?: CompetitorScraper;
  providerRegistry?: ProviderRegistry;
  approvalOrchestrator?: ApprovalOrchestrator;
  feedbackAnalyzer?: FeedbackAnalyzer;
  startTime: number;
  endTime?: number;
  errors: Array<{ agentId: string; error: string; timestamp: number }>;
}

/**
 * グローバルな登録状態（シングルトン）
 */
const registrationState: RegistrationState = {
  isInitialized: false,
  totalAgents: 30,
  successCount: 0,
  failureCount: 0,
  agents: new Map(),
  startTime: 0,
  errors: [],
};

// NOTE: Blueprint定義は agent-blueprints.ts に分離済み（Q-01）
// createGenericBlueprint() + createAgentBlueprints() は import で参照

// ── 旧 createAgentBlueprints() 定義はここから968行目まで存在していた ──
// agent-blueprints.ts に全て移動済み

/* Q-01: 旧blueprint定義は agent-blueprints.ts に移動済み（約780行削減） */

export async function initializeAgents(): Promise<RegistrationState> {
  registrationState.startTime = Date.now();
  registrationState.isInitialized = false;

  // ── Step 0: 環境変数バリデーション（DNA検査 — 着床前診断） ──
  // 必須キーが欠損した状態で起動すると、本番でサイレント障害が発生する。
  // 細胞分裂の前にDNAの完全性を確認する。
  {
    const required: string[] = []; // dev環境ではInMemory許容のため空
    const recommended = ['DATABASE_URL', 'ANTHROPIC_API_KEY', 'SLACK_WEBHOOK_URL'];
    const isProd = process.env.NODE_ENV === 'production' || process.env.OXYGEN_WORKER === 'true';

    if (isProd) {
      required.push('DATABASE_URL'); // 本番ではDB必須
    }

    const missingRequired = required.filter(k => !process.env[k]);
    if (missingRequired.length > 0) {
      const msg = `[D-07 FATAL] 必須環境変数が未設定: ${missingRequired.join(', ')}`;
      log.error(msg);
      throw new Error(msg);
    }

    const missingRecommended = recommended.filter(k => !process.env[k]);
    if (missingRecommended.length > 0) {
      log.warn(`[D-07] 推奨環境変数が未設定（機能制限あり）: ${missingRecommended.join(', ')}`);
    }
  }

  try {
    // ── Step 1: インフラ層を初期化（神経系の基盤構築） ──
    log.info('[Registration] Step 1: インフラ層初期化中...');

    const bus = new AgentBus();
    const registry = new AgentRegistry();
    const cascadeEngine = new CascadeEngine(bus, registry);
    const healthMonitor = new HealthMonitor();
    const securityGuard = new SecurityGuard();
    const feedbackCollector = new FeedbackCollector();

    // インフラをBusに接続（自律神経系の脳幹接続）
    bus.attachSecurityCheck(securityGuard.createCheck());
    bus.attachFeedbackHook(feedbackCollector.createHook());
    healthMonitor.connectBus(bus);  // HealthMonitor→Bus接続（生命徴候の異常を司令塔へ伝達）

    registrationState.bus = bus;
    registrationState.registry = registry;
    registrationState.cascadeEngine = cascadeEngine;
    registrationState.healthMonitor = healthMonitor;
    registrationState.securityGuard = securityGuard;
    registrationState.feedbackCollector = feedbackCollector;

    // 障害#8修正: ActionLoggerをBus生成直後に接続（神経記録は最初から必要）
    // 医学メタファー: 胎児の神経管が最初期に形成されるのと同様、
    // 全てのイベントを記録する系統は最初から接続されていなければならない
    const actionLogger = getActionLogger();
    actionLogger.connectBus(bus);

    // AttributionEngine（報酬系）も早期接続
    const attrEngine = getAttributionEngine();
    attrEngine.connectBus(bus);

    // Blueprintを登録
    const blueprints = createAgentBlueprints();
    for (const bp of Array.from(blueprints.values())) {
      registry.registerBlueprint(bp);
    }

    log.info('[Registration] インフラ層初期化完了（Bus, Registry, CascadeEngine, etc.）');

    // ── Step 2: L0 Commanderを初期化・登録 ──
    log.info('[Registration] Step 2: L0 Commander初期化中...');

    const commander = new Commander(bus, registry, cascadeEngine, healthMonitor);
    const commanderBlueprint = blueprints.get('commander')!;

    await registerAgent(commander, commanderBlueprint, registry);
    registrationState.successCount++;

    // ── Step 3: L1 Leadを初期化・登録 ──
    log.info('[Registration] Step 3: L1 Lead初期化中...');

    const productLead = new ProductLead(bus, registry, cascadeEngine);
    const productLeadBlueprint = blueprints.get('product-lead')!;
    await registerAgent(productLead, productLeadBlueprint, registry);
    registrationState.successCount++;

    const marketingLead = new MarketingLead(bus, registry, cascadeEngine);
    const marketingLeadBlueprint = blueprints.get('marketing-lead')!;
    await registerAgent(marketingLead, marketingLeadBlueprint, registry);
    registrationState.successCount++;

    const operationsLead = new OperationsLead(bus, registry, cascadeEngine);
    const operationsLeadBlueprint = blueprints.get('operations-lead')!;
    await registerAgent(operationsLead, operationsLeadBlueprint, registry);
    registrationState.successCount++;

    const technologyLead = new TechnologyLead(bus, registry, cascadeEngine);
    const technologyLeadBlueprint = blueprints.get('technology-lead')!;
    await registerAgent(technologyLead, technologyLeadBlueprint, registry);
    registrationState.successCount++;

    const analyticsLead = new AnalyticsLead(bus, registry, cascadeEngine);
    const analyticsLeadBlueprint = blueprints.get('analytics-lead')!;
    await registerAgent(analyticsLead, analyticsLeadBlueprint, registry);
    registrationState.successCount++;

    // ── Step 4: L2 Workerを初期化・登録 ──
    log.info('[Registration] Step 4: L2 Worker初期化中...');

    // ImageGenerator
    const imageGenerator = new ImageGenerator(bus);
    const imageGeneratorBlueprint = blueprints.get('image-generator')!;
    await registerAgent(imageGenerator, imageGeneratorBlueprint, registry);
    registrationState.successCount++;

    // ProductCatalog
    const productCatalog = new ProductCatalog(bus);
    const productCatalogBlueprint = blueprints.get('product-catalog')!;
    await registerAgent(productCatalog, productCatalogBlueprint, registry);
    registrationState.successCount++;

    // UXAgent
    const uxAgent = new UXAgent(bus);
    const uxAgentBlueprint = blueprints.get('ux-agent')!;
    await registerAgent(uxAgent, uxAgentBlueprint, registry);
    registrationState.successCount++;

    // ContentWriter
    const contentWriter = new ContentWriter(bus);
    const contentWriterBlueprint = blueprints.get('content-writer')!;
    await registerAgent(contentWriter, contentWriterBlueprint, registry);
    registrationState.successCount++;

    // SEODirector
    const seoDirector = new SEODirector(bus);
    const seoDirectorBlueprint = blueprints.get('seo-director')!;
    await registerAgent(seoDirector, seoDirectorBlueprint, registry);
    registrationState.successCount++;

    // QualityAuditor
    const qualityAuditor = new QualityAuditor(bus);
    const qualityAuditorBlueprint = blueprints.get('quality-auditor')!;
    await registerAgent(qualityAuditor, qualityAuditorBlueprint, registry);
    registrationState.successCount++;

    // AgentFactory
    const agentFactory = new AgentFactory(bus);
    const agentFactoryBlueprint = blueprints.get('agent-factory')!;
    await registerAgent(agentFactory, agentFactoryBlueprint, registry);
    registrationState.successCount++;

    // ── Step 4b: 追加L2 Worker（Sales/Engineering/Data/Support）を初期化・登録 ──
    log.info('[Registration] Step 4b: 追加L2 Worker(10体)初期化中...');

    // Sales Team L2
    const pricingAgent = new PricingAgent(bus);
    await registerAgent(pricingAgent, blueprints.get('pricing-agent') || createGenericBlueprint('pricing-agent', 'sales', ['pricing_optimization']), registry);
    registrationState.successCount++;

    const promotionAgent = new PromotionAgent(bus);
    await registerAgent(promotionAgent, blueprints.get('promotion-agent') || createGenericBlueprint('promotion-agent', 'sales', ['campaign_management']), registry);
    registrationState.successCount++;

    const conversionAgent = new ConversionAgent(bus);
    await registerAgent(conversionAgent, blueprints.get('conversion-agent') || createGenericBlueprint('conversion-agent', 'sales', ['conversion_optimization']), registry);
    registrationState.successCount++;

    // Engineering Team L2
    const devopsAgent = new DevOpsAgent(bus);
    await registerAgent(devopsAgent, blueprints.get('devops-agent') || createGenericBlueprint('devops-agent', 'engineering', ['deployment', 'ci_cd']), registry);
    registrationState.successCount++;

    const securityAgent = new SecurityAgent(bus);
    await registerAgent(securityAgent, blueprints.get('security-agent') || createGenericBlueprint('security-agent', 'engineering', ['security_audit']), registry);
    registrationState.successCount++;

    const performanceAgent = new PerformanceAgent(bus);
    await registerAgent(performanceAgent, blueprints.get('performance-agent') || createGenericBlueprint('performance-agent', 'engineering', ['performance_monitoring']), registry);
    registrationState.successCount++;

    // Data Team L2
    const dataAnalyst = new DataAnalyst(bus);
    await registerAgent(dataAnalyst, blueprints.get('data-analyst') || createGenericBlueprint('data-analyst', 'data', ['data_analysis', 'reporting']), registry);
    registrationState.successCount++;

    const abTestAgent = new ABTestAgent(bus);
    await registerAgent(abTestAgent, blueprints.get('ab-test-agent') || createGenericBlueprint('ab-test-agent', 'data', ['ab_testing']), registry);
    registrationState.successCount++;

    const insightAgent = new InsightAgent(bus);
    await registerAgent(insightAgent, blueprints.get('insight-agent') || createGenericBlueprint('insight-agent', 'data', ['insight_generation']), registry);
    registrationState.successCount++;

    // Support Team L2
    const supportAgent = new SupportAgent(bus);
    await registerAgent(supportAgent, blueprints.get('support-agent') || createGenericBlueprint('support-agent', 'support', ['customer_support']), registry);
    registrationState.successCount++;

    // ── Step 4c-pre: Phase 2A 新規L2エージェント(7体)初期化・登録 ──
    log.info('[Registration] Step 4c-pre: Phase 2A 新規L2 Worker(7体)初期化中...');

    // Product Team追加
    const inventoryMonitor = new InventoryMonitor(bus);
    await registerAgent(inventoryMonitor, blueprints.get('inventory-monitor') || createGenericBlueprint('inventory-monitor', 'product', ['inventory_monitoring']), registry);
    registrationState.successCount++;

    // Data Team追加
    const businessAnalyst = new BusinessAnalyst(bus);
    await registerAgent(businessAnalyst, blueprints.get('business-analyst') || createGenericBlueprint('business-analyst', 'data', ['business_analysis']), registry);
    registrationState.successCount++;

    const analyticsAgent = new AnalyticsAgent(bus);
    await registerAgent(analyticsAgent, blueprints.get('analytics-agent') || createGenericBlueprint('analytics-agent', 'data', ['analytics']), registry);
    registrationState.successCount++;

    // Engineering Team追加
    const authManager = new AuthManager(bus);
    await registerAgent(authManager, blueprints.get('auth-manager') || createGenericBlueprint('auth-manager', 'engineering', ['authentication']), registry);
    registrationState.successCount++;

    const infraManager = new InfraManager(bus);
    await registerAgent(infraManager, blueprints.get('infra-manager') || createGenericBlueprint('infra-manager', 'engineering', ['infrastructure']), registry);
    registrationState.successCount++;

    const deployManager = new DeployManager(bus);
    await registerAgent(deployManager, blueprints.get('deploy-manager') || createGenericBlueprint('deploy-manager', 'engineering', ['deployment']), registry);
    registrationState.successCount++;

    const errorMonitor = new ErrorMonitor(bus);
    await registerAgent(errorMonitor, blueprints.get('error-monitor') || createGenericBlueprint('error-monitor', 'engineering', ['error_monitoring']), registry);
    registrationState.successCount++;

    // ── Step 4d-pre: Phase 2B インフラ層初期化（消化器系+内分泌系+前頭前皮質+海馬） ──
    log.info('[Registration] Step 4d-pre: Phase 2B Data Collection / Provider / Approval 初期化中...');

    // Data Collection（消化器系）
    const ga4Client = new GA4Client({}, bus);
    await ga4Client.initialize();
    registrationState.ga4Client = ga4Client;

    const gscClient = new GSCClient({ siteUrl: 'https://shop.mining-base.co.jp' }, bus);
    await gscClient.initialize();
    registrationState.gscClient = gscClient;

    const aiVisibilityChecker = new AIVisibilityChecker({}, bus);
    await aiVisibilityChecker.initialize();
    registrationState.aiVisibilityChecker = aiVisibilityChecker;

    const competitorScraper = new CompetitorScraper({}, bus);
    await competitorScraper.initialize();
    registrationState.competitorScraper = competitorScraper;

    // Provider Registry（内分泌系）
    const providerRegistry = new ProviderRegistry(bus);
    const snsProviders = createSNSProviders();
    const adsProviders = createAdsProviders();
    for (const p of [...snsProviders, ...adsProviders]) {
      providerRegistry.register(p);
    }
    await providerRegistry.initializeAll();
    registrationState.providerRegistry = providerRegistry;

    // Approval & Learning（前頭前皮質+海馬）
    const approvalOrchestrator = new ApprovalOrchestrator(undefined, bus);
    await approvalOrchestrator.initialize();
    registrationState.approvalOrchestrator = approvalOrchestrator;

    const feedbackAnalyzer = new FeedbackAnalyzer(bus);
    await feedbackAnalyzer.initialize();
    registrationState.feedbackAnalyzer = feedbackAnalyzer;

    log.info('[Registration] Phase 2B インフラ層初期化完了（GA4/GSC/AI可視性/競合/Provider 6件/承認/学習）');

    // ── Step 4c: PipelineEngine初期化（心臓の起動） ──
    // 全Agent登録後にPipelineを起動する。血管系は臓器が全て揃ってから動かす。
    log.info('[Registration] Step 4c: PipelineEngine初期化中...');
    const pipelineEngine = new PipelineEngine(bus, registry);
    for (const pipeline of ALL_PIPELINES) {
      try {
        pipelineEngine.registerPipeline(pipeline);
      } catch (err) {
        log.error(`[Registration] Pipeline ${pipeline.id} 登録失敗:`, err);
      }
    }
    registrationState.pipelineEngine = pipelineEngine;

    // ── Step 4d: イベントリスナー起動（神経回路の活性化） ──
    // 障害#5修正: PipelineEngine登録後にイベントリスナーを起動
    // これがないとevent型トリガー（P03: content.requested, P16: support.ticket.created）が
    // 永久にDeadLetterQueue行きになる。耳を持って生まれても、鼓膜が振動しなければ聞こえない。
    pipelineEngine.startEventListeners();
    log.info(`[Registration] ${ALL_PIPELINES.length}本のPipelineを登録完了（イベントリスナー起動済）`);

    // ── Step 5: 全エージェントの健全性を検証 ──
    log.info('[Registration] Step 5: 健全性検証中...');

    const allAgents = registry.listAll();
    for (const registeredAgent of allAgents) {
      if (!registeredAgent.instance) continue;

      const health = registeredAgent.instance.getHealth();
      if (health.status !== 'healthy') {
        log.warn(`[Registration] 警告: ${registeredAgent.id.id}がhealth状態ではありません`);
      }
    }

    // ── Step 6: HealthMonitorを起動（全エージェントの定期監視） ──
    log.info('[Registration] Step 6: HealthMonitor起動中...');
    healthMonitor.start();

    // ── Step 6a-2: HealthMonitor自己監視起動（Meta-Monitor） ──
    // HealthMonitor自身がBus経由でハートビートを発行。
    // Bus障害時にハートビートが途切れることで、外部からHealthMonitor/Bus障害を検知可能。
    healthMonitor.startSelfMonitoring();

    // ── Step 6b: Commander Watchdog起動（ICU生命維持装置） ──
    // HealthMonitorは全Agentを監視するが、Commander自体が死亡した場合の蘇生は
    // HealthMonitorにはできない（Commander死亡→handleHealthCritical実行不能）。
    // Watchdogはこの「脳死」を外部から検知し、独立して蘇生を試みる。
    log.info('[Registration] Step 6b: Commander Watchdog起動中...');
    const watchdog = createWatchdog(registry, bus);
    watchdog.start();

    // ── Step 7: Commanderに「システム準備完了」を通知 ──
    log.info('[Registration] Step 7: システム初期化完了イベント発行中...');

    await bus.publish({
      id: `init_complete_${Date.now()}`,
      type: 'system.initialized',
      source: 'agent-registration',
      priority: 'high',
      payload: {
        agentsLoaded: registrationState.successCount,
        registryStats: registry.getStats(),
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    });

    registrationState.isInitialized = true;
    registrationState.endTime = Date.now();
    // 障害#7修正: totalAgentsを登録結果から動的に算出（ハードコード禁止）
    // 新しいエージェントを追加してもtotalAgentsの手動更新が不要になる
    registrationState.totalAgents = registrationState.successCount + registrationState.failureCount;

    log.info(
      `[Registration] 完了: ${registrationState.successCount}/${registrationState.totalAgents}体のエージェントが起動しました (${registrationState.endTime - registrationState.startTime}ms)`,
    );

    return registrationState;
  } catch (error) {
    registrationState.failureCount++;
    registrationState.endTime = Date.now();

    const errorMsg = error instanceof Error ? error.message : String(error);
    registrationState.errors.push({
      agentId: 'system',
      error: errorMsg,
      timestamp: Date.now(),
    });

    log.error(`[Registration] エラー発生: ${errorMsg}`);
    throw error;
  }
}

/**
 * 登録済みエージェント一覧を取得する
 *
 * 呼び出し例:
 * ```typescript
 * const agents = getRegisteredAgents();
 * for (const agent of agents) {
 *   log.info(`${agent.name} (${agent.level}): ${agent.status}`);
 * }
 * ```
 *
 * @returns 登録済みエージェントの配列
 */
export function getRegisteredAgents(): RegisteredAgentInfo[] {
  return Array.from(registrationState.agents.values()).sort(
    (a, b) => a.id.localeCompare(b.id),
  );
}

/**
 * 登録システムの全体状態を取得する
 *
 * @returns 登録状態オブジェクト
 */
export function getRegistrationState(): RegistrationState {
  return { ...registrationState };
}

/**
 * AgentBusインスタンスを取得する（外部から利用する場合）
 *
 * @returns AgentBusインスタンス、未初期化の場合はundefined
 */
export function getAgentBus(): AgentBus | undefined {
  return registrationState.bus;
}

/**
 * AgentRegistryインスタンスを取得する（外部から利用する場合）
 *
 * @returns AgentRegistryインスタンス、未初期化の場合はundefined
 */
export function getAgentRegistry(): AgentRegistry | undefined {
  return registrationState.registry;
}

/**
 * PipelineEngineインスタンスを取得する
 * initializeAgents()で生成された唯一のインスタンスを返す（二重生成防止）
 */
export function getPipelineEngine(): PipelineEngine | undefined {
  return registrationState.pipelineEngine;
}

// Phase 2B Getters
export function getGA4Client(): GA4Client | undefined { return registrationState.ga4Client; }
export function getGSCClient(): GSCClient | undefined { return registrationState.gscClient; }
export function getAIVisibilityChecker(): AIVisibilityChecker | undefined { return registrationState.aiVisibilityChecker; }
export function getCompetitorScraper(): CompetitorScraper | undefined { return registrationState.competitorScraper; }
export function getProviderRegistry(): ProviderRegistry | undefined { return registrationState.providerRegistry; }
export function getApprovalOrchestrator(): ApprovalOrchestrator | undefined { return registrationState.approvalOrchestrator; }
export function getFeedbackAnalyzer(): FeedbackAnalyzer | undefined { return registrationState.feedbackAnalyzer; }

/**
 * Graceful Shutdown — システム全体の安全停止（逆順解体）
 *
 * 生体対応: 臨終ケア（逆順の臓器停止）
 * L2ワーカー → L1リード → L0コマンダー → PipelineEngine → HealthMonitor → Bus
 * の順でシャットダウンし、キャッシュをフラッシュ、購読を解除する。
 *
 * 医学的根拠: 心臓（Pipeline）を止める前に末端臓器（L2）を停止する。
 * 脳（Commander）を最後に停止することで、全体の状態を最後まで監視可能にする。
 */
export async function shutdownAllAgents(): Promise<{
  success: boolean;
  shutdownCount: number;
  errors: string[];
  duration: number;
}> {
  const startTime = Date.now();
  const errors: string[] = [];
  let shutdownCount = 0;

  if (!registrationState.isInitialized) {
    return {success: true, shutdownCount: 0, errors: [], duration: 0};
  }

  log.info('[Shutdown] Graceful Shutdown開始（逆順解体）...');

  // Step 1: L2 Worker停止（末端臓器）
  const allAgents = Array.from(registrationState.agents.values());
  const l2Agents = allAgents.filter(a => a.level === 'L2');
  const l1Agents = allAgents.filter(a => a.level === 'L1');
  const l0Agents = allAgents.filter(a => a.level === 'L0');

  for (const agent of l2Agents) {
    try {
      await agent.instance.shutdown();
      shutdownCount++;
      log.info(`  ✓ ${agent.name} (L2) shutdown`);
    } catch (err) {
      errors.push(`${agent.id}: ${String(err)}`);
    }
  }

  // Step 2: L1 Lead停止（器官系統）
  for (const agent of l1Agents) {
    try {
      await agent.instance.shutdown();
      shutdownCount++;
      log.info(`  ✓ ${agent.name} (L1) shutdown`);
    } catch (err) {
      errors.push(`${agent.id}: ${String(err)}`);
    }
  }

  // Step 2b: Phase 2B インフラ停止（消化器系+内分泌系+前頭前皮質+海馬）
  try {
    if (registrationState.feedbackAnalyzer) await registrationState.feedbackAnalyzer.shutdown();
    if (registrationState.approvalOrchestrator) await registrationState.approvalOrchestrator.shutdown();
    if (registrationState.providerRegistry) await registrationState.providerRegistry.shutdownAll();
    if (registrationState.competitorScraper) await registrationState.competitorScraper.shutdown();
    if (registrationState.aiVisibilityChecker) await registrationState.aiVisibilityChecker.shutdown();
    if (registrationState.gscClient) await registrationState.gscClient.shutdown();
    if (registrationState.ga4Client) await registrationState.ga4Client.shutdown();
    log.info('  ✓ Phase 2B infra stopped');
  } catch (err) {
    errors.push(`Phase2B: ${String(err)}`);
  }

  // Step 3: PipelineEngine停止（循環系）
  if (registrationState.pipelineEngine) {
    try {
      registrationState.pipelineEngine.shutdown();
      log.info('  ✓ PipelineEngine stopped');
    } catch (err) {
      errors.push(`PipelineEngine: ${String(err)}`);
    }
  }

  // Step 4: HealthMonitor停止（生命監視）
  if (registrationState.healthMonitor) {
    try {
      registrationState.healthMonitor.stop();
      log.info('  ✓ HealthMonitor stopped');
    } catch (err) {
      errors.push(`HealthMonitor: ${String(err)}`);
    }
  }

  // Step 5: L0 Commander停止（脳 — 最後に停止）
  for (const agent of l0Agents) {
    try {
      await agent.instance.shutdown();
      shutdownCount++;
      log.info(`  ✓ ${agent.name} (L0) shutdown`);
    } catch (err) {
      errors.push(`${agent.id}: ${String(err)}`);
    }
  }

  // Step 6: 状態リセット
  registrationState.isInitialized = false;
  registrationState.agents.clear();
  registrationState.successCount = 0;
  registrationState.failureCount = 0;

  const duration = Date.now() - startTime;
  log.info(`[Shutdown] 完了: ${shutdownCount}体停止 (${duration}ms)${errors.length > 0 ? ` / エラー${errors.length}件` : ''}`);

  return {
    success: errors.length === 0,
    shutdownCount,
    errors,
    duration,
  };
}

// ── 内部ヘルパー関数 ──

/**
 * エージェントをRegistryに登録し、初期化する（内部用）
 *
 * @param agent - 登録するエージェント
 * @param blueprint - エージェントのBlueprint（遺伝情報）
 * @param registry - 登録先のRegistry
 */
async function registerAgent(
  agent: IAgent,
  blueprint: AgentBlueprint,
  registry: AgentRegistry,
): Promise<void> {
  const startTime = Date.now();

  try {
    // Registryに登録（インスタンスまで含める）
    registry.register(agent.id, blueprint, agent);

    // エージェントを初期化（独自の初期化ロジック実行）
    await agent.initialize();

    // 登録状態を追跡
    const info: RegisteredAgentInfo = {
      id: agent.id.id,
      name: agent.id.name,
      level: agent.id.level as 'L0' | 'L1' | 'L2',
      team: agent.id.team,
      instance: agent,
      blueprint,
      initTime: Date.now() - startTime,
      status: 'initialized',
    };

    registrationState.agents.set(agent.id.id, info);

    log.info(
      `  ✓ ${agent.id.name} (${agent.id.level}/${agent.id.team}) initialized (${info.initTime}ms)`,
    );
  } catch (error) {
    registrationState.failureCount++;

    const errorMsg = error instanceof Error ? error.message : String(error);
    registrationState.errors.push({
      agentId: agent.id.id,
      error: errorMsg,
      timestamp: Date.now(),
    });

    log.error(`  ✗ ${agent.id.name}の初期化に失敗: ${errorMsg}`);

    // 1つのエージェント失敗でも続行する（resilience）
    // ただし呼び出し側でチェックできるようにエラーは記録
  }
}
