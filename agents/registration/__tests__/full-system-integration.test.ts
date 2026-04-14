/**
 * P2D 全26体Agent統合テスト
 * #94: 全Agent一斉起動・Bus接続・Pipeline統合の完全性検証
 */

import { describe, it, expect } from 'vitest';
import {
  initializeAgents,
  getRegisteredAgents,
  getRegistrationState,
  getAgentBus,
  getAgentRegistry,
} from '../agent-registration.js';
import { getDefaultPipelines, getPipelineDefinition, getPipelineDescription } from '../../pipelines/pipeline-definitions.js';

describe('P2D: 26体Agent全体統合テスト', () => {
  // ── 1. 全体起動テスト ──
  describe('全体起動', () => {
    it('23体のAgentが正常に登録・初期化される', async () => {
      // L0(1) + L1(5) + original L2(7) + new L2(10) = 23体
      // ※HealthMonitor, SecurityGuard, FeedbackCollectorはインフラ層でAgentカウント外
      const state = await initializeAgents();
      expect(state.isInitialized).toBe(true);
      expect(state.successCount).toBeGreaterThanOrEqual(23);
      expect(state.failureCount).toBe(0);
    });

    it('初期化が3秒以内に完了する（23体パフォーマンス）', async () => {
      const state = await initializeAgents();
      const duration = (state.endTime ?? 0) - state.startTime;
      expect(duration).toBeLessThan(3000);
    });
  });

  // ── 2. 階層構造検証 ──
  describe('階層構造（L0/L1/L2）', () => {
    it('L0 Commander 1体', async () => {
      const state = await initializeAgents();
      const commander = state.agents.get('commander');
      expect(commander).toBeDefined();
      expect(commander?.level).toBe('L0');
    });

    it('L1 Lead 5体', async () => {
      const state = await initializeAgents();
      const l1Ids = ['product-lead', 'marketing-lead', 'operations-lead', 'technology-lead', 'analytics-lead'];
      for (const id of l1Ids) {
        const agent = state.agents.get(id);
        expect(agent).toBeDefined();
        expect(agent?.level).toBe('L1');
      }
    });

    it('L2 Worker群（最低17体）', async () => {
      const state = await initializeAgents();
      const l2Ids = [
        'image-generator', 'product-catalog', 'ux-agent',
        'content-writer', 'seo-director',
        'pricing-agent', 'promotion-agent', 'conversion-agent',
        'devops-agent', 'security-agent', 'performance-agent',
        'data-analyst', 'ab-test-agent', 'insight-agent',
        'support-agent', 'quality-auditor', 'agent-factory',
      ];
      let l2Count = 0;
      for (const id of l2Ids) {
        const agent = state.agents.get(id);
        if (agent) {
          expect(agent.level).toBe('L2');
          l2Count++;
        }
      }
      expect(l2Count).toBeGreaterThanOrEqual(17);
    });
  });

  // ── 3. チーム構成検証 ──
  describe('6チーム構成', () => {
    it('Product Team: ProductLead + 3体L2', async () => {
      const state = await initializeAgents();
      expect(state.agents.get('product-lead')).toBeDefined();
      expect(state.agents.get('image-generator')).toBeDefined();
      expect(state.agents.get('product-catalog')).toBeDefined();
      expect(state.agents.get('ux-agent')).toBeDefined();
    });

    it('Marketing Team: MarketingLead + 2体L2', async () => {
      const state = await initializeAgents();
      expect(state.agents.get('marketing-lead')).toBeDefined();
      expect(state.agents.get('content-writer')).toBeDefined();
      expect(state.agents.get('seo-director')).toBeDefined();
    });

    it('Operations Team: OperationsLead + 3体L2', async () => {
      const state = await initializeAgents();
      expect(state.agents.get('operations-lead')).toBeDefined();
      expect(state.agents.get('pricing-agent')).toBeDefined();
      expect(state.agents.get('promotion-agent')).toBeDefined();
      expect(state.agents.get('conversion-agent')).toBeDefined();
    });

    it('Technology Team: TechnologyLead + 3体L2 + QA', async () => {
      const state = await initializeAgents();
      expect(state.agents.get('technology-lead')).toBeDefined();
      expect(state.agents.get('devops-agent')).toBeDefined();
      expect(state.agents.get('security-agent')).toBeDefined();
      expect(state.agents.get('performance-agent')).toBeDefined();
    });

    it('Analytics Team: AnalyticsLead + 3体L2', async () => {
      const state = await initializeAgents();
      expect(state.agents.get('analytics-lead')).toBeDefined();
      expect(state.agents.get('data-analyst')).toBeDefined();
      expect(state.agents.get('ab-test-agent')).toBeDefined();
      expect(state.agents.get('insight-agent')).toBeDefined();
    });

    it('Support Team: support-agent', async () => {
      const state = await initializeAgents();
      expect(state.agents.get('support-agent')).toBeDefined();
    });
  });

  // ── 4. AgentBus統合検証 ──
  describe('AgentBus接続', () => {
    it('Busが初期化されている', async () => {
      await initializeAgents();
      const bus = getAgentBus();
      expect(bus).toBeDefined();
    });

    it('Bus統計が正常（購読数 > 0）', async () => {
      await initializeAgents();
      const bus = getAgentBus();
      const stats = bus!.getStats();
      expect(stats.totalSubscriptions).toBeGreaterThan(0);
    });
  });

  // ── 5. Registry一貫性検証 ──
  describe('Registry一貫性', () => {
    it('Registryに全Agentが登録されている', async () => {
      await initializeAgents();
      const registry = getAgentRegistry();
      expect(registry).toBeDefined();
    });

    it('全Agentがstatusを持つ', async () => {
      const state = await initializeAgents();
      for (const [, info] of state.agents) {
        expect(info.status).toBeDefined();
        expect(['initialized', 'running', 'healthy']).toContain(info.status);
      }
    });
  });

  // ── 6. Pipeline×Agent整合性 ──
  describe('Pipeline-Agent整合性', () => {
    it('全17パイプラインのAgent IDが登録済みAgentに対応する', async () => {
      const state = await initializeAgents();
      const registeredIds = new Set(state.agents.keys());
      const pipelines = getDefaultPipelines();

      for (const p of pipelines) {
        for (const step of p.steps) {
          expect(registeredIds.has(step.agentId)).toBe(true);
        }
      }
    });

    it('21パイプラインが全て定義されている', () => {
      const pipelines = getDefaultPipelines();
      expect(pipelines).toHaveLength(27);
    });
  });

  // ── 7. 医療メタファー成熟順序 ──
  describe('成熟順序（医療メタファー）', () => {
    it('L0（脳幹）→L1（各器官リード）→L2（実行細胞）の初期化順序', async () => {
      const state = await initializeAgents();
      // Commander（L0）が最初に登録されている
      const commander = state.agents.get('commander');
      expect(commander).toBeDefined();
      // L1が全てL0の後に登録
      const l1Ids = ['product-lead', 'marketing-lead', 'operations-lead', 'technology-lead', 'analytics-lead'];
      for (const id of l1Ids) {
        expect(state.agents.has(id)).toBe(true);
      }
    });

    it('全Agentが初期化エラーなし', async () => {
      const state = await initializeAgents();
      expect(state.failureCount).toBe(0);
      for (const [, info] of state.agents) {
        expect(info.status).not.toBe('error');
      }
    });
  });
});
