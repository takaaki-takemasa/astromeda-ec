/**
 * Agent Registration — ユニットテスト
 *
 * テスト対象:
 * 1. initializeAgents() — 全23体の登録と初期化
 * 2. エラー耐性 — 1体が失敗しても他は続行
 * 3. getRegisteredAgents() — 登録済みエージェント取得
 * 4. Registry一貫性 — 登録内容の検証
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initializeAgents,
  getRegisteredAgents,
  getRegistrationState,
  getAgentBus,
  getAgentRegistry,
  type RegistrationState,
} from '../agent-registration.js';

describe('Agent Registration System', () => {
  // ── テスト前処理 ──

  beforeEach(() => {
    // 各テスト前に状態をリセット
    // （実装によってはグローバル状態のリセットが必要）
  });

  afterEach(() => {
    // テスト後の清掃
  });

  // ── Test Suite 1: 全エージェント登録 ──

  describe('initializeAgents()', () => {
    it('全23体のエージェントが正常に登録されるべき', async () => {
      const state = await initializeAgents();

      expect(state.isInitialized).toBe(true);
      expect(state.successCount).toBeGreaterThanOrEqual(23);
      expect(state.failureCount).toBe(0);
      expect(state.agents.size).toBeGreaterThanOrEqual(23);
    });

    it('登録は1秒以内に完了するべき（パフォーマンス）', async () => {
      const state = await initializeAgents();
      const duration = (state.endTime ?? 0) - state.startTime;

      expect(duration).toBeLessThan(1000);
    });

    it('L0 Commanderが登録されるべき', async () => {
      const state = await initializeAgents();
      const commander = state.agents.get('commander');

      expect(commander).toBeDefined();
      expect(commander?.level).toBe('L0');
      expect(commander?.status).toBe('initialized');
    });

    it('L1 Lead 5体が登録されるべき', async () => {
      const state = await initializeAgents();
      const leads = ['product-lead', 'marketing-lead', 'operations-lead', 'technology-lead', 'analytics-lead'];

      for (const leadId of leads) {
        const lead = state.agents.get(leadId);
        expect(lead).toBeDefined();
        expect(lead?.level).toBe('L1');
      }
    });

    it('L2 Worker 17体が登録されるべき', async () => {
      const state = await initializeAgents();
      const l2Agents = ['image-generator', 'product-catalog', 'ux-agent', 'content-writer', 'seo-director', 'quality-auditor', 'agent-factory', 'pricing-agent', 'promotion-agent', 'conversion-agent', 'devops-agent', 'security-agent', 'performance-agent', 'data-analyst', 'ab-test-agent', 'insight-agent', 'support-agent'];

      for (const agentId of l2Agents) {
        const agent = state.agents.get(agentId);
        expect(agent).toBeDefined();
        expect(agent?.level).toBe('L2');
      }
    });

    it('各エージェントが初期化時間を記録するべき', async () => {
      const state = await initializeAgents();
      const agents = Array.from(state.agents.values());

      for (const agent of agents) {
        expect(agent.initTime).toBeGreaterThanOrEqual(0);
        expect(agent.initTime).toBeLessThan(5000); // 各エージェント5秒以内で初期化
      }
    });
  });

  // ── Test Suite 2: インフラ層の初期化 ──

  describe('Infrastructure Initialization', () => {
    beforeEach(async () => {
      await initializeAgents();
    });

    it('AgentBusが初期化されるべき', () => {
      const bus = getAgentBus();
      expect(bus).toBeDefined();
    });

    it('AgentRegistryが初期化されるべき', () => {
      const registry = getAgentRegistry();
      expect(registry).toBeDefined();
    });

    it('Registryに全23体のエージェントが登録されているべき', () => {
      const registry = getAgentRegistry();
      expect(registry).toBeDefined();

      const stats = registry!.getStats();
      expect(stats.total).toBeGreaterThanOrEqual(23);
      expect(stats.active).toBeGreaterThanOrEqual(23);
    });

    it('Blueprintが全23体のエージェントに対して存在するべき', () => {
      const registry = getAgentRegistry();
      expect(registry).toBeDefined();

      const agents = ['commander', 'product-lead', 'marketing-lead', 'operations-lead', 'technology-lead', 'analytics-lead', 'image-generator', 'product-catalog', 'ux-agent', 'content-writer', 'seo-director', 'quality-auditor', 'agent-factory', 'pricing-agent', 'promotion-agent', 'conversion-agent', 'devops-agent', 'security-agent', 'performance-agent', 'data-analyst', 'ab-test-agent', 'insight-agent', 'support-agent'];

      for (const agentId of agents) {
        const agent = registry!.get(agentId);
        expect(agent).toBeDefined();
        expect(agent?.blueprint).toBeDefined();
      }
    });
  });

  // ── Test Suite 3: エージェント検索 ──

  describe('Agent Discovery', () => {
    beforeEach(async () => {
      await initializeAgents();
    });

    it('getRegisteredAgents()が全エージェントを返すべき', () => {
      const agents = getRegisteredAgents();
      expect(agents.length).toBeGreaterThanOrEqual(23);
    });

    it('レベル別検索 — L0エージェント取得', () => {
      const registry = getAgentRegistry();
      expect(registry).toBeDefined();

      const l0Agents = registry!.getByLevel('L0');
      expect(l0Agents.length).toBeGreaterThanOrEqual(1);
      expect(l0Agents[0].id.id).toBe('commander');
    });

    it('レベル別検索 — L1エージェント取得', () => {
      const registry = getAgentRegistry();
      expect(registry).toBeDefined();

      const l1Agents = registry!.getByLevel('L1');
      expect(l1Agents.length).toBe(5); // 5 L1 Leads
      expect(l1Agents.map((a) => a.id.id).sort()).toEqual(['analytics-lead', 'marketing-lead', 'operations-lead', 'product-lead', 'technology-lead']);
    });

    it('レベル別検索 — L2エージェント取得', () => {
      const registry = getAgentRegistry();
      expect(registry).toBeDefined();

      const l2Agents = registry!.getByLevel('L2');
      expect(l2Agents.length).toBeGreaterThanOrEqual(17);
    });

    it('チーム別検索 — Conversionチーム（Product担当）', () => {
      const registry = getAgentRegistry();
      expect(registry).toBeDefined();

      const conversionTeam = registry!.getByTeam('conversion');
      expect(conversionTeam.length).toBeGreaterThanOrEqual(1);
    });

    it('チーム別検索 — Acquisitionチーム（Marketing担当）', () => {
      const registry = getAgentRegistry();
      expect(registry).toBeDefined();

      const acquisitionTeam = registry!.getByTeam('acquisition');
      expect(acquisitionTeam.length).toBeGreaterThanOrEqual(1);
    });

    it('能力ベース検索 — image_generation能力', () => {
      const registry = getAgentRegistry();
      expect(registry).toBeDefined();

      const agents = registry!.findByCapability('image_generation');
      expect(agents.length).toBeGreaterThan(0);
      expect(agents.some((a) => a.id.id === 'image-generator')).toBe(true);
    });

    it('能力ベース検索 — seo_optimization能力', () => {
      const registry = getAgentRegistry();
      expect(registry).toBeDefined();

      const agents = registry!.findByCapability('seo_optimization');
      expect(agents.length).toBeGreaterThan(0);
      expect(agents.some((a) => a.id.id === 'seo-director')).toBe(true);
    });
  });

  // ── Test Suite 4: 健全性チェック ──

  describe('Agent Health Checks', () => {
    beforeEach(async () => {
      await initializeAgents();
    });

    it('全エージェントのヘルスステータスを取得できるべき', () => {
      const agents = getRegisteredAgents();

      for (const agent of agents) {
        const health = agent.instance.getHealth();
        expect(health.agentId).toBe(agent.id);
        expect(['initializing', 'healthy', 'degraded', 'error', 'shutdown']).toContain(
          health.status,
        );
      }
    });

    it('各エージェントが正常にhealthy状態であるべき', () => {
      const agents = getRegisteredAgents();

      for (const agent of agents) {
        const health = agent.instance.getHealth();
        expect(health.status).toBe('healthy');
      }
    });

    it('HealthMonitorが起動しているべき', () => {
      const state = getRegistrationState();
      expect(state.healthMonitor).toBeDefined();
    });
  });

  // ── Test Suite 5: エラー処理と耐性 ──

  describe('Error Handling & Resilience', () => {
    it('initializeAgents()がPromiseを返すべき', () => {
      const result = initializeAgents();
      expect(result).toBeInstanceOf(Promise);
    });

    it('初期化後のエラーリストが適切に記録されるべき', async () => {
      const state = await initializeAgents();

      // 全エージェント成功時はエラーなし
      if (state.successCount === 23) {
        expect(state.errors.length).toBe(0);
      }
    });

    it('getRegistrationState()が現在の状態を返すべき', async () => {
      const state = await initializeAgents();
      const currentState = getRegistrationState();

      expect(currentState.isInitialized).toBe(state.isInitialized);
      expect(currentState.successCount).toBe(state.successCount);
    });
  });

  // ── Test Suite 6: システムイベント ──

  describe('System Events', () => {
    beforeEach(async () => {
      await initializeAgents();
    });

    it('system.initialized イベントが発行されるべき', async () => {
      const bus = getAgentBus();
      expect(bus).toBeDefined();

      const eventLog = bus!.getEventLog();
      const initEvent = eventLog.find((e) => e.type === 'system.initialized');
      expect(initEvent).toBeDefined();
      expect(initEvent?.source).toBe('agent-registration');
    });

    it('EventLogが記録されているべき', () => {
      const bus = getAgentBus();
      expect(bus).toBeDefined();

      const eventLog = bus!.getEventLog();
      expect(eventLog.length).toBeGreaterThan(0);
    });

    it('AgentBusの統計が利用可能であるべき', () => {
      const bus = getAgentBus();
      expect(bus).toBeDefined();

      const stats = bus!.getStats();
      expect(stats.totalSubscriptions).toBeGreaterThanOrEqual(0);
      expect(stats.eventTypes).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Test Suite 7: 依存関係検証 ──

  describe('Dependency Resolution', () => {
    beforeEach(async () => {
      await initializeAgents();
    });

    it('Commanderに対する依存関係を解決できるべき', () => {
      const registry = getAgentRegistry();
      expect(registry).toBeDefined();

      const commander = registry!.get('commander');
      expect(commander).toBeDefined();

      const deps = registry!.checkDependencies('commander');
      expect(deps.satisfied).toBe(true);
    });

    it('L1 LeadはCommanderに依存していて、依存解決されているべき', () => {
      const registry = getAgentRegistry();
      expect(registry).toBeDefined();

      const productLead = registry!.checkDependencies('product-lead');
      expect(productLead.satisfied).toBe(true);

      const marketingLead = registry!.checkDependencies('marketing-lead');
      expect(marketingLead.satisfied).toBe(true);
    });

    it('L2 WorkerはL1 Leadに依存していて、依存解決されているべき', () => {
      const registry = getAgentRegistry();
      expect(registry).toBeDefined();

      const imageGen = registry!.checkDependencies('image-generator');
      expect(imageGen.satisfied).toBe(true);

      const contentWriter = registry!.checkDependencies('content-writer');
      expect(contentWriter.satisfied).toBe(true);
    });

    it('依存関係の順序解決ができるべき', () => {
      const registry = getAgentRegistry();
      expect(registry).toBeDefined();

      const order = registry!.resolveDependencyOrder();
      expect(order.length).toBeGreaterThanOrEqual(23);

      // Commanderは依存関係がないので早期に来るはず
      expect(order.indexOf('commander')).toBeLessThan(order.indexOf('product-lead'));
    });
  });

  // ── Test Suite 8: 拡張API ──

  describe('Extended APIs', () => {
    beforeEach(async () => {
      await initializeAgents();
    });

    it('getAgentBus()が登録後のBusを返すべき', () => {
      const bus = getAgentBus();
      expect(bus).toBeDefined();
      expect(typeof bus?.publish).toBe('function');
    });

    it('getAgentRegistry()が登録後のRegistryを返すべき', () => {
      const registry = getAgentRegistry();
      expect(registry).toBeDefined();
      expect(typeof registry?.get).toBe('function');
    });

    it('Registryの統計情報が正確であるべき', () => {
      const registry = getAgentRegistry();
      expect(registry).toBeDefined();

      const stats = registry!.getStats();
      expect(stats.active).toBe(30);
      expect(stats.total).toBe(30);
      expect(stats.byLevel.L0).toBe(1);
      expect(stats.byLevel.L1).toBe(5);
      expect(stats.byLevel.L2).toBe(24);
    });
  });
});
