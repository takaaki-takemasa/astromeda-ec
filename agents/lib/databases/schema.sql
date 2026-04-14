-- ============================================================
-- Astromeda Agent System — PostgreSQL Schema (造血器官=骨髄)
--
-- 医学メタファー: これはシステムの骨髄。
-- 骨髄が血液（データ）を生産し、全臓器（エージェント）に供給する。
-- テーブル = 血球の種類、行 = 個々の血球。
--
-- 設計書v5準拠: 6テーブル + 拡張2テーブル
-- ============================================================

-- 1. analytics_daily — 日別アクセス解析（赤血球=酸素運搬=ビジネスデータ）
CREATE TABLE IF NOT EXISTS analytics_daily (
  id              SERIAL PRIMARY KEY,
  date            DATE NOT NULL UNIQUE,
  sessions        INTEGER NOT NULL DEFAULT 0,
  users           INTEGER NOT NULL DEFAULT 0,
  new_users       INTEGER NOT NULL DEFAULT 0,
  pageviews       INTEGER NOT NULL DEFAULT 0,
  bounce_rate     NUMERIC(5,4) DEFAULT 0,        -- 0.0000〜1.0000
  avg_session_sec NUMERIC(8,2) DEFAULT 0,
  orders          INTEGER NOT NULL DEFAULT 0,
  revenue_jpy     NUMERIC(12,0) NOT NULL DEFAULT 0,
  aov_jpy         NUMERIC(10,0) DEFAULT 0,       -- Average Order Value
  conversion_rate NUMERIC(5,4) DEFAULT 0,
  device_breakdown JSONB DEFAULT '{}',            -- {"desktop":0.6,"mobile":0.35,"tablet":0.05}
  source_breakdown JSONB DEFAULT '{}',            -- {"organic":0.4,"paid":0.3,"direct":0.2,"social":0.1}
  top_pages       JSONB DEFAULT '[]',             -- [{"path":"/","views":1000},...]
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_date ON analytics_daily(date DESC);

-- 2. search_console_daily — 検索パフォーマンス（白血球=免疫情報=外部からの流入データ）
CREATE TABLE IF NOT EXISTS search_console_daily (
  id              SERIAL PRIMARY KEY,
  date            DATE NOT NULL,
  query           TEXT NOT NULL,
  page            TEXT,
  clicks          INTEGER NOT NULL DEFAULT 0,
  impressions     INTEGER NOT NULL DEFAULT 0,
  ctr             NUMERIC(5,4) DEFAULT 0,
  position        NUMERIC(6,2) DEFAULT 0,
  device          VARCHAR(20) DEFAULT 'all',      -- desktop, mobile, tablet, all
  country         VARCHAR(5) DEFAULT 'jpn',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(date, query, page, device, country)
);

CREATE INDEX IF NOT EXISTS idx_gsc_date ON search_console_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_gsc_query ON search_console_daily(query);

-- 3. ai_visibility_weekly — AI検索での露出度（血小板=修復能力=AI経由の発見性）
CREATE TABLE IF NOT EXISTS ai_visibility_weekly (
  id              SERIAL PRIMARY KEY,
  week_start      DATE NOT NULL,
  ai_engine       VARCHAR(30) NOT NULL,           -- chatgpt, claude, gemini, perplexity
  query           TEXT NOT NULL,
  mentioned       BOOLEAN DEFAULT FALSE,
  rank_position   INTEGER,                        -- null = 言及なし
  context_snippet TEXT,                            -- AI回答の該当部分
  competitor_mentions JSONB DEFAULT '[]',          -- 同クエリで言及された競合
  confidence      NUMERIC(3,2) DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(week_start, ai_engine, query)
);

CREATE INDEX IF NOT EXISTS idx_ai_vis_week ON ai_visibility_weekly(week_start DESC);

-- 4. competitor_weekly — 競合PC価格・在庫（抗体=防御データ=競合情報）
CREATE TABLE IF NOT EXISTS competitor_weekly (
  id              SERIAL PRIMARY KEY,
  week_start      DATE NOT NULL,
  competitor      VARCHAR(50) NOT NULL,            -- dospara, mouse, pc-koubou, tsukumo, sycom, frontier, hp
  product_name    TEXT NOT NULL,
  price_jpy       NUMERIC(10,0),
  price_change    NUMERIC(10,0) DEFAULT 0,         -- 前週比
  in_stock        BOOLEAN DEFAULT TRUE,
  cpu             VARCHAR(100),
  gpu             VARCHAR(100),
  ram_gb          INTEGER,
  storage_desc    TEXT,
  url             TEXT,
  scraped_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(week_start, competitor, product_name)
);

CREATE INDEX IF NOT EXISTS idx_comp_week ON competitor_weekly(week_start DESC);
CREATE INDEX IF NOT EXISTS idx_comp_competitor ON competitor_weekly(competitor);

-- 5. feedback_history — 承認フィードバック履歴（記憶B細胞=学習記憶=改善の源泉）
CREATE TABLE IF NOT EXISTS feedback_history (
  id              SERIAL PRIMARY KEY,
  agent_id        VARCHAR(100) NOT NULL,
  action_type     VARCHAR(50) NOT NULL,            -- content, seo, design, pricing, promotion, deployment
  content_hash    VARCHAR(64),                     -- 対象コンテンツのSHA256
  decision        VARCHAR(20) NOT NULL,            -- approved, rejected, modified
  confidence      NUMERIC(3,2) DEFAULT 0,          -- AI信頼度 0.00〜1.00
  approver        VARCHAR(100),                    -- 承認者ID or 'auto'
  feedback_text   TEXT,                            -- 人間のフィードバックコメント
  modifications   JSONB DEFAULT '{}',              -- 修正内容
  prompt_version  VARCHAR(20),                     -- プロンプトテンプレートバージョン
  execution_time_ms INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_agent ON feedback_history(agent_id);
CREATE INDEX IF NOT EXISTS idx_feedback_action ON feedback_history(action_type);
CREATE INDEX IF NOT EXISTS idx_feedback_decision ON feedback_history(decision);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_history(created_at DESC);

-- 6. approval_queue — 承認待ちキュー（免疫シグナル=判断待ちの外部刺激）
CREATE TABLE IF NOT EXISTS approval_queue (
  id              SERIAL PRIMARY KEY,
  request_id      VARCHAR(100) NOT NULL UNIQUE,
  agent_id        VARCHAR(100) NOT NULL,
  action_type     VARCHAR(50) NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  content_preview TEXT,                            -- 承認対象のプレビュー
  confidence      NUMERIC(3,2) DEFAULT 0,
  risk_level      VARCHAR(20) DEFAULT 'medium',    -- low, medium, high, critical
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, approved, rejected, expired
  auto_approve    BOOLEAN DEFAULT FALSE,
  slack_message_ts VARCHAR(50),                    -- Slack message timestamp
  slack_channel   VARCHAR(50),
  decided_by      VARCHAR(100),
  decided_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_queue(status);
CREATE INDEX IF NOT EXISTS idx_approval_agent ON approval_queue(agent_id);
CREATE INDEX IF NOT EXISTS idx_approval_created ON approval_queue(created_at DESC);

-- 7. agent_health_log — エージェント健全性ログ（バイタルサイン記録）
CREATE TABLE IF NOT EXISTS agent_health_log (
  id              SERIAL PRIMARY KEY,
  agent_id        VARCHAR(100) NOT NULL,
  status          VARCHAR(20) NOT NULL,            -- healthy, degraded, error, shutdown
  error_count     INTEGER DEFAULT 0,
  memory_usage    BIGINT DEFAULT 0,
  task_queue      INTEGER DEFAULT 0,
  response_time_ms INTEGER,
  metadata        JSONB DEFAULT '{}',
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_agent ON agent_health_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_health_recorded ON agent_health_log(recorded_at DESC);

-- 8. pipeline_execution_log — パイプライン実行ログ（循環器系ログ）
CREATE TABLE IF NOT EXISTS pipeline_execution_log (
  id              SERIAL PRIMARY KEY,
  execution_id    VARCHAR(100) NOT NULL UNIQUE,
  pipeline_id     VARCHAR(20) NOT NULL,
  pipeline_name   TEXT,
  status          VARCHAR(20) NOT NULL,            -- running, completed, failed, rolled_back
  current_step    INTEGER DEFAULT 0,
  total_steps     INTEGER DEFAULT 0,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  duration_ms     INTEGER,
  trigger_type    VARCHAR(20),                     -- event, schedule, manual, cascade
  trigger_detail  TEXT,
  results         JSONB DEFAULT '{}',
  errors          JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_exec_pipeline ON pipeline_execution_log(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_exec_status ON pipeline_execution_log(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_exec_started ON pipeline_execution_log(started_at DESC);

-- ── 自動更新トリガー ──
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- analytics_daily
DROP TRIGGER IF EXISTS trg_analytics_daily_updated ON analytics_daily;
CREATE TRIGGER trg_analytics_daily_updated
  BEFORE UPDATE ON analytics_daily
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- approval_queue
DROP TRIGGER IF EXISTS trg_approval_queue_updated ON approval_queue;
CREATE TRIGGER trg_approval_queue_updated
  BEFORE UPDATE ON approval_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
