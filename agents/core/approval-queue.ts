/**
 * ApprovalQueue — 人間承認キューシステム（前頭前皮質=意思決定中枢）
 *
 * 医学的メタファー: 前頭前皮質（Prefrontal Cortex）
 * AIエージェントが自律運用する中で、高リスクな判断は人間（オーナー）の
 * 承認を求める。これは大脳新皮質の「意思決定→実行」フローと同じ。
 *
 * 反射（低リスク）: AI自動実行 → ActionLoggerに記録のみ
 * 随意運動（高リスク）: AI判断 → ApprovalQueue → 人間承認 → 実行
 *
 * 設計原則:
 * 1. Storage永続化 — リクエスト間でキューを維持（KV Storage使用）
 * 2. タイムアウト — 承認が一定時間なければ自動却下（安全側に倒す）
 * 3. 優先度付き — critical/high/normal で表示順を制御
 * 4. 監査証跡 — 全承認/却下をFeedbackCollectorに記録
 */

import type { EventPriority } from './types.js';
import { z } from 'zod';
import { getStorage, TABLES } from './storage.js';
import type { IStorageAdapter, StorageRecord } from './storage.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('approval-queue');


// ── Zodスキーマ（T015: 承認キュー検証） ──

/** 承認リクエスト作成パラメータのZodスキーマ */
export const ApprovalCreateParamsSchema = z.object({
  agentId: z.string().min(1),
  agentName: z.string().min(1),
  action: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(['critical', 'high', 'normal', 'low']).optional(),
  category: z.enum(['pricing', 'content', 'deployment', 'marketing', 'operations', 'data']).optional(),
  payload: z.record(z.unknown()).optional(),
  estimatedImpact: z.string().optional(),
});

/** 承認決定のZodスキーマ */
export const ApprovalDecisionSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(['approve', 'reject', 'defer']),
  decidedBy: z.string().min(1),
  reason: z.string().optional(),
});


// ── 型定義 ──

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'auto_approved';

export interface ApprovalRequest {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  description: string;          // 非エンジニア向けの日本語説明
  priority: EventPriority;
  category: 'pricing' | 'content' | 'deployment' | 'marketing' | 'operations' | 'data';
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  createdAt: number;
  expiresAt: number;            // 承認期限
  decidedAt?: number;           // 承認/却下日時
  decidedBy?: string;           // 承認者ID
  reason?: string;              // 却下理由
  autoApproveIfExpired: boolean; // true=期限切れ時自動承認(低リスク)
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  estimatedImpact?: string;     // 推定影響（例:「売上 +3%〜-1%」）
}

// Storage用レコード
interface StoredApproval extends StorageRecord {
  agentId: string;
  agentName: string;
  action: string;
  description: string;
  priority: string;
  category: string;
  payload: string; // JSON
  status: string;
  expiresAt: number;
  decidedAt?: number;
  decidedBy?: string;
  reason?: string;
  autoApproveIfExpired: boolean;
  riskLevel: string;
  estimatedImpact?: string;
}

// ── 定数 ──

const APPROVAL_TABLE = 'approval_queue';
const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24時間
const CRITICAL_EXPIRY_MS = 4 * 60 * 60 * 1000;  // critical=4時間（早期判断必要）

// リスク分類ルール
const ACTION_RISK_MAP: Record<string, ApprovalRequest['riskLevel']> = {
  // 高リスク: 金銭・外部影響
  'price-change': 'critical',
  'deploy-production': 'critical',
  'campaign-launch': 'high',
  'bulk-product-update': 'high',
  'email-blast': 'high',
  // 中リスク: コンテンツ変更
  'content-publish': 'medium',
  'seo-update': 'medium',
  'banner-update': 'medium',
  // 低リスク: 分析・レポート
  'generate-report': 'low',
  'run-audit': 'low',
  'catalog-sync': 'low',
};

// ── ApprovalQueue クラス ──

export class ApprovalQueue {
  private storage: IStorageAdapter | null = null;
  private inMemoryQueue: Map<string, ApprovalRequest> = new Map();

  constructor() {
    try {
      this.storage = getStorage();
    } catch {
      // Storage未初期化時はインメモリ動作
      this.storage = null;
    }
  }

  /**
   * 承認リクエストを作成
   * AIエージェントが高リスク判断時にこれを呼ぶ
   */
  async createRequest(params: {
    agentId: string;
    agentName: string;
    action: string;
    description: string;
    priority?: EventPriority;
    category?: ApprovalRequest['category'];
    payload?: Record<string, unknown>;
    estimatedImpact?: string;
  }): Promise<ApprovalRequest> {
    // T015: 入力パラメータをZodで検証
    const validation = ApprovalCreateParamsSchema.safeParse(params);
    if (!validation.success) {
      log.error('[ApprovalQueue] createRequest validation failed:', validation.error.message);
      throw new Error(`[ApprovalQueue] createRequest validation failed — ${validation.error.message}`);
    }
    const riskLevel = ACTION_RISK_MAP[params.action] || 'medium';
    const priority = params.priority || (riskLevel === 'critical' ? 'critical' : riskLevel === 'high' ? 'high' : 'normal');
    const expiryMs = riskLevel === 'critical' ? CRITICAL_EXPIRY_MS : DEFAULT_EXPIRY_MS;

    const now = Date.now();
    const request: ApprovalRequest = {
      id: `apr-${now}-${Math.random().toString(36).slice(2, 8)}`,
      agentId: params.agentId,
      agentName: params.agentName,
      action: params.action,
      description: params.description,
      priority,
      category: params.category || 'operations',
      payload: params.payload || {},
      status: 'pending',
      createdAt: now,
      expiresAt: now + expiryMs,
      autoApproveIfExpired: riskLevel === 'low',
      riskLevel,
      estimatedImpact: params.estimatedImpact,
    };

    // Storage永続化
    await this.persist(request);
    this.inMemoryQueue.set(request.id, request);

    log.info(`[ApprovalQueue] Created: ${request.id} [${riskLevel}] ${params.agentName}/${params.action}`);
    return request;
  }

  /**
   * 承認する
   */
  async approve(requestId: string, decidedBy: string = 'owner'): Promise<ApprovalRequest | null> {
    // T015: 決定パラメータをZodで検証
    const validation = ApprovalDecisionSchema.safeParse({
      requestId,
      decision: 'approve',
      decidedBy,
    });
    if (!validation.success) {
      log.error('[ApprovalQueue] approve validation failed:', validation.error.message);
      throw new Error(`[ApprovalQueue] approve validation failed — ${validation.error.message}`);
    }

    const req = await this.getRequest(requestId);
    if (!req || req.status !== 'pending') return null;

    req.status = 'approved';
    req.decidedAt = Date.now();
    req.decidedBy = decidedBy;

    await this.persist(req);
    this.inMemoryQueue.set(req.id, req);

    log.info(`[ApprovalQueue] Approved: ${req.id} by ${decidedBy}`);
    return req;
  }

  /**
   * 却下する
   */
  async reject(requestId: string, reason: string = '', decidedBy: string = 'owner'): Promise<ApprovalRequest | null> {
    // T015: 決定パラメータをZodで検証
    const validation = ApprovalDecisionSchema.safeParse({
      requestId,
      decision: 'reject',
      decidedBy,
      reason,
    });
    if (!validation.success) {
      log.error('[ApprovalQueue] reject validation failed:', validation.error.message);
      throw new Error(`[ApprovalQueue] reject validation failed — ${validation.error.message}`);
    }

    const req = await this.getRequest(requestId);
    if (!req || req.status !== 'pending') return null;

    req.status = 'rejected';
    req.decidedAt = Date.now();
    req.decidedBy = decidedBy;
    req.reason = reason;

    await this.persist(req);
    this.inMemoryQueue.set(req.id, req);

    log.info(`[ApprovalQueue] Rejected: ${req.id} by ${decidedBy} — ${reason}`);
    return req;
  }

  /**
   * 期限切れチェック — リクエスト処理時に呼ばれる
   */
  async processExpired(): Promise<number> {
    const now = Date.now();
    let processedCount = 0;
    const pending = await this.getPendingRequests();

    for (const req of pending) {
      if (now >= req.expiresAt) {
        if (req.autoApproveIfExpired) {
          req.status = 'auto_approved';
          log.info(`[ApprovalQueue] Auto-approved (expired): ${req.id}`);
        } else {
          req.status = 'expired';
          log.info(`[ApprovalQueue] Expired (rejected): ${req.id}`);
        }
        req.decidedAt = now;
        req.decidedBy = 'system';
        await this.persist(req);
        this.inMemoryQueue.set(req.id, req);
        processedCount++;
      }
    }

    return processedCount;
  }

  /**
   * 承認待ちリクエスト一覧（優先度順）
   */
  async getPendingRequests(): Promise<ApprovalRequest[]> {
    const all = await this.getAllRequests();
    const pending = all.filter(r => r.status === 'pending');

    // 優先度ソート: critical > high > normal > low
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };
    return pending.sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 9;
      const pb = priorityOrder[b.priority] ?? 9;
      if (pa !== pb) return pa - pb;
      return a.createdAt - b.createdAt; // 同優先度なら古い順
    });
  }

  /**
   * 全リクエスト取得（直近100件）
   */
  async getAllRequests(): Promise<ApprovalRequest[]> {
    // InMemoryにデータがあればそれを使う
    if (this.inMemoryQueue.size > 0) {
      return Array.from(this.inMemoryQueue.values());
    }

    // Storageから復元
    if (this.storage) {
      try {
        const records = await this.storage.query(APPROVAL_TABLE, {}) as StoredApproval[];
        const requests = records.map(r => this.fromStorage(r));
        for (const req of requests) {
          this.inMemoryQueue.set(req.id, req);
        }
        return requests;
      } catch {
        return [];
      }
    }

    return [];
  }

  /**
   * 統計サマリー
   */
  async getStats(): Promise<{
    pending: number;
    approved: number;
    rejected: number;
    expired: number;
    autoApproved: number;
    avgResponseTimeMs: number;
  }> {
    const all = await this.getAllRequests();
    const decided = all.filter(r => r.decidedAt);
    const responseTimes = decided
      .filter(r => r.decidedAt && r.decidedBy !== 'system')
      .map(r => (r.decidedAt || 0) - r.createdAt);

    return {
      pending: all.filter(r => r.status === 'pending').length,
      approved: all.filter(r => r.status === 'approved').length,
      rejected: all.filter(r => r.status === 'rejected').length,
      expired: all.filter(r => r.status === 'expired').length,
      autoApproved: all.filter(r => r.status === 'auto_approved').length,
      avgResponseTimeMs: responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0,
    };
  }

  /**
   * 特定リクエスト取得
   */
  async getRequest(id: string): Promise<ApprovalRequest | null> {
    // InMemory優先
    const cached = this.inMemoryQueue.get(id);
    if (cached) return cached;

    // Storage検索
    if (this.storage) {
      try {
        const record = await this.storage.get(APPROVAL_TABLE, id) as StoredApproval | null;
        if (record) {
          const req = this.fromStorage(record);
          this.inMemoryQueue.set(req.id, req);
          return req;
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  // ── 内部メソッド ──

  private async persist(request: ApprovalRequest): Promise<void> {
    if (!this.storage) return;

    try {
      const record: StoredApproval = {
        id: request.id,
        agentId: request.agentId,
        agentName: request.agentName,
        action: request.action,
        description: request.description,
        priority: request.priority,
        category: request.category,
        payload: JSON.stringify(request.payload),
        status: request.status,
        expiresAt: request.expiresAt,
        decidedAt: request.decidedAt,
        decidedBy: request.decidedBy,
        reason: request.reason,
        autoApproveIfExpired: request.autoApproveIfExpired,
        riskLevel: request.riskLevel,
        estimatedImpact: request.estimatedImpact,
        createdAt: request.createdAt,
        updatedAt: Date.now(),
      };
      await this.storage.upsert(APPROVAL_TABLE, record);
    } catch (err) {
      // 1-08: silent catch → Error throw（感覚麻痺の防止）
      // 永続化失敗は承認データ消失のリスクがあるため、呼び出し元に伝搬する
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`[ApprovalQueue] Persist failed: ${message}`);
    }
  }

  private fromStorage(record: StoredApproval): ApprovalRequest {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(record.payload || '{}') as Record<string, unknown>;
    } catch {
      payload = {};
    }

    return {
      id: record.id,
      agentId: record.agentId,
      agentName: record.agentName,
      action: record.action,
      description: record.description,
      priority: record.priority as EventPriority,
      category: record.category as ApprovalRequest['category'],
      payload,
      status: record.status as ApprovalStatus,
      createdAt: record.createdAt || Date.now(),
      expiresAt: record.expiresAt,
      decidedAt: record.decidedAt,
      decidedBy: record.decidedBy,
      reason: record.reason,
      autoApproveIfExpired: record.autoApproveIfExpired,
      riskLevel: record.riskLevel as ApprovalRequest['riskLevel'],
      estimatedImpact: record.estimatedImpact,
    };
  }
}

// ── シングルトン ──

let approvalQueueInstance: ApprovalQueue | null = null;

export function getApprovalQueue(): ApprovalQueue {
  if (!approvalQueueInstance) {
    approvalQueueInstance = new ApprovalQueue();
  }
  return approvalQueueInstance;
}

export function resetApprovalQueue(): void {
  approvalQueueInstance = null;
}
