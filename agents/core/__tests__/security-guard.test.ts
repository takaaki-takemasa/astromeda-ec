/**
 * SecurityGuard Test Suite
 *
 * Tests the immune system for rate limiting, authentication, and anomaly detection.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecurityGuard, type SecurityGuardConfig } from '../security-guard.js';
import type { AgentEvent, SecurityContext } from '../types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeEvent(overrides: Partial<AgentEvent> = {}): any {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type: 'test.event',
    source: 'test-source',
    priority: 'normal' as const,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('SecurityGuard', () => {
  let guard: SecurityGuard;

  beforeEach(() => {
    guard = new SecurityGuard();
  });

  describe('constructor', () => {
    it('should create a new SecurityGuard instance', () => {
      expect(guard).toBeDefined();
      expect(guard).toBeInstanceOf(SecurityGuard);
    });

    it('should accept custom configuration', () => {
      const config: SecurityGuardConfig = {
        anomalyBlockThreshold: 10,
        blockBaseDurationMs: 120000,
      };

      const customGuard = new SecurityGuard(config);
      expect(customGuard).toBeInstanceOf(SecurityGuard);
    });

    it('should use default config when not provided', () => {
      const config = guard.getConfig();
      expect(config.anomalyBlockThreshold).toBe(5);
      expect(config.blockBaseDurationMs).toBe(60000);
    });
  });

  describe('validate', () => {
    it('should accept valid event', () => {
      const event = makeEvent();
      const result = guard.validate(event);
      expect(result).toBe(true);
    });

    it('should reject event with missing id', () => {
      const event = makeEvent();
      delete event.id;
      const result = guard.validate(event);
      expect(result).toBe(false);
    });

    it('should reject event with missing type', () => {
      const event = makeEvent();
      delete event.type;
      const result = guard.validate(event);
      expect(result).toBe(false);
    });

    it('should reject event with missing source', () => {
      const event = makeEvent();
      delete event.source;
      const result = guard.validate(event);
      expect(result).toBe(false);
    });

    it('should reject event with invalid priority', () => {
      const event = makeEvent({ priority: 'invalid' as any });
      const result = guard.validate(event);
      expect(result).toBe(false);
    });

    it('should reject event with future timestamp (TTL check)', () => {
      const event = makeEvent({
        timestamp: Date.now() + 120000, // 2 minutes in future
        ttl: 60000,
      });
      const result = guard.validate(event);
      expect(result).toBe(false);
    });

    it('should reject event with invalid type format', () => {
      const event = makeEvent({ type: 'INVALID_TYPE' });
      const result = guard.validate(event);
      expect(result).toBe(false);
    });

    it('should accept valid event types with namespace.action format', () => {
      const event = makeEvent({ type: 'namespace.action' });
      const result = guard.validate(event);
      expect(result).toBe(true);
    });

    it('should accept wildcard event type', () => {
      const event = makeEvent({ type: '*' });
      const result = guard.validate(event);
      expect(result).toBe(true);
    });
  });

  describe('rate limiting', () => {
    it('should allow requests within rate limit', () => {
      const config: SecurityGuardConfig = {
        defaultRateLimit: { maxRequests: 5, windowMs: 1000 },
      };
      const limitedGuard = new SecurityGuard(config);

      for (let i = 0; i < 5; i++) {
        const event = makeEvent({ source: 'agent-1' });
        const result = limitedGuard.validate(event);
        expect(result).toBe(true);
      }
    });

    it('should reject requests exceeding rate limit', () => {
      const config: SecurityGuardConfig = {
        defaultRateLimit: { maxRequests: 3, windowMs: 10000 },
      };
      const limitedGuard = new SecurityGuard(config);

      for (let i = 0; i < 3; i++) {
        limitedGuard.validate(makeEvent({ source: 'agent-1' }));
      }

      const rejected = limitedGuard.validate(makeEvent({ source: 'agent-1' }));
      expect(rejected).toBe(false);
    });

    it('should reset rate limit after window expires', async () => {
      const config: SecurityGuardConfig = {
        defaultRateLimit: { maxRequests: 1, windowMs: 100 },
      };
      const limitedGuard = new SecurityGuard(config);

      limitedGuard.validate(makeEvent({ source: 'agent-1' }));

      const rejected = limitedGuard.validate(makeEvent({ source: 'agent-1' }));
      expect(rejected).toBe(false);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      const allowed = limitedGuard.validate(makeEvent({ source: 'agent-1' }));
      expect(allowed).toBe(true);
    });

    it('should track rate limit per source', () => {
      const config: SecurityGuardConfig = {
        defaultRateLimit: { maxRequests: 2, windowMs: 10000 },
      };
      const limitedGuard = new SecurityGuard(config);

      limitedGuard.validate(makeEvent({ source: 'agent-1' }));
      limitedGuard.validate(makeEvent({ source: 'agent-1' }));

      const agent1Rejected = limitedGuard.validate(makeEvent({ source: 'agent-1' }));
      expect(agent1Rejected).toBe(false);

      const agent2Allowed = limitedGuard.validate(makeEvent({ source: 'agent-2' }));
      expect(agent2Allowed).toBe(true);
    });
  });

  describe('anomaly detection', () => {
    it('should detect oversized payload', () => {
      const largePayload = 'x'.repeat(2_000_000); // 2MB
      const event = makeEvent({
        payload: { data: largePayload },
      });
      const result = guard.validate(event);
      expect(result).toBe(false);
    });

    it('should track anomalies', () => {
      const event = makeEvent({ type: 'invalid' as any });
      guard.validate(event);

      const log = guard.getAnomalyLog();
      expect(log.length).toBeGreaterThan(0);
    });

    it('should auto-block source after anomaly threshold', async () => {
      const config: SecurityGuardConfig = {
        anomalyBlockThreshold: 2,
        anomalyWindowMs: 10000,
      };
      const customGuard = new SecurityGuard(config);

      // First anomaly (invalid structure - missing id)
      const badEvent1 = makeEvent();
      delete badEvent1.id;
      customGuard.validate(badEvent1);

      // Wait >100ms to avoid dedup filter
      await new Promise(resolve => setTimeout(resolve, 120));

      // Second anomaly (invalid structure - missing type)
      const badEvent2 = makeEvent();
      delete badEvent2.type;
      customGuard.validate(badEvent2);

      // Check if source is blocked after reaching threshold
      const status = customGuard.getBlockStatus('test-source');
      expect(status.blocked).toBe(true);
    });

    it('should auto-unblock source after block duration expires', async () => {
      const config: SecurityGuardConfig = {
        anomalyBlockThreshold: 1,
        anomalyWindowMs: 10000,
        blockBaseDurationMs: 100,
      };
      const customGuard = new SecurityGuard(config);

      // Trigger anomaly
      const badEvent = makeEvent();
      delete badEvent.id;
      customGuard.validate(badEvent);

      // Check blocked
      let status = customGuard.getBlockStatus('test-source');
      expect(status.blocked).toBe(true);

      // Wait for block to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Check unblocked
      status = customGuard.getBlockStatus('test-source');
      expect(status.blocked).toBe(false);
    });

    it('should track block count and can be manually unblocked', () => {
      const config: SecurityGuardConfig = {
        anomalyBlockThreshold: 1,
        anomalyWindowMs: 10000,
        blockBaseDurationMs: 5000,
      };
      const customGuard = new SecurityGuard(config);

      // Trigger anomaly → auto-block
      const badEvent = makeEvent({ source: 'attacker' });
      delete badEvent.id;
      customGuard.validate(badEvent);

      let blockStatus = customGuard.getBlockStatus('attacker');
      expect(blockStatus.blocked).toBe(true);
      expect(blockStatus.blockCount).toBe(1);

      // Manual unblock should work
      customGuard.unblockSource('attacker');
      blockStatus = customGuard.getBlockStatus('attacker');
      expect(blockStatus.blocked).toBe(false);
    });
  });

  describe('agent context management', () => {
    it('should register agent security context', () => {
      const context: SecurityContext = {
        agentId: 'agent-1',
        permissions: ['read', 'write'],
        rateLimit: { maxRequests: 100, windowMs: 1000 },
        allowedTargets: ['agent-2', 'agent-3'],
      };

      expect(() => guard.registerAgent(context)).not.toThrow();
    });

    it('should validate target communication permission', () => {
      const context: SecurityContext = {
        agentId: 'agent-1',
        permissions: ['read'],
        rateLimit: { maxRequests: 100, windowMs: 1000 },
        allowedTargets: ['agent-2'],
      };

      guard.registerAgent(context);

      // Allowed target
      const allowedEvent = makeEvent({
        source: 'agent-1',
        target: 'agent-2',
      });
      expect(guard.validate(allowedEvent)).toBe(true);

      // Forbidden target
      const forbiddenEvent = makeEvent({
        source: 'agent-1',
        target: 'agent-3',
      });
      expect(guard.validate(forbiddenEvent)).toBe(false);
    });
  });

  describe('security check hook', () => {
    it('should create check function', () => {
      const check = guard.createCheck();
      expect(typeof check).toBe('function');
    });

    it('should check function return boolean', () => {
      const check = guard.createCheck();
      const event = makeEvent();
      const result = check(event);
      expect(typeof result).toBe('boolean');
    });

    it('should reject invalid events through check', () => {
      const check = guard.createCheck();
      const event = makeEvent();
      delete event.id;

      const result = check(event);
      expect(result).toBe(false);
    });
  });

  describe('diagnostics', () => {
    it('should get block status', () => {
      const status = guard.getBlockStatus('test-source');

      expect(status).toBeDefined();
      expect(typeof status.blocked).toBe('boolean');
    });

    it('should get anomaly log', () => {
      const log = guard.getAnomalyLog();

      expect(Array.isArray(log)).toBe(true);
    });

    it('should respect anomaly log limit', () => {
      const event = makeEvent();
      delete event.id;

      for (let i = 0; i < 150; i++) {
        guard.validate(event);
      }

      const log = guard.getAnomalyLog(50);
      expect(log.length).toBeLessThanOrEqual(50);
    });

    it('should get security statistics', () => {
      const stats = guard.getStats();

      expect(stats).toBeDefined();
      expect(typeof stats.registeredAgents).toBe('number');
      expect(Array.isArray(stats.blockedSources)).toBe(true);
      expect(typeof stats.anomalyCount).toBe('number');
      expect(typeof stats.recentAnomalies).toBe('number');
    });

    it('should get configuration', () => {
      const config = guard.getConfig();

      expect(config).toBeDefined();
      expect(typeof config.anomalyBlockThreshold).toBe('number');
      expect(typeof config.blockBaseDurationMs).toBe('number');
      expect(typeof config.blockMaxDurationMs).toBe('number');
      expect(config.defaultRateLimit).toBeDefined();
    });
  });

  describe('manual unblock', () => {
    it('should unblock source manually', async () => {
      const config: SecurityGuardConfig = {
        anomalyBlockThreshold: 1,
        anomalyWindowMs: 10000,
        blockBaseDurationMs: 60000, // 1 minute
      };
      const customGuard = new SecurityGuard(config);

      // Trigger anomaly to block
      const badEvent = makeEvent({ source: 'test-source' });
      delete badEvent.id;
      customGuard.validate(badEvent);

      let status = customGuard.getBlockStatus('test-source');
      expect(status.blocked).toBe(true);

      // Manually unblock
      customGuard.unblockSource('test-source');

      status = customGuard.getBlockStatus('test-source');
      expect(status.blocked).toBe(false);
    });
  });
});
