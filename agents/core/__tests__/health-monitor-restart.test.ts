/**
 * HealthMonitor Auto-Restart Tests — T069
 *
 * Tests for agent auto-restart functionality.
 * Covers: restartAgent, restart tracking, escalation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthMonitor } from '../health-monitor.js';
import type { IAgent, AgentId, AgentHealth, IAgentBus, AgentEvent } from '../types.js';

function makeAgentId(id: string): AgentId {
  return {
    id,
    name: `agent-${id}`,
    level: 'L1',
    team: 'infrastructure',
    version: '1.0.0',
  };
}

function makeHealth(status: 'healthy' | 'degraded' | 'error' | 'shutdown' = 'healthy'): AgentHealth {
  return {
    agentId: 'test-agent',
    status,
    lastHeartbeat: Date.now(),
    uptime: 10000,
    errorCount: 0,
    memoryUsage: 1024,
    taskQueue: 0,
  };
}

class MockAgent implements IAgent {
  readonly id: AgentId;
  health: AgentHealth;
  shutdownCalled: number = 0;
  initializeCalled: number = 0;
  shouldFailInit: boolean = false;

  constructor(agentId: string) {
    this.id = makeAgentId(agentId);
    this.health = makeHealth();
  }

  getHealth(): AgentHealth {
    return this.health;
  }

  async initialize(): Promise<void> {
    this.initializeCalled++;
    if (this.shouldFailInit) {
      throw new Error('Initialization failed');
    }
  }

  async shutdown(): Promise<void> {
    this.shutdownCalled++;
  }

  async handleEvent(): Promise<void> {}
  async handleCommand(): Promise<unknown> { return null; }
}

class MockBus implements IAgentBus {
  publishedEvents: AgentEvent[] = [];

  async publish(event: AgentEvent): Promise<void> {
    this.publishedEvents.push(event);
  }

  subscribe(): string {
    return `sub_${Math.random()}`;
  }

  unsubscribe(): void {}

  async request(): Promise<AgentEvent> {
    throw new Error('Not implemented');
  }
}

describe('HealthMonitor - T069 Auto-Restart', () => {
  let monitor: HealthMonitor;
  let agent: MockAgent;
  let bus: MockBus;

  beforeEach(() => {
    monitor = new HealthMonitor();
    agent = new MockAgent('test-agent');
    bus = new MockBus();
    monitor.connectBus(bus);
    monitor.register(agent);
  });

  describe('restartAgent', () => {
    it('should call agent.shutdown() and agent.initialize()', async () => {
      const result = await monitor.restartAgent('test-agent');

      expect(result).toBe(true);
      expect(agent.shutdownCalled).toBe(1);
      expect(agent.initializeCalled).toBe(1);
    });

    it('should wait 2 seconds between shutdown and initialize', async () => {
      const start = Date.now();
      await monitor.restartAgent('test-agent');
      const elapsed = Date.now() - start;

      // Should be at least 2 seconds (allowing 100ms variance)
      expect(elapsed).toBeGreaterThanOrEqual(1900);
    });

    it('should reset consecutiveFailures to 0 on success', async () => {
      const health = monitor.getAllHealth();
      const monitored = health['test-agent'];
      const initialFailures = monitored.consecutiveFailures;

      await monitor.restartAgent('test-agent');

      const newHealth = monitor.getAllHealth();
      const newMonitored = newHealth['test-agent'];
      expect(newMonitored.consecutiveFailures).toBe(0);
    });

    it('should emit agent.restarted event on success', async () => {
      await monitor.restartAgent('test-agent');

      const restartedEvents = bus.publishedEvents.filter(e => e.type === 'agent.restarted');
      expect(restartedEvents.length).toBe(1);
      expect(restartedEvents[0].payload).toEqual(
        expect.objectContaining({
          agentId: 'test-agent',
          restartCount: 0,
        })
      );
    });

    it('should return false if agent not found', async () => {
      const result = await monitor.restartAgent('nonexistent');
      expect(result).toBe(false);
    });

    it('should increment restartCount on init failure', async () => {
      agent.shouldFailInit = true;

      const result = await monitor.restartAgent('test-agent');

      expect(result).toBe(false);
      const stats = monitor.getRestartStats();
      expect(stats['test-agent'].restartCount).toBe(1);
    });

    it('should emit agent.escalate.human event after 3 failed restarts', { timeout: 15000 }, async () => {
      agent.shouldFailInit = true;

      await monitor.restartAgent('test-agent');
      monitor._resetRestartCooldown('test-agent');
      await monitor.restartAgent('test-agent');
      monitor._resetRestartCooldown('test-agent');
      await monitor.restartAgent('test-agent');
      monitor._resetRestartCooldown('test-agent');
      // 4th attempt triggers restart_loop_detected guard
      const result = await monitor.restartAgent('test-agent');

      expect(result).toBe(false);

      const escalationEvents = bus.publishedEvents.filter(e => e.type === 'agent.escalate.human');
      expect(escalationEvents.length).toBeGreaterThanOrEqual(1);
      // 3回目のinit失敗時 or 4回目のloop検知でエスカレーション
      const lastEscalation = escalationEvents[escalationEvents.length - 1];
      expect(lastEscalation.payload).toEqual(
        expect.objectContaining({
          agentId: 'test-agent',
        })
      );
      expect(
        (lastEscalation.payload as Record<string, unknown>).reason === 'restart_failed_3_times' ||
        (lastEscalation.payload as Record<string, unknown>).reason === 'restart_loop_detected'
      ).toBe(true);
    });

    it('should track lastRestartTime', async () => {
      const beforeRestart = Date.now();
      await monitor.restartAgent('test-agent');
      const afterRestart = Date.now();

      const stats = monitor.getRestartStats();
      expect(stats['test-agent'].lastRestartTime).toBeDefined();
      expect(stats['test-agent'].lastRestartTime!).toBeGreaterThanOrEqual(beforeRestart);
      expect(stats['test-agent'].lastRestartTime!).toBeLessThanOrEqual(afterRestart + 2100);
    });
  });

  describe('getRestartStats', () => {
    it('should return restart statistics for all agents', async () => {
      await monitor.restartAgent('test-agent');

      const stats = monitor.getRestartStats();
      expect(stats['test-agent']).toBeDefined();
      expect(stats['test-agent'].restartCount).toBe(0); // Success, so count stays 0
      expect(stats['test-agent'].consecutiveFailures).toBe(0);
    });

    it('should track multiple restart attempts', async () => {
      agent.shouldFailInit = true;

      await monitor.restartAgent('test-agent');
      monitor._resetRestartCooldown('test-agent');
      await monitor.restartAgent('test-agent');

      const stats = monitor.getRestartStats();
      expect(stats['test-agent'].restartCount).toBe(2);
    });
  });

  describe('Multiple agents', () => {
    it('should handle restart of multiple agents independently', async () => {
      const agent2 = new MockAgent('agent-2');
      monitor.register(agent2);

      await monitor.restartAgent('test-agent');
      await monitor.restartAgent('agent-2');

      expect(agent.shutdownCalled).toBe(1);
      expect(agent.initializeCalled).toBe(1);
      expect(agent2.shutdownCalled).toBe(1);
      expect(agent2.initializeCalled).toBe(1);
    });

    it('should track failures independently per agent', async () => {
      const agent2 = new MockAgent('agent-2');
      agent2.shouldFailInit = true;
      monitor.register(agent2);

      await monitor.restartAgent('test-agent'); // Success
      await monitor.restartAgent('agent-2'); // Fail

      const stats = monitor.getRestartStats();
      expect(stats['test-agent'].restartCount).toBe(0);
      expect(stats['agent-2'].restartCount).toBe(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle shutdown error gracefully', async () => {
      vi.spyOn(agent, 'shutdown').mockRejectedValueOnce(new Error('Shutdown error'));

      const result = await monitor.restartAgent('test-agent');

      // Should still try to initialize
      expect(agent.initializeCalled).toBe(1);
    });

    it('should reset restartCount after successful restart following failures', async () => {
      agent.shouldFailInit = true;
      await monitor.restartAgent('test-agent');
      expect(monitor.getRestartStats()['test-agent'].restartCount).toBe(1);

      agent.shouldFailInit = false;
      monitor._resetRestartCooldown('test-agent');
      await monitor.restartAgent('test-agent');
      expect(monitor.getRestartStats()['test-agent'].restartCount).toBe(0);
    });

    it('should handle restart during health check', async () => {
      monitor.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await monitor.restartAgent('test-agent');
      expect(result).toBe(true);

      monitor.stop();
    });
  });
});
