/**
 * FeedbackCollector — 学習データ蓄積（シナプス可塑性の基盤）
 *
 * 生体対応: 海馬（hippocampus）+ シナプス可塑性
 * 全Agentの行動とその結果を記録し、将来のSelf-Improvement
 * Engineが学習データとして利用できるようにする。
 *
 * 監査所見 C-2: Phase 0から記録を開始し、Phase 4の学習開始時に
 * 十分なデータが蓄積されている状態を作る。
 *
 * 記録対象:
 * - Agent間通信（シナプス活動）
 * - パイプライン実行結果（行動→結果の因果）
 * - 人間承認（教師信号=強化学習のreward）
 * - エラー・異常（痛覚信号=負のフィードバック）
 */

import type { AgentEvent, FeedbackRecord } from './types.js';
import type { IStorageAdapter, StorageRecord } from './storage.js';
import { getStorage, TABLES } from './storage.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('feedback-collector');


interface EventStat {
  type: string;
  count: number;
  deliveredCount: number;
  failedCount: number;
  avgPayloadSize: number;
  lastSeen: number;
}

/** Storage用レコード形式（FeedbackRecord + StorageRecord） */
interface StoredFeedback extends StorageRecord {
  agentId: string;
  action: string;
  input: unknown;
  output: unknown;
  outcome: string;
  humanApproval?: boolean;
  metadata?: Record<string, unknown>;
}

/** 圧縮時に失われるデータの統計サマリー */
interface CompactionSummary {
  /** 圧縮回数 */
  compactionCount: number;
  /** 圧縮で削除されたレコード総数 */
  totalCompactedRecords: number;
  /** エージェント別の圧縮前統計（圧縮で失われた分を累積） */
  agentStats: Map<string, {
    totalRecords: number;
    successCount: number;
    failureCount: number;
    approvedCount: number;
    rejectedCount: number;
  }>;
  /** 最も古い圧縮済みレコードのタイムスタンプ */
  oldestCompactedTimestamp: number | null;
}

export class FeedbackCollector {
  private records: FeedbackRecord[] = [];
  private eventStats = new Map<string, EventStat>();
  private maxRecords = 50000;
  private storage: IStorageAdapter;
  private persistEnabled = true;
  /** 圧縮時の統計サマリー（精度維持用） */
  private compactionSummary: CompactionSummary = {
    compactionCount: 0,
    totalCompactedRecords: 0,
    agentStats: new Map(),
    oldestCompactedTimestamp: null,
  };

  constructor(storage?: IStorageAdapter) {
    this.storage = storage || getStorage();
  }

  /** Agent Bus のフィードバックフックとして接続 */
  createHook(): (event: AgentEvent, delivered: boolean) => void {
    return (event: AgentEvent, delivered: boolean) => {
      this.recordEvent(event, delivered);
    };
  }

  /** Storageから既存データを復元（海馬の長期記憶読込み） */
  async restoreFromStorage(): Promise<number> {
    try {
      const stored = await this.storage.query<StoredFeedback>(TABLES.FEEDBACK, {
        orderBy: 'createdAt',
        desc: false,
        limit: this.maxRecords,
      });
      for (const s of stored) {
        this.records.push({
          id: s.id,
          agentId: s.agentId,
          action: s.action,
          input: s.input,
          output: s.output,
          outcome: s.outcome as FeedbackRecord['outcome'],
          humanApproval: s.humanApproval,
          timestamp: s.createdAt,
          metadata: s.metadata,
        });
      }
      return stored.length;
    } catch (err) {
      // 復元失敗は非致命的（短期記憶のみで動作継続）
      log.warn('[FeedbackCollector] restoreFromStorage failed:', err instanceof Error ? err.message : err);
      return 0;
    }
  }

  /** イベント記録（海馬での短期記憶形成） */
  private recordEvent(event: AgentEvent, delivered: boolean): void {
    const type = event.type;
    const stat = this.eventStats.get(type) ?? {
      type,
      count: 0,
      deliveredCount: 0,
      failedCount: 0,
      avgPayloadSize: 0,
      lastSeen: 0,
    };

    stat.count++;
    if (delivered) stat.deliveredCount++;
    else stat.failedCount++;
    stat.lastSeen = Date.now();

    const payloadSize = JSON.stringify(event.payload ?? {}).length;
    stat.avgPayloadSize = (stat.avgPayloadSize * (stat.count - 1) + payloadSize) / stat.count;

    this.eventStats.set(type, stat);
  }

  /** フィードバック記録（短期+長期記憶への同時書込み） */
  recordFeedback(record: FeedbackRecord): void {
    this.records.push(record);

    // 長期記憶への転送（Storage永続化）
    if (this.persistEnabled) {
      const now = Date.now();
      this.storage.put(TABLES.FEEDBACK, {
        id: record.id,
        agentId: record.agentId,
        action: record.action,
        input: record.input,
        output: record.output,
        outcome: record.outcome,
        humanApproval: record.humanApproval,
        metadata: record.metadata,
        createdAt: record.timestamp || now,
        updatedAt: now,
      } as StoredFeedback).catch((err) => {
        // 永続化失敗は非致命的（短期記憶には既に記録済み）
        log.warn('[FeedbackCollector] Storage persist failed:', err instanceof Error ? err.message : err);
      });
    }

    if (this.records.length > this.maxRecords) {
      this.compactRecords();
    }
  }

  /** 人間承認の記録（教師信号） */
  recordHumanApproval(agentId: string, action: string, approved: boolean, metadata?: Record<string, unknown>): void {
    const record: FeedbackRecord = {
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      agentId,
      action,
      input: metadata?.input ?? null,
      output: metadata?.output ?? null,
      outcome: approved ? 'success' : 'failure',
      humanApproval: approved,
      timestamp: Date.now(),
      metadata,
    };
    // recordFeedbackを通すことで永続化も同時に行う
    this.recordFeedback(record);
  }

  // ── クエリAPI（Self-Improvement Engine用） ──

  /** 特定Agentのフィードバック取得 */
  getByAgent(agentId: string, limit = 100): FeedbackRecord[] {
    return this.records
      .filter((r) => r.agentId === agentId)
      .slice(-limit);
  }

  /** 成功率計算 */
  getSuccessRate(agentId: string, windowMs = 86400000): number {
    const cutoff = Date.now() - windowMs;
    const relevant = this.records.filter((r) => r.agentId === agentId && r.timestamp > cutoff);
    if (relevant.length === 0) return 0;
    const successes = relevant.filter((r) => r.outcome === 'success').length;
    return successes / relevant.length;
  }

  /** 人間承認率 */
  getApprovalRate(agentId: string): number {
    const withApproval = this.records.filter((r) => r.agentId === agentId && r.humanApproval !== undefined);
    if (withApproval.length === 0) return 0;
    const approved = withApproval.filter((r) => r.humanApproval === true).length;
    return approved / withApproval.length;
  }

  /** イベント統計取得（脳波パターン分析） */
  getEventStats(): EventStat[] {
    return [...this.eventStats.values()].sort((a, b) => b.count - a.count);
  }

  /** 全体統計（圧縮済み分を含む正確な集計） */
  getStats() {
    return {
      totalRecords: this.records.length,
      totalRecordsIncludingCompacted: this.records.length + this.compactionSummary.totalCompactedRecords,
      eventTypes: this.eventStats.size,
      totalEvents: Array.from(this.eventStats.values()).reduce((s, e) => s + e.count, 0),
      oldestRecord: this.compactionSummary.oldestCompactedTimestamp ?? this.records[0]?.timestamp ?? null,
      newestRecord: this.records.at(-1)?.timestamp ?? null,
      compactionCount: this.compactionSummary.compactionCount,
      compactedRecords: this.compactionSummary.totalCompactedRecords,
    };
  }

  /** 圧縮サマリー取得（圧縮で失われたデータの統計） */
  getCompactionSummary(): {
    compactionCount: number;
    totalCompactedRecords: number;
    agentStats: Record<string, { totalRecords: number; successCount: number; failureCount: number; approvedCount: number; rejectedCount: number }>;
  } {
    const agentStats: Record<string, { totalRecords: number; successCount: number; failureCount: number; approvedCount: number; rejectedCount: number }> = {};
    for (const [agentId, stats] of this.compactionSummary.agentStats) {
      agentStats[agentId] = { ...stats };
    }
    return {
      compactionCount: this.compactionSummary.compactionCount,
      totalCompactedRecords: this.compactionSummary.totalCompactedRecords,
      agentStats,
    };
  }

  // ── 内部 ──

  private compactRecords(): void {
    const half = Math.floor(this.maxRecords / 2);
    const toRemove = this.records.slice(0, this.records.length - half);

    // 削除されるレコードの統計を累積保存（精度維持）
    for (const record of toRemove) {
      const stats = this.compactionSummary.agentStats.get(record.agentId) ?? {
        totalRecords: 0, successCount: 0, failureCount: 0, approvedCount: 0, rejectedCount: 0,
      };
      stats.totalRecords++;
      if (record.outcome === 'success') stats.successCount++;
      if (record.outcome === 'failure') stats.failureCount++;
      if (record.humanApproval === true) stats.approvedCount++;
      if (record.humanApproval === false) stats.rejectedCount++;
      this.compactionSummary.agentStats.set(record.agentId, stats);
    }

    if (toRemove.length > 0 && toRemove[0].timestamp) {
      this.compactionSummary.oldestCompactedTimestamp =
        this.compactionSummary.oldestCompactedTimestamp
          ? Math.min(this.compactionSummary.oldestCompactedTimestamp, toRemove[0].timestamp)
          : toRemove[0].timestamp;
    }

    this.compactionSummary.compactionCount++;
    this.compactionSummary.totalCompactedRecords += toRemove.length;

    // 最新半分を保持（メモリ上のみ圧縮。Storageには全量残る）
    this.records = this.records.slice(-half);
    // 注: Storageの古いレコードはpurge()で別途管理
    // メモリ上の圧縮はクエリ速度確保のため
  }

  /** 永続化の有効/無効切替（テスト用） */
  setPersistEnabled(enabled: boolean): void {
    this.persistEnabled = enabled;
  }
}

// ── シングルトン ──

let feedbackCollectorInstance: FeedbackCollector | null = null;

export function getFeedbackCollector(): FeedbackCollector {
  if (!feedbackCollectorInstance) {
    feedbackCollectorInstance = new FeedbackCollector();
  }
  return feedbackCollectorInstance;
}

export function resetFeedbackCollector(): void {
  feedbackCollectorInstance = null;
}
