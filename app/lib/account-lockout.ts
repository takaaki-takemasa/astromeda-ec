/**
 * アカウントロックアウト — 心臓の防御弁
 *
 * H-013: ブルートフォース攻撃防止
 *
 * 医学メタファー: 血管収縮反射
 * 連続した不正なログイン試行（攻撃）を検出すると、
 * 血管が収縮して血流を制限するように、アカウントをロックする。
 *
 * 設計:
 * - IP + ユーザー名の組み合わせで追跡
 * - 5回連続失敗 → 15分ロック
 * - インメモリ（Phase 1）→ Redis/KV（Phase 2）
 * - ロック解除は時間経過のみ（管理者手動解除は Phase 2）
 */

import {securityLog} from '~/lib/audit-log';

// ━━━ 設定 ━━━

/** ロックまでの最大失敗回数 */
const MAX_ATTEMPTS = 5;

/** ロック期間（ミリ秒）= 15分 */
const LOCKOUT_DURATION = 15 * 60 * 1000;

/** 試行記録の保持期間（ミリ秒）= 1時間 */
const ATTEMPT_WINDOW = 60 * 60 * 1000;

/** 最大追跡エントリ数（メモリ保護） */
const MAX_ENTRIES = 10_000;

// ━━━ 内部状態 ━━━

interface AttemptRecord {
  /** 失敗回数 */
  count: number;
  /** 最初の失敗時刻 */
  firstAttempt: number;
  /** 最後の失敗時刻 */
  lastAttempt: number;
  /** ロックアウト時刻（null = 未ロック） */
  lockedAt: number | null;
}

const attempts = new Map<string, AttemptRecord>();

// ━━━ 公開API ━━━

/**
 * ログイン試行前にロック状態を確認
 * @returns ロック中ならtrue + 残り秒数
 */
export function isLocked(ip: string): {locked: boolean; remainingSeconds?: number} {
  const key = normalizeKey(ip);
  const record = attempts.get(key);

  if (!record?.lockedAt) return {locked: false};

  const elapsed = Date.now() - record.lockedAt;
  if (elapsed >= LOCKOUT_DURATION) {
    // ロック期間終了 → 記録をリセット
    attempts.delete(key);
    return {locked: false};
  }

  return {
    locked: true,
    remainingSeconds: Math.ceil((LOCKOUT_DURATION - elapsed) / 1000),
  };
}

/**
 * ログイン失敗を記録
 * @returns ロックされたかどうか
 */
export function recordFailedAttempt(ip: string): {nowLocked: boolean; attempts: number} {
  cleanup();
  const key = normalizeKey(ip);
  const now = Date.now();

  let record = attempts.get(key);
  if (!record || now - record.firstAttempt > ATTEMPT_WINDOW) {
    record = {count: 0, firstAttempt: now, lastAttempt: now, lockedAt: null};
  }

  record.count++;
  record.lastAttempt = now;

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedAt = now;
    attempts.set(key, record);
    securityLog('login_failed', `アカウントロック: ${MAX_ATTEMPTS}回連続失敗（IP: ${ip}）`, ip);
    return {nowLocked: true, attempts: record.count};
  }

  attempts.set(key, record);
  return {nowLocked: false, attempts: record.count};
}

/**
 * ログイン成功時に記録をリセット
 */
export function recordSuccessfulLogin(ip: string): void {
  const key = normalizeKey(ip);
  attempts.delete(key);
}

/**
 * 現在の追跡エントリ数を取得（監視用）
 */
export function getLockoutStats(): {
  trackedIPs: number;
  lockedIPs: number;
} {
  let lockedCount = 0;
  const now = Date.now();
  for (const record of attempts.values()) {
    if (record.lockedAt && now - record.lockedAt < LOCKOUT_DURATION) {
      lockedCount++;
    }
  }
  return {trackedIPs: attempts.size, lockedIPs: lockedCount};
}

/**
 * テスト用: 全記録をクリア
 */
export function clearLockoutState(): void {
  attempts.clear();
}

// ━━━ 内部ヘルパー ━━━

function normalizeKey(ip: string): string {
  return ip.trim().toLowerCase();
}

/** 古いエントリを定期的に削除（メモリリーク防止） */
function cleanup(): void {
  if (attempts.size <= MAX_ENTRIES) return;

  const now = Date.now();
  for (const [key, record] of attempts.entries()) {
    if (now - record.lastAttempt > ATTEMPT_WINDOW) {
      attempts.delete(key);
    }
  }

  // それでも多い場合は古い順に削除
  if (attempts.size > MAX_ENTRIES) {
    const sorted = [...attempts.entries()].sort((a, b) => a[1].lastAttempt - b[1].lastAttempt);
    const toDelete = sorted.slice(0, attempts.size - MAX_ENTRIES);
    for (const [key] of toDelete) {
      attempts.delete(key);
    }
  }
}
