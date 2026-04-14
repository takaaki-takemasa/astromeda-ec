/**
 * Scheduler — パイプライン自動実行スケジューラ（自律神経系）
 *
 * 医学的メタファー: 自律神経系は心拍・呼吸・消化を無意識に制御する。
 * Schedulerはパイプラインの定期実行を自動化し、システムの生命維持を担う。
 *
 * Cloudflare Workers / Shopify Oxygen の制約:
 * - setInterval は単一リクエスト内でのみ有効（~30秒制限）
 * - 真のCronは Cloudflare Cron Triggers（wrangler.toml設定）が必要
 * - Phase 3では「リクエスト駆動型スケジューラ」を採用:
 *   各リクエスト時に「前回実行からN秒経過したか」をチェックし、
 *   条件を満たしたパイプラインを実行する
 *
 * 将来: Cloudflare Cron Triggers / Durable Objects alarm() に差し替え
 */

import type {IStorageAdapter, StorageRecord} from './storage';
import {getStorage, TABLES} from './storage';

// ── スケジュール定義 ──

export interface ScheduleDefinition {
  /** パイプラインID */
  pipelineId: string;
  /** 実行間隔（秒） */
  intervalSeconds: number;
  /** 有効/無効 */
  enabled: boolean;
  /** 表示名 */
  name: string;
  /** 実行パラメータ */
  params?: Record<string, unknown>;
}

/** スケジュール実行記録 */
export interface ScheduleRunRecord extends StorageRecord {
  pipelineId: string;
  scheduleName: string;
  status: 'started' | 'completed' | 'failed';
  durationMs?: number;
  error?: string;
  triggeredBy: 'schedule' | 'manual' | 'event';
}

// ── Scheduler クラス ──

export class Scheduler {
  private storage: IStorageAdapter;
  private schedules: Map<string, ScheduleDefinition> = new Map();
  /** 実行ロック（同時実行防止 = 心臓不整脈防止） */
  private activeLocks = new Map<string, number>();
  private readonly lockTtlMs = 60_000; // 60秒でロック自動解除

  constructor(storage?: IStorageAdapter) {
    this.storage = storage || getStorage();
  }

  /**
   * スケジュールを登録
   */
  register(schedule: ScheduleDefinition): void {
    this.schedules.set(schedule.pipelineId, schedule);
  }

  /**
   * スケジュールを一括登録
   */
  registerAll(schedules: ScheduleDefinition[]): void {
    for (const s of schedules) {
      this.register(s);
    }
  }

  /**
   * リクエスト駆動型チェック: 実行が必要なパイプラインを返す
   *
   * 各リクエスト時に呼び出し、前回実行からintervalSecondsが
   * 経過したパイプラインIDのリストを返す。
   * 実行自体は呼び出し元（agent-bridge等）が行う。
   */
  async checkDueSchedules(): Promise<ScheduleDefinition[]> {
    const now = Date.now();
    const dueSchedules: ScheduleDefinition[] = [];

    // 期限切れロックを自動解除（心臓の自動リセット）
    for (const [pid, lockTime] of this.activeLocks) {
      if (now - lockTime > this.lockTtlMs) {
        this.activeLocks.delete(pid);
      }
    }

    for (const [pipelineId, schedule] of this.schedules) {
      if (!schedule.enabled) continue;

      // ロック中のパイプラインはスキップ（二重拍動防止）
      if (this.activeLocks.has(pipelineId)) continue;

      // 最後の実行記録を取得
      const lastRun = await this.getLastRun(pipelineId);
      const lastRunTime = lastRun?.createdAt ?? 0;
      const elapsedSeconds = (now - lastRunTime) / 1000;

      if (elapsedSeconds >= schedule.intervalSeconds) {
        dueSchedules.push(schedule);
      }
    }

    return dueSchedules;
  }

  /**
   * パイプライン実行ロックを取得（心臓の不応期）
   * @returns true=ロック取得成功, false=既にロック中
   */
  acquireLock(pipelineId: string): boolean {
    const now = Date.now();
    const existing = this.activeLocks.get(pipelineId);
    // 既存ロックがTTL内なら拒否
    if (existing && now - existing < this.lockTtlMs) {
      return false;
    }
    this.activeLocks.set(pipelineId, now);
    return true;
  }

  /** ロック解除 */
  releaseLock(pipelineId: string): void {
    this.activeLocks.delete(pipelineId);
  }

  /** アクティブロック数 */
  getActiveLockCount(): number {
    return this.activeLocks.size;
  }

  /**
   * パイプライン実行開始を記録
   */
  async recordRunStart(pipelineId: string, triggeredBy: ScheduleRunRecord['triggeredBy'] = 'schedule'): Promise<string> {
    // ロック取得（二重実行防止）
    if (!this.acquireLock(pipelineId)) {
      throw new Error(`Pipeline "${pipelineId}" is already running (lock active)`);
    }

    const schedule = this.schedules.get(pipelineId);
    const id = `sched_${pipelineId}_${Date.now()}`;

    const record: ScheduleRunRecord = {
      id,
      pipelineId,
      scheduleName: schedule?.name || pipelineId,
      status: 'started',
      triggeredBy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.storage.put(TABLES.PIPELINE_RUNS, record);
    return id;
  }

  /**
   * パイプライン実行完了を記録
   */
  async recordRunComplete(runId: string, success: boolean, durationMs: number, error?: string): Promise<void> {
    const existing = await this.storage.get<ScheduleRunRecord>(TABLES.PIPELINE_RUNS, runId);
    if (!existing) return;

    await this.storage.put(TABLES.PIPELINE_RUNS, {
      ...existing,
      status: success ? 'completed' : 'failed',
      durationMs,
      error,
      updatedAt: Date.now(),
    });

    // ロック解除（心拍完了→次の拍動を許可）
    this.releaseLock(existing.pipelineId);
  }

  /**
   * 特定パイプラインの最後の実行記録を取得
   */
  async getLastRun(pipelineId: string): Promise<ScheduleRunRecord | null> {
    const runs = await this.storage.query<ScheduleRunRecord>(TABLES.PIPELINE_RUNS, {
      where: {pipelineId},
      orderBy: 'createdAt',
      desc: true,
      limit: 1,
    });
    return runs[0] || null;
  }

  /**
   * パイプラインの実行履歴を取得
   */
  async getRunHistory(pipelineId: string, limit = 20): Promise<ScheduleRunRecord[]> {
    return this.storage.query<ScheduleRunRecord>(TABLES.PIPELINE_RUNS, {
      where: {pipelineId},
      orderBy: 'createdAt',
      desc: true,
      limit,
    });
  }

  /**
   * 全パイプラインの実行統計
   */
  async getStats(): Promise<{
    totalRuns: number;
    completedRuns: number;
    failedRuns: number;
    scheduledPipelines: number;
    enabledPipelines: number;
  }> {
    const totalRuns = await this.storage.count(TABLES.PIPELINE_RUNS);
    const allRuns = await this.storage.query<ScheduleRunRecord>(TABLES.PIPELINE_RUNS, {limit: 50_000});
    const completedRuns = allRuns.filter((r) => r.status === 'completed').length;
    const failedRuns = allRuns.filter((r) => r.status === 'failed').length;

    let enabledCount = 0;
    for (const s of this.schedules.values()) {
      if (s.enabled) enabledCount++;
    }

    return {
      totalRuns,
      completedRuns,
      failedRuns,
      scheduledPipelines: this.schedules.size,
      enabledPipelines: enabledCount,
    };
  }

  /**
   * スケジュール一覧を取得
   */
  listSchedules(): ScheduleDefinition[] {
    return Array.from(this.schedules.values());
  }

  /**
   * スケジュールの有効/無効を切り替え
   */
  setEnabled(pipelineId: string, enabled: boolean): boolean {
    const schedule = this.schedules.get(pipelineId);
    if (!schedule) return false;
    schedule.enabled = enabled;
    return true;
  }
}

// ── デフォルトスケジュール定義（16パイプライン） ──

export const DEFAULT_SCHEDULES: ScheduleDefinition[] = [
  // 生命維持系（高頻度）
  {pipelineId: 'health-check', intervalSeconds: 300, enabled: true, name: 'ヘルスチェック（5分）'},
  {pipelineId: 'security-scan', intervalSeconds: 3600, enabled: true, name: 'セキュリティスキャン（1時間）'},

  // 分析系（中頻度）
  {pipelineId: 'daily-analytics', intervalSeconds: 86400, enabled: true, name: '日次アナリティクス'},
  {pipelineId: 'weekly-report', intervalSeconds: 604800, enabled: true, name: '週次レポート'},
  {pipelineId: 'seo-audit', intervalSeconds: 86400, enabled: true, name: 'SEO監査（日次）'},

  // 最適化系（低頻度）
  {pipelineId: 'price-optimization', intervalSeconds: 43200, enabled: false, name: '価格最適化（12時間）'},
  {pipelineId: 'content-generation', intervalSeconds: 86400, enabled: false, name: 'コンテンツ生成（日次）'},
  {pipelineId: 'ab-test-evaluation', intervalSeconds: 86400, enabled: false, name: 'A/Bテスト評価（日次）'},
  {pipelineId: 'performance-optimization', intervalSeconds: 86400, enabled: true, name: 'パフォーマンス最適化（日次）'},
  {pipelineId: 'inventory-sync', intervalSeconds: 3600, enabled: true, name: '在庫同期（1時間）'},
  {pipelineId: 'conversion-optimization', intervalSeconds: 43200, enabled: false, name: 'コンバージョン最適化（12時間）'},

  // インフラ系
  {pipelineId: 'feedback-analysis', intervalSeconds: 86400, enabled: true, name: 'フィードバック分析（日次）'},
  {pipelineId: 'agent-self-improvement', intervalSeconds: 604800, enabled: false, name: 'エージェント自己改善（週次）'},
  {pipelineId: 'data-backup', intervalSeconds: 86400, enabled: true, name: 'データバックアップ（日次）'},
  {pipelineId: 'log-cleanup', intervalSeconds: 86400, enabled: true, name: 'ログクリーンアップ（日次）'},
  {pipelineId: 'cascade-test', intervalSeconds: 604800, enabled: false, name: 'カスケードテスト（週次）'},
];

// ── シングルトン ──

let schedulerInstance: Scheduler | null = null;

export function getScheduler(): Scheduler {
  if (!schedulerInstance) {
    schedulerInstance = new Scheduler();
    schedulerInstance.registerAll(DEFAULT_SCHEDULES);
  }
  return schedulerInstance;
}

/** テスト・ワーカー再起動時のリセット */
export function resetScheduler(): void {
  schedulerInstance = null;
}
