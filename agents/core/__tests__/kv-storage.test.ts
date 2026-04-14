/**
 * KVStorage — 単体テスト（大脳皮質=長期記憶）
 *
 * テスト対象:
 * 1. KVStorage CRUD操作
 * 2. インデックス管理
 * 3. TTL / パージ
 * 4. createStorageFromEnv ファクトリ
 * 5. initStorageFromEnv フォールバック
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { KVStorage, createStorageFromEnv } from '../kv-storage.js';
import { initStorageFromEnv, getStorage, setStorage } from '../storage.js';
import type { StorageRecord, IStorageAdapter } from '../storage.js';

/** KV Namespace モック — InMemory実装 */
function createMockKV() {
  const store = new Map<string, string>();

  return {
    async get(key: string, opts?: { type?: string }) {
      const val = store.get(key);
      if (!val) return null;
      return opts?.type === 'json' ? JSON.parse(val) : val;
    },
    async put(key: string, value: string, _opts?: { expirationTtl?: number }) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list(opts?: { prefix?: string; limit?: number }) {
      const keys: Array<{ name: string }> = [];
      for (const [k] of store) {
        if (!opts?.prefix || k.startsWith(opts.prefix)) {
          keys.push({ name: k });
        }
        if (opts?.limit && keys.length >= opts.limit) break;
      }
      return { keys, list_complete: true };
    },
    _store: store, // テスト用アクセス
  };
}

describe('KVStorage', () => {
  let mockKV: ReturnType<typeof createMockKV>;
  let storage: KVStorage;

  beforeEach(() => {
    mockKV = createMockKV();
    storage = new KVStorage(mockKV as any);
  });

  // ── CRUD ──

  describe('CRUD Operations', () => {
    it('put + get が正しく動作するべき', async () => {
      const record: StorageRecord = {
        id: 'test-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: 'hello',
      };

      await storage.put('tests', record);
      const result = await storage.get<StorageRecord>('tests', 'test-1');

      expect(result).toBeDefined();
      expect(result!.id).toBe('test-1');
      expect(result!.data).toBe('hello');
    });

    it('存在しないレコードのgetはnullを返すべき', async () => {
      const result = await storage.get('tests', 'nonexistent');
      expect(result).toBeNull();
    });

    it('upsertが既存レコードを更新するべき', async () => {
      const record: StorageRecord = {
        id: 'test-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        value: 'original',
      };
      await storage.put('tests', record);

      await storage.upsert('tests', { ...record, value: 'updated', updatedAt: Date.now() + 100 });
      const result = await storage.get<StorageRecord & { value: string }>('tests', 'test-1');

      expect(result!.value).toBe('updated');
    });

    it('deleteが正しく動作するべき', async () => {
      await storage.put('tests', { id: 'del-1', createdAt: Date.now(), updatedAt: Date.now() });
      const deleted = await storage.delete('tests', 'del-1');
      expect(deleted).toBe(true);

      const result = await storage.get('tests', 'del-1');
      expect(result).toBeNull();
    });

    it('存在しないレコードのdeleteはfalseを返すべき', async () => {
      const result = await storage.delete('tests', 'nonexistent');
      expect(result).toBe(false);
    });
  });

  // ── Query ──

  describe('Query Operations', () => {
    beforeEach(async () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        await storage.put('items', {
          id: `item-${i}`,
          createdAt: now + i * 1000,
          updatedAt: now + i * 1000,
          category: i < 3 ? 'A' : 'B',
        });
      }
    });

    it('全レコードをクエリできるべき', async () => {
      const results = await storage.query('items', {});
      expect(results.length).toBe(5);
    });

    it('whereフィルタが動作するべき', async () => {
      const results = await storage.query('items', { where: { category: 'A' } });
      expect(results.length).toBe(3);
    });

    it('limitが動作するべき', async () => {
      const results = await storage.query('items', { limit: 2 });
      expect(results.length).toBe(2);
    });

    it('countが正確であるべき', async () => {
      const count = await storage.count('items');
      expect(count).toBe(5);
    });
  });

  // ── Purge ──

  describe('Purge Operations', () => {
    it('古いレコードをパージできるべき', async () => {
      const old = Date.now() - 86400000; // 24時間前
      const recent = Date.now();

      await storage.put('logs', { id: 'old-1', createdAt: old, updatedAt: old });
      await storage.put('logs', { id: 'recent-1', createdAt: recent, updatedAt: recent });

      const purged = await storage.purge('logs', Date.now() - 3600000); // 1時間前より古いものをパージ
      expect(purged).toBe(1);

      const remaining = await storage.count('logs');
      expect(remaining).toBe(1);
    });
  });

  // ── Cache ──

  describe('Request Cache', () => {
    it('clearRequestCacheがキャッシュをクリアするべき', async () => {
      await storage.put('cache-test', { id: 'c-1', createdAt: Date.now(), updatedAt: Date.now() });
      // 最初のgetでキャッシュに載る
      await storage.get('cache-test', 'c-1');
      // キャッシュクリア
      storage.clearRequestCache();
      // KVから再取得される（キャッシュミス）
      const result = await storage.get('cache-test', 'c-1');
      expect(result).toBeDefined();
    });
  });
});

// ── Factory Tests ──

describe('createStorageFromEnv', () => {
  it('KV Namespaceがあればストレージを返すべき', () => {
    const mockKV = createMockKV();
    const result = createStorageFromEnv({ AGENT_KV: mockKV });
    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(KVStorage);
  });

  it('KV Namespaceがなければnullを返すべき', () => {
    const result = createStorageFromEnv({});
    expect(result).toBeNull();
  });

  it('不正なKV Namespace（getメソッドなし）ではnullを返すべき', () => {
    const result = createStorageFromEnv({ AGENT_KV: { notAKV: true } });
    expect(result).toBeNull();
  });
});

// ── initStorageFromEnv Tests ──

describe('initStorageFromEnv', () => {
  it('KV未提供時はInMemoryStorageにフォールバックするべき', async () => {
    // シングルトンをリセット（テスト用）
    setStorage(undefined as unknown as IStorageAdapter);
    const result = await initStorageFromEnv({});
    expect(result).toBeDefined();
    // getStorageでも同じインスタンスが返るはず
    const current = getStorage();
    expect(current).toBeDefined();
  });
});
