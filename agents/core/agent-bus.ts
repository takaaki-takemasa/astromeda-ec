/**
 * Agent Bus — pub/sub通信基盤（神経系）
 *
 * 生体対応: 神経系（中枢神経+末梢神経）
 * 全Agentの通信を仲介する。シナプス伝達のように、
 * イベント（神経伝達物質）を発行者から購読者へ届ける。
 *
 * 設計原則:
 * - 非同期メッセージング（神経伝達は電気信号→化学信号の変換）
 * - トピックベース購読（特定の受容体にのみ結合）
 * - 優先度キュー（痛覚=criticalは他より優先して伝達）
 * - デッドレター処理（シナプスの再取り込みと同じ原理）
 */

import type {
  AgentEvent, EventHandler, EventFilter, EventPriority, IAgentBus,
} from './types.js';
import { EventPayloadSchema } from './types.js';
import { createLogger } from './logger.js';

const log = createLogger('agent-bus');

interface SubscribeOptions {
  agentId?: string;           // 購読Agent ID（ターゲット配信に使用）
  priority?: EventPriority;   // 購読者優先度（critical=痛覚最優先）
}

interface Subscription {
  id: string;
  eventType: string;
  handler: EventHandler;
  filter?: EventFilter;
  agentId?: string;           // 購読Agent ID
  priority: EventPriority;    // 購読者の処理優先度
}

interface PendingRequest {
  resolve: (event: AgentEvent) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ── シングルトン ──
let agentBusInstance: AgentBus | null = null;

/**
 * AgentBusシングルトン取得（遅延初期化）
 * 神経系は1つだけ — 複数の脊髄は存在しない
 */
export function getAgentBus(): AgentBus {
  if (!agentBusInstance) {
    agentBusInstance = new AgentBus();
  }
  return agentBusInstance;
}

export class AgentBus implements IAgentBus {
  private subscriptions = new Map<string, Subscription[]>();
  private pendingRequests = new Map<string, PendingRequest>();
  private deadLetterQueue: AgentEvent[] = [];
  private eventLog: AgentEvent[] = [];
  private subCounter = 0;

  // 免疫系フック: SecurityGuardがここに注入される
  private securityCheck?: (event: AgentEvent) => boolean;

  // 神経可塑性フック: FeedbackCollectorがここに注入される
  private feedbackHook?: (event: AgentEvent, delivered: boolean) => void;

  // ── 優先度による処理順序（痛覚>触覚のように） ──
  private static PRIORITY_ORDER: Record<EventPriority, number> = {
    critical: 0,
    high: 1,
    normal: 2,
    low: 3,
  };

  /** SecurityGuard（免疫系）を接続 */
  attachSecurityCheck(check: (event: AgentEvent) => boolean): void {
    this.securityCheck = check;
  }

  /** FeedbackCollector（シナプス可塑性）を接続 */
  attachFeedbackHook(hook: (event: AgentEvent, delivered: boolean) => void): void {
    this.feedbackHook = hook;
  }

  /** イベント発行（シナプス前膜からの伝達物質放出） */
  async publish(event: AgentEvent): Promise<void> {
    // 1-01: ペイロード型検証（血液型不適合の防止）
    const payloadResult = EventPayloadSchema.safeParse(event.payload);
    if (!payloadResult.success) {
      log.error('Invalid event payload rejected', {
        eventType: event.type,
        source: event.source,
        zodError: payloadResult.error.format(),
      });
      throw new TypeError(`[AgentBus] Invalid payload for event "${event.type}": ${payloadResult.error.message}`);
    }

    // 免疫チェック（異物排除）
    if (this.securityCheck && !this.securityCheck(event)) {
      log.warn('Security blocked event', { eventType: event.type, source: event.source });
      this.feedbackHook?.(event, false);
      return;
    }

    // イベントログ記録（神経活動の記録）
    this.eventLog.push(event);
    if (this.eventLog.length > 10000) {
      this.eventLog = this.eventLog.slice(-5000);
    }

    // response イベントの場合、pending requestを解決
    if (event.type.endsWith('.response') && event.correlationId) {
      const pending = this.pendingRequests.get(event.correlationId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(event.correlationId);
        pending.resolve(event);
        this.feedbackHook?.(event, true);
        return;
      }
    }

    // 購読者への配信（シナプス後膜の受容体結合）
    const subs = this.getMatchingSubscriptions(event);

    if (subs.length === 0) {
      // デッドレター（再取り込み: 受容体に結合できなかった伝達物質）
      this.deadLetterQueue.push(event);

      // DeadLetterアラート閾値: 800件で警告、1000件で緊急
      // 予防医学: 問題が起きてから治すのではなく、兆候段階で通知する
      const dlSize = this.deadLetterQueue.length;
      if (dlSize === 800) {
        log.warn('DeadLetter threshold reached', { queueSize: dlSize, threshold: 800 });
        // 予防医学: 閾値到達でcriticalイベント発行 → NotificationRouter経由で管理者通知
        const alertEvent = {
          id: `dl_alert_${Date.now()}`,
          type: 'system.deadletter.threshold',
          source: 'agent-bus',
          priority: 'critical' as const,
          payload: { queueSize: dlSize, threshold: 800, topEventTypes: this.getTopDeadLetterTypes() },
          timestamp: Date.now(),
        } as AgentEvent;
        this.eventLog.push(alertEvent);
        // 自身のpublishを再帰呼び出しすると無限ループのリスクがあるため、eventLogに記録のみ
        // HealthMonitorがeventLogを定期スキャンして検知する設計
      }

      if (dlSize > 1000) {
        const toPurge = this.deadLetterQueue.slice(0, dlSize - 500);
        log.error('DeadLetter overflow — persisting before purge', { queueSize: dlSize, persisting: toPurge.length });

        // 永続化試行: パージ前にDBへ保存（データ永久消失防止）
        try {
          const { getStorage } = await import('./storage.js');
          const storage = getStorage();
          for (const dl of toPurge.slice(0, 50)) { // 最大50件バッチ（過負荷防止）
            await storage.put('dead_letter_queue', {
              id: `dl_${dl.id}_${Date.now()}`,
              eventId: dl.id || 'unknown',
              eventType: dl.type,
              source: dl.source || 'unknown',
              priority: dl.priority || 'normal',
              payload: dl.payload || {},
              reason: 'no_subscriber_overflow',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }).catch(() => { /* DB未接続時はサイレント: InMemoryモードでは保存先なし */ });
          }
        } catch {
          // Storage未初期化時（起動直後等）は無視 — ログは上で出力済み
        }

        this.deadLetterQueue = this.deadLetterQueue.slice(-500);
      }
      this.feedbackHook?.(event, false);
      return;
    }

    // 優先度順に配信（痛覚 > 触覚 > 圧覚 > 温覚の順）
    const sorted = subs.sort((a, b) => {
      const pa = AgentBus.PRIORITY_ORDER[a.priority] ?? 2;
      const pb = AgentBus.PRIORITY_ORDER[b.priority] ?? 2;
      return pa - pb; // 数値が小さい方が高優先度（critical=0が最優先）
    });

    const deliveryPromises = sorted.map(async (sub) => {
      try {
        await sub.handler(event);
      } catch (err) {
        log.error('Handler execution failed', { eventType: event.type, subId: sub.id, error: err instanceof Error ? err.message : String(err) });
      }
    });

    await Promise.allSettled(deliveryPromises);
    this.feedbackHook?.(event, true);
  }

  /** イベント購読（受容体の発現）
   * @param options.agentId 購読Agent ID（ターゲット配信のフィルタに使用）
   * @param options.priority 購読者優先度（デフォルト: normal）
   */
  subscribe(eventType: string, handler: EventHandler, filter?: EventFilter, options?: SubscribeOptions): string {
    const id = `sub_${++this.subCounter}`;
    const sub: Subscription = {
      id,
      eventType,
      handler,
      filter,
      agentId: options?.agentId,
      priority: options?.priority ?? 'normal',
    };

    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, []);
    }
    const bucket = this.subscriptions.get(eventType);
    if (bucket) bucket.push(sub);

    // ワイルドカード対応: "content.*" → content.generated, content.updated 等に合致
    return id;
  }

  /** 購読解除 */
  unsubscribe(subscriptionId: string): void {
    for (const [type, subs] of this.subscriptions) {
      const idx = subs.findIndex((s) => s.id === subscriptionId);
      if (idx >= 0) {
        subs.splice(idx, 1);
        if (subs.length === 0) this.subscriptions.delete(type);
        return;
      }
    }
  }

  /** リクエスト/レスポンス（反射弓: 刺激→応答） */
  async request(event: AgentEvent, timeoutMs = 30000): Promise<AgentEvent> {
    return new Promise((resolve, reject) => {
      const correlationId = event.id;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`Request timeout: ${event.type} (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pendingRequests.set(correlationId, { resolve, reject, timer });
      // 重要: publishをawaitして購読者のハンドラが完了するまで待つ。
      // awaitしないとPromiseチェーンが切れ、レスポンスが届かない。
      // 医学メタファー: 刺激を送って反応を待つ — 刺激の伝達を完了させなければ反射は起きない
      this.publish({ ...event, correlationId }).catch((err) => {
        // CRITICAL修正: publish失敗時にpendingRequestを即座にrejectする
        // 以前はrejectが呼ばれずタイムアウトまでハングしていた（脳死状態の神経信号）
        const pending = this.pendingRequests.get(correlationId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(correlationId);
          pending.reject(new Error(`Request publish failed: ${err instanceof Error ? err.message : String(err)}`));
        }
        // デッドレターキューに記録（伝達障害ログ）
        this.deadLetterQueue.push({ ...event, correlationId, timestamp: Date.now() } as AgentEvent);
        if (this.deadLetterQueue.length > 1000) this.deadLetterQueue.shift();
        log.warn('Request publish failed', { error: err instanceof Error ? err.message : String(err) });
      });
    });
  }

  // ── 診断用API（医師の診察道具） ──

  /** イベントログ取得 */
  getEventLog(limit = 100): AgentEvent[] {
    return this.eventLog.slice(-limit);
  }

  /** デッドレターキュー取得（フィルタ付き — 1A.01） */
  getDeadLetters(options?: {
    limit?: number;
    type?: string;
    since?: number;
    until?: number;
  }): AgentEvent[] {
    const {limit = 50, type, since, until} = options || {};
    let filtered = this.deadLetterQueue;
    if (type) filtered = filtered.filter((e) => e.type === type || e.type.startsWith(type + '.'));
    if (since) filtered = filtered.filter((e) => (e.timestamp ?? 0) >= since);
    if (until) filtered = filtered.filter((e) => (e.timestamp ?? 0) <= until);
    return filtered.slice(-limit);
  }

  /** DLQリプレイ: フィルタ条件に合致するイベントを再発行（1A.01） */
  async replayDeadLetters(options?: {
    type?: string;
    since?: number;
    maxReplay?: number;
  }): Promise<{replayed: number; failed: number}> {
    const {type, since, maxReplay = 100} = options || {};
    let candidates = [...this.deadLetterQueue];
    if (type) candidates = candidates.filter((e) => e.type === type || e.type.startsWith(type + '.'));
    if (since) candidates = candidates.filter((e) => (e.timestamp ?? 0) >= since);
    candidates = candidates.slice(0, maxReplay);

    let replayed = 0;
    let failed = 0;
    for (const event of candidates) {
      try {
        await this.publish({...event, timestamp: Date.now(), metadata: {...(event.metadata || {}), replayed: true}});
        // 成功したらDLQから除去
        const idx = this.deadLetterQueue.indexOf(event);
        if (idx >= 0) this.deadLetterQueue.splice(idx, 1);
        replayed++;
      } catch {
        failed++;
      }
    }
    return {replayed, failed};
  }

  /** バックプレッシャー: 現在のキュー深度を返す（1A.02） */
  getQueueDepth(): {
    pendingRequests: number;
    deadLetterSize: number;
    eventLogSize: number;
    pressure: 'normal' | 'elevated' | 'critical';
  } {
    const pending = this.pendingRequests.size;
    const dlSize = this.deadLetterQueue.length;
    const pressure = dlSize > 800 ? 'critical' : dlSize > 400 ? 'elevated' : 'normal';
    return {
      pendingRequests: pending,
      deadLetterSize: dlSize,
      eventLogSize: this.eventLog.length,
      pressure,
    };
  }

  /** イベントTTL強制: 指定分数以上古いイベントをeventLogから自動パージ（1A.03） */
  purgeStaleEvents(maxAgeMinutes = 60): number {
    const cutoff = Date.now() - maxAgeMinutes * 60 * 1000;
    const before = this.eventLog.length;
    this.eventLog = this.eventLog.filter((e) => (e.timestamp ?? 0) > cutoff);
    return before - this.eventLog.length;
  }

  /** 購読状況（神経接続マップ） */
  getSubscriptionMap(): Record<string, number> {
    const map: Record<string, number> = {};
    for (const [type, subs] of this.subscriptions) {
      map[type] = subs.length;
    }
    return map;
  }

  /** DeadLetterの頻出イベント型Top5（診断情報） */
  private getTopDeadLetterTypes(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const dl of this.deadLetterQueue) {
      counts[dl.type] = (counts[dl.type] || 0) + 1;
    }
    return Object.fromEntries(
      Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    );
  }

  /** 統計情報（バイタルサイン） */
  getStats() {
    return {
      totalSubscriptions: Array.from(this.subscriptions.values()).reduce((s, a) => s + a.length, 0),
      eventTypes: this.subscriptions.size,
      eventLogSize: this.eventLog.length,
      deadLetterSize: this.deadLetterQueue.length,
      pendingRequests: this.pendingRequests.size,
    };
  }

  // ── 内部 ──

  private getMatchingSubscriptions(event: AgentEvent): Subscription[] {
    const result: Subscription[] = [];

    // 完全一致
    const exact = this.subscriptions.get(event.type) ?? [];
    for (const sub of exact) {
      if (!sub.filter || sub.filter(event)) result.push(sub);
    }

    // ワイルドカード一致 (e.g., "content.*")
    for (const [pattern, subs] of this.subscriptions) {
      if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -2);
        if (event.type.startsWith(prefix + '.') && pattern !== event.type) {
          for (const sub of subs) {
            if (!sub.filter || sub.filter(event)) result.push(sub);
          }
        }
      }
    }

    // グローバル購読 ("*")
    const global = this.subscriptions.get('*') ?? [];
    for (const sub of global) {
      if (!sub.filter || sub.filter(event)) result.push(sub);
    }

    // ターゲット指定イベント: 宛先Agentの購読 + グローバル監視を通過
    // （特定の臓器宛の神経信号は、その臓器の受容体が受け取る。
    //   ただし脳幹（グローバル監視*）は全信号を監視する）
    if (event.target) {
      return result.filter((sub) => {
        // グローバル監視 '*' は常に通す（脳幹の全身監視機能）
        if (sub.eventType === '*') return true;
        // agentIdが設定されていない購読はターゲットイベントを受け取れない
        if (!sub.agentId) return false;
        // ターゲットと一致するagentIdのみ通す
        return sub.agentId === event.target;
      });
    }

    return result;
  }
}
