/**
 * Prometheus Metrics Endpoint (T066完成)
 * GET /api/metrics — Prometheus text format
 *
 * 医学的メタファー: 患者の各種バイタルサインをモニター機に送信
 * - agent_health_status: 各Agentの健康状態（0=healthy, 1=degraded, 2=error, 3=shutdown）
 * - pipeline_execution_duration: パイプライン実行時間（ヒストグラム）
 * - api_request_count: API呼び出し数（カウンター）
 * - error_count: エラー数（カウンター）
 * - notification_sent_total: 送信通知数（カウンター）
 * - escalation_triggered_total: エスカレーション発火数（カウンター）
 */

import type { Route } from './+types/api.metrics';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';

// メトリクス蓄積（メモリ内 — 本番ではPrometheus PushGatewayに送信推奨）
interface Metrics {
  agentHealth: Record<string, number>;
  pipelineDurations: number[];
  apiRequestCount: number;
  apiErrorCount: number;
  notificationCount: number;
  escalationCount: number;
  lastUpdate: number;
}

const metrics: Metrics = {
  agentHealth: {},
  pipelineDurations: [],
  apiRequestCount: 0,
  apiErrorCount: 0,
  notificationCount: 0,
  escalationCount: 0,
  lastUpdate: Date.now(),
};

/**
 * メトリクス更新関数（外部から呼び出し）
 */
export function recordAgentHealth(agentId: string, status: string): void {
  const statusMap: Record<string, number> = {
    healthy: 0,
    degraded: 1,
    error: 2,
    shutdown: 3,
  };
  metrics.agentHealth[agentId] = statusMap[status] || -1;
  metrics.lastUpdate = Date.now();
}

export function recordPipelineDuration(durationMs: number): void {
  metrics.pipelineDurations.push(durationMs);
  if (metrics.pipelineDurations.length > 1000) {
    metrics.pipelineDurations = metrics.pipelineDurations.slice(-1000);
  }
  metrics.lastUpdate = Date.now();
}

export function recordApiRequest(): void {
  metrics.apiRequestCount++;
  metrics.lastUpdate = Date.now();
}

export function recordApiError(): void {
  metrics.apiErrorCount++;
  metrics.lastUpdate = Date.now();
}

export function recordNotification(): void {
  metrics.notificationCount++;
  metrics.lastUpdate = Date.now();
}

export function recordEscalation(): void {
  metrics.escalationCount++;
  metrics.lastUpdate = Date.now();
}

/**
 * Prometheus text format フォーマッター
 */
function formatMetrics(): string {
  const lines: string[] = [];
  const timestamp = Date.now();

  // ─────────────────────
  // Agent Health Status
  // ─────────────────────
  lines.push('# HELP agent_health_status Agent health status (0=healthy, 1=degraded, 2=error, 3=shutdown)');
  lines.push('# TYPE agent_health_status gauge');
  for (const [agentId, status] of Object.entries(metrics.agentHealth)) {
    lines.push(`agent_health_status{agent="${agentId}"} ${status} ${timestamp}`);
  }

  // ─────────────────────
  // Pipeline Duration Histogram
  // ─────────────────────
  lines.push('# HELP pipeline_execution_duration_seconds Pipeline execution duration in seconds');
  lines.push('# TYPE pipeline_execution_duration_seconds histogram');

  if (metrics.pipelineDurations.length > 0) {
    // ヒストグラム計算
    const sorted = [...metrics.pipelineDurations].sort((a, b) => a - b);
    const buckets = [0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 60.0, Infinity];

    for (const bucketVal of buckets) {
      const count = sorted.filter((d) => d / 1000 <= bucketVal).length;
      const bucketLabel =
        bucketVal === Infinity
          ? 'le="+Inf"'
          : `le="${(bucketVal).toFixed(2)}"`;
      lines.push(`pipeline_execution_duration_seconds_bucket{${bucketLabel}} ${count} ${timestamp}`);
    }

    const sum = metrics.pipelineDurations.reduce((a, b) => a + b, 0) / 1000;
    lines.push(`pipeline_execution_duration_seconds_sum ${sum.toFixed(3)} ${timestamp}`);
    lines.push(`pipeline_execution_duration_seconds_count ${metrics.pipelineDurations.length} ${timestamp}`);
  }

  // ─────────────────────
  // API Request Count
  // ─────────────────────
  lines.push('# HELP api_request_count Total API requests');
  lines.push('# TYPE api_request_count counter');
  lines.push(`api_request_count ${metrics.apiRequestCount} ${timestamp}`);

  // ─────────────────────
  // API Error Count
  // ─────────────────────
  lines.push('# HELP api_error_count Total API errors');
  lines.push('# TYPE api_error_count counter');
  lines.push(`api_error_count ${metrics.apiErrorCount} ${timestamp}`);

  // ─────────────────────
  // Error Rate
  // ─────────────────────
  const errorRate =
    metrics.apiRequestCount > 0
      ? (metrics.apiErrorCount / metrics.apiRequestCount * 100).toFixed(2)
      : '0';
  lines.push('# HELP api_error_rate API error rate percentage');
  lines.push('# TYPE api_error_rate gauge');
  lines.push(`api_error_rate ${errorRate} ${timestamp}`);

  // ─────────────────────
  // Notification Count
  // ─────────────────────
  lines.push('# HELP notification_sent_total Total notifications sent');
  lines.push('# TYPE notification_sent_total counter');
  lines.push(`notification_sent_total ${metrics.notificationCount} ${timestamp}`);

  // ─────────────────────
  // Escalation Count
  // ─────────────────────
  lines.push('# HELP escalation_triggered_total Total escalations triggered');
  lines.push('# TYPE escalation_triggered_total counter');
  lines.push(`escalation_triggered_total ${metrics.escalationCount} ${timestamp}`);

  // ─────────────────────
  // Health Check Timestamp
  // ─────────────────────
  lines.push('# HELP metrics_collection_timestamp Last metrics collection timestamp');
  lines.push('# TYPE metrics_collection_timestamp gauge');
  lines.push(`metrics_collection_timestamp ${Math.floor(metrics.lastUpdate / 1000)}`);

  return lines.join('\n') + '\n';
}

/**
 * GET /api/metrics — Prometheus metrics endpoint
 */
export async function loader({ context, request }: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.metrics', RATE_LIMIT_PRESETS.internal);
  if (limited) return limited;
  try {
    const metricsText = formatMetrics();

    return new Response(metricsText, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[api.metrics] Error formatting metrics:', errorMsg);

    return new Response(
      `# ERROR\n# ${errorMsg}\n`,
      {
        status: 500,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      },
    );
  }
}
