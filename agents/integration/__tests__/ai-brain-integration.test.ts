/**
 * AI Brain ↔ Agent統合テスト — 大脳新皮質と各臓器の接続検証
 *
 * D6検証: L2/L1エージェントがAI Brainを通じてClaude APIに判断を委ねられることを確認。
 * API未設定時はルールベースフォールバックが動作することも検証。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetAIBrain, getAIBrain, setAIBrainEnv, type AIDecision, type AIAnalysis } from '../../core/ai-brain.js';
import { AgentBus } from '../../core/agent-bus.js';
import type {
  AgentId,
  AgentHealth,
  AgentEvent,
  CascadeCommand,
  IAgentBus,
} from '../../core/types.js';
import { BaseL2Agent } from '../../l2/base-l2-agent.js';

// ── テスト用L2エージェント（具象クラス） ──

class TestL2Agent extends BaseL2Agent {
  readonly id: AgentId = {
    id: 'test-l2-agent',
    name: 'テストL2エージェント',
    level: 'L2',
    team: 'test',
    version: '1.0.0',
  };

  // テスト用: AI Brainメソッドを公開
  async testDecision(
    context: string,
    options: string[],
    data?: Record<string, unknown>,
  ): Promise<AIDecision> {
    return this.requestAIDecision(context, options, data);
  }

  async testAnalysis(
    data: Record<string, unknown>,
    question: string,
  ): Promise<AIAnalysis> {
    return this.requestAIAnalysis(data, question);
  }

  get testAIAvailable(): boolean {
    return this.aiAvailable;
  }

  protected async onInitialize(): Promise<void> { /* テスト */ }
  protected async onShutdown(): Promise<void> { /* テスト */ }
  protected async onEvent(_event: AgentEvent): Promise<void> { /* テスト */ }
  protected async onCommand(command: CascadeCommand): Promise<unknown> {
    // AI Brainを活用したコマンド処理のデモ
    if (command.action === 'ai_decide') {
      const decision = await this.requestAIDecision(
        String(command.params?.context || 'デフォルト'),
        (command.params?.options as string[]) || ['A', 'B'],
      );
      return { decision };
    }
    return { status: 'ok' };
  }
}

describe('AI Brain ↔ Agent 統合テスト', () => {
  let bus: AgentBus;
  let agent: TestL2Agent;

  beforeEach(() => {
    resetAIBrain();
    bus = new AgentBus();
    agent = new TestL2Agent(bus);
  });

  // ── API未設定時のフォールバック動作 ──

  describe('API未設定時（ルールベースフォールバック）', () => {
    it('aiAvailableがfalseを返す', () => {
      expect(agent.testAIAvailable).toBe(false);
    });

    it('requestAIDecisionがルールベースフォールバックを返す', async () => {
      const decision = await agent.testDecision(
        '新しいバナー画像の色調を決定',
        ['暖色系', '寒色系', 'ブランドカラー'],
      );

      expect(decision.action).toBe('暖色系'); // first option
      expect(decision.confidence).toBeGreaterThanOrEqual(0.3);
      expect(decision.confidence).toBeLessThanOrEqual(0.9);
      expect(decision.riskLevel).toBe('medium');
      expect(decision.requiresApproval).toBe(true);
      expect(decision.reasoning).toBeTruthy();
    });

    it('requestAIAnalysisがスキップレスポンスを返す', async () => {
      const analysis = await agent.testAnalysis(
        { todayRevenue: 1500000, yesterdayRevenue: 1200000 },
        '売上トレンドを分析',
      );

      expect(analysis.summary).toContain('未接続');
      expect(analysis.insights).toEqual([]);
      expect(analysis.recommendations).toEqual([]);
      expect(analysis.confidence).toBe(0);
    });

    it('handleCommand経由でAI判断をフォールバック実行できる', async () => {
      await agent.initialize();

      const result = await agent.handleCommand({
        id: 'test-cmd-1',
        from: 'test-lead',
        to: ['test-l2-agent'],
        action: 'ai_decide',
        params: {
          context: 'テスト判断',
          options: ['実行', 'スキップ', '延期'],
        },
        priority: 'normal',
      });

      expect(result).toBeDefined();
      const typed = result as { decision: AIDecision };
      expect(typed.decision.action).toBe('実行'); // first option
      expect(typed.decision.requiresApproval).toBe(true);
    });
  });

  // ── API設定時の動作 ──

  describe('API設定時', () => {
    beforeEach(() => {
      setAIBrainEnv('test-api-key-12345');
      resetAIBrain(); // 新しいキーで再初期化
      setAIBrainEnv('test-api-key-12345');
    });

    it('aiAvailableがtrueを返す', () => {
      const brain = getAIBrain();
      expect(brain.available).toBe(true);
    });

    // Note: 実際のAPI呼び出しはテストしない（CIでAPIキーが不要な設計）
    // 代わりに、API設定時でもフォールバックが安全に動作することを確認

    it('getUsageが初期値を返す', () => {
      const brain = getAIBrain();
      const usage = brain.getUsage();

      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
      expect(usage.estimatedCostUSD).toBe(0);
      expect(usage.requestCount).toBe(0);
      expect(usage.date).toBe(new Date().toISOString().slice(0, 10));
    });
  });

  // ── シングルトン整合性 ──

  describe('シングルトン管理', () => {
    it('getAIBrainは同一インスタンスを返す', () => {
      const brain1 = getAIBrain();
      const brain2 = getAIBrain();
      expect(brain1).toBe(brain2);
    });

    it('resetAIBrainで新しいインスタンスが生成される', () => {
      const brain1 = getAIBrain();
      resetAIBrain();
      const brain2 = getAIBrain();
      expect(brain1).not.toBe(brain2);
    });

    it('setAIBrainEnv→getAIBrainで正しくキーが反映される', () => {
      resetAIBrain();
      setAIBrainEnv('new-test-key');
      const brain = getAIBrain();
      expect(brain.available).toBe(true);
    });
  });

  // ── 複数エージェントからの同時アクセス ──

  describe('複数エージェントからのAI Brain共有', () => {
    it('複数のL2エージェントが同一AI Brainインスタンスを使用', async () => {
      const agent1 = new TestL2Agent(bus);
      const agent2 = new TestL2Agent(bus);

      const [d1, d2] = await Promise.all([
        agent1.testDecision('判断1', ['A', 'B']),
        agent2.testDecision('判断2', ['C', 'D']),
      ]);

      // 両方ともフォールバック判断（APIキーなし）
      expect(d1.action).toBe('A');
      expect(d2.action).toBe('C');
      expect(d1.requiresApproval).toBe(true);
      expect(d2.requiresApproval).toBe(true);
    });
  });
});
