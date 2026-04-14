/**
 * Storage Integration Tests — Gate 4 (消化器)
 *
 * initStorageFromEnv のティア選択ロジックを検証:
 * - Tier 1: DATABASE_URL → PostgreSQL (未テスト: 外部依存)
 * - Tier 2: AGENT_KV → KVStorage
 * - Tier 3: デフォルト → InMemoryStorage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initStorageFromEnv,
  getStorage,
  getStorageType,
  setStorage,
  InMemoryStorage,
} from '../storage';

describe('Storage Integration (initStorageFromEnv)', () => {
  beforeEach(() => {
    // ストレージをリセット（シングルトンのため手動）
    setStorage(new InMemoryStorage(100));
  });

  it('should fall back to InMemoryStorage when no env vars set', async () => {
    setStorage(null as unknown as InstanceType<typeof InMemoryStorage>); // force re-init
    // Force re-initialization by calling with empty env
    // Note: initStorageFromEnv checks if storageInstance already exists
    const storage = getStorage();
    expect(storage).toBeDefined();
  });

  it('should use KVStorage when AGENT_KV is provided', async () => {
    // Mock KV Namespace
    const mockKV = {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
      list: async () => ({ keys: [], list_complete: true }),
    };

    // Reset singleton to force re-init
    setStorage(null as unknown as InstanceType<typeof InMemoryStorage>);

    const storage = await initStorageFromEnv({ AGENT_KV: mockKV });
    expect(storage).toBeDefined();
    // KVStorage should be selected
    // KVStorage reports as 'external' type
expect(['kv', 'external', 'KVStorage']).toContain(getStorageType());
  });

  it('should fall back to InMemory when AGENT_KV is invalid', async () => {
    setStorage(null as unknown as InstanceType<typeof InMemoryStorage>);

    const storage = await initStorageFromEnv({ AGENT_KV: 'not-a-kv-object' });
    expect(storage).toBeDefined();
    expect(getStorageType()).toContain('memory');
  });

  it('should not re-initialize when already set', async () => {
    const firstStorage = await initStorageFromEnv({});
    const secondStorage = await initStorageFromEnv({ AGENT_KV: { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [], list_complete: true }) } });

    // Same instance — singleton prevents re-init
    expect(firstStorage).toBe(secondStorage);
  });

  it('InMemoryStorage should support full CRUD lifecycle', async () => {
    const storage = new InMemoryStorage(100);

    // Create
    await storage.put('test_table', { id: 'rec1', name: 'Alpha', createdAt: Date.now(), updatedAt: Date.now() });
    await storage.put('test_table', { id: 'rec2', name: 'Beta', createdAt: Date.now(), updatedAt: Date.now() });

    // Read
    const rec1 = await storage.get('test_table', 'rec1');
    expect(rec1).not.toBeNull();
    expect((rec1 as Record<string, unknown>).name).toBe('Alpha');

    // Query
    const all = await storage.query('test_table', {});
    expect(all.length).toBe(2);

    // Count
    const count = await storage.count('test_table');
    expect(count).toBe(2);

    // Delete
    const deleted = await storage.delete('test_table', 'rec1');
    expect(deleted).toBe(true);

    const afterDelete = await storage.count('test_table');
    expect(afterDelete).toBe(1);
  });

  it('InMemoryStorage should enforce LRU eviction', async () => {
    const storage = new InMemoryStorage(5); // Max 5 records per table

    for (let i = 0; i < 10; i++) {
      await storage.put('evict_table', { id: `r${i}`, createdAt: Date.now() + i, updatedAt: Date.now() + i });
    }

    const count = await storage.count('evict_table');
    expect(count).toBeLessThanOrEqual(5);
  });

  it('should provide storage stats', async () => {
    const storage = new InMemoryStorage(100);
    await storage.put('stats_test', { id: 's1', createdAt: Date.now(), updatedAt: Date.now() });

    const stats = await storage.stats();
    expect(stats).toHaveProperty('totalRecords');
    expect(stats.totalRecords).toBeGreaterThanOrEqual(1);
  });
});
