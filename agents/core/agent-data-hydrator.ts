/**
 * AgentDataHydrator — エージェント状態の実データ注入（造血幹細胞の分化誘導）
 *
 * 医学メタファー: 造血幹細胞が骨髄内で分化し、赤血球・白血球・血小板になるように、
 * 各エージェントの内部状態Mapに実データを注入して「生きた臓器」にする。
 *
 * これまでのエージェントは骨格（構造）だけで、中身（血液=データ）がなかった。
 * このモジュールが各エージェントに実データを供給し、管理画面が実データを表示できるようにする。
 *
 * 設計:
 * - Shopify Storefront API からリアルタイムデータを取得
 * - InMemoryStorage の各テーブルにシード
 * - 各L2エージェントの状態マップに初期データを設定
 * - 失敗しても全体の起動を阻害しない（try/catch everywhere）
 */

import { getStorage, TABLES } from './storage.js';
import { getDB } from '../lib/databases/db-adapter.js';
import type { IStorageAdapter, StorageRecord } from './storage.js';

interface HydrationResult {
  success: boolean;
  hydratedModules: string[];
  failedModules: Array<{ module: string; error: string }>;
  durationMs: number;
}

/**
 * 全エージェントの初期データを注入
 * サーバー起動時に1回だけ呼ばれる
 */
export async function hydrateAgentData(env: Record<string, unknown> = {}): Promise<HydrationResult> {
  const start = Date.now();
  const hydratedModules: string[] = [];
  const failedModules: Array<{ module: string; error: string }> = [];
  const storage = getStorage();
  const db = getDB(storage);

  // ─── 1. システム設定のシード（視床下部の初期セットポイント） ───
  try {
    await db.systemSettings.set('system.version', '2.0.0', 'general', 'Agent System Version');
    await db.systemSettings.set('system.phase', 'Phase2-ActiveDevelopment', 'general', 'Current Development Phase');
    await db.systemSettings.set('ai.default_tier', 'B', 'ai', 'Default AI Tier (B=Haiku)');
    await db.systemSettings.set('ai.max_tokens', 4096, 'ai', 'Max tokens per AI request');
    await db.systemSettings.set('notification.slack.enabled', true, 'notification', 'Slack notifications');
    await db.systemSettings.set('notification.email.enabled', false, 'notification', 'Email notifications');
    await db.systemSettings.set('notification.dashboard.enabled', true, 'notification', 'Dashboard notifications');
    await db.systemSettings.set('shopify.sync_interval_seconds', 3600, 'shopify', 'Shopify sync interval');
    await db.systemSettings.set('shopify.store', 'production-mining-base', 'shopify', 'Active Shopify store');
    await db.systemSettings.set('security.rate_limit_per_minute', 30, 'security', 'API rate limit');
    await db.systemSettings.set('security.session_ttl_hours', 24, 'security', 'Admin session TTL');
    hydratedModules.push('system_settings');
  } catch (err) {
    failedModules.push({ module: 'system_settings', error: err instanceof Error ? err.message : String(err) });
  }

  // ─── 2. エージェント設定のシード（DNA配列の完成） ───
  try {
    const agentConfigs = [
      // L0
      { agentId: 'commander', agentName: 'Commander', level: 'L0', team: 'command', aiTier: 'A', enabled: true },
      // L1 Leads
      { agentId: 'product-lead', agentName: 'Product Lead', level: 'L1', team: 'product', aiTier: 'A', enabled: true },
      { agentId: 'marketing-lead', agentName: 'Marketing Lead', level: 'L1', team: 'marketing', aiTier: 'A', enabled: true },
      { agentId: 'operations-lead', agentName: 'Operations Lead', level: 'L1', team: 'operations', aiTier: 'A', enabled: true },
      { agentId: 'technology-lead', agentName: 'Technology Lead', level: 'L1', team: 'technology', aiTier: 'A', enabled: true },
      { agentId: 'analytics-lead', agentName: 'Analytics Lead', level: 'L1', team: 'analytics', aiTier: 'A', enabled: true },
      // L2 Workers (key agents)
      { agentId: 'seo-director', agentName: 'SEO Director', level: 'L2', team: 'marketing', aiTier: 'A', enabled: true },
      { agentId: 'content-writer', agentName: 'Content Writer', level: 'L2', team: 'marketing', aiTier: 'A', enabled: true },
      { agentId: 'pricing-agent', agentName: 'Pricing Agent', level: 'L2', team: 'product', aiTier: 'B', enabled: true },
      { agentId: 'analytics-agent', agentName: 'Analytics Agent', level: 'L2', team: 'analytics', aiTier: 'B', enabled: true },
      { agentId: 'data-analyst', agentName: 'Data Analyst', level: 'L2', team: 'analytics', aiTier: 'B', enabled: true },
      { agentId: 'security-agent', agentName: 'Security Agent', level: 'L2', team: 'technology', aiTier: 'B', enabled: true },
      { agentId: 'devops-agent', agentName: 'DevOps Agent', level: 'L2', team: 'technology', aiTier: 'B', enabled: true },
      { agentId: 'performance-agent', agentName: 'Performance Agent', level: 'L2', team: 'technology', aiTier: 'C', enabled: true },
      { agentId: 'ux-agent', agentName: 'UX Agent', level: 'L2', team: 'product', aiTier: 'B', enabled: true },
      { agentId: 'conversion-agent', agentName: 'Conversion Agent', level: 'L2', team: 'analytics', aiTier: 'B', enabled: true },
      { agentId: 'ab-test-agent', agentName: 'A/B Test Agent', level: 'L2', team: 'analytics', aiTier: 'C', enabled: true },
      { agentId: 'insight-agent', agentName: 'Insight Agent', level: 'L2', team: 'analytics', aiTier: 'A', enabled: true },
      { agentId: 'inventory-monitor', agentName: 'Inventory Monitor', level: 'L2', team: 'product', aiTier: 'D', enabled: true },
      { agentId: 'product-catalog', agentName: 'Product Catalog', level: 'L2', team: 'product', aiTier: 'B', enabled: true },
      { agentId: 'promotion-agent', agentName: 'Promotion Agent', level: 'L2', team: 'marketing', aiTier: 'B', enabled: true },
      { agentId: 'support-agent', agentName: 'Support Agent', level: 'L2', team: 'operations', aiTier: 'B', enabled: true },
      { agentId: 'image-generator', agentName: 'Image Generator', level: 'L2', team: 'marketing', aiTier: 'A', enabled: true },
      { agentId: 'quality-auditor', agentName: 'Quality Auditor', level: 'L2', team: 'technology', aiTier: 'B', enabled: true },
      { agentId: 'error-monitor', agentName: 'Error Monitor', level: 'L2', team: 'technology', aiTier: 'D', enabled: true },
      { agentId: 'business-analyst', agentName: 'Business Analyst', level: 'L2', team: 'analytics', aiTier: 'A', enabled: true },
    ];

    for (const config of agentConfigs) {
      await db.agentConfig.create(config as any);
    }
    hydratedModules.push('agent_config');
  } catch (err) {
    failedModules.push({ module: 'agent_config', error: err instanceof Error ? err.message : String(err) });
  }

  // ─── 3. Cronスケジュールのシード（松果体の概日リズム設定） ───
  try {
    const defaultSchedules = [
      { scheduleId: 'cron-health', agentId: 'commander', cronExpression: '*/5 * * * *', description: 'ヘルスチェック（5分毎）', enabled: true },
      { scheduleId: 'cron-security', agentId: 'security-agent', cronExpression: '0 * * * *', description: 'セキュリティスキャン（毎時）', enabled: true },
      { scheduleId: 'cron-analytics', agentId: 'analytics-agent', cronExpression: '0 6 * * *', description: '日次アナリティクス（毎朝6時）', enabled: true },
      { scheduleId: 'cron-seo', agentId: 'seo-director', cronExpression: '0 9 * * *', description: 'SEO監査（毎朝9時）', enabled: true },
      { scheduleId: 'cron-inventory', agentId: 'inventory-monitor', cronExpression: '0 */3 * * *', description: '在庫同期（3時間毎）', enabled: true },
      { scheduleId: 'cron-weekly-report', agentId: 'data-analyst', cronExpression: '0 10 * * 1', description: '週次レポート（月曜10時）', enabled: true },
      { scheduleId: 'cron-performance', agentId: 'performance-agent', cronExpression: '0 3 * * *', description: 'パフォーマンス最適化（毎朝3時）', enabled: true },
      { scheduleId: 'cron-backup', agentId: 'devops-agent', cronExpression: '0 2 * * *', description: 'データバックアップ（毎朝2時）', enabled: true },
      { scheduleId: 'cron-cleanup', agentId: 'devops-agent', cronExpression: '0 4 * * *', description: 'ログクリーンアップ（毎朝4時）', enabled: true },
      { scheduleId: 'cron-shopify-sync', agentId: 'product-catalog', cronExpression: '0 */6 * * *', description: 'Shopify商品同期（6時間毎）', enabled: true },
      { scheduleId: 'cron-price-check', agentId: 'pricing-agent', cronExpression: '0 8,20 * * *', description: '価格チェック（8時・20時）', enabled: false },
      { scheduleId: 'cron-content-gen', agentId: 'content-writer', cronExpression: '0 11 * * 1-5', description: 'コンテンツ生成（平日11時）', enabled: false },
      // I-04: Storage自動purgeスケジュール（代謝廃棄物の自動排泄）
      { scheduleId: 'cron-storage-purge-health', agentId: 'devops-agent', cronExpression: '30 4 * * *', description: 'ヘルス履歴purge/24h超（毎朝4:30）', enabled: true },
      { scheduleId: 'cron-storage-purge-events', agentId: 'devops-agent', cronExpression: '45 4 * * *', description: 'システムイベントpurge/7日超（毎朝4:45）', enabled: true },
      { scheduleId: 'cron-storage-purge-actions', agentId: 'devops-agent', cronExpression: '0 5 * * *', description: 'アクションログpurge/7日超（毎朝5時）', enabled: true },
    ];

    for (const sched of defaultSchedules) {
      await db.cronSchedule.create(sched as any);
    }
    hydratedModules.push('cron_schedule');
  } catch (err) {
    failedModules.push({ module: 'cron_schedule', error: err instanceof Error ? err.message : String(err) });
  }

  // ─── 4. 初期ヘルスログのシード（バイタルサイン初回記録） ───
  try {
    const now = Date.now();
    const healthEntries = [
      { id: `health_commander_${now}`, agentId: 'commander', status: 'healthy', errorCount: 0, memoryUsage: 0, taskQueue: 0, createdAt: now, updatedAt: now },
      { id: `health_product-lead_${now}`, agentId: 'product-lead', status: 'healthy', errorCount: 0, memoryUsage: 0, taskQueue: 0, createdAt: now, updatedAt: now },
      { id: `health_marketing-lead_${now}`, agentId: 'marketing-lead', status: 'healthy', errorCount: 0, memoryUsage: 0, taskQueue: 0, createdAt: now, updatedAt: now },
    ];

    for (const entry of healthEntries) {
      await storage.put(TABLES.HEALTH_HISTORY, entry);
    }
    hydratedModules.push('health_log');
  } catch (err) {
    failedModules.push({ module: 'health_log', error: err instanceof Error ? err.message : String(err) });
  }

  return {
    success: failedModules.length === 0,
    hydratedModules,
    failedModules,
    durationMs: Date.now() - start,
  };
}

/**
 * Shopify商品データを取得してStorageに格納（任意実行）
 * ネットワークが必要なので、起動必須ではない
 */
export async function hydrateFromShopify(env: Record<string, unknown>): Promise<{
  productsLoaded: number;
  collectionsLoaded: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let productsLoaded = 0;
  let collectionsLoaded = 0;

  const accessToken = (env.SHOPIFY_ADMIN_ACCESS_TOKEN || env.PRIVATE_STOREFRONT_API_TOKEN || '') as string;
  if (!accessToken) {
    return { productsLoaded: 0, collectionsLoaded: 0, errors: ['No Shopify access token'] };
  }

  try {
    const { ShopifyAdminClient } = await import('./shopify-admin-client.js');
    const client = new ShopifyAdminClient({
      shop: (env.SHOPIFY_ADMIN_SHOP || 'production-mining-base.myshopify.com') as string,
      accessToken,
    });

    // 商品を取得してStorageに格納
    const productsResult = await client.getProducts(50);
    if (productsResult.data) {
      const edges = (productsResult.data as any).products?.edges || [];
      const storage = getStorage();
      for (const edge of edges) {
        const product = edge.node;
        await storage.put('shopify_products', {
          id: product.id,
          title: product.title,
          handle: product.handle,
          status: product.status,
          totalInventory: product.totalInventory,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        productsLoaded++;
      }
    }

    // コレクションを取得
    const collectionsResult = await client.getCollections(50);
    if (collectionsResult.data) {
      const edges = (collectionsResult.data as any).collections?.edges || [];
      const storage = getStorage();
      for (const edge of edges) {
        const collection = edge.node;
        await storage.put('shopify_collections', {
          id: collection.id,
          title: collection.title,
          handle: collection.handle,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        collectionsLoaded++;
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return { productsLoaded, collectionsLoaded, errors };
}
