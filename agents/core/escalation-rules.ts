/**
 * EscalationRules — 動的エスカレーション規則（T064完成）
 *
 * 医学的メタファー: 患者トリアージアルゴリズムの自動版
 * - 3件の警告を5分内に受取 → Critical に昇格
 * - 規則はストレージに保存し、管理ダッシュボードから変更可能
 */

import type { EventPriority, IAgentBus, AgentEvent } from './types.js';
import type { IStorageAdapter } from './storage.js';
import { createLogger } from '../core/logger.js';
import { getStorage } from './storage.js';

const log = createLogger('escalation-rules');

export interface EscalationRule {
  id: string;
  name: string;
  enabled: boolean;
  triggerPattern: string; // regex: e.g., "inventory.*error"
  threshold: number; // N件
  windowMinutes: number; // 時間窓
  escalateTo: EventPriority; // 昇格先
  notifyChannels: Array<'slack' | 'email' | 'webhook' | 'dashboard'>;
  createdAt: number;
  updatedAt: number;
}

const TABLE_NAME = 'escalation_rules';
const RULES_LIST_ID = 'rules_list';

// デフォルトルール
const DEFAULT_RULES: EscalationRule[] = [
  {
    id: 'rule_001',
    name: 'Inventory 3警告昇格',
    enabled: true,
    triggerPattern: 'inventory.*error',
    threshold: 3,
    windowMinutes: 5,
    escalateTo: 'critical',
    notifyChannels: ['slack', 'email', 'dashboard'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'rule_002',
    name: 'Pipeline失敗 2回昇格',
    enabled: true,
    triggerPattern: 'pipeline.failed',
    threshold: 2,
    windowMinutes: 10,
    escalateTo: 'high',
    notifyChannels: ['slack', 'dashboard'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'rule_003',
    name: 'API Timeout 5回昇格',
    enabled: true,
    triggerPattern: 'api.timeout',
    threshold: 5,
    windowMinutes: 15,
    escalateTo: 'critical',
    notifyChannels: ['slack', 'email', 'dashboard'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

interface EventRecord {
  id: string;
  pattern: string;
  timestamp: number;
}

export class EscalationRules {
  private storage: IStorageAdapter;
  private bus: IAgentBus | null = null; // N-05: bus参照
  private rules: EscalationRule[] = [];
  private eventLog: EventRecord[] = [];
  private readonly MAX_EVENT_LOG = 1000;

  constructor(storage?: IStorageAdapter) {
    this.storage = storage || getStorage();
  }

  /** N-05: AgentBus接続（エスカレーションイベント発行用） */
  connectBus(bus: IAgentBus): void {
    this.bus = bus;
  }

  /**
   * 初期化（ストレージから規則を読み込む）
   */
  async initialize(): Promise<void> {
    try {
      const record = await this.storage.get(TABLE_NAME, RULES_LIST_ID);
      if (record) {
        this.rules = (record as any).rules || [...DEFAULT_RULES];
        log.info(`[EscalationRules] Loaded ${this.rules.length} rules from storage`);
      } else {
        // デフォルトルールで初期化
        this.rules = [...DEFAULT_RULES];
        await this.saveRules();
        log.info('[EscalationRules] Initialized with default rules');
      }
    } catch (err) {
      log.error('[EscalationRules] Failed to initialize:', err);
      this.rules = [...DEFAULT_RULES];
    }
  }

  /**
   * イベントをログに記録し、エスカレーション判定を実施
   */
  async evaluateEvent(eventId: string, eventType: string): Promise<EscalationRule | null> {
    const now = Date.now();

    // イベントをログに記録
    this.eventLog.push({ id: eventId, pattern: eventType, timestamp: now });
    if (this.eventLog.length > this.MAX_EVENT_LOG) {
      this.eventLog = this.eventLog.slice(-this.MAX_EVENT_LOG);
    }

    // 各ルールを評価
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const matched = this.matchPattern(eventType, rule.triggerPattern);
      if (!matched) continue;

      // ウィンドウ内の同パターンイベント数
      const windowMs = rule.windowMinutes * 60 * 1000;
      const windowStart = now - windowMs;
      const recentEvents = this.eventLog.filter(
        (e) => e.pattern === rule.triggerPattern && e.timestamp >= windowStart,
      );

      if (recentEvents.length >= rule.threshold) {
        log.warn(
          `[EscalationRules] Rule "${rule.name}" triggered: ${recentEvents.length}/${rule.threshold} events in ${rule.windowMinutes}min`,
        );

        // N-05: エスカレーションイベントをbusに発行（NotificationRouter経由で通知される）
        if (this.bus) {
          try {
            await this.bus.publish({
              id: `escalation_${Date.now()}_${rule.id}`,
              type: 'event.escalated',
              source: 'escalation-rules',
              priority: rule.escalateTo,
              payload: {
                ruleId: rule.id,
                ruleName: rule.name,
                triggerPattern: rule.triggerPattern,
                eventCount: recentEvents.length,
                threshold: rule.threshold,
                windowMinutes: rule.windowMinutes,
                escalateTo: rule.escalateTo,
                notifyChannels: rule.notifyChannels,
                triggeringEventId: eventId,
              },
              timestamp: Date.now(),
            } as AgentEvent);
          } catch (err) {
            log.error('[EscalationRules] Failed to publish escalation event:', err instanceof Error ? err.message : String(err));
          }
        }

        return rule;
      }
    }

    return null;
  }

  /**
   * パターンマッチング（正規表現）
   */
  private matchPattern(text: string, pattern: string): boolean {
    try {
      const regex = new RegExp(pattern, 'i');
      return regex.test(text);
    } catch (err) {
      log.error(`[EscalationRules] Invalid pattern: ${pattern}`, err);
      return false;
    }
  }

  /**
   * 新しいルール追加
   */
  async addRule(rule: Omit<EscalationRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<EscalationRule> {
    const newRule: EscalationRule = {
      ...rule,
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.rules.push(newRule);
    await this.saveRules();
    log.info(`[EscalationRules] Added rule: ${newRule.id} - ${newRule.name}`);
    return newRule;
  }

  /**
   * ルール更新
   */
  async updateRule(id: string, updates: Partial<EscalationRule>): Promise<boolean> {
    const rule = this.rules.find((r) => r.id === id);
    if (!rule) {
      log.warn(`[EscalationRules] Rule not found: ${id}`);
      return false;
    }

    Object.assign(rule, updates, { updatedAt: Date.now() });
    await this.saveRules();
    log.info(`[EscalationRules] Updated rule: ${id}`);
    return true;
  }

  /**
   * ルール削除
   */
  async deleteRule(id: string): Promise<boolean> {
    const idx = this.rules.findIndex((r) => r.id === id);
    if (idx === -1) {
      log.warn(`[EscalationRules] Rule not found: ${id}`);
      return false;
    }

    this.rules.splice(idx, 1);
    await this.saveRules();
    log.info(`[EscalationRules] Deleted rule: ${id}`);
    return true;
  }

  /**
   * 全ルール取得
   */
  getRules(): EscalationRule[] {
    return [...this.rules];
  }

  /**
   * 有効なルールのみ取得
   */
  getEnabledRules(): EscalationRule[] {
    return this.rules.filter((r) => r.enabled);
  }

  /**
   * ルールを有効/無効
   */
  async enableRule(id: string, enabled: boolean): Promise<boolean> {
    return this.updateRule(id, { enabled });
  }

  /**
   * ルール保存（ストレージ）
   */
  private async saveRules(): Promise<void> {
    try {
      await this.storage.put(TABLE_NAME, {
        id: RULES_LIST_ID,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        rules: this.rules,
      } as any);
    } catch (err) {
      log.error('[EscalationRules] Failed to save rules:', err);
      throw err;
    }
  }

  /**
   * イベントログ統計
   */
  getEventStats(): {
    total: number;
    byPattern: Record<string, number>;
    recentCount: (windowMinutes: number) => number;
  } {
    const stats = {
      total: this.eventLog.length,
      byPattern: {} as Record<string, number>,
      recentCount: (windowMinutes: number) => {
        const cutoff = Date.now() - windowMinutes * 60 * 1000;
        return this.eventLog.filter((e) => e.timestamp >= cutoff).length;
      },
    };

    for (const event of this.eventLog) {
      stats.byPattern[event.pattern] = (stats.byPattern[event.pattern] || 0) + 1;
    }

    return stats;
  }

  /**
   * デフォルトルールをリセット
   */
  async reset(): Promise<void> {
    this.rules = [...DEFAULT_RULES];
    await this.saveRules();
    log.info('[EscalationRules] Reset to default rules');
  }
}

// シングルトン
let rulesInstance: EscalationRules | null = null;

export async function getEscalationRules(): Promise<EscalationRules> {
  if (!rulesInstance) {
    rulesInstance = new EscalationRules();
    await rulesInstance.initialize();
  }
  return rulesInstance;
}

export function resetEscalationRules(): void {
  rulesInstance = null;
}
