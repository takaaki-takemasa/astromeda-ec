/**
 * テーブル名定数 — drizzle-orm を持ち込まないランタイム参照
 *
 * schema.ts は drizzle-orm/pg-core を top-level import しており
 * Cloudflare Workers (Oxygen) には drizzle-orm が含まれない（vite ssr.external 設定）。
 * db-adapter.ts で ALL_TABLES を参照するためだけに schema.ts を import すると
 * worker.mjs が drizzle-orm を要求し起動失敗する（No such module "drizzle-orm"）。
 *
 * よって ALL_TABLES だけをこのファイルに切り出し、worker bundle から drizzle-orm を排除する。
 * schema.ts 側からも re-export することで既存テストの import パスを壊さない。
 */

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
