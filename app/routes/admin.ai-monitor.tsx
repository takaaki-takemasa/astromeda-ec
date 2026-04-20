/**
 * Admin AI Monitor Page — AI検索エンジン最適化（GEO）モニタリング
 * Task H1: AI検索モニタリング
 *
 * 機能:
 * 1. AI Search Test Results — AI検索エンジンのテスト結果記録フォーム
 *    - 検索クエリ入力
 *    - AIエンジン選択（ChatGPT, Claude, Gemini, Perplexity, Grok）
 *    - 結果タイプ選択（mentioned, recommended, not mentioned, competitor mentioned）
 *    - 結果テーブル（ローカルstateで蓄積）
 *
 * 2. Citation Scorecard — 引用スコアカード
 *    - Query | AI Engine | Result | Date | Notes
 *    - サマリー: X/Y queries mentioned Astromeda
 *
 * 3. Improvement Suggestions — GEO最適化提案
 *    - llms.txtの定期更新
 *    - ブログ記事の定期公開
 *    - レビュー数の増加
 *    etc
 *
 * 技術仕様:
 * - ダークテーマ（T定数使用）
 * - インラインスタイル（Tailwind不使用）
 * - NoIndex/NoFollow（メタタグ）
 * - ErrorBoundary対応
 * - NODE_ENVでconsole.log保護
 */

import { useState } from 'react';
import { redirect, useLoaderData } from 'react-router';
import type { Route } from './+types/admin.ai-monitor';
import { AppSession } from '~/lib/session';
import { AppError } from '~/lib/app-error';
import { RouteErrorBoundary } from '~/components/astro/RouteErrorBoundary';
import { PAGE_WIDTH, T } from '~/lib/astromeda-data';
// patch 0090 (R3): 生の alert() を admin 統一 Toast プリミティブに置換（中学生基準 UX）
import { useToast } from '~/components/admin/ds/Toast';

// ── テーマ定数 ──
const D = {
  bg: T.bg,
  tx: T.tx,
  t5: T.t5,
  t4: T.t4,
  t3: T.t3,
  t2: T.t2,
  t1: T.t1,
  bd: T.bd,
  c: T.c,
  g: T.g,
  r: T.r ?? '#FF2D55',
};

// ── 型定義 ──
interface AITestResult {
  id: string;
  query: string;
  engine: 'ChatGPT' | 'Claude' | 'Gemini' | 'Perplexity' | 'Grok';
  result: 'mentioned' | 'recommended' | 'not mentioned' | 'competitor mentioned';
  date: string;
  notes?: string;
}

interface LoaderData {
  isAdmin: boolean;
  savedResults?: AITestResult[];
}

// ── Loader: Admin認証チェック ──
export async function loader({ request, context }: Route.LoaderArgs) {
  try {
    const env = context.env as Record<string, string>;
    const session = await AppSession.init(request, [env.SESSION_SECRET as string]);

    if (session.get('isAdmin') !== true) {
      throw AppError.unauthorized('認証が必要です');
    }
  } catch (error) {
    if (error instanceof Response) throw error;
    if (process.env.NODE_ENV === 'development') {
      console.error('[admin.ai-monitor] Auth error:', error);
    }
    throw AppError.unauthorized('認証エラー');
  }

  // G-02: AI監視結果をStorageから取得
  let savedResults: AITestResult[] = [];
  try {
    const { getStorage } = await import('../../agents/core/storage.js');
    const storage = getStorage();
    const records = await storage.query('ai_test_results', { limit: 100, desc: true });
    savedResults = records.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      query: String(r.query ?? ''),
      engine: String(r.engine ?? 'ChatGPT'),
      result: String(r.result ?? 'not_found'),
      date: String(r.date ?? ''),
      notes: String(r.notes ?? ''),
    })) as AITestResult[];
  } catch {
    // Storage未初期化時はフロントエンドのseedデータで表示
  }

  return { isAdmin: true, savedResults };
}

// ── Meta（NoIndex/NoFollow） ──
export const meta: Route.MetaFunction = () => {
  return [
    { title: 'AI Monitor | ASTROMEDA Admin' },
    { name: 'robots', content: 'noindex,nofollow' },
  ];
};

// ── Main Component ──
export default function AdminAIMonitor() {
  const loaderData = useLoaderData<LoaderData>();

  // G-02: Storage保存データがあればそれを使用、なければseedデータ
  const seedData: AITestResult[] = [
    { id: '1', query: 'ゲーミングPC おすすめ', engine: 'ChatGPT', result: 'recommended', date: '2026-04-08', notes: 'Top 3に含まれた' },
    { id: '2', query: 'ゲーミングPC 国内製造', engine: 'Claude', result: 'mentioned', date: '2026-04-07', notes: 'サイドバーの候補' },
  ];
  const initialResults = (loaderData.savedResults && loaderData.savedResults.length > 0)
    ? loaderData.savedResults
    : seedData;
  const [testResults, setTestResults] = useState<AITestResult[]>(initialResults);

  // patch 0090 (R3): admin 共通 Toast — 生の alert() を置換
  const { pushToast, Toast } = useToast();

  // フォーム状態
  const [formData, setFormData] = useState({
    query: '',
    engine: 'ChatGPT' as const,
    result: 'mentioned' as const,
    notes: '',
  });

  const engines = ['ChatGPT', 'Claude', 'Gemini', 'Perplexity', 'Grok'] as const;
  const resultTypes = ['mentioned', 'recommended', 'not mentioned', 'competitor mentioned'] as const;
  const resultLabels: Record<string, string> = {
    'mentioned': '言及',
    'recommended': '推奨',
    'not mentioned': '未言及',
    'competitor mentioned': '競合言及',
  };

  // テスト結果を追加
  const handleAddResult = () => {
    if (!formData.query.trim()) {
      // patch 0090 (R3): 生の alert() → Toast へ。中学生基準 + a11y (role=alert)
      pushToast('検索クエリを入力してください', 'error');
      return;
    }

    const newResult: AITestResult = {
      id: `${Date.now()}`,
      query: formData.query,
      engine: formData.engine,
      result: formData.result,
      date: new Date().toISOString().split('T')[0],
      notes: formData.notes,
    };

    if (process.env.NODE_ENV === 'development') {
      console.log('[admin.ai-monitor] Adding result:', newResult);
    }

    setTestResults([newResult, ...testResults]);
    setFormData({
      query: '',
      engine: 'ChatGPT',
      result: 'mentioned',
      notes: '',
    });
  };

  // テスト結果を削除
  const handleDeleteResult = (id: string) => {
    setTestResults(testResults.filter(r => r.id !== id));
  };

  // スコアカード計算
  const mentionedCount = testResults.filter(
    r => r.result === 'mentioned' || r.result === 'recommended'
  ).length;
  const totalCount = testResults.length;
  const mentionRate = totalCount > 0 ? Math.round((mentionedCount / totalCount) * 100) : 0;

  return (
    <div
      style={{
        background: D.bg,
        minHeight: '100vh',
        color: D.tx,
        fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: `linear-gradient(135deg, ${T.c}08, ${T.g}08)`,
          borderBottom: `1px solid ${D.bd}`,
          padding: 'clamp(16px, 2vw, 32px) clamp(16px, 4vw, 48px)',
        }}
      >
        <div style={PAGE_WIDTH}>
          <h1
            style={{
              fontSize: 'clamp(18px, 3vw, 28px)',
              fontWeight: 900,
              margin: '0 0 8px',
              color: D.tx,
            }}
          >
            AI Search Monitor
          </h1>
          <p
            style={{
              fontSize: 13,
              color: D.t4,
              margin: 0,
            }}
          >
            生成AI検索エンジンでのASTROMEDAの認識状況をモニタリング
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div style={PAGE_WIDTH}>
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: 'clamp(24px, 3vw, 48px) 0',
          }}
        >
          {/* Section 1: AI Search Test Results */}
          <section style={{ marginBottom: 'clamp(32px, 4vw, 64px)' }}>
            <h2
              style={{
                fontSize: 'clamp(16px, 2.5vw, 22px)',
                fontWeight: 800,
                marginBottom: 16,
                color: D.tx,
              }}
            >
              1. AI Search Test Results
            </h2>

            <div
              style={{
                background: `rgba(0,240,255,.02)`,
                border: `1px solid ${D.bd}`,
                borderRadius: 12,
                padding: 'clamp(16px, 2vw, 24px)',
              }}
            >
              {/* Form */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                {/* Query Input */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 600,
                      color: D.t4,
                      marginBottom: 6,
                    }}
                  >
                    検索クエリ
                  </label>
                  <input
                    type="text"
                    placeholder="例：ゲーミングPC おすすめ"
                    value={formData.query}
                    onChange={(e) => setFormData({ ...formData, query: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      fontSize: 12,
                      background: `rgba(255,255,255,.05)`,
                      border: `1px solid ${D.bd}`,
                      borderRadius: 6,
                      color: D.tx,
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>

                {/* Engine Select */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 600,
                      color: D.t4,
                      marginBottom: 6,
                    }}
                  >
                    AIエンジン
                  </label>
                  <select
                    value={formData.engine}
                    onChange={(e) => setFormData({ ...formData, engine: e.target.value as unknown as typeof formData.engine })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      fontSize: 12,
                      background: `rgba(255,255,255,.05)`,
                      border: `1px solid ${D.bd}`,
                      borderRadius: 6,
                      color: D.tx,
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  >
                    {engines.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Result Type Select */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 600,
                      color: D.t4,
                      marginBottom: 6,
                    }}
                  >
                    結果タイプ
                  </label>
                  <select
                    value={formData.result}
                    onChange={(e) => setFormData({ ...formData, result: e.target.value as unknown as typeof formData.result })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      fontSize: 12,
                      background: `rgba(255,255,255,.05)`,
                      border: `1px solid ${D.bd}`,
                      borderRadius: 6,
                      color: D.tx,
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  >
                    {resultTypes.map((r) => (
                      <option key={r} value={r}>
                        {resultLabels[r]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notes Input */}
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 600,
                    color: D.t4,
                    marginBottom: 6,
                  }}
                >
                  メモ（オプション）
                </label>
                <input
                  type="text"
                  placeholder="例：Top 3に含まれた"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: 12,
                    background: `rgba(255,255,255,.05)`,
                    border: `1px solid ${D.bd}`,
                    borderRadius: 6,
                    color: D.tx,
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Submit Button */}
              <button
                onClick={handleAddResult}
                style={{
                  padding: '10px 20px',
                  background: `linear-gradient(135deg, ${T.c}, ${T.g})`,
                  color: '#000',
                  fontSize: 12,
                  fontWeight: 700,
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  transition: 'opacity .2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                テスト結果を記録
              </button>
            </div>
          </section>

          {/* Section 2: Citation Scorecard */}
          <section style={{ marginBottom: 'clamp(32px, 4vw, 64px)' }}>
            <h2
              style={{
                fontSize: 'clamp(16px, 2.5vw, 22px)',
                fontWeight: 800,
                marginBottom: 16,
                color: D.tx,
              }}
            >
              2. Citation Scorecard
            </h2>

            {/* Score Summary */}
            <div
              style={{
                background: `rgba(0,240,255,.02)`,
                border: `1px solid ${D.bd}`,
                borderRadius: 12,
                padding: 'clamp(16px, 2vw, 24px)',
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: 'clamp(24px, 3vw, 36px)',
                    fontWeight: 900,
                    background: `linear-gradient(135deg, ${T.c}, ${T.g})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {mentionRate}%
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: D.t4,
                  }}
                >
                  {mentionedCount} / {totalCount} テスト済みクエリが言及またはお勧めされた
                </div>
              </div>
            </div>

            {/* Results Table */}
            {testResults.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 12,
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        borderBottom: `1px solid ${D.bd}`,
                      }}
                    >
                      <th
                        style={{
                          textAlign: 'left',
                          padding: '10px 8px',
                          color: D.t4,
                          fontWeight: 600,
                        }}
                      >
                        クエリ
                      </th>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: '10px 8px',
                          color: D.t4,
                          fontWeight: 600,
                        }}
                      >
                        AIエンジン
                      </th>
                      <th
                        style={{
                          textAlign: 'center',
                          padding: '10px 8px',
                          color: D.t4,
                          fontWeight: 600,
                        }}
                      >
                        結果
                      </th>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: '10px 8px',
                          color: D.t4,
                          fontWeight: 600,
                        }}
                      >
                        日付
                      </th>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: '10px 8px',
                          color: D.t4,
                          fontWeight: 600,
                        }}
                      >
                        メモ
                      </th>
                      <th
                        style={{
                          textAlign: 'center',
                          padding: '10px 8px',
                          color: D.t4,
                          fontWeight: 600,
                        }}
                      >
                        アクション
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {testResults.map((result) => {
                      const resultColor =
                        result.result === 'recommended'
                          ? T.g
                          : result.result === 'mentioned'
                            ? T.c
                            : result.result === 'not mentioned'
                              ? D.t3
                              : '#FF6B6B';
                      return (
                        <tr
                          key={result.id}
                          style={{
                            borderBottom: `1px solid ${D.bd}`,
                          }}
                        >
                          <td
                            style={{
                              padding: '10px 8px',
                              color: D.t5,
                            }}
                          >
                            {result.query}
                          </td>
                          <td
                            style={{
                              padding: '10px 8px',
                              color: D.t5,
                            }}
                          >
                            {result.engine}
                          </td>
                          <td
                            style={{
                              textAlign: 'center',
                              padding: '10px 8px',
                              color: resultColor,
                              fontWeight: 600,
                            }}
                          >
                            {resultLabels[result.result]}
                          </td>
                          <td
                            style={{
                              padding: '10px 8px',
                              color: D.t4,
                              fontSize: 11,
                            }}
                          >
                            {result.date}
                          </td>
                          <td
                            style={{
                              padding: '10px 8px',
                              color: D.t4,
                            }}
                          >
                            {result.notes || '—'}
                          </td>
                          <td
                            style={{
                              textAlign: 'center',
                              padding: '10px 8px',
                            }}
                          >
                            <button
                              onClick={() => handleDeleteResult(result.id)}
                              style={{
                                padding: '4px 8px',
                                background: 'transparent',
                                border: `1px solid ${D.r}`,
                                color: D.r,
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontSize: 11,
                                fontWeight: 600,
                                transition: 'all .2s',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = `rgba(255,45,85,.15)`;
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                              }}
                            >
                              削除
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: D.t3,
                  fontSize: 12,
                }}
              >
                テスト結果がまだありません。上記フォームで追加してください。
              </div>
            )}
          </section>

          {/* Section 3: Improvement Suggestions */}
          <section>
            <h2
              style={{
                fontSize: 'clamp(16px, 2.5vw, 22px)',
                fontWeight: 800,
                marginBottom: 16,
                color: D.tx,
              }}
            >
              3. Improvement Suggestions
            </h2>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 12,
              }}
            >
              {[
                {
                  icon: '📄',
                  title: 'llms.txtの定期更新',
                  desc: 'AI検索エンジンに認識されやすいよう、最新のコンテンツ情報をllms.txtで定期的に更新してください（最低月1回）。',
                },
                {
                  icon: '✍️',
                  title: 'ブログ記事の定期公開',
                  desc: 'ゲーミングPC関連のブログ記事を週1回以上公開することで、AI生成時の引用対象になりやすくなります。',
                },
                {
                  icon: '⭐',
                  title: 'レビュー数の増加',
                  desc: 'AggregateRating schema を有効化するために、カスタマーレビュー数を20件以上に増やしてください。',
                },
                {
                  icon: '🔗',
                  title: 'JSON-LD構造化データの充実',
                  desc: 'Product, FAQPage, BreadcrumbList などの schema.org データを全ページに実装。',
                },
                {
                  icon: '📱',
                  title: 'ファクトチェック対応',
                  desc: 'AI検索エンジンが引用しやすいよう、プロダクトのスペック（GPU、メモリ等）を明確に記述。',
                },
                {
                  icon: '🎯',
                  title: 'ランディングページ最適化',
                  desc: 'AI検索結果で「ゲーミングPC」「AIコラボ」など主要キーワードのランディングページを整備。',
                },
              ].map((item, i) => (
                <div
                  key={i}
                  style={{
                    background: `rgba(0,240,255,.02)`,
                    border: `1px solid ${D.bd}`,
                    borderRadius: 12,
                    padding: 'clamp(12px, 2vw, 16px)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 18,
                      marginBottom: 8,
                    }}
                  >
                    {item.icon}
                  </div>
                  <h3
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: D.tx,
                      marginBottom: 6,
                      margin: '0 0 6px',
                    }}
                  >
                    {item.title}
                  </h3>
                  <p
                    style={{
                      fontSize: 11,
                      color: D.t4,
                      lineHeight: 1.6,
                      margin: 0,
                    }}
                  >
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      {/* patch 0090 (R3): 生の alert() を置換した admin 共通 Toast */}
      <Toast />
    </div>
  );
}

/**
 * Error Boundary
 */
export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
