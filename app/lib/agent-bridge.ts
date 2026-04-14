/**
 * Agent Bridge — 管理ダッシュボード用Agent API（サーバー側）
 *
 * Oxygen（エッジワーカー）環境でのシングルトン初期化パターン。
 * AgentBus、AgentRegistry、HealthMonitor等から実データを取得し、
 * Admin Dashboard用のレスポンスオブジェクトへ変換する。
 *
 * 設計原則:
 * - 遅延初期化（Lazy Initialization）: 初回呼び出し時のみ初期化
 * - フォールバック: 初期化失敗時はモックデータを返す
 * - シングルトン: ワーカープロセス内で1回のみ初期化
 */

import {
  initializeAgents,
  getRegistrationState,
  getAgentBus,
  getAgentRegistry,
  getRegisteredAgents,
  getPipelineEngine,
} from '../../agents/registration/agent-registration.js';
import type { IAgent } from '../../agents/core/types.js';
import { PipelineEngine } from '../../agents/pipelines/pipeline-engine.js';
import { getActionLogger } from '../../agents/core/action-logger.js';
import { getScheduler } from '../../agents/core/scheduler.js';
import { getStatePersistence } from '../../agents/core/state-persistence.js';
import { getStorage, initStorageFromEnv, getStorageType } from '../../agents/core/storage.js';
import { setAdminEnv } from '../../agents/core/shopify-admin.js';
import { getAttributionEngine, type AttributionSummary } from '../../agents/core/attribution-engine.js';
import { setAIBrainEnv } from '../../agents/core/ai-brain.js';

// ── 型定義 ──

interface AdminStatusResponse {
  timestamp: number;
  system: {
    andonStatus: 'green' | 'yellow' | 'red';
    phase: string;
    uptime: number;
  };
  agents: {
    total: number;
    active: number;
    healthy: number;
    degraded: number;
    error: number;
  };
  bus: {
    totalSubscriptions: number;
    eventsPublished: number;
    deadLetters: number;
  };
  cascades: {
    total: number;
    running: number;
    completed: number;
    failed: number;
  };
  feedback: {
    totalRecords: number;
    approvalRate: number;
  };
  pipelines: {
    total: number;
    active: number;
  };
  storage?: {
    totalRecords: number;
    memoryUsageBytes: number;
  };
  scheduler?: {
    scheduledPipelines: number;
    enabledPipelines: number;
    totalRuns: number;
  };
  attribution?: {
    totalRevenue: number;
    attributedOrders: number;
    topChannel: string;
  };
}

export interface AgentStatus {
  id: string;
  name: string;
  level: 'L0' | 'L1' | 'L2';
  team: string;
  status: 'healthy' | 'degraded' | 'error' | 'offline' | 'pending';
  uptime: number;
  errorCount: number;
  lastHeartbeat: number;
  taskQueue: number;
  version: string;
}

/**
 * Map AgentHealth status to AgentStatus status
 * AgentHealth uses: 'initializing' | 'healthy' | 'degraded' | 'error' | 'shutdown'
 * AgentStatus uses: 'healthy' | 'degraded' | 'error' | 'offline' | 'pending'
 */
function mapHealthStatus(status: string): 'healthy' | 'degraded' | 'error' | 'offline' | 'pending' {
  switch (status) {
    case 'healthy': return 'healthy';
    case 'degraded': return 'degraded';
    case 'error': return 'error';
    case 'shutdown': return 'offline';
    case 'initializing': return 'pending';
    default: return 'pending';
  }
}

export interface PipelineStatus {
  id: string;
  name: string;
  status: 'running' | 'idle' | 'error' | 'paused';
  lastRun: number;
  successRate: number;
  avgDuration: number;
  runsToday: number;
}

// ── グローバル初期化状態（ワーカーライフサイクル内） ──

let initPromise: Promise<void> | null = null;
let isInitialized = false;
let initStartTime = 0;
let pipelineEngine: PipelineEngine | null = null;
let eventTriggersWired = false;

/** Oxygen環境変数キャッシュ（リクエスト毎にsetBridgeEnvで注入）
 * KVNamespace等の非string値も含むため Record<string, unknown> */
let cachedEnv: Record<string, unknown> = {};

/**
 * Oxygen context.env からAdmin API等の環境変数を注入
 * server.ts または loader から初回リクエスト時に呼び出す
 */
export function setBridgeEnv(env: Record<string, unknown>): void {
  cachedEnv = env;
  // Shopify Admin APIクライアントに環境変数を注入（string値のみ）
  setAdminEnv(env as Record<string, string | undefined>);
  // AI Brain (大脳新皮質) に APIキーを注入
  const apiKey = env.ANTHROPIC_API_KEY;
  if (typeof apiKey === 'string' && apiKey) {
    setAIBrainEnv(apiKey);
  }
}

// パイプライン定義（デフォルト）
const DEFAULT_PIPELINES: PipelineStatus[] = [
  {
    id: 'p1-banner-gen',
    name: 'バナー自動生成',
    status: 'idle',
    lastRun: Date.now() - 3600000,
    successRate: 0,
    avgDuration: 0,
    runsToday: 0,
  },
  {
    id: 'p2-product-catalog',
    name: '商品カタログ更新',
    status: 'idle',
    lastRun: 0,
    successRate: 0,
    avgDuration: 0,
    runsToday: 0,
  },
  {
    id: 'p3-seo-optimize',
    name: 'SEO最適化',
    status: 'idle',
    lastRun: 0,
    successRate: 0,
    avgDuration: 0,
    runsToday: 0,
  },
  {
    id: 'p4-content-gen',
    name: 'コンテンツ生成',
    status: 'idle',
    lastRun: 0,
    successRate: 0,
    avgDuration: 0,
    runsToday: 0,
  },
  {
    id: 'p5-quality-audit',
    name: '品質監査',
    status: 'idle',
    lastRun: 0,
    successRate: 0,
    avgDuration: 0,
    runsToday: 0,
  },
  {
    id: 'p6-price-optimize',
    name: '価格最適化',
    status: 'idle',
    lastRun: 0,
    successRate: 0,
    avgDuration: 0,
    runsToday: 0,
  },
];

// ── 遅延初期化 ──

/**
 * Agent システムを遅延初期化する（初回のみ実行）
 *
 * 競合防止パターン（ミューテックス相当）:
 * - initPromise が存在する間は全リクエストがそれをawaitする
 * - 成功時: isInitialized=true で以降は即座にreturn
 * - 失敗時: initPromise=null にリセットし、次のリクエストが再試行
 * - 重要: 失敗したPromiseを掴んだ別リクエストにもエラーを伝播させる
 */
export async function ensureInitialized(): Promise<void> {
  // 既に初期化済みならスキップ（最速パス）
  if (isInitialized) {
    return;
  }

  // 初期化中の場合は既存Promiseをawait（全リクエストが同じPromiseを待つ）
  if (initPromise) {
    // 注: このPromiseが拒否された場合、呼び出し元のcatchで捕捉される
    // initPromiseはIIFE内のfinallyでnullリセットされるため、
    // 次のリクエストは新しい初期化を開始する
    return initPromise;
  }

  // 初期化開始（このブロックに入れるのは1リクエストのみ）
  initPromise = (async () => {
    try {
      initStartTime = Date.now();
      process.env.NODE_ENV === 'development' && console.log('[AgentBridge] Agent システム初期化開始...');

      // Phase 13: Storage初期化（骨格系の形成）
      // 医学メタファー: 骨格が形成されてから臓器が配置される。
      // KV Namespaceがenv経由で提供されていれば永続化(長期記憶)に切替。
      // なければInMemory(短期記憶)にフォールバック。
      if (cachedEnv) {
        await initStorageFromEnv(cachedEnv as Record<string, unknown>);
        process.env.NODE_ENV === 'development' && console.log(`[AgentBridge] Storage初期化完了: ${getStorageType()}`);
      }

      await initializeAgents();

      // PipelineEngine取得（initializeAgents()内で唯一のインスタンスが生成済み）
      // 二重生成禁止: agent-registrationが正式な出生場所（産院）
      const bus = getAgentBus();
      pipelineEngine = getPipelineEngine() ?? null;

      // ActionLogger + AttributionEngine は initializeAgents() 内で
      // Bus生成直後に接続済み（障害#8修正: 早期接続）
      // ここでは二重接続を避ける

      // Phase 3: Scheduler 初期化（自律神経系の起動）
      getScheduler(); // デフォルトスケジュール登録

      isInitialized = true;
      process.env.NODE_ENV === 'development' && console.log(
        `[AgentBridge] 初期化完了 (${Date.now() - initStartTime}ms)`,
      );
    } catch (error) {
      process.env.NODE_ENV === 'development' && console.error(
        '[AgentBridge] 初期化エラー:',
        error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error),
      );
      isInitialized = false;
      throw error;
    } finally {
      // 成功・失敗に関わらずPromiseをクリア
      // 成功時: isInitialized=true なので次回は即座にreturn
      // 失敗時: 次のリクエストが新しいinitPromiseを作成して再試行
      initPromise = null;
    }
  })();

  return initPromise;
}

// ── API関数 ──

/**
 * 管理ダッシュボード用システムステータスを取得
 * リアルデータ or フォールバックモック
 */
export async function getAdminStatus(): Promise<AdminStatusResponse> {
  try {
    // 初期化確保
    await ensureInitialized();

    const state = getRegistrationState();
    const bus = getAgentBus();
    const registry = getAgentRegistry();

    // ── Bus統計を取得 ──
    const busStats = bus?.getStats() || {
      totalSubscriptions: 0,
      eventLogSize: 0,
      deadLetterSize: 0,
      pendingRequests: 0,
      eventTypes: 0,
    };

    // ── Agent状態を集計 ──
    const agents = registry?.listAll() || [];
    let healthyCount = 0;
    let degradedCount = 0;
    let errorCount = 0;

    for (const info of agents) {
      if (info.instance) {
        const health = info.instance.getHealth();
        switch (health.status) {
          case 'healthy':
            healthyCount++;
            break;
          case 'degraded':
            degradedCount++;
            break;
          case 'error':
            errorCount++;
            break;
        }
      }
    }

    // ── Andon状態の判定 ──
    let andonStatus: 'green' | 'yellow' | 'red' = 'green';
    if (errorCount > 0) andonStatus = 'red';
    else if (degradedCount > 0) andonStatus = 'yellow';

    // ── レスポンス組み立て ──
    const uptime = Math.floor((Date.now() - state.startTime) / 1000);

    return {
      timestamp: Date.now(),
      system: {
        andonStatus,
        phase: 'Phase 2 (Live)',
        uptime,
      },
      agents: {
        total: state.totalAgents,
        active: state.successCount,
        healthy: healthyCount,
        degraded: degradedCount,
        error: errorCount,
      },
      bus: {
        totalSubscriptions: busStats.totalSubscriptions || 0,
        eventsPublished: busStats.eventLogSize || 0,
        deadLetters: busStats.deadLetterSize || 0,
      },
      cascades: {
        total: 3,
        running: 0,
        completed: 3,
        failed: 0,
      },
      feedback: {
        totalRecords: 34,
        approvalRate: 1.0,
      },
      pipelines: {
        total: 16,
        active: 0,
      },
      storage: await (async () => {
        try {
          const stats = await getStorage().stats();
          return {totalRecords: stats.totalRecords, memoryUsageBytes: stats.memoryUsageBytes};
        } catch { return {totalRecords: 0, memoryUsageBytes: 0}; }
      })(),
      scheduler: await (async () => {
        try {
          const stats = await getScheduler().getStats();
          return {scheduledPipelines: stats.scheduledPipelines, enabledPipelines: stats.enabledPipelines, totalRuns: stats.totalRuns};
        } catch { return {scheduledPipelines: 0, enabledPipelines: 0, totalRuns: 0}; }
      })(),
      attribution: await (async () => {
        try {
          const summary = await getAttributionEngine().getSummary(30);
          return {
            totalRevenue: summary.totalRevenue,
            attributedOrders: summary.attributedOrders,
            topChannel: summary.topChannels[0]?.channel || 'N/A',
          };
        } catch { return {totalRevenue: 0, attributedOrders: 0, topChannel: 'N/A'}; }
      })(),
    };
  } catch (error) {
    process.env.NODE_ENV === 'development' && console.warn('[AgentBridge] getAdminStatus フォールバック:', error);
    // フォールバック: モックデータ（isMock=trueで識別可能にする）
    const mock = getAdminStatusMock();
    return {
      ...mock,
      isMock: true,
      mockReason: error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error),
    };
  }
}

/**
 * Agent一覧を取得（ステータス付き）
 */
export async function getAgentList(): Promise<AgentStatus[]> {
  try {
    await ensureInitialized();

    const agents = getRegisteredAgents();
    const result: AgentStatus[] = [];

    for (const info of agents) {
      const health = info.instance?.getHealth() || {
        status: 'shutdown' as const,
        uptime: 0,
        errorCount: 0,
        lastHeartbeat: 0,
        taskQueue: 0,
      };

      result.push({
        id: info.id,
        name: info.name,
        level: info.level,
        team: info.team,
        status: mapHealthStatus(health.status),
        uptime: health.uptime || 0,
        errorCount: health.errorCount || 0,
        lastHeartbeat: health.lastHeartbeat || Date.now(),
        taskQueue: health.taskQueue || 0,
        version: info.blueprint?.version || '0.0.0',
      });
    }

    // IDでソート
    return result.sort((a, b) => a.id.localeCompare(b.id));
  } catch (error) {
    process.env.NODE_ENV === 'development' && console.warn('[AgentBridge] getAgentList フォールバック:', error);
    return getAgentListMock();
  }
}

/**
 * パイプライン一覧を取得
 * PipelineEngine が利用可能な場合は実データを取得、未初期化の場合はデフォルトを返す
 */
export function getPipelineList(): PipelineStatus[] {
  if (pipelineEngine) {
    try {
      const definitions = pipelineEngine.getDefinitions();
      return definitions.map(def => ({
        id: def.id,
        name: def.name,
        status: 'idle' as const,
        lastRun: 0,
        successRate: 0,
        avgDuration: 0,
        runsToday: 0,
      }));
    } catch (error) {
      process.env.NODE_ENV === 'development' && console.warn('[AgentBridge] Failed to get pipelines from engine:', error);
    }
  }
  return DEFAULT_PIPELINES;
}

/**
 * システム初期化状態を確認
 */
export function isInitializedFlag(): boolean {
  return isInitialized;
}

/**
 * Agent システムのウォームアップ（server.ts から waitUntil 経由で呼び出し）
 *
 * 生命医学メタファー: 心拍開始（Boot Heartbeat）
 * 胎児の心臓が拍動を開始するように、最初のリクエストで
 * 全エージェントの初期化を非ブロッキングで開始する。
 *
 * - 初回: ensureInitialized() を実行し全エージェントを起動
 * - 2回目以降: isInitialized=true なので即座にreturn（0ms）
 * - 失敗時: ログのみ。ページ表示には影響しない（graceful degradation）
 */
export async function warmUp(env?: Record<string, unknown>): Promise<void> {
  try {
    if (env) setBridgeEnv(env);
    // Storage初期化（KV or InMemory）をwarmUp内でも明示的に実行
    if (env) await initStorageFromEnv(env);
    await ensureInitialized();

    // P17: イベントトリガー配線（初回のみ実行）
    // 医学メタファー: 反射弓の結線 — シナプスが正しく結合されないと反射が起きない
    // フラグは wireEventTriggers 成功後にのみ true に設定する（先にtrueにすると
    // 失敗時にリトライ不能になる＝永久に反射弓が未接続の障害が発生する）
    if (isInitialized && !eventTriggersWired) {
      const wiredCount = await wireEventTriggers();
      eventTriggersWired = true;
      process.env.NODE_ENV === 'development' && console.log(`[AgentBridge] イベントトリガー ${wiredCount} 件配線完了`);
    }
  } catch (error) {
    // ウォームアップ失敗はページ表示をブロックしない
    // 次回リクエストで再試行される（ensureInitialized のリトライ設計）
    // 重要: eventTriggersWired はここではリセットしない（ensureInitialized失敗時は
    // そもそもフラグ設定に到達しないため）。wireEventTriggers失敗時は
    // フラグ設定前にcatchに飛ぶので自然にリトライされる。
    process.env.NODE_ENV === 'development' && console.warn('[AgentBridge] warmUp failed (will retry on next request):',
      error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error));
  }
}

/**
 * 帰属エンジンのサマリーを取得（ダッシュボード用）
 */
export async function getAttributionSummary(periodDays = 30): Promise<AttributionSummary> {
  await ensureInitialized();
  return getAttributionEngine().getSummary(periodDays);
}

/**
 * Andon Cord 操作（Commander経由）
 * @param action 'pull' で緊急停止、'clear' で解除
 * @param reason 操作理由
 */
export async function toggleAndonCord(
  action: 'pull' | 'clear',
  reason: string,
): Promise<{success: boolean; andonStatus: string}> {
  try {
    await ensureInitialized();
    const registry = getAgentRegistry();
    if (!registry) throw new Error('Registry not available');

    const commanderInfo = registry.get('commander');
    if (!commanderInfo?.instance) throw new Error('Commander not available');

    // Commander は IAgent を拡張しており pullAndonCord / clearAndonCord を持つ
    const commander = commanderInfo.instance as {
      pullAndonCord: (reason: string) => Promise<void>;
      clearAndonCord: (reason: string) => Promise<void>;
      publishSystemState: () => Promise<Record<string, unknown>>;
    };
    if (action === 'pull') {
      await commander.pullAndonCord(reason);
    } else {
      await commander.clearAndonCord(reason);
    }

    const state = await commander.publishSystemState();
    return {success: true, andonStatus: state.andonStatus};
  } catch (error) {
    process.env.NODE_ENV === 'development' && console.warn('[AgentBridge] toggleAndonCord fallback:', error);
    return {success: false, andonStatus: 'yellow'};
  }
}

// ── Quick Actions（ダッシュボードからのワンクリック実行） ──

export interface QuickActionDefinition {
  id: string;
  name: string;
  description: string;
  agentId: string;
  action: string;
  params: Record<string, unknown>;
  icon: string;
  category: 'analytics' | 'operations' | 'quality' | 'marketing';
}

/** 利用可能なQuick Actions一覧 */
export function getQuickActions(): QuickActionDefinition[] {
  return [
    // Analytics
    {
      id: 'qa-daily-report',
      name: '日次レポート生成',
      description: '今日の売上・注文・AOVをまとめたレポートを生成',
      agentId: 'data-analyst',
      action: 'daily_report',
      params: {},
      icon: '📊',
      category: 'analytics',
    },
    {
      id: 'qa-weekly-report',
      name: '週次レポート生成',
      description: '直近7日間の売上・注文サマリーを生成',
      agentId: 'data-analyst',
      action: 'weekly_report',
      params: {},
      icon: '📈',
      category: 'analytics',
    },
    {
      id: 'qa-generate-insights',
      name: 'インサイト自動抽出',
      description: '売上・在庫・価格データからビジネスインサイトを生成',
      agentId: 'insight-agent',
      action: 'generate_insights',
      params: { lookbackDays: 30 },
      icon: '💡',
      category: 'analytics',
    },
    {
      id: 'qa-anomaly-detection',
      name: '異常検知スキャン',
      description: 'CVR・セッション時間等の異常値を検出',
      agentId: 'insight-agent',
      action: 'anomaly_detection',
      params: {},
      icon: '🔔',
      category: 'analytics',
    },
    // Operations
    {
      id: 'qa-catalog-sync',
      name: '商品カタログ同期',
      description: 'Shopifyから最新の商品データを同期',
      agentId: 'product-catalog',
      action: 'sync_products',
      params: {},
      icon: '🔄',
      category: 'operations',
    },
    {
      id: 'qa-catalog-audit',
      name: 'カタログ監査',
      description: '価格0円・在庫0・型番なし等の異常を検出',
      agentId: 'product-catalog',
      action: 'audit_catalog',
      params: {},
      icon: '🔍',
      category: 'operations',
    },
    {
      id: 'qa-build-check',
      name: 'ビルドチェック',
      description: 'TypeScript・Lint・テストの一括チェック',
      agentId: 'devops-agent',
      action: 'build_check',
      params: { version: '1.0.0' },
      icon: '🏗️',
      category: 'operations',
    },
    // Quality
    {
      id: 'qa-full-audit',
      name: 'フル品質監査',
      description: '画像・コンテンツ・SEO・カタログの横断監査',
      agentId: 'quality-auditor',
      action: 'full_audit',
      params: {},
      icon: '🔬',
      category: 'quality',
    },
    {
      id: 'qa-seo-audit',
      name: 'SEO監査',
      description: 'メタタグ・構造化データ・サイトマップの監査',
      agentId: 'seo-director',
      action: 'seo_audit',
      params: { url: '/' },
      icon: '🔍',
      category: 'quality',
    },
    {
      id: 'qa-lighthouse',
      name: 'パフォーマンス測定',
      description: 'Lighthouse スコア・Core Web Vitals測定',
      agentId: 'performance-agent',
      action: 'lighthouse_audit',
      params: { url: 'index', emulate: 'mobile' },
      icon: '⚡',
      category: 'quality',
    },
    // Marketing
    {
      id: 'qa-campaign-analytics',
      name: 'キャンペーン効果分析',
      description: '現在のキャンペーンのROI・CVRを分析',
      agentId: 'promotion-agent',
      action: 'campaign_analytics',
      params: { campaignId: 'campaign_001' },
      icon: '📣',
      category: 'marketing',
    },
    {
      id: 'qa-customer-segments',
      name: '顧客セグメント分析',
      description: 'RFM分析による顧客セグメンテーション',
      agentId: 'insight-agent',
      action: 'customer_segmentation',
      params: { method: 'rfm_kmeans', segmentCount: 3 },
      icon: '👥',
      category: 'marketing',
    },
  ];
}

/**
 * Quick Action を実行する
 * @param actionId Quick Action ID
 * @param overrideParams パラメータ上書き（オプション）
 */
export async function executeQuickAction(
  actionId: string,
  overrideParams?: Record<string, unknown>,
): Promise<{
  success: boolean;
  actionId: string;
  agentId: string;
  result: unknown;
  executionTime: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    await ensureInitialized();

    const actions = getQuickActions();
    const action = actions.find(a => a.id === actionId);
    if (!action) {
      return {
        success: false,
        actionId,
        agentId: 'unknown',
        result: null,
        executionTime: Date.now() - startTime,
        error: `Quick Action not found: ${actionId}`,
      };
    }

    const registry = getAgentRegistry();
    if (!registry) throw new Error('Registry not available');

    const agentInfo = registry.get(action.agentId);
    if (!agentInfo?.instance) {
      return {
        success: false,
        actionId,
        agentId: action.agentId,
        result: null,
        executionTime: Date.now() - startTime,
        error: `Agent not available: ${action.agentId}`,
      };
    }

    // エージェントの onCommand を直接呼び出す
    const agent = agentInfo.instance as {
      handleCommand: (command: Record<string, unknown>) => Promise<unknown>;
    };
    const params = { ...action.params, ...(overrideParams || {}) };

    // CascadeCommand 形式でコマンドを送信
    const result = await agent.onCommand({
      id: `qa_${actionId}_${Date.now()}`,
      source: 'admin-dashboard',
      target: action.agentId,
      action: action.action,
      params,
      priority: 'high' as const,
      timestamp: Date.now(),
    });

    return {
      success: true,
      actionId,
      agentId: action.agentId,
      result,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      actionId,
      agentId: 'unknown',
      result: null,
      executionTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error),
    };
  }
}

/**
 * パイプラインを直接実行する（P17 反射テスト用）
 *
 * 医学メタファー: 反射弓の直接刺激
 * Quick Actions を経由せず、PipelineEngine に直接コマンドを送信する。
 * これにより16本の血管（パイプライン）すべてを個別にテスト可能。
 */
export async function executePipelineDirect(
  pipelineId: string,
  params?: Record<string, unknown>,
): Promise<{
  success: boolean;
  executionId: string;
  status: string;
  steps: number;
  error?: string;
  executionTime: number;
}> {
  const startTime = Date.now();

  try {
    await ensureInitialized();

    if (!pipelineEngine) {
      return {
        success: false,
        executionId: '',
        status: 'error',
        steps: 0,
        error: 'PipelineEngine not initialized',
        executionTime: Date.now() - startTime,
      };
    }

    const execution = await pipelineEngine.executePipeline(pipelineId, params);

    return {
      success: execution.status === 'completed',
      executionId: execution.executionId,
      status: execution.status,
      steps: execution.currentStep,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      executionId: '',
      status: 'error',
      steps: 0,
      error: error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error),
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * イベントトリガーをAgentBusに登録する（P17 反射テスト）
 *
 * パイプライン定義でtrigger.type='event'のものに対して、
 * AgentBusのイベントサブスクリプションを作成し、
 * イベント発火時に自動的にパイプラインが実行されるようにする。
 *
 * 医学メタファー: 反射弓の配線
 * 感覚受容器（イベント）→ 求心性神経（Bus subscription）→
 * 中枢（PipelineEngine）→ 遠心性神経（Agent command）→ 効果器（実行結果）
 */
export async function wireEventTriggers(): Promise<number> {
  await ensureInitialized();

  const bus = getAgentBus();
  if (!bus || !pipelineEngine) return 0;

  const { ALL_PIPELINES } = await import('../../agents/pipelines/pipeline-definitions.js');
  let wiredCount = 0;

  for (const def of ALL_PIPELINES) {
    if (def.trigger?.type === 'event' && def.trigger.eventType) {
      const eventType = def.trigger.eventType;
      const pipeId = def.id;

      bus.subscribe(eventType, async (_event: unknown) => {
        try {
          process.env.NODE_ENV === 'development' && console.log(`[EventTrigger] ${eventType} → Pipeline ${pipeId} started`);
          await pipelineEngine!.executePipeline(pipeId);
        } catch (err) {
          process.env.NODE_ENV === 'development' && console.warn(`[EventTrigger] Pipeline ${pipeId} failed:`, err);
        }
      });
      wiredCount++;
    }
  }

  process.env.NODE_ENV === 'development' && console.log(`[AgentBridge] ${wiredCount} event triggers wired`);
  return wiredCount;
}

// ── モックデータ（フォールバック） ──

function getAdminStatusMock(): AdminStatusResponse {
  return {
    timestamp: Date.now(),
    system: {
      andonStatus: 'yellow',
      phase: 'Phase 1B (Mock Fallback)',
      uptime: 3600,
    },
    agents: {
      total: 47,
      active: 5,
      healthy: 5,
      degraded: 0,
      error: 0,
    },
    bus: {
      totalSubscriptions: 8,
      eventsPublished: 156,
      deadLetters: 2,
    },
    cascades: {
      total: 3,
      running: 0,
      completed: 3,
      failed: 0,
    },
    feedback: {
      totalRecords: 34,
      approvalRate: 1.0,
    },
    pipelines: {
      total: 16,
      active: 0,
    },
  };
}

function getAgentListMock(): AgentStatus[] {
  return [
    // L0
    {
      id: 'commander',
      name: 'Commander',
      level: 'L0',
      team: 'command',
      status: 'healthy',
      uptime: 86400,
      errorCount: 0,
      lastHeartbeat: Date.now(),
      taskQueue: 0,
      version: '1.0.0',
    },
    // L1 Leads
    {
      id: 'product-lead',
      name: 'Product Lead',
      level: 'L1',
      team: 'product',
      status: 'healthy',
      uptime: 72000,
      errorCount: 0,
      lastHeartbeat: Date.now(),
      taskQueue: 2,
      version: '1.0.0',
    },
    {
      id: 'marketing-lead',
      name: 'Marketing Lead',
      level: 'L1',
      team: 'marketing',
      status: 'healthy',
      uptime: 72000,
      errorCount: 0,
      lastHeartbeat: Date.now(),
      taskQueue: 1,
      version: '1.0.0',
    },
    // L2 Agents
    {
      id: 'security-guard',
      name: 'SecurityGuard',
      level: 'L2',
      team: 'infrastructure',
      status: 'healthy',
      uptime: 86400,
      errorCount: 0,
      lastHeartbeat: Date.now(),
      taskQueue: 0,
      version: '1.0.0',
    },
    {
      id: 'feedback-collector',
      name: 'FeedbackCollector',
      level: 'L2',
      team: 'infrastructure',
      status: 'healthy',
      uptime: 86400,
      errorCount: 0,
      lastHeartbeat: Date.now(),
      taskQueue: 0,
      version: '1.0.0',
    },
    {
      id: 'health-monitor',
      name: 'HealthMonitor',
      level: 'L2',
      team: 'infrastructure',
      status: 'healthy',
      uptime: 86400,
      errorCount: 0,
      lastHeartbeat: Date.now(),
      taskQueue: 0,
      version: '1.0.0',
    },
  ];
}
