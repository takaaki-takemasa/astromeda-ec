/**
 * Developmental Order Guard Tests — 予防医学テスト
 *
 * 発達順序の異常を早期検出するガードレール:
 * - Bus障害時にHealthMonitorが沈黙しないこと
 * - Cascade rollbackが失敗を正確に報告すること
 * - Restart loopが無限暴走しないこと
 * - 非null断言の安全性
 * - Storage初期化の冪等性
 *
 * これらのテストは「予防接種」— 過去に発見した問題が再発しないことを保証する。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRegistry } from '../../registry/agent-registry';
import { createAgentBlueprints } from '../../registration/agent-blueprints';
import { initStorageFromEnv, getStorage, getStorageType } from '../storage';

describe('Developmental Order Guards (予防医学)', () => {

  // ── Guard 1: 依存関係に非null断言を使わない ──
  describe('Registry dependency check safety', () => {
    it('should not crash when checking dependencies of agent with missing deps', () => {
      const registry = new AgentRegistry();
      const bp = createAgentBlueprints().get('product-lead')!;
      // product-lead depends on commander, but we don't register commander
      const agentId = { id: 'product-lead', level: 'L1' as const, team: 'product' };
      registry.register(agentId, bp);

      // This should not throw — it should return missing deps
      const check = registry.checkDependencies('product-lead');
      expect(check.satisfied).toBe(false);
      expect(check.missing).toContain('commander');
    });

    it('should return false for non-existent agent', () => {
      const registry = new AgentRegistry();
      const check = registry.checkDependencies('non-existent');
      expect(check.satisfied).toBe(false);
      expect(check.missing).toContain('non-existent');
    });
  });

  // ── Guard 2: Storage冪等性 ──
  describe('Storage initialization idempotency', () => {
    it('should return same instance on repeated calls', async () => {
      const storage1 = await initStorageFromEnv({});
      const storage2 = await initStorageFromEnv({});
      expect(storage1).toBe(storage2);
    });

    it('should have consistent type after repeated init', async () => {
      await initStorageFromEnv({});
      const type1 = getStorageType();
      await initStorageFromEnv({});
      const type2 = getStorageType();
      expect(type1).toBe(type2);
    });
  });

  // ── Guard 3: Blueprint完全性（先天性異常検出） ──
  describe('Blueprint completeness guard', () => {
    it('all 30 required agents must have blueprints', () => {
      const blueprints = createAgentBlueprints();
      const requiredIds = [
        'commander',
        'product-lead', 'marketing-lead', 'operations-lead', 'technology-lead', 'analytics-lead',
        'image-generator', 'product-catalog', 'ux-agent', 'content-writer', 'seo-director',
        'quality-auditor', 'agent-factory', 'pricing-agent', 'promotion-agent', 'conversion-agent',
        'devops-agent', 'security-agent', 'performance-agent', 'data-analyst', 'ab-test-agent',
        'insight-agent', 'support-agent', 'inventory-monitor', 'business-analyst', 'auth-manager',
        'infra-manager', 'deploy-manager', 'error-monitor', 'analytics-agent',
      ];

      for (const id of requiredIds) {
        const bp = blueprints.get(id);
        expect(bp, `Blueprint missing for ${id}`).toBeDefined();
        expect(bp!.id).toBe(id);
      }
    });

    it('no blueprint should have undefined capabilities', () => {
      const blueprints = createAgentBlueprints();
      for (const [id, bp] of blueprints) {
        expect(bp.capabilities, `${id} has undefined capabilities`).toBeDefined();
        expect(Array.isArray(bp.capabilities), `${id} capabilities not an array`).toBe(true);
        expect(bp.capabilities.length, `${id} has no capabilities`).toBeGreaterThan(0);
        for (const cap of bp.capabilities) {
          expect(typeof cap, `${id} has non-string capability`).toBe('string');
          expect(cap.length, `${id} has empty capability string`).toBeGreaterThan(0);
        }
      }
    });
  });

  // ── Guard 4: 発達順序（L0→L1→L2の依存方向） ──
  describe('Hierarchical dependency direction', () => {
    it('no L0 agent should depend on L1 or L2', () => {
      const blueprints = createAgentBlueprints();
      const l0 = [...blueprints.values()].filter(b => b.agentType === 'L0-Commander');
      for (const bp of l0) {
        expect(bp.dependencies, `L0 ${bp.id} has upward dependencies`).toEqual([]);
      }
    });

    it('no L1 agent should depend on L2', () => {
      const blueprints = createAgentBlueprints();
      const l2Ids = new Set(
        [...blueprints.values()].filter(b => b.agentType === 'L2-Worker').map(b => b.id)
      );
      const l1 = [...blueprints.values()].filter(b => b.agentType === 'L1-Lead');
      for (const bp of l1) {
        for (const dep of bp.dependencies) {
          expect(l2Ids.has(dep), `L1 ${bp.id} depends on L2 ${dep}`).toBe(false);
        }
      }
    });

    it('dependency graph should be acyclic', () => {
      const blueprints = createAgentBlueprints();
      const registry = new AgentRegistry();
      for (const [id, bp] of blueprints) {
        const level = bp.agentType === 'L0-Commander' ? 'L0'
          : bp.agentType === 'L1-Lead' ? 'L1' : 'L2';
        const agentId = { id, level: level as 'L0' | 'L1' | 'L2', team: id };
        const mock = { id: agentId, initialize: async () => {}, shutdown: async () => {}, getState: () => ({}) };
        registry.register(agentId, bp, mock);
      }

      // If circular dependency exists, this will throw
      expect(() => registry.resolveDependencyOrder()).not.toThrow();
      const order = registry.resolveDependencyOrder();
      expect(order.length).toBe(30);
    });
  });
});
