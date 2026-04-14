/**
 * サーキットブレーカー — 免疫系の自動遮断装置
 *
 * I-001: 外部API障害の自動フォールバック
 *
 * 医学メタファー: 免疫系の過剰反応抑制（免疫寛容）
 * 外部APIが連続障害を起こしたとき、リトライを止めて
 * フォールバックに切り替える。一定時間後にプローブ（偵察）
 * リクエストを送り、回復を確認してから通常運転に戻る。
 *
 * 状態遷移:
 * CLOSED (正常) → OPEN (遮断) → HALF_OPEN (偵察) → CLOSED
 *
 * Oxygen/Workers対応:
 * - インメモリ（ワーカー再起動でリセットされる＝安全側に倒れる）
 * - setTimeout不使用（時間計算のみ）
 */

// ━━━ 状態型 ━━━

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** OPEN に遷移するまでの連続失敗回数（デフォルト: 5） */
  failureThreshold?: number;
  /** OPEN 状態の持続時間ms（デフォルト: 30秒） */
  resetTimeout?: number;
  /** 成功時にカウンターをリセットする */
  resetOnSuccess?: boolean;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number | null;
  lastStateChange: number;
}

// ━━━ サーキットブレーカー本体 ━━━

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailure: number | null = null;
  private lastStateChange = Date.now();

  private readonly failureThreshold: number;
  private readonly resetTimeout: number;

  constructor(
    private readonly name: string,
    options: CircuitBreakerOptions = {},
  ) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 30_000;
  }

  /**
   * サーキットブレーカーを通して関数を実行
   *
   * @returns 成功時は結果、OPEN時はnull（フォールバック）
   */
  async execute<T>(
    fn: () => Promise<T>,
    fallback?: T,
  ): Promise<T | null> {
    // 状態チェック
    if (this.state === 'OPEN') {
      // タイムアウト経過 → HALF_OPEN（偵察モード）
      if (Date.now() - this.lastStateChange >= this.resetTimeout) {
        this.transitionTo('HALF_OPEN');
      } else {
        // まだOPEN → フォールバック即返し
        return fallback ?? null;
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();

      if (fallback !== undefined) return fallback;
      throw error;
    }
  }

  /**
   * 現在のリクエストが許可されるか（execute不使用の手動チェック用）
   */
  isAllowed(): boolean {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'HALF_OPEN') return true;
    // OPEN → タイムアウト経過なら HALF_OPEN に遷移して許可
    if (Date.now() - this.lastStateChange >= this.resetTimeout) {
      this.transitionTo('HALF_OPEN');
      return true;
    }
    return false;
  }

  /**
   * 統計情報を取得
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastStateChange: this.lastStateChange,
    };
  }

  /**
   * 手動リセット（テスト・管理用）
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = null;
    this.lastStateChange = Date.now();
  }

  // ━━━ 内部メソッド ━━━

  private onSuccess(): void {
    this.successes++;

    if (this.state === 'HALF_OPEN') {
      // 偵察成功 → 正常復帰
      this.transitionTo('CLOSED');
      this.failures = 0;
    } else if (this.state === 'CLOSED') {
      // 正常時は失敗カウンターをリセット
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();

    if (this.state === 'HALF_OPEN') {
      // 偵察失敗 → 再OPEN
      this.transitionTo('OPEN');
    } else if (this.state === 'CLOSED' && this.failures >= this.failureThreshold) {
      // 閾値超過 → OPEN
      this.transitionTo('OPEN');
    }
  }

  private transitionTo(newState: CircuitState): void {
    const prev = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    if (process.env.NODE_ENV === 'development') {
      console.warn(`[CircuitBreaker:${this.name}] ${prev} → ${newState} (failures=${this.failures})`);
    }
  }
}

// ━━━ プリセットインスタンス ━━━

/** Storefront API 用サーキットブレーカー */
export const storefrontCircuit = new CircuitBreaker('storefront-api', {
  failureThreshold: 3,
  resetTimeout: 15_000, // 15秒で偵察
});

/** 外部サービス（GA4, Webhook等）用 */
export const externalCircuit = new CircuitBreaker('external-services', {
  failureThreshold: 5,
  resetTimeout: 30_000,
});
