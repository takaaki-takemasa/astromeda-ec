/**
 * Approval & Feedback テスト — Phase 2-I 全モジュール検証
 * ApprovalOrchestrator, FeedbackAnalyzer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ApprovalOrchestrator } from '../approval-orchestrator.js';
import { FeedbackAnalyzer } from '../feedback-analyzer.js';

// ── ApprovalOrchestrator ──

describe('ApprovalOrchestrator — 承認ワークフロー', () => {
  let orchestrator: ApprovalOrchestrator;

  beforeEach(async () => {
    orchestrator = new ApprovalOrchestrator();
    await orchestrator.initialize();
  });

  it('初期化が正常', () => {
    const health = orchestrator.getHealth();
    expect(health.initialized).toBe(true);
    expect(health.pendingCount).toBe(0);
  });

  it('承認リクエストを提出できる', async () => {
    const result = await orchestrator.submitRequest({
      agentId: 'content-writer',
      category: 'content',
      title: 'ブログ記事公開',
      description: '新商品紹介記事',
      priority: 'normal',
    });
    expect(result.requestId).toBeTruthy();
    expect(['pending', 'auto_approved']).toContain(result.status);
  });

  it('信頼スコアの低いエージェントはpendingになる', async () => {
    const result = await orchestrator.submitRequest({
      agentId: 'new-agent-001',
      category: 'deployment', // deployment: autoApproval=false
      title: 'デプロイリクエスト',
      description: 'ステージングデプロイ',
      priority: 'high',
    });
    expect(result.status).toBe('pending');
    expect(result.autoApproved).toBe(false);
  });

  it('手動承認が動作する', async () => {
    const result = await orchestrator.submitRequest({
      agentId: 'test-agent',
      category: 'deployment',
      title: 'テストデプロイ',
      description: 'テスト',
      priority: 'normal',
    });
    expect(result.status).toBe('pending');

    const approved = orchestrator.approve(result.requestId, 'admin', '承認');
    expect(approved).toBe(true);

    const pending = orchestrator.getPendingRequests();
    expect(pending.find(r => r.requestId === result.requestId)).toBeUndefined();
  });

  it('手動却下が動作する', async () => {
    const result = await orchestrator.submitRequest({
      agentId: 'test-agent',
      category: 'deployment',
      title: 'テストデプロイ',
      description: 'テスト',
      priority: 'normal',
    });

    const rejected = orchestrator.reject(result.requestId, 'admin', '品質不足');
    expect(rejected).toBe(true);
  });

  it('存在しないリクエストの承認はfalse', () => {
    expect(orchestrator.approve('nonexistent', 'admin')).toBe(false);
    expect(orchestrator.reject('nonexistent', 'admin', 'reason')).toBe(false);
  });

  it('承認KPIが計算される', async () => {
    // 数件リクエストを処理
    const r1 = await orchestrator.submitRequest({
      agentId: 'a1', category: 'content', title: 'T1', description: 'D1', priority: 'normal',
    });
    const r2 = await orchestrator.submitRequest({
      agentId: 'a2', category: 'deployment', title: 'T2', description: 'D2', priority: 'normal',
    });
    orchestrator.approve(r2.requestId, 'admin');

    const kpis = orchestrator.getApprovalKPIs();
    expect(kpis.totalRequests).toBeGreaterThan(0);
    expect(kpis.pendingCount).toBeGreaterThanOrEqual(0);
  });

  it('Trust Scoreが更新される', async () => {
    const r1 = await orchestrator.submitRequest({
      agentId: 'trust-test', category: 'deployment', title: 'T1', description: 'D1', priority: 'normal',
    });
    orchestrator.approve(r1.requestId, 'admin');

    const score = orchestrator.getTrustScore('trust-test');
    expect(score.totalRequests).toBe(1);
    expect(score.approvedCount).toBe(1);
    expect(score.score).toBeGreaterThan(0.5); // 承認でスコア増加
  });

  it('却下でTrust Scoreが低下する', async () => {
    const r1 = await orchestrator.submitRequest({
      agentId: 'reject-test', category: 'deployment', title: 'T1', description: 'D1', priority: 'normal',
    });
    orchestrator.reject(r1.requestId, 'admin', '品質不足');

    const score = orchestrator.getTrustScore('reject-test');
    expect(score.rejectedCount).toBe(1);
    expect(score.score).toBeLessThan(0.5); // 却下でスコア減少
  });

  it('getAllTrustScores()がスコア降順', async () => {
    // 複数エージェントの承認/却下
    const r1 = await orchestrator.submitRequest({
      agentId: 'good-agent', category: 'deployment', title: 'T1', description: 'D1', priority: 'normal',
    });
    orchestrator.approve(r1.requestId, 'admin');

    const r2 = await orchestrator.submitRequest({
      agentId: 'bad-agent', category: 'deployment', title: 'T2', description: 'D2', priority: 'normal',
    });
    orchestrator.reject(r2.requestId, 'admin', 'reason');

    const scores = orchestrator.getAllTrustScores();
    expect(scores.length).toBeGreaterThanOrEqual(2);
    // スコア降順
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1].score).toBeGreaterThanOrEqual(scores[i].score);
    }
  });

  it('シャットダウンでpendingがクリア', async () => {
    await orchestrator.submitRequest({
      agentId: 'sd-test', category: 'deployment', title: 'T', description: 'D', priority: 'normal',
    });
    await orchestrator.shutdown();
    expect(orchestrator.getHealth().pendingCount).toBe(0);
  });
});

// ── FeedbackAnalyzer ──

describe('FeedbackAnalyzer — フィードバック学習', () => {
  let analyzer: FeedbackAnalyzer;

  beforeEach(async () => {
    analyzer = new FeedbackAnalyzer();
    await analyzer.initialize();
  });

  it('初期化が正常', () => {
    const health = analyzer.getHealth();
    expect(health.initialized).toBe(true);
    expect(health.feedbackCount).toBe(0);
  });

  it('フィードバックを記録できる', () => {
    const record = analyzer.recordFeedback({
      agentId: 'content-writer',
      type: 'approval_result',
      sourceActionId: 'apr-001',
      sentiment: 'positive',
      score: 85,
      message: '承認: ブログ記事公開',
    });
    expect(record.id).toBeTruthy();
    expect(record.appliedToLearning).toBe(false);
    expect(analyzer.getHealth().feedbackCount).toBe(1);
  });

  it('Agent別パフォーマンスを取得できる', () => {
    // 10件のフィードバックを記録
    for (let i = 0; i < 10; i++) {
      analyzer.recordFeedback({
        agentId: 'test-agent',
        type: 'approval_result',
        sourceActionId: `apr-${i}`,
        sentiment: i < 7 ? 'positive' : 'negative',
        score: i < 7 ? 80 : 30,
        message: `Action ${i}`,
      });
    }

    const perf = analyzer.getAgentPerformance('test-agent');
    expect(perf.totalFeedbacks).toBe(10);
    expect(perf.positiveRate).toBe(70);
    expect(perf.negativeRate).toBe(30);
    expect(perf.avgScore).toBeGreaterThan(0);
  });

  it('学習サイクルが実行される', () => {
    // 5件以上のフィードバックで学習開始
    for (let i = 0; i < 8; i++) {
      analyzer.recordFeedback({
        agentId: 'learner',
        type: 'approval_result',
        sourceActionId: `apr-${i}`,
        sentiment: i < 5 ? 'positive' : 'negative',
        score: i < 5 ? 85 : 25,
        message: `Action ${i}`,
      });
    }

    const learnings = analyzer.runLearningCycle();
    expect(learnings.length).toBe(1);
    expect(learnings[0].agentId).toBe('learner');
    expect(learnings[0].recommendations.length).toBeGreaterThan(0);

    // 学習済みフラグ確認
    const health = analyzer.getHealth();
    expect(health.learningCount).toBe(1);
  });

  it('5件未満のフィードバックでは学習しない', () => {
    for (let i = 0; i < 3; i++) {
      analyzer.recordFeedback({
        agentId: 'few-feedback',
        type: 'approval_result',
        sourceActionId: `apr-${i}`,
        sentiment: 'positive',
        score: 80,
        message: `Action ${i}`,
      });
    }

    const learnings = analyzer.runLearningCycle();
    expect(learnings.length).toBe(0);
  });

  it('KPIフィードバックでimpactが記録される', () => {
    const record = analyzer.recordFeedback({
      agentId: 'seo-director',
      type: 'kpi_outcome',
      sourceActionId: 'kpi-001',
      sentiment: 'positive',
      score: 90,
      message: 'CTR +15%',
      kpiImpact: {
        metric: 'ctr',
        before: 3.2,
        after: 3.68,
        changePercent: 15,
      },
    });
    expect(record.kpiImpact?.changePercent).toBe(15);
  });

  it('システム全体KPIが計算される', () => {
    for (let i = 0; i < 5; i++) {
      analyzer.recordFeedback({
        agentId: `agent-${i}`,
        type: 'approval_result',
        sourceActionId: `apr-${i}`,
        sentiment: 'positive',
        score: 80,
        message: `OK ${i}`,
      });
    }

    const kpis = analyzer.getSystemLearningKPIs();
    expect(kpis.totalFeedbacks).toBe(5);
    expect(kpis.positiveRate).toBe(100);
    expect(kpis.agentsCovered).toBe(5);
  });

  it('トレンド判定が動作する', () => {
    // 前半低スコア、後半高スコア → improving
    for (let i = 0; i < 20; i++) {
      analyzer.recordFeedback({
        agentId: 'trend-test',
        type: 'approval_result',
        sourceActionId: `apr-${i}`,
        sentiment: i < 10 ? 'negative' : 'positive',
        score: i < 10 ? 30 : 90,
        message: `Action ${i}`,
      });
    }

    const perf = analyzer.getAgentPerformance('trend-test');
    expect(perf.trend).toBe('improving');
  });

  it('シャットダウンでデータがクリア', async () => {
    analyzer.recordFeedback({
      agentId: 'sd-test',
      type: 'approval_result',
      sourceActionId: 'apr-001',
      sentiment: 'positive',
      score: 80,
      message: 'OK',
    });
    await analyzer.shutdown();
    expect(analyzer.getHealth().feedbackCount).toBe(0);
  });
});
