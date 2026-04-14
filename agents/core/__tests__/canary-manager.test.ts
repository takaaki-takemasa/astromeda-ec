/**
 * CanaryManager Tests — T073-T074
 *
 * Tests for canary deployment and A/B testing.
 * Covers: canary creation, traffic routing, metrics, evaluation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CanaryManager, getCanaryManager, setCanaryManager } from '../canary-manager.js';
import { InMemoryStorage } from '../storage.js';

describe('CanaryManager - T073-T074', () => {
  let manager: CanaryManager;

  beforeEach(async () => {
    manager = new CanaryManager(new InMemoryStorage());
    setCanaryManager(manager);
  });

  describe('createCanary', () => {
    it('should create a canary deployment', async () => {
      await manager.createCanary('rollout-v2', {
        variant_a: 'v1.0.0',
        variant_b: 'v2.0.0',
        trafficPercent: 10,
        duration: 60000,
      });

      const canary = manager.getCanary('rollout-v2');
      expect(canary).toBeDefined();
      expect(canary!.status).toBe('pending');
    });

    it('should reject invalid traffic percent', async () => {
      await expect(
        manager.createCanary('bad-canary', {
          variant_a: 'v1',
          variant_b: 'v2',
          trafficPercent: 150, // Invalid
          duration: 1000,
        })
      ).rejects.toThrow();
    });

    it('should set correct metadata', async () => {
      const now = Date.now();
      await manager.createCanary('test-canary', {
        variant_a: 'a',
        variant_b: 'b',
        trafficPercent: 50,
        duration: 1000,
      });

      const canary = manager.getCanary('test-canary');
      expect(canary!.name).toBe('test-canary');
      expect(canary!.variant_a).toBe('a');
      expect(canary!.variant_b).toBe('b');
      expect(canary!.trafficPercent).toBe(50);
      expect(canary!.createdAt).toBeGreaterThanOrEqual(now);
    });
  });

  describe('routeTraffic', () => {
    beforeEach(async () => {
      await manager.createCanary('split-test', {
        variant_a: 'control',
        variant_b: 'experimental',
        trafficPercent: 50,
        duration: 60000,
      });
    });

    it('should route to variant a or b', () => {
      const route = manager.routeTraffic('split-test', 'request-123');
      expect(['a', 'b']).toContain(route);
    });

    it('should be deterministic (same request ID gets same variant)', () => {
      const route1 = manager.routeTraffic('split-test', 'request-123');
      const route2 = manager.routeTraffic('split-test', 'request-123');
      const route3 = manager.routeTraffic('split-test', 'request-123');

      expect(route1).toBe(route2);
      expect(route2).toBe(route3);
    });

    it('should default to variant a for non-existent canary', () => {
      const route = manager.routeTraffic('nonexistent', 'request-1');
      expect(route).toBe('a');
    });

    it('should respect traffic percentage distribution', async () => {
      // Create 0% traffic canary (all go to A)
      await manager.createCanary('no-traffic', {
        variant_a: 'a',
        variant_b: 'b',
        trafficPercent: 0,
        duration: 1000,
      });

      for (let i = 0; i < 10; i++) {
        expect(manager.routeTraffic('no-traffic', `request-${i}`)).toBe('a');
      }

      // Create 100% traffic canary (all go to B)
      await manager.createCanary('full-traffic', {
        variant_a: 'a',
        variant_b: 'b',
        trafficPercent: 100,
        duration: 1000,
      });

      for (let i = 0; i < 10; i++) {
        expect(manager.routeTraffic('full-traffic', `request-${i}`)).toBe('b');
      }
    });
  });

  describe('recordMetric', () => {
    beforeEach(async () => {
      await manager.createCanary('perf-test', {
        variant_a: 'old',
        variant_b: 'new',
        trafficPercent: 50,
        duration: 60000,
      });
    });

    it('should record metrics for variant a', async () => {
      await manager.recordMetric('perf-test', 'a', 'latency', 100);
      await manager.recordMetric('perf-test', 'a', 'latency', 105);
      await manager.recordMetric('perf-test', 'a', 'latency', 98);

      const metrics = manager.getMetrics('perf-test');
      expect(metrics!.variant_a.latency).toHaveLength(3);
      expect(metrics!.variant_a.latency).toContain(100);
    });

    it('should record metrics for variant b', async () => {
      await manager.recordMetric('perf-test', 'b', 'latency', 50);
      await manager.recordMetric('perf-test', 'b', 'latency', 52);

      const metrics = manager.getMetrics('perf-test');
      expect(metrics!.variant_b.latency).toHaveLength(2);
    });

    it('should track different metric types', async () => {
      await manager.recordMetric('perf-test', 'a', 'latency', 100);
      await manager.recordMetric('perf-test', 'a', 'errorCount', 2);
      await manager.recordMetric('perf-test', 'a', 'throughput', 1000);

      const metrics = manager.getMetrics('perf-test');
      expect(metrics!.variant_a.latency).toBeDefined();
      expect(metrics!.variant_a.errorCount).toBeDefined();
      expect(metrics!.variant_a.throughput).toBeDefined();
    });

    it('should silently ignore metrics for non-existent canary', async () => {
      await expect(
        manager.recordMetric('nonexistent', 'a', 'latency', 100)
      ).resolves.not.toThrow();
    });
  });

  describe('evaluateCanary', () => {
    it('should recommend continue on missing data', () => {
      const result = manager.evaluateCanary('nonexistent');
      expect(result.recommendation).toBe('continue');
      expect(result.confidence).toBe(0);
    });

    it('should evaluate latency difference', async () => {
      await manager.createCanary('eval-test', {
        variant_a: 'a',
        variant_b: 'b',
        trafficPercent: 50,
        duration: 60000,
      });

      // Variant A: average 100ms
      for (let i = 0; i < 5; i++) {
        await manager.recordMetric('eval-test', 'a', 'latency', 100);
      }

      // Variant B: average 130ms (30% slower)
      for (let i = 0; i < 5; i++) {
        await manager.recordMetric('eval-test', 'b', 'latency', 130);
      }

      const result = manager.evaluateCanary('eval-test');
      expect(result.recommendation).toBe('rollback');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should recommend promote on better latency', async () => {
      await manager.createCanary('improve-test', {
        variant_a: 'a',
        variant_b: 'b',
        trafficPercent: 50,
        duration: 60000,
      });

      // Variant A: 100ms
      for (let i = 0; i < 5; i++) {
        await manager.recordMetric('improve-test', 'a', 'latency', 100);
      }

      // Variant B: 80ms (20% faster)
      for (let i = 0; i < 5; i++) {
        await manager.recordMetric('improve-test', 'b', 'latency', 80);
      }

      const result = manager.evaluateCanary('improve-test');
      expect(result.recommendation).toBe('promote');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should return comparison metrics', async () => {
      await manager.createCanary('metrics-test', {
        variant_a: 'a',
        variant_b: 'b',
        trafficPercent: 50,
        duration: 60000,
      });

      await manager.recordMetric('metrics-test', 'a', 'latency', 100);
      await manager.recordMetric('metrics-test', 'b', 'latency', 90);

      const result = manager.evaluateCanary('metrics-test');
      expect(result.summary).toEqual(
        expect.objectContaining({
          variant_a: expect.objectContaining({
            avgLatency: expect.any(Number),
            errorRate: expect.any(Number),
          }),
          variant_b: expect.objectContaining({
            avgLatency: expect.any(Number),
            errorRate: expect.any(Number),
          }),
        })
      );
    });
  });

  describe('promote / rollback', () => {
    beforeEach(async () => {
      await manager.createCanary('deploy-test', {
        variant_a: 'v1',
        variant_b: 'v2',
        trafficPercent: 10,
        duration: 60000,
      });
    });

    it('should promote canary', async () => {
      await manager.promote('deploy-test');
      const canary = manager.getCanary('deploy-test');

      expect(canary!.status).toBe('promoted');
      expect(canary!.endTime).toBeDefined();
    });

    it('should rollback canary', async () => {
      await manager.rollback('deploy-test');
      const canary = manager.getCanary('deploy-test');

      expect(canary!.status).toBe('rolled_back');
      expect(canary!.endTime).toBeDefined();
    });

    it('should set endTime on promote/rollback', async () => {
      const before = Date.now();
      await manager.promote('deploy-test');
      const after = Date.now();

      const canary = manager.getCanary('deploy-test');
      expect(canary!.endTime!).toBeGreaterThanOrEqual(before);
      expect(canary!.endTime!).toBeLessThanOrEqual(after + 10);
    });
  });

  describe('startCanary', () => {
    beforeEach(async () => {
      await manager.createCanary('start-test', {
        variant_a: 'a',
        variant_b: 'b',
        trafficPercent: 50,
        duration: 60000,
      });
    });

    it('should transition to running', async () => {
      await manager.startCanary('start-test');
      const canary = manager.getCanary('start-test');

      expect(canary!.status).toBe('running');
      expect(canary!.startTime).toBeDefined();
    });
  });

  describe('getCanary / getAllCanaries', () => {
    it('should get specific canary', async () => {
      await manager.createCanary('get-test', {
        variant_a: 'a',
        variant_b: 'b',
        trafficPercent: 50,
        duration: 1000,
      });

      const canary = manager.getCanary('get-test');
      expect(canary).toBeDefined();
      expect(canary!.name).toBe('get-test');
    });

    it('should return undefined for non-existent canary', () => {
      expect(manager.getCanary('nonexistent')).toBeUndefined();
    });

    it('should get all canaries', async () => {
      await manager.createCanary('canary-1', {
        variant_a: 'a',
        variant_b: 'b',
        trafficPercent: 50,
        duration: 1000,
      });

      await manager.createCanary('canary-2', {
        variant_a: 'a',
        variant_b: 'b',
        trafficPercent: 50,
        duration: 1000,
      });

      const all = manager.getAllCanaries();
      expect(all).toHaveLength(2);
      expect(all.map(c => c.name).sort()).toEqual(['canary-1', 'canary-2']);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const instance1 = getCanaryManager();
      const instance2 = getCanaryManager();
      expect(instance1).toBe(instance2);
    });

    it('should allow replacing instance', () => {
      const newManager = new CanaryManager();
      setCanaryManager(newManager);

      const instance = getCanaryManager();
      expect(instance).toBe(newManager);
    });
  });

  describe('Complex scenarios', () => {
    it('should handle multiple concurrent canaries', async () => {
      await manager.createCanary('canary-1', {
        variant_a: 'v1',
        variant_b: 'v2',
        trafficPercent: 10,
        duration: 60000,
      });

      await manager.createCanary('canary-2', {
        variant_a: 'v1',
        variant_b: 'v3',
        trafficPercent: 20,
        duration: 60000,
      });

      const route1 = manager.routeTraffic('canary-1', 'request-1');
      const route2 = manager.routeTraffic('canary-2', 'request-1');

      expect(route1).toBeDefined();
      expect(route2).toBeDefined();
    });

    it('should track metrics independently per canary', async () => {
      await manager.createCanary('canary-1', {
        variant_a: 'a',
        variant_b: 'b',
        trafficPercent: 50,
        duration: 1000,
      });

      await manager.createCanary('canary-2', {
        variant_a: 'a',
        variant_b: 'b',
        trafficPercent: 50,
        duration: 1000,
      });

      await manager.recordMetric('canary-1', 'a', 'latency', 100);
      await manager.recordMetric('canary-2', 'a', 'latency', 200);

      const m1 = manager.getMetrics('canary-1');
      const m2 = manager.getMetrics('canary-2');

      expect(m1!.variant_a.latency[0]).toBe(100);
      expect(m2!.variant_a.latency[0]).toBe(200);
    });
  });
});
