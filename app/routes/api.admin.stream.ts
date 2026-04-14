/**
 * Admin API — Real-time SSE Stream Endpoint (Phase 4: G-023)
 *
 * GET /api/admin/stream
 * Server-Sent Events for real-time dashboard updates
 *
 * Event types:
 *   - agent.health: Agent status changes
 *   - pipeline.status: Pipeline execution updates
 *   - approval.pending: New approval requests
 *   - notification.new: System notifications
 *   - andon.status: ANDON light status changes
 *
 * Usage:
 *   const eventSource = new EventSource('/api/admin/stream');
 *   eventSource.addEventListener('agent.health', (e) => {
 *     console.log(JSON.parse(e.data));
 *   });
 */

import type { LoaderFunctionArgs } from 'react-router';
import { data } from 'react-router';
import { sseBroadcaster } from '../../agents/core/sse-bridge.js';
import type { SSEEvent } from '../../agents/core/sse-bridge.js';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';

// Re-export SSEEvent for backwards compatibility
export type { SSEEvent };

// 7-04: sseBroadcaster からのイベントを broadcastEvent に橋渡し
// agents/core → sseBroadcaster.emit("event") → このリスナー → broadcastEvent → 全SSEクライアント
// 循環import解消: agents/core は app/routes を import しない
let _bridgeInitialized = false;
function initSSEBridge(): void {
  if (_bridgeInitialized) return;
  _bridgeInitialized = true;
  sseBroadcaster.on('event', (event: SSEEvent) => {
    broadcastEvent(event);
  });
}

interface ActiveConnection {
  controller: ReadableStreamDefaultController<Uint8Array>;
  clientId: string;
  connectedAt: number;
}

// 全クライアント接続の管理（メモリ内。本番はRedisに移行推奨）
const activeConnections = new Map<string, ActiveConnection>();
const eventQueue: SSEEvent[] = [];
const MAX_QUEUED_EVENTS = 1000;
const HEARTBEAT_INTERVAL = 30000; // 30秒

// ── SSE Encoder ──

function encodeEvent(event: SSEEvent): string {
  return `event: ${event.type}\nid: ${event.id}\ndata: ${JSON.stringify(event.payload)}\n\n`;
}

// ── イベント配信 ──

export function broadcastEvent(event: SSEEvent): void {
  // キューに追加
  eventQueue.push(event);
  if (eventQueue.length > MAX_QUEUED_EVENTS) {
    eventQueue.shift(); // FIFO: 古いイベント削除
  }

  // 全クライアントに配信
  const disconnected: string[] = [];
  for (const [clientId, conn] of activeConnections) {
    try {
      const encoded = encodeEvent(event);
      conn.controller.enqueue(new TextEncoder().encode(encoded));
    } catch (error) {
      // 接続が閉じられたクライアントを記録
      disconnected.push(clientId);
    }
  }

  // 切断クライアントを削除
  for (const clientId of disconnected) {
    activeConnections.delete(clientId);
  }
}

// ── Heartbeat ──

function sendHeartbeat(controller: ReadableStreamDefaultController<Uint8Array>): void {
  try {
    controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
  } catch {
    // 接続が閉じられたため無視
  }
}

// ── Loader ──

export async function loader({ request, context }: LoaderFunctionArgs) {
  // 7-04: SSEブリッジ初期化（循環import解消版）
  initSSEBridge();

  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const env = context.env as Env;
  const auth = await verifyAdminAuth(request, env);
  if (!auth.authenticated) return auth.response;

  // RBAC: dashboard.view permission required
  try {
    const session = await AppSession.init(request, [env.SESSION_SECRET]);
    const role = requirePermission(session, 'dashboard.view');
    auditLog({ action: 'api_access', role, resource: 'api/admin/stream [SSE]', success: true });
  } catch (error) {
    // SSEなので403をそのまま返す
    return data({ error: 'Forbidden' }, { status: 403 });
  }

  // クライアント固有ID生成
  const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // ReadableStream を作成
  const stream = new ReadableStream({
    start(controller) {
      // クライアント接続を記録
      activeConnections.set(clientId, {
        controller,
        clientId,
        connectedAt: Date.now(),
      });

      // 既存キューを配信（最大100件）
      const recentEvents = eventQueue.slice(-100);
      for (const event of recentEvents) {
        try {
          const encoded = encodeEvent(event);
          controller.enqueue(new TextEncoder().encode(encoded));
        } catch {
          // 無視
        }
      }

      // Heartbeatタイマー開始
      const heartbeatHandle = setInterval(() => {
        const conn = activeConnections.get(clientId);
        if (conn) {
          sendHeartbeat(conn.controller);
        } else {
          clearInterval(heartbeatHandle);
        }
      }, HEARTBEAT_INTERVAL);
    },

    cancel() {
      // クライアント切断時
      activeConnections.delete(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': process.env.ADMIN_ORIGIN || 'https://shop.mining-base.co.jp',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}

// ── Admin API用エクスポート ──

export function getActiveConnectionCount(): number {
  return activeConnections.size;
}

export function getRecentEvents(count: number = 50): SSEEvent[] {
  return eventQueue.slice(-count);
}
