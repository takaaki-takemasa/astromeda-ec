/**
 * ActionLogger — エージェントアクション記録システム（神経記録系）
 *
 * 医学的メタファー: 神経記録系は全ての神経伝達を記録する。
 * ActionLoggerはエージェントの全アクションを永続ストレージに記録し、
 * Phase 5の帰属エンジンが「どのエージェントが売上に貢献したか」を
 * 分析できるようにする。
 *
 * 記録対象:
 * 1. タスク実行結果（publishResult）
 * 2. パイプライン実行結果
 * 3. ヘルスチェック異常
 * 4. カスケードコマンド
 * 5. フィードバック（人間の承認/却下）
 *
 * データフロー:
 * Agent.publishResult() → AgentBus → ActionLogger → Storage
 */

import type {IStorageAdapter, StorageRecord, StorageQuery} from './storage';
import {getStorage, TABLES} from './storage';
import type {IAgentBus} from './types';

// ── アクションログレコード型 ──

export interface ActionLogRecord extends StorageRecord {
  /** エージェントID */
  agentId: string;
  /** エージェント名 */
  agentName: string;
  /** エージェントレベル */
  agentLevel: string;
  /** エージェントチーム */
  agentTeam: string;
  /** アクション種別 */
  actionType: 'task_result' | 'pipeline_step' | 'health_alert' | 'cascade' | 'feedback';
  /** タスクID（相関キー） */
  taskId?: string;
  /** アクションのステータス */
  status: 'success' | 'failure' | 'degraded' | 'error';
  /** アクションの入力データ概要 */
  inputSummary?: string;
  /** アクションの出力データ概要 */
  outputSummary?: string;
  /** 処理時間（ミリ秒） */
  durationMs?: number;
  /** 関連する売上影響（Phase 5で使用） */
  revenueImpact?: number;
  /** メタデータ（任意の追加情報） */
  metadata?: Record<string, unknown>;
}

// ── ActionLogger クラス ──

export class ActionLogger {
  private storage: IStorageAdapter;
  private bus: IAgentBus | null = null;
  private subscriptionIds: string[] = [];
  private isListening = false;

  constructor(storage?: IStorageAdapter) {
    this.storage = storage || getStorage();
  }

  /**
   * AgentBusに接続し、関連イベントを自動記録する
   */
  connectBus(bus: IAgentBus): void {
    if (this.isListening) return;
    this.bus = bus;

    // タスク結果を記録
    this.subscriptionIds.push(
      bus.subscribe('task.result.*', async (event) => {
        await this.logAction({
          agentId: event.source,
          agentName: event.source,
          agentLevel: '',
          agentTeam: '',
          actionType: 'task_result',
          taskId: event.correlationId || event.id,
          status: (event.payload as Record<string, unknown>)?.status === 'success' ? 'success' : 'failure',
          outputSummary: this.summarize(event.payload),
          metadata: {eventType: event.type},
        });
      }),
    );

    // パイプラインステップ完了を記録
    this.subscriptionIds.push(
      bus.subscribe('pipeline.step.*', async (event) => {
        const payload = event.payload as Record<string, unknown>;
        await this.logAction({
          agentId: String(payload?.agentId || event.source),
          agentName: String(payload?.stepName || 'unknown'),
          agentLevel: '',
          agentTeam: '',
          actionType: 'pipeline_step',
          taskId: String(payload?.executionId || event.correlationId),
          status: event.type.includes('failed') ? 'failure' : 'success',
          durationMs: payload?.durationMs as number,
          outputSummary: this.summarize(payload?.result),
          metadata: {pipelineId: payload?.pipelineId},
        });
      }),
    );

    // ヘルスアラートを記録
    this.subscriptionIds.push(
      bus.subscribe('health.*', async (event) => {
        const payload = event.payload as Record<string, unknown>;
        await this.logAction({
          agentId: String(payload?.agentId || event.source),
          agentName: String(payload?.agentName || event.source),
          agentLevel: '',
          agentTeam: '',
          actionType: 'health_alert',
          status: event.type.includes('error') || event.type.includes('critical')
            ? 'error'
            : 'degraded',
          outputSummary: `Health: ${event.type}`,
          metadata: {action: payload?.action, consecutiveFailures: payload?.consecutiveFailures},
        });
      }),
    );

    // カスケードコマンドを記録
    this.subscriptionIds.push(
      bus.subscribe('cascade.*', async (event) => {
        const payload = event.payload as Record<string, unknown>;
        await this.logAction({
          agentId: event.source,
          agentName: event.source,
          agentLevel: '',
          agentTeam: '',
          actionType: 'cascade',
          taskId: event.correlationId,
          status: event.type.includes('failed') ? 'failure' : 'success',
          outputSummary: `Cascade: ${event.type}`,
          metadata: payload,
        });
      }),
    );

    this.isListening = true;
  }

  /**
   * 手動でアクションを記録する（AgentBus経由でないアクション用）
   */
  async logAction(params: Omit<ActionLogRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record = {
      ...params,
      id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as ActionLogRecord;

    await this.storage.put(TABLES.AGENT_ACTIONS, record);
    return id;
  }

  /**
   * アクションログをクエリ
   */
  async queryActions(query: StorageQuery): Promise<ActionLogRecord[]> {
    return this.storage.query<ActionLogRecord>(TABLES.AGENT_ACTIONS, query);
  }

  /**
   * 特定エージェントのアクション数を取得
   */
  async countByAgent(agentId: string, since?: number): Promise<number> {
    return this.storage.count(TABLES.AGENT_ACTIONS, {
      where: {agentId},
      since,
    });
  }

  /**
   * エージェント別のアクション集計
   */
  async getAgentSummary(since?: number): Promise<
    Array<{
      agentId: string;
      total: number;
      success: number;
      failure: number;
      avgDurationMs: number;
    }>
  > {
    const allActions = await this.storage.query<ActionLogRecord>(TABLES.AGENT_ACTIONS, {
      since,
      limit: 50_000,
    });

    const map = new Map<string, {total: number; success: number; failure: number; totalDuration: number; durationCount: number}>();

    for (const action of allActions) {
      const existing = map.get(action.agentId) || {total: 0, success: 0, failure: 0, totalDuration: 0, durationCount: 0};
      existing.total++;
      if (action.status === 'success') existing.success++;
      if (action.status === 'failure' || action.status === 'error') existing.failure++;
      if (action.durationMs) {
        existing.totalDuration += action.durationMs;
        existing.durationCount++;
      }
      map.set(action.agentId, existing);
    }

    return Array.from(map.entries()).map(([agentId, data]) => ({
      agentId,
      total: data.total,
      success: data.success,
      failure: data.failure,
      avgDurationMs: data.durationCount > 0 ? Math.round(data.totalDuration / data.durationCount) : 0,
    }));
  }

  /**
   * 古いログを削除（メモリ管理）
   */
  async purgeOldLogs(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    return this.storage.purge(TABLES.AGENT_ACTIONS, Date.now() - olderThanMs);
  }

  /**
   * データサマリーを生成（大きなペイロードを安全に要約）
   */
  private summarize(data: unknown): string {
    if (!data) return '';
    try {
      const str = JSON.stringify(data);
      return str.length > 200 ? str.slice(0, 197) + '...' : str;
    } catch (err) {
      console.warn('[ActionLogger] data summarization failed:', err instanceof Error ? err.message : err);
      return String(data).slice(0, 200);
    }
  }

  /**
   * リスニングを停止（ライフサイクルイベント発行 + クリーンシャットダウン）
   *
   * シナプス切断時に最終状態を記録し、Bus経由で切断イベントを発行。
   * これにより他のモジュール（HealthMonitor等）が切断を検知できる。
   */
  async disconnect(): Promise<void> {
    // 切断イベント発行（Bus接続中のみ）
    if (this.bus && this.isListening) {
      try {
        await this.bus.publish({
          id: `logger_dc_${Date.now()}`,
          type: 'system.logger.disconnected',
          source: 'action-logger',
          priority: 'normal',
          timestamp: Date.now(),
          payload: {
            reason: 'disconnect_called',
            subscriptionCount: this.subscriptionIds.length,
          },
        });
      } catch (err) {
        // 切断通知失敗は非致命的
        console.warn('[ActionLogger] disconnect notification failed:', err instanceof Error ? err.message : err);
      }

      // 購読解除
      for (const subId of this.subscriptionIds) {
        this.bus.unsubscribe(subId);
      }
    }
    this.subscriptionIds = [];
    this.isListening = false;
    this.bus = null;
  }

  /** 接続状態を取得（診断用） */
  getConnectionStatus(): { isListening: boolean; subscriptionCount: number; hasBus: boolean } {
    return {
      isListening: this.isListening,
      subscriptionCount: this.subscriptionIds.length,
      hasBus: this.bus !== null,
    };
  }
}

// ── シングルトン ──

let loggerInstance: ActionLogger | null = null;

export function getActionLogger(): ActionLogger {
  if (!loggerInstance) {
    loggerInstance = new ActionLogger();
  }
  return loggerInstance;
}

/** テスト・ワーカー再起動時のリセット */
export function resetActionLogger(): void {
  loggerInstance = null;
}
