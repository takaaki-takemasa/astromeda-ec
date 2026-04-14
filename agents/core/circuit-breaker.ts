/**
 * Circuit Breaker — 外部障害遮断器（免疫系のアナフィラキシー防止機構）
 *
 * 医学メタファー: 免疫系の自己制御メカニズム（制御性T細胞）
 * 外部APIが障害を起こした時、全エージェントが一斉にリトライして
 * カスケード障害を引き起こすのを防ぐ。
 *
 * アナフィラキシーショック（過剰免疫反応）のように、
 * 「治そうとして身体全体を壊す」事態を防止する。
 *
 * 3状態:
 * - CLOSED（正常）: リクエスト通過。障害をカウント
 * - OPEN（遮断）: リクエスト即時拒否。冷却期間で回復待ち
 * - HALF_OPEN（試行）: 1件だけ通して回復確認
 *
 * 使用例:
 * ```typescript
 * const breaker = getCircuitBreaker('shopify-api');
 * const result = await breaker.execute(async () => {
 *   return await shopifyAdminFetch('/products.json');
 * });
 * ```
 */

import type { IAgentBus, AgentEvent } from './types.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('circuit-breaker');

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerConfig {
  /** 回路名（用途識別） */
  name: string;
  /** OPEN遷移する障害回数閾値 */
  failureThreshold: number;
  /** 障害カウントのリセット期間 (ms) */
  failureWindowMs: number;
  /** OPEN→HALF_OPEN までの冷却期間 (ms) */
  recoveryTimeMs: number;
  /** HALF_OPEN で成功が必要な回数 */
  successThreshold: number;
}

export interface CircuitBreakerStatus {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  openedAt: number;
  totalRequests: number;
  totalFailures: number;
  totalCircuitOpens: number;
}

const DEFAULT_CONFIG: Omit<CircuitBreakerConfig, 'name'> = {
  failureThreshold: 5,
  failureWindowMs: 60000,    // 60秒以内に5回失敗→OPEN
  recoveryTimeMs: 30000,     // 30秒冷却
  successThreshold: 2,       // HALF_OPENで2回成功→CLOSED
};

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = 'closed';
  private failures: number[] = []; // タイムスタンプ配列（ウィンドウ管理）
  private halfOpenSuccesses = 0;
  private openedAt = 0;
  private lastFailureTime = 0;
  private lastSuccessTime = 0;

  // 統計
  private totalRequests = 0;
  private totalFailures = 0;
  private totalCircuitOpens = 0;

  // N-06: bus参照（circuit openイベント発行用）
  private bus: IAgentBus | null = null;

  constructor(config: Partial<CircuitBreakerConfig> & { name: string }) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** N-06: AgentBus接続 */
  connectBus(bus: IAgentBus): void {
    this.bus = bus;
  }

  /**
   * 回路を通じて外部API呼び出しを実行
   * OPEN状態なら即座にCircuitOpenErrorをthrow（API呼び出しを行わない）
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // OPEN状態チェック
    if (this.state === 'open') {
      // 冷却期間が経過したらHALF_OPENに遷移
      if (Date.now() - this.openedAt >= this.config.recoveryTimeMs) {
        this.state = 'half_open';
        this.halfOpenSuccesses = 0;
        log.info(`[CircuitBreaker:${this.config.name}] OPEN → HALF_OPEN（回復試行開始）`);
      } else {
        throw new CircuitOpenError(
          `Circuit breaker "${this.config.name}" is OPEN. Recovery in ${Math.ceil((this.config.recoveryTimeMs - (Date.now() - this.openedAt)) / 1000)}s`,
          this.config.name,
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /** 成功時処理 */
  private onSuccess(): void {
    this.lastSuccessTime = Date.now();

    if (this.state === 'half_open') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.config.successThreshold) {
        this.state = 'closed';
        this.failures = [];
        log.info(`[CircuitBreaker:${this.config.name}] HALF_OPEN → CLOSED（回復確認完了）`);
      }
    } else if (this.state === 'closed') {
      // 正常時は古い障害記録をウィンドウ外のものだけ掃除
      this.cleanOldFailures();
    }
  }

  /** 障害時処理 */
  private onFailure(): void {
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half_open') {
      // HALF_OPENで障害 → 即座にOPENに戻す
      this.state = 'open';
      this.openedAt = Date.now();
      this.totalCircuitOpens++;
      log.warn(`[CircuitBreaker:${this.config.name}] HALF_OPEN → OPEN（回復失敗、再冷却）`);
      return;
    }

    // CLOSED状態: 障害カウント
    this.failures.push(Date.now());
    this.cleanOldFailures();

    if (this.failures.length >= this.config.failureThreshold) {
      this.state = 'open';
      this.openedAt = Date.now();
      this.totalCircuitOpens++;
      log.warn(
        `[CircuitBreaker:${this.config.name}] CLOSED → OPEN（${this.failures.length}回障害/${this.config.failureWindowMs}ms以内）`,
      );

      // N-06: circuit.openedイベント発行 → NotificationRouter経由で管理者通知
      if (this.bus) {
        this.bus.publish({
          id: `cb_open_${Date.now()}_${this.config.name}`,
          type: 'circuit.opened',
          source: `circuit-breaker:${this.config.name}`,
          priority: 'high',
          payload: {
            circuitName: this.config.name,
            failureCount: this.failures.length,
            threshold: this.config.failureThreshold,
            recoveryTimeMs: this.config.recoveryTimeMs,
            totalOpens: this.totalCircuitOpens,
          },
          timestamp: Date.now(),
        } as AgentEvent).catch(() => {
          // bus.publish失敗はログのみ（circuit breaker自体が障害中にbus障害はありうる）
        });
      }
    }
  }

  /** ウィンドウ外の古い障害記録を削除 */
  private cleanOldFailures(): void {
    const cutoff = Date.now() - this.config.failureWindowMs;
    this.failures = this.failures.filter(t => t > cutoff);
  }

  /** 手動で回路をリセット（管理者操作） */
  reset(): void {
    this.state = 'closed';
    this.failures = [];
    this.halfOpenSuccesses = 0;
    log.info(`[CircuitBreaker:${this.config.name}] 手動リセット → CLOSED`);
  }

  /** 手動で回路をOPEN（緊急遮断） */
  trip(reason?: string): void {
    this.state = 'open';
    this.openedAt = Date.now();
    this.totalCircuitOpens++;
    log.warn(`[CircuitBreaker:${this.config.name}] 手動トリップ → OPEN${reason ? `: ${reason}` : ''}`);
  }

  /** 状態取得 */
  getStatus(): CircuitBreakerStatus {
    this.cleanOldFailures();
    return {
      name: this.config.name,
      state: this.state,
      failures: this.failures.length,
      successes: this.halfOpenSuccesses,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      openedAt: this.openedAt,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalCircuitOpens: this.totalCircuitOpens,
    };
  }
}

/** Circuit Breaker OPEN時の専用エラー */
export class CircuitOpenError extends Error {
  readonly circuitName: string;
  constructor(message: string, circuitName: string) {
    super(message);
    this.name = 'CircuitOpenError';
    this.circuitName = circuitName;
  }
}

// ── シングルトンレジストリ（全回路の中央管理） ──

const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * 名前付きCircuit Breakerを取得（なければ作成）
 * @example
 * const shopifyBreaker = getCircuitBreaker('shopify-admin-api');
 * const aiBreaker = getCircuitBreaker('claude-api', { failureThreshold: 3 });
 */
export function getCircuitBreaker(
  name: string,
  config?: Partial<Omit<CircuitBreakerConfig, 'name'>>,
): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker({ name, ...config }));
  }
  return circuitBreakers.get(name)!;
}

/** 全Circuit Breakerの状態を取得（診断用） */
export function getAllCircuitBreakerStatuses(): CircuitBreakerStatus[] {
  return [...circuitBreakers.values()].map(cb => cb.getStatus());
}

/** 全Circuit Breakerをリセット（管理者操作） */
export function resetAllCircuitBreakers(): void {
  for (const cb of circuitBreakers.values()) {
    cb.reset();
  }
}

/** レジストリ完全クリア（テスト用 — テスト間の状態汚染防止） */
export function clearCircuitBreakerRegistry(): void {
  circuitBreakers.clear();
}
