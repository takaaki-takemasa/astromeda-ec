/**
 * Database Migration Manager — マイグレーション機構（骨形成）
 *
 * 医学メタファー: 骨は段階的に硬化する（軟骨→骨化）。
 * マイグレーションはDBスキーマの段階的進化を管理する。
 *
 * コマンド:
 *   migrate up     — 最新まで適用
 *   migrate down   — 直前1バージョンにロールバック
 *   migrate status — 現在の状態表示
 *   migrate reset  — 全テーブル削除+再作成
 *   migrate seed   — シードデータ投入
 */

import { getDatabase, isDatabaseConnected, withRetry } from './connection';
import { createLogger } from '../../core/logger.js';

const log = createLogger('migrate');


// ─── マイグレーション定義 ───
interface Migration {
  version: number;
  name: string;
  up: string;    // SQL
  down: string;  // SQL (ロールバック)
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'create_core_tables',
    up: `
      -- マイグレーション管理テーブル自体
      CREATE TABLE IF NOT EXISTS _migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- 1. analytics_daily
      CREATE TABLE IF NOT EXISTS analytics_daily (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL UNIQUE,
        sessions INTEGER NOT NULL DEFAULT 0,
        users INTEGER NOT NULL DEFAULT 0,
        new_users INTEGER NOT NULL DEFAULT 0,
        pageviews INTEGER NOT NULL DEFAULT 0,
        bounce_rate NUMERIC(5,4) DEFAULT 0,
        avg_session_sec NUMERIC(8,2) DEFAULT 0,
        orders INTEGER NOT NULL DEFAULT 0,
        revenue_jpy NUMERIC(12,0) NOT NULL DEFAULT 0,
        aov_jpy NUMERIC(10,0) DEFAULT 0,
        conversion_rate NUMERIC(5,4) DEFAULT 0,
        device_breakdown JSONB DEFAULT '{}',
        source_breakdown JSONB DEFAULT '{}',
        top_pages JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_analytics_daily_date ON analytics_daily(date DESC);

      -- 2. search_console_daily
      CREATE TABLE IF NOT EXISTS search_console_daily (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        query TEXT NOT NULL,
        page TEXT,
        clicks INTEGER NOT NULL DEFAULT 0,
        impressions INTEGER NOT NULL DEFAULT 0,
        ctr NUMERIC(5,4) DEFAULT 0,
        position NUMERIC(6,2) DEFAULT 0,
        device VARCHAR(20) DEFAULT 'all',
        country VARCHAR(5) DEFAULT 'jpn',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(date, query, page, device, country)
      );
      CREATE INDEX IF NOT EXISTS idx_gsc_date ON search_console_daily(date DESC);
      CREATE INDEX IF NOT EXISTS idx_gsc_query ON search_console_daily(query);

      -- 3. ai_visibility_weekly
      CREATE TABLE IF NOT EXISTS ai_visibility_weekly (
        id SERIAL PRIMARY KEY,
        week_start DATE NOT NULL,
        ai_engine VARCHAR(30) NOT NULL,
        query TEXT NOT NULL,
        mentioned BOOLEAN DEFAULT FALSE,
        rank_position INTEGER,
        context_snippet TEXT,
        competitor_mentions JSONB DEFAULT '[]',
        confidence NUMERIC(3,2) DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(week_start, ai_engine, query)
      );
      CREATE INDEX IF NOT EXISTS idx_ai_vis_week ON ai_visibility_weekly(week_start DESC);

      -- 4. competitor_weekly
      CREATE TABLE IF NOT EXISTS competitor_weekly (
        id SERIAL PRIMARY KEY,
        week_start DATE NOT NULL,
        competitor VARCHAR(50) NOT NULL,
        product_name TEXT NOT NULL,
        price_jpy NUMERIC(10,0),
        price_change NUMERIC(10,0) DEFAULT 0,
        in_stock BOOLEAN DEFAULT TRUE,
        cpu VARCHAR(100),
        gpu VARCHAR(100),
        ram_gb INTEGER,
        storage_desc TEXT,
        url TEXT,
        scraped_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(week_start, competitor, product_name)
      );
      CREATE INDEX IF NOT EXISTS idx_comp_week ON competitor_weekly(week_start DESC);
      CREATE INDEX IF NOT EXISTS idx_comp_competitor ON competitor_weekly(competitor);

      -- 5. feedback_history
      CREATE TABLE IF NOT EXISTS feedback_history (
        id SERIAL PRIMARY KEY,
        agent_id VARCHAR(100) NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        content_hash VARCHAR(64),
        decision VARCHAR(20) NOT NULL,
        confidence NUMERIC(3,2) DEFAULT 0,
        approver VARCHAR(100),
        feedback_text TEXT,
        modifications JSONB DEFAULT '{}',
        prompt_version VARCHAR(20),
        execution_time_ms INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_feedback_agent ON feedback_history(agent_id);
      CREATE INDEX IF NOT EXISTS idx_feedback_action ON feedback_history(action_type);
      CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_history(created_at DESC);

      -- 6. approval_queue
      CREATE TABLE IF NOT EXISTS approval_queue (
        id SERIAL PRIMARY KEY,
        request_id VARCHAR(100) NOT NULL UNIQUE,
        agent_id VARCHAR(100) NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        content_preview TEXT,
        confidence NUMERIC(3,2) DEFAULT 0,
        risk_level VARCHAR(20) DEFAULT 'medium',
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        auto_approve BOOLEAN DEFAULT FALSE,
        slack_message_ts VARCHAR(50),
        slack_channel VARCHAR(50),
        decided_by VARCHAR(100),
        decided_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_queue(status);
      CREATE INDEX IF NOT EXISTS idx_approval_agent ON approval_queue(agent_id);

      -- 7. agent_health_log
      CREATE TABLE IF NOT EXISTS agent_health_log (
        id SERIAL PRIMARY KEY,
        agent_id VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL,
        error_count INTEGER DEFAULT 0,
        memory_usage BIGINT DEFAULT 0,
        task_queue INTEGER DEFAULT 0,
        response_time_ms INTEGER,
        metadata JSONB DEFAULT '{}',
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_health_agent ON agent_health_log(agent_id);
      CREATE INDEX IF NOT EXISTS idx_health_recorded ON agent_health_log(recorded_at DESC);

      -- 8. pipeline_execution_log
      CREATE TABLE IF NOT EXISTS pipeline_execution_log (
        id SERIAL PRIMARY KEY,
        execution_id VARCHAR(100) NOT NULL UNIQUE,
        pipeline_id VARCHAR(20) NOT NULL,
        pipeline_name TEXT,
        status VARCHAR(20) NOT NULL,
        current_step INTEGER DEFAULT 0,
        total_steps INTEGER DEFAULT 0,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        duration_ms INTEGER,
        trigger_type VARCHAR(20),
        trigger_detail TEXT,
        results JSONB DEFAULT '{}',
        errors JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pipeline_exec_pipeline ON pipeline_execution_log(pipeline_id);
      CREATE INDEX IF NOT EXISTS idx_pipeline_exec_status ON pipeline_execution_log(status);

      -- updated_at トリガー
      CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_analytics_updated BEFORE UPDATE ON analytics_daily
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      CREATE TRIGGER trg_approval_updated BEFORE UPDATE ON approval_queue
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    `,
    down: `
      DROP TABLE IF EXISTS pipeline_execution_log CASCADE;
      DROP TABLE IF EXISTS agent_health_log CASCADE;
      DROP TABLE IF EXISTS approval_queue CASCADE;
      DROP TABLE IF EXISTS feedback_history CASCADE;
      DROP TABLE IF EXISTS competitor_weekly CASCADE;
      DROP TABLE IF EXISTS ai_visibility_weekly CASCADE;
      DROP TABLE IF EXISTS search_console_daily CASCADE;
      DROP TABLE IF EXISTS analytics_daily CASCADE;
      DROP FUNCTION IF EXISTS update_updated_at CASCADE;
      DROP TABLE IF EXISTS _migrations CASCADE;
    `,
  },
];

// ─── マイグレーション実行 ───

export async function migrateUp(): Promise<{ applied: number; current: number }> {
  const { sql } = await getDatabase();
  if (!sql) return { applied: 0, current: 0 };

  let applied = 0;
  for (const migration of MIGRATIONS) {
    // マイグレーション管理テーブルが存在するか確認
    const exists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = '_migrations'
      ) as exists
    `;

    if (exists[0]?.exists) {
      const alreadyApplied = await sql`
        SELECT version FROM _migrations WHERE version = ${migration.version}
      `;
      if (alreadyApplied.length > 0) continue;
    }

    // マイグレーション実行
    await sql.unsafe(migration.up);

    // 記録
    await sql`
      INSERT INTO _migrations (version, name)
      VALUES (${migration.version}, ${migration.name})
      ON CONFLICT (version) DO NOTHING
    `;

    applied++;
    log.info(`[Migration] Applied v${migration.version}: ${migration.name}`);
  }

  return { applied, current: MIGRATIONS.length };
}

export async function migrateDown(): Promise<void> {
  const { sql } = await getDatabase();
  if (!sql) return;

  // 最後に適用されたマイグレーションを取得
  const last = await sql`
    SELECT version, name FROM _migrations ORDER BY version DESC LIMIT 1
  `;

  if (last.length === 0) {
    log.info('[Migration] ロールバック対象なし');
    return;
  }

  const migration = MIGRATIONS.find(m => m.version === last[0].version);
  if (!migration) {
    throw new Error(`Migration v${last[0].version} の定義が見つかりません`);
  }

  await sql.unsafe(migration.down);
  log.info(`[Migration] Rolled back v${migration.version}: ${migration.name}`);
}

export async function migrateStatus(): Promise<{
  current: number;
  total: number;
  applied: Array<{ version: number; name: string; appliedAt: string }>;
  pending: Array<{ version: number; name: string }>;
}> {
  const { sql } = await getDatabase();
  if (!sql) {
    return {
      current: 0,
      total: MIGRATIONS.length,
      applied: [],
      pending: MIGRATIONS.map(m => ({ version: m.version, name: m.name })),
    };
  }

  try {
    const applied = await sql`
      SELECT version, name, applied_at FROM _migrations ORDER BY version
    `;

    const appliedVersions = new Set(applied.map((r: { version: number }) => r.version));
    const pending = MIGRATIONS.filter(m => !appliedVersions.has(m.version));

    return {
      current: applied.length,
      total: MIGRATIONS.length,
      applied: applied.map((r: { version: number; name: string; applied_at: string }) => ({
        version: r.version,
        name: r.name,
        appliedAt: r.applied_at,
      })),
      pending: pending.map(m => ({ version: m.version, name: m.name })),
    };
  } catch {
    // _migrationsテーブルが存在しない場合
    return {
      current: 0,
      total: MIGRATIONS.length,
      applied: [],
      pending: MIGRATIONS.map(m => ({ version: m.version, name: m.name })),
    };
  }
}

export async function migrateReset(): Promise<void> {
  const { sql } = await getDatabase();
  if (!sql) return;

  // 逆順でロールバック
  for (let i = MIGRATIONS.length - 1; i >= 0; i--) {
    try {
      await sql.unsafe(MIGRATIONS[i].down);
      log.info(`[Migration] Reset v${MIGRATIONS[i].version}: ${MIGRATIONS[i].name}`);
    } catch (err) {
      log.warn(`[Migration] Reset warning: ${err instanceof Error ? err.message : err}`);
    }
  }

  // 再適用
  await migrateUp();
}
