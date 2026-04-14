/**
 * Prompt Templates — プロンプトテンプレートエンジン（前頭前皮質=思考の構造化）
 *
 * 医学的メタファー: ブローカ野・ウェルニッケ野（言語中枢）
 * Agentが「何を、どう伝えるか」を標準化する。
 * テンプレートの統一により、Agent間の"言語"が統一される。
 *
 * 設計原則:
 * 1. 型安全 — テンプレート変数をTypeScriptで検証
 * 2. 構成可能 — ベーステンプレート + オーバーライド
 * 3. 日本語ファースト — CEO向けの出力は常に日本語
 * 4. JSON出力強制 — 構造化されたレスポンスを保証
 */

// ── テンプレート変数の型定義 ──

export interface TemplateVars {
  [key: string]: string | number | boolean | string[] | Record<string, unknown> | undefined;
}

// ── テンプレート定義 ──

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  userPromptTemplate: string;
  /** 出力形式のJSONスキーマ（説明用） */
  outputSchema?: string;
  /** 推奨max_tokens */
  maxTokens?: number;
  /** 推奨temperature */
  temperature?: number;
}

// ── テンプレートレジストリ ──

const TEMPLATES: Map<string, PromptTemplate> = new Map();

/**
 * テンプレート変数を展開する
 * {{varName}} → 実際の値に置換
 * {{#if varName}}...{{/if}} → 条件付きブロック
 * {{#each arrayVar}}...{{/each}} → 配列展開
 */
export function renderTemplate(template: string, vars: TemplateVars): string {
  let result = template;

  // 条件ブロック: {{#if varName}}content{{/if}}
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, varName: string, content: string) => {
      const val = vars[varName];
      return val !== undefined && val !== false && val !== '' && val !== 0
        ? content
        : '';
    },
  );

  // 配列展開: {{#each arrayVar}}...{{item}}...{{index}}...{{/each}}
  result = result.replace(
    /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_match, varName: string, content: string) => {
      const arr = vars[varName];
      if (!Array.isArray(arr)) return '';
      return arr
        .map((item, index) =>
          content
            .replace(/\{\{item\}\}/g, String(item))
            .replace(/\{\{index\}\}/g, String(index + 1)),
        )
        .join('\n');
    },
  );

  // 単純変数置換: {{varName}}
  result = result.replace(/\{\{(\w+)\}\}/g, (_match, varName: string) => {
    const val = vars[varName];
    if (val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val, null, 2);
    return String(val);
  });

  return result.trim();
}

// ── テンプレートCRUD ──

export function registerTemplate(template: PromptTemplate): void {
  TEMPLATES.set(template.id, template);
}

export function getTemplate(id: string): PromptTemplate | undefined {
  return TEMPLATES.get(id);
}

export function getAllTemplates(): PromptTemplate[] {
  return Array.from(TEMPLATES.values());
}

/**
 * テンプレートを使ってプロンプトを生成する
 */
export function buildPrompt(
  templateId: string,
  vars: TemplateVars,
): { system: string; user: string; maxTokens?: number; temperature?: number } | null {
  const template = TEMPLATES.get(templateId);
  if (!template) return null;

  return {
    system: renderTemplate(template.systemPrompt, vars),
    user: renderTemplate(template.userPromptTemplate, vars),
    maxTokens: template.maxTokens,
    temperature: template.temperature,
  };
}

// ── ビルトインテンプレート ──

// 1. Agent判断テンプレート
registerTemplate({
  id: 'agent-decision',
  name: 'Agent判断',
  description: 'Agentが次のアクションを決定するためのテンプレート',
  systemPrompt: `あなたはASTROMEDA ECサイトのAI運用アシスタントです。
ゲーミングPCブランド「Astromeda」のECサイトの自律運用を支援します。
回答は常に日本語で、非エンジニアのオーナーにもわかりやすく。
判断は保守的に。不確実な場合は人間の承認を推奨してください。`,
  userPromptTemplate: `Agent「{{agentName}}」(ID: {{agentId}})からの判断要求:

状況: {{context}}

選択肢:
{{#each options}}{{index}}. {{item}}{{/each}}

{{#if currentData}}現在のデータ:
{{currentData}}{{/if}}

以下のJSON形式で回答してください:
{
  "action": "選択した選択肢の番号または具体的なアクション名",
  "reasoning": "判断理由（日本語、オーナー向け）",
  "confidence": 0.0〜1.0の信頼度,
  "riskLevel": "low/medium/high/critical",
  "requiresApproval": true/false
}`,
  maxTokens: 1500,
  temperature: 0.3,
});

// 2. データ分析テンプレート
registerTemplate({
  id: 'data-analysis',
  name: 'データ分析',
  description: '売上・アクセス・在庫データの分析用テンプレート',
  systemPrompt: `あなたはASTROMEDA ECサイトのデータ分析AIです。
売上データ、アクセスデータ、在庫データを分析し、
非エンジニアのオーナーにもわかる日本語で回答します。
具体的な数字と改善提案を含めてください。`,
  userPromptTemplate: `以下のデータを分析してください:

質問: {{question}}

データ:
{{data}}

以下のJSON形式で回答:
{
  "summary": "分析サマリー",
  "insights": ["発見1", "発見2"],
  "recommendations": ["推奨アクション1", "推奨アクション2"],
  "confidence": 0.0〜1.0
}`,
  maxTokens: 2000,
  temperature: 0.2,
});

// 3. SEOコンテンツ生成テンプレート
registerTemplate({
  id: 'seo-content',
  name: 'SEOコンテンツ生成',
  description: '商品説明・ブログ記事のSEO最適化コンテンツ生成',
  systemPrompt: `あなたはASTROMEDA ECサイトのSEOコンテンツライターです。
ゲーミングPC「Astromeda」の魅力を、検索エンジンと購入者の両方に最適化された
日本語コンテンツで表現します。
IPコラボレーション（アニメ・ゲーム）の熱量を活かした文章を書きます。`,
  userPromptTemplate: `以下のコンテンツを{{contentType}}として作成してください:

対象: {{target}}
{{#if keywords}}キーワード: {{keywords}}{{/if}}
{{#if tone}}トーン: {{tone}}{{/if}}
{{#if maxLength}}最大文字数: {{maxLength}}文字{{/if}}

{{#if existingContent}}既存コンテンツ（改善対象）:
{{existingContent}}{{/if}}

以下のJSON形式で回答:
{
  "title": "SEO最適化タイトル",
  "content": "本文",
  "metaDescription": "メタディスクリプション（120文字以内）",
  "suggestedKeywords": ["キーワード1", "キーワード2"]
}`,
  maxTokens: 3000,
  temperature: 0.7,
});

// 4. 異常検知レポートテンプレート
registerTemplate({
  id: 'anomaly-report',
  name: '異常検知レポート',
  description: 'システム異常の分析と対応策の提案',
  systemPrompt: `あなたはASTROMEDA ECサイトのシステム監視AIです。
異常を検知した際に、CEOにわかりやすく状況を説明し、
具体的な対応策を提案します。緊急度を正確に判断してください。`,
  userPromptTemplate: `以下の異常が検知されました:

検知元: {{source}}
異常タイプ: {{anomalyType}}
発生時刻: {{timestamp}}

詳細データ:
{{details}}

{{#if history}}過去の類似事例:
{{history}}{{/if}}

以下のJSON形式で回答:
{
  "severity": "low/medium/high/critical",
  "summary": "CEOへの一言サマリー",
  "rootCause": "推定される原因",
  "immediateAction": "今すぐ必要なアクション",
  "longTermFix": "長期的な対策",
  "estimatedImpact": "売上・UXへの影響見積"
}`,
  maxTokens: 1500,
  temperature: 0.2,
});

// 5. プロモーション提案テンプレート
registerTemplate({
  id: 'promotion-suggest',
  name: 'プロモーション提案',
  description: 'セール・キャンペーンの最適化提案',
  systemPrompt: `あなたはASTROMEDA ECサイトのマーケティングAIです。
100億円の売上目標に向けて、最適なプロモーション戦略を提案します。
26のIPコラボレーションを活かした施策を重視します。`,
  userPromptTemplate: `以下のデータに基づいてプロモーション提案を作成してください:

{{#if salesData}}直近の売上データ:
{{salesData}}{{/if}}

{{#if season}}現在の時期: {{season}}{{/if}}
{{#if upcomingEvents}}今後のイベント: {{upcomingEvents}}{{/if}}

以下のJSON形式で回答:
{
  "campaigns": [
    {
      "name": "キャンペーン名",
      "type": "discount/bundle/flash_sale/loyalty",
      "targetIP": "対象IP（該当する場合）",
      "discountRate": 0-30,
      "duration": "日数",
      "expectedROI": "期待されるROI",
      "reasoning": "提案理由"
    }
  ],
  "priority": "最も効果の高い施策とその理由"
}`,
  maxTokens: 2000,
  temperature: 0.5,
});
