/**
 * RateLimiter — レート制限（自然免疫=侵入者を物理的に排除）
 *
 * 医学的メタファー: 自然免疫系（Innate Immunity）
 * 皮膚・粘膜のバリア機能。特定の抗原を認識しなくても、
 * 「大量の侵入」を検知して自動的にブロックする。
 *
 * 用途:
 * 1. ログイン試行: 5回失敗で15分ロック
 * 2. API呼び出し: 60req/分/IP
 * 3. 承認操作: 30req/分
 *
 * Oxygen制約: リクエスト間で状態を共有できないため、
 * KV Storageに書き込んでリクエスト間で制限を維持する。
 * InMemory fallbackでは単一リクエスト内のみ有効。
 */

import { createLogger } from '../core/logger.js';

const log = createLogger('rate-limiter');

// ── 型定義 ──

interface RateLimitEntry {
  count: number;
  windowStart: number;
  lockedUntil?: number;
}

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  lockoutMs: number;
}

// ── プリセット ──

export const RATE_LIMITS = {
  login: { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockoutMs: 15 * 60 * 1000 } as RateLimitConfig,
  api: { maxAttempts: 60, windowMs: 60 * 1000, lockoutMs: 60 * 1000 } as RateLimitConfig,
  approval: { maxAttempts: 30, windowMs: 60 * 1000, lockoutMs: 5 * 60 * 1000 } as RateLimitConfig,
};

// ── RateLimiter クラス ──

export class RateLimiter {
  private entries: Map<string, RateLimitEntry> = new Map();
  private config: RateLimitConfig;
  private lastCleanup = Date.now();
  private static readonly CLEANUP_INTERVAL = 60_000; // 60秒毎に自動クリーンアップ
  private static readonly MAX_ENTRIES = 10_000; // 予防医学: エントリ数上限（メモリリーク防止）

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * リクエストを検証
   * @returns { allowed: true } or { allowed: false, retryAfter, remaining }
   */
  check(key: string): {
    allowed: boolean;
    remaining: number;
    retryAfterMs: number;
    totalAttempts: number;
  } {
    const now = Date.now();

    // 予防医学: 定期的な自動クリーンアップ（免疫系の自動貪食=オートファジー）
    if (now - this.lastCleanup > RateLimiter.CLEANUP_INTERVAL || this.entries.size > RateLimiter.MAX_ENTRIES) {
      this.cleanup();
      this.lastCleanup = now;
    }

    let entry = this.entries.get(key);

    // ロックアウト中
    if (entry?.lockedUntil && now < entry.lockedUntil) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: entry.lockedUntil - now,
        totalAttempts: entry.count,
      };
    }

    // ウィンドウリセット
    if (!entry || now - entry.windowStart >= this.config.windowMs) {
      entry = { count: 0, windowStart: now };
    }

    // ロックアウト解除後のリセット
    if (entry.lockedUntil && now >= entry.lockedUntil) {
      entry = { count: 0, windowStart: now };
    }

    entry.count++;
    this.entries.set(key, entry);

    // 上限超過 → ロックアウト
    if (entry.count > this.config.maxAttempts) {
      entry.lockedUntil = now + this.config.lockoutMs;
      this.entries.set(key, entry);

      log.warn(`[RateLimiter] Locked: ${key} (${entry.count} attempts)`);

      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: this.config.lockoutMs,
        totalAttempts: entry.count,
      };
    }

    return {
      allowed: true,
      remaining: this.config.maxAttempts - entry.count,
      retryAfterMs: 0,
      totalAttempts: entry.count,
    };
  }

  /**
   * 成功時にカウントをリセット（ログイン成功など）
   */
  reset(key: string): void {
    this.entries.delete(key);
  }

  /**
   * クリーンアップ（期限切れエントリを削除）
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.entries) {
      const isExpiredWindow = now - entry.windowStart >= this.config.windowMs * 2;
      const isExpiredLock = entry.lockedUntil && now >= entry.lockedUntil + this.config.windowMs;
      if (isExpiredWindow || isExpiredLock) {
        this.entries.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * 統計
   */
  getStats(): { activeEntries: number; lockedEntries: number } {
    const now = Date.now();
    let locked = 0;
    for (const entry of this.entries.values()) {
      if (entry.lockedUntil && now < entry.lockedUntil) locked++;
    }
    return { activeEntries: this.entries.size, lockedEntries: locked };
  }
}

// ── シングルトンインスタンス ──

const limiters = new Map<string, RateLimiter>();

export function getRateLimiter(name: keyof typeof RATE_LIMITS): RateLimiter {
  let limiter = limiters.get(name);
  if (!limiter) {
    limiter = new RateLimiter(RATE_LIMITS[name]);
    limiters.set(name, limiter);
  }
  return limiter;
}

/**
 * IPアドレスを抽出するユーティリティ
 */
export function getClientIP(request: Request): string {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || request.headers.get('X-Real-IP')
    || 'unknown';
}
