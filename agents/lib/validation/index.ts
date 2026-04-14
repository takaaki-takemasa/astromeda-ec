/**
 * Validation Library — Public API
 * Phase 7 (免疫検査機構 = Immunity Inspection System)
 *
 * Exports all validation/test harness modules
 */

// Types
export type {
  TestScenario,
  RoundResult,
  GoNoGoReport,
  AttackPayload,
  Vulnerability,
  VulnMap,
  TestPhase,
  SandboxConfig,
  SandboxBaseline,
  TestContext,
} from './types';

// Statistical functions
export {
  tTest,
  cohenD,
  confidenceInterval,
  coefficientOfVariation,
  cusum,
  descriptiveStats,
} from './statistical-engine';

// Round executor
export { RoundExecutor } from './round-executor';
export type { RoundExecutorConfig } from './round-executor';

// Sandbox manager
export { SandboxManager } from './sandbox-manager';
export type { SandboxState } from './sandbox-manager';

// Attack engine
export { AttackEngine } from './attack-engine';
export type { AttackPlan, AttackResult } from './attack-engine';

// Vulnerability mapper
export { VulnerabilityMapper } from './vulnerability-mapper';
export type { CVSSMetrics } from './vulnerability-mapper';
