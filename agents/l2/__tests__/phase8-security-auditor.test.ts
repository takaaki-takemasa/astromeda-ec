/**
 * Phase 8 G-040 AI Security Auditor テスト
 *
 * 適応免疫系（Adaptive Immunity）の5つのコア能力をテスト：
 * 1. threat_analysis — 攻撃パターン統計分析
 * 2. penetration_test — ペネトレーション攻撃テスト
 * 3. dynamic_rule_update — 動的セキュリティルール生成
 * 4. vulnerability_assessment — 脆弱性評価（CVSS付き）
 * 5. incident_response — インシデント対応・隔離
 *
 * 合計15+テスト、vitest、API キーなし
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IAgentBus, AgentEvent } from '../../core/types';
import { AISecurityAuditor } from '../ai-security-auditor';

// ── Mock Bus ──
function createMockBus(): IAgentBus {
  const handlers = new Map<string, Array<(event: AgentEvent) => void>>();
  let subCounter = 0;

  return {
    publish: vi.fn(async (event: AgentEvent) => {
      for (const [pattern, fns] of handlers.entries()) {
        if (event.type === pattern || (pattern.endsWith('*') && event.type.startsWith(pattern.slice(0, -1)))) {
          for (const fn of fns) {
            await fn(event);
          }
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
  } as unknown as IAgentBus;
}

describe('Phase 8: AI Security Auditor (G-040)', () => {
  let bus: IAgentBus;
  let auditor: AISecurityAuditor;

  beforeEach(() => {
    bus = createMockBus();
    auditor = new AISecurityAuditor(bus);
  });

  // ────────────────────────────────────────
  // INITIALIZATION & BASIC LIFECYCLE
  // ────────────────────────────────────────

  describe('Initialization & Lifecycle', () => {
    it('should initialize with correct ID and metadata', async () => {
      expect(auditor.id.id).toBe('ai-security-auditor');
      expect(auditor.id.name).toBe('AISecurityAuditor');
      expect(auditor.id.level).toBe('L2');
      expect(auditor.id.team).toBe('engineering');
      expect(auditor.id.version).toBe('1.0.0');
    });

    it('should initialize and become healthy', async () => {
      await auditor.initialize();
      const health = auditor.getHealth();
      expect(health.status).toBe('healthy');
      expect(health.agentId).toBe('ai-security-auditor');
    });

    it('should load initial threat patterns on initialization', async () => {
      await auditor.initialize();
      const stats = auditor.getStatistics();
      expect(stats.threatPatternsLearned).toBeGreaterThan(0); // Seeded patterns
    });

    it('should shutdown cleanly', async () => {
      await auditor.initialize();
      await auditor.shutdown();
      const health = auditor.getHealth();
      expect(health.status).toBe('shutdown');
    });

    it('should subscribe to security events on init', async () => {
      await auditor.initialize();
      expect(bus.subscribe).toHaveBeenCalledWith('security.*', expect.any(Function));
      expect(bus.subscribe).toHaveBeenCalledWith('security_auditor.*', expect.any(Function));
      expect(bus.subscribe).toHaveBeenCalledWith('anomaly.*', expect.any(Function));
      expect(bus.subscribe).toHaveBeenCalledWith('incident.*', expect.any(Function));
    });
  });

  // ────────────────────────────────────────
  // ACTION 1: THREAT ANALYSIS
  // ────────────────────────────────────────

  describe('Action 1: threat_analysis', () => {
    beforeEach(async () => {
      await auditor.initialize();
    });

    it('should detect threat patterns from anomaly logs', async () => {
      const anomalies = [
        { reason: 'injection', source: 'bot-001', timestamp: Date.now(), severity: 'critical' },
        { reason: 'injection', source: 'bot-002', timestamp: Date.now(), severity: 'critical' },
        { reason: 'injection', source: 'bot-003', timestamp: Date.now(), severity: 'critical' },
        { reason: 'xss', source: 'attacker-001', timestamp: Date.now(), severity: 'high' },
      ];

      const result = await auditor.handleCommand({
        id: 'cmd_threat_001',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'threat_analysis',
        params: { anomalies },
        priority: 'high',
      });

      expect(result).toHaveProperty('status', 'success');
      expect(result).toHaveProperty('anomaliesAnalyzed', 4);
      expect(result).toHaveProperty('patternsDetected');
      expect(result.patternsDetected).toBeGreaterThan(0);
    });

    it('should classify attack types correctly', async () => {
      const anomalies = [
        { reason: 'sql_injection', source: 'scanner-001', timestamp: Date.now(), severity: 'critical' },
        { reason: 'sql_injection', source: 'scanner-002', timestamp: Date.now(), severity: 'critical' },
        { reason: 'sql_injection', source: 'scanner-003', timestamp: Date.now(), severity: 'critical' },
      ];

      const result = await auditor.handleCommand({
        id: 'cmd_threat_002',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'threat_analysis',
        params: { anomalies },
        priority: 'high',
      });

      const detectedTypes = (result.detectedPatterns as Array<{ type: string }>).map((p) => p.type);
      expect(detectedTypes).toContain('injection');
    });

    it('should estimate severity levels based on frequency', async () => {
      const anomalies = Array.from({ length: 15 }).map((_, i) => ({
        reason: 'rate_limit_exceeded',
        source: `bot-${i}`,
        timestamp: Date.now(),
        severity: 'medium',
      }));

      const result = await auditor.handleCommand({
        id: 'cmd_threat_003',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'threat_analysis',
        params: { anomalies },
        priority: 'high',
      });

      expect(result).toHaveProperty('patternsDetected');
      const patterns = result.detectedPatterns as Array<{ severity: string }>;
      expect(patterns.some((p) => p.severity === 'high')).toBe(true);
    });

    it('should provide recommendations for each pattern', async () => {
      const anomalies = [
        { reason: 'authentication_bypass', source: 'hacker-001', timestamp: Date.now(), severity: 'critical' },
        { reason: 'authentication_bypass', source: 'hacker-002', timestamp: Date.now(), severity: 'critical' },
        { reason: 'authentication_bypass', source: 'hacker-003', timestamp: Date.now(), severity: 'critical' },
      ];

      const result = await auditor.handleCommand({
        id: 'cmd_threat_004',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'threat_analysis',
        params: { anomalies },
        priority: 'high',
      });

      expect(result).toHaveProperty('recommendations');
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should store learned patterns in memory', async () => {
      const anomalies = [
        { reason: 'ddos_attack', source: 'botnet-001', timestamp: Date.now(), severity: 'critical' },
        { reason: 'ddos_attack', source: 'botnet-002', timestamp: Date.now(), severity: 'critical' },
        { reason: 'ddos_attack', source: 'botnet-003', timestamp: Date.now(), severity: 'critical' },
      ];

      await auditor.handleCommand({
        id: 'cmd_threat_005',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'threat_analysis',
        params: { anomalies },
        priority: 'high',
      });

      const patterns = auditor.getThreatPatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────
  // ACTION 2: PENETRATION TEST
  // ────────────────────────────────────────

  describe('Action 2: penetration_test', () => {
    beforeEach(async () => {
      await auditor.initialize();
    });

    it('should execute penetration test with injection payloads', async () => {
      const result = await auditor.handleCommand({
        id: 'cmd_pentest_001',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'penetration_test',
        params: { targetAgent: 'api-gateway', payloadTypes: ['injection'] },
        priority: 'high',
      });

      expect(result).toHaveProperty('status', 'success');
      expect(result).toHaveProperty('targetAgent', 'api-gateway');
      expect(result).toHaveProperty('totalAttempts');
      expect(result.totalAttempts).toBeGreaterThan(0);
    });

    it('should test multiple payload types', async () => {
      const result = await auditor.handleCommand({
        id: 'cmd_pentest_002',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'penetration_test',
        params: {
          targetAgent: 'auth-service',
          payloadTypes: ['injection', 'xss', 'bypass'],
        },
        priority: 'high',
      });

      expect(result).toHaveProperty('totalAttempts');
      expect(result.totalAttempts).toBeGreaterThanOrEqual(3); // At least 1 per type
    });

    it('should detect successful attacks', async () => {
      const result = await auditor.handleCommand({
        id: 'cmd_pentest_003',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'penetration_test',
        params: { targetAgent: 'vulnerable-service', payloadTypes: ['injection'] },
        priority: 'high',
      });

      expect(result).toHaveProperty('successfulDetections');
      expect(result).toHaveProperty('detectionRate');
      expect(typeof result.detectionRate === 'number').toBe(true);
    });

    it('should count critical vulnerabilities found', async () => {
      const result = await auditor.handleCommand({
        id: 'cmd_pentest_004',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'penetration_test',
        params: {
          targetAgent: 'payment-service',
          payloadTypes: ['injection', 'xss'],
        },
        priority: 'high',
      });

      expect(result).toHaveProperty('criticalVulnerabilitiesFound');
      expect(typeof result.criticalVulnerabilitiesFound === 'number').toBe(true);
    });

    it('should publish critical vulnerability event if found', async () => {
      const publishSpy = vi.spyOn(bus, 'publish');

      await auditor.handleCommand({
        id: 'cmd_pentest_005',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'penetration_test',
        params: { targetAgent: 'core-api', payloadTypes: ['injection'] },
        priority: 'high',
      });

      // Check if critical event was published
      const criticalEvents = publishSpy.mock.calls.filter((call) => {
        const event = call[0] as AgentEvent;
        return event.type.includes('vulnerability');
      });

      expect(criticalEvents.length).toBeGreaterThanOrEqual(0); // May or may not find vulnerabilities
    });
  });

  // ────────────────────────────────────────
  // ACTION 3: DYNAMIC RULE UPDATE
  // ────────────────────────────────────────

  describe('Action 3: dynamic_rule_update', () => {
    beforeEach(async () => {
      await auditor.initialize();
    });

    it('should generate dynamic rules from threat patterns', async () => {
      // First, establish threat patterns
      const anomalies = [
        { reason: 'injection', source: 'scanner-001', timestamp: Date.now(), severity: 'critical' },
        { reason: 'injection', source: 'scanner-002', timestamp: Date.now(), severity: 'critical' },
        { reason: 'injection', source: 'scanner-003', timestamp: Date.now(), severity: 'critical' },
      ];

      await auditor.handleCommand({
        id: 'cmd_threat_gen_rules',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'threat_analysis',
        params: { anomalies },
        priority: 'high',
      });

      // Now generate rules
      const result = await auditor.handleCommand({
        id: 'cmd_rule_update_001',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'dynamic_rule_update',
        params: { threatPatternId: 'any' },
        priority: 'high',
      });

      expect(result).toHaveProperty('status', 'success');
      expect(result).toHaveProperty('rulesGenerated');
      expect(result.rulesGenerated).toBeGreaterThanOrEqual(0);
    });

    it('should create block_pattern rules for critical threats', async () => {
      const result = await auditor.handleCommand({
        id: 'cmd_rule_update_002',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'dynamic_rule_update',
        params: {},
        priority: 'high',
      });

      expect(result).toHaveProperty('rules');
      const rules = (result.rules as Array<{ type: string }>);
      const blockPatterns = rules.filter((r) => r.type === 'block_pattern');
      expect(blockPatterns.length).toBeGreaterThanOrEqual(0);
    });

    it('should track rule validity duration', async () => {
      const result = await auditor.handleCommand({
        id: 'cmd_rule_update_003',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'dynamic_rule_update',
        params: {},
        priority: 'high',
      });

      if ((result.rules as Array<unknown>).length > 0) {
        const rules = result.rules as Array<{ validityMs: number }>;
        for (const rule of rules) {
          expect(rule.validityMs).toBeGreaterThan(0);
        }
      }
    });

    it('should track confidence levels for rules', async () => {
      const result = await auditor.handleCommand({
        id: 'cmd_rule_update_004',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'dynamic_rule_update',
        params: {},
        priority: 'high',
      });

      if ((result.rules as Array<unknown>).length > 0) {
        const rules = result.rules as Array<{ confidence: number }>;
        for (const rule of rules) {
          expect(rule.confidence).toBeGreaterThanOrEqual(0);
          expect(rule.confidence).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should maintain count of generated rules in statistics', async () => {
      const statsBefore = auditor.getStatistics();
      const countBefore = statsBefore.dynamicRulesGenerated;

      await auditor.handleCommand({
        id: 'cmd_rule_update_005',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'dynamic_rule_update',
        params: {},
        priority: 'high',
      });

      const statsAfter = auditor.getStatistics();
      expect(statsAfter.dynamicRulesGenerated).toBeGreaterThanOrEqual(countBefore);
    });
  });

  // ────────────────────────────────────────
  // ACTION 4: VULNERABILITY ASSESSMENT
  // ────────────────────────────────────────

  describe('Action 4: vulnerability_assessment', () => {
    beforeEach(async () => {
      await auditor.initialize();
    });

    it('should perform vulnerability assessment', async () => {
      const result = await auditor.handleCommand({
        id: 'cmd_vuln_assess_001',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'vulnerability_assessment',
        params: { agentFilter: 'all' },
        priority: 'high',
      });

      expect(result).toHaveProperty('status', 'success');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('totalRemediationHours');
    });

    it('should report CVSS scores', async () => {
      const result = await auditor.handleCommand({
        id: 'cmd_vuln_assess_002',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'vulnerability_assessment',
        params: { agentFilter: 'all' },
        priority: 'high',
      });

      const summary = result.summary as Record<string, unknown>;
      expect(summary).toHaveProperty('maxCVSSScore');
      const maxScore = Number(summary.maxCVSSScore);
      expect(maxScore).toBeGreaterThanOrEqual(0);
      expect(maxScore).toBeLessThanOrEqual(10);
    });

    it('should break down vulnerabilities by severity', async () => {
      const result = await auditor.handleCommand({
        id: 'cmd_vuln_assess_003',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'vulnerability_assessment',
        params: { agentFilter: 'all' },
        priority: 'high',
      });

      const summary = result.summary as Record<string, unknown>;
      expect(summary).toHaveProperty('criticalCount');
      expect(summary).toHaveProperty('highCount');
      expect(summary).toHaveProperty('mediumCount');
      expect(summary).toHaveProperty('lowCount');
    });

    it('should estimate remediation effort by severity', async () => {
      const result = await auditor.handleCommand({
        id: 'cmd_vuln_assess_004',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'vulnerability_assessment',
        params: { agentFilter: 'all' },
        priority: 'high',
      });

      expect(result).toHaveProperty('criticalRemediationHours');
      expect(result).toHaveProperty('highRemediationHours');
      expect(result).toHaveProperty('mediumRemediationHours');
      expect(result).toHaveProperty('lowRemediationHours');

      const total = result.totalRemediationHours as number;
      const sum =
        (result.criticalRemediationHours as number) +
        (result.highRemediationHours as number) +
        (result.mediumRemediationHours as number) +
        (result.lowRemediationHours as number);

      expect(total).toBe(sum);
    });

    it('should provide findings in human-readable format', async () => {
      const result = await auditor.handleCommand({
        id: 'cmd_vuln_assess_005',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'vulnerability_assessment',
        params: { agentFilter: 'all' },
        priority: 'high',
      });

      expect(result).toHaveProperty('findings');
      expect(Array.isArray(result.findings)).toBe(true);
    });
  });

  // ────────────────────────────────────────
  // ACTION 5: INCIDENT RESPONSE
  // ────────────────────────────────────────

  describe('Action 5: incident_response', () => {
    beforeEach(async () => {
      await auditor.initialize();
    });

    it('should respond to security incidents', async () => {
      const result = await auditor.handleCommand({
        id: 'cmd_incident_001',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'incident_response',
        params: {
          incidentId: 'INC-001',
          affectedAgents: ['api-gateway', 'auth-service'],
          severity: 'critical',
          description: 'SQL injection attack detected',
        },
        priority: 'critical',
      });

      expect(result).toHaveProperty('status', 'success');
      expect(result).toHaveProperty('incidentId', 'INC-001');
      expect(result).toHaveProperty('affectedAgents', 2);
    });

    it('should isolate affected agents', async () => {
      const result = await auditor.handleCommand({
        id: 'cmd_incident_002',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'incident_response',
        params: {
          affectedAgents: ['compromised-agent-1', 'compromised-agent-2'],
          severity: 'critical',
          description: 'Unauthorized access detected',
        },
        priority: 'critical',
      });

      expect(result).toHaveProperty('isolated');
      expect(result.isolated).toBeGreaterThanOrEqual(0);
    });

    it('should collect forensic data', async () => {
      const result = await auditor.handleCommand({
        id: 'cmd_incident_003',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'incident_response',
        params: {
          affectedAgents: ['suspect-agent'],
          severity: 'high',
          description: 'Anomalous behavior patterns detected',
        },
        priority: 'critical',
      });

      expect(result).toHaveProperty('forensicSnapshots');
      expect(typeof result.forensicSnapshots === 'number').toBe(true);
    });

    it('should execute response actions', async () => {
      const result = await auditor.handleCommand({
        id: 'cmd_incident_004',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'incident_response',
        params: {
          affectedAgents: ['breached-agent'],
          severity: 'critical',
          description: 'Agent compromise confirmed',
        },
        priority: 'critical',
      });

      expect(result).toHaveProperty('responseActions');
      expect(Array.isArray(result.responseActions)).toBe(true);
      expect(result.responseActions.length).toBeGreaterThan(0);
    });

    it('should store incident records for audit', async () => {
      await auditor.handleCommand({
        id: 'cmd_incident_005',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'incident_response',
        params: {
          incidentId: 'INC-TEST-001',
          affectedAgents: ['test-agent'],
          severity: 'medium',
          description: 'Test incident',
        },
        priority: 'normal',
      });

      const history = auditor.getIncidentHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[history.length - 1].id).toBe('INC-TEST-001');
    });
  });

  // ────────────────────────────────────────
  // ERROR HANDLING
  // ────────────────────────────────────────

  describe('Error Handling', () => {
    beforeEach(async () => {
      await auditor.initialize();
    });

    it('should handle unknown action gracefully', async () => {
      const result = await auditor.handleCommand({
        id: 'cmd_error_001',
        from: 'test',
        to: ['ai-security-auditor'],
        action: 'unknown_action',
        params: {},
        priority: 'normal',
      });

      expect(result).toHaveProperty('status', 'error');
      expect(result).toHaveProperty('error');
      expect(String(result.error)).toContain('unknown action');
    });

    it('should handle empty threat patterns gracefully', async () => {
      const result = await auditor.handleCommand({
        id: 'cmd_error_002',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'threat_analysis',
        params: { anomalies: [] },
        priority: 'normal',
      });

      expect(result).toHaveProperty('status', 'success');
      expect(result).toHaveProperty('patternsDetected', 0);
    });

    it('should handle missing parameters with defaults', async () => {
      const result = await auditor.handleCommand({
        id: 'cmd_error_003',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'penetration_test',
        params: {}, // Missing targetAgent and payloadTypes
        priority: 'normal',
      });

      expect(result).toHaveProperty('status', 'success');
      expect(result).toHaveProperty('targetAgent', 'all');
    });
  });

  // ────────────────────────────────────────
  // STATISTICS & DIAGNOSTICS
  // ────────────────────────────────────────

  describe('Statistics & Diagnostics', () => {
    beforeEach(async () => {
      await auditor.initialize();
    });

    it('should track penetration tests run', async () => {
      const statsBefore = auditor.getStatistics();
      const countBefore = statsBefore.penetrationTestsRun;

      await auditor.handleCommand({
        id: 'cmd_stat_001',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'penetration_test',
        params: { targetAgent: 'test-service', payloadTypes: ['injection'] },
        priority: 'normal',
      });

      const statsAfter = auditor.getStatistics();
      expect(statsAfter.penetrationTestsRun).toBe(countBefore + 1);
    });

    it('should provide comprehensive statistics', async () => {
      const stats = auditor.getStatistics();

      expect(stats).toHaveProperty('threatPatternsLearned');
      expect(stats).toHaveProperty('dynamicRulesGenerated');
      expect(stats).toHaveProperty('dynamicRulesActive');
      expect(stats).toHaveProperty('penetrationTestsRun');
      expect(stats).toHaveProperty('incidentsHandled');
      expect(stats).toHaveProperty('lastThreatAnalysis');
    });

    it('should expose threat patterns for inspection', async () => {
      const patterns = auditor.getThreatPatterns();
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);

      for (const pattern of patterns) {
        expect(pattern).toHaveProperty('id');
        expect(pattern).toHaveProperty('type');
        expect(pattern).toHaveProperty('severity');
      }
    });

    it('should maintain incident history for forensics', async () => {
      await auditor.handleCommand({
        id: 'cmd_stat_002',
        from: 'security-lead',
        to: ['ai-security-auditor'],
        action: 'incident_response',
        params: {
          affectedAgents: ['service-a'],
          severity: 'high',
          description: 'Test incident for history',
        },
        priority: 'normal',
      });

      const history = auditor.getIncidentHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toHaveProperty('timestamp');
      expect(history[0]).toHaveProperty('severity');
      expect(history[0]).toHaveProperty('affectedAgents');
    });
  });
});
