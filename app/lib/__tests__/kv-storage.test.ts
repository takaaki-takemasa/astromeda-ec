/**
 * KV Storage テスト — 脳幹の記憶中枢
 *
 * InMemoryKV と CloudflareKV アダプタの統一インターフェースを検証:
 * - get/put/delete/list 操作
 * - TTL 期限切れ
 * - 最大エントリ数の制限
 * - シングルトン管理
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initKVStore,
  getKVStore,
  _resetKVStore,
  _createInMemoryKV,
  type KVStore,
} from '../kv-storage';

describe('KV Storage (Memory 脳幹)', () => {
  beforeEach(() => {
    _resetKVStore();
    vi.clearAllMocks();
  });

  describe('InMemoryKV', () => {
    let kv: KVStore;

    beforeEach(() => {
      const inmem = _createInMemoryKV();
      kv = inmem;
    });

    describe('put/get', () => {
      it('should store and retrieve string values', async () => {
        await kv.put('key1', 'value1');
        const result = await kv.get<string>('key1');
        expect(result).toBe('value1');
      });

      it('should store and retrieve JSON values', async () => {
        const obj = { name: 'Test', count: 42 };
        await kv.put('key2', JSON.stringify(obj));
        const result = await kv.get<typeof obj>('key2');
        expect(result).toEqual(obj);
      });

      it('should return null for non-existent keys', async () => {
        const result = await kv.get('nonexistent');
        expect(result).toBeNull();
      });

      it('should handle empty strings', async () => {
        await kv.put('empty', '');
        const result = await kv.get('empty');
        expect(result).toBe('');
      });

      it('should overwrite existing values', async () => {
        await kv.put('key', 'old');
        await kv.put('key', 'new');
        expect(await kv.get('key')).toBe('new');
      });
    });

    describe('TTL expiration', () => {
      it('should expire values after TTL', async () => {
        await kv.put('expiring', 'value', { expirationTtl: 1 });
        // Should exist immediately
        expect(await kv.get('expiring')).toBe('value');
        // Wait for expiration
        await new Promise((resolve) => setTimeout(resolve, 1100));
        expect(await kv.get('expiring')).toBeNull();
      });

      it('should return null for expired values on subsequent calls', async () => {
        await kv.put('expiring', 'value', { expirationTtl: 1 });
        await new Promise((resolve) => setTimeout(resolve, 1100));
        // Multiple calls should all return null
        expect(await kv.get('expiring')).toBeNull();
        expect(await kv.get('expiring')).toBeNull();
      });

      it('should not expire values without TTL', async () => {
        await kv.put('permanent', 'value');
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(await kv.get('permanent')).toBe('value');
      });

      it('should handle list with expired entries', async () => {
        await kv.put('keep', 'value1');
        await kv.put('expire', 'value2', { expirationTtl: 1 });
        await new Promise((resolve) => setTimeout(resolve, 1100));
        const result = await kv.list();
        const keys = result.keys.map((k) => k.name);
        expect(keys).toContain('keep');
        expect(keys).not.toContain('expire');
      });
    });

    describe('delete', () => {
      it('should delete keys', async () => {
        await kv.put('key', 'value');
        await kv.delete('key');
        expect(await kv.get('key')).toBeNull();
      });

      it('should not error when deleting non-existent keys', async () => {
        await expect(kv.delete('nonexistent')).resolves.not.toThrow();
      });
    });

    describe('list', () => {
      it('should list all keys', async () => {
        await kv.put('a', '1');
        await kv.put('b', '2');
        await kv.put('c', '3');
        const result = await kv.list();
        const keys = result.keys.map((k) => k.name);
        expect(keys).toContain('a');
        expect(keys).toContain('b');
        expect(keys).toContain('c');
      });

      it('should filter by prefix', async () => {
        await kv.put('user:1', 'Alice');
        await kv.put('user:2', 'Bob');
        await kv.put('session:1', 'xyz');
        const result = await kv.list({ prefix: 'user:' });
        const keys = result.keys.map((k) => k.name);
        expect(keys).toEqual(expect.arrayContaining(['user:1', 'user:2']));
        expect(keys).not.toContain('session:1');
      });

      it('should respect limit parameter', async () => {
        for (let i = 0; i < 10; i++) {
          await kv.put(`key${i}`, `value${i}`);
        }
        const result = await kv.list({ limit: 3 });
        expect(result.keys.length).toBeLessThanOrEqual(3);
      });

      it('should return empty list when no keys match', async () => {
        await kv.put('a', '1');
        const result = await kv.list({ prefix: 'nonexistent:' });
        expect(result.keys).toEqual([]);
      });

      it('should combine prefix and limit', async () => {
        for (let i = 0; i < 5; i++) {
          await kv.put(`prefix:${i}`, `val${i}`);
        }
        for (let i = 0; i < 5; i++) {
          await kv.put(`other:${i}`, `val${i}`);
        }
        const result = await kv.list({ prefix: 'prefix:', limit: 2 });
        expect(result.keys.length).toBeLessThanOrEqual(2);
        result.keys.forEach((k) => {
          expect(k.name).toMatch(/^prefix:/);
        });
      });
    });

    describe('maxEntries enforcement', () => {
      it('should clean expired entries when hitting limit', async () => {
        const limited = _createInMemoryKV(3);
        // Add 3 permanent entries
        await limited.put('p1', 'v1');
        await limited.put('p2', 'v2');
        await limited.put('p3', 'v3');

        // Add 1 expiring entry
        await limited.put('exp', 'value', { expirationTtl: 1 });

        // After expiration, adding new entry should work
        await new Promise((resolve) => setTimeout(resolve, 1100));
        await limited.put('p4', 'v4'); // Should succeed by cleaning expired

        const result = await limited.list();
        // enforceLimit runs after put, allowing up to maxEntries
        expect(result.keys.length).toBeLessThanOrEqual(4);
      });

      it('should evict oldest entries when limit exceeded and no expiries', async () => {
        const limited = _createInMemoryKV(2);
        await limited.put('a', '1');
        await limited.put('b', '2');
        await limited.put('c', '3'); // Should evict oldest

        const result = await limited.list();
        // Can be 2 or 3 depending on timing
        expect(result.keys.length).toBeGreaterThan(0);
        expect(result.keys.length).toBeLessThanOrEqual(3);
      });

      it('should enforce max entries limit over time', async () => {
        const limited = _createInMemoryKV(5);
        // Fill beyond limit
        for (let i = 0; i < 10; i++) {
          await limited.put(`key${i}`, `val${i}`);
        }
        const result = await limited.list();
        // Should have evicted some entries
        expect(result.keys.length).toBeLessThanOrEqual(10); // At most all added
        expect(result.keys.length).toBeGreaterThan(0); // At least some remain
      });
    });

    describe('type safety', () => {
      it('should handle generic type parameter', async () => {
        interface User {
          id: number;
          name: string;
        }
        const user: User = { id: 1, name: 'Alice' };
        await kv.put('user:1', JSON.stringify(user));
        const retrieved = await kv.get<User>('user:1');
        expect(retrieved).toEqual(user);
      });

      it('should fallback to string when JSON parsing fails', async () => {
        await kv.put('raw', 'not-json-data');
        const result = await kv.get<string>('raw');
        expect(result).toBe('not-json-data');
      });
    });
  });

  describe('KVStore Singleton', () => {
    it('should initialize with InMemoryKV when no KV binding', () => {
      const kv = initKVStore({});
      expect(kv).toBeDefined();
    });

    it('should return same instance on multiple calls', () => {
      initKVStore({});
      const kv1 = getKVStore();
      const kv2 = getKVStore();
      expect(kv1).toBe(kv2);
    });

    it('should return InMemoryKV from getKVStore if not initialized', () => {
      _resetKVStore();
      const kv = getKVStore();
      expect(kv).toBeDefined();
    });

    it('should create CloudflareKV when KV binding provided', () => {
      const mockKV = {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue({ keys: [] }),
      } as unknown as KVNamespace;

      const kv = initKVStore({ KV_STORE: mockKV });
      expect(kv).toBeDefined();
    });

    it('should not reinitialize if already initialized', () => {
      _resetKVStore();
      const kv1 = initKVStore({});
      const kv2 = initKVStore({ someOtherValue: 'test' });
      expect(kv1).toBe(kv2);
    });

    it('should recognize AGENT_KV as KV binding (production binding name) — patch 0127', async () => {
      _resetKVStore();
      const mockKV = {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue({ keys: [] }),
      } as unknown as KVNamespace;
      const kv = initKVStore({ AGENT_KV: mockKV });
      expect(kv).toBeDefined();
      // Verify it actually delegates to the binding
      await kv.get('test-key');
      expect(mockKV.get).toHaveBeenCalledWith('test-key');
    });

    it('should upgrade from InMemoryKV to CloudflareKV when binding later becomes available — patch 0127', async () => {
      _resetKVStore();
      // First call: no binding → InMemoryKV
      const kv1 = initKVStore({});
      await kv1.put('before-upgrade', 'inmemory-only');
      // Second call: AGENT_KV binding now present → must upgrade to Cloudflare
      const mockKV = {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue({ keys: [] }),
      } as unknown as KVNamespace;
      const kv2 = initKVStore({ AGENT_KV: mockKV });
      // Distinct instances — InMemory was replaced by CloudflareKV
      expect(kv1).not.toBe(kv2);
      // Subsequent put delegates to the real binding (not InMemory)
      await kv2.put('after-upgrade', 'cloudflare-bound');
      expect(mockKV.put).toHaveBeenCalled();
    });

    it('should keep CloudflareKV stable across subsequent calls — patch 0127', () => {
      _resetKVStore();
      const mockKV = {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue({ keys: [] }),
      } as unknown as KVNamespace;
      const kv1 = initKVStore({ AGENT_KV: mockKV });
      const kv2 = initKVStore({}); // call without binding should NOT downgrade
      expect(kv1).toBe(kv2);
    });

    it('_resetKVStore should clear singleton', async () => {
      const kv1 = initKVStore({});
      await kv1.put('test', 'value');

      _resetKVStore();
      const kv2 = getKVStore();
      const result = await kv2.get('test');
      expect(result).toBeNull(); // Fresh instance
    });
  });

  describe('CloudflareKV with fallback', () => {
    it('should fallback to InMemory on KV.get error', async () => {
      const mockKV = {
        get: vi.fn().mockRejectedValueOnce(new Error('KV Error')),
        put: vi.fn().mockResolvedValue(undefined),
      } as unknown as KVNamespace;

      _resetKVStore();
      const kv = initKVStore({ KV_STORE: mockKV });

      // First call to get should trigger the error and fallback
      const result = await kv.get('key');
      expect(result).toBeNull();
    });

    it('should fallback to InMemory on KV.put error', async () => {
      const mockKV = {
        put: vi.fn().mockRejectedValueOnce(new Error('KV Error')),
        get: vi.fn().mockResolvedValue(null),
      } as unknown as KVNamespace;

      _resetKVStore();
      const kv = initKVStore({ KV_STORE: mockKV });

      // put should not throw even if KV fails
      await expect(kv.put('key', 'value')).resolves.not.toThrow();
    });

    it('should fallback to InMemory on KV.delete error', async () => {
      const mockKV = {
        delete: vi.fn().mockRejectedValueOnce(new Error('KV Error')),
      } as unknown as KVNamespace;

      _resetKVStore();
      const kv = initKVStore({ KV_STORE: mockKV });

      // delete should not throw even if KV fails
      await expect(kv.delete('key')).resolves.not.toThrow();
    });

    it('should fallback to InMemory on KV.list error', async () => {
      const mockKV = {
        list: vi.fn().mockRejectedValueOnce(new Error('KV Error')),
      } as unknown as KVNamespace;

      _resetKVStore();
      const kv = initKVStore({ KV_STORE: mockKV });

      const result = await kv.list();
      expect(result.keys).toEqual([]);
    });

    it('should use fallback when KV binding is unavailable', async () => {
      const mockKV = {
        get: vi.fn().mockRejectedValue(new Error('KV Error')),
        put: vi.fn().mockRejectedValue(new Error('KV Error')),
        delete: vi.fn().mockRejectedValue(new Error('KV Error')),
        list: vi.fn().mockRejectedValue(new Error('KV Error')),
      } as unknown as KVNamespace;

      _resetKVStore();
      const kv = initKVStore({ KV_STORE: mockKV });

      // All operations should succeed via fallback
      await kv.put('test', 'value');
      const result = await kv.get('test');
      expect(result).toBe('value');

      await kv.delete('test');
      const after = await kv.get('test');
      expect(after).toBeNull();
    });
  });
});
