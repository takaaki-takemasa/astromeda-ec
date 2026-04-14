/**
 * Approval Orchestrator — Phase 2-I #I-02
 *
 * 生体対応: 前頭前皮質（Prefrontal Cortex）
 * 「実行して良いか？」の判断を統括。エージェントの自律性と人間の制御のバランス。
 *
 * 機能:
 *   - 承認リクエストの受付・管理
 *   - 自動承認判定（信頼スコアベース）
 *   - 手動承認フロー（Slack通知 or Admin Dashboard）
 *   - 承認履歴の記録・分析
 *   - 承認率KPI追跡（目標: 50%→80%自動承認）
 *
 * 承認フロー:
 *   Agent → ApprovalOrchestrator → (自動承認 or 手動承認) → 実行
 */

import type { IAgentBus, AgentEvent } from '../core/types';
import type { ApprovalLogRecord, ApprovalStatus, ApprovalCategory } from '../data-collection/data-models';

// ── 承認リクエスト ──

export interface ApprovalRequest {
  /** リクエスト元Agent ID */
  agentId: string;
  /** パイプラインID（あれば） */
  pipelineId?: string;
  /** カテゴリ */
  category: ApprovalCategory;
  /** タイトル */
  title: string;
  /** 詳細 */
  description: string;
  /** 変更プレビュー */
  preview?: Record<string, unknown>;
  /** 優先度 */
  priority: 'critical' | 'high' | 'normal' | 'low';
  /** 有効期限（ms） */
  expiresIn?: number;
}

// ── 承認ポリシー ──

export interface ApprovalPolicy {
  /** カテゴリ */
  category: ApprovalCategory;
  /** 自動承認の信頼スコア閾値（0-1） */
  autoApprovalThreshold: number;
  /** 自動承認を許可するか */
  autoApprovalEnabled: boolean;
  /** 承認の有効期限（ms） */
  expirationMs: number;
  /** 必要承認者数 */
  requiredApprovers: number;
}

const DEFAULT_POLICIES: ApprovalPolicy[] = [
  { category: 'content', autoApprovalThreshold: 0.8, autoApprovalEnabled: true, expirationMs: 24 * 60 * 60 * 1000, requiredApprovers: 1 },
  { category: 'seo', autoApprovalThreshold: 0.7, autoApprovalEnabled: true, expirationMs: 24 * 60 * 60 * 1000, requiredApprovers: 1 },
  { category: 'design', autoApprovalThreshold: 0.6, autoApprovalEnabled: false, expirationMs: 48 * 60 * 60 * 1000, requiredApprovers: 1 },
  { category: 'pricing', autoApprovalThreshold: 0.9, autoApprovalEnabled: false, expirationMs: 12 * 60 * 60 * 1000, requiredApprovers: 1 },
  { category: 'promotion', autoApprovalThreshold: 0.75, autoApprovalEnabled: true, expirationMs: 24 * 60 * 60 * 1000, requiredApprovers: 1 },
  { category: 'deployment', autoApprovalThreshold: 1.0, autoApprovalEnabled: false, expirationMs: 4 * 60 * 60 * 1000, requiredApprovers: 1 },
  { category: 'other', autoApprovalThreshold: 0.85, autoApprovalEnabled: true, expirationMs: 24 * 60 * 60 * 1000, requiredApprovers: 1 },
];

// ── Agent信頼スコア ──

export interface AgentTrustScore {
  agentId: string;
  score: number; // 0-1
  totalRequests: number;
  approvedCount: number;
  rejectedCount: number;
  autoApprovedCount: number;
  lastUpdated: number;
}

// ── Orchestrator ──

export class ApprovalOrchestrator {
  private bus?: IAgentBus;
  private policies: Map<ApprovalCategory, ApprovalPolicy> = new Map();
  private pendingRequests: Map<string, ApprovalLogRecord> = new Map();
  private completedRequests: ApprovalLogRecord[] = [];
  private trustScores: Map<string, AgentTrustScore> = new Map();
  private initialized = false;
  private readonly MAX_COMPLETED = 5000;
  private readonly MAX_PENDING = 100;
  private readonly MAX_TRUST_SCORES = 200; // 予防医学: Trust Scoreエントリ上限

  constructor(policies?: ApprovalPolicy[], bus?: IAgentBus) {
    this.bus = bus;
    const allPolicies = policies ?? DEFAULT_POLICIES;
    for (const policy of allPolicies) {
      this.policies.set(policy.category, policy);
    }
  }

  async initialize(): Promise<void> {
    this.initialized = true;
    // Bus購読: 承認リクエストイベント
    if (this.bus) {
      this.bus.subscribe('approval.request', (event: AgentEvent) => {
        this.handleApprovalEvent(event);
      });
      this.bus.subscribe('approval.response', (event: AgentEvent) => {
        this.handleResponseEvent(event);
      });
    }
    this.emitEvent('approval.orchestrator.initialized', {
      policies: this.policies.size,
    });
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    this.pendingRequests.clear();
  }

  getHealth() {
    return {
      initialized: this.initialized,
      pendingCount: this.pendingRequests.size,
      completedCount: this.completedRequests.length,
      trustScoreCount: this.trustScores.size,
    };
  }

  // ── 承認リクエスト提出 ──

  async submitRequest(request: ApprovalRequest): Promise<{
    requestId: string;
    status: ApprovalStatus;
    autoApproved: boolean;
  }> {
    if (!this.initialized) throw new Error('ApprovalOrchestrator not initialized');

    const requestId = `apr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const policy = this.policies.get(request.category) ?? DEFAULT_POLICIES[6]; // fallback: 'other'
    const trustScore = this.getTrustScore(request.agentId);

    // 自動承認判定
    const autoApprovalEligible = policy.autoApprovalEnabled && trustScore.score >= policy.autoApprovalThreshold;
    const status: ApprovalStatus = autoApprovalEligible ? 'auto_approved' : 'pending';

    const record: ApprovalLogRecord = {
      id: requestId,
      requestId,
      agentId: request.agentId,
      pipelineId: request.pipelineId,
      category: request.category,
      status,
      title: request.title,
      description: request.description,
      preview: request.preview,
      requestedAt: now,
      respondedAt: autoApprovalEligible ? now : undefined,
      approver: autoApprovalEligible ? 'auto' : undefined,
      autoApprovalEligible,
      confidenceScore: trustScore.score,
      createdAt: now,
      updatedAt: now,
    };

    if (autoApprovalEligible) {
      // 自動承認
      this.addCompleted(record);
      this.updateTrustScore(request.agentId, 'auto_approved');
      this.emitEvent('approval.auto_approved', {
        requestId,
        agentId: request.agentId,
        category: request.category,
        title: request.title,
        trustScore: trustScore.score,
      });
    } else {
      // 手動承認待ち
      this.pendingRequests.set(requestId, record);
      this.emitEvent('approval.pending', {
        requestId,
        agentId: request.agentId,
        category: request.category,
        title: request.title,
        priority: request.priority,
      });

      // 有効期限タイマー
      const expiration = request.expiresIn ?? policy.expirationMs;
      setTimeout(() => this.expireRequest(requestId), expiration);
    }

    return { requestId, status, autoApproved: autoApprovalEligible };
  }

  // ── 手動承認/却下 ──

  approve(requestId: string, approver: string, reason?: string): boolean {
    const record = this.pendingRequests.get(requestId);
    if (!record) return false;

    record.status = 'approved';
    record.approver = approver;
    record.reason = reason;
    record.respondedAt = Date.now();
    record.updatedAt = Date.now();

    this.pendingRequests.delete(requestId);
    this.addCompleted(record);
    this.updateTrustScore(record.agentId, 'approved');

    this.emitEvent('approval.approved', {
      requestId,
      agentId: record.agentId,
      approver,
    });

    return true;
  }

  reject(requestId: string, approver: string, reason: string): boolean {
    const record = this.pendingRequests.get(requestId);
    if (!record) return false;

    record.status = 'rejected';
    record.approver = approver;
    record.reason = reason;
    record.respondedAt = Date.now();
    record.updatedAt = Date.now();

    this.pendingRequests.delete(requestId);
    this.addCompleted(record);
    this.updateTrustScore(record.agentId, 'rejected');

    this.emitEvent('approval.rejected', {
      requestId,
      agentId: record.agentId,
      approver,
      reason,
    });

    return true;
  }

  // ── ペンディング一覧 ──

  getPendingRequests(): ApprovalLogRecord[] {
    return Array.from(this.pendingRequests.values())
      .sort((a, b) => b.requestedAt - a.requestedAt);
  }

  // ── KPI: 承認率 ──

  getApprovalKPIs(): {
    totalRequests: number;
    autoApprovalRate: number;
    manualApprovalRate: number;
    rejectionRate: number;
    avgResponseTimeMs: number;
    pendingCount: number;
  } {
    const total = this.completedRequests.length;
    if (total === 0) {
      return {
        totalRequests: 0,
        autoApprovalRate: 0,
        manualApprovalRate: 0,
        rejectionRate: 0,
        avgResponseTimeMs: 0,
        pendingCount: this.pendingRequests.size,
      };
    }

    const autoApproved = this.completedRequests.filter(r => r.status === 'auto_approved').length;
    const approved = this.completedRequests.filter(r => r.status === 'approved').length;
    const rejected = this.completedRequests.filter(r => r.status === 'rejected').length;

    const responseTimes = this.completedRequests
      .filter(r => r.respondedAt && r.requestedAt)
      .map(r => r.respondedAt! - r.requestedAt);
    const avgResponseTimeMs = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;

    return {
      totalRequests: total,
      autoApprovalRate: Math.round((autoApproved / total) * 100),
      manualApprovalRate: Math.round((approved / total) * 100),
      rejectionRate: Math.round((rejected / total) * 100),
      avgResponseTimeMs: Math.round(avgResponseTimeMs),
      pendingCount: this.pendingRequests.size,
    };
  }

  // ── Trust Score ──

  getTrustScore(agentId: string): AgentTrustScore {
    const existing = this.trustScores.get(agentId);
    if (existing) return existing;

    // 新規エージェント: 初期スコア0.5
    const newScore: AgentTrustScore = {
      agentId,
      score: 0.5,
      totalRequests: 0,
      approvedCount: 0,
      rejectedCount: 0,
      autoApprovedCount: 0,
      lastUpdated: Date.now(),
    };
    // 予防医学: Trust Scoreが上限超過時に最低スコアを削除（オートファジー）
    if (this.trustScores.size >= this.MAX_TRUST_SCORES) {
      let lowestId = '';
      let lowestScore = Infinity;
      for (const [id, ts] of this.trustScores) {
        if (ts.score < lowestScore) {
          lowestScore = ts.score;
          lowestId = id;
        }
      }
      if (lowestId) this.trustScores.delete(lowestId);
    }
    this.trustScores.set(agentId, newScore);
    return newScore;
  }

  getAllTrustScores(): AgentTrustScore[] {
    return Array.from(this.trustScores.values())
      .sort((a, b) => b.score - a.score);
  }

  // ── Private ──

  private handleApprovalEvent(event: AgentEvent): void {
    const payload = event.payload as ApprovalRequest | undefined;
    if (payload) {
      this.submitRequest(payload).catch(() => {});
    }
  }

  private handleResponseEvent(event: AgentEvent): void {
    const payload = event.payload as { requestId: string; approved: boolean; approver: string; reason?: string } | undefined;
    if (!payload) return;

    if (payload.approved) {
      this.approve(payload.requestId, payload.approver, payload.reason);
    } else {
      this.reject(payload.requestId, payload.approver, payload.reason ?? 'No reason provided');
    }
  }

  private expireRequest(requestId: string): void {
    const record = this.pendingRequests.get(requestId);
    if (!record) return;

    record.status = 'expired';
    record.updatedAt = Date.now();
    this.pendingRequests.delete(requestId);
    this.addCompleted(record);

    this.emitEvent('approval.expired', {
      requestId,
      agentId: record.agentId,
    });
  }

  private updateTrustScore(agentId: string, result: 'approved' | 'rejected' | 'auto_approved'): void {
    const score = this.getTrustScore(agentId);
    score.totalRequests++;
    score.lastUpdated = Date.now();

    switch (result) {
      case 'approved':
        score.approvedCount++;
        // 承認されるとスコア微増
        score.score = Math.min(1.0, score.score + 0.02);
        break;
      case 'auto_approved':
        score.autoApprovedCount++;
        // 自動承認も微増
        score.score = Math.min(1.0, score.score + 0.01);
        break;
      case 'rejected':
        score.rejectedCount++;
        // 却下されるとスコア減少
        score.score = Math.max(0, score.score - 0.05);
        break;
    }
  }

  private addCompleted(record: ApprovalLogRecord): void {
    this.completedRequests.push(record);
    if (this.completedRequests.length > this.MAX_COMPLETED) {
      this.completedRequests = this.completedRequests.slice(-this.MAX_COMPLETED);
    }
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    if (!this.bus) return;
    this.bus.publish({
      id: `apr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      source: 'approval-orchestrator',
      priority: 'normal',
      payload,
      timestamp: Date.now(),
    });
  }
}
