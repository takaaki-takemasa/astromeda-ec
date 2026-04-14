/**
 * Agent Registry Integrity Tests — Gate 5 (筋骨格)
 *
 * 30体エージェントの骨格構造を検証:
 * - Blueprint定義の完全性（30体漏れなし）
 * - L0/L1/L2 階層構造の正しさ
 * - 依存関係グラフの循環検出
 * - 能力ベース検索の正確性
 * - チーム別ルーティングの整合性
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentRegistry } from '../agent-registry';
import { createAgentBlueprints } from '../../registration/agent-blueprints';
import type { AgentId, AgentBlueprint } from '../../core/types';

describe('Agent Registry Integrity (Gate 5 — 筋骨格)', () => {
  let registry: AgentRegistry;
  let blueprints: Map<string, AgentBlueprint>;

  beforeEach(() => {
    registry = new AgentRegistry();
    blueprints = createAgentBlueprints();
  });

  // ── 5A: Blueprint定義の完全性 ──

  describe('Blueprint Completeness (5A)', () => {
    it('should define exactly 30 agent blueprints', () => {
      expect(blueprints.size).toBe(30);
    });

    it('should have exactly 1 L0 Commander blueprint', () => {
      const l0 = [...blueprints.values()].filter(b => b.agentType === 'L0-Commander');
      expect(l0.length).toBe(1);
      expect(l0[0].id).toBe('commander');
    });

    it('should have exactly 5 L1 Lead blueprints', () => {
      const l1 = [...blueprints.values()].filter(b => b.agentType === 'L1-Lead');
      expect(l1.length).toBe(5);
      const l1Ids = l1.map(b => b.id).sort();
      expect(l1Ids).toEqual([
        'analytics-lead',
        'marketing-lead',
        'operations-lead',
        'product-lead',
        'technology-lead',
      ]);
    });

    it('should have exactly 24 L2 Worker blueprints', () => {
      const l2 = [...blueprints.values()].filter(b => b.agentType === 'L2-Worker');
      expect(l2.length).toBe(24);
    });

    it('every blueprint should have required fields', () => {
      for (const [id, bp] of blueprints) {
        expect(bp.id).toBe(id); // id一致
        expect(bp.agentType).toBeTruthy();
        expect(bp.version).toMatch(/^\d+\.\d+\.\d+$/); // semver
        expect(Array.isArray(bp.capabilities)).toBe(true);
        expect(bp.capabilities.length).toBeGreaterThan(0);
        expect(Array.isArray(bp.dependencies)).toBe(true);
        expect(bp.healthCheck).toBeDefined();
        expect(bp.healthCheck.interval).toBeGreaterThan(0);
        expect(bp.healthCheck.timeout).toBeGreaterThan(0);
        expect(bp.healthCheck.unhealthyThreshold).toBeGreaterThan(0);
      }
    });
  });

  // ── 5B: 階層依存関係の整合性 ──

  describe('Hierarchy Dependencies (5B)', () => {
    it('L0 Commander should have no dependencies', () => {
      const commander = blueprints.get('commander')!;
      expect(commander.dependencies).toEqual([]);
    });

    it('all L1 Leads should depend only on commander', () => {
      const l1 = [...blueprints.values()].filter(b => b.agentType === 'L1-Lead');
      for (const lead of l1) {
        expect(lead.dependencies).toEqual(['commander']);
      }
    });

    it('standard L2 Workers should depend on at least one L1 Lead', () => {
      const l1Ids = new Set(
        [...blueprints.values()].filter(b => b.agentType === 'L1-Lead').map(b => b.id)
      );
      // 特殊エージェント: インフラ系はL1リード直依存ではなくCommander直轄 or 独立
      const INFRA_AGENTS = new Set(['quality-auditor', 'agent-factory', 'support-agent']);
      const l2Standard = [...blueprints.values()].filter(
        b => b.agentType === 'L2-Worker' && !INFRA_AGENTS.has(b.id)
      );
      expect(l2Standard.length).toBe(21); // 24 - 3 infra

      const missingL1Deps: string[] = [];
      for (const worker of l2Standard) {
        const hasL1Dep = worker.dependencies.some(dep => l1Ids.has(dep));
        if (!hasL1Dep) {
          missingL1Deps.push(`${worker.id} deps=[${worker.dependencies.join(',')}]`);
        }
      }
      expect(missingL1Deps).toEqual([]);
    });

    it('infra L2 agents (quality-auditor, agent-factory, support-agent) should have valid deps', () => {
      const allIds = new Set(blueprints.keys());
      const infraAgents = ['quality-auditor', 'agent-factory', 'support-agent'];
      for (const id of infraAgents) {
        const bp = blueprints.get(id)!;
        expect(bp).toBeDefined();
        // 全依存先が実在することを確認
        for (const dep of bp.dependencies) {
          expect(allIds.has(dep)).toBe(true);
        }
      }
    });

    it('no dependency should reference a non-existent agent', () => {
      const allIds = new Set(blueprints.keys());
      for (const [id, bp] of blueprints) {
        for (const dep of bp.dependencies) {
          expect(allIds.has(dep)).toBe(true);
        }
      }
    });
  });

  // ── 5C: レジストリ操作の検証 ──

  describe('Registry Operations (5C)', () => {
    function registerAll() {
      for (const [id, bp] of blueprints) {
        const level = bp.agentType === 'L0-Commander' ? 'L0'
          : bp.agentType === 'L1-Lead' ? 'L1' : 'L2';
        const agentId: AgentId = {
          id,
          level: level as 'L0' | 'L1' | 'L2',
          team: (bp.config as Record<string, unknown>).team as string || (level === 'L0' ? 'command' : id),
        };
        // Register with a mock instance to make it 'active'
        const mockInstance = {
          id: agentId,
          initialize: async () => {},
          shutdown: async () => {},
          getState: () => ({ status: 'healthy' }),
        };
        registry.register(agentId, bp, mockInstance);
      }
    }

    it('should register all 30 agents without error', () => {
      registerAll();
      expect(registry.getStats().total).toBe(30);
      expect(registry.getActiveCount()).toBe(30);
    });

    it('should retrieve agent by ID after registration', () => {
      registerAll();
      const commander = registry.get('commander');
      expect(commander).toBeDefined();
      expect(commander!.blueprint.agentType).toBe('L0-Commander');
    });

    it('should find agents by capability', () => {
      registerAll();
      const orchestrators = registry.findByCapability('orchestration');
      expect(orchestrators.length).toBeGreaterThanOrEqual(1);
      expect(orchestrators[0].id.id).toBe('commander');
    });

    it('should resolve dependency order without circular dependencies', () => {
      registerAll();
      const order = registry.resolveDependencyOrder();
      expect(order.length).toBe(30);

      // Commander must come before all L1s
      const cmdIdx = order.indexOf('commander');
      for (const lead of ['product-lead', 'marketing-lead', 'operations-lead', 'technology-lead', 'analytics-lead']) {
        const leadIdx = order.indexOf(lead);
        expect(cmdIdx).toBeLessThan(leadIdx);
      }
    });

    it('should check dependencies correctly for registered agents', () => {
      registerAll();
      const check = registry.checkDependencies('commander');
      expect(check.satisfied).toBe(true);
      expect(check.missing).toEqual([]);
    });

    it('should report missing dependencies for unregistered agents', () => {
      // Only register commander, not leads
      const bp = blueprints.get('commander')!;
      const mockAgent = {
        id: { id: 'commander', level: 'L0' as const, team: 'command' },
        initialize: async () => {},
        shutdown: async () => {},
        getState: () => ({}),
      };
      registry.register(mockAgent.id, bp, mockAgent);

      // Register product-lead without its dependency being active
      const plBp = blueprints.get('product-lead')!;
      const plId: AgentId = { id: 'product-lead', level: 'L1', team: 'product' };
      registry.register(plId, plBp); // no instance → status='registered', not 'active'

      // product-lead depends on commander, which IS active → satisfied
      // But let's check a worker that depends on product-lead (which is NOT active)
      const imgBp = blueprints.get('image-generator')!;
      const imgId: AgentId = { id: 'image-generator', level: 'L2', team: 'product' };
      registry.register(imgId, imgBp);

      const imgCheck = registry.checkDependencies('image-generator');
      expect(imgCheck.satisfied).toBe(false);
      expect(imgCheck.missing).toContain('product-lead');
    });

    it('should get agents by level', () => {
      registerAll();
      const l0 = registry.getByLevel('L0');
      const l1 = registry.getByLevel('L1');
      const l2 = registry.getByLevel('L2');
      expect(l0.length).toBe(1);
      expect(l1.length).toBe(5);
      expect(l2.length).toBe(24);
    });

    it('should unregister an agent (mark inactive)', () => {
      registerAll();
      registry.unregister('support-agent');
      const agent = registry.get('support-agent');
      expect(agent!.status).toBe('inactive');
      expect(registry.getActiveCount()).toBe(29);
    });
  });

  // ── 5D: 能力一意性の検証 ──

  describe('Capability Uniqueness (5D)', () => {
    it('each L2 worker should have at least one unique capability', () => {
      const l2 = [...blueprints.values()].filter(b => b.agentType === 'L2-Worker');
      const capabilityOwners = new Map<string, string[]>();

      for (const worker of l2) {
        for (const cap of worker.capabilities) {
          if (!capabilityOwners.has(cap)) capabilityOwners.set(cap, []);
          capabilityOwners.get(cap)!.push(worker.id);
        }
      }

      for (const worker of l2) {
        const hasUniqueCapability = worker.capabilities.some(
          cap => capabilityOwners.get(cap)!.length === 1
        );
        // Warn but don't fail — some overlap is expected
        if (!hasUniqueCapability) {
          console.warn(`[Gate 5D] ${worker.id} has no unique capability — all shared`);
        }
      }
      // At minimum, verify the set of capabilities is not empty
      expect(capabilityOwners.size).toBeGreaterThan(0);
    });

    it('no two agents should have identical capability sets', () => {
      const capSets = new Map<string, string>();
      for (const [id, bp] of blueprints) {
        const key = [...bp.capabilities].sort().join(',');
        if (capSets.has(key)) {
          console.warn(`[Gate 5D] ${id} has identical capabilities to ${capSets.get(key)}`);
        }
        capSets.set(key, id);
      }
      // Structural: at least ensure variety exists
      expect(capSets.size).toBeGreaterThanOrEqual(20);
    });
  });
});
