/**
 * Phase 2A 新規L2エージェント テスト（7体）
 *
 * #25 InventoryMonitor, #26 BusinessAnalyst, #27 AuthManager,
 * #28 InfraManager, #29 DeployManager, #31 ErrorMonitor, #32 AnalyticsAgent
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import type {IAgentBus, AgentEvent} from '../../core/types';
import {InventoryMonitor} from '../inventory-monitor';
import {BusinessAnalyst} from '../business-analyst';
import {AuthManager} from '../auth-manager';
import {InfraManager} from '../infra-manager';
import {DeployManager} from '../deploy-manager';
import {ErrorMonitor} from '../error-monitor';
import {AnalyticsAgent} from '../analytics-agent';

// Mock Bus
function createMockBus(): IAgentBus {
  const handlers = new Map<string, Array<(event: AgentEvent) => void>>();
  let subCounter = 0;
  return {
    publish: vi.fn(async (event: AgentEvent) => {
      for (const [pattern, fns] of handlers.entries()) {
        if (event.type === pattern || pattern.endsWith('*') && event.type.startsWith(pattern.slice(0, -1))) {
          for (const fn of fns) fn(event);
        }
      }
    }),
    subscribe: vi.fn((pattern: string, handler: (event: AgentEvent) => void) => {
      const existing = handlers.get(pattern) || [];
      existing.push(handler);
      handlers.set(pattern, existing);
      return `sub_${subCounter++}`;
    }),
    unsubscribe: vi.fn(),
    getStats: vi.fn(() => ({totalPublished: 0, totalSubscribers: 0, deadLetterCount: 0})),
    attachSecurityCheck: vi.fn(),
    attachFeedbackHook: vi.fn(),
  } as unknown as IAgentBus;
}

describe('Phase 2A New L2 Agents', () => {
  let bus: IAgentBus;

  beforeEach(() => {
    bus = createMockBus();
  });

  // ── #25 InventoryMonitor ──
  describe('InventoryMonitor', () => {
    it('should initialize with correct ID and team', async () => {
      const agent = new InventoryMonitor(bus);
      expect(agent.id.id).toBe('inventory-monitor');
      expect(agent.id.team).toBe('product');
      expect(agent.id.level).toBe('L2');
    });

    it('should initialize and become healthy', async () => {
      const agent = new InventoryMonitor(bus);
      await agent.initialize();
      expect(agent.getHealth().status).toBe('healthy');
    });

    it('should handle check_stock command', async () => {
      const agent = new InventoryMonitor(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd1', from: 'product-lead', to: ['inventory-monitor'],
        action: 'check_stock', params: {}, priority: 'normal',
      });
      expect(result).toHaveProperty('checked');
      expect(result).toHaveProperty('alerts');
    });

    it('should handle inventory_report command', async () => {
      const agent = new InventoryMonitor(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd2', from: 'product-lead', to: ['inventory-monitor'],
        action: 'inventory_report', params: {}, priority: 'normal',
      });
      expect(result).toHaveProperty('totalProducts');
      expect(result).toHaveProperty('statusCounts');
    });

    it('should shutdown cleanly', async () => {
      const agent = new InventoryMonitor(bus);
      await agent.initialize();
      await agent.shutdown();
      expect(agent.getHealth().status).toBe('shutdown');
    });
  });

  // ── #26 BusinessAnalyst ──
  describe('BusinessAnalyst', () => {
    it('should initialize with correct ID and team', async () => {
      const agent = new BusinessAnalyst(bus);
      expect(agent.id.id).toBe('business-analyst');
      expect(agent.id.team).toBe('data');
    });

    it('should initialize and become healthy', async () => {
      const agent = new BusinessAnalyst(bus);
      await agent.initialize();
      expect(agent.getHealth().status).toBe('healthy');
    });

    it('should run revenue simulation with 100億 target', async () => {
      const agent = new BusinessAnalyst(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd1', from: 'data-lead', to: ['business-analyst'],
        action: 'revenue_simulation',
        params: {targetRevenue: 10_000_000_000, currentMonthlyRevenue: 50_000_000},
        priority: 'normal',
      }) as Record<string, unknown>;
      expect(result).toHaveProperty('targetRevenue', 10_000_000_000);
      expect(result).toHaveProperty('scenarios');
      expect((result as any).scenarios).toHaveLength(3);
    });

    it('should return executive KPI (no data case)', async () => {
      const agent = new BusinessAnalyst(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd2', from: 'data-lead', to: ['business-analyst'],
        action: 'executive_kpi', params: {}, priority: 'normal',
      });
      expect(result).toHaveProperty('status', 'no_data');
    });
  });

  // ── #27 AuthManager ──
  describe('AuthManager', () => {
    it('should initialize with correct ID and team', async () => {
      const agent = new AuthManager(bus);
      expect(agent.id.id).toBe('auth-manager');
      expect(agent.id.team).toBe('engineering');
    });

    it('should validate session (missing)', async () => {
      const agent = new AuthManager(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd1', from: 'engineering-lead', to: ['auth-manager'],
        action: 'validate_session', params: {sessionId: 'nonexistent'}, priority: 'normal',
      }) as {valid: boolean};
      expect(result.valid).toBe(false);
    });

    it('should manage user CRUD', async () => {
      const agent = new AuthManager(bus);
      await agent.initialize();

      // Create user
      const createResult = await agent.handleCommand({
        id: 'cmd2', from: 'engineering-lead', to: ['auth-manager'],
        action: 'manage_user',
        params: {action: 'create', userId: 'user1', email: 'test@test.com', role: 'editor'},
        priority: 'normal',
      }) as {status: string; user?: {role: string}};
      expect(createResult.status).toBe('created');
      expect(createResult.user?.role).toBe('editor');

      // Check permission
      const permResult = await agent.handleCommand({
        id: 'cmd3', from: 'engineering-lead', to: ['auth-manager'],
        action: 'check_permission',
        params: {userId: 'user1', permission: 'products.read'},
        priority: 'normal',
      }) as {allowed: boolean};
      expect(permResult.allowed).toBe(true);

      // Check denied permission
      const denyResult = await agent.handleCommand({
        id: 'cmd4', from: 'engineering-lead', to: ['auth-manager'],
        action: 'check_permission',
        params: {userId: 'user1', permission: 'settings.write'},
        priority: 'normal',
      }) as {allowed: boolean};
      expect(denyResult.allowed).toBe(false);
    });

    it('should assign roles', async () => {
      const agent = new AuthManager(bus);
      await agent.initialize();

      // Create user first
      await agent.handleCommand({
        id: 'cmd1', from: 'engineering-lead', to: ['auth-manager'],
        action: 'manage_user',
        params: {action: 'create', userId: 'user2', email: 'admin@test.com', role: 'viewer'},
        priority: 'normal',
      });

      // Upgrade to admin
      const result = await agent.handleCommand({
        id: 'cmd2', from: 'engineering-lead', to: ['auth-manager'],
        action: 'role_assignment',
        params: {userId: 'user2', role: 'admin'},
        priority: 'normal',
      }) as {status: string; role?: string};
      expect(result.status).toBe('assigned');
      expect(result.role).toBe('admin');
    });

    it('should track audit log', async () => {
      const agent = new AuthManager(bus);
      await agent.initialize();

      // Create user and check permission to generate audit entries
      await agent.handleCommand({
        id: 'cmd1', from: 'engineering-lead', to: ['auth-manager'],
        action: 'manage_user',
        params: {action: 'create', userId: 'user3', email: 'a@b.com', role: 'guest'},
        priority: 'normal',
      });
      await agent.handleCommand({
        id: 'cmd2', from: 'engineering-lead', to: ['auth-manager'],
        action: 'check_permission',
        params: {userId: 'user3', permission: 'products.read'},
        priority: 'normal',
      });

      const log = await agent.handleCommand({
        id: 'cmd3', from: 'engineering-lead', to: ['auth-manager'],
        action: 'audit_log', params: {}, priority: 'normal',
      }) as {entries: unknown[]; total: number};
      expect(log.total).toBeGreaterThanOrEqual(2);
    });
  });

  // ── #28 InfraManager ──
  describe('InfraManager', () => {
    it('should initialize with correct ID', async () => {
      const agent = new InfraManager(bus);
      expect(agent.id.id).toBe('infra-manager');
      expect(agent.id.team).toBe('engineering');
    });

    it('should run full health check', async () => {
      const agent = new InfraManager(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd1', from: 'engineering-lead', to: ['infra-manager'],
        action: 'health_check_infra', params: {}, priority: 'normal',
      }) as {overall: string; apis: unknown[]};
      expect(result).toHaveProperty('overall');
      expect(result).toHaveProperty('apis');
      expect(result.apis.length).toBeGreaterThan(0);
    });

    it('should validate configuration', async () => {
      const agent = new InfraManager(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd2', from: 'engineering-lead', to: ['infra-manager'],
        action: 'validate_config', params: {}, priority: 'normal',
      }) as unknown[];
      expect(result.length).toBeGreaterThan(0);
    });

    it('should run security scan', async () => {
      const agent = new InfraManager(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd3', from: 'engineering-lead', to: ['infra-manager'],
        action: 'security_scan', params: {}, priority: 'normal',
      }) as {scanResult: string};
      expect(result.scanResult).toBe('pass');
    });
  });

  // ── #29 DeployManager ──
  describe('DeployManager', () => {
    it('should initialize with correct ID', async () => {
      const agent = new DeployManager(bus);
      expect(agent.id.id).toBe('deploy-manager');
      expect(agent.id.team).toBe('engineering');
    });

    it('should deploy to staging', async () => {
      const agent = new DeployManager(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd1', from: 'engineering-lead', to: ['deploy-manager'],
        action: 'deploy_staging',
        params: {commitHash: 'abc123', branch: 'develop'},
        priority: 'normal',
      }) as {target: string; stage: string};
      expect(result.target).toBe('staging');
      expect(result.stage).toBe('building');
    });

    it('should block production deploy (CLAUDE.md compliance)', async () => {
      const agent = new DeployManager(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd2', from: 'engineering-lead', to: ['deploy-manager'],
        action: 'deploy_production',
        params: {commitHash: 'abc123', branch: 'main'},
        priority: 'normal',
      }) as {stage: string; error?: string};
      expect(result.stage).toBe('failed');
      expect(result.error).toContain('本番デプロイは完全なデバッグ');
    });

    it('should execute rollback', async () => {
      const agent = new DeployManager(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd3', from: 'engineering-lead', to: ['deploy-manager'],
        action: 'rollback',
        params: {reason: 'テスト用ロールバック'},
        priority: 'normal',
      }) as {reason: string; success: boolean};
      expect(result.success).toBe(true);
    });

    it('should get deploy status', async () => {
      const agent = new DeployManager(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd4', from: 'engineering-lead', to: ['deploy-manager'],
        action: 'deploy_status', params: {}, priority: 'normal',
      }) as {totalDeployments: number};
      expect(result).toHaveProperty('totalDeployments');
    });
  });

  // ── #31 ErrorMonitor ──
  describe('ErrorMonitor', () => {
    it('should initialize with correct ID', async () => {
      const agent = new ErrorMonitor(bus);
      expect(agent.id.id).toBe('error-monitor');
      expect(agent.id.team).toBe('engineering');
    });

    it('should generate error report (empty)', async () => {
      const agent = new ErrorMonitor(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd1', from: 'engineering-lead', to: ['error-monitor'],
        action: 'error_report', params: {}, priority: 'normal',
      }) as {totalErrors: number};
      expect(result.totalErrors).toBe(0);
    });

    it('should get uptime report', async () => {
      const agent = new ErrorMonitor(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd2', from: 'engineering-lead', to: ['error-monitor'],
        action: 'uptime_check', params: {}, priority: 'normal',
      }) as {target: number};
      expect(result.target).toBe(99.9);
    });

    it('should return alert configuration', async () => {
      const agent = new ErrorMonitor(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd3', from: 'engineering-lead', to: ['error-monitor'],
        action: 'alert_config', params: {}, priority: 'normal',
      }) as {errorRateWarning: number; errorRateCritical: number};
      expect(result.errorRateWarning).toBe(1);
      expect(result.errorRateCritical).toBe(5);
    });

    it('should attempt auto recovery', async () => {
      const agent = new ErrorMonitor(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd4', from: 'engineering-lead', to: ['error-monitor'],
        action: 'auto_recovery', params: {errorId: 'test-err-1'}, priority: 'normal',
      }) as {attempted: boolean};
      expect(result.attempted).toBe(true);
    });
  });

  // ── #32 AnalyticsAgent ──
  describe('AnalyticsAgent', () => {
    it('should initialize with correct ID', async () => {
      const agent = new AnalyticsAgent(bus);
      expect(agent.id.id).toBe('analytics-agent');
      expect(agent.id.team).toBe('data');
    });

    it('should return event summary (empty)', async () => {
      const agent = new AnalyticsAgent(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd1', from: 'data-lead', to: ['analytics-agent'],
        action: 'event_tracking', params: {}, priority: 'normal',
      }) as {totalEvents: number};
      expect(result.totalEvents).toBe(0);
    });

    it('should calculate CX score', async () => {
      const agent = new AnalyticsAgent(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd2', from: 'data-lead', to: ['analytics-agent'],
        action: 'cx_score', params: {}, priority: 'normal',
      }) as {overall: number; components: Record<string, number>};
      expect(result).toHaveProperty('overall');
      expect(result).toHaveProperty('components');
      expect(result.components).toHaveProperty('easeOfUse');
    });

    it('should generate funnel report', async () => {
      const agent = new AnalyticsAgent(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd3', from: 'data-lead', to: ['analytics-agent'],
        action: 'funnel_report', params: {}, priority: 'normal',
      }) as {funnel: unknown[]; overallConversion: number};
      expect(result).toHaveProperty('funnel');
      expect(result.funnel).toHaveLength(4); // 4ステップファネル
    });

    it('should return session analysis', async () => {
      const agent = new AnalyticsAgent(bus);
      await agent.initialize();
      const result = await agent.handleCommand({
        id: 'cmd4', from: 'data-lead', to: ['analytics-agent'],
        action: 'session_analysis', params: {}, priority: 'normal',
      }) as {totalSessions: number; bounceRate: number};
      expect(result.totalSessions).toBe(0);
      expect(result.bounceRate).toBe(0);
    });
  });
});
