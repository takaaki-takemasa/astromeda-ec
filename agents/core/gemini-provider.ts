/**
 * Gemini Provider — Google Gemini API 統合（補助大脳）
 *
 * 医学的メタファー: 大脳の補助野（補助皮質）
 * Claude が利用不可の場合、Google Gemini に判断を委ねる。
 * fetch() を使用して、@google/generative-ai SDK に依存しない。
 *
 * 設計原則:
 * 1. Edge環境対応 — Oxygen/Cloudflare Workersで動作
 * 2. 環境変数駆動 — GEMINI_API_KEY 未設定時はフォールバック
 * 3. モデルの層別 — flash (軽量) / flash-lite (超軽量) / pro (高精度)
 * 4. トークン追跡 — API使用量の管理
 */

import { createLogger } from '../core/logger.js';

const log = createLogger('gemini-provider');

export interface GeminiResponse {
  success: boolean;
  content: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUSD: number;
  model: string;
}

export interface GeminiStreamChunk {
  type: 'text' | 'error' | 'done';
  text?: string;
  error?: string;
}

interface TokenPrice {
  input: number; // per 1M tokens
  output: number; // per 1M tokens
}

interface ModelConfig {
  apiEndpoint: string;
  tokenPrices: TokenPrice;
}

/**
 * Gemini Provider クラス
 */
export class GeminiProvider {
  private apiKey: string;
  private isConfigured: boolean;

  // モデル設定（Gemini 2.0ファミリー）
  private modelConfigs: Record<string, ModelConfig> = {
    'gemini-2.0-flash': {
      apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      tokenPrices: {
        input: 0.075, // $0.075 per 1M input tokens
        output: 0.3, // $0.3 per 1M output tokens
      },
    },
    'gemini-2.0-flash-lite': {
      apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent',
      tokenPrices: {
        input: 0.0375, // $0.0375 per 1M input tokens
        output: 0.15, // $0.15 per 1M output tokens
      },
    },
    'gemini-2.0-pro': {
      apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-pro:generateContent',
      tokenPrices: {
        input: 1.25, // $1.25 per 1M input tokens
        output: 5.0, // $5.0 per 1M output tokens
      },
    },
  };

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    this.isConfigured = !!this.apiKey;

    if (!this.isConfigured) {
      log.warn(
        '[GeminiProvider] GEMINI_API_KEY not configured, using fallback responses',
      );
    }
  }

  /**
   * テキスト生成（同期）
   */
  async generate(
    model: 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-2.0-pro',
    prompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    },
  ): Promise<GeminiResponse> {
    // API未設定 → フォールバック
    if (!this.isConfigured) {
      return this.createFallbackResponse(model, prompt);
    }

    const config = this.modelConfigs[model];
    if (!config) {
      return {
        success: false,
        content: `Unknown model: ${model}`,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUSD: 0,
        model,
      };
    }

    try {
      const systemPrompt =
        options?.systemPrompt ||
        'You are a helpful AI assistant for Astromeda gaming PC brand management.';

      const response = await fetch(`${config.apiEndpoint}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: systemPrompt,
                },
              ],
            },
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: options?.temperature ?? 0.7,
            maxOutputTokens: options?.maxTokens ?? 2000,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        log.error(`[GeminiProvider] API error (${response.status}):`, error);
        return this.createErrorResponse(model);
      }

      const result = (await response.json()) as {
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

      const content =
        result.candidates?.[0]?.content?.parts?.[0]?.text ||
        'No content generated';

      const inputTokens = result.usageMetadata?.promptTokenCount || 0;
      const outputTokens = result.usageMetadata?.candidatesTokenCount || 0;

      const estimatedCost =
        (inputTokens / 1000000) * config.tokenPrices.input +
        (outputTokens / 1000000) * config.tokenPrices.output;

      return {
        success: true,
        content,
        inputTokens,
        outputTokens,
        estimatedCostUSD: estimatedCost,
        model,
      };
    } catch (err) {
      log.error('[GeminiProvider] Generate failed:', err);
      return this.createErrorResponse(model);
    }
  }

  /**
   * ストリーミング生成
   */
  async *generateStream(
    model: 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-2.0-pro',
    prompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    },
  ): AsyncGenerator<GeminiStreamChunk> {
    if (!this.isConfigured) {
      yield {
        type: 'text',
        text: 'Gemini API not configured. Fallback response.',
      };
      yield {
        type: 'done',
      };
      return;
    }

    const config = this.modelConfigs[model];
    if (!config) {
      yield {
        type: 'error',
        error: `Unknown model: ${model}`,
      };
      return;
    }

    try {
      const systemPrompt =
        options?.systemPrompt ||
        'You are a helpful AI assistant for Astromeda gaming PC brand management.';

      // Gemini のストリーミングは Server-Sent Events を使用
      const response = await fetch(
        `${config.apiEndpoint.replace(':generateContent', ':streamGenerateContent')}?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: systemPrompt,
                  },
                ],
              },
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: options?.temperature ?? 0.7,
              maxOutputTokens: options?.maxTokens ?? 2000,
            },
          }),
        },
      );

      if (!response.ok) {
        yield {
          type: 'error',
          error: `API returned ${response.status}`,
        };
        return;
      }

      // NOTE: Gemini のレスポンスはJSON行ベース
      const text = await response.text();
      const lines = text.split('\n').filter((l) => l.trim());

      for (const line of lines) {
        if (line.startsWith('[')) {
          const chunk = JSON.parse(line) as Array<{
            candidates?: Array<{
              content?: {
                parts?: Array<{ text?: string }>;
              };
            }>;
          }>;
          const content =
            chunk[0]?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (content) {
            yield {
              type: 'text',
              text: content,
            };
          }
        }
      }

      yield {
        type: 'done',
      };
    } catch (err) {
      log.error('[GeminiProvider] Stream failed:', err);
      yield {
        type: 'error',
        error: String(err),
      };
    }
  }

  /**
   * フォールバック応答を作成
   */
  private createFallbackResponse(
    model: string,
    prompt: string,
  ): GeminiResponse {
    const fallbackText = `[Fallback Response] Gemini API not available. Prompt: "${prompt.substring(0, 50)}..."`;

    return {
      success: false,
      content: fallbackText,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUSD: 0,
      model,
    };
  }

  /**
   * エラー応答を作成
   */
  private createErrorResponse(model: string): GeminiResponse {
    return {
      success: false,
      content: 'Gemini API call failed. Using fallback.',
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUSD: 0,
      model,
    };
  }

  /**
   * 利用可能かチェック
   */
  get available(): boolean {
    return this.isConfigured;
  }
}

// ── シングルトン ──
let geminiProviderInstance: GeminiProvider | null = null;

/**
 * GeminiProvider シングルトン取得
 */
export function getGeminiProvider(): GeminiProvider {
  if (!geminiProviderInstance) {
    geminiProviderInstance = new GeminiProvider();
  }
  return geminiProviderInstance;
}
