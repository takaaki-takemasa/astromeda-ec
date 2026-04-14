/**
 * Prompt Templates テスト — 言語中枢の検証
 */
import { describe, it, expect } from 'vitest';
import {
  renderTemplate,
  registerTemplate,
  getTemplate,
  getAllTemplates,
  buildPrompt,
} from '../prompt-templates.js';

describe('renderTemplate', () => {
  it('should replace simple variables', () => {
    const result = renderTemplate('Hello {{name}}, you are {{age}}', {
      name: 'Astromeda',
      age: 5,
    });
    expect(result).toBe('Hello Astromeda, you are 5');
  });

  it('should handle missing variables as empty string', () => {
    const result = renderTemplate('Hello {{name}}', {});
    expect(result).toBe('Hello');
  });

  it('should serialize object variables as JSON', () => {
    const result = renderTemplate('Data: {{data}}', {
      data: { key: 'value' },
    });
    expect(result).toContain('"key": "value"');
  });

  it('should handle conditional blocks (truthy)', () => {
    const result = renderTemplate(
      '{{#if showExtra}}Extra content{{/if}}',
      { showExtra: true },
    );
    expect(result).toBe('Extra content');
  });

  it('should handle conditional blocks (falsy)', () => {
    const result = renderTemplate(
      '{{#if showExtra}}Extra content{{/if}}',
      { showExtra: false },
    );
    expect(result).toBe('');
  });

  it('should handle conditional blocks (undefined)', () => {
    const result = renderTemplate(
      'Before{{#if missing}}Hidden{{/if}}After',
      {},
    );
    expect(result).toBe('BeforeAfter');
  });

  it('should handle each blocks with arrays', () => {
    const result = renderTemplate(
      '{{#each items}}{{index}}. {{item}}{{/each}}',
      { items: ['alpha', 'beta', 'gamma'] },
    );
    expect(result).toContain('1. alpha');
    expect(result).toContain('2. beta');
    expect(result).toContain('3. gamma');
  });

  it('should handle empty array in each', () => {
    const result = renderTemplate(
      '{{#each items}}{{item}}{{/each}}',
      { items: [] },
    );
    expect(result).toBe('');
  });

  it('should handle non-array in each', () => {
    const result = renderTemplate(
      '{{#each items}}{{item}}{{/each}}',
      { items: 'not-an-array' },
    );
    expect(result).toBe('');
  });

  it('should handle boolean false as empty in conditionals', () => {
    const result = renderTemplate(
      '{{#if val}}shown{{/if}}',
      { val: 0 },
    );
    expect(result).toBe('');
  });
});

describe('template registry', () => {
  it('should retrieve built-in agent-decision template', () => {
    const t = getTemplate('agent-decision');
    expect(t).toBeDefined();
    expect(t?.name).toBe('Agent判断');
  });

  it('should retrieve built-in data-analysis template', () => {
    const t = getTemplate('data-analysis');
    expect(t).toBeDefined();
    expect(t?.name).toBe('データ分析');
  });

  it('should retrieve seo-content template', () => {
    const t = getTemplate('seo-content');
    expect(t).toBeDefined();
  });

  it('should retrieve anomaly-report template', () => {
    const t = getTemplate('anomaly-report');
    expect(t).toBeDefined();
  });

  it('should retrieve promotion-suggest template', () => {
    const t = getTemplate('promotion-suggest');
    expect(t).toBeDefined();
  });

  it('should return undefined for non-existent template', () => {
    const t = getTemplate('non-existent');
    expect(t).toBeUndefined();
  });

  it('should list all templates', () => {
    const all = getAllTemplates();
    expect(all.length).toBeGreaterThanOrEqual(5);
  });

  it('should register custom template', () => {
    registerTemplate({
      id: 'test-custom',
      name: 'Test Custom',
      description: 'For testing',
      systemPrompt: 'You are a test assistant.',
      userPromptTemplate: 'Answer: {{question}}',
    });
    const t = getTemplate('test-custom');
    expect(t?.name).toBe('Test Custom');
  });
});

describe('buildPrompt', () => {
  it('should build agent-decision prompt', () => {
    const result = buildPrompt('agent-decision', {
      agentName: 'PromotionAgent',
      agentId: 'promo-1',
      context: 'セール期間中にCVRが低下',
      options: ['割引率を上げる', '広告を強化', '様子を見る'],
    });

    expect(result).not.toBeNull();
    expect(result!.system).toContain('ASTROMEDA');
    expect(result!.user).toContain('PromotionAgent');
    expect(result!.user).toContain('セール期間中にCVRが低下');
    expect(result!.user).toContain('1. 割引率を上げる');
    expect(result!.user).toContain('2. 広告を強化');
    expect(result!.user).toContain('3. 様子を見る');
    expect(result!.maxTokens).toBe(1500);
  });

  it('should build data-analysis prompt', () => {
    const result = buildPrompt('data-analysis', {
      question: '7日間の売上トレンドは？',
      data: { revenue: 1000000, orders: 50 },
    });

    expect(result).not.toBeNull();
    expect(result!.user).toContain('7日間の売上トレンドは？');
    expect(result!.user).toContain('"revenue": 1000000');
  });

  it('should return null for non-existent template', () => {
    const result = buildPrompt('non-existent', {});
    expect(result).toBeNull();
  });

  it('should include conditional data block when present', () => {
    const result = buildPrompt('agent-decision', {
      agentName: 'Test',
      agentId: 'test',
      context: 'test',
      options: ['a'],
      currentData: { key: 'value' },
    });

    expect(result!.user).toContain('現在のデータ');
  });

  it('should exclude conditional data block when absent', () => {
    const result = buildPrompt('agent-decision', {
      agentName: 'Test',
      agentId: 'test',
      context: 'test',
      options: ['a'],
    });

    expect(result!.user).not.toContain('現在のデータ');
  });
});
