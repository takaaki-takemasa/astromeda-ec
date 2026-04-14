import { describe, it, expect, beforeEach, vi } from 'vitest';
import { APICache, type CacheStats } from '../api-cache';

describe('APICache', () => {
  let cache: APICache;

  beforeEach(() => {
    cache = new APICache(5, 100); // 5エントリ max, 100ms TTL
  });

  // ── Basic Operations ──

  it('should set and get a value', () => {
    const data = { id: 1, name: 'test' };
    cache.set('key1', data);
    const retrieved = cache.get('key1');
    expect(retrieved).toEqual(data);
  });

  it('should return null for non-existent key', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('should return null for expired entry', async () => {
    const data = { id: 1 };
    cache.set('key1', data, 10); // 10ms TTL
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(cache.get('key1')).toBeNull();
  });

  // ── TTL Management ──

  it('should respect custom TTL', async () => {
    const data = { id: 1 };
    cache.set('key1', data, 200); // 200ms TTL
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(cache.get('key1')).toEqual(data); // Still valid
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(cache.get('key1')).toBeNull(); // Expired
  });

  it('should use default TTL if not specified', async () => {
    const data = { id: 1 };
    cache.set('key1', data); // Uses default 100ms
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(cache.get('key1')).toEqual(data);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(cache.get('key1')).toBeNull();
  });

  // ── LRU Eviction ──

  it('should evict LRU entry when max capacity exceeded', () => {
    // Cache size: 5
    cache.set('key1', { id: 1 }, undefined, 'ns1');
    cache.set('key2', { id: 2 }, undefined, 'ns1');
    cache.set('key3', { id: 3 }, undefined, 'ns1');
    cache.set('key4', { id: 4 }, undefined, 'ns1');
    cache.set('key5', { id: 5 }, undefined, 'ns1');

    expect(cache.size()).toBe(5);

    // Hit key1 and key2 multiple times to increase their hits
    cache.get('key1');
    cache.get('key1');
    cache.get('key2');

    // Add 6th entry: key3 should be evicted (fewest hits)
    cache.set('key6', { id: 6 }, undefined, 'ns1');
    expect(cache.size()).toBe(5);
    expect(cache.get('key3')).toBeNull(); // Evicted
    expect(cache.get('key1')).not.toBeNull(); // Kept (more hits)
  });

  // ── Namespace Support ──

  it('should track entries by namespace', () => {
    cache.set('ga4:key1', { data: 'a' }, undefined, 'ga4');
    cache.set('gsc:key1', { data: 'b' }, undefined, 'gsc');
    cache.set('shopify:key1', { data: 'c' }, undefined, 'shopify');

    const stats = cache.getStats();
    expect(stats.entriesByNamespace['ga4']).toBe(1);
    expect(stats.entriesByNamespace['gsc']).toBe(1);
    expect(stats.entriesByNamespace['shopify']).toBe(1);
  });

  it('should clear namespace without affecting others', () => {
    cache.set('key1', { id: 1 }, undefined, 'ga4');
    cache.set('key2', { id: 2 }, undefined, 'ga4');
    cache.set('key3', { id: 3 }, undefined, 'gsc');

    const cleared = cache.clearNamespace('ga4');
    expect(cleared).toBe(2);
    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).toBeNull();
    expect(cache.get('key3')).not.toBeNull();
  });

  // ── Invalidation ──

  it('should invalidate specific key', () => {
    cache.set('key1', { id: 1 });
    expect(cache.invalidate('key1')).toBe(true);
    expect(cache.get('key1')).toBeNull();
    expect(cache.invalidate('key1')).toBe(false); // Already gone
  });

  it('should clear all entries', () => {
    cache.set('key1', { id: 1 });
    cache.set('key2', { id: 2 });
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get('key1')).toBeNull();
  });

  // ── Cleanup ──

  it('should cleanup expired entries', async () => {
    cache.set('key1', { id: 1 }, 10); // Expires soon
    cache.set('key2', { id: 2 }, 1000); // Long TTL
    await new Promise((resolve) => setTimeout(resolve, 50));

    const removed = cache.cleanup();
    expect(removed).toBe(1);
    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).not.toBeNull();
  });

  // ── Statistics ──

  it('should track hit/miss stats', () => {
    cache.set('key1', { id: 1 });
    cache.set('key2', { id: 2 });

    cache.get('key1'); // hit
    cache.get('key1'); // hit
    cache.get('nonexistent'); // miss
    cache.get('nonexistent'); // miss

    const stats = cache.getStats();
    expect(stats.totalHits).toBe(2);
    expect(stats.totalMisses).toBe(2);
    expect(stats.hitRate).toBe(0.5);
  });

  it('should calculate average entry size', () => {
    const data1 = { name: 'test1', value: 123 };
    const data2 = { name: 'test2', value: 456 };

    cache.set('key1', data1);
    cache.set('key2', data2);

    const stats = cache.getStats();
    expect(stats.averageEntrySize).toBeGreaterThan(0);
  });

  it('should track oldest and newest entries', async () => {
    cache.set('key1', { id: 1 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    cache.set('key2', { id: 2 });

    const stats = cache.getStats();
    expect(stats.oldestEntry).toBeLessThanOrEqual(stats.newestEntry!);
  });

  // ── Edge Cases ──

  it('should handle updating existing key without overflow', () => {
    cache.set('key1', { id: 1 });
    const size1 = cache.size();
    cache.set('key1', { id: 1, updated: true }); // Update same key
    expect(cache.size()).toBe(size1); // No growth
    expect(cache.get('key1')).toEqual({ id: 1, updated: true });
  });

  it('should handle generic types correctly', () => {
    interface Product {
      id: number;
      name: string;
      price: number;
    }

    const product: Product = { id: 1, name: 'Widget', price: 9.99 };
    cache.set<Product>('product:1', product);
    const retrieved = cache.get<Product>('product:1');
    expect(retrieved?.price).toBe(9.99);
  });

  it('should handle empty cache stats', () => {
    const stats = cache.getStats();
    expect(stats.totalHits).toBe(0);
    expect(stats.totalMisses).toBe(0);
    expect(stats.hitRate).toBe(0);
  });

  it('should track hit count per entry', () => {
    cache.set('key1', { id: 1 });
    cache.get('key1');
    cache.get('key1');
    cache.get('key1');

    cache.set('key2', { id: 2 });
    cache.get('key2');

    const stats = cache.getStats();
    expect(stats.totalHits).toBe(4);
  });
});
