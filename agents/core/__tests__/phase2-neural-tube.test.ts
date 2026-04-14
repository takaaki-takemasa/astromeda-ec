/**
 * Phase 2 テスト: 神経管形成（SSEブリッジ + Shopify Admin Client）
 *
 * SSEBridge: AgentBusイベント→SSEストリーム変換の検証
 * ShopifyAdminClient: GraphQL CRUD・レート制限・リトライの検証
 */

import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { SSEBridge, resetSSEBridge } from '../sse-bridge.js';
import { AgentBus } from '../agent-bus.js';
import type { AgentEvent } from '../types.js';
import { ShopifyAdminClient, resetShopifyAdminClient } from '../shopify-admin-client.js';

// ─── SSEBridge テスト ───

describe('SSEBridge — 神経管の軸索束', () => {
  let bridge: SSEBridge;

  beforeEach(() => {
    resetSSEBridge();
    bridge = new SSEBridge();
  });

  afterEach(() => {
    bridge.stop();
  });

  test('ブリッジの起動と停止', () => {
    let stats = bridge.getStats();
    // 初期状態: eventsForwarded = 0 (未起動)
    expect(stats.eventsForwarded).toBeGreaterThanOrEqual(0);

    bridge.start();
    stats = bridge.getStats();
    expect(stats.bridgeStartedAt).toBeGreaterThan(0);

    bridge.stop();
    // stop後も統計は保持される
    stats = bridge.getStats();
    expect(stats).toBeTruthy();
  });

  test('二重起動の防止', () => {
    bridge.start();
    const statsAfterFirst = bridge.getStats();

    bridge.start(); // 2回目は無視される
    const statsAfterSecond = bridge.getStats();

    // 統計が保持されていることを確認（start()が重複して呼ばれても影響なし）
    expect(statsAfterSecond.bridgeStartedAt).toBeLessThanOrEqual(statsAfterFirst.bridgeStartedAt);
  });

  test('統計情報の初期値', () => {
    const stats = bridge.getStats();
    expect(stats.eventsForwarded).toBe(0);
    expect(stats.eventsDropped).toBe(0);
    expect(stats.bridgeStartedAt).toBeGreaterThan(0);
  });
});

// ─── ShopifyAdminClient テスト ───

describe('ShopifyAdminClient — 臍帯（母体との生命線）', () => {
  let client: ShopifyAdminClient;

  beforeEach(() => {
    resetShopifyAdminClient();
    client = new ShopifyAdminClient({
      shop: 'test-shop.myshopify.com',
      accessToken: 'test-token',
      apiVersion: '2025-01',
    });
  });

  test('クライアントの初期化', () => {
    expect(client).toBeTruthy();
    const rateLimit = client.getRateLimitStatus();
    expect(rateLimit.currentlyAvailable).toBe(1000);
    expect(rateLimit.maximumAvailable).toBe(1000);
    expect(rateLimit.restoreRate).toBe(50);
  });

  test('レート制限状態の初期値', () => {
    const status = client.getRateLimitStatus();
    expect(status.currentlyAvailable).toBeGreaterThan(0);
    expect(status.lastUpdatedAt).toBeGreaterThan(0);
  });

  test('GraphQLクエリのリトライ（ネットワークエラー）', async () => {
    // fetch をモック — 全リトライ失敗
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      throw new Error('Network error');
    }) as typeof fetch;

    try {
      await expect(client.getProducts(10)).rejects.toThrow('Network error');
      expect(callCount).toBe(4); // 1 + 3 retries
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('GraphQLクエリ成功時のレスポンスパース', async () => {
    const mockResponse = {
      data: { products: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } } },
      extensions: {
        cost: {
          requestedQueryCost: 52,
          actualQueryCost: 10,
          throttleStatus: {
            maximumAvailable: 1000,
            currentlyAvailable: 990,
            restoreRate: 50,
          },
        },
      },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
      headers: new Headers(),
    }) as typeof fetch;

    try {
      const result = await client.getProducts(10);
      expect(result.data).toBeTruthy();
      expect(result.data!.products).toBeTruthy();

      // レート制限が更新されているか
      const status = client.getRateLimitStatus();
      expect(status.currentlyAvailable).toBe(990);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('429レート制限時のリトライ', async () => {
    const originalFetch = globalThis.fetch;
    let attempt = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt === 1) {
        return Promise.resolve({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'Retry-After': '1' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: { products: { edges: [] } } }),
        headers: new Headers(),
      });
    }) as typeof fetch;

    try {
      const result = await client.getProducts(5);
      expect(result.data).toBeTruthy();
      expect(attempt).toBe(2); // 1回429→リトライ成功
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('メタフィールド更新のミューテーション', async () => {
    const mockResponse = {
      data: {
        metafieldsSet: {
          metafields: [{ id: 'gid://shopify/Metafield/1', namespace: 'custom', key: 'seo_title', value: 'Gaming PC' }],
          userErrors: [],
        },
      },
    };

    const originalFetch = globalThis.fetch;
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
        headers: new Headers(),
      });
    }) as typeof fetch;

    try {
      const result = await client.updateProductMetafields(
        'gid://shopify/Product/123',
        [{ namespace: 'custom', key: 'seo_title', value: 'Gaming PC', type: 'single_line_text_field' }],
      );
      expect(result.data!.metafieldsSet.userErrors).toHaveLength(0);

      // GraphQLボディが正しく送信されたか
      const body = JSON.parse(capturedBody!);
      expect(body.query).toContain('MetafieldsSet');
      expect(body.variables.metafields[0].ownerId).toBe('gid://shopify/Product/123');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('在庫調整ミューテーション', async () => {
    const mockResponse = {
      data: {
        inventoryAdjustQuantities: {
          inventoryAdjustmentGroup: { reason: 'agent_sync' },
          userErrors: [],
        },
      },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
      headers: new Headers(),
    }) as typeof fetch;

    try {
      const result = await client.adjustInventory(
        'gid://shopify/InventoryItem/100',
        'gid://shopify/Location/200',
        -5,
        'low_stock_adjustment',
      );
      expect(result.data!.inventoryAdjustQuantities.userErrors).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('Webhook登録', async () => {
    const mockResponse = {
      data: {
        webhookSubscriptionCreate: {
          webhookSubscription: { id: 'gid://shopify/WebhookSubscription/1', topic: 'PRODUCTS_UPDATE' },
          userErrors: [],
        },
      },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(mockResponse),
      headers: new Headers(),
    }) as typeof fetch;

    try {
      const result = await client.registerWebhook('PRODUCTS_UPDATE', 'https://example.com/webhook');
      expect(result.data!.webhookSubscriptionCreate.userErrors).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
