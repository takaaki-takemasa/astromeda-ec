/**
 * Validation Library — Types (Phase 7, G-034)
 *
 * Core types for the validation/test harness system
 * (免疫検査機構 = Immunity Inspection System)
 */

/**
 * Test scenario configuration
 */
export interface TestScenario {
  /** Unique scenario identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Detailed description */
  description: string;
  /** Test parameters (varies by scenario) */
  params: Record<string, unknown>;
  /** Expected outcome or assertion */
  expectedOutcome: Record<string, unknown>;
  /** Timeout in milliseconds */
  timeout: number;
  /** Optional metadata tags */
  tags?: string[];
}

/**
 * Result of a single round of testing
 */
export interface RoundResult {
  /** Round number (1, 2, 3, ...) */
  roundNum: number;
  /** Number of trials in this round */
  trials: number;
  /** Metrics collected (e.g., latency, throughput, error rate) */
  metrics: Map<string, number>;
  /** Coefficient of Variation for convergence check */
  convergenceCV: number;
  /** Whether this round passed convergence criteria */
  passed: boolean;
  /** Timestamp */
  timestamp: number;
}

/**
 * Go/No-Go decision report
 */
export interface GoNoGoReport {
  /** Final decision */
  decision: 'go' | 'no-go' | 'conditional';
  /** Confidence level (0-1) */
  confidence: number;
  /** Evidence supporting the decision */
  evidence: {
    converged: boolean;
    metricsHealthy: boolean;
    noNewVulnerabilities: boolean;
    testCoverageAdequate: boolean;
  };
  /** Known risks (even if decision is 'go') */
  risks: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    mitigation: string;
  }>;
  /** Recommendations for improvement */
  recommendations: string[];
  /** Detailed findings */
  findings: string[];
  /** Timestamp */
  timestamp: number;
}

/**
 * Attack/mutation payload for security testing
 */
export interface AttackPayload {
  /** Attack type (e.g., 'injection', 'xss', 'ddos') */
  type: string;
  /** Attack vector (specific target) */
  vector: string;
  /** Intensity (0-1, where 1 is max severity) */
  intensity: number;
  /** Payload mutations to generate */
  mutations: string[];
  /** Target agent ID */
  targetAgent: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Vulnerability record
 */
export interface Vulnerability {
  /** Unique vulnerability identifier */
  id: string;
  /** CVSS severity level */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** CVSS v4.0 score (0-10) */
  cvssScore: number;
  /** Description */
  description: string;
  /** Affected component */
  affectedComponent: string;
  /** Remediation steps */
  remediation: string;
  /** Discovery date */
  discoveredAt: number;
  /** Fixed date (if null, still open) */
  fixedAt?: number;
}

/**
 * Vulnerability map with summary and remediation plan
 */
export interface VulnMap {
  /** All vulnerabilities found */
  vulnerabilities: Vulnerability[];
  /** Summary statistics */
  summary: {
    totalCount: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    maxCVSSScore: number;
  };
  /** Prioritized remediation plan */
  remediationPlan: Array<{
    priority: number;
    vulnerabilityId: string;
    estimatedEffort: 'low' | 'medium' | 'high';
    estimatedTimeMs: number;
  }>;
  /** Report timestamp */
  timestamp: number;
}

/**
 * Test phase configuration
 */
export interface TestPhase {
  /** Phase identifier */
  id: string;
  /** Number of trials for this phase */
  trials: number;
  /** Parameter variation strategy */
  variationStrategy: 'none' | 'linear' | 'exponential' | 'random';
  /** Convergence threshold (CV <= this value) */
  convergenceThreshold: number;
  /** Description of what this phase tests */
  description: string;
}

/**
 * Sandbox configuration
 */
export interface SandboxConfig {
  /** Sandbox identifier */
  id: string;
  /** Memory limit in MB */
  memoryLimitMb: number;
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Enable isolation (processes cannot communicate) */
  isolate: boolean;
  /** Baseline metrics to capture */
  captureBaseline: boolean;
}

/**
 * Sandbox baseline metrics
 */
export interface SandboxBaseline {
  /** Baseline ID */
  id: string;
  /** CPU usage (%) */
  cpuUsage: number;
  /** Memory usage (MB) */
  memoryUsage: number;
  /** Latency (ms) */
  latency: number;
  /** Error rate (0-1) */
  errorRate: number;
  /** Throughput (ops/sec) */
  throughput: number;
  /** Captured at timestamp */
  capturedAt: number;
}

/**
 * Test execution context
 */
export interface TestContext {
  /** Unique execution ID */
  executionId: string;
  /** Test scenario being executed */
  scenario: TestScenario;
  /** Current round number */
  roundNum: number;
  /** Total rounds planned */
  totalRounds: number;
  /** Collected metrics so far */
  collectedMetrics: Map<string, number[]>;
  /** Sandbox baseline (if applicable) */
  baseline?: SandboxBaseline;
  /** Start timestamp */
  startedAt: number;
}
