/**
 * Circuit Breaker テスト — 免疫系カスケード障害防止の検証
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitOpenError,
  getCircuitBreaker,
  getAllCircuitBreakerStatuses,
  resetAllCircuitBreakers,
} from '../circuit-breaker.js';

describe('CircuitBreaker', () => {
  describe('基本動作', () => {
    it('CLOSED状態で正常リクエストを通す', async () => {
      const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3 });
      const result = await cb.execute(async () => 'ok');
      expect(result).toBe('ok');
      expect(cb.getStatus().state).toBe('closed');
    });

    it('障害をカウントしCLOSED状態を維持する（閾値未満）', async () => {
      const cb = new CircuitBreaker({
        name: 'test',
        failureThreshold: 3,
        failureWindowMs: 60000,
      });

      // 2回失敗（閾値3未満）
      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow('fail');
      }

      expect(cb.getStatus().state).toBe('closed');
      expect(cb.getStatus().failures).toBe(2);
    });

    it('閾値到達でCLOSED→OPENに遷移', async () => {
      const cb = new CircuitBreaker({
        name: 'test',
        failureThreshold: 3,
        failureWindowMs: 60000,
      });

      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow('fail');
      }

      expect(cb.getStatus().state).toBe('open');
      expect(cb.getStatus().totalCircuitOpens).toBe(1);
    });

    it('OPEN状態でCircuitOpenErrorをthrow（APIを呼ばない）', async () => {
      const cb = new CircuitBreaker({
        name: 'test-api',
        failureThreshold: 1,
        failureWindowMs: 60000,
        recoveryTimeMs: 10000,
      });

      // 1回失敗→OPEN
      await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow('fail');
      expect(cb.getStatus().state).toBe('open');

      // OPEN状態でリクエスト → CircuitOpenError
      const fn = vi.fn();
      await expect(cb.execute(fn)).rejects.toThrow(CircuitOpenError);
      expect(fn).not.toHaveBeenCalled(); // API呼び出しが行われていないことを確認
    });
  });

  describe('回復メカニズム', () => {
    it('OPEN→HALF_OPEN（冷却期間後）→CLOSED（成功）', async () => {
      const cb = new CircuitBreaker({
        name: 'test-recovery',
        failureThreshold: 1,
        failureWindowMs: 60000,
        recoveryTimeMs: 50, // 50ms冷却
        successThreshold: 1,
      });

      // OPEN化
      await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
      expect(cb.getStatus().state).toBe('open');

      // 冷却期間待ち
      await new Promise(r => setTimeout(r, 60));

      // 回復リクエスト成功 → CLOSED
      const result = await cb.execute(async () => 'recovered');
      expect(result).toBe('recovered');
      expect(cb.getStatus().state).toBe('closed');
    });

    it('HALF_OPENで失敗 → OPENに戻る', async () => {
      const cb = new CircuitBreaker({
        name: 'test-halfopen-fail',
        failureThreshold: 1,
        failureWindowMs: 60000,
        recoveryTimeMs: 50,
        successThreshold: 2,
      });

      // OPEN化
      await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();

      // 冷却後 HALF_OPEN
      await new Promise(r => setTimeout(r, 60));

      // HALF_OPENで失敗 → OPEN
      await expect(cb.execute(async () => { throw new Error('still fail'); })).rejects.toThrow();
      expect(cb.getStatus().state).toBe('open');
    });
  });

  describe('手動制御', () => {
    it('手動リセット', async () => {
      const cb = new CircuitBreaker({
        name: 'test-reset',
        failureThreshold: 1,
        failureWindowMs: 60000,
      });

      await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
      expect(cb.getStatus().state).toBe('open');

      cb.reset();
      expect(cb.getStatus().state).toBe('closed');
      expect(cb.getStatus().failures).toBe(0);
    });

    it('手動トリップ（緊急遮断）', () => {
      const cb = new CircuitBreaker({ name: 'test-trip' });
      cb.trip('Maintenance');
      expect(cb.getStatus().state).toBe('open');
    });
  });

  describe('ウィンドウ管理', () => {
    it('古い障害はウィンドウ外で自動削除', async () => {
      const cb = new CircuitBreaker({
        name: 'test-window',
        failureThreshold: 3,
        failureWindowMs: 100, // 100msウィンドウ
      });

      // 2回失敗
      await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
      await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();

      // ウィンドウ期間待ち
      await new Promise(r => setTimeout(r, 150));

      // 1回失敗（古い2回は期限切れ）
      await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();

      // 合計は閾値3未満なのでCLOSED維持
      expect(cb.getStatus().state).toBe('closed');
      expect(cb.getStatus().failures).toBe(1); // 古い2件は削除済み
    });
  });

  describe('シングルトンレジストリ', () => {
    beforeEach(() => {
      resetAllCircuitBreakers();
    });

    it('getCircuitBreakerは同名で同一インスタンスを返す', () => {
      const cb1 = getCircuitBreaker('shopify');
      const cb2 = getCircuitBreaker('shopify');
      expect(cb1).toBe(cb2);
    });

    it('異なる名前で異なるインスタンスを返す', () => {
      const cb1 = getCircuitBreaker('shopify');
      const cb2 = getCircuitBreaker('claude');
      expect(cb1).not.toBe(cb2);
    });

    it('getAllCircuitBreakerStatusesが全回路状態を返す', () => {
      getCircuitBreaker('shopify');
      getCircuitBreaker('claude');
      const statuses = getAllCircuitBreakerStatuses();
      expect(statuses).toHaveLength(2);
      expect(statuses.map(s => s.name)).toContain('shopify');
      expect(statuses.map(s => s.name)).toContain('claude');
    });

    it('resetAllCircuitBreakersが全回路をリセット', async () => {
      const cb = getCircuitBreaker('test', { failureThreshold: 1 });
      await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
      expect(cb.getStatus().state).toBe('open');

      resetAllCircuitBreakers();
      expect(cb.getStatus().state).toBe('closed');
    });
  });

  describe('統計追跡', () => {
    it('totalRequests / totalFailures を正しくカウント', async () => {
      const cb = new CircuitBreaker({ name: 'stats', failureThreshold: 10 });

      await cb.execute(async () => 'ok');
      await cb.execute(async () => 'ok');
      await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();

      const status = cb.getStatus();
      expect(status.totalRequests).toBe(3);
      expect(status.totalFailures).toBe(1);
    });
  });
});
