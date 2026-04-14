/**
 * Fallback Manager — AI モデル自動フェイルオーバー（循環系の冗長性）
 *
 * 医学的メタファー: 心臓と肺の二重化（Primary が止まったら Fallback に自動切り替え）
 * Primary AI が失敗（5xx または 30s timeout）すると、
 * Fallback AI に自動切り替え。回復を監視して段階的に復帰。
 *
 * 戦略:
 * 1. リトライ: 3回試行（指数バックオフ: 1s → 2s → 4s）
 * 2. 自動切り替え: 3失敗後、Primary → Fallback に切り替え
 * 3. リカバリ監視: 5分ごとに Primary を ping して復帰チェック
 * 4. 段階的復帰: 10% → 50% → 100% に徐々に戻す
 */

import { getNotificationBus } from './notification-bus.js';
import type { NotificationBus } from './notification-bus.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('fallback-manager');


export interface FallbackStats {
  fallbackCount: number; // Fallback に切り替えた回数
  recoveryCount: number; // 復帰した回数
  avgRecoveryTimeMs: number; // 平均復帰時間
  currentlyOnFallback: Set<string>; // 現在 Fallback 中のエージェント
}

interface AgentFallbackState {
  agentId: string;
  onFallback: boolean;
  consecutiveFailures: number;
  lastFailureTime: number;
  recoveryStartTime?: number;
  recoveryPhase: number; // 0=10%, 1=50%, 2=100% (primary に戻す)
}

interface ExecutionContext {
  agentId: string;
  attempt: number;
  useFallback: boolean;
}

/**
 * Fallback Manager クラス
 */
export class FallbackManager {
  private notificationBus: NotificationBus;
  private agentStates = new Map<string, AgentFallbackState>();
  private stats: FallbackStats;
  private recoveryTimer?: ReturnType<typeof setInterval>;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS = [1000, 2000, 4000]; // exponential backoff (ms)
  private readonly RECOVERY_CHECK_INTERVAL = 5 * 60 * 1000; // 5分
  private readonly RECOVERY_PING_TIMEOUT = 10000; // 10秒

  constructor() {
    this.notificationBus = getNotificationBus();
    this.stats = {
      fallbackCount: 0,
      recoveryCount: 0,
      avgRecoveryTimeMs: 0,
      currentlyOnFallback: new Set(),
    };

    this.startRecoveryMonitoring();
  }

  /**
   * 関数をリトライ + フェイルオーバー機能付きで実行
   */
  async execute<T>(
    fn: (context: ExecutionContext) => Promise<T>,
    agentId: string,
  ): Promise<T> {
    const state = this.getOrCreateState(agentId);

    // 既に Fallback 中かどうかをチェック
    const useFallback = state.onFallback;

    // リトライループ
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        const result = await fn({
          agentId,
          attempt,
          useFallback,
        });

        // 成功 → 状態をリセット
        if (state.onFallback && state.consecutiveFailures === 0) {
          // Fallback から復帰するシーケンス開始
          await this.initiateRecovery(agentId);
        }

        state.consecutiveFailures = 0;
        return result;
      } catch (err) {
        const error = err as { code?: string; timeout?: boolean };
        const is5xx =
          error.code === '5xx' || (error && typeof error === 'object' && 'timeout' in error && error.timeout);

        if (is5xx) {
          state.consecutiveFailures += 1;
          state.lastFailureTime = Date.now();

          // 3失敗後、Fallback に切り替え
          if (state.consecutiveFailures >= this.MAX_RETRIES && !state.onFallback) {
            await this.switchToFallback(agentId);
            // Fallback に切り替えたから、リトライを続ける（ただし useFallback=true で）
          }

          // リトライ待機
          if (attempt < this.MAX_RETRIES - 1) {
            const delay = this.RETRY_DELAYS[attempt];
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        } else {
          // 5xx でなければそのまま例外をスロー
          throw err;
        }
      }
    }

    throw new Error(
      `[FallbackManager] All ${this.MAX_RETRIES} attempts failed for agent ${agentId}`,
    );
  }

  /**
   * Primary → Fallback に切り替え
   */
  private async switchToFallback(agentId: string): Promise<void> {
    const state = this.getOrCreateState(agentId);

    if (state.onFallback) {
      return; // 既に Fallback 中
    }

    state.onFallback = true;
    this.stats.fallbackCount += 1;
    this.stats.currentlyOnFallback.add(agentId);

    log.warn(`[FallbackManager] Switched ${agentId} to fallback AI`);

    // High通知を送信
    await this.notificationBus.sendNotification({
      id: `fallback-switch-${Date.now()}-${agentId}`,
      severity: 'high',
      source: agentId,
      title: `Agent ${agentId} switched to fallback AI`,
      message: `Primary AI failed 3 times. Now using fallback AI.`,
      timestamp: Date.now(),
      actionUrl: `/admin/agents/${agentId}`,
      metadata: { reason: 'primary_failures' },
    });
  }

  /**
   * Fallback から復帰シーケンスを開始（段階的）
   */
  private async initiateRecovery(agentId: string): Promise<void> {
    const state = this.getOrCreateState(agentId);

    if (!state.onFallback) {
      return; // 既に Primary 状態
    }

    state.recoveryStartTime = Date.now();
    state.recoveryPhase = 0; // 10% から開始

    log.info(`[FallbackManager] Starting recovery for ${agentId} (10% traffic)`);

    // 段階的復帰のための追跡
    const recoveryCheckInterval = setInterval(async () => {
      if (state.recoveryPhase >= 2) {
        // 完全復帰
        state.onFallback = false;
        state.recoveryStartTime = undefined;
        state.recoveryPhase = 0;
        this.stats.currentlyOnFallback.delete(agentId);

        const recoveryTime = Date.now() - (state.recoveryStartTime || Date.now());
        this.stats.recoveryCount += 1;

        // 平均復帰時間を更新
        this.stats.avgRecoveryTimeMs = recoveryTime;

        log.info(`[FallbackManager] ${agentId} fully recovered after ${recoveryTime}ms`);

        // 通知
        await this.notificationBus.sendNotification({
          id: `fallback-recovered-${Date.now()}-${agentId}`,
          severity: 'normal',
          source: agentId,
          title: `Agent ${agentId} recovered to primary AI`,
          message: `Recovery took ${recoveryTime}ms. All systems nominal.`,
          timestamp: Date.now(),
          metadata: { reason: 'primary_recovered' },
        });

        clearInterval(recoveryCheckInterval);
        return;
      }

      state.recoveryPhase += 1;
      log.info(`[FallbackManager] ${agentId} recovery phase ${state.recoveryPhase} (${state.recoveryPhase * 50}% traffic)`);
    }, 2 * 60 * 1000); // 2分ごとにフェーズを進める
  }

  /**
   * 定期的に Primary AI の復帰を監視
   */
  private startRecoveryMonitoring(): void {
    this.recoveryTimer = setInterval(() => {
      for (const [agentId, state] of this.agentStates) {
        if (state.onFallback) {
          // Primary をping
          this.pingPrimary(agentId).catch((err) => {
            log.error(`[FallbackManager] Ping failed for ${agentId}:`, err);
          });
        }
      }
    }, this.RECOVERY_CHECK_INTERVAL);
  }

  /**
   * Primary AI を ping して復帰チェック
   */
  private async pingPrimary(agentId: string): Promise<boolean> {
    try {
      // タイムアウト付きで ping
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Ping timeout')),
          this.RECOVERY_PING_TIMEOUT,
        ),
      );

      // 実際の ping は呼び出し側で実装する必要があります
      // ここでは簡略版（実装では Primary AI に軽いリクエストを送信）
      await Promise.race([this.simulatePing(agentId), timeoutPromise]);

      // Ping成功 → 復帰開始
      await this.initiateRecovery(agentId);
      return true;
    } catch (err) {
      log.warn(`[FallbackManager] Ping failed for ${agentId}, staying on fallback`);
      return false;
    }
  }

  /**
   * Ping シミュレーション（実装時は実際の API 呼び出しに置き換え）
   */
  private async simulatePing(agentId: string): Promise<void> {
    // 実装: Primary AI に healthcheck リクエストを送信
    // ここでは Promise を返す簡略版
    return new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  /**
   * エージェントの状態を取得または作成
   */
  private getOrCreateState(agentId: string): AgentFallbackState {
    if (!this.agentStates.has(agentId)) {
      this.agentStates.set(agentId, {
        agentId,
        onFallback: false,
        consecutiveFailures: 0,
        lastFailureTime: Date.now(),
        recoveryPhase: 0,
      });
    }
    return this.agentStates.get(agentId)!;
  }

  /**
   * エージェントの状態を取得
   */
  getStatus(agentId?: string): unknown {
    if (agentId) {
      const state = this.agentStates.get(agentId);
      return state || { agentId, message: 'Agent not found' };
    }

    // 全エージェントの状態を返す
    return {
      stats: this.stats,
      agents: Array.from(this.agentStates.values()),
    };
  }

  /**
   * 全エージェントを Primary にリセット（緊急復帰）
   */
  resetAll(): void {
    for (const state of this.agentStates.values()) {
      state.onFallback = false;
      state.consecutiveFailures = 0;
      state.recoveryPhase = 0;
      state.recoveryStartTime = undefined;
    }

    this.stats.currentlyOnFallback.clear();
    log.info('[FallbackManager] All agents reset to primary AI');
  }

  /**
   * 統計情報を取得
   */
  getStats(): FallbackStats {
    return { ...this.stats };
  }

  /**
   * シャットダウン
   */
  shutdown(): void {
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
    }
  }
}

// ── シングルトン ──
let fallbackManagerInstance: FallbackManager | null = null;

/**
 * FallbackManager シングルトン取得
 */
export function getFallbackManager(): FallbackManager {
  if (!fallbackManagerInstance) {
    fallbackManagerInstance = new FallbackManager();
  }
  return fallbackManagerInstance;
}
