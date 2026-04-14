/**
 * OptimisticUpdateManager — 楽観的UIアップデート管理（前頭前皮質）
 *
 * 生体対応: 前頭前皮質は行動計画を立て、予想される結果を評価する
 * = 楽観的アップデートは予想される状態をUIに表示し、サーバー確認を待つ
 *
 * 使用シナリオ（管理画面）:
 * 1. ユーザーが値を変更 → 即座にUIを更新（楽観的）
 * 2. サーバーに非同期で送信
 * 3. 成功 → 状態を確定
 * 4. 失敗 → UIを元に戻す（revert）
 *
 * 機能:
 * - applyOptimistic: 即座に変更を適用、サーバー確認待ちにキューイング
 * - confirmUpdate: サーバー確認後、ペンディング状態を確定
 * - revertUpdate: サーバーエラー時、UIを前の状態に戻す
 * - getPendingUpdates: 現在ペンディング中の更新リストを取得
 * - 統計情報: 楽観的/確定/リバート数を追跡
 */

import { createLogger } from '../core/logger.js';

const log = createLogger('optimistic-update');

export interface OptimisticUpdateRecord<T = unknown> {
  id: string;
  entityType: string; // 例: "agent", "pipeline", "config"
  entityId: string;
  change: T; // 変更内容（diffまたは全オブジェクト）
  previousValue: T; // 元の値（revert用）
  status: 'pending' | 'confirmed' | 'reverted';
  appliedAt: number;
  confirmedAt?: number;
  revertedAt?: number;
  error?: string;
}

export interface OptimisticUpdateStats {
  totalPending: number;
  totalConfirmed: number;
  totalReverted: number;
  byEntityType: Record<string, { pending: number; confirmed: number; reverted: number }>;
}

/**
 * 楽観的アップデートマネージャー
 * 管理画面でのUI応答性向上とサーバー確認のバランスを実現
 */
export class OptimisticUpdateManager {
  private updates = new Map<string, OptimisticUpdateRecord>();
  private stats = {
    totalPending: 0,
    totalConfirmed: 0,
    totalReverted: 0,
    byEntityType: new Map<string, { pending: number; confirmed: number; reverted: number }>(),
  };
  private updateCallbacks: Array<(record: OptimisticUpdateRecord) => void> = [];

  /**
   * 楽観的アップデートを適用
   * UIを即座に更新し、サーバー確認をペンディング状態にキューイング
   *
   * @param id - 更新ID（ユーザーが指定、例: "user-123-name"）
   * @param entityType - 対象エンティティ型（例: "agent"）
   * @param entityId - エンティティID（例: "agent-123"）
   * @param change - 変更内容
   * @param previousValue - 元の値（revert用）
   */
  applyOptimistic<T>(
    id: string,
    entityType: string,
    entityId: string,
    change: T,
    previousValue: T,
  ): OptimisticUpdateRecord<T> {
    const now = Date.now();
    const record: OptimisticUpdateRecord<T> = {
      id,
      entityType,
      entityId,
      change,
      previousValue,
      status: 'pending',
      appliedAt: now,
    };

    this.updates.set(id, record as OptimisticUpdateRecord);
    this.updateStats(entityType, 'pending', 1);
    this.notifyCallbacks(record);

    return record;
  }

  /**
   * サーバー確認後、楽観的アップデートを確定
   * UIはそのまま（変更済み状態）で、ペンディングフラグを外す
   */
  confirmUpdate(id: string): OptimisticUpdateRecord | null {
    const record = this.updates.get(id);
    if (!record) return null;

    if (record.status === 'pending') {
      this.updateStats(record.entityType, 'pending', -1);
      this.updateStats(record.entityType, 'confirmed', 1);
      record.status = 'confirmed';
      record.confirmedAt = Date.now();
      this.notifyCallbacks(record);
    }

    return record;
  }

  /**
   * サーバーエラー時、楽観的アップデートをリバート
   * UIを前の状態に戻す（previousValueに復元）
   *
   * @param id - リバートする更新ID
   * @param error - エラーメッセージ（ログ用）
   */
  revertUpdate(id: string, error?: string): OptimisticUpdateRecord | null {
    const record = this.updates.get(id);
    if (!record) return null;

    if (record.status !== 'reverted') {
      if (record.status === 'pending') {
        this.updateStats(record.entityType, 'pending', -1);
      } else if (record.status === 'confirmed') {
        this.updateStats(record.entityType, 'confirmed', -1);
      }
      this.updateStats(record.entityType, 'reverted', 1);
      record.status = 'reverted';
      record.revertedAt = Date.now();
      record.error = error;
      this.notifyCallbacks(record);
    }

    return record;
  }

  /**
   * ペンディング中のアップデートをすべて取得
   */
  getPendingUpdates(entityType?: string): OptimisticUpdateRecord[] {
    const results: OptimisticUpdateRecord[] = [];
    for (const record of this.updates.values()) {
      if (record.status === 'pending') {
        if (!entityType || record.entityType === entityType) {
          results.push(record);
        }
      }
    }
    return results;
  }

  /**
   * 特定エンティティのペンディングアップデート数を取得
   */
  getPendingCountForEntity(entityType: string, entityId: string): number {
    let count = 0;
    for (const record of this.updates.values()) {
      if (
        record.status === 'pending' &&
        record.entityType === entityType &&
        record.entityId === entityId
      ) {
        count++;
      }
    }
    return count;
  }

  /**
   * 更新レコードを削除（古い完了した更新のクリーンアップ用）
   */
  removeUpdate(id: string): boolean {
    const record = this.updates.get(id);
    if (!record) return false;

    if (record.status === 'pending') {
      this.updateStats(record.entityType, 'pending', -1);
    } else if (record.status === 'confirmed') {
      this.updateStats(record.entityType, 'confirmed', -1);
    } else if (record.status === 'reverted') {
      this.updateStats(record.entityType, 'reverted', -1);
    }

    this.updates.delete(id);
    return true;
  }

  /**
   * 古いレコードをクリーンアップ（自動）
   * @param olderThanMs - このミリ秒より前のレコードを削除
   * @returns 削除されたレコード数
   */
  cleanupOldRecords(olderThanMs = 3600000): number {
    const now = Date.now();
    let count = 0;

    for (const [id, record] of this.updates.entries()) {
      // ペンディング中のレコードは削除しない
      if (record.status === 'pending') continue;

      const age = record.confirmedAt || record.revertedAt ? now - (record.confirmedAt ?? record.revertedAt ?? 0) : 0;
      if (age > olderThanMs) {
        this.removeUpdate(id);
        count++;
      }
    }

    return count;
  }

  /**
   * 統計情報を取得
   */
  getStats(): OptimisticUpdateStats {
    return {
      totalPending: this.stats.totalPending,
      totalConfirmed: this.stats.totalConfirmed,
      totalReverted: this.stats.totalReverted,
      byEntityType: Object.fromEntries(this.stats.byEntityType),
    };
  }

  /**
   * 更新イベントのリスナーを登録
   */
  onUpdate(callback: (record: OptimisticUpdateRecord) => void): () => void {
    this.updateCallbacks.push(callback);
    // アンサブスクライブ関数を返す
    return () => {
      const index = this.updateCallbacks.indexOf(callback);
      if (index > -1) {
        this.updateCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * 全レコードをクリア（テスト用）
   */
  clear(): void {
    this.updates.clear();
    this.stats.byEntityType.clear();
    this.stats.totalPending = 0;
    this.stats.totalConfirmed = 0;
    this.stats.totalReverted = 0;
  }

  /**
   * 統計情報を更新
   */
  private updateStats(entityType: string, status: string, delta: number): void {
    if (status === 'pending') {
      this.stats.totalPending += delta;
    } else if (status === 'confirmed') {
      this.stats.totalConfirmed += delta;
    } else if (status === 'reverted') {
      this.stats.totalReverted += delta;
    }

    let stats = this.stats.byEntityType.get(entityType);
    if (!stats) {
      stats = { pending: 0, confirmed: 0, reverted: 0 };
      this.stats.byEntityType.set(entityType, stats);
    }

    if (status === 'pending') {
      stats.pending += delta;
    } else if (status === 'confirmed') {
      stats.confirmed += delta;
    } else if (status === 'reverted') {
      stats.reverted += delta;
    }
  }

  /**
   * 登録されたコールバックを実行
   */
  private notifyCallbacks(record: OptimisticUpdateRecord): void {
    for (const callback of this.updateCallbacks) {
      try {
        callback(record);
      } catch (err) {
        log.error('[OptimisticUpdateManager] Callback error:', err instanceof Error ? err.message : err);
      }
    }
  }
}
