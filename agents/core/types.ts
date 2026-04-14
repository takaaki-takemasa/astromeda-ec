/**
 * Astromeda Agent System — 型定義（DNA=全コンポーネント共通の遺伝情報）
 *
 * 生体対応: DNA（デオキシリボ核酸）
 * 全ての細胞が共有する基本設計図。型定義は全Agentの「遺伝子」として機能する。
 *
 * v3 Layer 0 手術: Zodスキーマによるランタイム型検証追加
 * - payload: unknown → EventPayloadSchema で型制約
 * - CascadeCommand.params → CommandParamsSchema で型制約
 * - 全ての「血液」（データ）が正しい型を持つことを保証する
 */

import { z } from 'zod';

// ── Zodスキーマ（DNA検査装置） ──

/** イベントペイロードのZodスキーマ（0-01: payload型制約） */
export const EventPayloadSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
]);
export type EventPayload = z.infer<typeof EventPayloadSchema>;

/** コマンドパラメータのZodスキーマ（0-02: params型制約） */
export const CommandParamsSchema = z.record(z.string(), z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
]));
export type CommandParams = z.infer<typeof CommandParamsSchema>;

/** AgentEvent全体のZodスキーマ（ランタイム検証用） */
export const AgentEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  source: z.string().min(1),
  target: z.string().optional(),
  priority: z.enum(['critical', 'high', 'normal', 'low']),
  payload: EventPayloadSchema,
  timestamp: z.number().positive(),
  correlationId: z.string().optional(),
  ttl: z.number().positive().optional(),
});

/** CascadeCommand全体のZodスキーマ */
export const CascadeCommandSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.array(z.string().min(1)).min(1),
  action: z.string().min(1),
  params: CommandParamsSchema,
  priority: z.enum(['critical', 'high', 'normal', 'low']),
  deadline: z.number().positive().optional(),
  rollbackAction: z.string().optional(),
});

// ── Agent識別 ──
export type AgentLevel = 'L0' | 'L1' | 'L2' | 'Infra' | 'Registry';
export type TeamId = 'command' | 'acquisition' | 'conversion' | 'ltv' | 'infrastructure' | 'intelligence' | 'product' | 'marketing' | 'quality' | 'operations' | 'sales' | 'engineering' | 'data' | 'support';

export interface AgentId {
  id: string;        // 一意ID (e.g., "image-generator")
  name: string;      // 表示名
  level: AgentLevel;
  team: TeamId;
  version: string;
}

// ── Agent状態（生命徴候） ──
export type AgentStatus = 'initializing' | 'healthy' | 'degraded' | 'error' | 'shutdown';

export interface AgentHealth {
  agentId: string;
  status: AgentStatus;
  lastHeartbeat: number;     // Unix timestamp
  uptime: number;            // ms
  errorCount: number;
  memoryUsage: number;       // bytes
  taskQueue: number;         // pending tasks
  metadata?: Record<string, unknown>;
}

// ── イベント（神経伝達物質） ──
export type EventPriority = 'critical' | 'high' | 'normal' | 'low';

export interface AgentEvent {
  id: string;                // UUID
  type: string;              // e.g., "content.generated", "image.requested"
  source: string;            // 発行Agent ID
  target?: string;           // 宛先Agent ID (undefined = broadcast)
  priority: EventPriority;
  payload: EventPayload;
  timestamp: number;
  correlationId?: string;    // リクエスト追跡用
  ttl?: number;              // Time to live (ms)
}

// ── コマンド（ホルモン=長距離制御信号） ──
export interface CascadeCommand {
  id: string;
  from: string;              // 発行元 (L0 or L1)
  to: string[];              // 宛先リスト
  action: string;            // 実行アクション
  params: CommandParams;
  priority: EventPriority;
  deadline?: number;         // 実行期限
  rollbackAction?: string;   // 失敗時のロールバック
}

// ── パイプライン（血管系=物質輸送経路） ──
export type PipelineStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

export interface PipelineStep {
  id: string;
  agentId: string;           // 実行Agent
  action: string;
  inputFrom?: string;        // 前ステップID
  timeout: number;           // ms
  retryCount: number;
  retryDelay: number;        // ms
  rollbackAction?: string;   // 失敗時の補償アクション
  parallel?: boolean;        // T057: true の場合、複数ステップを並行実行（Promise.allSettled）
}

export interface PipelineDefinition {
  id: string;                // e.g., "P04"
  name: string;
  steps: PipelineStep[];
  trigger: PipelineTrigger;
  onFailure: 'halt' | 'skip' | 'retry' | 'rollback';
}

export interface PipelineTrigger {
  type: 'event' | 'schedule' | 'manual' | 'cascade';
  eventType?: string;        // event trigger
  cron?: string;             // schedule trigger
  cascadeFrom?: string;      // cascade trigger pipeline ID
}

export interface PipelineExecution {
  executionId: string;
  pipelineId: string;
  status: PipelineStatus;
  currentStep: number;
  startTime: number;
  endTime?: number;
  results: Map<string, unknown>;
  errors: Array<{ step: string; error: string; timestamp: number }>;
}

// ── Blueprint（遺伝子発現テンプレート） ──
export interface AgentBlueprint {
  id: string;
  agentType: string;
  version: string;
  config: Record<string, unknown>;
  capabilities: string[];
  dependencies: string[];    // 依存Agent IDs
  healthCheck: {
    interval: number;        // ms
    timeout: number;
    unhealthyThreshold: number;
  };
}

// ── セキュリティ（免疫系） ──
export interface SecurityContext {
  agentId: string;
  permissions: string[];
  rateLimit: { maxRequests: number; windowMs: number };
  allowedTargets: string[];  // 通信許可先Agent
}

// ── フィードバック（シナプス可塑性） ──
export interface FeedbackRecord {
  id: string;
  agentId: string;
  action: string;
  input: unknown;
  output: unknown;
  outcome: 'success' | 'failure' | 'partial';
  humanApproval?: boolean;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ── Agent基本インターフェース（細胞膜=全細胞共通の外殻） ──
export interface IAgent {
  readonly id: AgentId;
  getHealth(): AgentHealth;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  handleEvent(event: AgentEvent): Promise<void>;
  handleCommand(command: CascadeCommand): Promise<unknown>;
}

// ── Agent Bus インターフェース ──
export type EventHandler = (event: AgentEvent) => Promise<void>;
export type EventFilter = (event: AgentEvent) => boolean;

export interface SubscribeOptions {
  agentId?: string;           // 購読Agent ID（ターゲット配信に使用）
  priority?: EventPriority;   // 購読者優先度（critical=最優先）
}

export interface IAgentBus {
  publish(event: AgentEvent): Promise<void>;
  subscribe(eventType: string, handler: EventHandler, filter?: EventFilter, options?: SubscribeOptions): string;
  unsubscribe(subscriptionId: string): void;
  request(event: AgentEvent, timeoutMs?: number): Promise<AgentEvent>;
}
