/**
 * SecurityGuard — 基本免疫系（Phase 0で即時実装）
 *
 * 生体対応: 自然免疫（innate immunity）
 * 適応免疫（AI Security Auditor）はPhase 2Bで実装されるが、
 * 自然免疫は生まれた瞬間から機能している必要がある。
 *
 * 3つの防御層:
 * 1. 皮膚（入力バリデーション）: 不正なイベント構造を排除
 * 2. 粘膜（レート制限）: 過剰なリクエストを制限
 * 3. 食細胞（異常検知）: パターン異常を検出・報告
 *
 * 監査所見 C-1: 免疫系の早期形成（胸腺=妊娠6-8週に対応）
 */

import type { AgentEvent, SecurityContext } from './types.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('security-guard');


interface RateLimitEntry {
  count: number;
  windowStart: number;
}

/** ブロック情報（指数バックオフ対応） */
interface BlockEntry {
  blockedAt: number;
  /** 現在のブロック期間（ms） */
  durationMs: number;
  /** 累計ブロック回数 */
  blockCount: number;
}

/** SecurityGuardの設定（外部から注入可能） */
export interface SecurityGuardConfig {
  /** anomaly N回でブロック（デフォルト: 5） */
  anomalyBlockThreshold?: number;
  /** anomaly検出ウィンドウms（デフォルト: 60000） */
  anomalyWindowMs?: number;
  /** ブロック初回期間ms（デフォルト: 60000 = 1分） */
  blockBaseDurationMs?: number;
  /** ブロック最大期間ms（デフォルト: 3600000 = 1時間） */
  blockMaxDurationMs?: number;
  /** デフォルトレート制限 */
  defaultRateLimit?: { maxRequests: number; windowMs: number };
}

const DEFAULT_SG_CONFIG: Required<SecurityGuardConfig> = {
  anomalyBlockThreshold: 5,
  anomalyWindowMs: 60000,
  blockBaseDurationMs: 60000,
  blockMaxDurationMs: 3600000,
  defaultRateLimit: { maxRequests: 100, windowMs: 1000 },
};

export class SecurityGuard {
  private contexts = new Map<string, SecurityContext>();
  private rateLimits = new Map<string, RateLimitEntry>();
  private anomalyLog: Array<{ event: AgentEvent; reason: string; timestamp: number }> = [];
  private blockedSources = new Map<string, BlockEntry>();
  private config: Required<SecurityGuardConfig>;

  constructor(config?: SecurityGuardConfig) {
    this.config = { ...DEFAULT_SG_CONFIG, ...config };
  }

  // デフォルトレート制限
  private get defaultRateLimit() { return this.config.defaultRateLimit; }

  /** Agent のセキュリティコンテキストを登録 */
  registerAgent(context: SecurityContext): void {
    this.contexts.set(context.agentId, context);
  }

  /** Agent Bus に接続するチェック関数を返す */
  createCheck(): (event: AgentEvent) => boolean {
    return (event: AgentEvent) => this.validate(event);
  }

  /** イベントバリデーション（3層防御） */
  validate(event: AgentEvent): boolean {
    // Layer 1: 皮膚（構造バリデーション）
    if (!this.validateStructure(event)) {
      this.logAnomaly(event, 'invalid_structure');
      return false;
    }

    // Layer 2: 粘膜（レート制限）
    if (!this.checkRateLimit(event.source)) {
      this.logAnomaly(event, 'rate_limit_exceeded');
      return false;
    }

    // Layer 3: 食細胞（異常検知）
    if (this.detectAnomaly(event)) {
      this.logAnomaly(event, 'anomaly_detected');
      return false;
    }

    // ブロックリストチェック（指数バックオフ付き自動解除）
    const block = this.blockedSources.get(event.source);
    if (block) {
      const elapsed = Date.now() - block.blockedAt;
      if (elapsed < block.durationMs) {
        // まだブロック期間中
        this.logAnomaly(event, 'source_blocked');
        return false;
      }
      // ブロック期間満了 → 自動解除（ただしblockCountは保持して再犯時に倍増）
      this.blockedSources.delete(event.source);
    }

    return true;
  }

  // ── Layer 1: 構造バリデーション（皮膚） ──

  private validateStructure(event: AgentEvent): boolean {
    if (!event.id || typeof event.id !== 'string') return false;
    if (!event.type || typeof event.type !== 'string') return false;
    if (!event.source || typeof event.source !== 'string') return false;
    if (!event.timestamp || event.timestamp <= 0) return false;
    if (!['critical', 'high', 'normal', 'low'].includes(event.priority)) return false;

    // TTL チェック（期限切れイベントは破棄）
    if (event.ttl && (Date.now() - event.timestamp > event.ttl)) return false;

    // イベントタイプのフォーマット検証（namespace.action形式）
    if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$/i.test(event.type) && event.type !== '*') {
      return false;
    }

    return true;
  }

  // ── Layer 2: レート制限（粘膜） ──

  private checkRateLimit(source: string): boolean {
    const context = this.contexts.get(source);
    const limit = context?.rateLimit ?? this.defaultRateLimit;
    const now = Date.now();

    let entry = this.rateLimits.get(source);
    if (!entry || (now - entry.windowStart > limit.windowMs)) {
      entry = { count: 0, windowStart: now };
      this.rateLimits.set(source, entry);
    }

    entry.count++;
    return entry.count <= limit.maxRequests;
  }

  // ── Layer 3: 異常検知（食細胞） ──

  private detectAnomaly(event: AgentEvent): boolean {
    // 未来タイムスタンプ（システムクロック操作の可能性）
    if (event.timestamp > Date.now() + 60000) return true;

    // 過大ペイロード検出
    const payloadSize = JSON.stringify(event.payload ?? {}).length;
    if (payloadSize > 1_000_000) return true; // 1MB超過

    // 通信許可チェック（セキュリティコンテキストが登録されている場合）
    if (event.target) {
      const ctx = this.contexts.get(event.source);
      if (ctx && ctx.allowedTargets.length > 0 && !ctx.allowedTargets.includes(event.target)) {
        return true; // 許可されていない宛先
      }
    }

    return false;
  }

  // ── 診断・監視 ──

  private logAnomaly(event: AgentEvent, reason: string): void {
    const now = Date.now();

    // タイムスタンプ重複排除: 同一ソース+同一理由の100ms以内の記録はスキップ
    const isDuplicate = this.anomalyLog.some(
      (a) => a.event.source === event.source && a.reason === reason && now - a.timestamp < 100
    );
    if (isDuplicate) return;

    this.anomalyLog.push({ event, reason, timestamp: now });
    if (this.anomalyLog.length > 5000) {
      this.anomalyLog = this.anomalyLog.slice(-2500);
    }

    // スライディングウィンドウ: 設定期間内のanomalyをカウント
    const windowStart = now - this.config.anomalyWindowMs;
    const recentAnomalies = this.anomalyLog.filter(
      (a) => a.event.source === event.source && a.timestamp >= windowStart
    );

    if (recentAnomalies.length >= this.config.anomalyBlockThreshold && !this.blockedSources.has(event.source)) {
      // 指数バックオフ: 過去のブロック回数に応じてブロック期間を倍増
      const prevBlock = this.blockedSources.get(event.source);
      const blockCount = (prevBlock?.blockCount ?? 0) + 1;
      const durationMs = Math.min(
        this.config.blockBaseDurationMs * Math.pow(2, blockCount - 1),
        this.config.blockMaxDurationMs
      );

      this.blockedSources.set(event.source, {
        blockedAt: now,
        durationMs,
        blockCount,
      });
      log.warn(`[SecurityGuard] Auto-blocked source: ${event.source} (${recentAnomalies.length} anomalies in ${this.config.anomalyWindowMs}ms, block #${blockCount} for ${durationMs}ms)`);
    }
  }

  /** ブロック解除（手動） */
  unblockSource(source: string): void {
    this.blockedSources.delete(source);
  }

  /** ブロック状態取得（診断用） */
  getBlockStatus(source: string): { blocked: boolean; remainingMs?: number; blockCount?: number } {
    const block = this.blockedSources.get(source);
    if (!block) return { blocked: false };
    const remaining = block.durationMs - (Date.now() - block.blockedAt);
    if (remaining <= 0) return { blocked: false, blockCount: block.blockCount };
    return { blocked: true, remainingMs: remaining, blockCount: block.blockCount };
  }

  /** 異常ログ取得（医師の診察記録） */
  getAnomalyLog(limit = 100) {
    return this.anomalyLog.slice(-limit);
  }

  /** セキュリティ統計（血液検査結果） */
  getStats() {
    const activeBlocks = [...this.blockedSources.entries()]
      .filter(([_, b]) => Date.now() - b.blockedAt < b.durationMs)
      .map(([source, b]) => ({ source, blockCount: b.blockCount, remainingMs: b.durationMs - (Date.now() - b.blockedAt) }));

    return {
      registeredAgents: this.contexts.size,
      blockedSources: activeBlocks,
      anomalyCount: this.anomalyLog.length,
      recentAnomalies: this.anomalyLog.filter((a) => Date.now() - a.timestamp < 300000).length,
    };
  }

  /** 設定を取得（診断用） */
  getConfig(): Required<SecurityGuardConfig> {
    return { ...this.config };
  }
}
