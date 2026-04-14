/**
 * Admin API — システム状態エンドポイント
 *
 * GET /api/admin/status
 * Agent Bus, HealthMonitor, CascadeEngine のリアルタイム状態を返す
 *
 * Phase 1B: モックデータ → Phase 2: 実Agent API接続
 */

import {data} from 'react-router';
import type {Route} from './+types/api.admin.status';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';

interface AdminStatusResponse {
  timestamp: number;
  system: {
    andonStatus: 'green' | 'yellow' | 'red';
    phase: string;
    uptime: number;
  };
  agents: {
    total: number;
    active: number;
    healthy: number;
    degraded: number;
    error: number;
  };
  bus: {
    totalSubscriptions: number;
    eventsPublished: number;
    deadLetters: number;
  };
  cascades: {
    total: number;
    running: number;
    completed: number;
    failed: number;
  };
  feedback: {
    totalRecords: number;
    approvalRate: number;
  };
  pipelines: {
    total: number;
    active: number;
  };
}

export async function loader({request, context}: Route.LoaderArgs) {
  const limited = applyRateLimit(request, 'api.admin.status', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  const {verifyAdminAuth} = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env as Env);
  if (!auth.authenticated) return auth.response;

  // RBAC: dashboard.view permission required
  try {
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const role = requirePermission(session, 'dashboard.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/status [GET]', success: true });

    // Phase 4: Oxygen環境変数をAgent Bridgeに注入 → Admin API利用可能化
    const {getAdminStatus, setBridgeEnv} = await import('~/lib/agent-bridge');
    setBridgeEnv(context.env as unknown as Record<string, string | undefined>);
    const status = await getAdminStatus();

    // システムログ取得（StructuredLogger未実装→空配列）
    const logs: Array<{level: string; message: string; timestamp: number; source: string}> = [];

    return data({...status, logs}, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('[API admin/status] Bridge error:', error);
    // フォールバック: 最低限のデータ
    const fallback: AdminStatusResponse = {
      timestamp: Date.now(),
      system: {andonStatus: 'yellow', phase: 'Phase 2A (Fallback)', uptime: 0},
      agents: {total: 0, active: 0, healthy: 0, degraded: 0, error: 0},
      bus: {totalSubscriptions: 0, eventsPublished: 0, deadLetters: 0},
      cascades: {total: 0, running: 0, completed: 0, failed: 0},
      feedback: {totalRecords: 0, approvalRate: 0},
      pipelines: {total: 0, active: 0},
    };
    return data(fallback, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }
}
