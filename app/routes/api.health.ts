import type {Route} from './+types/api.health';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';

/**
 * ヘルスチェックAPI — 心拍モニター
 * 予防医学的設計: システムの生存確認を外部監視ツールが実行可能にする。
 * Oxygen/CloudflareのUptimeMonitoringやStatusPage連携を想定。
 *
 * GET /api/health → { status: 'ok', timestamp, storefront: boolean, agents: 23/23 }
 *
 * SK-06: Dynamic agent count from registry (not hardcoded)
 */
export async function loader({context, request}: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.health', RATE_LIMIT_PRESETS.public);
  if (limited) return limited;
  const checks: Record<string, boolean> = {
    server: true,
    storefront: false,
  };

  // Storefront API疎通チェック（軽量クエリ）
  try {
    const result = await context.storefront.query(HEALTH_QUERY, {
      cache: context.storefront.CacheNone(),
    });
    checks.storefront = !!result?.shop?.name;
  } catch {
    checks.storefront = false;
  }

  const allHealthy = Object.values(checks).every(Boolean);

  // Feature Flags状態（免疫系サイトカインレベル）
  let featureFlags: Array<{ name: string; enabled: boolean }> = [];
  try {
    const { getAllFlags } = await import('~/lib/feature-flags');
    const flags = await getAllFlags(context.env as unknown as Record<string, unknown>);
    featureFlags = flags.map(f => ({ name: f.name, enabled: f.enabled }));
  } catch {
    // Feature Flags初期化失敗は非致命的
  }

  // SK-06: Dynamic agent count from registry
  let agentStats: { active: number; total: number } = { active: 0, total: 0 };
  try {
    const { getRegistrationState } = await import('../../agents/registration/agent-registration.js');
    const registrationState = getRegistrationState();
    if (registrationState?.registry) {
      const stats = registrationState.registry.getStats();
      agentStats = { active: stats.active, total: stats.total };
    }
  } catch {
    // Agent registry not yet initialized (non-fatal for EC health check)
  }

  return new Response(
    JSON.stringify({
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      checks,
      featureFlags,
      agents: agentStats.total > 0 ? `${agentStats.active}/${agentStats.total} ready` : 'not initialized',
    }),
    {
      status: allHealthy ? 200 : 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    },
  );
}

const HEALTH_QUERY = `#graphql
  query HealthCheck {
    shop {
      name
    }
  }
` as const;
