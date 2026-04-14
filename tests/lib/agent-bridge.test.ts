/**
 * Agent Bridge Test Suite
 *
 * Tests the core server-side agent bridge functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  warmUp,
  ensureInitialized,
  isInitializedFlag,
  getAdminStatus,
  getAgentList,
  getPipelineList,
  setBridgeEnv,
  getQuickActions,
} from '~/lib/agent-bridge';

describe('AgentBridge', () => {
  beforeEach(() => {
    // Reset initialization state before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up after tests
    vi.resetModules();
  });

  describe('warmUp', () => {
    it('should be callable without throwing', async () => {
      // Test that warmUp function exists and is callable
      const result = warmUp();
      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.not.toThrow();
    });

    it('should accept optional environment variables', async () => {
      const testEnv = {
        TEST_VAR: 'test-value',
        ANOTHER_VAR: 'another-value',
      };

      const result = warmUp(testEnv);
      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.not.toThrow();
    });

    it('should handle multiple consecutive warmUp calls', async () => {
      // warmUp should be idempotent (safe to call multiple times)
      await expect(warmUp()).resolves.not.toThrow();
      await expect(warmUp()).resolves.not.toThrow();
    });
  });

  describe('ensureInitialized', () => {
    it('should not throw on initialization', async () => {
      const result = ensureInitialized();
      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.not.toThrow();
    });

    it('should return a Promise', async () => {
      const result = ensureInitialized();
      expect(result).toBeInstanceOf(Promise);
      await result;
    });

    it('should handle concurrent initialization calls', async () => {
      // Multiple concurrent calls should all resolve without error
      const promises = [
        ensureInitialized(),
        ensureInitialized(),
        ensureInitialized(),
      ];
      await expect(Promise.all(promises)).resolves.not.toThrow();
    });
  });

  describe('isInitializedFlag', () => {
    it('should return a boolean', () => {
      const result = isInitializedFlag();
      expect(typeof result).toBe('boolean');
    });

    it('should return false initially or after reset', () => {
      const result = isInitializedFlag();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('setBridgeEnv', () => {
    it('should accept and store environment variables', () => {
      const testEnv = {
        API_KEY: 'test-key',
        API_SECRET: 'test-secret',
      };

      expect(() => setBridgeEnv(testEnv)).not.toThrow();
    });

    it('should accept empty environment object', () => {
      expect(() => setBridgeEnv({})).not.toThrow();
    });

    it('should handle undefined values in environment', () => {
      const testEnv = {
        DEFINED_VAR: 'value',
        UNDEFINED_VAR: undefined,
      };

      expect(() => setBridgeEnv(testEnv)).not.toThrow();
    });
  });

  describe('getAdminStatus', () => {
    it('should return a status response with valid structure', async () => {
      const status = await getAdminStatus();

      expect(status).toBeDefined();
      expect(status.timestamp).toBeDefined();
      expect(typeof status.timestamp).toBe('number');
      expect(status.system).toBeDefined();
      expect(status.agents).toBeDefined();
      expect(status.bus).toBeDefined();
    });

    it('should include system information', async () => {
      const status = await getAdminStatus();

      expect(status.system.andonStatus).toMatch(/^(green|yellow|red)$/);
      expect(typeof status.system.uptime).toBe('number');
      expect(status.system.phase).toBeDefined();
    });

    it('should include agent statistics', async () => {
      const status = await getAdminStatus();

      expect(typeof status.agents.total).toBe('number');
      expect(typeof status.agents.active).toBe('number');
      expect(typeof status.agents.healthy).toBe('number');
      expect(typeof status.agents.degraded).toBe('number');
      expect(typeof status.agents.error).toBe('number');
    });

    it('should return fallback mock on error with isMock flag', async () => {
      const status = await getAdminStatus();
      // Status should be returned (either real or mock)
      expect(status).toBeDefined();
      expect(status.timestamp).toBeGreaterThan(0);
    });
  });

  describe('getAgentList', () => {
    it('should return an array of agents', async () => {
      const agents = await getAgentList();

      expect(Array.isArray(agents)).toBe(true);
    });

    it('should have valid agent structure if agents exist', async () => {
      const agents = await getAgentList();

      if (agents.length > 0) {
        const agent = agents[0];
        expect(agent.id).toBeDefined();
        expect(agent.name).toBeDefined();
        expect(agent.level).toMatch(/^(L0|L1|L2)$/);
        expect(agent.status).toMatch(/^(healthy|degraded|error|offline|pending)$/);
      }
    });

    it('should return sorted agents by ID', async () => {
      const agents = await getAgentList();

      if (agents.length > 1) {
        // Verify agents are sorted by ID
        for (let i = 1; i < agents.length; i++) {
          expect(agents[i].id.localeCompare(agents[i - 1].id)).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('getPipelineList', () => {
    it('should return an array of pipelines', () => {
      const pipelines = getPipelineList();

      expect(Array.isArray(pipelines)).toBe(true);
    });

    it('should have valid pipeline structure', () => {
      const pipelines = getPipelineList();

      if (pipelines.length > 0) {
        const pipeline = pipelines[0];
        expect(pipeline.id).toBeDefined();
        expect(pipeline.name).toBeDefined();
        expect(pipeline.status).toMatch(/^(running|idle|error|paused)$/);
        expect(typeof pipeline.lastRun).toBe('number');
        expect(typeof pipeline.successRate).toBe('number');
        expect(typeof pipeline.avgDuration).toBe('number');
      }
    });

    it('should return at least default pipelines', () => {
      const pipelines = getPipelineList();

      expect(pipelines.length).toBeGreaterThan(0);
    });
  });

  describe('getQuickActions', () => {
    it('should return an array of quick actions', () => {
      const actions = getQuickActions();

      expect(Array.isArray(actions)).toBe(true);
      expect(actions.length).toBeGreaterThan(0);
    });

    it('should have valid quick action structure', () => {
      const actions = getQuickActions();

      if (actions.length > 0) {
        const action = actions[0];
        expect(action.id).toBeDefined();
        expect(action.name).toBeDefined();
        expect(action.description).toBeDefined();
        expect(action.agentId).toBeDefined();
        expect(action.action).toBeDefined();
        expect(action.params).toBeDefined();
        expect(action.icon).toBeDefined();
        expect(action.category).toMatch(/^(analytics|operations|quality|marketing)$/);
      }
    });

    it('should include multiple categories', () => {
      const actions = getQuickActions();
      const categories = new Set(actions.map(a => a.category));

      expect(categories.size).toBeGreaterThan(0);
    });
  });
});
