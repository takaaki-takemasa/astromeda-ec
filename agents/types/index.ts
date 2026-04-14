/**
 * Astromeda Agents — Unified Type Exports (T107-T108)
 *
 * Central barrel export for all shared type definitions
 * across the agent system. Eliminates scattered imports.
 *
 * Usage:
 *   import type { AgentEvent, CommandParams, TestScenario } from '~/agents/types';
 */

// Core types (agents/core/types.ts)
export type {
  AgentEvent,
  AgentStatus,
  AgentConfig,
  CascadeCommand,
  EventPayload,
  CommandParams,
  AgentLevel,
  AgentTeam,
} from '../core/types';

export {
  EventPayloadSchema,
  CommandParamsSchema,
  AgentEventSchema,
} from '../core/types';

// Validation types (agents/lib/validation/types.ts)
export type {
  TestScenario,
  RoundResult,
  GoNoGoReport,
} from '../lib/validation/types';

// Admin UI types (if they exist in a central location)
// export type { ... } from '../lib/admin-types';

// Add more type exports as the system grows
// Example: export type { ... } from '../providers/types';
// Example: export type { ... } from '../pipelines/types';
