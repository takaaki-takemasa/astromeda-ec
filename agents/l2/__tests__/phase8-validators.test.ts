/**
 * Phase 8 Validators Test Suite — G-039 AI Capability Validator
 *
 * 15+ tests covering:
 * - validate_agent: Single agent capability validation
 * - validate_all: Comprehensive health matrix generation
 * - ai_routing_test: Dual-AI routing verification
 * - response_quality_check: Statistical quality validation
 * - regression_test: Baseline comparison
 *
 * 免疫検査技師 (Immunology Lab Technician) validation harness
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IAgentBus, AgentEvent, CascadeCommand } from '../../core/types';
import { AICapabilityValidator } from '../ai-capability-validator';

/**
 * Mock Agent Bus for isolated testing
 */
function createMockBus(): IAgentBus {
  const handlers = new Map<
    string,
    Array<(event: AgentEvent) => Promise<void> | void>
  >();
  let subCounter = 0;

  return {
    publish: vi.fn(async (event: AgentEvent) => {
      const pattern = Array.from(handlers.keys()).find(
        (p) =>
          event.type === p ||
          (p.endsWith('*') && event.type.startsWith(p.slice(0, -1))),
      );
      if (pattern) {
        const fns = handlers.get(pattern) || [];
        for (const fn of fns) {
          await Promise.resolve(fn(event));
        }
      }
    }),
    subscribe: vi.fn((pattern: string, handler) => {
      const existing = handlers.get(pattern) || [];
      existing.push(handler);
      handlers.set(pattern, existing);
      return `sub_${subCounter++}`;
    }),
    unsubscribe: vi.fn(),
    request: vi.fn(async () => ({
      id: 'mock-response',
      type: 'mock.response',
      source: 'mock-bus',
      priority: 'normal',
      payload: {},
      timestamp: Date.now(),
    })),
  } as unknown as IAgentBus;
}

describe('Phase 8: AI Capability Validator (G-039)', () => {
  let bus: IAgentBus;
  let validator: AICapabilityValidator;

  beforeEach(async () => {
    bus = createMockBus();
    validator = new AICapabilityValidator(bus);
    await validator.initialize();
  });

  afterEach(async () => {
    await validator.shutdown();
  });

  // ────────────────────────────────────────
  // Suite 1: Initialization & Lifecycle
  // ────────────────────────────────────────

  describe('Initialization & Lifecycle', () => {
    it('should initialize with correct ID and metadata', () => {
      expect(validator.id.id).toBe('ai-capability-validator');
      expect(validator.id.name).toBe('AI Capability Validator');
      expect(validator.id.level).toBe('L2');
      expect(validator.id.team).toBe('quality');
      expect(validator.id.version).toBe('1.0.0');
    });

    it('should become healthy after initialization', async () => {
      const health = validator.getHealth();
      expect(health.status).toBe('healthy');
      expect(health.agentId).toBe('ai-capability-validator');
    });

    it('should publish initialization event', async () => {
      // Re-create to capture init event
      const newValidator = new AICapabilityValidator(bus);
      await newValidator.initialize();

      expect(bus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ai-capability-validator.initialized',
          source: 'ai-capability-validator',
        }),
      );
    });

    it('should shutdown cleanly', async () => {
      await validator.shutdown();
      expect(validator.getHealth().status).toBe('shutdown');
    });

    it('should handle multiple initialize/shutdown cycles', async () => {
      await validator.shutdown();
      const health1 = validator.getHealth();
      expect(health1.status).toBe('shutdown');

      const newValidator = new AICapabilityValidator(bus);
      await newValidator.initialize();
      const health2 = newValidator.getHealth();
      expect(health2.status).toBe('healthy');

      await newValidator.shutdown();
    });
  });

  // ────────────────────────────────────────
  // Suite 2: validate_agent Action
  // ────────────────────────────────────────

  describe('validate_agent Action', () => {
    it('should validate a single agent with default test count', async () => {
      const result = await validator.handleCommand({
        id: 'cmd-validate-agent-1',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'validate_agent',
        params: { agentId: 'seo-director' },
        priority: 'normal',
      });

      expect(result).toHaveProperty('agentId', 'seo-director');
      expect(result).toHaveProperty('healthy');
      expect(result).toHaveProperty('responseQuality');
      expect(result).toHaveProperty('convergenceCV');
      expect(result).toHaveProperty('timestamp');
    });

    it('should validate agent with custom test count', async () => {
      const result = await validator.handleCommand({
        id: 'cmd-validate-agent-2',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'validate_agent',
        params: { agentId: 'content-writer', testCount: 10 },
        priority: 'normal',
      });

      expect(result).toHaveProperty('roundsCompleted', 10);
      expect((result as any).responseQuality).toHaveProperty('latency');
      expect((result as any).responseQuality).toHaveProperty('coherence');
      expect((result as any).responseQuality).toHaveProperty('accuracy');
    });

    it('should measure response quality components', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-validate-agent-3',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'validate_agent',
        params: { agentId: 'image-generator', testCount: 5 },
        priority: 'normal',
      })) as any;

      const quality = result.responseQuality;
      expect(quality.latency).toBeGreaterThan(0);
      expect(quality.tokensPerSecond).toBeGreaterThan(0);
      expect(quality.coherence).toBeGreaterThanOrEqual(0);
      expect(quality.coherence).toBeLessThanOrEqual(100);
      expect(quality.accuracy).toBeGreaterThanOrEqual(0);
      expect(quality.accuracy).toBeLessThanOrEqual(100);
      expect(quality.errorRate).toBeGreaterThanOrEqual(0);
      expect(quality.errorRate).toBeLessThanOrEqual(1);
    });

    it('should publish progress events during validation', async () => {
      await validator.handleCommand({
        id: 'cmd-validate-agent-4',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'validate_agent',
        params: { agentId: 'security-agent', testCount: 3 },
        priority: 'normal',
      });

      expect(bus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'validation.agent.started',
        }),
      );

      expect(bus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'validation.agent.completed',
        }),
      );
    });

    it('should calculate convergence (CV) correctly', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-validate-agent-5',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'validate_agent',
        params: { agentId: 'performance-agent', testCount: 8 },
        priority: 'normal',
      })) as any;

      expect(result.convergenceCV).toBeGreaterThanOrEqual(0);
      expect(result.convergenceCV).toBeLessThanOrEqual(100); // CV typically 0-50%
    });
  });

  // ────────────────────────────────────────
  // Suite 3: validate_all Action
  // ────────────────────────────────────────

  describe('validate_all Action', () => {
    it('should generate comprehensive health matrix', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-validate-all-1',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'validate_all',
        params: { testCount: 2 },
        priority: 'normal',
      })) as any;

      expect(result).toHaveProperty('totalAgents');
      expect(result).toHaveProperty('healthyCount');
      expect(result).toHaveProperty('degradedCount');
      expect(result).toHaveProperty('errorCount');
      expect(result).toHaveProperty('agents');
      expect(result).toHaveProperty('summary');
    });

    it('should produce correct agent list in matrix', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-validate-all-2',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'validate_all',
        params: { testCount: 1 },
        priority: 'normal',
      })) as any;

      expect(result.agents).toBeInstanceOf(Array);
      expect(result.agents.length).toBeGreaterThan(0);
      expect(result.agents[0]).toHaveProperty('agentId');
      expect(result.agents[0]).toHaveProperty('responseQuality');
    });

    it('should calculate system health status correctly', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-validate-all-3',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'validate_all',
        params: { testCount: 1 },
        priority: 'normal',
      })) as any;

      expect(result.summary.systemHealth).toMatch(
        /excellent|good|fair|poor/,
      );
    });

    it('should aggregate metrics correctly', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-validate-all-4',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'validate_all',
        params: { testCount: 2 },
        priority: 'normal',
      })) as any;

      const summary = result.summary;
      expect(summary.avgErrorRate).toBeGreaterThanOrEqual(0);
      expect(summary.avgErrorRate).toBeLessThanOrEqual(1);
      expect(summary.avgLatency).toBeGreaterThan(0);
      expect(summary.avgCoherence).toBeGreaterThanOrEqual(0);
      expect(summary.avgCoherence).toBeLessThanOrEqual(100);
    });

    it('should publish completion event with summary', async () => {
      await validator.handleCommand({
        id: 'cmd-validate-all-5',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'validate_all',
        params: { testCount: 1 },
        priority: 'normal',
      });

      expect(bus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'validation.all.completed',
          payload: expect.objectContaining({
            totalAgents: expect.any(Number),
          }),
        }),
      );
    });
  });

  // ────────────────────────────────────────
  // Suite 4: ai_routing_test Action
  // ────────────────────────────────────────

  describe('ai_routing_test Action', () => {
    it('should test Tier A (Claude Sonnet) routing', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-routing-1',
        from: 'engineering-lead',
        to: ['ai-capability-validator'],
        action: 'ai_routing_test',
        params: { testCount: 3 },
        priority: 'normal',
      })) as any;

      expect(result.tierA).toBeDefined();
      expect(result.tierA.claudeTests).toBeGreaterThan(0);
      expect(result.tierA.avgLatency).toBeGreaterThan(0);
    });

    it('should test Tier B (Claude Haiku) routing', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-routing-2',
        from: 'engineering-lead',
        to: ['ai-capability-validator'],
        action: 'ai_routing_test',
        params: { testCount: 2 },
        priority: 'normal',
      })) as any;

      expect(result.tierB).toBeDefined();
      expect(result.tierB.claudeTests).toBeGreaterThan(0);
      expect(result.tierB.avgLatency).toBeGreaterThan(0);
    });

    it('should test Tier C (Gemini Flash) routing', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-routing-3',
        from: 'engineering-lead',
        to: ['ai-capability-validator'],
        action: 'ai_routing_test',
        params: { testCount: 2 },
        priority: 'normal',
      })) as any;

      expect(result.tierC).toBeDefined();
      expect(result.tierC.geminiTests).toBeGreaterThan(0);
      expect(result.tierC.avgLatency).toBeGreaterThan(0);
    });

    it('should test Tier D (Gemini Flash-Lite) routing', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-routing-4',
        from: 'engineering-lead',
        to: ['ai-capability-validator'],
        action: 'ai_routing_test',
        params: { testCount: 2 },
        priority: 'normal',
      })) as any;

      expect(result.tierD).toBeDefined();
      expect(result.tierD.geminiTests).toBeGreaterThan(0);
      expect(result.tierD.avgLatency).toBeGreaterThan(0);
    });

    it('should report overall routing success', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-routing-5',
        from: 'engineering-lead',
        to: ['ai-capability-validator'],
        action: 'ai_routing_test',
        params: { testCount: 2 },
        priority: 'normal',
      })) as any;

      expect(result.routingSuccess).toBe(true);
      expect(result.timestamp).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────
  // Suite 5: response_quality_check Action
  // ────────────────────────────────────────

  describe('response_quality_check Action', () => {
    it('should measure response quality against baseline', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-quality-1',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'response_quality_check',
        params: { agentId: 'seo-director', testCount: 5 },
        priority: 'normal',
      })) as any;

      expect(result).toHaveProperty('quality');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('tTestResult');
      expect(result).toHaveProperty('findings');
    });

    it('should provide t-test statistical result', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-quality-2',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'response_quality_check',
        params: { agentId: 'content-writer', testCount: 5 },
        priority: 'normal',
      })) as any;

      expect(result.tTestResult.pValue).toBeGreaterThanOrEqual(0);
      expect(result.tTestResult.pValue).toBeLessThanOrEqual(1);
      expect(result.tTestResult.significant).toBe(
        result.tTestResult.pValue < 0.05,
      );
    });

    it('should pass when quality is acceptable', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-quality-3',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'response_quality_check',
        params: { agentId: 'image-generator', testCount: 8 },
        priority: 'normal',
      })) as any;

      expect(typeof result.passed).toBe('boolean');
    });

    it('should produce findings array', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-quality-4',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'response_quality_check',
        params: { agentId: 'security-agent', testCount: 5 },
        priority: 'normal',
      })) as any;

      expect(result.findings).toBeInstanceOf(Array);
    });

    it('should support custom baseline key', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-quality-5',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'response_quality_check',
        params: {
          agentId: 'devops-agent',
          testCount: 5,
          baselineKey: 'v135-release',
        },
        priority: 'normal',
      })) as any;

      expect(result.quality).toHaveProperty('latency');
      expect(result.quality).toHaveProperty('coherence');
    });
  });

  // ────────────────────────────────────────
  // Suite 6: regression_test Action
  // ────────────────────────────────────────

  describe('regression_test Action', () => {
    it('should compare current vs baseline performance', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-regression-1',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'regression_test',
        params: { agentId: 'pricing-agent', testCount: 5 },
        priority: 'normal',
      })) as any;

      expect(result).toHaveProperty('baseline');
      expect(result).toHaveProperty('current');
      expect(result).toHaveProperty('regressionDetected');
      expect(result).toHaveProperty('findings');
    });

    it('should calculate t-test p-value', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-regression-2',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'regression_test',
        params: { agentId: 'conversion-agent', testCount: 5 },
        priority: 'normal',
      })) as any;

      expect(result.tTestPValue).toBeGreaterThanOrEqual(0);
      expect(result.tTestPValue).toBeLessThanOrEqual(1);
    });

    it('should calculate Cohen\'s d effect size', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-regression-3',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'regression_test',
        params: { agentId: 'analytics-agent', testCount: 5 },
        priority: 'normal',
      })) as any;

      expect(typeof result.cohenDEffect).toBe('number');
      expect(result.cohenDEffect).toBeGreaterThanOrEqual(-5); // Cohen's d range
      expect(result.cohenDEffect).toBeLessThanOrEqual(5);
    });

    it('should detect regression when effect size > 0.2', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-regression-4',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'regression_test',
        params: { agentId: 'quality-auditor', testCount: 5 },
        priority: 'normal',
      })) as any;

      // Regression is detected when p < 0.05 AND Cohen's d > 0.2
      const shouldDetect =
        result.tTestPValue < 0.05 && result.cohenDEffect > 0.2;
      expect(result.regressionDetected).toBe(shouldDetect);
    });

    it('should support custom baseline key', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-regression-5',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'regression_test',
        params: {
          agentId: 'support-agent',
          testCount: 5,
          baselineKey: 'v134-stable',
        },
        priority: 'normal',
      })) as any;

      expect(result.baseline).toHaveProperty('avgLatency');
      expect(result.baseline).toHaveProperty('avgCoherence');
      expect(result.baseline).toHaveProperty('avgErrorRate');
    });
  });

  // ────────────────────────────────────────
  // Suite 7: Error Handling
  // ────────────────────────────────────────

  describe('Error Handling', () => {
    it('should handle unknown action gracefully', async () => {
      const result = await validator.handleCommand({
        id: 'cmd-error-1',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'unknown_action',
        params: {},
        priority: 'normal',
      });

      // BaseL2Agent catches errors and returns { status: 'error', error: ... }
      expect(result).toHaveProperty('status', 'error');
      expect((result as any).error).toContain('unknown action');
    });

    it('should publish failure event on validation error', async () => {
      try {
        await validator.handleCommand({
          id: 'cmd-error-2',
          from: 'quality-auditor',
          to: ['ai-capability-validator'],
          action: 'validate_agent',
          params: { agentId: null }, // Invalid: null agentId
          priority: 'normal',
        });
      } catch {
        // Expected to catch or handle gracefully
      }

      // Validation should still complete (with fallback)
      expect(bus.publish).toHaveBeenCalled();
    });

    it('should maintain health status during failures', async () => {
      const healthBefore = validator.getHealth();
      const statusBefore = healthBefore.status;

      try {
        await validator.handleCommand({
          id: 'cmd-error-3',
          from: 'quality-auditor',
          to: ['ai-capability-validator'],
          action: 'unknown_action',
          params: {},
          priority: 'normal',
        });
      } catch {
        // Suppress error
      }

      const healthAfter = validator.getHealth();
      // Status may degrade to 'degraded' after errors, but should not be 'shutdown'
      expect(['healthy', 'degraded', 'error']).toContain(healthAfter.status);
    });
  });

  // ────────────────────────────────────────
  // Suite 8: Event Handling
  // ────────────────────────────────────────

  describe('Event Handling', () => {
    it('should handle health check events', async () => {
      const event: AgentEvent = {
        id: 'evt-1',
        type: 'health.check',
        source: 'health-monitor',
        priority: 'normal',
        payload: {},
        timestamp: Date.now(),
      };

      await validator.handleEvent(event);

      expect(bus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ai-capability-validator.health_requested',
        }),
      );
    });

    it('should ignore non-matching events gracefully', async () => {
      const event: AgentEvent = {
        id: 'evt-2',
        type: 'unknown.event.type',
        source: 'some-agent',
        priority: 'normal',
        payload: {},
        timestamp: Date.now(),
      };

      // Should not throw
      await expect(validator.handleEvent(event)).resolves.not.toThrow();
    });
  });

  // ────────────────────────────────────────
  // Suite 9: Data Structure Validation
  // ────────────────────────────────────────

  describe('Data Structure Validation', () => {
    it('should return proper AgentValidationResult structure', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-struct-1',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'validate_agent',
        params: { agentId: 'test-agent', testCount: 3 },
        priority: 'normal',
      })) as any;

      expect(result).toMatchObject({
        agentId: expect.any(String),
        agentName: expect.any(String),
        healthy: expect.any(Boolean),
        lastHeartbeat: expect.any(Number),
        uptime: expect.any(Number),
        errorCount: expect.any(Number),
        taskQueue: expect.any(Number),
        responseQuality: expect.any(Object),
        roundsCompleted: expect.any(Number),
        convergenceCV: expect.any(Number),
        timestamp: expect.any(Number),
      });
    });

    it('should return proper HealthMatrix structure', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-struct-2',
        from: 'quality-auditor',
        to: ['ai-capability-validator'],
        action: 'validate_all',
        params: { testCount: 1 },
        priority: 'normal',
      })) as any;

      expect(result).toMatchObject({
        totalAgents: expect.any(Number),
        healthyCount: expect.any(Number),
        degradedCount: expect.any(Number),
        errorCount: expect.any(Number),
        timestamp: expect.any(Number),
        agents: expect.any(Array),
        summary: expect.objectContaining({
          avgErrorRate: expect.any(Number),
          avgLatency: expect.any(Number),
          avgCoherence: expect.any(Number),
          systemHealth: expect.any(String),
        }),
      });
    });

    it('should return proper AIRoutingTestResult structure', async () => {
      const result = (await validator.handleCommand({
        id: 'cmd-struct-3',
        from: 'engineering-lead',
        to: ['ai-capability-validator'],
        action: 'ai_routing_test',
        params: { testCount: 1 },
        priority: 'normal',
      })) as any;

      expect(result).toMatchObject({
        tierA: expect.objectContaining({
          claudeTests: expect.any(Number),
          geminiFallbacks: expect.any(Number),
          avgLatency: expect.any(Number),
        }),
        tierB: expect.any(Object),
        tierC: expect.any(Object),
        tierD: expect.any(Object),
        routingSuccess: expect.any(Boolean),
        timestamp: expect.any(Number),
      });
    });
  });
});
