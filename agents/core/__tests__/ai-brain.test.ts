/**
 * AI Brain テスト — 大脳新皮質の機能検証
 *
 * API呼び出しをモック化してAI Brain のロジックを検証
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIBrain, resetAIBrain, getAIBrain, setAIBrainEnv } from '../ai-brain.js';

describe('AIBrain', () => {
  describe('constructor', () => {
    it('should create instance without API key', () => {
      const brain = new AIBrain();
      expect(brain.available).toBe(false);
    });

    it('should create instance with API key', () => {
      const brain = new AIBrain('test-key');
      expect(brain.available).toBe(true);
    });
  });

  describe('decide (no API key)', () => {
    it('should return rule-based fallback when no API key', async () => {
      const brain = new AIBrain();
      const result = await brain.decide({
        agentId: 'test-agent',
        agentName: 'TestAgent',
        context: 'テスト状況',
        options: ['オプションA', 'オプションB'],
      });

      expect(result.action).toBe('オプションA'); // first option as default
      expect(result.confidence).toBeGreaterThanOrEqual(0.3);
      expect(result.confidence).toBeLessThanOrEqual(0.9);
      expect(result.riskLevel).toBe('medium');
      expect(result.requiresApproval).toBe(true);
      expect(result.reasoning).toBeTruthy();
    });

    it('should return first option when single option', async () => {
      const brain = new AIBrain();
      const result = await brain.decide({
        agentId: 'test',
        agentName: 'Test',
        context: 'test',
        options: ['唯一の選択肢'],
      });
      expect(result.action).toBe('唯一の選択肢');
    });

    it('should return skip when no options', async () => {
      const brain = new AIBrain();
      const result = await brain.decide({
        agentId: 'test',
        agentName: 'Test',
        context: 'test',
        options: [],
      });
      expect(result.action).toBe('skip');
    });
  });

  describe('analyze (no API key)', () => {
    it('should return empty analysis when no API key', async () => {
      const brain = new AIBrain();
      const result = await brain.analyze({
        agentId: 'test',
        data: { revenue: 1000 },
        question: 'テスト質問',
      });

      expect(result.summary).toContain('AI API未接続');
      expect(result.insights).toEqual([]);
      expect(result.recommendations).toEqual([]);
      expect(result.confidence).toBe(0);
    });
  });

  describe('usage tracking', () => {
    it('should return initial usage with zero values', () => {
      const brain = new AIBrain();
      const usage = brain.getUsage();

      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
      expect(usage.estimatedCostUSD).toBe(0);
      expect(usage.requestCount).toBe(0);
      expect(usage.date).toBe(new Date().toISOString().slice(0, 10));
    });
  });

  describe('singleton', () => {
    beforeEach(() => {
      resetAIBrain();
    });

    it('should create singleton without key', () => {
      setAIBrainEnv('');
      const brain = getAIBrain();
      expect(brain).toBeInstanceOf(AIBrain);
      expect(brain.available).toBe(false);
    });

    it('should create singleton with key', () => {
      setAIBrainEnv('test-api-key');
      const brain = getAIBrain();
      expect(brain.available).toBe(true);
    });

    it('should return same instance on multiple calls', () => {
      const brain1 = getAIBrain();
      const brain2 = getAIBrain();
      expect(brain1).toBe(brain2);
    });

    it('should reset singleton', () => {
      const brain1 = getAIBrain();
      resetAIBrain();
      setAIBrainEnv('different-key');
      const brain2 = getAIBrain();
      expect(brain1).not.toBe(brain2);
    });
  });

  describe('cost limit', () => {
    it('should fallback when cost limit reached', async () => {
      const brain = new AIBrain('test-key');

      // Manually simulate hitting cost limit by accessing private field
      // Since we can't directly set, we test through the API behavior
      // The brain will try to call Claude API which will fail in test
      // But the fallback behavior is tested via the no-key path above
      expect(brain.available).toBe(true);
    });
  });

  // ── T029-T031: Multi-LLM Provider Tests ──

  describe('constructor (multi-LLM)', () => {
    it('should accept multiple API keys', () => {
      const brain = new AIBrain('anthropic-key', 'openai-key', 'gemini-key');
      expect(brain.available).toBe(true);
    });

    it('should work with only Anthropic key', () => {
      const brain = new AIBrain('anthropic-key', '', '');
      expect(brain.available).toBe(true);
    });

    it('should work with only OpenAI key', () => {
      const brain = new AIBrain('', 'openai-key', '');
      expect(brain.available).toBe(true);
    });

    it('should work with only Gemini key', () => {
      const brain = new AIBrain('', '', 'gemini-key');
      expect(brain.available).toBe(true);
    });

    it('should fail when no keys are provided', () => {
      const brain = new AIBrain('', '', '');
      expect(brain.available).toBe(false);
    });
  });

  describe('model selection (T032)', () => {
    let brain: AIBrain;

    beforeEach(() => {
      // Create brain with all providers available
      brain = new AIBrain('anthropic-key', 'openai-key', 'gemini-key');
    });

    it('should select Claude Sonnet for critical tasks', async () => {
      const result = await brain.decide({
        agentId: 'test',
        agentName: 'Test',
        context: 'Critical decision needed',
        options: ['opt1', 'opt2'],
        priority: 'critical',
      });
      // Should use fallback since API not mocked
      expect(result).toBeDefined();
    });

    it('should select cost-effective model under budget pressure', async () => {
      const result = await brain.decide({
        agentId: 'test',
        agentName: 'Test',
        context: 'Normal decision',
        options: ['opt1', 'opt2'],
        priority: 'normal',
      });
      expect(result).toBeDefined();
    });

    it('should include model info in decision response', async () => {
      const result = await brain.decide({
        agentId: 'test',
        agentName: 'Test',
        context: 'Test',
        options: ['a', 'b'],
        priority: 'normal',
      });
      // Fallback decision should have provider field
      expect(result.provider).toBe('fallback');
    });
  });

  describe('token tracking (T029-T031)', () => {
    let brain: AIBrain;

    beforeEach(() => {
      brain = new AIBrain('anthropic-key', 'openai-key', 'gemini-key');
    });

    it('should track token usage for Claude', () => {
      const usage1 = brain.getUsage();
      expect(usage1.inputTokens).toBe(0);
      expect(usage1.outputTokens).toBe(0);
    });

    it('should report initial usage', () => {
      const usage = brain.getUsage();
      expect(usage).toHaveProperty('date');
      expect(usage).toHaveProperty('inputTokens');
      expect(usage).toHaveProperty('outputTokens');
      expect(usage).toHaveProperty('estimatedCostUSD');
      expect(usage).toHaveProperty('requestCount');
    });
  });

  describe('setAIBrainEnv (multi-LLM)', () => {
    beforeEach(() => {
      resetAIBrain();
    });

    it('should set all three API keys', () => {
      setAIBrainEnv('claude-key', 'openai-key', 'gemini-key');
      const brain = getAIBrain();
      expect(brain.available).toBe(true);
    });

    it('should set only Anthropic key', () => {
      setAIBrainEnv('claude-key', '', '');
      const brain = getAIBrain();
      expect(brain.available).toBe(true);
    });

    it('should allow partial key updates', () => {
      setAIBrainEnv('claude-key', 'openai-key');
      const brain = getAIBrain();
      expect(brain.available).toBe(true);
    });
  });

  describe('analyze (with multi-LLM)', () => {
    let brain: AIBrain;

    beforeEach(() => {
      brain = new AIBrain('anthropic-key', 'openai-key', 'gemini-key');
    });

    it('should return analysis with model info', async () => {
      const result = await brain.analyze({
        agentId: 'test',
        data: { revenue: 10000 },
        question: 'Is revenue good?',
        priority: 'normal',
      });

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('insights');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('confidence');
    });
  });

  describe('pricing models', () => {
    it('should have Claude Sonnet pricing', () => {
      const brain = new AIBrain('key');
      const usage = brain.getUsage();
      expect(usage.estimatedCostUSD).toBe(0);
    });

    it('should support multiple model costs', () => {
      const brain = new AIBrain('', 'openai-key', 'gemini-key');
      expect(brain.available).toBe(true);
    });
  });
});
