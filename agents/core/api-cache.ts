/**
 * APICache — API応答キャッシュレイヤー（海馬=短期記憶）
 *
 * 生体対応: 海馬は短期記憶と空間認識を担当
 * = APIレスポンスのキャッシュは一時的な応答速度改善を提供
 *
 * 機能:
 * - TTL対応: キャッシュの自動期限切れ
 * - LRU退出: 最大エントリ数を超えたら最も使われていないものから削除
 * - 名前空間対応: API別（GA4, GSC, Shopify等）でキャッシュを分離
 * - 統計情報: キャッシュヒット/ミス率の追跡
 *
 * 使用例:
 *   const cache = new APICache(1000, 3600000); // 最大1000エントリ、1時間TTL
 *   cache.set<Product[]>('shopify:products', products, 300000); // 5分で期限切れ
 *   const cached = cache.get<Product[]>('shopify:products');
 */

export interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number;
  namespace: string;
  hits: number;
}

export interface CacheStats {
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  entriesByNamespace: Record<string, number>;
  averageEntrySize: number;
  oldestEntry?: number;
  newestEntry?: number;
}

/**
 * API応答キャッシュ
 * TTL + LRU退出戦略で構成
 */
export class APICache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private stats = {
    totalHits: 0,
    totalMisses: 0,
    entriesByNamespace: new Map<string, number>(),
  };

  /**
   * @param maxEntries - キャッシュの最大エントリ数（デフォルト: 1000）
   * @param defaultTtlMs - デフォルトTTL（ミリ秒、デフォルト: 3600000=1時間）
   */
  constructor(maxEntries = 1000, defaultTtlMs = 3600000) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * キャッシュから値を取得
   * @returns キャッシュが有効ならTを返す。期限切れまたは存在しなければnullを返す
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.totalMisses++;
      return null;
    }

    // TTLチェック
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.updateNamespaceCount(entry.namespace, -1);
      this.stats.totalMisses++;
      return null;
    }

    // ヒット: hits++
    entry.hits++;
    this.stats.totalHits++;
    return entry.value as T;
  }

  /**
   * キャッシュに値を設定
   * @param key - キャッシュキー（例: "shopify:products"）
   * @param value - キャッシュ値
   * @param ttlMs - このエントリのTTL（ミリ秒）。未指定ならデフォルトTTLを使用
   * @param namespace - キャッシュの種類（例: "ga4", "gsc", "shopify"）
   */
  set<T>(
    key: string,
    value: T,
    ttlMs?: number,
    namespace = 'default',
  ): void {
    const now = Date.now();
    const expiresAt = now + (ttlMs ?? this.defaultTtlMs);

    // 既存エントリなら削除カウントを更新
    if (this.cache.has(key)) {
      const existing = this.cache.get(key)!;
      this.updateNamespaceCount(existing.namespace, -1);
    }

    // 容量チェック: 最大に達したらLRU削除
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      this.evictLRU();
    }

    // 新規エントリを追加
    this.cache.set(key, {
      value,
      createdAt: now,
      expiresAt,
      namespace,
      hits: 0,
    });

    this.updateNamespaceCount(namespace, 1);
  }

  /**
   * 特定キャッシュを無効化
   */
  invalidate(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);
    this.updateNamespaceCount(entry.namespace, -1);
    return true;
  }

  /**
   * 全キャッシュをクリア
   */
  clear(): void {
    this.cache.clear();
    this.stats.entriesByNamespace.clear();
  }

  /**
   * 特定の名前空間のキャッシュをクリア
   */
  clearNamespace(namespace: string): number {
    let count = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.namespace === namespace) {
        this.cache.delete(key);
        count++;
      }
    }
    this.stats.entriesByNamespace.delete(namespace);
    return count;
  }

  /**
   * 期限切れエントリをクリーンアップ
   * @returns 削除されたエントリ数
   */
  cleanup(): number {
    const now = Date.now();
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.updateNamespaceCount(entry.namespace, -1);
        count++;
      }
    }

    return count;
  }

  /**
   * 統計情報を取得
   */
  getStats(): CacheStats {
    this.cleanup(); // 期限切れを削除してから統計を計算

    const entries = Array.from(this.cache.values());
    const sizes = entries.map((e) => {
      try {
        return JSON.stringify(e.value).length;
      } catch {
        return 0;
      }
    });
    const averageSize = sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0;

    const total = this.stats.totalHits + this.stats.totalMisses;
    const hitRate = total > 0 ? this.stats.totalHits / total : 0;

    const createdAts = entries.map((e) => e.createdAt);
    const oldest = createdAts.length > 0 ? Math.min(...createdAts) : undefined;
    const newest = createdAts.length > 0 ? Math.max(...createdAts) : undefined;

    return {
      totalHits: this.stats.totalHits,
      totalMisses: this.stats.totalMisses,
      hitRate: Math.round(hitRate * 10000) / 10000, // 小数4位
      entriesByNamespace: Object.fromEntries(this.stats.entriesByNamespace),
      averageEntrySize: Math.round(averageSize),
      oldestEntry: oldest,
      newestEntry: newest,
    };
  }

  /**
   * 現在のエントリ数を返す
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * LRU: 最も使われていない（hits最小）エントリを削除
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let minHits = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.hits < minHits) {
        minHits = entry.hits;
        lruKey = key;
      }
    }

    if (lruKey) {
      const entry = this.cache.get(lruKey)!;
      this.cache.delete(lruKey);
      this.updateNamespaceCount(entry.namespace, -1);
    }
  }

  /**
   * 名前空間ごとのエントリ数を更新
   */
  private updateNamespaceCount(namespace: string, delta: number): void {
    const current = this.stats.entriesByNamespace.get(namespace) ?? 0;
    const updated = current + delta;
    if (updated <= 0) {
      this.stats.entriesByNamespace.delete(namespace);
    } else {
      this.stats.entriesByNamespace.set(namespace, updated);
    }
  }
}
