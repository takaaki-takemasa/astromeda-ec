/**
 * Astromeda Agent Core — Unified Module Exports (T107-T108)
 *
 * Central barrel export for all core agent system modules.
 * Simplifies imports across the agent ecosystem.
 *
 * Usage:
 *   import { createAgent, AgentBus } from '~/agents/core';
 */

// Type definitions
export type {
  AgentEvent,
  AgentStatus,
  AgentConfig,
  CascadeCommand,
  EventPayload,
  CommandParams,
  AgentLevel,
  AgentTeam,
} from './types';

export {
  EventPayloadSchema,
  CommandParamsSchema,
  AgentEventSchema,
} from './types';

// Core modules (export only if they exist)
// These are examples - adjust paths based on actual structure
// export { AgentBus } from './agent-bus';
// export { AIBrain } from './ai-brain';
// export { AIRouter } from './ai-router';
// export { CircuitBreaker } from './circuit-breaker';
// export { NotificationBus } from './notification-bus';
// export { CSRFGuard } from './csrf-guard';
// export { KVStorage } from './kv-storage';

// Utilities
// export { validatePayload } from './validation-utils';
// export { createAgentId } from './id-utils';

// Re-export common utilities
export { useViewportSize } from '../../lib/admin-mobile';
