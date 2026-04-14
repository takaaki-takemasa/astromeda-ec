/**
 * Cascade Engine Tests — Gate 6 (皮膚)
 *
 * 脊髄反射弓の検証:
 * - 順次カスケード実行
 * - 並列カスケード実行
 * - リトライ（指数バックオフ）
 * - ロールバック
 * - 同時実行上限
 * - 実行履歴管理
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CascadeEngine } from '../cascade-engine';
import { AgentRegistry } from '../../registry/agent-registry';
import type { IAgentBus, AgentEvent, CascadeCommand } from '../types';

/** モックAgentBus */
function createMockBus(options?: {
  requestFn?: (event: AgentEvent, timeout: number) => Promise<AgentEvent>;
  publishFn?: (event: AgentEvent) => Promise<void>;
}): IAgentBus {
  return {
    publish: options?.publishFn ?? vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue('sub-1'),
    unsubscribe: vi.fn(),
    request: options?.requestFn ?? vi.fn().mockResolvedValue({
      id: 'resp-1',
      type: 'cascade.response',
      source: 'target-agent',
      target: 'commander',
      priority: 'normal',
      payload: { success: true },
      timestamp: Date.now(),
    }),
    getStats: vi.fn().mockReturnValue({ published: 0, subscriptions: 0 }),
  };
}

function createCommand(overrides?: Partial<CascadeCommand>): CascadeCommand {
  return {
    from: 'commander',
    to: ['agent-a'],
    action: 'test-action',
    params: { key: 'value' },
    priority: 'normal',
    ...overrides,
  };
}

describe('CascadeEngine (Gate 6 — 皮膚)', () => {
  let engine: CascadeEngine;
  let bus: IAgentBus;
  let registry: AgentRegistry;

  beforeEach(() => {
    bus = createMockBus();
    registry = new AgentRegistry();
    engine = new CascadeEngine(bus, registry);
  });

  // ── 6A: 順次実行 ──

  describe('Sequential Execution (6A)', () => {
    it('should execute a single-target cascade successfully', async () => {
      const result = await engine.execute(createCommand());
      expect(result.status).toBe('completed');
      expect(result.steps.length).toBe(1);
      expect(result.steps[0].status).toBe('completed');
    });

    it('should execute multi-target cascade in sequence', async () => {
      const callOrder: string[] = [];
      const mockBus = createMockBus({
        requestFn: async (event) => {
          callOrder.push(event.target!);
          return {
            id: `resp-${event.target}`,
            type: 'cascade.response',
            source: event.target!,
            target: 'commander',
            priority: 'normal',
            payload: { success: true },
            timestamp: Date.now(),
          };
        },
      });
      engine = new CascadeEngine(mockBus, registry);

      const result = await engine.execute(createCommand({
        to: ['agent-a', 'agent-b', 'agent-c'],
      }));

      expect(result.status).toBe('completed');
      expect(result.steps.length).toBe(3);
      expect(callOrder).toEqual(['agent-a', 'agent-b', 'agent-c']);
    });

    it('should mark execution as failed when a step fails', async () => {
      const mockBus = createMockBus({
        requestFn: async () => { throw new Error('Agent timeout'); },
      });
      engine = new CascadeEngine(mockBus, registry);

      const result = await engine.execute(createCommand());
      expect(result.status).toBe('failed');
      expect(result.steps[0].status).toBe('failed');
      expect(result.steps[0].error).toContain('Agent timeout');
    });

    it('should continue executing remaining targets after one fails', async () => {
      let callCount = 0;
      const mockBus = createMockBus({
        requestFn: async (event) => {
          callCount++;
          if (event.target === 'agent-b') throw new Error('B failed');
          return {
            id: 'r', type: 'cascade.response', source: event.target!,
            target: 'commander', priority: 'normal', payload: {}, timestamp: Date.now(),
          };
        },
      });
      engine = new CascadeEngine(mockBus, registry);

      const result = await engine.execute(createCommand({
        to: ['agent-a', 'agent-b', 'agent-c'],
      }));

      expect(result.status).toBe('failed'); // at least one failed
      expect(callCount).toBe(3); // all three were attempted
      expect(result.steps[0].status).toBe('completed');
      expect(result.steps[1].status).toBe('failed');
      expect(result.steps[2].status).toBe('completed');
    });
  });

  // ── 6B: 並列実行 ──

  describe('Parallel Execution (6B)', () => {
    it('should execute all targets in parallel', async () => {
      const startTimes: number[] = [];
      const mockBus = createMockBus({
        requestFn: async () => {
          startTimes.push(Date.now());
          await new Promise(r => setTimeout(r, 10));
          return {
            id: 'r', type: 'cascade.response', source: 'a',
            target: 'commander', priority: 'normal', payload: {}, timestamp: Date.now(),
          };
        },
      });
      engine = new CascadeEngine(mockBus, registry);

      const result = await engine.executeParallel(createCommand({
        to: ['agent-a', 'agent-b', 'agent-c'],
      }));

      expect(result.status).toBe('completed');
      expect(result.steps.length).toBe(3);
      // All start times should be very close (parallel)
      const spread = Math.max(...startTimes) - Math.min(...startTimes);
      expect(spread).toBeLessThan(50); // within 50ms
    });

    it('should handle mixed success/failure in parallel', async () => {
      const mockBus = createMockBus({
        requestFn: async (event) => {
          if (event.target === 'agent-b') throw new Error('B failed');
          return {
            id: 'r', type: 'cascade.response', source: event.target!,
            target: 'commander', priority: 'normal', payload: {}, timestamp: Date.now(),
          };
        },
      });
      engine = new CascadeEngine(mockBus, registry, { maxRetries: 0 });

      const result = await engine.executeParallel(createCommand({
        to: ['agent-a', 'agent-b'],
      }));

      expect(result.status).toBe('failed');
      const completedSteps = result.steps.filter(s => s.status === 'completed');
      const failedSteps = result.steps.filter(s => s.status === 'failed');
      expect(completedSteps.length).toBe(1);
      expect(failedSteps.length).toBe(1);
    });
  });

  // ── 6C: 同時実行上限 ──

  describe('Concurrency Limit (6C)', () => {
    it('should throw when cascade limit is reached', async () => {
      // Fill up with hanging executions
      const neverResolve = createMockBus({
        requestFn: () => new Promise(() => {}), // never resolves
      });
      engine = new CascadeEngine(neverResolve, registry);

      // Start 10 cascades (the limit)
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < 10; i++) {
        promises.push(engine.execute(createCommand({ to: [`agent-${i}`] })));
      }

      // 11th should throw
      await expect(engine.execute(createCommand())).rejects.toThrow('Cascade limit reached');
    });
  });

  // ── 6D: ロールバック ──

  describe('Rollback (6D)', () => {
    it('should rollback completed steps when a step fails and rollbackAction is set', async () => {
      let callCount = 0;
      const allEvents: AgentEvent[] = [];
      const mockBus = createMockBus({
        requestFn: async (event) => {
          allEvents.push(event);
          callCount++;
          if (callCount === 2) throw new Error('Step 2 failed');
          // 3rd call is rollback request — should succeed
          return {
            id: 'r', type: 'cascade.response', source: event.target!,
            target: 'commander', priority: 'normal', payload: {}, timestamp: Date.now(),
          };
        },
        publishFn: async (event) => { allEvents.push(event); },
      });
      engine = new CascadeEngine(mockBus, registry);

      const result = await engine.execute(createCommand({
        to: ['agent-a', 'agent-b'],
        rollbackAction: 'undo-test-action',
      }));

      expect(result.status).toBe('failed');
      // agent-a completed, agent-b failed → rollback of agent-a via request
      const rollbackEvents = allEvents.filter(e => e.type === 'cascade.rollback');
      expect(rollbackEvents.length).toBe(1);
      expect(rollbackEvents[0].target).toBe('agent-a');
    });
  });

  // ── 6E: 診断API ──

  describe('Diagnostics (6E)', () => {
    it('should track execution by ID', async () => {
      const result = await engine.execute(createCommand());
      const retrieved = engine.getExecution(result.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.status).toBe('completed');
    });

    it('should return active executions', async () => {
      const neverResolve = createMockBus({
        requestFn: () => new Promise(() => {}),
      });
      engine = new CascadeEngine(neverResolve, registry);

      engine.execute(createCommand({ to: ['a'] })); // fire and forget
      // Give it a tick to enter execution
      await new Promise(r => setTimeout(r, 5));

      const active = engine.getActiveExecutions();
      expect(active.length).toBe(1);
      expect(active[0].status).toBe('running');
    });

    it('should return accurate stats', async () => {
      await engine.execute(createCommand());

      const failBus = createMockBus({
        requestFn: async () => { throw new Error('fail'); },
      });
      const failEngine = new CascadeEngine(failBus, registry);
      await failEngine.execute(createCommand());

      const stats = engine.getStats();
      expect(stats.completed).toBe(1);
      expect(stats.total).toBeGreaterThanOrEqual(1);
    });
  });
});
