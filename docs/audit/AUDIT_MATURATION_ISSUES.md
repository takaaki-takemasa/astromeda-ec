# Astromeda Agent System — Maturation Order Audit Report

**Audit Date:** 2026-04-07
**Status:** RESEARCH ONLY - No files edited
**Focus:** Birth defects in initialization sequence and agent interconnection

---

## Executive Summary

The agent system has **6 CRITICAL issues** that prevent full maturation to "19+ agents connected to AI Brain" state. These are structural (initialization order) problems, not operational bugs. Most originate from incomplete infrastructure wiring during Phase 1 construction.

---

## Issue A: Blueprint Mismatch (障害#3) — CRITICAL

### Current State
- **13 L2 agents have dedicated blueprints** (created at registration lines 318-482)
  - image-generator, product-catalog, ux-agent, content-writer, seo-director, quality-auditor, agent-factory
  - Plus 7 blueprint stubs: pricing-agent through support-agent

- **10 L2 agents use FALLBACK GENERIC BLUEPRINTS** (registration lines 631-671)
  - PricingAgent, PromotionAgent, ConversionAgent
  - DevOpsAgent, SecurityAgent, PerformanceAgent
  - DataAnalyst, ABTestAgent, InsightAgent
  - SupportAgent

### The Problem
When agent registration encounters a missing blueprint, it falls back to `createGenericBlueprint()` (line 139-149):

```typescript
function createGenericBlueprint(id: string, team: string, capabilities: string[]): AgentBlueprint {
  return {
    id,
    agentType: 'L2-Worker',
    version: '1.0.0',
    config: { team },
    capabilities,  // ← Only 2-3 generic capabilities!
    dependencies: [`${team}-lead`],
    healthCheck: { interval: 30000, timeout: 5000, unhealthyThreshold: 3 },
  };
}
```

**This blueprint is missing critical configuration fields present in dedicated blueprints:**
- DevOpsAgent lacks `deploymentConfig`, `environmentVariables`, `buildConfig`
- SecurityAgent lacks `scanRules`, `policyConfig`, `reportingThresholds`
- DataAnalyst lacks `analysisConfig`, `metricsConfig`, `reportingSchedule`
- SupportAgent lacks `ticketConfig`, `escalationRules`, `faqConfig`

### Why It Matters
Agents initialize with incomplete capability declarations. When AI Brain tries to invoke specialized functions (e.g., "run security scan" for SecurityAgent), the blueprint says capabilities: `['security_audit']` but provides zero configuration for HOW to audit or WHAT to check.

**File References:**
- agent-registration.ts:139-149 (createGenericBlueprint)
- agent-registration.ts:631-671 (fallback usage)

### Expected State
All 17 L2 agents (13 Product/Marketing/Quality + 4 Sales + 3 Engineering + 3 Data + 1 Support) should have DOMAIN-SPECIFIC blueprints with:
- Full `config` object matching agent's real capabilities
- Correct `capabilities` array (not placeholder text)
- Team-specific `healthCheck` intervals
- Documented `dependencies` chain

### Fix Approach
**MEDIUM effort, requires NEW code:**
1. Add blueprint definitions for all 10 agents (pricing-agent through support-agent) to `createAgentBlueprints()` Map
2. Each blueprint must match the agent's actual `protected onCommand()` methods
3. Move generic fallback out of registration path (delete lines 631-671 fallback operators `||`)

### Test Requirements
- ✓ Blueprint introspection test (verify no agent uses generic blueprint)
- ✓ Capability coverage test (each agent's `capabilities[]` must contain actions its `onCommand()` handles)
- ✓ Dependency resolution test (all dependencies in blueprint must be registered agents)

---

## Issue B: Webhook→Pipeline Trigger Gap (障害#1) — HIGH

### Current State

**Webhook publishes these events** (api.webhook.orders.ts:95-109):
```typescript
type: `webhook.${(meta.topic ?? 'orders/create').replace('/', '.')}`
// Produces: webhook.orders.create, webhook.orders.updated, webhook.orders.paid, webhook.orders.cancelled
```

**Pipeline triggerEvent patterns** (pipeline-definitions.ts):
- P01: `trigger: { type: 'manual' }` — no event
- P02: `trigger: { type: 'schedule', cron: '0 2 * * *' }` — no event
- P03: `trigger: { type: 'event', eventType: 'content.requested' }`
- P04: `trigger: { type: 'schedule' }` — no event
- P05: `trigger: { type: 'schedule' }` — no event
- P06: `trigger: { type: 'schedule' }` — no event
- P07-P16: Mix of `schedule`, `manual`, `event`
- **P13 (Data Analysis): trigger `type: 'schedule'`** — Should listen for `webhook.orders.*` but doesn't
- **P16 (Support): trigger `eventType: 'support.ticket.created'`** — Correct pattern but no webhook publishes this

### The Problem
**Webhook events are published but NO PIPELINE LISTENS TO THEM.**

When an order is placed:
1. Shopify sends webhook → `api.webhook.orders`
2. Code publishes `webhook.orders.paid` to AgentBus ✓
3. **NO PIPELINE has `eventType: 'webhook.orders.*'`** ✗
4. Event enters DeadLetterQueue (eventLog shows "undelivered")

Result: Revenue/Attribution/Data Analysis pipelines NEVER auto-trigger on real order events.

**File References:**
- api.webhook.orders.ts:95-109 (publishes `webhook.orders.*` events)
- pipeline-definitions.ts:354-363 (P13 uses schedule, not event trigger)
- pipeline-definitions.ts:399-407 (P16 waits for non-existent `support.ticket.created`)

### Expected State
1. **P13 (Data Analysis)** should listen for `webhook.orders.paid` to trigger daily analysis on order data
2. **New pipeline** or **P16 modification** to listen for order events for feedback/attribution
3. Pattern: Event webhooks → AgentBus → Pipeline triggers → Agent execution chain

### Fix Approach
**LOW effort, requires BLUEPRINT + 1 TRIGGER DEFINITION CHANGE:**
1. Modify P13 trigger from `schedule` to event-driven:
   ```typescript
   trigger: { type: 'event', eventType: 'webhook.orders.paid' }
   ```
2. OR add event-based alternatives alongside schedule triggers
3. Add logging to verify event delivery (currently silent failure in DeadLetterQueue)

### Test Requirements
- ✓ Integration test: Publish `webhook.orders.paid` → Verify P13 executes
- ✓ Pipeline subscription test: Verify all `eventType` patterns have listeners
- ✓ DeadLetterQueue monitoring (log unhandled events)

---

## Issue C: AI Brain Connection Status — CRITICAL

### Current State

**AI Brain exists as a STANDALONE MODULE:**
- ai-brain.ts:365-370 (getAIBrain() singleton)
- Initialized on-demand via `setAIBrainEnv(apiKey)` then `getAIBrain()`
- Methods: `decide()` (decision-making) and `analyze()` (data analysis)

**How agents SHOULD connect to AI Brain:**
According to design docs: "19 agents connected to AI Brain" in Phase 2

**How agents ACTUALLY connect:**
- ✗ BaseL2Agent has NO ai-brain imports
- ✗ L1 Leads have NO ai-brain imports
- ✗ Pipelines have NO ai-brain integration
- ✗ PipelineEngine has NO decision-making hooks
- ✗ Commander has NO AI advisory capability

**The gap:**
```
Expected: Agent.onCommand() → "should I do this?" → AIBrain.decide() → Yes/No
Actual:   Agent.onCommand() → hardcoded logic → direct action
```

### Where Connection Points SHOULD Exist
1. **Commander** (L0) — Should ask AI Brain for strategic decisions
2. **L1 Leads** (5x) — Should ask AI Brain for team-level approvals
3. **L2 Specialists** (10-17x) — HIGH-RISK actions should get AI approval
4. **PipelineEngine** — Complex pipelines should have AI-guided step decisions
5. **ApprovalQueue** — Queued decisions should be reviewable by AI Brain

### Current Code State
- ai-brain.ts exists with full `decide()` and `analyze()` implementation ✓
- ai-pipeline-bridge.ts exists as a "bridge" interface (placeholder?)
- approval-queue.ts exists for human approval (but no AI connection)
- **NO CODE actually calls `getAIBrain().decide()`** in agent execution paths

### Why It Matters
Without AI Brain connection, the system cannot:
- Make intelligent decisions based on context
- Learn from approval feedback
- Handle novel situations beyond hardcoded rules
- Scale decision-making as complexity grows

**File References:**
- agents/core/ai-brain.ts (exists but disconnected)
- agents/core/ai-pipeline-bridge.ts (unclear purpose, needs audit)
- agents/l2/base-l2-agent.ts (no AIBrain usage)
- agents/l0/commander.ts (no AIBrain usage)

### Expected State
- L1/L2 agents call `AIBrain.decide()` for decision-critical actions
- Pipelines consult AI Brain for step routing (e.g., "should we skip this step?")
- ApprovalQueue integrates with AI Brain for recommendation before human review
- All "intelligence" operations logged for feedback learning

### Fix Approach
**HIGH effort, requires NEW INTEGRATION CODE:**
1. Add `aiConnector: AIBrain` property to BaseL2Agent
2. Modify L2 agent `onCommand()` methods to call `aiConnector.decide()` for:
   - Pricing decisions
   - Campaign timing
   - Security alerts
   - Data-driven recommendations
3. Wire PipelineEngine to consult AI Brain on retry/skip decisions
4. Create AIBrain subscriber in ApprovialQueue

### Test Requirements
- ✓ AI Brain mock test (decision without real API)
- ✓ Integration test: Agent action → AI decision → approval queue
- ✓ Fallback test: AI API down → system uses rule-based decision
- ✓ Cost tracking test: Verify token usage stays under daily limit

---

## Issue D: Agent Restart Mechanism Incomplete (障害#4) — HIGH

### Current State

**Health Monitor publishes health.critical events:**
- health-monitor.ts:214-221 (emits `health.critical` when failures >= threshold)
- health-monitor.ts:240-253 (emits to Bus)

**Commander subscribes to health.critical:**
- commander.ts:84-86 (subscribes to 'health.critical')
- commander.ts:170-182 (handleHealthCritical) — sets andonStatus to yellow, logs payload

**What happens next: NOTHING SUBSTANTIVE**
```typescript
private async handleHealthCritical(event: AgentEvent): Promise<void> {
  this.errorCount++;
  const payload = event.payload as { level: string; failures: number };

  if (this.andonStatus !== 'red') {
    this.andonStatus = 'yellow';
    this.andonHistory.push({
      status: 'yellow',
      timestamp: Date.now(),
      reason: `Agent health critical: ${JSON.stringify(payload)}`,
    });
  }
  // ← NO RESTART ATTEMPT
}
```

### The Problem
1. HealthMonitor detects dead agent (10+ consecutive failures)
2. HealthMonitor publishes `health.critical` event
3. Commander receives event
4. Commander sets `andonStatus = yellow` (internal state only)
5. **NO CODE CALLS agent.initialize() or restarts the agent**
6. Agent remains dead; system continues with degraded service

**Expected flow:** health.critical → Commander → "restart that agent" → wait for confirmation → resume

### Missing Piece
No code:
- Calls `registry.get(agentId).initialize()` to restart
- Calls `bus.publish('agent.restart_requested', ...)` for other systems to act
- Waits for `agent.restarted` confirmation event
- Has a recovery strategy if restart fails

**File References:**
- health-monitor.ts:214-221 (publishes but nothing subscribed except Commander)
- commander.ts:170-182 (receives but doesn't restart)
- agent-bus.ts (no restart orchestration)

### Expected State
1. health.critical published → MultipleListeners: Commander + RestartCoordinator
2. RestartCoordinator (new? or Commander responsibility?) attempts restart
3. Publishes `agent.restart_initiated` → HealthMonitor ignores new failures during restart grace period
4. On success: `agent.restarted` → HealthMonitor resets consecutiveFailures
5. On failure after 3 attempts: escalate to Andon Cord (full system pause)

### Fix Approach
**MEDIUM effort, requires NEW LOGIC:**
1. Option A: Add restart logic to Commander.handleHealthCritical()
   ```typescript
   const agent = this.registry.get(agentId);
   if (agent) await agent.initialize();  // restart
   ```
2. Option B: Create new RestartCoordinator agent that specializes in recovery
3. Add grace period: HealthMonitor shouldn't count failures for 30s after restart begins
4. Track restart history: 3 failed attempts → escalate to Andon Cord

### Test Requirements
- ✓ Unit test: Simulate agent failure → verify restart called
- ✓ Integration test: Stop agent → health critical → auto-restart → verify healthy
- ✓ Failure scenario: Restart fails 3x → verify Andon Cord triggered
- ✓ Grace period test: No spurious failures counted during restart window

---

## Issue E: Dynamic Pipeline Registration Gap — MEDIUM

### Current State

**Pipelines registered ONLY at initialization:**
- agent-registration.ts:673-685 (Step 4c: registers ALL_PIPELINES at startup)
- Loop over predefined list, can't add new ones after boot

**Runtime pipeline addition: NOT SUPPORTED**
- PipelineEngine.registerPipeline() exists (line 41-59)
- But it's never called except during initialization
- No API endpoint to add pipeline at runtime
- No mechanism to persist new pipeline definitions

### The Problem
To add new pipeline at runtime (e.g., "run a custom audit flow"):
1. Must edit pipeline-definitions.ts
2. Must redeploy entire system
3. Must restart all agents
4. Takes 30+ minutes minimum

**Expected:** Business user should be able to:
- Create new pipeline via API
- Test it in staging
- Deploy without full restart

### Why It Matters
- Blocks agile iteration on pipeline logic
- Requires engineer involvement for operational changes
- Prevents "on-demand" custom pipelines (e.g., emergency product recall workflow)

**File References:**
- agent-registration.ts:677-679 (hardcoded loop over ALL_PIPELINES)
- pipeline-definitions.ts:411-417 (export ALL_PIPELINES as static array)
- pipeline-engine.ts:41-59 (registerPipeline() exists but unused)

### Expected State
1. Pipelines can be registered dynamically via API
2. New pipelines don't require agent restart
3. Pipeline definitions stored in persistent storage (KV store)
4. Runtime registry separate from boot-time registry

### Fix Approach
**MEDIUM effort, architectural decision needed:**
1. Create `POST /api/pipeline/register` endpoint
2. Store pipeline def in KV storage
3. PipelineEngine loads from both: ALL_PIPELINES + KV store
4. Return pipeline ID to caller for future reference

### Test Requirements
- ✓ API test: POST new pipeline → verify registered
- ✓ Trigger test: Fire event matching new pipeline trigger → verify execution
- ✓ Persistence test: Restart system → verify new pipeline still present
- ✓ Conflict test: Duplicate pipeline ID → verify error handling

---

## Issue F: Event Listener Initialization Order — HIGH

### Current State

**Pipeline engine event listeners are NEVER STARTED:**
- pipeline-engine.ts:433-453 (startEventListeners method exists)
- **NOT CALLED anywhere in initialization chain**

**What should happen:**
```
initializeAgents()
  ├─ RegisterPipelines ✓
  └─ startEventListeners() ✗ MISSING
```

**Current code:**
- Pipeline definitions loaded (line 677-679)
- PipelineEngine stored in registrationState (line 684)
- **Missing:** `pipelineEngine.startEventListeners()` call

### The Problem
Event-triggered pipelines (P03, P16) will NEVER execute:
- P03: waiting for `content.requested` events
- P16: waiting for `support.ticket.created` events
- **No listeners registered → events fall to DeadLetterQueue → silent failure**

### Why It Matters
Blocks entire event-driven architecture. System appears to work but critical pipelines never trigger.

**File References:**
- agent-registration.ts:684 (stores pipelineEngine but doesn't call startEventListeners)
- pipeline-engine.ts:433-453 (startEventListeners defined but never invoked)

### Expected State
```typescript
// agent-registration.ts line 686+
pipelineEngine.startEventListeners();  // ← ADD THIS
console.log('[Registration] Pipeline event listeners started');
```

### Fix Approach
**TRIVIAL effort, 1-line fix:**
1. Add `pipelineEngine.startEventListeners()` after line 684 in agent-registration.ts

### Test Requirements
- ✓ Integration test: Publish `content.requested` → Verify P03 executes
- ✓ Subscription map test: Verify all event trigger patterns are subscribed

---

## Issue Summary Table

| Issue | Category | Severity | Current State | Root Cause | Fix Effort | Tests Required |
|-------|----------|----------|---------------|-----------|-----------|-----------------|
| A | Blueprint Mismatch | CRITICAL | 10/17 L2 agents use generic blueprints | Missing domain-specific configs | MEDIUM | 3 tests |
| B | Webhook→Pipeline Gap | HIGH | Webhooks published, no pipeline listens | Missing event trigger in pipeline def | LOW | 3 tests |
| C | AI Brain Disconnected | CRITICAL | Code exists, zero integration | Design not implemented | HIGH | 5 tests |
| D | No Agent Restart | HIGH | health.critical published, ignored | Missing restart logic in Commander | MEDIUM | 4 tests |
| E | No Dynamic Pipelines | MEDIUM | Only boot-time registration | Architecture limitation | MEDIUM | 4 tests |
| F | Event Listeners Not Started | HIGH | startEventListeners() never called | Missing 1-line init call | TRIVIAL | 2 tests |

---

## Recommended Priority Order (MVP to Production)

**Phase 1 (Immediate — enables basic operation):**
1. **Fix F** (1 line) — unblocks all event-driven pipelines
2. **Fix B** (blueprint change) — connects webhooks to analysis
3. **Fix D** (medium) — enables self-healing

**Phase 2 (Required for Phase 2 agents):**
4. **Fix A** (blueprints) — enables 17-agent system
5. **Fix C** (AI Brain) — enables intelligent decisions

**Phase 3 (Operational excellence):**
6. **Fix E** (dynamic pipelines) — enables runtime flexibility

---

## Initialization Sequence — Current vs. Fixed

### Current (Broken)
```
1. Create Bus, Registry, CascadeEngine ✓
2. Register Blueprints (some generic) ⚠
3. Initialize L0 Commander ✓
4. Initialize L1 Leads ✓
5. Initialize L2 Workers (incomplete blueprints) ⚠
6. Register Pipelines ✓
   └─ Event listeners START: ✗ MISSING
7. Start HealthMonitor ✓
   └─ Publishes health.critical → Commander ignores ⚠
8. System online (degraded)
```

### Fixed
```
1. Create Bus, Registry, CascadeEngine ✓
2. Register Blueprints (all domain-specific) ✓
3. Initialize L0 Commander ✓
4. Initialize L1 Leads ✓
5. Initialize L2 Workers (complete blueprints) ✓
6. Register Pipelines ✓
   └─ Start event listeners ✓
7. Connect AI Brain to Commander + critical agents ✓
8. Start HealthMonitor ✓
   └─ Publishes health.critical → Commander restarts agent ✓
9. System online (fully operational)
```

---

## Appendix: Agent Capability Coverage

### L2 Agents with Generic Blueprints (At Risk)

| Agent | Team | Capabilities in Blueprint | Actual `onCommand()` Methods | Gap |
|-------|------|--------------------------|------------------------------|-----|
| PricingAgent | sales | `['pricing_optimization']` | price_analysis, dynamic_pricing, competitor_price_check, margin_optimization | 4 actions not declared |
| PromotionAgent | sales | `['campaign_management']` | create_campaign, schedule_sale, discount_code_generate, campaign_analytics | 4 actions not declared |
| ConversionAgent | sales | `['conversion_optimization']` | checkout_analysis, abandonment_analysis, cart_optimization, upsell_optimization | 4 actions not declared |
| DevOpsAgent | engineering | `['deployment', 'ci_cd']` | deploy_staging, deploy_production, rollback, env_config, build_check | 5 actions, config missing |
| SecurityAgent | engineering | `['security_audit']` | dependency_check, vulnerability_scan, csp_review, policy_audit | 4 actions, rules missing |
| PerformanceAgent | engineering | `['performance_monitoring']` | lighthouse_audit, cwv_check, bundle_analysis, memory_profiling | 4 actions, thresholds missing |
| DataAnalyst | data | `['data_analysis', 'reporting']` | daily_report, funnel_analysis, cohort_analysis, trend_detection | 4 actions, metrics missing |
| ABTestAgent | data | `['ab_testing']` | create_experiment, analyze_experiment, significance_test, winner_selection | 4 actions, config missing |
| InsightAgent | data | `['insight_generation']` | anomaly_detection, generate_insights, customer_segmentation, trend_analysis | 4 actions, thresholds missing |
| SupportAgent | support | `['customer_support']` | ticket_response, faq_update, escalate, customer_feedback_analyze | 4 actions, rules missing |

**Total: 40+ undeclared capabilities across 10 agents**

---

## Conclusion

The agent system is **99% architecturally sound** but has **6 initialization defects** that prevent the last 1% of maturation. None are design flaws; all are **implementation completeness issues** that likely arose from "Phase 1 MVP focus" (get 13 agents working) leaving Phase 2 infrastructure (17+ agents + AI Brain) as unfinished work.

**Status:** Ready for fix prioritization.

