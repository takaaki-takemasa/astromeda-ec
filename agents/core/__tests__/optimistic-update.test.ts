import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OptimisticUpdateManager, type OptimisticUpdateRecord } from '../optimistic-update';

describe('OptimisticUpdateManager', () => {
  let manager: OptimisticUpdateManager;

  beforeEach(() => {
    manager = new OptimisticUpdateManager();
  });

  // ── Basic Operations ──

  it('should apply optimistic update', () => {
    const record = manager.applyOptimistic(
      'update-1',
      'agent',
      'agent-123',
      { name: 'Updated Agent' },
      { name: 'Old Agent' },
    );

    expect(record.id).toBe('update-1');
    expect(record.status).toBe('pending');
    expect(record.change).toEqual({ name: 'Updated Agent' });
    expect(record.previousValue).toEqual({ name: 'Old Agent' });
  });

  it('should confirm pending update', () => {
    manager.applyOptimistic('update-1', 'agent', 'agent-123', { name: 'New' }, { name: 'Old' });

    const confirmed = manager.confirmUpdate('update-1');
    expect(confirmed?.status).toBe('confirmed');
    expect(confirmed?.confirmedAt).toBeLessThanOrEqual(Date.now());
  });

  it('should revert update with error message', () => {
    manager.applyOptimistic('update-1', 'agent', 'agent-123', { name: 'New' }, { name: 'Old' });

    const reverted = manager.revertUpdate('update-1', 'Network error');
    expect(reverted?.status).toBe('reverted');
    expect(reverted?.error).toBe('Network error');
    expect(reverted?.revertedAt).toBeLessThanOrEqual(Date.now());
  });

  // ── Pending Updates Query ──

  it('should get all pending updates', () => {
    manager.applyOptimistic('update-1', 'agent', 'agent-123', { a: 1 }, { a: 0 });
    manager.applyOptimistic('update-2', 'pipeline', 'pipe-456', { b: 2 }, { b: 0 });
    manager.applyOptimistic('update-3', 'config', 'cfg-789', { c: 3 }, { c: 0 });

    const pending = manager.getPendingUpdates();
    expect(pending).toHaveLength(3);
    expect(pending.every((r) => r.status === 'pending')).toBe(true);
  });

  it('should filter pending updates by entity type', () => {
    manager.applyOptimistic('update-1', 'agent', 'agent-123', { a: 1 }, { a: 0 });
    manager.applyOptimistic('update-2', 'pipeline', 'pipe-456', { b: 2 }, { b: 0 });
    manager.applyOptimistic('update-3', 'agent', 'agent-789', { c: 3 }, { c: 0 });

    const agentPending = manager.getPendingUpdates('agent');
    expect(agentPending).toHaveLength(2);
    expect(agentPending.every((r) => r.entityType === 'agent')).toBe(true);
  });

  it('should get pending count for specific entity', () => {
    manager.applyOptimistic('update-1', 'agent', 'agent-123', { a: 1 }, { a: 0 });
    manager.applyOptimistic('update-2', 'agent', 'agent-123', { b: 2 }, { b: 0 });
    manager.applyOptimistic('update-3', 'agent', 'agent-789', { c: 3 }, { c: 0 });

    const count = manager.getPendingCountForEntity('agent', 'agent-123');
    expect(count).toBe(2);
  });

  // ── State Transitions ──

  it('should transition from pending to confirmed', () => {
    const applied = manager.applyOptimistic('upd-1', 'agent', 'id', { x: 1 }, { x: 0 });
    expect(applied.status).toBe('pending');

    const confirmed = manager.confirmUpdate('upd-1');
    expect(confirmed?.status).toBe('confirmed');
    expect(applied).toBe(confirmed); // Same object reference
  });

  it('should transition from pending to reverted', () => {
    manager.applyOptimistic('upd-1', 'agent', 'id', { x: 1 }, { x: 0 });
    const reverted = manager.revertUpdate('upd-1', 'Server failed');
    expect(reverted?.status).toBe('reverted');
    expect(reverted?.previousValue).toEqual({ x: 0 });
  });

  it('should not double-confirm an update', () => {
    manager.applyOptimistic('upd-1', 'agent', 'id', { x: 1 }, { x: 0 });
    const first = manager.confirmUpdate('upd-1');
    const second = manager.confirmUpdate('upd-1');

    expect(first?.confirmedAt).toBe(second?.confirmedAt);
    expect(first?.status).toBe('confirmed');
  });

  it('should return null for non-existent update', () => {
    expect(manager.confirmUpdate('nonexistent')).toBeNull();
    expect(manager.revertUpdate('nonexistent')).toBeNull();
  });

  // ── Record Removal ──

  it('should remove update record', () => {
    manager.applyOptimistic('upd-1', 'agent', 'id', { x: 1 }, { x: 0 });
    expect(manager.removeUpdate('upd-1')).toBe(true);
    expect(manager.removeUpdate('upd-1')).toBe(false);
  });

  // ── Statistics ──

  it('should track total pending, confirmed, reverted counts', () => {
    manager.applyOptimistic('upd-1', 'agent', 'id1', { a: 1 }, { a: 0 });
    manager.applyOptimistic('upd-2', 'agent', 'id2', { b: 2 }, { b: 0 });
    manager.applyOptimistic('upd-3', 'agent', 'id3', { c: 3 }, { c: 0 });

    manager.confirmUpdate('upd-1');
    manager.revertUpdate('upd-2');

    const stats = manager.getStats();
    expect(stats.totalPending).toBe(1);
    expect(stats.totalConfirmed).toBe(1);
    expect(stats.totalReverted).toBe(1);
  });

  it('should break down stats by entity type', () => {
    manager.applyOptimistic('upd-1', 'agent', 'id1', { a: 1 }, { a: 0 });
    manager.applyOptimistic('upd-2', 'agent', 'id2', { b: 2 }, { b: 0 });
    manager.applyOptimistic('upd-3', 'pipeline', 'id3', { c: 3 }, { c: 0 });

    manager.confirmUpdate('upd-1');
    manager.revertUpdate('upd-3');

    const stats = manager.getStats();
    expect(stats.byEntityType['agent'].pending).toBe(1);
    expect(stats.byEntityType['agent'].confirmed).toBe(1);
    expect(stats.byEntityType['pipeline'].reverted).toBe(1);
  });

  // ── Cleanup ──

  it('should cleanup old records', async () => {
    manager.applyOptimistic('upd-1', 'agent', 'id', { x: 1 }, { x: 0 });
    manager.confirmUpdate('upd-1');

    await new Promise((resolve) => setTimeout(resolve, 10));
    const removed = manager.cleanupOldRecords(5); // 5ms old
    expect(removed).toBe(1);
  });

  it('should not cleanup pending updates', async () => {
    manager.applyOptimistic('upd-1', 'agent', 'id', { x: 1 }, { x: 0 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const removed = manager.cleanupOldRecords(10);
    expect(removed).toBe(0); // Pending updates are not removed
  });

  // ── Event Callbacks ──

  it('should notify callbacks on update', () => {
    const callback = vi.fn();
    manager.onUpdate(callback);

    manager.applyOptimistic('upd-1', 'agent', 'id', { x: 1 }, { x: 0 });
    manager.confirmUpdate('upd-1');

    expect(callback).toHaveBeenCalledTimes(2);
    // Both calls receive the same record object, so check the sequence of calls
    const firstCall = callback.mock.calls[0][0];
    const secondCall = callback.mock.calls[1][0];
    expect(firstCall.id).toBe('upd-1');
    expect(secondCall.id).toBe('upd-1');
    // The second call should have confirmed status
    expect(secondCall.status).toBe('confirmed');
  });

  it('should unsubscribe from callbacks', () => {
    const callback = vi.fn();
    const unsubscribe = manager.onUpdate(callback);

    manager.applyOptimistic('upd-1', 'agent', 'id', { x: 1 }, { x: 0 });
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
    manager.applyOptimistic('upd-2', 'agent', 'id', { y: 2 }, { y: 0 });
    expect(callback).toHaveBeenCalledTimes(1); // Not called again
  });

  it('should handle callback errors gracefully', () => {
    const badCallback = vi.fn(() => {
      throw new Error('Callback error');
    });
    const goodCallback = vi.fn();

    manager.onUpdate(badCallback);
    manager.onUpdate(goodCallback);

    expect(() => {
      manager.applyOptimistic('upd-1', 'agent', 'id', { x: 1 }, { x: 0 });
    }).not.toThrow();

    expect(badCallback).toHaveBeenCalled();
    expect(goodCallback).toHaveBeenCalled(); // Still called despite bad callback
  });

  // ── Generic Types ──

  it('should handle typed updates', () => {
    interface Config {
      timeout: number;
      retries: number;
    }

    const newValue: Config = { timeout: 5000, retries: 3 };
    const oldValue: Config = { timeout: 3000, retries: 1 };

    const record = manager.applyOptimistic<Config>('cfg-upd', 'config', 'cfg-1', newValue, oldValue);
    expect(record.change.timeout).toBe(5000);
    expect(record.previousValue.retries).toBe(1);
  });

  // ── Clear ──

  it('should clear all records', () => {
    manager.applyOptimistic('upd-1', 'agent', 'id1', { a: 1 }, { a: 0 });
    manager.applyOptimistic('upd-2', 'agent', 'id2', { b: 2 }, { b: 0 });

    manager.clear();
    expect(manager.getStats().totalPending).toBe(0);
    expect(manager.getPendingUpdates()).toHaveLength(0);
  });
});
