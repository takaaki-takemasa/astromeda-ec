/**
 * CronRunner — DB駆動型スケジュール実行エンジン（自律神経の統合制御）
 *
 * 医学メタファー: 自律神経系は心拍・呼吸・消化を無意識に制御する。
 * CronRunnerはDBに登録されたCronスケジュールを監視し、
 * 期限到来時にエージェントを自動実行する。
 *
 * 既存のScheduler（request-driven）を補完:
 * - Scheduler: リクエスト時にチェック（リクエストがないと実行されない）
 * - CronRunner: DB + CronParser で真のスケジュール実行（Fly.ioのcron compatible）
 *
 * 設計:
 * - CronParser で次回実行時刻を計算
 * - DB (cron_schedule) で永続化
 * - AgentBus で実行イベントを発行
 * - 失敗時は自動リトライ + エスカレーション
 * - 連続失敗3回で自動無効化 + 通知
 */

import { getDB } from '../lib/databases/db-adapter.js';
import { getNextRunTime } from './cron-parser.js';
import { getAgentBus } from './agent-bus.js';
import type { AgentEvent } from './types.js';

export interface CronRunResult {
  scheduleId: string;
  agentId: string;
  status: 'success' | 'failure' | 'skipped';
  durationMs: number;
  error?: string;
}

/**
 * CronRunner — スケジュール実行エンジン
 */
export class CronRunner {
  private running = false;
  private lastCheckAt = 0;
  private readonly MIN_CHECK_INTERVAL_MS = 30_000; // 最低30秒間隔

  /**
   * 期限到来スケジュールをチェックし実行
   * リクエストハンドラまたはCron triggerから呼ばれる
   */
  async tick(): Promise<CronRunResult[]> {
    const now = Date.now();
    if (now - this.lastCheckAt < this.MIN_CHECK_INTERVAL_MS) {
      return []; // 短期間の重複チェックを防止
    }
    this.lastCheckAt = now;

    if (this.running) return []; // 再入防止
    this.running = true;

    try {
      const db = getDB();
      const dueSchedules = await db.cronSchedule.findDueSchedules();
      const results: CronRunResult[] = [];

      for (const schedule of dueSchedules) {
        const result = await this.executeSchedule(schedule as any);
        results.push(result);
      }

      return results;
    } finally {
      this.running = false;
    }
  }

  /**
   * 個別スケジュールの実行
   */
  private async executeSchedule(schedule: {
    scheduleId: string;
    agentId: string;
    cronExpression: string;
    pipelineId?: string;
    enabled: boolean;
    consecutiveFailures: number;
    maxConsecutiveFailures: number;
    payload?: Record<string, unknown>;
  }): Promise<CronRunResult> {
    const start = Date.now();
    const db = getDB();
    const bus = getAgentBus();

    try {
      // AgentBus経由でエージェントに実行イベントを発行
      const event: AgentEvent = {
        id: `cron_${schedule.scheduleId}_${Date.now()}`,
        type: 'pipeline.execute',
        source: 'cron-runner',
        target: schedule.agentId,
        priority: 'normal',
        payload: {
          scheduleId: schedule.scheduleId,
          pipelineId: schedule.pipelineId || schedule.agentId,
          triggeredBy: 'cron',
          cronExpression: schedule.cronExpression,
          params: schedule.payload || {},
        },
        timestamp: Date.now(),
      };

      await bus.publish(event);

      // 次回実行時刻を計算してDBを更新
      const nextRunAt = getNextRunTime(schedule.cronExpression, new Date());
      const durationMs = Date.now() - start;

      await db.cronSchedule.recordRun(
        schedule.scheduleId,
        'success',
        durationMs,
        nextRunAt,
      );

      return {
        scheduleId: schedule.scheduleId,
        agentId: schedule.agentId,
        status: 'success',
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);

      // 次回実行時刻を計算してDBを更新
      const nextRunAt = getNextRunTime(schedule.cronExpression, new Date());
      await db.cronSchedule.recordRun(
        schedule.scheduleId,
        'failure',
        durationMs,
        nextRunAt,
      );

      // 連続失敗チェック → 自動無効化
      const newFailures = (schedule.consecutiveFailures || 0) + 1;
      const maxFailures = schedule.maxConsecutiveFailures || 3;

      if (newFailures >= maxFailures) {
        // 自動無効化 + エスカレーション
        try {
          const updatedSchedule = await db.cronSchedule.findOne({ scheduleId: schedule.scheduleId });
          if (updatedSchedule) {
            await db.cronSchedule.upsert({
              ...updatedSchedule,
              id: (updatedSchedule as any).id,
              enabled: false,
            } as any);
          }
        } catch { /* DB更新失敗は無視 */ }

        // エスカレーションイベント発行
        await bus.publish({
          id: `escalation_${Date.now()}`,
          type: 'system.schedule.disabled',
          source: 'cron-runner',
          priority: 'high',
          payload: {
            scheduleId: schedule.scheduleId,
            agentId: schedule.agentId,
            reason: `${newFailures} consecutive failures`,
            lastError: errorMsg,
          },
          timestamp: Date.now(),
        } as AgentEvent);
      }

      return {
        scheduleId: schedule.scheduleId,
        agentId: schedule.agentId,
        status: 'failure',
        durationMs,
        error: errorMsg,
      };
    }
  }

  // N-01: 自動実行タイマー（松果体の日内リズム）
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  /** タイマー開始 — 60秒間隔でtick()を自動実行 */
  start(intervalMs = 60_000): void {
    if (this.tickTimer) return; // 二重起動防止
    this.tickTimer = setInterval(() => {
      this.tick().catch((err) => {
        // tick失敗はログのみ（次回リトライ）
        console.warn('[CronRunner] tick error:', err instanceof Error ? err.message : String(err));
      });
    }, intervalMs);
    // 初回即時実行（起動直後に期限到来スケジュールがあれば処理）
    this.tick().catch(() => {});
  }

  /** タイマー停止 */
  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  /** ステータス */
  isRunning(): boolean {
    return this.running;
  }

  /** タイマー稼働中か */
  isTimerActive(): boolean {
    return this.tickTimer !== null;
  }
}

// ─── シングルトン ───

let cronRunnerInstance: CronRunner | null = null;

export function getCronRunner(): CronRunner {
  if (!cronRunnerInstance) {
    cronRunnerInstance = new CronRunner();
  }
  return cronRunnerInstance;
}

export function resetCronRunner(): void {
  cronRunnerInstance?.stop(); // タイマーをクリアしてからリセット
  cronRunnerInstance = null;
}
