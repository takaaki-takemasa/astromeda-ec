/**
 * SSE Bridge — AgentBus↔SSEストリーム接続層（神経管の軸索束）
 *
 * 医学メタファー: 神経管は脊髄の前駆体。ここを通じて脳（エージェント）と
 * 末梢（管理画面）の間で神経信号（イベント）が双方向に伝達される。
 *
 * v3 Layer 7 (7-04): 循環import修正
 * 旧: import { broadcastEvent } from '../../app/routes/api.admin.stream.js'
 *     → agents/core がapp/routesに依存 = 循環importリスク
 * 新: EventEmitter パターン — sseBroadcaster を export し、app側が on("event") で購読
 *     → agents/core は app/routes に依存しない = 一方向依存
 */

import { getAgentBus } from './agent-bus.js';
import type { AgentEvent } from './types.js';
import { getChannelOrchestrator } from './notification-channels.js';

// ── SSEイベント型定義（app/routes から分離） ──

export interface SSEEvent {
  id: string;
  type: 'agent.health' | 'pipeline.status' | 'approval.pending' | 'notification.new' | 'andon.status';
  timestamp: number;
  payload: Record<string, unknown>;
}

// ── 7-04: EventEmitterパターン（循環import解消） ──
// broadcastEvent を直接importする代わりに、
// リスナー関数を登録するシンプルなEmitterを使う。
// app/routes/api.admin.stream.ts 側が sseBroadcaster.on("event", ...) で購読する。

type SSEListener = (event: SSEEvent) => void;

class SSEBroadcaster {
  private listeners: SSEListener[] = [];

  /** リスナーを登録（app/routes側が呼ぶ） */
  on(_eventName: 'event', listener: SSEListener): void {
    this.listeners.push(listener);
  }

  /** リスナーを解除 */
  off(_eventName: 'event', listener: SSEListener): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  /** イベントを全リスナーに配信（SSEBridgeが呼ぶ） */
  emit(_eventName: 'event', event: SSEEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // リスナーエラーは無視（配信を継続）
      }
    }
  }

  /** 接続中のリスナー数 */
  get listenerCount(): number {
    return this.listeners.length;
  }
}

/** シングルトン — agents側とapp側の接続点 */
export const sseBroadcaster = new SSEBroadcaster();

// ── SSEBridge Stats ──

interface SSEBridgeStats {
  eventsForwarded: number;
  eventsDropped: number;
  lastForwardedAt: number;
  bridgeStartedAt: number;
}

/**
 * SSEBridge — AgentBusイベントをSSEストリームに変換・配信
 */
export class SSEBridge {
  private subscriptionId: string | null = null;
  private stats: SSEBridgeStats;
  private drainInterval: ReturnType<typeof setInterval> | null = null;

  // SSEに変換するイベントタイプのプレフィックス
  private static SSE_EVENT_MAP: Record<string, SSEEvent['type']> = {
    'health.': 'agent.health',
    'pipeline.': 'pipeline.status',
    'approval.': 'approval.pending',
    'notification.': 'notification.new',
    'andon.': 'andon.status',
    'system.': 'agent.health', // システムイベントはhealthに集約
  };

  constructor() {
    this.stats = {
      eventsForwarded: 0,
      eventsDropped: 0,
      lastForwardedAt: 0,
      bridgeStartedAt: Date.now(),
    };
  }

  /**
   * ブリッジを起動（AgentBusへのグローバル購読開始）
   */
  start(): void {
    if (this.subscriptionId) return; // 二重起動防止

    const bus = getAgentBus();

    // グローバル購読: 全イベントをSSEに変換
    this.subscriptionId = bus.subscribe('*', async (event: AgentEvent) => {
      this.forwardToSSE(event);
    });

    // Dashboardキューの定期ドレイン（1秒ごと）
    this.drainInterval = setInterval(() => {
      this.drainDashboardNotifications();
    }, 1000);
  }

  /**
   * ブリッジを停止
   */
  stop(): void {
    if (this.subscriptionId) {
      const bus = getAgentBus();
      bus.unsubscribe(this.subscriptionId);
      this.subscriptionId = null;
    }
    if (this.drainInterval) {
      clearInterval(this.drainInterval);
      this.drainInterval = null;
    }
  }

  /**
   * AgentBusイベント → SSEイベントに変換してブロードキャスト
   * 7-04: broadcastEvent直接呼出 → sseBroadcaster.emit() に変更
   */
  private forwardToSSE(event: AgentEvent): void {
    const sseType = this.mapEventType(event.type);
    if (!sseType) {
      this.stats.eventsDropped++;
      return;
    }

    const sseEvent: SSEEvent = {
      id: event.id || `sse_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: sseType,
      timestamp: event.timestamp || Date.now(),
      payload: {
        source: event.source,
        target: event.target,
        priority: event.priority,
        data: event.payload,
        originalType: event.type,
      },
    };

    try {
      sseBroadcaster.emit('event', sseEvent);
      this.stats.eventsForwarded++;
      this.stats.lastForwardedAt = Date.now();
    } catch {
      this.stats.eventsDropped++;
    }
  }

  /**
   * ChannelOrchestratorのDashboardキューをSSEに配信
   */
  private drainDashboardNotifications(): void {
    try {
      const orchestrator = getChannelOrchestrator();
      const notifications = orchestrator.drainDashboardQueue(20);

      for (const notif of notifications) {
        const sseEvent: SSEEvent = {
          id: notif.id,
          type: 'notification.new',
          timestamp: notif.timestamp,
          payload: {
            severity: notif.severity,
            source: notif.source,
            title: notif.title,
            message: notif.message,
            actionUrl: notif.actionUrl,
            metadata: notif.metadata,
          },
        };
        sseBroadcaster.emit('event', sseEvent);
        this.stats.eventsForwarded++;
      }
    } catch {
      // ChannelOrchestratorが未初期化の場合は無視
    }
  }

  /**
   * イベントタイプをSSEタイプにマッピング
   */
  private mapEventType(eventType: string): SSEEvent['type'] | null {
    for (const [prefix, sseType] of Object.entries(SSEBridge.SSE_EVENT_MAP)) {
      if (eventType.startsWith(prefix)) {
        return sseType;
      }
    }
    return null;
  }

  /**
   * 統計情報
   */
  getStats(): SSEBridgeStats & { listenerCount: number } {
    return {
      ...this.stats,
      listenerCount: sseBroadcaster.listenerCount,
    };
  }
}

// ── シングルトン ──

let sseBridgeInstance: SSEBridge | null = null;

export function getSSEBridge(): SSEBridge {
  if (!sseBridgeInstance) {
    sseBridgeInstance = new SSEBridge();
  }
  return sseBridgeInstance;
}

/** テスト用リセット */
export function resetSSEBridge(): void {
  if (sseBridgeInstance) {
    sseBridgeInstance.stop();
    sseBridgeInstance = null;
  }
}
