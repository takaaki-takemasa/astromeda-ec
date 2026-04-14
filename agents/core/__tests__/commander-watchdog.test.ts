/**
 * Commander Watchdog テスト — ICU生命維持装置の機能検証
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommanderWatchdog, resetWatchdog } from '../commander-watchdog.js';
import type { AgentRegistry } from '../../registry/agent-registry.js';
import type { IAgent, AgentHealth } from '../types.js';

// Mock Agent
function createMockAgent(healthy: boolean): IAgent {
  return {
    id: { id: 'commander', name: 'Commander', level: 'L0', team: 'command', version: '1.0.0' },
    getHealth: () => ({
      agentId: 'commander',
      status: healthy ? 'healthy' : 'error',
      lastHeartbeat: Date.now(),
      uptime: 1000,
      errorCount: healthy ? 0 : 5,
      memoryUsage: 0,
      taskQueue: 0,
    } as AgentHealth),
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    handleEvent: vi.fn(),
    handleCommand: vi.fn(),
  };
}

function createMockRegistry(agent: IAgent | null): AgentRegistry {
  return {
    get: (id: string) => agent ? { id: agent.id, instance: agent, blueprint: {} } : null,
    listAll: () => agent ? [{ id: agent.id, instance: agent }] : [],
    getStats: () => ({ total: 1, active: 1 }),
  } as unknown as AgentRegistry;
}

describe('CommanderWatchdog', () => {
  afterEach(() => {
    resetWatchdog();
    vi.restoreAllMocks();
  });

  it('should start and stop correctly', () => {
    const agent = createMockAgent(true);
    const registry = createMockRegistry(agent);
    const watchdog = new CommanderWatchdog(registry, null, {
      checkIntervalMs: 100,
    });

    watchdog.start();
    expect(watchdog.getStatus().running).toBe(true);

    watchdog.stop();
    expect(watchdog.getStatus().running).toBe(false);
  });

  it('should detect healthy Commander', () => {
    const agent = createMockAgent(true);
    const registry = createMockRegistry(agent);
    const watchdog = new CommanderWatchdog(registry, null, {
      checkIntervalMs: 100000, // 長い間隔（手動チェックのみ）
    });

    watchdog.start();
    const status = watchdog.getStatus();

    expect(status.commanderAlive).toBe(true);
    expect(status.consecutiveFailures).toBe(0);
    watchdog.stop();
  });

  it('should detect unhealthy Commander and increment failures', async () => {
    const agent = createMockAgent(false);
    const registry = createMockRegistry(agent);
    const watchdog = new CommanderWatchdog(registry, null, {
      checkIntervalMs: 50,
      failureThreshold: 3,
      maxRestartAttempts: 0, // 蘇生なし
    });

    watchdog.start();

    // 50ms * 3回 = 少なくとも150ms待つ
    await new Promise(r => setTimeout(r, 200));
    watchdog.stop();

    const status = watchdog.getStatus();
    expect(status.consecutiveFailures).toBeGreaterThanOrEqual(2);
  });

  it('should detect Commander not in registry', () => {
    const registry = createMockRegistry(null);
    const watchdog = new CommanderWatchdog(registry, null, {
      checkIntervalMs: 100000,
      failureThreshold: 1,
    });

    watchdog.start();
    const status = watchdog.getStatus();

    expect(status.consecutiveFailures).toBe(1);
    expect(status.commanderAlive).toBe(false);
    watchdog.stop();
  });

  it('should attempt restart when failure threshold reached', async () => {
    const agent = createMockAgent(false);
    const registry = createMockRegistry(agent);
    const watchdog = new CommanderWatchdog(registry, null, {
      checkIntervalMs: 30,
      failureThreshold: 2,
      maxRestartAttempts: 3,
      restartCooldownMs: 0, // クールダウンなし
    });

    watchdog.start();
    await new Promise(r => setTimeout(r, 200));
    watchdog.stop();

    expect(agent.initialize).toHaveBeenCalled();
    expect(watchdog.getStatus().restartAttempts).toBeGreaterThan(0);
  });

  it('should report correct status', () => {
    const agent = createMockAgent(true);
    const registry = createMockRegistry(agent);
    const watchdog = new CommanderWatchdog(registry);

    const status = watchdog.getStatus();
    expect(status.running).toBe(false);
    expect(status.consecutiveFailures).toBe(0);
    expect(status.restartAttempts).toBe(0);
    expect(status.commanderAlive).toBe(true); // threshold=3, failures=0
  });
});
