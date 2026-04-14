/**
 * アカウントロックアウト テスト — H-013
 */
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {
  isLocked,
  recordFailedAttempt,
  recordSuccessfulLogin,
  getLockoutStats,
  clearLockoutState,
} from '../account-lockout';

beforeEach(() => {
  clearLockoutState();
  vi.restoreAllMocks();
});

describe('Account Lockout (H-013)', () => {
  it('初期状態ではロックされていない', () => {
    expect(isLocked('192.168.1.1')).toEqual({locked: false});
  });

  it('4回失敗してもロックされない', () => {
    for (let i = 0; i < 4; i++) {
      const result = recordFailedAttempt('192.168.1.1');
      expect(result.nowLocked).toBe(false);
    }
    expect(isLocked('192.168.1.1')).toEqual({locked: false});
  });

  it('5回失敗でロックされる', () => {
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt('192.168.1.1');
    }
    const lockStatus = isLocked('192.168.1.1');
    expect(lockStatus.locked).toBe(true);
    expect(lockStatus.remainingSeconds).toBeGreaterThan(0);
  });

  it('5回目の返り値でnowLocked=true', () => {
    for (let i = 0; i < 4; i++) {
      expect(recordFailedAttempt('10.0.0.1').nowLocked).toBe(false);
    }
    expect(recordFailedAttempt('10.0.0.1').nowLocked).toBe(true);
  });

  it('ログイン成功で記録がリセット', () => {
    for (let i = 0; i < 3; i++) recordFailedAttempt('192.168.1.1');
    recordSuccessfulLogin('192.168.1.1');
    // リセット後は0から再カウント
    expect(recordFailedAttempt('192.168.1.1').attempts).toBe(1);
  });

  it('異なるIPは独立して追跡', () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt('1.1.1.1');
    expect(isLocked('1.1.1.1').locked).toBe(true);
    expect(isLocked('2.2.2.2').locked).toBe(false);
  });

  it('getLockoutStats で統計を取得', () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt('1.1.1.1');
    for (let i = 0; i < 3; i++) recordFailedAttempt('2.2.2.2');

    const stats = getLockoutStats();
    expect(stats.trackedIPs).toBe(2);
    expect(stats.lockedIPs).toBe(1);
  });

  it('IPは大文字小文字を区別しない', () => {
    for (let i = 0; i < 3; i++) recordFailedAttempt('ABC');
    for (let i = 0; i < 2; i++) recordFailedAttempt('abc');
    expect(isLocked('Abc').locked).toBe(true);
  });
});
