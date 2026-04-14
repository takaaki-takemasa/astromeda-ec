/**
 * AI Brain — Claude API統合（大脳新皮質=高次認知・判断・言語処理）
 *
 * 医学的メタファー: 大脳新皮質（Neocortex）
 * 反射だけでは対応できない複雑な判断をAI（Claude）に委ねる。
 * これは人間の「考える」プロセスと同じ。
 *
 * 設計原則:
 * 1. 環境変数駆動 — ANTHROPIC_API_KEY未設定時は判断スキップ
 * 2. 承認キュー連携 — 高リスク判断はApprovalQueueに送る
 * 3. コスト管理 — トークン使用量の追跡と上限設定
 * 4. フォールバック — API障害時はルールベース判断にフォールバック
 *
 * Oxygen制約: 30秒以内にレスポンスを返す必要がある
 * → streaming不可、最大3000トークンのレスポンスに制限
 */

import { getApprovalQueue } from './approval-queue.js';
import type { ApprovalRequest } from './approval-queue.js';
import type { EventPriority } from './types.js';
import { getCircuitBreaker, CircuitOpenError } from './circuit-breaker.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('ai-brain');


// ── 3-04: モデル別料金表（動的コスト計算） ──
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3,    output: 15    },  // Claude Sonnet
  'claude-haiku-4-5-20251001': { input: 0.25, output: 1.25  },  // Claude Haiku
  'gpt-4o-mini':    { input: 0.15, output: 0.60  },  // OpenAI GPT-4o mini
  'gpt-4o':         { input: 2.5,  output: 10    },  // OpenAI GPT-4o
  'gemini-2.0-flash': { input: 0.075, output: 0.30 },  // Gemini Flash
  'gemini-2.0-flash-lite': { input: 0.0375, output: 0.15 },  // Gemini Flash Lite
  'gemini-2.0-pro': { input: 1.25, output: 5.0 },  // Gemini Pro
};

// ── 型定義 ──

export interface AIDecision {
  action: string;
  reasoning: string;           // AIの判断理由（日本語）
  confidence: number;          // 0.0-1.0
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiresApproval: boolean;   // true=承認キューへ送る
  suggestedParams?: Record<string, unknown>;
  approvalRequestId?: string;  // 承認キューに送った場合のID
  model?: string;              // 使用したモデル
  provider?: 'claude' | 'openai' | 'gemini' | 'fallback';
}

export interface AIAnalysis {
  summary: string;             // 分析サマリー（日本語）
  insights: string[];          // 発見事項
  recommendations: string[];   // 推奨アクション
  confidence: number;
  dataPoints: number;
  tokensUsed: number;
  model?: string;
  provider?: 'claude' | 'openai' | 'gemini' | 'fallback';
}

export interface ModelSelection {
  model: string;
  provider: 'claude' | 'openai' | 'gemini' | 'fallback';
  estimatedCost: number;
  reason: string;
}

interface AIBrainConfig {
  anthropicApiKey: string;
  openaiApiKey: string;
  geminiApiKey: string;
  primaryModel: string;
  maxTokens: number;
  costLimitPerDay: number;     // USD
  autoApproveThreshold: number; // この信頼度以上なら自動承認
}

interface TokenUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUSD: number;
  requestCount: number;
  modelUsage?: Record<string, { count: number; cost: number }>;
}

// ── AI Brain クラス ──

export class AIBrain {
  private config: AIBrainConfig;
  private isConfigured: boolean;
  private dailyUsage: TokenUsage;
  private _costResetScheduled = false;
  private claudeBreaker: any;
  private openaiBreaker: any;
  private geminiBreaker: any;

  constructor(
    anthropicApiKey?: string,
    openaiApiKey?: string,
    geminiApiKey?: string,
  ) {
    this.config = {
      anthropicApiKey: anthropicApiKey || process.env.ANTHROPIC_API_KEY || '',
      openaiApiKey: openaiApiKey || process.env.OPENAI_API_KEY || '',
      geminiApiKey: geminiApiKey || process.env.GEMINI_API_KEY || '',
      primaryModel: 'claude-sonnet-4-20250514',
      maxTokens: 2000,
      costLimitPerDay: 5.0,  // $5/day上限
      autoApproveThreshold: 0.85,
    };
    this.isConfigured = !!(
      this.config.anthropicApiKey ||
      this.config.openaiApiKey ||
      this.config.geminiApiKey
    );
    this.dailyUsage = this.initDailyUsage();

    // Initialize circuit breakers for each provider
    this.claudeBreaker = getCircuitBreaker('claude-api', {
      failureThreshold: 5,
      recoveryTimeMs: 30000,
    });
    this.openaiBreaker = getCircuitBreaker('openai-api', {
      failureThreshold: 5,
      recoveryTimeMs: 30000,
    });
    this.geminiBreaker = getCircuitBreaker('gemini-api', {
      failureThreshold: 5,
      recoveryTimeMs: 30000,
    });
  }

  get available(): boolean {
    return this.isConfigured;
  }

  /**
   * T032: 動的モデル選択ロジック
   * タスク優先度・コスト・Circuit Breakerの状態に基づいてモデルを選択
   */
  private selectModel(taskPriority: EventPriority = 'normal'): ModelSelection {
    // Circuit Breaker状態を確認
    let claudeAvailable = !this.claudeBreaker.isOpen && !!this.config.anthropicApiKey;
    let openaiAvailable = !this.openaiBreaker.isOpen && !!this.config.openaiApiKey;
    let geminiAvailable = !this.geminiBreaker.isOpen && !!this.config.geminiApiKey;

    // コスト残額の確認
    const costRemaining = this.config.costLimitPerDay - this.dailyUsage.estimatedCostUSD;
    const costUsagePercent = (this.dailyUsage.estimatedCostUSD / this.config.costLimitPerDay) * 100;

    // タスク優先度に基づく優先モデル選択
    switch (taskPriority) {
      case 'critical':
        // 最高精度が必要 → Claude Sonnet が優先
        if (claudeAvailable) {
          return {
            model: 'claude-sonnet-4-20250514',
            provider: 'claude',
            estimatedCost: 0.003,
            reason: 'Critical task requires highest accuracy',
          };
        }
        if (openaiAvailable && costRemaining > 0.01) {
          return {
            model: 'gpt-4o',
            provider: 'openai',
            estimatedCost: 0.0025,
            reason: 'Claude unavailable, using GPT-4o',
          };
        }
        break;

      case 'high':
        // 高精度が必要だが、コスト最適化
        if (costUsagePercent > 80) {
          // 80%以上使用済み → 低コストに
          if (geminiAvailable && costRemaining > 0.0005) {
            return {
              model: 'gemini-2.0-flash-lite',
              provider: 'gemini',
              estimatedCost: 0.0001,
              reason: 'Cost limit approaching, using Gemini Flash Lite',
            };
          }
        }
        if (claudeAvailable) {
          return {
            model: 'claude-haiku-4-5-20251001',
            provider: 'claude',
            estimatedCost: 0.0005,
            reason: 'High priority with cost optimization',
          };
        }
        if (openaiAvailable && costRemaining > 0.003) {
          return {
            model: 'gpt-4o-mini',
            provider: 'openai',
            estimatedCost: 0.0003,
            reason: 'Claude unavailable, using GPT-4o mini',
          };
        }
        break;

      case 'normal':
      default:
        // 標準 → コスト効率重視
        if (costUsagePercent > 60) {
          // 60%以上使用済み → 最低コストに
          if (geminiAvailable && costRemaining > 0.0001) {
            return {
              model: 'gemini-2.0-flash-lite',
              provider: 'gemini',
              estimatedCost: 0.00005,
              reason: 'Cost optimization, using Gemini Flash Lite',
            };
          }
        }
        if (geminiAvailable && costRemaining > 0.0005) {
          return {
            model: 'gemini-2.0-flash',
            provider: 'gemini',
            estimatedCost: 0.0001,
            reason: 'Normal priority, cost-effective Gemini',
          };
        }
        if (claudeAvailable) {
          return {
            model: 'claude-haiku-4-5-20251001',
            provider: 'claude',
            estimatedCost: 0.0002,
            reason: 'Standard task, using Claude Haiku',
          };
        }
        if (openaiAvailable && costRemaining > 0.0002) {
          return {
            model: 'gpt-4o-mini',
            provider: 'openai',
            estimatedCost: 0.00015,
            reason: 'Claude unavailable, using GPT-4o mini',
          };
        }
        break;

      case 'low':
        // 低優先度 → 最低コスト
        if (costUsagePercent > 40) {
          if (geminiAvailable) {
            return {
              model: 'gemini-2.0-flash-lite',
              provider: 'gemini',
              estimatedCost: 0.00005,
              reason: 'Low priority, minimal cost',
            };
          }
        }
        if (geminiAvailable && costRemaining > 0.0001) {
          return {
            model: 'gemini-2.0-flash',
            provider: 'gemini',
            estimatedCost: 0.00008,
            reason: 'Low priority, cost minimized',
          };
        }
        break;
    }

    // フォールバック: すべてのプロバイダが利用不可またはコスト上限
    return {
      model: 'fallback',
      provider: 'fallback',
      estimatedCost: 0,
      reason: 'All LLM providers unavailable or cost limit reached',
    };
  }

  /**
   * AI判断を要求する
   * Agent/Pipelineが「次にどうすべきか」をAIに聞く（モデル自動選択）
   */
  async decide(params: {
    agentId: string;
    agentName: string;
    context: string;           // 状況説明
    options: string[];         // 選択肢
    currentData?: Record<string, unknown>;
    category?: ApprovalRequest['category'];
    priority?: EventPriority;  // T032: タスク優先度
  }): Promise<AIDecision> {
    // API未設定 → ルールベースフォールバック
    if (!this.isConfigured) {
      return this.ruleBasedDecision(params);
    }

    // 3-03: コスト上限チェック → キュー待ち（即座にルールフォールバックせず保留）
    if (this.dailyUsage.estimatedCostUSD >= this.config.costLimitPerDay) {
      // コスト上限到達時はルールベースで処理するが、60秒後にリセット予約
      if (!this._costResetScheduled) {
        this._costResetScheduled = true;
        setTimeout(() => {
          this._costResetScheduled = false;
          // 日付が変わっていればリセット
          const today = new Date().toISOString().slice(0, 10);
          if (this.dailyUsage.date !== today) {
            this.dailyUsage = this.initDailyUsage();
          }
        }, 60_000);
      }
      return this.ruleBasedDecision({ ...params, context: params.context, category: params.category });
    }

    try {
      const systemPrompt = `あなたはASTROMEDA ECサイトのAI運用アシスタントです。
ゲーミングPCブランド「Astromeda」のECサイトの自律運用を支援します。
回答は常に日本語で、非エンジニアのオーナーにもわかりやすく。
判断は保守的に。不確実な場合は人間の承認を推奨してください。`;

      const userPrompt = `Agent「${params.agentName}」(ID: ${params.agentId})からの判断要求:

状況: ${params.context}

選択肢:
${params.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}

${params.currentData ? `現在のデータ:\n${JSON.stringify(params.currentData, null, 2)}` : ''}

以下のJSON形式で回答してください:
{
  "action": "選択した選択肢の番号または具体的なアクション名",
  "reasoning": "判断理由（日本語、オーナー向け）",
  "confidence": 0.0〜1.0の信頼度,
  "riskLevel": "low/medium/high/critical",
  "requiresApproval": true/false（人間の承認が必要か）
}`;

      // T032: 動的モデル選択
      const modelSelection = this.selectModel(params.priority || 'normal');

      if (modelSelection.provider === 'fallback') {
        return this.ruleBasedDecision(params);
      }

      let response: string;
      if (modelSelection.provider === 'claude') {
        response = await this.callClaudeAPI(systemPrompt, userPrompt);
      } else if (modelSelection.provider === 'openai') {
        response = await this.callOpenAI(userPrompt, { systemPrompt });
      } else if (modelSelection.provider === 'gemini') {
        response = await this.callGemini(userPrompt, { systemPrompt });
      } else {
        return this.ruleBasedDecision(params);
      }

      const decision = this.parseDecision(response, params);
      decision.model = modelSelection.model;
      decision.provider = modelSelection.provider;

      // 高リスクまたは信頼度低 → 承認キューへ
      if (decision.requiresApproval || decision.confidence < this.config.autoApproveThreshold) {
        const queue = getApprovalQueue();
        const approval = await queue.createRequest({
          agentId: params.agentId,
          agentName: params.agentName,
          action: decision.action,
          description: `${decision.reasoning}\n\n信頼度: ${(decision.confidence * 100).toFixed(0)}%\nモデル: ${decision.model}`,
          priority: decision.riskLevel === 'critical' ? 'critical' : decision.riskLevel === 'high' ? 'high' : 'normal',
          category: params.category || 'operations',
          payload: { decision, originalContext: params.context },
          estimatedImpact: decision.reasoning,
        });
        decision.approvalRequestId = approval.id;
        decision.requiresApproval = true;
      }

      return decision;
    } catch (error) {
      log.error('[AIBrain] LLM API error:', error);
      return this.ruleBasedDecision(params);
    }
  }

  /**
   * データ分析を要求する
   */
  async analyze(params: {
    agentId: string;
    data: Record<string, unknown>;
    question: string;
    priority?: EventPriority;
  }): Promise<AIAnalysis> {
    if (!this.isConfigured) {
      return {
        summary: 'AI API未接続のため分析をスキップしました',
        insights: [],
        recommendations: [],
        confidence: 0,
        dataPoints: 0,
        tokensUsed: 0,
        provider: 'fallback',
      };
    }

    if (this.dailyUsage.estimatedCostUSD >= this.config.costLimitPerDay) {
      return {
        summary: '本日のAI利用上限に達しました',
        insights: [],
        recommendations: [],
        confidence: 0,
        dataPoints: 0,
        tokensUsed: 0,
        provider: 'fallback',
      };
    }

    try {
      const systemPrompt = `あなたはASTROMEDA ECサイトのデータ分析AIです。
売上データ、アクセスデータ、在庫データを分析し、
非エンジニアのオーナーにもわかる日本語で回答します。
具体的な数字と改善提案を含めてください。`;

      const userPrompt = `以下のデータを分析してください:

質問: ${params.question}

データ:
${JSON.stringify(params.data, null, 2)}

以下のJSON形式で回答:
{
  "summary": "分析サマリー",
  "insights": ["発見1", "発見2"],
  "recommendations": ["推奨アクション1", "推奨アクション2"],
  "confidence": 0.0〜1.0
}`;

      // T032: 動的モデル選択（分析は通常優先度）
      const modelSelection = this.selectModel(params.priority || 'normal');

      let response: string;
      if (modelSelection.provider === 'claude') {
        response = await this.callClaudeAPI(systemPrompt, userPrompt);
      } else if (modelSelection.provider === 'openai') {
        response = await this.callOpenAI(userPrompt, { systemPrompt });
      } else if (modelSelection.provider === 'gemini') {
        response = await this.callGemini(userPrompt, { systemPrompt });
      } else {
        throw new Error('No LLM available for analysis');
      }

      const analysis = this.parseAnalysis(response);
      analysis.model = modelSelection.model;
      analysis.provider = modelSelection.provider;
      return analysis;
    } catch (error) {
      log.error('[AIBrain] Analysis error:', error);
      return {
        summary: 'AI分析中にエラーが発生しました',
        insights: [],
        recommendations: [],
        confidence: 0,
        dataPoints: 0,
        tokensUsed: 0,
        provider: 'fallback',
      };
    }
  }

  /**
   * 使用量統計
   */
  getUsage(): TokenUsage {
    return { ...this.dailyUsage };
  }

  // ── API呼び出し（複数LLMプロバイダ対応） ──

  /**
   * T029: Claude API呼び出し（Anthropic公式エンドポイント）
   */
  private async callClaudeAPI(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.claudeBreaker.execute(async () => {
      return this.callClaudeAPIInternal(systemPrompt, userPrompt);
    });
  }

  private async callClaudeAPIInternal(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.config.anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: this.config.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errorText}`);
    }

    const result = await response.json() as {
      content: Array<{ type: string; text: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    // トークン使用量追跡
    this.trackTokenUsage('claude-sonnet-4-20250514', result.usage);

    const textContent = result.content.find(c => c.type === 'text');
    return textContent?.text || '';
  }

  /**
   * T030: OpenAI GPT-4o API呼び出し
   * fetch to https://api.openai.com/v1/chat/completions
   */
  async callOpenAI(
    prompt: string,
    options?: { systemPrompt?: string; maxTokens?: number },
  ): Promise<string> {
    return this.openaiBreaker.execute(async () => {
      return this.callOpenAIInternal(prompt, options);
    });
  }

  private async callOpenAIInternal(
    prompt: string,
    options?: { systemPrompt?: string; maxTokens?: number },
  ): Promise<string> {
    if (!this.config.openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const systemPrompt = options?.systemPrompt || 'You are a helpful AI assistant for business operations.';
    const maxTokens = options?.maxTokens || this.config.maxTokens;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: maxTokens,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }

    const result = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    // トークン使用量追跡
    this.trackTokenUsage('gpt-4o-mini', {
      input_tokens: result.usage.prompt_tokens,
      output_tokens: result.usage.completion_tokens,
    });

    return result.choices[0]?.message?.content || '';
  }

  /**
   * T031: Google Gemini API呼び出し
   * fetch to https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent
   */
  async callGemini(
    prompt: string,
    options?: { systemPrompt?: string; maxTokens?: number },
  ): Promise<string> {
    return this.geminiBreaker.execute(async () => {
      return this.callGeminiInternal(prompt, options);
    });
  }

  private async callGeminiInternal(
    prompt: string,
    options?: { systemPrompt?: string; maxTokens?: number },
  ): Promise<string> {
    if (!this.config.geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const systemPrompt = options?.systemPrompt || 'You are a helpful AI assistant for business operations.';
    const maxTokens = options?.maxTokens || this.config.maxTokens;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.config.geminiApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemPrompt },
              ],
            },
            {
              parts: [
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: maxTokens,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errorText}`);
    }

    const result = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      };
    };

    // トークン使用量追跡
    this.trackTokenUsage('gemini-2.0-flash', {
      input_tokens: result.usageMetadata?.promptTokenCount || 0,
      output_tokens: result.usageMetadata?.candidatesTokenCount || 0,
    });

    const content = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return content;
  }

  /**
   * トークン使用量を追跡・コスト計算
   */
  private trackTokenUsage(
    model: string,
    usage: { input_tokens: number; output_tokens: number },
  ): void {
    this.dailyUsage.inputTokens += usage.input_tokens;
    this.dailyUsage.outputTokens += usage.output_tokens;
    this.dailyUsage.requestCount++;

    // モデル別コスト計算
    const costs = MODEL_COSTS[model] || { input: 0, output: 0 };
    const cost =
      (usage.input_tokens / 1_000_000) * costs.input +
      (usage.output_tokens / 1_000_000) * costs.output;

    this.dailyUsage.estimatedCostUSD += cost;

    // モデル使用統計を初期化（必要に応じて）
    if (!this.dailyUsage.modelUsage) {
      this.dailyUsage.modelUsage = {};
    }

    // モデル別統計を更新
    if (!this.dailyUsage.modelUsage[model]) {
      this.dailyUsage.modelUsage[model] = { count: 0, cost: 0 };
    }
    this.dailyUsage.modelUsage[model].count++;
    this.dailyUsage.modelUsage[model].cost += cost;

    log.info(`[AIBrain] Model: ${model}, Tokens: ${usage.input_tokens}+${usage.output_tokens}, Cost: $${cost.toFixed(4)}`);
  }

  // ── パース ──

  /**
   * 3-01: parseDecision — regex→JSON.parse安全化
   * AI応答からJSON部分を抽出し、構造化された判断を返す。
   * 旧実装: 貪欲regex /\{[\s\S]*\}/ で最外周JSON抽出 → ネストJSON誤マッチのリスク
   * 新実装: まずtrim()でJSON.parseを試行 → 失敗時のみ先頭/末尾の非JSON文字を削除してリトライ
   */
  private parseDecision(
    response: string,
    params: { agentId: string; agentName: string; options: string[] },
  ): AIDecision {
    try {
      let parsed: Record<string, unknown>;

      // Step 1: そのままJSON.parseを試行（最も安全）
      const trimmed = response.trim();
      try {
        parsed = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        // Step 2: 先頭/末尾の非JSONテキストを除去してリトライ
        const firstBrace = trimmed.indexOf('{');
        const lastBrace = trimmed.lastIndexOf('}');
        if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
          throw new Error('No JSON object found in response');
        }
        const jsonCandidate = trimmed.slice(firstBrace, lastBrace + 1);
        parsed = JSON.parse(jsonCandidate) as Record<string, unknown>;
      }

      return {
        action: String(parsed.action || params.options[0] || 'skip'),
        reasoning: String(parsed.reasoning || 'AI判断理由なし'),
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
        riskLevel: (['low', 'medium', 'high', 'critical'].includes(String(parsed.riskLevel))
          ? String(parsed.riskLevel)
          : 'medium') as AIDecision['riskLevel'],
        requiresApproval: parsed.requiresApproval === true,
      };
    } catch {
      return {
        action: 'skip',
        reasoning: 'AI応答の解析に失敗。安全のため操作をスキップします。',
        confidence: 0.1,
        riskLevel: 'high',
        requiresApproval: true,
      };
    }
  }

  private parseAnalysis(response: string): AIAnalysis {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON');

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      return {
        summary: String(parsed.summary || ''),
        insights: Array.isArray(parsed.insights) ? parsed.insights.map(String) : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
        dataPoints: 0,
        tokensUsed: this.dailyUsage.inputTokens + this.dailyUsage.outputTokens,
      };
    } catch {
      return {
        summary: 'AI応答の解析に失敗しました',
        insights: [],
        recommendations: [],
        confidence: 0,
        dataPoints: 0,
        tokensUsed: 0,
      };
    }
  }

  // ── ルールベースフォールバック ──

  /**
   * 3-02: ルールベース判断を実ルール化
   * AI API未接続時でも、カテゴリ別に適切な判断を返す。
   * 常にconfidence: 0.3で人間承認を要求 → 安全側に倒す。
   */
  private ruleBasedDecision(params: {
    agentId: string;
    agentName: string;
    options: string[];
    context?: string;
    category?: string;
  }): AIDecision {
    const category = params.category || '';
    const context = params.context || '';

    // カテゴリ別ルール（3-02: switch文で明示的判断）
    if (category === 'pricing' || params.agentId.includes('pricing')) {
      // 価格変更 > 20% → 拒否（リスク高）
      const changeMatch = context.match(/(\d+)%/);
      if (changeMatch && parseInt(changeMatch[1], 10) > 20) {
        return {
          action: 'reject',
          reasoning: '20%を超える価格変更は自動承認できません。管理者の確認が必要です。',
          confidence: 0.8,
          riskLevel: 'high',
          requiresApproval: true,
          provider: 'fallback',
        };
      }
    }

    if (category === 'content' || params.agentId.includes('content')) {
      // コンテンツ生成 → 承認付き許可
      return {
        action: params.options.find(o => o === 'approve' || o === 'generate') || params.options[0] || 'skip',
        reasoning: 'コンテンツ生成はルールベースで許可しますが、公開前に確認が必要です。',
        confidence: 0.7,
        riskLevel: 'medium',
        requiresApproval: true,
        provider: 'fallback',
      };
    }

    if (category === 'inventory' || params.agentId.includes('inventory')) {
      // 在庫10未満 → アラート
      const stockMatch = context.match(/在庫[：:]?\s*(\d+)/);
      if (stockMatch && parseInt(stockMatch[1], 10) < 10) {
        return {
          action: 'alert',
          reasoning: '在庫が10未満です。補充を検討してください。',
          confidence: 0.9,
          riskLevel: 'high',
          requiresApproval: false,
          provider: 'fallback',
        };
      }
    }

    // デフォルト: 安全側に倒す
    return {
      action: params.options[0] || 'skip',
      reasoning: 'AI API未接続のため、ルールベース判断です。人間の承認を推奨します。',
      confidence: 0.3,
      riskLevel: 'medium',
      requiresApproval: true,
      provider: 'fallback',
    };
  }

  private initDailyUsage(): TokenUsage {
    return {
      date: new Date().toISOString().slice(0, 10),
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUSD: 0,
      requestCount: 0,
    };
  }
}

// ── シングルトン ──

let aiBrainInstance: AIBrain | null = null;
let brainAnthropicKey = '';
let brainOpenaiKey = '';
let brainGeminiKey = '';

/**
 * 環境変数からAI Brainを初期化
 */
export function setAIBrainEnv(
  anthropicKey?: string,
  openaiKey?: string,
  geminiKey?: string,
): void {
  brainAnthropicKey = anthropicKey || process.env.ANTHROPIC_API_KEY || '';
  brainOpenaiKey = openaiKey || process.env.OPENAI_API_KEY || '';
  brainGeminiKey = geminiKey || process.env.GEMINI_API_KEY || '';
}

export function getAIBrain(): AIBrain {
  if (!aiBrainInstance) {
    aiBrainInstance = new AIBrain(brainAnthropicKey, brainOpenaiKey, brainGeminiKey);
  }
  return aiBrainInstance;
}

export function resetAIBrain(): void {
  aiBrainInstance = null;
}
