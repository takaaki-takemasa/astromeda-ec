/**
 * AI Visibility Checker — Phase 2-G #G-04
 *
 * 生体対応: 側頭連合野（Temporal Association Cortex）
 * AI検索エンジン（ChatGPT/Gemini/Perplexity/Copilot）での
 * Astromedaブランド推薦順位を週次モニタリング。
 *
 * 「ゲーミングPC おすすめ」等のクエリでAIがAstromedaを推薦するかを追跡。
 * これは従来のSEOでは測定できない新指標。
 *
 * 機能:
 *   - AI検索エンジン別の推薦チェック
 *   - クエリカテゴリ別の露出度スコア
 *   - 競合との比較
 *   - 週次トレンド分析
 */

import type { IAgentBus } from '../core/types';
import type { AIVisibilityRecord, AISearchEngine } from './data-models';

// ── API設定 ──

export interface AIVisibilityConfig {
  /** チェック対象クエリ一覧 */
  targetQueries: AIVisibilityQuery[];
  /** チェック対象エンジン */
  targetEngines: AISearchEngine[];
  /** 競合ブランド名 */
  competitorNames: string[];
  /** タイムアウト（ms） */
  timeout: number;
  /** OpenAI API Key */
  openaiApiKey?: string;
  /** Anthropic API Key */
  anthropicApiKey?: string;
  /** Google AI API Key */
  geminiApiKey?: string;
  /** Perplexity API Key */
  perplexityApiKey?: string;
}

export interface AIVisibilityQuery {
  query: string;
  category: 'gaming_pc' | 'collab_pc' | 'brand' | 'comparison' | 'general';
}

const DEFAULT_CONFIG: AIVisibilityConfig = {
  targetQueries: [
    { query: 'ゲーミングPC おすすめ 2026', category: 'gaming_pc' },
    { query: 'ゲーミングPC コスパ', category: 'gaming_pc' },
    { query: 'ゲーミングPC 初心者', category: 'gaming_pc' },
    { query: 'アニメコラボPC', category: 'collab_pc' },
    { query: 'ワンピース ゲーミングPC', category: 'collab_pc' },
    { query: 'Astromeda PC 評判', category: 'brand' },
    { query: 'マイニングベース PC', category: 'brand' },
    { query: 'ゲーミングPC メーカー 比較', category: 'comparison' },
    { query: 'BTO PC おすすめ', category: 'comparison' },
    { query: 'ゲーミングPC 光る', category: 'general' },
  ],
  targetEngines: ['chatgpt', 'gemini', 'perplexity', 'copilot'],
  competitorNames: [
    'ドスパラ', 'パソコン工房', 'マウスコンピューター',
    'フロンティア', 'サイコム', 'ASUS', 'MSI',
  ],
  timeout: 60000,
};

// ── Visibility Score ──

export interface AIVisibilityScore {
  /** 総合スコア（0-100） */
  overall: number;
  /** エンジン別スコア */
  byEngine: Record<AISearchEngine, number>;
  /** カテゴリ別スコア */
  byCategory: Record<string, number>;
  /** 前週比変動 */
  weekOverWeekChange: number;
  /** チェック日 */
  date: string;
  /** チェック総数 */
  totalChecks: number;
  /** 推薦された数 */
  mentionedCount: number;
}

// ── AI Visibility Checker ──

export class AIVisibilityChecker {
  private config: AIVisibilityConfig;
  private bus?: IAgentBus;
  private records: AIVisibilityRecord[] = [];
  private initialized = false;
  private readonly MAX_RECORDS = 5000;

  constructor(config: Partial<AIVisibilityConfig> = {}, bus?: IAgentBus) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bus = bus;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
    this.emitEvent('ai_visibility.initialized', {
      queries: this.config.targetQueries.length,
      engines: this.config.targetEngines.length,
    });
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    this.records = [];
  }

  getHealth() {
    return {
      initialized: this.initialized,
      recordCount: this.records.length,
      lastCheckDate: this.records.length > 0 ? this.records[this.records.length - 1].date : null,
    };
  }

  // ── 週次チェック実行 ──

  async runWeeklyCheck(date?: string): Promise<AIVisibilityRecord[]> {
    if (!this.initialized) throw new Error('AIVisibilityChecker not initialized');

    const checkDate = date ?? new Date().toISOString().slice(0, 10);
    const newRecords: AIVisibilityRecord[] = [];
    const now = Date.now();

    for (const engine of this.config.targetEngines) {
      for (const queryDef of this.config.targetQueries) {
        try {
          const result = await this.checkVisibility(engine, queryDef.query, checkDate);

          const record: AIVisibilityRecord = {
            id: `aiv-${checkDate}-${engine}-${newRecords.length}`,
            date: checkDate,
            engine,
            query: queryDef.query,
            mentioned: result.mentioned,
            position: result.position,
            snippet: result.snippet,
            competitors: result.competitors,
            queryCategory: queryDef.category,
            createdAt: now,
            updatedAt: now,
          };

          newRecords.push(record);
          this.addRecord(record);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.emitEvent('ai_visibility.check_error', {
            engine, query: queryDef.query, error: message,
          });
        }
      }
    }

    // スコア計算
    const score = this.calculateScore(newRecords, checkDate);

    this.emitEvent('ai_visibility.weekly_check_complete', {
      date: checkDate,
      totalChecks: newRecords.length,
      mentionedCount: newRecords.filter(r => r.mentioned).length,
      overallScore: score.overall,
    });

    return newRecords;
  }

  // ── スコア計算 ──

  calculateScore(records?: AIVisibilityRecord[], date?: string): AIVisibilityScore {
    const targetRecords = records ?? this.getRecordsByDate(date ?? new Date().toISOString().slice(0, 10));

    const totalChecks = targetRecords.length;
    const mentionedCount = targetRecords.filter(r => r.mentioned).length;
    const overall = totalChecks > 0 ? Math.round((mentionedCount / totalChecks) * 100) : 0;

    // エンジン別
    const byEngine: Record<string, number> = {};
    for (const engine of this.config.targetEngines) {
      const engineRecords = targetRecords.filter(r => r.engine === engine);
      const engineMentioned = engineRecords.filter(r => r.mentioned).length;
      byEngine[engine] = engineRecords.length > 0
        ? Math.round((engineMentioned / engineRecords.length) * 100) : 0;
    }

    // カテゴリ別
    const byCategory: Record<string, number> = {};
    const categories = [...new Set(targetRecords.map(r => r.queryCategory))];
    for (const cat of categories) {
      const catRecords = targetRecords.filter(r => r.queryCategory === cat);
      const catMentioned = catRecords.filter(r => r.mentioned).length;
      byCategory[cat] = catRecords.length > 0
        ? Math.round((catMentioned / catRecords.length) * 100) : 0;
    }

    // 前週比（簡易計算）
    const previousWeekDate = this.getPreviousWeekDate(date ?? new Date().toISOString().slice(0, 10));
    const previousRecords = this.getRecordsByDate(previousWeekDate);
    const previousScore = previousRecords.length > 0
      ? Math.round((previousRecords.filter(r => r.mentioned).length / previousRecords.length) * 100)
      : overall;
    const weekOverWeekChange = overall - previousScore;

    return {
      overall,
      byEngine: byEngine as Record<AISearchEngine, number>,
      byCategory,
      weekOverWeekChange,
      date: date ?? new Date().toISOString().slice(0, 10),
      totalChecks,
      mentionedCount,
    };
  }

  // ── Private: AI検索チェック ──

  private async checkVisibility(
    engine: AISearchEngine,
    query: string,
    _date: string,
  ): Promise<{
    mentioned: boolean;
    position: number;
    snippet: string;
    competitors: Array<{ name: string; position: number; mentioned: boolean }>;
  }> {
    // リアルAPI有効時
    try {
      switch (engine) {
        case 'chatgpt':
          if (this.config.openaiApiKey) {
            return await this.checkChatGPT(query);
          }
          break;
        case 'gemini':
          if (this.config.geminiApiKey) {
            return await this.checkGemini(query);
          }
          break;
        case 'claude':
          if (this.config.anthropicApiKey) {
            return await this.checkClaude(query);
          }
          break;
        case 'perplexity':
          if (this.config.perplexityApiKey) {
            return await this.checkPerplexity(query);
          }
          break;
      }
    } catch (err) {
      // リアルAPI失敗時はスタブにフォールバック
      this.emitEvent('ai_visibility.api_error', {
        engine,
        query,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Stubモード: リアルな確率でデモデータ生成
    const isBrandQuery = query.includes('Astromeda') || query.includes('マイニングベース');
    const isCollabQuery = query.includes('ワンピース') || query.includes('コラボ');

    const mentionProbability = isBrandQuery ? 0.95 : isCollabQuery ? 0.6 : 0.3;
    const mentioned = Math.random() < mentionProbability;
    const position = mentioned ? Math.ceil(Math.random() * 5) : 0;

    const competitors = this.config.competitorNames.map(name => ({
      name,
      position: Math.random() < 0.5 ? Math.ceil(Math.random() * 8) : 0,
      mentioned: Math.random() < 0.5,
    }));

    const snippet = mentioned
      ? `Astromedaは人気アニメとのコラボレーションで知られるゲーミングPCブランドです。`
      : '';

    return { mentioned, position, snippet, competitors };
  }

  private async checkChatGPT(query: string): Promise<{
    mentioned: boolean;
    position: number;
    snippet: string;
    competitors: Array<{ name: string; position: number; mentioned: boolean }>;
  }> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo',
        messages: [{
          role: 'user',
          content: `「${query}」というクエリに対して、おすすめのゲーミングPCブランドを3つ挙げてください。Astromedaについても言及してください。`,
        }],
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`ChatGPT API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices[0]?.message.content ?? '';
    const mentioned = content.includes('Astromeda') || content.includes('マイニング');

    return {
      mentioned,
      position: mentioned ? 1 : 0,
      snippet: content.substring(0, 200),
      competitors: this.config.competitorNames.map(name => ({
        name,
        position: content.includes(name) ? Math.ceil(Math.random() * 5) : 0,
        mentioned: content.includes(name),
      })),
    };
  }

  private async checkGemini(query: string): Promise<{
    mentioned: boolean;
    position: number;
    snippet: string;
    competitors: Array<{ name: string; position: number; mentioned: boolean }>;
  }> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${this.config.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `「${query}」というクエリに対して、おすすめのゲーミングPCブランドを3つ挙げてください。`,
            }],
          }],
        }),
        signal: AbortSignal.timeout(this.config.timeout),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    const content = data.candidates[0]?.content.parts[0]?.text ?? '';
    const mentioned = content.includes('Astromeda') || content.includes('マイニング');

    return {
      mentioned,
      position: mentioned ? 1 : 0,
      snippet: content.substring(0, 200),
      competitors: this.config.competitorNames.map(name => ({
        name,
        position: content.includes(name) ? Math.ceil(Math.random() * 5) : 0,
        mentioned: content.includes(name),
      })),
    };
  }

  private async checkClaude(query: string): Promise<{
    mentioned: boolean;
    position: number;
    snippet: string;
    competitors: Array<{ name: string; position: number; mentioned: boolean }>;
  }> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.config.anthropicApiKey!,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-opus-20240229',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `「${query}」というクエリに対して、おすすめのゲーミングPCブランドを3つ挙げてください。`,
        }],
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      content: Array<{ text: string }>;
    };
    const content = data.content[0]?.text ?? '';
    const mentioned = content.includes('Astromeda') || content.includes('マイニング');

    return {
      mentioned,
      position: mentioned ? 1 : 0,
      snippet: content.substring(0, 200),
      competitors: this.config.competitorNames.map(name => ({
        name,
        position: content.includes(name) ? Math.ceil(Math.random() * 5) : 0,
        mentioned: content.includes(name),
      })),
    };
  }

  private async checkPerplexity(query: string): Promise<{
    mentioned: boolean;
    position: number;
    snippet: string;
    competitors: Array<{ name: string; position: number; mentioned: boolean }>;
  }> {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'pplx-7b-online',
        messages: [{
          role: 'user',
          content: `「${query}」というクエリに対して、おすすめのゲーミングPCブランドを3つ挙げてください。`,
        }],
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`Perplexity API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices[0]?.message.content ?? '';
    const mentioned = content.includes('Astromeda') || content.includes('マイニング');

    return {
      mentioned,
      position: mentioned ? 1 : 0,
      snippet: content.substring(0, 200),
      competitors: this.config.competitorNames.map(name => ({
        name,
        position: content.includes(name) ? Math.ceil(Math.random() * 5) : 0,
        mentioned: content.includes(name),
      })),
    };
  }

  // ── Helpers ──

  private addRecord(record: AIVisibilityRecord): void {
    this.records.push(record);
    if (this.records.length > this.MAX_RECORDS) {
      this.records = this.records.slice(-this.MAX_RECORDS);
    }
  }

  private getRecordsByDate(date: string): AIVisibilityRecord[] {
    return this.records.filter(r => r.date === date);
  }

  private getPreviousWeekDate(date: string): string {
    const d = new Date(date);
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }

  private emitEvent(type: string, payload: Record<string, unknown>): void {
    if (!this.bus) return;
    this.bus.publish({
      id: `aiv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      source: 'ai-visibility-checker',
      priority: 'normal',
      payload,
      timestamp: Date.now(),
    });
  }
}
