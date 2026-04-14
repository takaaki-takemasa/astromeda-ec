/**
 * サーキットブレーカー テスト — I-001
 */
import {describe, it, expect, beforeEach} from 'vitest';
import {CircuitBreaker} from '../circuit-breaker';

describe('CircuitBreaker (I-001)', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('test', {
      failureThreshold: 3,
      resetTimeout: 100, // テスト用に短い
    });
  });

  it('初期状態はCLOSED', () => {
    expect(breaker.getStats().state).toBe('CLOSED');
  });

  it('成功リクエストはそのまま通過', async () => {
    const result = await breaker.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(breaker.getStats().state).toBe('CLOSED');
  });

  it('失敗が閾値未満ではCLOSEDのまま', async () => {
    for (let i = 0; i < 2; i++) {
      await breaker.execute(() => Promise.reject(new Error('fail')), 'fallback');
    }
    expect(breaker.getStats().state).toBe('CLOSED');
    expect(breaker.getStats().failures).toBe(2);
  });

  it('失敗が閾値に達するとOPENに遷移', async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error('fail')), 'fallback');
    }
    expect(breaker.getStats().state).toBe('OPEN');
  });

  it('OPEN状態ではフォールバックを即返し', async () => {
    // OPENにする
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error('fail')), 'fallback');
    }
    expect(breaker.getStats().state).toBe('OPEN');

    // 関数を呼ばずにフォールバックが返る
    let fnCalled = false;
    const result = await breaker.execute(() => {
      fnCalled = true;
      return Promise.resolve('should not run');
    }, 'fallback-value');

    expect(result).toBe('fallback-value');
    expect(fnCalled).toBe(false);
  });

  it('OPEN → タイムアウト後 → HALF_OPEN → 成功 → CLOSED', async () => {
    // OPENにする
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error('fail')), 'fallback');
    }
    expect(breaker.getStats().state).toBe('OPEN');

    // タイムアウト待ち
    await new Promise((r) => setTimeout(r, 150));

    // 偵察リクエスト成功 → CLOSED
    const result = await breaker.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
    expect(breaker.getStats().state).toBe('CLOSED');
  });

  it('HALF_OPEN → 失敗 → 再OPEN', async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error('fail')), 'fb');
    }

    await new Promise((r) => setTimeout(r, 150));

    // 偵察失敗 → 再OPEN
    await breaker.execute(() => Promise.reject(new Error('still down')), 'fb');
    expect(breaker.getStats().state).toBe('OPEN');
  });

  it('成功後にfailureカウンターがリセット', async () => {
    await breaker.execute(() => Promise.reject(new Error('fail')), 'fb');
    await breaker.execute(() => Promise.reject(new Error('fail')), 'fb');
    expect(breaker.getStats().failures).toBe(2);

    await breaker.execute(() => Promise.resolve('ok'));
    expect(breaker.getStats().failures).toBe(0);
  });

  it('reset()で初期状態に戻る', async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error('fail')), 'fb');
    }
    expect(breaker.getStats().state).toBe('OPEN');

    breaker.reset();
    expect(breaker.getStats().state).toBe('CLOSED');
    expect(breaker.getStats().failures).toBe(0);
  });

  it('isAllowed() で手動チェック可能', () => {
    expect(breaker.isAllowed()).toBe(true);
  });

  it('フォールバック未指定時はthrow', async () => {
    await expect(
      breaker.execute(() => Promise.reject(new Error('fail'))),
    ).rejects.toThrow('fail');
  });
});
