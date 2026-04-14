/**
 * SystemInitializer — 統合初期化オーケストレータ（受精→出生の全プロセス管理）
 *
 * 医学メタファー: 受精卵が着床→胎盤形成→臓器分化→神経接続→免疫確立→出生
 * という厳密な順序で発達するように、システム初期化にも正しい順序がある。
 *
 * 順序を間違えると「障害」が生まれる:
 * - DBの前にAgentを初期化 → 状態永続化不能
 * - AgentBusの前にSSEBridge → イベント受信不能
 * - Hydrationの前にAdmin API → モックデータしか返せない
 *
 * このモジュールが正しい発生順序を保証する。
 */

import { initStorageFromEnv, getStorage, getStorageType } from './storage.js';
import { getAgentBus } from './agent-bus.js';
import { getDB, resetDB } from '../lib/databases/db-adapter.js';
import { hydrateAgentData } from './agent-data-hydrator.js';
import { getSSEBridge } from './sse-bridge.js';
import { getChannelOrchestrator, DashboardChannelSender, SlackChannelSender, EmailChannelSender, WebhookChannelSender, resetChannelOrchestrator } from './notification-channels.js';
import { getCronRunner } from './cron-runner.js';
import { getNotificationRouter } from './notification-router.js';
import { getConfigReloader } from './config-reloader.js';
import { getStatePersistence } from './state-persistence.js';
import { getActionLogger } from './action-logger.js';

export interface InitializationResult {
  success: boolean;
  phases: Array<{
    name: string;
    status: 'success' | 'failure' | 'skipped';
    durationMs: number;
    error?: string;
  }>;
  totalDurationMs: number;
  storageType: string;
  agentsInitialized: number;
}

/** 初期化済みフラグ（二重初期化防止） */
let initialized = false;
let initResult: InitializationResult | null = null;

/**
 * システム全体を正しい順序で初期化
 *
 * 発生順序（医療成熟モデル準拠）:
 * 1. Storage（骨格系）— データ永続化の土台
 * 2. DB Adapter（遺伝子発現）— 型安全なDB操作
 * 3. AgentBus（神経系）— 全エージェント間通信
 * 4. Data Hydration（造血）— 初期データ注入
 * 5. SSE Bridge（神経管）— リアルタイム配信接続
 * 6. Notification Channels（感覚神経）— 多チャネル通知
 * 7. CronRunner（松果体）— スケジュール実行起動
 */
export async function initializeSystem(env: Record<string, unknown> = {}): Promise<InitializationResult> {
  if (initialized && initResult) {
    return initResult;
  }

  const start = Date.now();
  const phases: InitializationResult['phases'] = [];

  // ─── Phase 1: Storage（骨格系） ───
  const p1Start = Date.now();
  try {
    await initStorageFromEnv(env);
    phases.push({ name: 'Storage', status: 'success', durationMs: Date.now() - p1Start });
  } catch (err) {
    phases.push({ name: 'Storage', status: 'failure', durationMs: Date.now() - p1Start, error: err instanceof Error ? err.message : String(err) });
  }

  // ─── Phase 2: DB Adapter（遺伝子発現） ───
  const p2Start = Date.now();
  try {
    resetDB();
    getDB(getStorage());
    phases.push({ name: 'DB Adapter', status: 'success', durationMs: Date.now() - p2Start });
  } catch (err) {
    phases.push({ name: 'DB Adapter', status: 'failure', durationMs: Date.now() - p2Start, error: err instanceof Error ? err.message : String(err) });
  }

  // ─── Phase 3: AgentBus（神経系） ───
  const p3Start = Date.now();
  const bus = getAgentBus(); // シングルトン取得 — 全Phaseで使う共有参照
  try {
    phases.push({ name: 'AgentBus', status: 'success', durationMs: Date.now() - p3Start });
  } catch (err) {
    phases.push({ name: 'AgentBus', status: 'failure', durationMs: Date.now() - p3Start, error: err instanceof Error ? err.message : String(err) });
  }

  // ─── Phase 4: Data Hydration（造血） ───
  const p4Start = Date.now();
  let agentsInitialized = 0;
  try {
    const hydrationResult = await hydrateAgentData(env);
    agentsInitialized = hydrationResult.hydratedModules.length;
    const status = hydrationResult.success ? 'success' : 'failure';
    phases.push({
      name: 'Data Hydration',
      status: status as 'success' | 'failure',
      durationMs: Date.now() - p4Start,
      error: hydrationResult.failedModules.length > 0
        ? hydrationResult.failedModules.map(m => `${m.module}: ${m.error}`).join('; ')
        : undefined,
    });
  } catch (err) {
    phases.push({ name: 'Data Hydration', status: 'failure', durationMs: Date.now() - p4Start, error: err instanceof Error ? err.message : String(err) });
  }

  // ─── Phase 5: SSE Bridge（神経管） ───
  const p5Start = Date.now();
  try {
    const bridge = getSSEBridge();
    bridge.start();
    phases.push({ name: 'SSE Bridge', status: 'success', durationMs: Date.now() - p5Start });
  } catch (err) {
    phases.push({ name: 'SSE Bridge', status: 'failure', durationMs: Date.now() - p5Start, error: err instanceof Error ? err.message : String(err) });
  }

  // ─── Phase 6: Notification Channels（感覚神経） ───
  const p6Start = Date.now();
  try {
    resetChannelOrchestrator();
    const orchestrator = getChannelOrchestrator();
    // 環境変数からチャネル設定を読み込み
    const slackUrl = env.SLACK_WEBHOOK_URL as string | undefined;
    if (slackUrl) {
      orchestrator.registerSender(new SlackChannelSender(slackUrl));
    }
    orchestrator.registerSender(new DashboardChannelSender());
    // N-02: NotificationRouterをAgentBusに接続（通知の自動ルーティング）
    const notificationRouter = getNotificationRouter();
    notificationRouter.connectBus(bus);
    phases.push({ name: 'Notification Channels', status: 'success', durationMs: Date.now() - p6Start });
  } catch (err) {
    phases.push({ name: 'Notification Channels', status: 'failure', durationMs: Date.now() - p6Start, error: err instanceof Error ? err.message : String(err) });
  }

  // ─── Phase 7: CronRunner（松果体） ───
  const p7Start = Date.now();
  try {
    const cronRunner = getCronRunner();
    cronRunner.start(60_000); // N-01: 60秒間隔でtick()自動実行
    phases.push({ name: 'CronRunner', status: 'success', durationMs: Date.now() - p7Start });
  } catch (err) {
    phases.push({ name: 'CronRunner', status: 'failure', durationMs: Date.now() - p7Start, error: err instanceof Error ? err.message : String(err) });
  }

  // ─── I-04: Storage自動purge購読（代謝廃棄物の排泄経路接続） ───
  try {
    bus.subscribe('pipeline.execute', async (event) => {
      const payload = event.payload as { pipelineId?: string; scheduleId?: string } | undefined;
      const scheduleId = payload?.scheduleId ?? '';
      if (scheduleId === 'cron-storage-purge-health') {
        try { await getStatePersistence().purgeOldHealthHistory(24 * 60 * 60 * 1000); } catch { /* purge失敗は無視 */ }
      } else if (scheduleId === 'cron-storage-purge-events') {
        try { await getStatePersistence().purgeOldSystemEvents(7 * 24 * 60 * 60 * 1000); } catch { /* purge失敗は無視 */ }
      } else if (scheduleId === 'cron-storage-purge-actions') {
        try { await getActionLogger().purgeOldLogs(7 * 24 * 60 * 60 * 1000); } catch { /* purge失敗は無視 */ }
      }
    });
  } catch { /* purge購読失敗はシステム起動を阻害しない */ }

  // ─── Phase 8: ConfigReloader（視床下部の恒常性維持） ───
  const p8Start = Date.now();
  try {
    const configReloader = getConfigReloader();
    configReloader.connectBus(bus);
    configReloader.startPolling(30_000); // N-04: 30秒間隔で設定変更を監視
    phases.push({ name: 'ConfigReloader', status: 'success', durationMs: Date.now() - p8Start });
  } catch (err) {
    phases.push({ name: 'ConfigReloader', status: 'failure', durationMs: Date.now() - p8Start, error: err instanceof Error ? err.message : String(err) });
  }

  const totalDurationMs = Date.now() - start;
  const success = phases.every(p => p.status === 'success');

  initResult = {
    success,
    phases,
    totalDurationMs,
    storageType: getStorageType(),
    agentsInitialized,
  };

  initialized = true;
  return initResult;
}

/** 初期化済みか */
export function isSystemInitialized(): boolean {
  return initialized;
}

/** 最後の初期化結果 */
export function getInitResult(): InitializationResult | null {
  return initResult;
}

/** リセット（テスト用） */
export function resetSystemInitializer(): void {
  initialized = false;
  initResult = null;
}
