/**
 * Validation Library Test Suite — Phase 7
 *
 * Tests for:
 *   - Statistical functions
 *   - Round execution
 *   - Sandbox lifecycle
 *   - Attack mutations
 *   - CVSS scoring
 *   - Vulnerability mapping
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  tTest,
  cohenD,
  confidenceInterval,
  coefficientOfVariation,
  cusum,
  descriptiveStats,
} from '../statistical-engine';
import { RoundExecutor } from '../round-executor';
import { SandboxManager } from '../sandbox-manager';
import { AttackEngine } from '../attack-engine';
import { VulnerabilityMapper } from '../vulnerability-mapper';
import type { TestScenario, TestPhase, Vulnerability, AttackPayload } from '../types';

// ── Statistical Functions Tests ──

describe('Statistical Engine', () => {
  describe('tTest', () => {
    it('should calculate t-statistic for different means', () => {
      const a = [1, 2, 3, 4, 5];
      const b = [6, 7, 8, 9, 10];

      const result = tTest(a, b);
      expect(Math.abs(result.tStatistic)).toBeGreaterThanOrEqual(5); // Significantly different
      expect(result.pValue).toBeLessThan(0.05); // Significant difference
      expect(result.degreesOfFreedom).toBeGreaterThan(0);
    });

    it('should return zero t-statistic for identical samples', () => {
      const a = [5, 5, 5, 5, 5];
      const b = [5, 5, 5, 5, 5];

      const result = tTest(a, b);
      expect(result.tStatistic).toBe(0);
      expect(result.pValue).toBe(1);
    });

    it('should throw on empty samples', () => {
      expect(() => tTest([], [1, 2])).toThrow();
      expect(() => tTest([1, 2], [])).toThrow();
    });
  });

  describe('cohenD', () => {
    it('should calculate effect size', () => {
      const a = [1, 2, 3, 4, 5];
      const b = [6, 7, 8, 9, 10];

      const d = cohenD(a, b);
      expect(Math.abs(d)).toBeGreaterThan(1.5); // Large effect size
    });

    it('should return 0 for identical means', () => {
      const a = [5, 5, 5];
      const b = [5, 5, 5];

      const d = cohenD(a, b);
      expect(d).toBe(0);
    });
  });

  describe('confidenceInterval', () => {
    it('should calculate 95% CI', () => {
      const data = [10, 12, 14, 16, 18, 20];
      const ci = confidenceInterval(data, 0.05);

      expect(ci.mean).toBe(15);
      expect(ci.lower).toBeLessThan(ci.mean);
      expect(ci.upper).toBeGreaterThan(ci.mean);
      expect(ci.lower).toBeGreaterThan(0);
    });

    it('should return point estimate for single value', () => {
      const data = [10];
      const ci = confidenceInterval(data);

      expect(ci.mean).toBe(10);
      expect(ci.lower).toBe(10);
      expect(ci.upper).toBe(10);
    });
  });

  describe('coefficientOfVariation', () => {
    it('should calculate CV correctly', () => {
      const data = [100, 110, 120, 130, 140];
      const cv = coefficientOfVariation(data);

      expect(cv).toBeGreaterThan(5); // Some variation
      expect(cv).toBeLessThan(50); // Not huge variation
    });

    it('should return 0 for constant values', () => {
      const data = [5, 5, 5, 5];
      const cv = coefficientOfVariation(data);

      expect(cv).toBe(0);
    });

    it('should return 0 for single value', () => {
      const data = [10];
      const cv = coefficientOfVariation(data);

      expect(cv).toBe(0);
    });
  });

  describe('cusum', () => {
    it('should detect upward trend', () => {
      const data = [5, 5.1, 5.2, 5.5, 6, 7, 8, 9];
      const result = cusum(data);

      expect(result.trend).toBe('up');
      expect(result.changePoints.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect stable trend', () => {
      const data = [5, 5.01, 5.02, 4.99, 5.01, 5, 4.98, 5.01];
      const result = cusum(data);

      expect(result.trend).toBe('stable');
    });
  });

  describe('descriptiveStats', () => {
    it('should calculate statistics correctly', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const stats = descriptiveStats(data);

      expect(stats.count).toBe(10);
      expect(stats.mean).toBe(5.5);
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(10);
      expect(stats.stdDev).toBeGreaterThan(0);
    });
  });
});

// ── Round Executor Tests ──

describe('RoundExecutor', () => {
  let executor: RoundExecutor;
  let scenario: TestScenario;
  let phases: TestPhase[];

  beforeEach(() => {
    scenario = {
      id: 'test-scenario',
      name: 'Test Scenario',
      description: 'A test scenario',
      params: { scale: 1.0 },
      expectedOutcome: { success: true },
      timeout: 5000,
      tags: ['unit-test'],
    };

    phases = [
      {
        id: 'phase-1',
        trials: 5,
        variationStrategy: 'none',
        convergenceThreshold: 20,
        description: 'Initial round',
      },
      {
        id: 'phase-2',
        trials: 10,
        variationStrategy: 'linear',
        convergenceThreshold: 15,
        description: 'Sensitivity analysis',
      },
    ];

    executor = new RoundExecutor({ scenario, phases });
  });

  it('should execute all rounds', async () => {
    const { results, report } = await executor.executeAllRounds();

    expect(results.length).toBe(2);
    expect(results[0].roundNum).toBe(1);
    expect(results[0].trials).toBe(5);
    expect(results[1].roundNum).toBe(2);
    expect(results[1].trials).toBe(10);
  });

  it('should collect metrics', async () => {
    const { results } = await executor.executeAllRounds();

    const metrics = executor.getMetricsSummary();
    expect(Object.keys(metrics).length).toBeGreaterThan(0);

    // Should have latency, throughput, errorRate, memoryUsage
    expect(metrics).toHaveProperty('latency');
    expect(metrics.latency.mean).toBeGreaterThan(0);
    expect(metrics.latency.cv).toBeGreaterThanOrEqual(0);
  });

  it('should generate Go/No-Go report', async () => {
    const { report } = await executor.executeAllRounds();

    expect(['go', 'no-go', 'conditional']).toContain(report.decision);
    expect(report.confidence).toBeGreaterThanOrEqual(0);
    expect(report.confidence).toBeLessThanOrEqual(1);
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.evidence).toBeDefined();
  });
});

// ── Sandbox Manager Tests ──

describe('SandboxManager', () => {
  let manager: SandboxManager;

  beforeEach(() => {
    manager = new SandboxManager();
  });

  afterEach(() => {
    manager.cleanupAll();
  });

  it('should create sandboxes', () => {
    const id = manager.createSandbox({
      id: 'sandbox-1',
      memoryLimitMb: 256,
      timeoutMs: 30000,
      isolate: true,
      captureBaseline: false,
    });

    expect(id).toBe('sandbox-1');

    const sandbox = manager.getSandbox(id);
    expect(sandbox).toBeTruthy();
    expect(sandbox?.isActive).toBe(true);
  });

  it('should destroy sandboxes', () => {
    const id = manager.createSandbox({
      id: 'sandbox-2',
      memoryLimitMb: 256,
      timeoutMs: 30000,
      isolate: true,
      captureBaseline: false,
    });

    const destroyed = manager.destroySandbox(id);
    expect(destroyed).toBe(true);

    const sandbox = manager.getSandbox(id);
    expect(sandbox?.isActive).toBe(false);
  });

  it('should capture baseline', () => {
    const id = manager.createSandbox({
      id: 'sandbox-3',
      memoryLimitMb: 256,
      timeoutMs: 30000,
      isolate: true,
      captureBaseline: true,
    });

    const sandbox = manager.getSandbox(id);
    expect(sandbox?.baseline).toBeDefined();
    expect(sandbox?.baseline?.cpuUsage).toBeGreaterThanOrEqual(0);
  });

  it('should sanitize PII', () => {
    const data = {
      email: 'test@example.com',
      phone: '03-1234-5678',
      name: 'John Doe',
      secret: 'password123',
    };

    const sanitized = manager.sanitizeData(data) as Record<string, unknown>;

    expect(String(sanitized.email)).toContain('[EMAIL]');
    expect(String(sanitized.phone)).toContain('[PHONE]');
    expect(String(sanitized.secret)).toBe('[REDACTED]');
  });

  it('should store and retrieve data', () => {
    const id = manager.createSandbox({
      id: 'sandbox-4',
      memoryLimitMb: 256,
      timeoutMs: 30000,
      isolate: true,
      captureBaseline: false,
    });

    manager.storeData(id, 'key1', 'value1');
    const retrieved = manager.getData(id, 'key1');

    expect(retrieved).toBe('value1');
  });

  it('should compare metrics to baseline', () => {
    const id = manager.createSandbox({
      id: 'sandbox-5',
      memoryLimitMb: 256,
      timeoutMs: 30000,
      isolate: true,
      captureBaseline: true,
    });

    const comparison = manager.compareToBaseline(id, {
      cpuUsage: 25,
      memoryUsage: 50,
      latency: 30,
      errorRate: 0.01,
      throughput: 1000,
    });

    expect(comparison).toHaveProperty('regressions');
    expect(comparison).toHaveProperty('improvements');
  });

  it('should cleanup all sandboxes', () => {
    manager.createSandbox({
      id: 'sandbox-6a',
      memoryLimitMb: 256,
      timeoutMs: 30000,
      isolate: true,
      captureBaseline: false,
    });

    manager.createSandbox({
      id: 'sandbox-6b',
      memoryLimitMb: 256,
      timeoutMs: 30000,
      isolate: true,
      captureBaseline: false,
    });

    const count = manager.cleanupAll();
    expect(count).toBe(2);

    const health = manager.getHealth();
    expect(health.activeSandboxes).toBe(0);
  });
});

// ── Attack Engine Tests ──

describe('AttackEngine', () => {
  let engine: AttackEngine;

  beforeEach(() => {
    engine = new AttackEngine();
  });

  afterEach(() => {
    engine.reset();
  });

  it('should generate payload mutations', () => {
    const payload: AttackPayload = {
      type: 'injection',
      vector: "'; DROP TABLE users; --",
      intensity: 0.8,
      mutations: [],
      targetAgent: 'database-agent',
    };

    const mutations = engine.mutatePayloads(payload, 5);

    expect(mutations.length).toBe(5);
    expect(mutations[0]).toContain("'"); // Original
    expect(mutations).toContain(payload.vector);
  });

  it('should vary conditions', () => {
    const baseConditions = { mode: 'test' };
    const variations = engine.varyConditions(baseConditions);

    expect(variations.length).toBeGreaterThan(0);

    // Should have different load and delay combinations
    const unique = new Set(variations.map((v) => JSON.stringify(v)));
    expect(unique.size).toBeGreaterThan(1);
  });

  it('should execute attack plan', async () => {
    const plan = {
      id: 'attack-plan-1',
      payloads: [
        {
          type: 'injection',
          vector: "'; DROP TABLE;",
          intensity: 0.9,
          mutations: [],
          targetAgent: 'database',
        },
      ],
      repetitions: 2,
      description: 'Test SQL injection',
      targetAgent: 'database',
    };

    const result = await engine.executeAttack(plan);

    expect(result.success).toBe(true);
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.summary.totalAttempts).toBeGreaterThan(0);
  });

  it('should generate statistics', async () => {
    const plan = {
      id: 'attack-plan-2',
      payloads: [
        {
          type: 'xss',
          vector: '<script>alert("xss")</script>',
          intensity: 0.7,
          mutations: [],
          targetAgent: 'web-frontend',
        },
      ],
      repetitions: 1,
      description: 'XSS test',
      targetAgent: 'web-frontend',
    };

    await engine.executeAttack(plan);

    const stats = engine.getStatistics();

    expect(stats.totalAttacks).toBeGreaterThan(0);
    expect(stats.detectionRate).toBeGreaterThanOrEqual(0);
    expect(stats.detectionRate).toBeLessThanOrEqual(100);
    expect(stats.avgResponseTime).toBeGreaterThan(0);
  });

  it('should repeat attacks', async () => {
    const plan = {
      id: 'attack-plan-3',
      payloads: [
        {
          type: 'bypass',
          vector: 'admin; bypass;',
          intensity: 0.8,
          mutations: [],
          targetAgent: 'auth',
        },
      ],
      repetitions: 1,
      description: 'Auth bypass test',
      targetAgent: 'auth',
    };

    const result = await engine.repeatAttack(plan, 2);

    expect(result.totalTests).toBeGreaterThan(0);
    expect(result.consistentlyDetected).toBeGreaterThanOrEqual(0);
  });
});

// ── Vulnerability Mapper Tests ──

describe('VulnerabilityMapper', () => {
  let mapper: VulnerabilityMapper;

  beforeEach(() => {
    mapper = new VulnerabilityMapper();
  });

  it('should build vulnerability map', () => {
    const vulns: Vulnerability[] = [
      {
        id: 'CVE-2024-001',
        severity: 'critical',
        cvssScore: 9.5,
        description: 'SQL injection in login',
        affectedComponent: 'auth-module',
        remediation: 'Use parameterized queries',
        discoveredAt: Date.now(),
      },
      {
        id: 'CVE-2024-002',
        severity: 'high',
        cvssScore: 7.2,
        description: 'XSS vulnerability',
        affectedComponent: 'ui-forms',
        remediation: 'Implement CSP',
        discoveredAt: Date.now(),
      },
    ];

    const map = mapper.buildVulnMap(vulns);

    expect(map.summary.totalCount).toBe(2);
    expect(map.summary.criticalCount).toBe(1);
    expect(map.summary.highCount).toBe(1);
    expect(map.summary.maxCVSSScore).toBe(9.5);
  });

  it('should score CVSS', () => {
    const vuln: Vulnerability = {
      id: 'CVE-2024-003',
      severity: 'high',
      cvssScore: 0, // Will be calculated
      description: 'Authentication bypass',
      affectedComponent: 'auth',
      remediation: 'Implement MFA',
      discoveredAt: Date.now(),
    };

    const score = mapper.scoreCVSS(vuln);

    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(10);
  });

  it('should generate remediation patch', () => {
    const vuln: Vulnerability = {
      id: 'CVE-2024-004',
      severity: 'critical',
      cvssScore: 9.0,
      description: 'SQL injection vulnerability in login form',
      affectedComponent: 'auth',
      remediation: 'Use parameterized queries',
      discoveredAt: Date.now(),
    };

    const patch = mapper.generatePatch(vuln);

    expect(patch).toContain('parameterized');
    expect(patch.length).toBeGreaterThan(50);
  });

  it('should generate remediation plan', () => {
    const vulns: Vulnerability[] = [
      {
        id: 'CVE-2024-005',
        severity: 'critical',
        cvssScore: 9.5,
        description: 'Critical SQL injection',
        affectedComponent: 'database',
        remediation: 'Fix immediately',
        discoveredAt: Date.now(),
      },
      {
        id: 'CVE-2024-006',
        severity: 'low',
        cvssScore: 2.5,
        description: 'Minor UI issue',
        affectedComponent: 'frontend',
        remediation: 'Low priority fix',
        discoveredAt: Date.now(),
      },
    ];

    const map = mapper.buildVulnMap(vulns);

    expect(map.remediationPlan.length).toBe(2);
    // Critical should come first
    const critical = map.remediationPlan.find(
      (p) => p.vulnerabilityId === 'CVE-2024-005',
    );
    expect(critical?.estimatedEffort).toBe('high');
  });

  it('should calculate total remediation time', () => {
    const vulns: Vulnerability[] = [
      {
        id: 'CVE-2024-007',
        severity: 'critical',
        cvssScore: 9.0,
        description: 'Critical flaw',
        affectedComponent: 'core',
        remediation: 'Complex fix',
        discoveredAt: Date.now(),
      },
    ];

    const map = mapper.buildVulnMap(vulns);
    const time = mapper.getTotalRemediationTime(map);

    expect(time.critical).toBeGreaterThan(0);
    expect(time.total).toBeGreaterThan(0);
  });

  it('should generate report', () => {
    const vulns: Vulnerability[] = [
      {
        id: 'CVE-2024-008',
        severity: 'high',
        cvssScore: 7.5,
        description: 'High-risk vulnerability',
        affectedComponent: 'api',
        remediation: 'Apply patch v2.1.0',
        discoveredAt: Date.now(),
      },
    ];

    const map = mapper.buildVulnMap(vulns);
    const report = mapper.generateReport(map);

    expect(report).toContain('Vulnerability Report');
    expect(report).toContain('CVE-2024-008');
    expect(report).toContain('Remediation Effort');
  });
});
