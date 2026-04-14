/**
 * ============================================================
 * Mock Agent Context — 脳幹テストヘルパー (0A.04)
 *
 * 全agentテストの共通fixture。
 * AgentBus・AgentRegistry・HealthMonitor・Storage を模倣。
 *
 * 医学メタファー: 人工臓器テストベンチ
 * 心臓(AgentBus)や免疫(SecurityContext)を人工的に供給し、
 * 個別臓器（各Agent）の動作を隔離テストする。
 * ============================================================
 */

import {vi} from 'vitest';

/** AgentBus mock — 心臓の人工模型 */
export function createMockAgentBus() {
  const subscriptions = new Map<string, Set<Function>>();

  return {
    publish: vi.fn((event: {type: string; payload?: unknown}) => {
      const handlers = subscriptions.get(event.type);
      if (handlers) {
        handlers.forEach((h) => h(event));
      }
    }),
    subscribe: vi.fn((type: string, handler: Function) => {
      if (!subscriptions.has(type)) {
        subscriptions.set(type, new Set());
      }
      subscriptions.get(type)!.add(handler);
      return () => subscriptions.get(type)?.delete(handler);
    }),
    request: vi.fn().mockResolvedValue({success: true}),
    getQueueDepth: vi.fn().mockReturnValue(0),
    getDLQEvents: vi.fn().mockReturnValue([]),
    replayDeadLetterQueue: vi.fn().mockResolvedValue(undefined),
    _subscriptions: subscriptions,
  };
}

/** AgentRegistry mock */
export function createMockAgentRegistry() {
  const agents = new Map<string, {
    id: string;
    status: string;
    instance: unknown;
  }>();

  return {
    register: vi.fn((id: string, instance: unknown) => {
      agents.set(id, {id, status: 'healthy', instance});
    }),
    get: vi.fn((id: string) => agents.get(id)),
    getAll: vi.fn(() => Array.from(agents.values())),
    updateStatus: vi.fn((id: string, status: string) => {
      const a = agents.get(id);
      if (a) a.status = status;
    }),
    remove: vi.fn((id: string) => agents.delete(id)),
    _agents: agents,
  };
}

/** Storage mock — 消化器の人工模型 */
export function createMockStorage() {
  const store = new Map<string, Map<string, unknown>>();

  return {
    get: vi.fn(async (table: string, key: string) => {
      return store.get(table)?.get(key) ?? null;
    }),
    set: vi.fn(async (table: string, key: string, value: unknown) => {
      if (!store.has(table)) store.set(table, new Map());
      store.get(table)!.set(key, value);
    }),
    delete: vi.fn(async (table: string, key: string) => {
      store.get(table)?.delete(key);
    }),
    list: vi.fn(async (table: string) => {
      const t = store.get(table);
      return t ? Array.from(t.entries()).map(([k, v]) => ({key: k, value: v})) : [];
    }),
    clear: vi.fn(async (table: string) => {
      store.delete(table);
    }),
    _store: store,
  };
}

/** HealthMonitor mock */
export function createMockHealthMonitor() {
  return {
    reportHealth: vi.fn(),
    getAgentHealth: vi.fn().mockReturnValue('healthy'),
    getSystemHealth: vi.fn().mockReturnValue({
      overall: 'healthy',
      agents: {},
      timestamp: Date.now(),
    }),
    restartAgent: vi.fn().mockResolvedValue(true),
  };
}

/** CascadeEngine mock — 神経系の人工模型 */
export function createMockCascadeEngine() {
  return {
    execute: vi.fn().mockResolvedValue({
      id: 'cascade-001',
      status: 'completed',
      steps: [],
    }),
    getActiveCount: vi.fn().mockReturnValue(0),
    getHistory: vi.fn().mockReturnValue([]),
  };
}

/** SecurityContext mock — 免疫系の人工模型 */
export function createMockSecurityContext() {
  return {
    userId: 'admin-001',
    role: 'admin' as const,
    permissions: ['read', 'write', 'execute', 'admin'],
    rateLimit: {
      remaining: 60,
      resetAt: Date.now() + 60000,
    },
    allowedTargets: ['*'],
  };
}

/** Full agent test context — 全臓器統合テストベンチ */
export function createMockAgentTestContext() {
  return {
    bus: createMockAgentBus(),
    registry: createMockAgentRegistry(),
    storage: createMockStorage(),
    healthMonitor: createMockHealthMonitor(),
    cascade: createMockCascadeEngine(),
    security: createMockSecurityContext(),
  };
}
