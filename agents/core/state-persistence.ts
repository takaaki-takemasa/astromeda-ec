/**
 * StatePersistence — エージェント状態の永続化（記憶の定着）
 *
 * 医学的メタファー: 短期記憶を長期記憶に変換する海馬の役割。
 * エージェントの実行時状態を定期的にストレージに保存し、
 * ワーカー再起動後も状態を復元できるようにする。
 *
 * 保存対象:
 * 1. エージェントの健康状態スナップショット
 * 2. 最後のタスク実行結果
 * 3. エラーカウント・連続失敗数
 * 4. パイプライン最終実行時刻
 * 5. フィードバック統計
 */

import type {IStorageAdapter, StorageRecord} from './storage';
import {getStorage, TABLES} from './storage';

/** 単調増加タイムスタンプ（同一ms内の順序を保証） */
let lastTs = 0;
function monotonic(): number {
  const now = Date.now();
  lastTs = now > lastTs ? now : lastTs + 1;
  return lastTs;
}

// ── 状態スナップショット型 ──

export interface AgentStateSnapshot extends StorageRecord {
  agentId: string;
  agentName: string;
  level: string;
  team: string;
  status: string;
  errorCount: number;
  taskQueueSize: number;
  uptime: number;
  lastTaskId?: string;
  lastTaskStatus?: string;
  lastTaskTime?: number;
  memoryUsage: number;
  version: string;
}

export interface HealthSnapshotRecord extends StorageRecord {
  agentId: string;
  status: string;
  errorCount: number;
  consecutiveFailures: number;
  responseTimeMs?: number;
}

export interface SystemStateSnapshot extends StorageRecord {
  totalAgents: number;
  activeAgents: number;
  healthyAgents: number;
  degradedAgents: number;
  errorAgents: number;
  totalPipelines: number;
  activePipelines: number;
  busEventsPublished: number;
  busDeadLetters: number;
  feedbackRecords: number;
  andonStatus: string;
}

// ── StatePersistence クラス ──

export class StatePersistence {
  private storage: IStorageAdapter;

  constructor(storage?: IStorageAdapter) {
    this.storage = storage || getStorage();
  }

  // ── エージェント状態 ──

  /**
   * エージェントの状態スナップショットを保存
   */
  async saveAgentState(snapshot: Omit<AgentStateSnapshot, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    const record = {
      ...snapshot,
      id: `state_${snapshot.agentId}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as AgentStateSnapshot;
    await this.storage.put(TABLES.AGENT_STATE, record);
  }

  /**
   * エージェントの最新状態を取得
   */
  async getAgentState(agentId: string): Promise<AgentStateSnapshot | null> {
    return this.storage.get<AgentStateSnapshot>(TABLES.AGENT_STATE, `state_${agentId}`);
  }

  /**
   * 全エージェントの最新状態を取得
   */
  async getAllAgentStates(): Promise<AgentStateSnapshot[]> {
    return this.storage.query<AgentStateSnapshot>(TABLES.AGENT_STATE, {
      orderBy: 'updatedAt',
      desc: true,
    });
  }

  // ── ヘルス履歴 ──

  /**
   * ヘルスチェック結果を記録
   */
  async recordHealthCheck(params: Omit<HealthSnapshotRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    const ts = monotonic();
    const record = {
      ...params,
      id: `health_${params.agentId}_${ts}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: ts,
      updatedAt: ts,
    } as HealthSnapshotRecord;
    await this.storage.put(TABLES.HEALTH_HISTORY, record);
  }

  /**
   * 特定エージェントのヘルス履歴を取得
   */
  async getHealthHistory(agentId: string, limit = 50): Promise<HealthSnapshotRecord[]> {
    return this.storage.query<HealthSnapshotRecord>(TABLES.HEALTH_HISTORY, {
      where: {agentId},
      orderBy: 'createdAt',
      desc: true,
      limit,
    });
  }

  // ── システム全体状態 ──

  /**
   * システム全体の状態スナップショットを保存
   */
  async saveSystemState(snapshot: Omit<SystemStateSnapshot, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    const record = {
      ...snapshot,
      id: `sys_${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as SystemStateSnapshot;
    await this.storage.put(TABLES.SYSTEM_EVENTS, record);
  }

  /**
   * システム状態の履歴を取得
   */
  async getSystemHistory(limit = 100): Promise<SystemStateSnapshot[]> {
    return this.storage.query<SystemStateSnapshot>(TABLES.SYSTEM_EVENTS, {
      orderBy: 'createdAt',
      desc: true,
      limit,
    });
  }

  // ── メンテナンス ──

  /**
   * 古いヘルス履歴を削除（デフォルト: 24時間以上前）
   */
  async purgeOldHealthHistory(olderThanMs = 24 * 60 * 60 * 1000): Promise<number> {
    return this.storage.purge(TABLES.HEALTH_HISTORY, Date.now() - olderThanMs);
  }

  /**
   * 古いシステムイベントを削除（デフォルト: 7日以上前）
   */
  async purgeOldSystemEvents(olderThanMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    return this.storage.purge(TABLES.SYSTEM_EVENTS, Date.now() - olderThanMs);
  }

  /**
   * ストレージの統計情報を取得
   */
  async getStorageStats() {
    return this.storage.stats();
  }
}

// ── シングルトン ──

let persistenceInstance: StatePersistence | null = null;

export function getStatePersistence(): StatePersistence {
  if (!persistenceInstance) {
    persistenceInstance = new StatePersistence();
  }
  return persistenceInstance;
}

/** テスト・ワーカー再起動時のリセット */
export function resetStatePersistence(): void {
  persistenceInstance = null;
}
