/**
 * Astromeda Agent System — Drizzle ORM Schema (造血器官の遺伝子コード)
 *
 * schema.sql の TypeScript 対応版。Drizzle ORM で型安全なDB操作を実現。
 * 医学メタファー: DNA→タンパク質翻訳 = SQL→TypeScript型変換
 */

import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  date,
  timestamp,
  jsonb,
  bigint,
  uniqueIndex,
  index,
  foreignKey,
} from 'drizzle-orm/pg-core';

// ─── 1. analytics_daily（赤血球=ビジネスデータ） ───
export const analyticsDailyTable = pgTable('analytics_daily', {
  id: serial('id').primaryKey(),
  date: date('date').notNull().unique(),
  sessions: integer('sessions').notNull().default(0),
  users: integer('users').notNull().default(0),
  newUsers: integer('new_users').notNull().default(0),
  pageviews: integer('pageviews').notNull().default(0),
  bounceRate: numeric('bounce_rate', { precision: 5, scale: 4 }).default('0'),
  avgSessionSec: numeric('avg_session_sec', { precision: 8, scale: 2 }).default('0'),
  orders: integer('orders').notNull().default(0),
  revenueJpy: numeric('revenue_jpy', { precision: 12, scale: 0 }).notNull().default('0'),
  aovJpy: numeric('aov_jpy', { precision: 10, scale: 0 }).default('0'),
  conversionRate: numeric('conversion_rate', { precision: 5, scale: 4 }).default('0'),
  deviceBreakdown: jsonb('device_breakdown').default({}),
  sourceBreakdown: jsonb('source_breakdown').default({}),
  topPages: jsonb('top_pages').default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_analytics_daily_date').on(table.date),
]);

// ─── 2. search_console_daily（白血球=検索流入データ） ───
export const searchConsoleDailyTable = pgTable('search_console_daily', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  query: text('query').notNull(),
  page: text('page'),
  clicks: integer('clicks').notNull().default(0),
  impressions: integer('impressions').notNull().default(0),
  ctr: numeric('ctr', { precision: 5, scale: 4 }).default('0'),
  position: numeric('position', { precision: 6, scale: 2 }).default('0'),
  device: varchar('device', { length: 20 }).default('all'),
  country: varchar('country', { length: 5 }).default('jpn'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_gsc_unique').on(table.date, table.query, table.page, table.device, table.country),
  index('idx_gsc_date').on(table.date),
  index('idx_gsc_query').on(table.query),
]);

// ─── 3. ai_visibility_weekly（血小板=AI経由の発見性） ───
export const aiVisibilityWeeklyTable = pgTable('ai_visibility_weekly', {
  id: serial('id').primaryKey(),
  weekStart: date('week_start').notNull(),
  aiEngine: varchar('ai_engine', { length: 30 }).notNull(),
  query: text('query').notNull(),
  mentioned: boolean('mentioned').default(false),
  rankPosition: integer('rank_position'),
  contextSnippet: text('context_snippet'),
  competitorMentions: jsonb('competitor_mentions').default([]),
  confidence: numeric('confidence', { precision: 3, scale: 2 }).default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_ai_vis_unique').on(table.weekStart, table.aiEngine, table.query),
  index('idx_ai_vis_week').on(table.weekStart),
]);

// ─── 4. competitor_weekly（抗体=競合情報） ───
export const competitorWeeklyTable = pgTable('competitor_weekly', {
  id: serial('id').primaryKey(),
  weekStart: date('week_start').notNull(),
  competitor: varchar('competitor', { length: 50 }).notNull(),
  productName: text('product_name').notNull(),
  priceJpy: numeric('price_jpy', { precision: 10, scale: 0 }),
  priceChange: numeric('price_change', { precision: 10, scale: 0 }).default('0'),
  inStock: boolean('in_stock').default(true),
  cpu: varchar('cpu', { length: 100 }),
  gpu: varchar('gpu', { length: 100 }),
  ramGb: integer('ram_gb'),
  storageDesc: text('storage_desc'),
  url: text('url'),
  scrapedAt: timestamp('scraped_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_comp_unique').on(table.weekStart, table.competitor, table.productName),
  index('idx_comp_week').on(table.weekStart),
  index('idx_comp_competitor').on(table.competitor),
]);

// ─── 5. feedback_history（記憶B細胞=学習記憶） ───
export const feedbackHistoryTable = pgTable('feedback_history', {
  id: serial('id').primaryKey(),
  agentId: varchar('agent_id', { length: 100 }).notNull(),
  actionType: varchar('action_type', { length: 50 }).notNull(),
  contentHash: varchar('content_hash', { length: 64 }),
  decision: varchar('decision', { length: 20 }).notNull(),
  confidence: numeric('confidence', { precision: 3, scale: 2 }).default('0'),
  approver: varchar('approver', { length: 100 }),
  feedbackText: text('feedback_text'),
  modifications: jsonb('modifications').default({}),
  promptVersion: varchar('prompt_version', { length: 20 }),
  executionTimeMs: integer('execution_time_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_feedback_agent').on(table.agentId),
  index('idx_feedback_action').on(table.actionType),
  index('idx_feedback_decision').on(table.decision),
  index('idx_feedback_created').on(table.createdAt),
]);

// ─── 6. approval_queue（免疫シグナル=承認待ちキュー） ───
export const approvalQueueTable = pgTable('approval_queue', {
  id: serial('id').primaryKey(),
  requestId: varchar('request_id', { length: 100 }).notNull().unique(),
  agentId: varchar('agent_id', { length: 100 }).notNull(),
  actionType: varchar('action_type', { length: 50 }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  contentPreview: text('content_preview'),
  confidence: numeric('confidence', { precision: 3, scale: 2 }).default('0'),
  riskLevel: varchar('risk_level', { length: 20 }).default('medium'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  autoApprove: boolean('auto_approve').default(false),
  slackMessageTs: varchar('slack_message_ts', { length: 50 }),
  slackChannel: varchar('slack_channel', { length: 50 }),
  decidedBy: varchar('decided_by', { length: 100 }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_approval_status').on(table.status),
  index('idx_approval_agent').on(table.agentId),
  index('idx_approval_created').on(table.createdAt),
]);

// ─── 7. agent_health_log（バイタルサイン記録） ───
export const agentHealthLogTable = pgTable('agent_health_log', {
  id: serial('id').primaryKey(),
  agentId: varchar('agent_id', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  errorCount: integer('error_count').default(0),
  memoryUsage: bigint('memory_usage', { mode: 'number' }).default(0),
  taskQueue: integer('task_queue').default(0),
  responseTimeMs: integer('response_time_ms'),
  metadata: jsonb('metadata').default({}),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_health_agent').on(table.agentId),
  index('idx_health_recorded').on(table.recordedAt),
]);

// ─── 8. pipeline_execution_log（循環器系ログ） ───
export const pipelineExecutionLogTable = pgTable('pipeline_execution_log', {
  id: serial('id').primaryKey(),
  executionId: varchar('execution_id', { length: 100 }).notNull().unique(),
  pipelineId: varchar('pipeline_id', { length: 20 }).notNull(),
  pipelineName: text('pipeline_name'),
  status: varchar('status', { length: 20 }).notNull(),
  currentStep: integer('current_step').default(0),
  totalSteps: integer('total_steps').default(0),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  durationMs: integer('duration_ms'),
  triggerType: varchar('trigger_type', { length: 20 }),
  triggerDetail: text('trigger_detail'),
  results: jsonb('results').default({}),
  errors: jsonb('errors').default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_pipeline_exec_pipeline').on(table.pipelineId),
  index('idx_pipeline_exec_status').on(table.status),
  index('idx_pipeline_exec_started').on(table.startedAt),
]);

// ─── 9. agent_config（DNA配列=エージェント設定情報） ───
// 各エージェントの設定値を永続化。InMemoryでは再起動で消えていた。
// 医学メタファー: DNA＝細胞の設計図。エージェントの動作パラメータを遺伝情報として保存。
export const agentConfigTable = pgTable('agent_config', {
  id: serial('id').primaryKey(),
  agentId: varchar('agent_id', { length: 100 }).notNull().unique(),
  agentName: text('agent_name').notNull(),
  level: varchar('level', { length: 10 }).notNull(), // L0, L1, L2
  team: varchar('team', { length: 50 }),
  enabled: boolean('enabled').notNull().default(true),
  aiTier: varchar('ai_tier', { length: 10 }).default('B'), // A=Sonnet, B=Haiku, C=Gemini Flash, D=Gemini Lite
  promptVersion: varchar('prompt_version', { length: 20 }).default('v1.0'),
  config: jsonb('config').default({}), // エージェント固有設定
  schedule: jsonb('schedule').default(null), // cron式 or null（手動トリガーのみ）
  maxConcurrency: integer('max_concurrency').default(1),
  timeoutMs: integer('timeout_ms').default(30000),
  retryCount: integer('retry_count').default(3),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_agent_config_level').on(table.level),
  index('idx_agent_config_team').on(table.team),
  index('idx_agent_config_enabled').on(table.enabled),
]);

// ─── 10. system_settings（視床下部=全身調節中枢） ───
// システム全体の設定値。ホメオスタシスのセットポイント。
export const systemSettingsTable = pgTable('system_settings', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  value: jsonb('value').notNull(),
  category: varchar('category', { length: 50 }).notNull(), // 'general', 'security', 'notification', 'shopify', 'ai'
  description: text('description'),
  updatedBy: varchar('updated_by', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_system_settings_category').on(table.category),
]);

// ─── 11. notification_log（感覚神経=通知履歴） ───
// Slack以外にもEmail/Webhook/SMS対応。全通知チャネルのログ。
export const notificationLogTable = pgTable('notification_log', {
  id: serial('id').primaryKey(),
  notificationId: varchar('notification_id', { length: 100 }).notNull().unique(),
  channel: varchar('channel', { length: 20 }).notNull(), // 'slack', 'email', 'webhook', 'sms', 'dashboard'
  priority: varchar('priority', { length: 10 }).notNull().default('medium'), // critical, high, medium, low
  recipientId: varchar('recipient_id', { length: 100 }),
  subject: text('subject'),
  body: text('body').notNull(),
  metadata: jsonb('metadata').default({}),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, sent, delivered, failed, read
  sentAt: timestamp('sent_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  failureReason: text('failure_reason'),
  retryCount: integer('retry_count').default(0),
  sourceAgentId: varchar('source_agent_id', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_notification_channel').on(table.channel),
  index('idx_notification_status').on(table.status),
  index('idx_notification_priority').on(table.priority),
  index('idx_notification_created').on(table.createdAt),
  index('idx_notification_source').on(table.sourceAgentId),
]);

// ─── 12. cron_schedule（松果体=生体リズム制御） ───
// エージェントの定期実行スケジュール。自律運用の心臓部。
export const cronScheduleTable = pgTable('cron_schedule', {
  id: serial('id').primaryKey(),
  scheduleId: varchar('schedule_id', { length: 100 }).notNull().unique(),
  agentId: varchar('agent_id', { length: 100 }).notNull(),
  pipelineId: varchar('pipeline_id', { length: 100 }),
  cronExpression: varchar('cron_expression', { length: 50 }).notNull(), // '0 9 * * *' = 毎日9時
  timezone: varchar('timezone', { length: 50 }).notNull().default('Asia/Tokyo'),
  enabled: boolean('enabled').notNull().default(true),
  description: text('description'),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  lastRunStatus: varchar('last_run_status', { length: 20 }), // 'success', 'failure', 'timeout'
  lastRunDurationMs: integer('last_run_duration_ms'),
  consecutiveFailures: integer('consecutive_failures').default(0),
  maxConsecutiveFailures: integer('max_consecutive_failures').default(3),
  payload: jsonb('payload').default({}), // 実行時に渡すパラメータ
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_cron_agent').on(table.agentId),
  index('idx_cron_enabled').on(table.enabled),
  index('idx_cron_next_run').on(table.nextRunAt),
]);

// ─── 13. shopify_sync_log（臍帯=母体（Shopify）との接続記録） ───
// Shopify APIとの同期ログ。読み取り/書き込み両方向を追跡。
export const shopifySyncLogTable = pgTable('shopify_sync_log', {
  id: serial('id').primaryKey(),
  syncId: varchar('sync_id', { length: 100 }).notNull().unique(),
  direction: varchar('direction', { length: 10 }).notNull(), // 'read', 'write', 'webhook'
  resourceType: varchar('resource_type', { length: 50 }).notNull(), // 'product', 'collection', 'order', 'inventory', 'metafield'
  resourceId: varchar('resource_id', { length: 100 }),
  operation: varchar('operation', { length: 20 }).notNull(), // 'create', 'update', 'delete', 'sync', 'bulk_read'
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, in_progress, success, partial_success, failure
  itemsProcessed: integer('items_processed').default(0),
  itemsFailed: integer('items_failed').default(0),
  errorDetails: jsonb('error_details').default([]),
  requestPayload: jsonb('request_payload').default(null), // 送信データ（デバッグ用）
  responsePayload: jsonb('response_payload').default(null), // Shopifyレスポンス
  rateLimitRemaining: integer('rate_limit_remaining'),
  durationMs: integer('duration_ms'),
  triggeredBy: varchar('triggered_by', { length: 100 }), // agent_id or 'webhook' or 'cron'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('idx_shopify_sync_direction').on(table.direction),
  index('idx_shopify_sync_resource').on(table.resourceType),
  index('idx_shopify_sync_status').on(table.status),
  index('idx_shopify_sync_created').on(table.createdAt),
  index('idx_shopify_sync_triggered').on(table.triggeredBy),
]);

// ─── 14. audit_trail（免疫記憶=監査証跡） ───
// 全操作の監査ログ。コンプライアンス対応。誰が何をいつ変更したかの完全記録。
export const auditTrailTable = pgTable('audit_trail', {
  id: serial('id').primaryKey(),
  trailId: varchar('trail_id', { length: 100 }).notNull().unique(),
  actorType: varchar('actor_type', { length: 20 }).notNull(), // 'agent', 'admin', 'system', 'cron', 'webhook'
  actorId: varchar('actor_id', { length: 100 }).notNull(),
  action: varchar('action', { length: 50 }).notNull(), // 'create', 'update', 'delete', 'approve', 'reject', 'execute', 'login', 'config_change'
  targetType: varchar('target_type', { length: 50 }).notNull(), // 'agent', 'pipeline', 'setting', 'product', 'content', 'approval'
  targetId: varchar('target_id', { length: 100 }),
  description: text('description'),
  previousValue: jsonb('previous_value').default(null),
  newValue: jsonb('new_value').default(null),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  riskLevel: varchar('risk_level', { length: 10 }).default('low'), // low, medium, high, critical
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_audit_actor').on(table.actorType, table.actorId),
  index('idx_audit_action').on(table.action),
  index('idx_audit_target').on(table.targetType, table.targetId),
  index('idx_audit_risk').on(table.riskLevel),
  index('idx_audit_created').on(table.createdAt),
]);

// ─── 型エクスポート（全テーブルの insert/select 型） ───
export type AnalyticsDaily = typeof analyticsDailyTable.$inferSelect;
export type NewAnalyticsDaily = typeof analyticsDailyTable.$inferInsert;

export type SearchConsoleDaily = typeof searchConsoleDailyTable.$inferSelect;
export type NewSearchConsoleDaily = typeof searchConsoleDailyTable.$inferInsert;

export type AiVisibilityWeekly = typeof aiVisibilityWeeklyTable.$inferSelect;
export type NewAiVisibilityWeekly = typeof aiVisibilityWeeklyTable.$inferInsert;

export type CompetitorWeekly = typeof competitorWeeklyTable.$inferSelect;
export type NewCompetitorWeekly = typeof competitorWeeklyTable.$inferInsert;

export type FeedbackHistory = typeof feedbackHistoryTable.$inferSelect;
export type NewFeedbackHistory = typeof feedbackHistoryTable.$inferInsert;

export type ApprovalQueue = typeof approvalQueueTable.$inferSelect;
export type NewApprovalQueue = typeof approvalQueueTable.$inferInsert;

export type AgentHealthLog = typeof agentHealthLogTable.$inferSelect;
export type NewAgentHealthLog = typeof agentHealthLogTable.$inferInsert;

export type PipelineExecutionLog = typeof pipelineExecutionLogTable.$inferSelect;
export type NewPipelineExecutionLog = typeof pipelineExecutionLogTable.$inferInsert;

export type AgentConfig = typeof agentConfigTable.$inferSelect;
export type NewAgentConfig = typeof agentConfigTable.$inferInsert;

export type SystemSettings = typeof systemSettingsTable.$inferSelect;
export type NewSystemSettings = typeof systemSettingsTable.$inferInsert;

export type NotificationLog = typeof notificationLogTable.$inferSelect;
export type NewNotificationLog = typeof notificationLogTable.$inferInsert;

export type CronSchedule = typeof cronScheduleTable.$inferSelect;
export type NewCronSchedule = typeof cronScheduleTable.$inferInsert;

export type ShopifySyncLog = typeof shopifySyncLogTable.$inferSelect;
export type NewShopifySyncLog = typeof shopifySyncLogTable.$inferInsert;

export type AuditTrail = typeof auditTrailTable.$inferSelect;
export type NewAuditTrail = typeof auditTrailTable.$inferInsert;

// ─── 15. dead_letter_queue（神経回路の信号損失ログ） ───
// AgentBus がイベント配信に失敗した場合の記録。
// 購読者ゼロのイベントをDB永続化し、パージ前のデータ消失を防止。
export const deadLetterQueueTable = pgTable('dead_letter_queue', {
  id: serial('id').primaryKey(),
  eventId: varchar('event_id', { length: 100 }).notNull(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  source: varchar('source', { length: 100 }).notNull(),
  priority: varchar('priority', { length: 20 }).notNull().default('normal'),
  payload: jsonb('payload').notNull().default({}),
  attemptCount: integer('attempt_count').notNull().default(1),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  reason: varchar('reason', { length: 255 }).notNull().default('no_subscriber'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_dead_letter_event_type').on(table.eventType),
  index('idx_dead_letter_created').on(table.createdAt),
]);

export type DeadLetterQueue = typeof deadLetterQueueTable.$inferSelect;
export type NewDeadLetterQueue = typeof deadLetterQueueTable.$inferInsert;

// ─── 全テーブル名定数（ランタイム参照用） ───
export const ALL_TABLES = {
  ANALYTICS_DAILY: 'analytics_daily',
  SEARCH_CONSOLE_DAILY: 'search_console_daily',
  AI_VISIBILITY_WEEKLY: 'ai_visibility_weekly',
  COMPETITOR_WEEKLY: 'competitor_weekly',
  FEEDBACK_HISTORY: 'feedback_history',
  APPROVAL_QUEUE: 'approval_queue',
  AGENT_HEALTH_LOG: 'agent_health_log',
  PIPELINE_EXECUTION_LOG: 'pipeline_execution_log',
  AGENT_CONFIG: 'agent_config',
  SYSTEM_SETTINGS: 'system_settings',
  NOTIFICATION_LOG: 'notification_log',
  CRON_SCHEDULE: 'cron_schedule',
  SHOPIFY_SYNC_LOG: 'shopify_sync_log',
  AUDIT_TRAIL: 'audit_trail',
  DEAD_LETTER_QUEUE: 'dead_letter_queue',
} as const;
