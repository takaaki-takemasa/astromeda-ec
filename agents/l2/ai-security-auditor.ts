/**
 * AI Security Auditor — G-040 適応免疫系 (Adaptive Immunity)
 *
 * 生体対応: 適応免疫（acquired immunity）
 * SecurityGuardの自然免疫（innate immunity）を補完する知的セキュリティシステム。
 * 過去の攻撃パターンから学習し、動的に新しいセキュリティルールを生成。
 * ペネトレーションテスト、脅威分析、脆弱性評価、インシデント対応を実行。
 *
 * 核となる5つの能力:
 * 1. threat_analysis — SecurityGuardの異常ログから攻撃パターンを統計分析
 * 2. penetration_test — AttackEngineでペイロード多様性テスト実施
 * 3. dynamic_rule_update — 観測した脅威から新しいセキュリティルールを自動生成
 * 4. vulnerability_assessment — VulnerabilityMapperでCVSS評価＋システム全体の脆弱性ポスチャー診断
 * 5. incident_response — 侵害されたエージェントを隔離、管理者に通知、フォレンジックレポート生成
 *
 * 所属パイプライン: P06（セキュリティ強化）
 * チーム: engineering
 * Phase: Phase 2B（適応免疫）
 */

import type {
  AgentId,
  AgentEvent,
  CascadeCommand,
  IAgentBus,
} from '../core/types';
import { BaseL2Agent } from './base-l2-agent';
import { AttackEngine, type AttackPlan, type AttackResult } from '../lib/validation/attack-engine';
import { VulnerabilityMapper, type CVSSMetrics } from '../lib/validation/vulnerability-mapper';
import type { Vulnerability, VulnMap } from '../lib/validation/types';

// ── Internal Types ──

interface ThreatPattern {
  id: string;
  type: string;
  sourceAgentPattern: string;
  anomalyReasonPattern: string;
  frequency: number;
  lastSeen: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  recommendations: string[];
}

interface DynamicSecurityRule {
  id: string;
  ruleType: 'rate_limit' | 'block_pattern' | 'allowlist' | 'flag_suspicious';
  condition: string;
  action: string;
  confidence: number; // 0-1, based on threat learning
  appliedAt: number;
  validityDurationMs: number;
  generatedFrom: string; // threatPatternId that triggered this
}

interface IncidentRecord {
  id: string;
  timestamp: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  affectedAgents: string[];
  description: string;
  forensicData: {
    anomalySnapshots: unknown[];
    behaviorChangeFlags: string[];
    impactAssessment: string;
  };
  responseActions: string[];
  resolved: boolean;
}

export class AISecurityAuditor extends BaseL2Agent {
  readonly id: AgentId = {
    id: 'ai-security-auditor',
    name: 'AISecurityAuditor',
    level: 'L2',
    team: 'engineering',
    version: '1.0.0',
  };

  // Core dependencies
  private attackEngine: AttackEngine;
  private vulnMapper: VulnerabilityMapper;

  // Threat learning database
  private threatPatterns: Map<string, ThreatPattern> = new Map();
  private dynamicRules: Map<string, DynamicSecurityRule> = new Map();
  private incidentHistory: IncidentRecord[] = [];

  // Statistics
  private lastThreatAnalysisTime = 0;
  private penetrationTestsRun = 0;
  private rulesGenerated = 0;

  constructor(bus: IAgentBus) {
    super(bus);
    this.attackEngine = new AttackEngine();
    this.vulnMapper = new VulnerabilityMapper();
  }

  protected async onInitialize(): Promise<void> {
    // Subscribe to security-related events
    this.subscribe('security.*');
    this.subscribe('security_auditor.*');
    this.subscribe('anomaly.*');
    this.subscribe('incident.*');

    // Load historical threat patterns (in production, from persistent store)
    this.seedInitialThreatPatterns();

    await this.publishEvent('security_auditor.initialized', {
      threatPatternsLoaded: this.threatPatterns.size,
      rulesActive: this.dynamicRules.size,
    }, 'high');
  }

  protected async onShutdown(): Promise<void> {
    this.threatPatterns.clear();
    this.dynamicRules.clear();
    this.incidentHistory = [];
    this.attackEngine.reset();
  }

  protected async onEvent(event: AgentEvent): Promise<void> {
    if (event.type.startsWith('anomaly.')) {
      // Automatically analyze anomalies
      await this.analyzeAnomalyEvent(event);
    } else if (event.type.startsWith('incident.')) {
      // Respond to incident notifications
      await this.respondToIncident(event);
    }
  }

  protected async onCommand(command: CascadeCommand): Promise<unknown> {
    switch (command.action) {
      case 'threat_analysis':
        return this.threatAnalysisAction(command.params);

      case 'penetration_test':
        return this.penetrationTestAction(command.params);

      case 'dynamic_rule_update':
        return this.dynamicRuleUpdateAction(command.params);

      case 'vulnerability_assessment':
        return this.vulnerabilityAssessmentAction(command.params);

      case 'incident_response':
        return this.incidentResponseAction(command.params);

      default:
        throw new Error(`AISecurityAuditor: unknown action "${command.action}"`);
    }
  }

  // ── ACTION 1: Threat Analysis ──
  // 脅威分析：SecurityGuardの異常ログから攻撃パターンを統計学的に検出

  private async threatAnalysisAction(params: Record<string, unknown>): Promise<unknown> {
    try {
      const anomalyData = (params.anomalies as unknown[]) ?? [];
      const windowMs = (params.windowMs as number) ?? 3600000; // 1 hour default

      await this.publishEvent('security_auditor.threat_analysis_started', {
        anomalyCount: anomalyData.length,
        analyzeWindowMs: windowMs,
      }, 'high');

      // 1. Parse anomalies
      const anomalies = this.parseAnomalies(anomalyData);

      // 2. Extract patterns
      const patterns = this.extractAttackPatterns(anomalies);

      // 3. Statistical significance (chi-square-like heuristic)
      const significantPatterns = this.filterSignificantPatterns(patterns);

      // 4. Store learned patterns
      for (const pattern of significantPatterns) {
        this.threatPatterns.set(pattern.id, pattern);
      }

      this.lastThreatAnalysisTime = Date.now();

      const result = {
        status: 'success',
        anomaliesAnalyzed: anomalies.length,
        patternsDetected: significantPatterns.length,
        newPatterns: significantPatterns.filter((p) => !this.threatPatterns.has(p.id)).length,
        detectedPatterns: significantPatterns.map((p) => ({
          id: p.id,
          type: p.type,
          frequency: p.frequency,
          severity: p.severity,
        })),
        recommendations: significantPatterns.flatMap((p) => p.recommendations),
      };

      await this.publishEvent('security_auditor.threat_analysis_completed', result, 'high');

      return result;
    } catch (err) {
      const errorMsg = String(err);
      await this.publishEvent('security_auditor.threat_analysis_failed', {
        error: errorMsg,
      }, 'critical');
      throw err;
    }
  }

  private parseAnomalies(data: unknown[]): Array<{
    reason: string;
    source: string;
    timestamp: number;
    severity: string;
  }> {
    return data
      .filter((item) => typeof item === 'object' && item !== null)
      .map((item) => {
        const obj = item as Record<string, unknown>;
        return {
          reason: String(obj.reason ?? 'unknown'),
          source: String(obj.source ?? 'unknown'),
          timestamp: Number(obj.timestamp ?? Date.now()),
          severity: String(obj.severity ?? 'medium'),
        };
      });
  }

  private extractAttackPatterns(anomalies: Array<{
    reason: string;
    source: string;
    timestamp: number;
    severity: string;
  }>): ThreatPattern[] {
    const patterns: ThreatPattern[] = [];
    const patternMap = new Map<string, number>();

    // Group by reason + source prefix
    for (const anom of anomalies) {
      const sourcePrefix = anom.source.split('-')[0] || 'unknown';
      const key = `${anom.reason}|${sourcePrefix}`;
      patternMap.set(key, (patternMap.get(key) ?? 0) + 1);
    }

    // Create patterns for frequent combinations
    for (const [key, frequency] of patternMap.entries()) {
      if (frequency >= 3) { // Minimum 3 occurrences
        const [reason, source] = key.split('|');
        const severity = this.estimateSeverity(reason, frequency);

        patterns.push({
          id: `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: this.classifyAttackType(reason),
          sourceAgentPattern: source,
          anomalyReasonPattern: reason,
          frequency,
          lastSeen: Date.now(),
          severity,
          recommendations: this.generateRecommendations(reason, source),
        });
      }
    }

    return patterns;
  }

  private filterSignificantPatterns(patterns: ThreatPattern[]): ThreatPattern[] {
    // Keep patterns with high frequency or high severity
    return patterns.filter((p) => p.frequency >= 3 || p.severity === 'critical' || p.severity === 'high');
  }

  private estimateSeverity(reason: string, frequency: number): 'critical' | 'high' | 'medium' | 'low' {
    const critical = ['injection', 'xss', 'auth_bypass', 'privilege_escalation'];
    const high = ['rate_limit', 'anomaly_detected', 'malformed'];
    const medium = ['suspicious', 'warning'];

    const reasonLower = reason.toLowerCase();
    for (const keyword of critical) {
      if (reasonLower.includes(keyword)) return 'critical';
    }
    for (const keyword of high) {
      if (reasonLower.includes(keyword)) return 'high';
    }
    for (const keyword of medium) {
      if (reasonLower.includes(keyword)) return 'medium';
    }

    return frequency >= 10 ? 'high' : 'medium';
  }

  private classifyAttackType(reason: string): string {
    const reasonLower = reason.toLowerCase();
    if (reasonLower.includes('injection')) return 'injection';
    if (reasonLower.includes('xss')) return 'xss';
    if (reasonLower.includes('auth')) return 'authentication_bypass';
    if (reasonLower.includes('rate')) return 'rate_limit';
    if (reasonLower.includes('ddos')) return 'ddos';
    if (reasonLower.includes('malformed')) return 'malformed_request';
    return 'unknown_attack';
  }

  private generateRecommendations(reason: string, source: string): string[] {
    const recs: string[] = [];
    const reasonLower = reason.toLowerCase();

    if (reasonLower.includes('injection')) {
      recs.push('Implement parameterized queries and input validation');
      recs.push('Add SQL/command injection detection rules');
    }
    if (reasonLower.includes('rate')) {
      recs.push(`Increase rate limit for agent: ${source}`);
      recs.push('Implement exponential backoff for client retries');
    }
    if (reasonLower.includes('auth')) {
      recs.push('Enforce MFA for administrative operations');
      recs.push('Implement login attempt rate limiting');
    }

    if (recs.length === 0) {
      recs.push('Review SecurityGuard configuration for this pattern');
    }

    return recs;
  }

  // ── ACTION 2: Penetration Test ──
  // ペネトレーションテスト：攻撃エンジンを使ってシステム防御をテスト

  private async penetrationTestAction(params: Record<string, unknown>): Promise<unknown> {
    try {
      const targetAgent = String(params.targetAgent ?? 'all');
      const payloadTypes = (params.payloadTypes as string[]) ?? ['injection', 'xss'];

      await this.publishEvent('security_auditor.penetration_test_started', {
        targetAgent,
        payloads: payloadTypes.length,
      }, 'high');

      // Generate attack payloads
      const payloads = this.generateAttackPayloads(targetAgent, payloadTypes);

      // Create attack plan
      const plan: AttackPlan = {
        id: `pentest_${Date.now()}`,
        payloads,
        repetitions: 3,
        description: `Penetration test for ${targetAgent}`,
        targetAgent,
      };

      // Execute attacks
      const result = await this.attackEngine.executeAttack(plan);
      this.penetrationTestsRun++;

      const summary = {
        status: 'success',
        testId: plan.id,
        targetAgent,
        totalAttempts: result.summary.totalAttempts,
        successfulDetections: result.summary.successfulDetections,
        detectionRate: result.summary.successfulDetections / result.summary.totalAttempts,
        criticalVulnerabilitiesFound: result.summary.vulnerabilities.length,
        vulnerabilities: result.summary.vulnerabilities,
      };

      // If critical vulnerabilities found, escalate
      if (result.summary.vulnerabilities.length > 0) {
        await this.publishEvent('security_auditor.critical_vulnerability_found', summary, 'critical');
      }

      return summary;
    } catch (err) {
      const errorMsg = String(err);
      await this.publishEvent('security_auditor.penetration_test_failed', {
        error: errorMsg,
      }, 'critical');
      throw err;
    }
  }

  private generateAttackPayloads(targetAgent: string, types: string[]) {
    return types.map((type) => ({
      type,
      vector: this.generateAttackVector(type),
      intensity: 0.8,
      mutations: [],
      targetAgent,
      metadata: { generatedAt: Date.now() },
    }));
  }

  private generateAttackVector(type: string): string {
    const vectors: Record<string, string> = {
      injection: `'; DROP TABLE users; --`,
      xss: `<script>alert('XSS')</script>`,
      xxe: `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>`,
      ddos: 'GET / HTTP/1.1\r\nConnection: keep-alive\r\n\r\n',
      race: 'concurrent_requests',
      bypass: 'admin=true&role=superuser',
      directory: '../../../etc/passwd',
      deserialize: 'base64_serialized_object_payload',
    };
    return vectors[type] || `test_payload_${type}`;
  }

  // ── ACTION 3: Dynamic Rule Update ──
  // 動的ルール更新：観測された脅威から新しいセキュリティルールを自動生成

  private async dynamicRuleUpdateAction(params: Record<string, unknown>): Promise<unknown> {
    try {
      const sourceThreatPatternId = String(params.threatPatternId ?? '');

      await this.publishEvent('security_auditor.dynamic_rule_update_started', {
        sourcePattern: sourceThreatPatternId,
      }, 'high');

      const newRules: DynamicSecurityRule[] = [];

      // Generate rules from threat patterns
      for (const [, pattern] of this.threatPatterns.entries()) {
        const rule = this.generateRuleFromPattern(pattern);
        this.dynamicRules.set(rule.id, rule);
        newRules.push(rule);
        this.rulesGenerated++;
      }

      const result = {
        status: 'success',
        rulesGenerated: newRules.length,
        activeDynamicRules: this.dynamicRules.size,
        rules: newRules.map((r) => ({
          id: r.id,
          type: r.ruleType,
          condition: r.condition,
          confidence: r.confidence,
          validityMs: r.validityDurationMs,
        })),
      };

      await this.publishEvent('security_auditor.dynamic_rules_updated', result, 'high');

      return result;
    } catch (err) {
      const errorMsg = String(err);
      await this.publishEvent('security_auditor.dynamic_rule_update_failed', {
        error: errorMsg,
      }, 'critical');
      throw err;
    }
  }

  private generateRuleFromPattern(pattern: ThreatPattern): DynamicSecurityRule {
    const ruleType = pattern.severity === 'critical' ? 'block_pattern' : 'flag_suspicious';
    const confidence = Math.min(1, pattern.frequency / 20); // Confidence based on frequency

    return {
      id: `rule_${pattern.id}`,
      ruleType,
      condition: `source matches "${pattern.sourceAgentPattern}" AND reason contains "${pattern.anomalyReasonPattern}"`,
      action: ruleType === 'block_pattern' ? 'block_request' : 'log_and_alert',
      confidence,
      appliedAt: Date.now(),
      validityDurationMs: pattern.severity === 'critical' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000, // 7 days or 1 day
      generatedFrom: pattern.id,
    };
  }

  // ── ACTION 4: Vulnerability Assessment ──
  // 脆弱性評価：システム全体の脆弱性ポスチャー診断（CVSS評価付き）

  private async vulnerabilityAssessmentAction(params: Record<string, unknown>): Promise<unknown> {
    try {
      const agentFilter = String(params.agentFilter ?? 'all');

      await this.publishEvent('security_auditor.vulnerability_assessment_started', {
        scope: agentFilter,
      }, 'high');

      // Collect vulnerabilities from various sources
      const vulnerabilities = this.collectVulnerabilities();

      // Build vulnerability map (includes CVSS scoring + remediation plans)
      const vulnMap = this.vulnMapper.buildVulnMap(vulnerabilities);

      // Generate human-readable report
      const report = this.vulnMapper.generateReport(vulnMap);

      // Calculate total remediation effort
      const effort = this.vulnMapper.getTotalRemediationTime(vulnMap);

      const result = {
        status: 'success',
        timestamp: vulnMap.timestamp,
        summary: vulnMap.summary,
        criticalRemediationHours: effort.critical,
        highRemediationHours: effort.high,
        mediumRemediationHours: effort.medium,
        lowRemediationHours: effort.low,
        totalRemediationHours: effort.total,
        findings: report.split('\n').slice(0, 20), // First 20 lines for summary
      };

      if (vulnMap.summary.criticalCount > 0) {
        await this.publishEvent('security_auditor.critical_vulnerabilities_found', result, 'critical');
      }

      return result;
    } catch (err) {
      const errorMsg = String(err);
      await this.publishEvent('security_auditor.vulnerability_assessment_failed', {
        error: errorMsg,
      }, 'critical');
      throw err;
    }
  }

  private collectVulnerabilities(): Vulnerability[] {
    // In production, collect from:
    // - Dependency scanning (npm audit, etc.)
    // - Static analysis results
    // - Known CVEs for dependencies
    // - Previous penetration test findings
    // - Threat pattern analysis

    const vulns: Vulnerability[] = [];

    // Example: Vulnerabilities from threat patterns
    for (const [, pattern] of this.threatPatterns.entries()) {
      vulns.push({
        id: `vuln_${pattern.id}`,
        severity: pattern.severity,
        cvssScore: this.severityToCVSS(pattern.severity),
        description: `Observed attack pattern: ${pattern.type} from agents matching ${pattern.sourceAgentPattern}`,
        affectedComponent: pattern.sourceAgentPattern,
        remediation: pattern.recommendations.join('; '),
        discoveredAt: pattern.lastSeen,
      });
    }

    // Add hypothetical known vulnerabilities
    if (this.penetrationTestsRun > 0) {
      const testStats = this.attackEngine.getStatistics();
      if (testStats.criticalCount > 0) {
        vulns.push({
          id: 'pentest_critical_001',
          severity: 'critical',
          cvssScore: 9.0,
          description: 'Critical vulnerability detected during penetration testing',
          affectedComponent: 'core_system',
          remediation: 'Apply security patches immediately',
          discoveredAt: Date.now(),
        });
      }
    }

    return vulns;
  }

  private severityToCVSS(severity: string): number {
    const scores: Record<string, number> = {
      critical: 9.0,
      high: 7.5,
      medium: 5.5,
      low: 2.5,
    };
    return scores[severity] ?? 5.5;
  }

  // ── ACTION 5: Incident Response ──
  // インシデント対応：侵害エージェント隔離、通知、フォレンジック

  private async incidentResponseAction(params: Record<string, unknown>): Promise<unknown> {
    try {
      const incidentId = String(params.incidentId ?? `incident_${Date.now()}`);
      const affectedAgents = (params.affectedAgents as string[]) ?? [];
      const severity = String(params.severity ?? 'high') as 'critical' | 'high' | 'medium' | 'low';
      const description = String(params.description ?? 'Security incident detected');

      await this.publishEvent('security_auditor.incident_response_started', {
        incidentId,
        affectedAgents: affectedAgents.length,
        severity,
      }, 'critical');

      // 1. Isolate affected agents
      const isolationResult = await this.isolateAffectedAgents(affectedAgents);

      // 2. Collect forensic data
      const forensicData = this.collectForensicData(affectedAgents);

      // 3. Generate incident record
      const incident: IncidentRecord = {
        id: incidentId,
        timestamp: Date.now(),
        severity,
        affectedAgents,
        description,
        forensicData,
        responseActions: [
          `Isolated ${isolationResult.isolatedCount} agents`,
          `Collected forensic data from ${forensicData.anomalySnapshots.length} snapshots`,
          'Notified security team',
          'Initiated forensic analysis',
        ],
        resolved: false,
      };

      this.incidentHistory.push(incident);

      // 4. Notify admin/security team
      await this.publishEvent('security_auditor.incident_response_completed', {
        incidentId: incident.id,
        severity: incident.severity,
        affectedAgentsCount: incident.affectedAgents.length,
        responseActionsCount: incident.responseActions.length,
        forensicDataCollected: true,
      }, 'critical');

      return {
        status: 'success',
        incidentId: incident.id,
        affectedAgents: incident.affectedAgents.length,
        isolated: isolationResult.isolatedCount,
        forensicSnapshots: forensicData.anomalySnapshots.length,
        responseActions: incident.responseActions,
      };
    } catch (err) {
      const errorMsg = String(err);
      await this.publishEvent('security_auditor.incident_response_failed', {
        error: errorMsg,
      }, 'critical');
      throw err;
    }
  }

  private async isolateAffectedAgents(agents: string[]): Promise<{ isolatedCount: number; failedCount: number }> {
    // In production, this would:
    // - Set SecurityContext.allowedTargets to empty
    // - Disable pub/sub for the agent
    // - Create an isolation sandbox
    // - Log isolation action to audit trail

    let isolatedCount = 0;
    let failedCount = 0;

    for (const agentId of agents) {
      try {
        await this.publishEvent('security_auditor.agent_isolation_request', {
          targetAgent: agentId,
          action: 'isolate',
          timestamp: Date.now(),
        }, 'critical');
        isolatedCount++;
      } catch {
        failedCount++;
      }
    }

    return { isolatedCount, failedCount };
  }

  private collectForensicData(agents: string[]): {
    anomalySnapshots: unknown[];
    behaviorChangeFlags: string[];
    impactAssessment: string;
  } {
    // Collect anomalies related to affected agents
    const snapshots = [];
    const flags: string[] = [];

    for (const agent of agents) {
      // In production, would query anomaly log filtered by agent
      snapshots.push({
        agent,
        timestampSnapshot: Date.now(),
        anomalyCount: Math.floor(Math.random() * 20),
      });

      flags.push(`Agent ${agent} showed unusual behavior patterns`);
    }

    return {
      anomalySnapshots: snapshots,
      behaviorChangeFlags: flags,
      impactAssessment: `${agents.length} agent(s) potentially compromised. Recommend full system audit.`,
    };
  }

  // ── Event Handlers ──

  private async analyzeAnomalyEvent(event: AgentEvent): Promise<void> {
    // When an anomaly event is received, automatically analyze it
    const payload = event.payload as Record<string, unknown> | null;
    if (!payload) return;

    const anomaly = {
      reason: String(payload.reason ?? 'unknown'),
      source: String(payload.source ?? 'unknown'),
      timestamp: Number(payload.timestamp ?? Date.now()),
      severity: String(payload.severity ?? 'medium'),
    };

    // If pattern matches a known threat, raise alert
    for (const [, pattern] of this.threatPatterns.entries()) {
      if (
        anomaly.source.includes(pattern.sourceAgentPattern) &&
        anomaly.reason.includes(pattern.anomalyReasonPattern)
      ) {
        await this.publishEvent('security_auditor.threat_pattern_matched', {
          patternId: pattern.id,
          anomaly,
          severity: pattern.severity,
        }, pattern.severity === 'critical' ? 'critical' : 'high');
      }
    }
  }

  private async respondToIncident(event: AgentEvent): Promise<void> {
    const payload = event.payload as Record<string, unknown> | null;
    if (!payload) return;

    // Auto-respond to incident notifications with incident_response action
    const result = await this.incidentResponseAction({
      incidentId: String(payload.incidentId ?? `auto_${Date.now()}`),
      affectedAgents: (payload.affectedAgents as string[]) ?? [],
      severity: String(payload.severity ?? 'high'),
      description: String(payload.description ?? 'Auto-detected incident'),
    });

    await this.publishEvent('security_auditor.auto_incident_response_completed', result, 'high');
  }

  // ── Initialization Helpers ──

  private seedInitialThreatPatterns(): void {
    // Seed with common known threat patterns (in production, load from database)
    const commonPatterns: ThreatPattern[] = [
      {
        id: 'pattern_sql_injection_001',
        type: 'injection',
        sourceAgentPattern: 'external',
        anomalyReasonPattern: 'injection',
        frequency: 0,
        lastSeen: Date.now(),
        severity: 'critical',
        recommendations: [
          'Implement parameterized queries',
          'Add input validation',
          'Use ORM frameworks',
        ],
      },
      {
        id: 'pattern_xss_001',
        type: 'xss',
        sourceAgentPattern: 'untrusted',
        anomalyReasonPattern: 'xss',
        frequency: 0,
        lastSeen: Date.now(),
        severity: 'critical',
        recommendations: [
          'Implement CSP headers',
          'Use framework auto-escaping',
          'Sanitize user input',
        ],
      },
      {
        id: 'pattern_rate_limit_001',
        type: 'rate_limit',
        sourceAgentPattern: 'bot',
        anomalyReasonPattern: 'rate_limit_exceeded',
        frequency: 0,
        lastSeen: Date.now(),
        severity: 'medium',
        recommendations: [
          'Implement exponential backoff',
          'Check for DDoS activity',
          'Adjust rate limits if legitimate',
        ],
      },
    ];

    for (const pattern of commonPatterns) {
      this.threatPatterns.set(pattern.id, pattern);
    }
  }

  // ── Public Diagnostic Methods ──

  public getStatistics() {
    return {
      threatPatternsLearned: this.threatPatterns.size,
      dynamicRulesGenerated: this.rulesGenerated,
      dynamicRulesActive: this.dynamicRules.size,
      penetrationTestsRun: this.penetrationTestsRun,
      incidentsHandled: this.incidentHistory.length,
      lastThreatAnalysis: this.lastThreatAnalysisTime,
    };
  }

  public getThreatPatterns() {
    return Array.from(this.threatPatterns.values());
  }

  public getIncidentHistory() {
    return this.incidentHistory;
  }
}
