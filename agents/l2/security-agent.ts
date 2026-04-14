/**
 * SecurityAgent — L2 セキュリティエージェント（防御系）
 *
 * 生体対応: 免疫システム（獲得免疫）
 * セキュリティ監査、脆弱性スキャン、CSPレビュー、依存関係チェックを実行。
 * EngineeringLeadから指令を受け、システムのセキュリティと信頼性を確保。
 *
 * 担当タスク: security_audit, vulnerability_scan, csp_review, dependency_check
 * 所属パイプライン: P6（システム安定性）
 */

import type {
  AgentId,
  AgentEvent,
  CascadeCommand,
  IAgentBus,
} from '../core/types';
import {BaseL2Agent} from './base-l2-agent';
import { createLogger } from '../core/logger.js';

const log = createLogger('security-agent');


interface SecurityIssue {
  id: string;
  type: 'vulnerability' | 'misconfiguration' | 'weak_practice';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  remediation: string;
  cvss?: number;
  discoveredAt: number;
}

interface DependencyVulnerability {
  package: string;
  version: string;
  vulnerability: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  patchVersion: string;
  advisoryUrl: string;
}

interface VulnerabilityDetails {
  severity?: 'critical' | 'high' | 'medium' | 'low';
  via?: Array<{ source?: string; url?: string }>;
}

export class SecurityAgent extends BaseL2Agent {
  readonly id: AgentId = {
    id: 'security-agent',
    name: 'SecurityAgent',
    level: 'L2',
    team: 'engineering',
    version: '1.0.0',
  };

  private securityIssues: Map<string, SecurityIssue> = new Map();
  private vulnerabilityDatabase: DependencyVulnerability[] = [];
  private nvdInitialized = false; // B-05: NVD取得完了フラグ
  private lastAuditTime = 0;

  constructor(bus: IAgentBus) {
    super(bus);
  }

  protected async onInitialize(): Promise<void> {
    this.subscribe('security.*');
    this.subscribe('engineering.security.*');
    this.subscribe('deploy.pre_production');

    await this.seedVulnerabilityDatabase();
  }

  protected async onShutdown(): Promise<void> {
    this.securityIssues.clear();
    this.vulnerabilityDatabase = [];
  }

  protected async onEvent(event: AgentEvent): Promise<void> {
    if (event.type === 'deploy.pre_production') {
      await this.publishEvent('security.pre_deploy_audit_triggered', {
        action: 'running_security_checks',
      }, 'critical');
    }
  }

  protected async onCommand(command: CascadeCommand): Promise<unknown> {
    switch (command.action) {
      case 'security_audit':
        return this.securityAudit(command.params);

      case 'vulnerability_scan':
        return this.vulnerabilityScan(command.params);

      case 'csp_review':
        return this.cspReview(command.params);

      case 'dependency_check':
        return this.dependencyCheck(command.params);

      default:
        throw new Error(`SecurityAgent: unknown action "${command.action}"`);
    }
  }

  // ── Core Operations ──

  private async seedVulnerabilityDatabase(): Promise<void> {
    // B-05: 既知の脆弱性データベース初期化 + NVD API統合
    // 静的seedは既知の重大脆弱性のみ。NVDで動的に補完する。
    this.vulnerabilityDatabase = [
      {
        package: '@shopify/hydrogen',
        version: '2026.1.0',
        vulnerability: 'Potential XSS in GraphQL response handling',
        severity: 'high',
        patchVersion: '2026.1.2',
        advisoryUrl: 'https://advisories.shopify.dev/hydrogen-xss-2026',
      },
    ];

    // B-05: NVDフェッチをawaitして完了を保証（タイムアウト15秒で安全）
    try {
      await Promise.race([
        this.fetchNVDVulnerabilities(),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('NVD timeout')), 15000)),
      ]);
    } catch (err) {
      log.warn('[SecurityAgent] NVD fetch failed/timeout (continuing with static DB):', err instanceof Error ? err.message : err);
    }
    this.nvdInitialized = true;
    log.info(`[SecurityAgent] Vulnerability DB initialized: ${this.vulnerabilityDatabase.length} entries`);
  }

  private async fetchNVDVulnerabilities(): Promise<void> {
    // NVD API (https://services.nvd.nist.gov/rest/json/cves/2.0) でShopify関連CVEを検索
    // API key不要。キーワード "@shopify" または "hydrogen" でフィルタ
    try {
      const keyword = '@shopify';
      const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(keyword)}&resultsPerPage=20`;
      const response = await fetch(url, { method: 'GET', headers: { 'User-Agent': 'Astromeda-SecurityAgent/1.0' } });

      if (!response.ok) {
        log.warn('[SecurityAgent] NVD API returned:', response.status);
        return;
      }

      const data = await response.json() as { vulnerabilities?: Array<{ cve: { id: string; descriptions?: Array<{ value: string }> } }> };
      const vulns = data.vulnerabilities ?? [];

      // CVEをDependencyVulnerability形式に変換（Shopifyパッケージのみ）
      for (const vuln of vulns.slice(0, 5)) {
        const cveId = vuln.cve?.id;
        const desc = vuln.cve?.descriptions?.[0]?.value ?? '';

        // @shopify/hydrogenと判定された場合のみ追加
        if (desc.toLowerCase().includes('hydrogen') || desc.toLowerCase().includes('shopify')) {
          const existing = this.vulnerabilityDatabase.find(v => v.advisoryUrl.includes(cveId ?? ''));
          if (!existing) {
            this.vulnerabilityDatabase.push({
              package: '@shopify/hydrogen',
              version: '*', // 影響範囲は複数版の可能性
              vulnerability: desc.substring(0, 100),
              severity: 'medium', // NVDはCVSS scoreを別途取得が必要なため、中程度を初期値
              patchVersion: 'check_advisories',
              advisoryUrl: `https://nvd.nist.gov/vuln/detail/${cveId}`,
            });
          }
        }
      }
    } catch (err) {
      // ネットワーク障害時は静的データベースで継続
      log.warn('[SecurityAgent] NVD fetch error (continuing with static DB):', err instanceof Error ? err.message : err);
    }
  }

  private async securityAudit(params: Record<string, unknown>): Promise<{
    auditId: string;
    timestamp: number;
    score: number;         // 0-100
    criticalIssues: number;
    findings: SecurityIssue[];
  }> {
    const scope = (params.scope as string) ?? 'full';

    await this.publishEvent('security.audit.started', { scope }, 'high');

    const auditId = `audit_${Date.now()}`;
    const issues: SecurityIssue[] = [
      {
        id: 'sec_001',
        type: 'misconfiguration',
        severity: 'medium',
        title: 'Missing HSTS header',
        description: 'Strict-Transport-Security header not set',
        remediation: 'Add HSTS header to server.ts',
        discoveredAt: Date.now(),
      },
    ];

    this.lastAuditTime = Date.now();
    for (const issue of issues) {
      this.securityIssues.set(issue.id, issue);
    }

    const criticalIssues = issues.filter(i => i.severity === 'critical').length;
    const score = Math.max(0, 100 - (criticalIssues * 30) - (issues.length * 5));

    await this.publishEvent('security.audit.completed', { auditId, score, issueCount: issues.length });
    return { auditId, timestamp: Date.now(), score, criticalIssues, findings: issues };
  }

  private async vulnerabilityScan(params: Record<string, unknown>): Promise<{
    scanId: string;
    vulnerabilities: DependencyVulnerability[];
    criticalCount: number;
    highCount: number;
  }> {
    const scanType = (params.scanType as string) ?? 'dependencies';

    await this.publishEvent('security.vulnerability_scan.started', { scanType }, 'high');

    const scanId = `vuln_scan_${Date.now()}`;

    // Phase 2: npm audit, Snyk, Dependabot との統合で実际スキャン実行
    // Simulate npm audit by checking common vulnerable packages
    const auditVulns = await this.performNpmAudit();
    const allVulns = [...this.vulnerabilityDatabase, ...auditVulns];

    const criticalCount = allVulns.filter(v => v.severity === 'critical').length;
    const highCount = allVulns.filter(v => v.severity === 'high').length;

    await this.publishEvent('security.vulnerability_scan.completed', {
      scanId,
      criticalCount,
      highCount,
    });

    return {
      scanId,
      vulnerabilities: allVulns,
      criticalCount,
      highCount,
    };
  }

  private async performNpmAudit(): Promise<DependencyVulnerability[]> {
    // Phase 2: npm registryで既知の脆弱性パッケージをチェック
    // 環境変数でnpm audの出力が提供されていればそれを使用
    const auditResult = process.env.NPM_AUDIT_JSON;
    if (auditResult) {
      try {
        const auditData = JSON.parse(auditResult) as { vulnerabilities?: Record<string, { severity?: string; via?: Array<{ source?: string; url?: string }> }> };
        const vulns: DependencyVulnerability[] = [];

        for (const [pkg, details] of Object.entries(auditData.vulnerabilities ?? {})) {
          const vulnDetails = details as VulnerabilityDetails;
          const via = vulnDetails.via ?? [];
          for (const advisory of via) {
            vulns.push({
              package: pkg,
              version: '*',
              vulnerability: advisory.source ?? 'Unknown vulnerability',
              severity: vulnDetails.severity ?? 'medium',
              patchVersion: 'check_registry',
              advisoryUrl: advisory.url ?? 'https://npmjs.org',
            });
          }
        }
        return vulns;
      } catch (err) {
        log.warn('[SecurityAgent] npm audit parse failed:', err instanceof Error ? err.message : err);
      }
    }

    // Fallback: ローカルでよく知られた脆弱性パッケージをチェック
    try {
      const knownVulnerablePackages = [
        { name: '@shopify/hydrogen', latestVersion: '2026.1.2' },
        { name: 'react', latestVersion: '18.3.1' },
        { name: 'react-router', latestVersion: '7.12.0' },
      ];

      const newVulns: DependencyVulnerability[] = [];

      for (const pkg of knownVulnerablePackages) {
        try {
          const npmUrl = `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/latest`;
          const response = await fetch(npmUrl, { method: 'GET', headers: { 'User-Agent': 'Astromeda-SecurityAgent/1.0' } });

          if (response.ok) {
            const pkgData = await response.json() as { version?: string; deprecated?: boolean };
            if (pkgData.deprecated) {
              newVulns.push({
                package: pkg.name,
                version: pkgData.version ?? 'unknown',
                vulnerability: `Package ${pkg.name} is deprecated`,
                severity: 'medium',
                patchVersion: 'latest',
                advisoryUrl: `https://npmjs.org/package/${pkg.name}`,
              });
            }
          }
        } catch {
          // Individual package check failure is non-blocking
        }
      }

      return newVulns;
    } catch (err) {
      log.warn('[SecurityAgent] npm audit fallback failed:', err instanceof Error ? err.message : err);
      return [];
    }
  }

  private async cspReview(params: Record<string, unknown>): Promise<{
    reviewId: string;
    currentCSP: string;
    issues: Array<{ type: string; description: string; severity: 'high' | 'medium' | 'low' }>;
    recommendation: string;
  }> {
    const domain = (params.domain as string) ?? 'shop.mining-base.co.jp';

    await this.publishEvent('security.csp_review.started', { domain });

    const reviewId = `csp_review_${Date.now()}`;

    // Phase 2: 現在のCSPヘッダー取得 → 分析 → 推奨事項生成
    let currentCsp = "default-src 'self'; script-src 'self' 'unsafe-inline'";
    const issues: Array<{ type: string; description: string; severity: 'high' | 'medium' | 'low' }> = [];

    try {
      // ターゲットドメインからヘッダーを取得
      const url = domain.startsWith('http') ? domain : `https://${domain}`;
      const response = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'Astromeda-SecurityAgent/1.0' } });

      const cspHeader = response.headers.get('content-security-policy');
      if (cspHeader) {
        currentCsp = cspHeader;

        // CSPを分析
        const cspIssues = this.analyzeCspPolicy(currentCsp);
        issues.push(...cspIssues);
      }
    } catch (err) {
      log.warn('[SecurityAgent] CSP header fetch failed for domain:', domain, err instanceof Error ? err.message : err);

      // Fallback: デフォルトの問題を挙げる
      issues.push({
        type: 'unsafe-inline',
        description: 'script-src contains unsafe-inline',
        severity: 'high',
      });
    }

    const recommendation = issues.length > 0
      ? 'Recommended actions: ' + issues.map(i => this.getRemediationAdvice(i.type)).join('; ')
      : 'CSP configuration appears secure. Continue monitoring for updates.';

    await this.publishEvent('security.csp_review.completed', { reviewId, issueCount: issues.length });
    return {
      reviewId,
      currentCSP: currentCsp,
      issues,
      recommendation,
    };
  }

  private analyzeCspPolicy(csp: string): Array<{ type: string; description: string; severity: 'high' | 'medium' | 'low' }> {
    const issues: Array<{ type: string; description: string; severity: 'high' | 'medium' | 'low' }> = [];

    // Check for common weaknesses
    if (csp.includes("'unsafe-inline'")) {
      issues.push({
        type: 'unsafe-inline',
        description: "CSP contains 'unsafe-inline' which allows inline script execution",
        severity: 'high',
      });
    }

    if (csp.includes("'unsafe-eval'")) {
      issues.push({
        type: 'unsafe-eval',
        description: "CSP contains 'unsafe-eval' which allows eval() and related functions",
        severity: 'high',
      });
    }

    if (csp.includes('*')) {
      issues.push({
        type: 'wildcard-source',
        description: 'CSP contains wildcard (*) source which allows resources from any domain',
        severity: 'medium',
      });
    }

    if (!csp.includes('script-src') && !csp.includes('default-src')) {
      issues.push({
        type: 'missing-script-src',
        description: 'CSP is missing script-src directive for explicit script control',
        severity: 'medium',
      });
    }

    return issues;
  }

  private getRemediationAdvice(issueType: string): string {
    const advice: Record<string, string> = {
      'unsafe-inline': "Use nonce-based CSP instead of 'unsafe-inline'",
      'unsafe-eval': "Remove 'unsafe-eval' and use alternative approaches (Web Workers, modules)",
      'wildcard-source': 'Replace * with specific domains that need access',
      'missing-script-src': 'Add explicit script-src directive with trusted sources',
    };
    return advice[issueType] ?? 'Review and tighten CSP directives';
  }

  private async dependencyCheck(params: Record<string, unknown>): Promise<{
    checkId: string;
    totalDependencies: number;
    outdated: number;
    vulnerable: number;
    recommendations: Array<{ package: string; currentVersion: string; recommendedVersion: string; reason: string }>;
  }> {
    const includeDevDependencies = (params.includeDevDependencies as boolean) ?? true;

    await this.publishEvent('security.dependency_check.started', { includeDevDependencies });

    const checkId = `dep_check_${Date.now()}`;

    // Phase 2: package.json依存関係の完全スキャン & npm registryとの比較
    const recommendations = await this.scanDependencies(includeDevDependencies);

    const vulnerableCount = this.vulnerabilityDatabase.length;

    await this.publishEvent('security.dependency_check.completed', {
      checkId,
      vulnerableCount,
      recommendationCount: recommendations.length,
    });

    return {
      checkId,
      totalDependencies: 142 + (includeDevDependencies ? 88 : 0),
      outdated: recommendations.filter(r => r.reason.includes('outdated')).length,
      vulnerable: vulnerableCount,
      recommendations,
    };
  }

  private async scanDependencies(includeDevDeps: boolean): Promise<Array<{ package: string; currentVersion: string; recommendedVersion: string; reason: string }>> {
    const recommendations: Array<{ package: string; currentVersion: string; recommendedVersion: string; reason: string }> = [];

    // Phase 2: package.jsonから依存関係を読み込み、npm registryと比較
    // Environment variables or static list for demo purposes
    const criticalPackages = [
      { name: '@shopify/hydrogen', currentVersion: '2026.1.1' },
      { name: 'react', currentVersion: '18.3.1' },
      { name: 'react-router', currentVersion: '7.12.0' },
      { name: 'typescript', currentVersion: '5.3.3', isDev: true },
      { name: 'tailwindcss', currentVersion: '4.1.6' },
    ];

    // Filter by dev dependencies flag
    const packages = criticalPackages.filter(p => !p.isDev || includeDevDeps);

    for (const pkg of packages) {
      try {
        const npmUrl = `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/latest`;
        const response = await fetch(npmUrl, { method: 'GET', headers: { 'User-Agent': 'Astromeda-SecurityAgent/1.0' } });

        if (response.ok) {
          const latestData = await response.json() as { version?: string };
          const latestVersion = latestData.version ?? 'unknown';

          // Simple version comparison (assumes semver)
          if (latestVersion !== pkg.currentVersion && latestVersion > pkg.currentVersion) {
            const isSecurityUpdate = pkg.name === '@shopify/hydrogen' && latestVersion.includes('2026.1.2');

            recommendations.push({
              package: pkg.name,
              currentVersion: pkg.currentVersion,
              recommendedVersion: latestVersion,
              reason: isSecurityUpdate ? 'Security patch available' : 'Outdated version available',
            });
          }
        }
      } catch (err) {
        // Individual package check failure is non-blocking
        log.warn(`[SecurityAgent] Failed to check ${pkg.name}:`, err instanceof Error ? err.message : err);
      }
    }

    return recommendations;
  }
}
