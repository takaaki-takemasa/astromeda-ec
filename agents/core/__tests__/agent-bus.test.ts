/**
 * Agent Bus Test Suite
 *
 * Tests the pub/sub messaging system for agent communication.
 * Vitest format with comprehensive coverage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentBus, getAgentBus } from '../agent-bus.js';
import type { AgentEvent } from '../types.js';

function makeEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type: 'test.event',
    source: 'test-source',
    priority: 'normal',
    payload: {},
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('AgentBus', () => {
  let bus: AgentBus;

  beforeEach(() => {
    bus = new AgentBus();
  });

  describe('constructor', () => {
    it('should create a new AgentBus instance', () => {
      expect(bus).toBeDefined();
      expect(bus).toBeInstanceOf(AgentBus);
    });

    it('should initialize with empty subscriptions', () => {
      const stats = bus.getStats();
      expect(stats.totalSubscriptions).toBe(0);
      expect(stats.eventTypes).toBe(0);
    });

    it('should initialize with empty dead letter queue', () => {
      const deadLetters = bus.getDeadLetters();
      expect(Array.isArray(deadLetters)).toBe(true);
      expect(deadLetters.length).toBe(0);
    });
  });

  describe('subscribe', () => {
    it('should register a subscription and return subscription ID', () => {
      const handler = vi.fn();
      const subId = bus.subscribe('test.event', handler);

      expect(typeof subId).toBe('string');
      expect(subId).toMatch(/^sub_/);
    });

    it('should increment subscription counter', () => {
      const handler = vi.fn();
      const subId1 = bus.subscribe('test.event1', handler);
      const subId2 = bus.subscribe('test.event2', handler);

      expect(subId1).not.toBe(subId2);
      expect(bus.getStats().totalSubscriptions).toBe(2);
    });

    it('should support multiple subscribers for same event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.subscribe('test.event', handler1);
      bus.subscribe('test.event', handler2);

      const stats = bus.getStats();
      expect(stats.totalSubscriptions).toBe(2);
      expect(stats.eventTypes).toBe(1);
    });

    it('should support subscription with filter function', () => {
      const handler = vi.fn();
      const filter = (event: AgentEvent) => event.priority === 'high';

      const subId = bus.subscribe('test.event', handler, filter);
      expect(typeof subId).toBe('string');
    });

    it('should support subscription options (agentId, priority)', () => {
      const handler = vi.fn();

      const subId = bus.subscribe('test.event', handler, undefined, {
        agentId: 'test-agent',
        priority: 'critical',
      });

      expect(typeof subId).toBe('string');
    });
  });

  describe('unsubscribe', () => {
    it('should remove a subscription', () => {
      const handler = vi.fn();
      const subId = bus.subscribe('test.event', handler);

      expect(bus.getStats().totalSubscriptions).toBe(1);

      bus.unsubscribe(subId);
      expect(bus.getStats().totalSubscriptions).toBe(0);
    });

    it('should only remove the specified subscription', () => {
      const handler = vi.fn();
      const subId1 = bus.subscribe('test.event', handler);
      const subId2 = bus.subscribe('test.event', handler);

      bus.unsubscribe(subId1);

      expect(bus.getStats().totalSubscriptions).toBe(1);
    });

    it('should handle unsubscribing non-existent subscription gracefully', () => {
      expect(() => bus.unsubscribe('non_existent')).not.toThrow();
    });
  });

  describe('publish', () => {
    it('should publish an event to subscribers', async () => {
      const handler = vi.fn();
      bus.subscribe('test.event', handler);

      const event = makeEvent();
      await bus.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should publish to multiple subscribers', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      bus.subscribe('test.event', handler1);
      bus.subscribe('test.event', handler2);

      const event = makeEvent();
      await bus.publish(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
    });

    it('should add event to event log', async () => {
      const handler = vi.fn();
      bus.subscribe('test.event', handler);

      const event = makeEvent();
      await bus.publish(event);

      const eventLog = bus.getEventLog();
      expect(eventLog.length).toBeGreaterThan(0);
      expect(eventLog[eventLog.length - 1].id).toBe(event.id);
    });

    it('should add undelivered events to dead letter queue', async () => {
      const event = makeEvent({ type: 'unsubscribed.event' });
      await bus.publish(event);

      const deadLetters = bus.getDeadLetters();
      expect(deadLetters.length).toBeGreaterThan(0);
    });

    it('should respect filter function', async () => {
      const handler = vi.fn();
      const filter = (event: AgentEvent) => event.priority === 'high';

      bus.subscribe('test.event', handler, filter);

      const normalEvent = makeEvent({ priority: 'normal' });
      const highEvent = makeEvent({ priority: 'high' });

      await bus.publish(normalEvent);
      expect(handler).not.toHaveBeenCalled();

      await bus.publish(highEvent);
      expect(handler).toHaveBeenCalledWith(highEvent);
    });

    it('should respect priority order (critical > high > normal > low)', async () => {
      const deliveryOrder: string[] = [];

      bus.subscribe('test.event', async () => { deliveryOrder.push('low'); }, undefined, { priority: 'low' });
      bus.subscribe('test.event', async () => { deliveryOrder.push('normal'); }, undefined, { priority: 'normal' });
      bus.subscribe('test.event', async () => { deliveryOrder.push('critical'); }, undefined, { priority: 'critical' });
      bus.subscribe('test.event', async () => { deliveryOrder.push('high'); }, undefined, { priority: 'high' });

      await bus.publish(makeEvent());

      expect(deliveryOrder).toEqual(['critical', 'high', 'normal', 'low']);
    });
  });

  describe('event targeting', () => {
    it('should deliver to target agent only (no broadcast)', async () => {
      const received: string[] = [];

      bus.subscribe('command.execute', async () => { received.push('agent-a'); }, undefined, { agentId: 'agent-a' });
      bus.subscribe('command.execute', async () => { received.push('agent-b'); }, undefined, { agentId: 'agent-b' });
      bus.subscribe('command.execute', async () => { received.push('agent-c'); }, undefined, { agentId: 'agent-c' });

      await bus.publish(makeEvent({ type: 'command.execute', target: 'agent-b' }));

      expect(received).toEqual(['agent-b']);
    });

    it('should broadcast when no target is specified', async () => {
      const received: string[] = [];

      bus.subscribe('system.alert', async () => { received.push('a'); }, undefined, { agentId: 'agent-a' });
      bus.subscribe('system.alert', async () => { received.push('b'); }, undefined, { agentId: 'agent-b' });

      await bus.publish(makeEvent({ type: 'system.alert' }));

      expect(received.length).toBe(2);
      expect(received).toContain('a');
      expect(received).toContain('b');
    });

    it('should allow global monitor (*) to receive targeted events', async () => {
      const received: string[] = [];

      bus.subscribe('command.execute', async () => { received.push('target'); }, undefined, { agentId: 'agent-a' });
      bus.subscribe('*', async () => { received.push('monitor'); }, undefined, { agentId: 'monitor' });

      await bus.publish(makeEvent({ type: 'command.execute', target: 'agent-a' }));

      expect(received).toContain('target');
      expect(received).toContain('monitor');
    });
  });

  describe('wildcards', () => {
    it('should support wildcard subscriptions with .*', async () => {
      const handler = vi.fn();
      bus.subscribe('content.*', handler);

      const event = makeEvent({ type: 'content.generated' });
      await bus.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should support global wildcard subscription (*)', async () => {
      const handler = vi.fn();
      bus.subscribe('*', handler);

      const event = makeEvent({ type: 'any.type' });
      await bus.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
    });
  });

  describe('diagnostics', () => {
    it('should return event log with limit', async () => {
      const handler = vi.fn();
      bus.subscribe('test.event', handler);

      for (let i = 0; i < 5; i++) {
        await bus.publish(makeEvent());
      }

      const log = bus.getEventLog(2);
      expect(log.length).toBeLessThanOrEqual(2);
    });

    it('should return dead letters with limit', async () => {
      for (let i = 0; i < 5; i++) {
        await bus.publish(makeEvent({ type: `unsubscribed.${i}` }));
      }

      const deadLetters = bus.getDeadLetters({ limit: 2 });
      expect(deadLetters.length).toBeLessThanOrEqual(2);
    });

    it('should provide subscription map', () => {
      bus.subscribe('test.event1', vi.fn());
      bus.subscribe('test.event2', vi.fn());
      bus.subscribe('test.event2', vi.fn());

      const map = bus.getSubscriptionMap();
      expect(map['test.event1']).toBe(1);
      expect(map['test.event2']).toBe(2);
    });

    it('should track statistics', async () => {
      const handler = vi.fn();
      bus.subscribe('test.event', handler);

      await bus.publish(makeEvent());

      const stats = bus.getStats();
      expect(stats.totalSubscriptions).toBe(1);
      expect(stats.eventTypes).toBe(1);
      expect(stats.eventLogSize).toBeGreaterThan(0);
    });
  });

  describe('singleton', () => {
    it('should return same instance from getAgentBus', () => {
      const bus1 = getAgentBus();
      const bus2 = getAgentBus();

      expect(bus1).toBe(bus2);
    });
  });

  describe('security hooks', () => {
    it('should support attaching security check', () => {
      const securityCheck = vi.fn(() => true);
      expect(() => bus.attachSecurityCheck(securityCheck)).not.toThrow();
    });

    it('should support attaching feedback hook', () => {
      const feedbackHook = vi.fn();
      expect(() => bus.attachFeedbackHook(feedbackHook)).not.toThrow();
    });
  });

  // ============================================================
  // Heart 1A.04: DLQリプレイ + バックプレッシャー + TTL テスト
  // ============================================================

  describe('getDeadLetters (enhanced)', () => {
    it('should filter by type prefix', async () => {
      await bus.publish(makeEvent({ type: 'order.created' }));
      await bus.publish(makeEvent({ type: 'order.failed' }));
      await bus.publish(makeEvent({ type: 'inventory.low' }));

      const orderDL = bus.getDeadLetters({ type: 'order' });
      expect(orderDL.length).toBe(2);
      expect(orderDL.every(e => e.type.startsWith('order'))).toBe(true);
    });

    it('should filter by since timestamp', async () => {
      const old = Date.now() - 120_000;
      const recent = Date.now();

      await bus.publish(makeEvent({ type: 'a.old', timestamp: old }));
      await bus.publish(makeEvent({ type: 'b.recent', timestamp: recent }));

      const filtered = bus.getDeadLetters({ since: Date.now() - 60_000 });
      expect(filtered.every(e => (e.timestamp ?? 0) >= Date.now() - 60_000)).toBe(true);
    });

    it('should filter by until timestamp', async () => {
      const old = Date.now() - 120_000;
      const recent = Date.now();

      await bus.publish(makeEvent({ type: 'a.old', timestamp: old }));
      await bus.publish(makeEvent({ type: 'b.recent', timestamp: recent }));

      const filtered = bus.getDeadLetters({ until: Date.now() - 60_000 });
      expect(filtered.every(e => (e.timestamp ?? 0) <= Date.now() - 60_000)).toBe(true);
    });

    it('should return empty array when no dead letters exist', () => {
      const dl = bus.getDeadLetters();
      expect(dl).toEqual([]);
    });
  });

  describe('replayDeadLetters', () => {
    it('should replay dead letters and move them out of DLQ on success', async () => {
      // Publish events with no subscribers → they go to DLQ
      await bus.publish(makeEvent({ type: 'replay.test1' }));
      await bus.publish(makeEvent({ type: 'replay.test2' }));
      expect(bus.getDeadLetters().length).toBeGreaterThanOrEqual(2);

      // Now subscribe a handler so replayed events will be delivered
      const handler = vi.fn();
      bus.subscribe('replay.test1', handler);

      const result = await bus.replayDeadLetters({ type: 'replay.test1' });
      expect(result.replayed).toBe(1);
      expect(result.failed).toBe(0);
      // Handler should have been called with the replayed event
      expect(handler).toHaveBeenCalled();
    });

    it('should respect maxReplay limit', async () => {
      for (let i = 0; i < 10; i++) {
        await bus.publish(makeEvent({ type: 'batch.event' }));
      }

      const handler = vi.fn();
      bus.subscribe('batch.event', handler);

      const result = await bus.replayDeadLetters({ type: 'batch', maxReplay: 3 });
      expect(result.replayed).toBe(3);
    });

    it('should mark replayed events with metadata', async () => {
      await bus.publish(makeEvent({ type: 'meta.test' }));

      const captured: AgentEvent[] = [];
      bus.subscribe('meta.test', (e) => captured.push(e));

      await bus.replayDeadLetters({ type: 'meta.test' });
      expect(captured.length).toBe(1);
      expect((captured[0].metadata as Record<string, unknown>)?.replayed).toBe(true);
    });

    it('should return {0,0} when no matching dead letters', async () => {
      const result = await bus.replayDeadLetters({ type: 'nonexistent' });
      expect(result).toEqual({ replayed: 0, failed: 0 });
    });

    it('should filter by since timestamp', async () => {
      const oldTime = Date.now() - 120_000;
      await bus.publish(makeEvent({ type: 'time.test', timestamp: oldTime }));
      await bus.publish(makeEvent({ type: 'time.test', timestamp: Date.now() }));

      const handler = vi.fn();
      bus.subscribe('time.test', handler);

      const result = await bus.replayDeadLetters({ type: 'time.test', since: Date.now() - 60_000 });
      // Should only replay the recent one
      expect(result.replayed).toBe(1);
    });
  });

  describe('getQueueDepth', () => {
    it('should return normal pressure with empty DLQ', () => {
      const depth = bus.getQueueDepth();
      expect(depth.pressure).toBe('normal');
      expect(depth.deadLetterSize).toBe(0);
      expect(depth.eventLogSize).toBe(0);
      expect(depth.pendingRequests).toBe(0);
    });

    it('should report elevated pressure above 400 dead letters', async () => {
      for (let i = 0; i < 401; i++) {
        await bus.publish(makeEvent({ type: `flood.${i}` }));
      }
      const depth = bus.getQueueDepth();
      expect(depth.pressure).toBe('elevated');
      expect(depth.deadLetterSize).toBeGreaterThan(400);
    });

    it('should report critical pressure above 800 dead letters', async () => {
      for (let i = 0; i < 801; i++) {
        await bus.publish(makeEvent({ type: `flood.${i}` }));
      }
      const depth = bus.getQueueDepth();
      expect(depth.pressure).toBe('critical');
      expect(depth.deadLetterSize).toBeGreaterThan(800);
    });

    it('should track event log size', async () => {
      const handler = vi.fn();
      bus.subscribe('tracked.event', handler);
      await bus.publish(makeEvent({ type: 'tracked.event' }));

      const depth = bus.getQueueDepth();
      expect(depth.eventLogSize).toBeGreaterThan(0);
    });
  });

  describe('purgeStaleEvents', () => {
    it('should remove events older than maxAgeMinutes', async () => {
      const handler = vi.fn();
      bus.subscribe('stale.test', handler);

      // Publish an event that will be in event log
      await bus.publish(makeEvent({ type: 'stale.test', timestamp: Date.now() - 120 * 60 * 1000 }));
      await bus.publish(makeEvent({ type: 'stale.test', timestamp: Date.now() }));

      const purged = bus.purgeStaleEvents(60);
      // At least the old event should be purged
      expect(purged).toBeGreaterThanOrEqual(1);
    });

    it('should return 0 when no stale events exist', async () => {
      const handler = vi.fn();
      bus.subscribe('fresh.test', handler);
      await bus.publish(makeEvent({ type: 'fresh.test' }));

      const purged = bus.purgeStaleEvents(60);
      expect(purged).toBe(0);
    });

    it('should use default 60 minutes when no argument', async () => {
      const handler = vi.fn();
      bus.subscribe('default.test', handler);
      await bus.publish(makeEvent({ type: 'default.test', timestamp: Date.now() - 120 * 60 * 1000 }));

      const purged = bus.purgeStaleEvents();
      expect(purged).toBeGreaterThanOrEqual(1);
    });

    it('should preserve recent events', async () => {
      const handler = vi.fn();
      bus.subscribe('keep.test', handler);
      await bus.publish(makeEvent({ type: 'keep.test' }));

      const logBefore = bus.getEventLog(100).length;
      bus.purgeStaleEvents(60);
      const logAfter = bus.getEventLog(100).length;
      expect(logAfter).toBe(logBefore);
    });
  });
});
