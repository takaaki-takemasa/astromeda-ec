/**
 * UXR Insights — AI マーケアシスタント
 *
 * patch 0126 Phase D: ファネル × ヒートマップ × セッション再生のデータを総合し、
 * 「どこで何が起きていて、次に何をすべきか」を 3 件以内のおすすめアクションに変換する。
 *
 * 設計方針:
 * - 推論エンジンは 100% ルールベース（外部 LLM/API 一切なし）
 * - 出力は admin の deep-link 付き（ボタンを押せば該当ヒートマップ/再生に飛べる）
 * - 60秒キャッシュ（KV scan を使うため）
 * - 中学生でも分かる日本語コピー（「なぜ？」「次に何をする？」を必ずセットで提示）
 */

import {
  computeFunnel,
  readBatchesForPath,
  listRecentSessions,
  type FunnelResult,
} from './uxr-storage';

/** 1つのおすすめアクションの形 */
export interface MarketingInsight {
  /** 一意識別子（重複排除用） */
  id: string;
  /** 重要度: critical=赤・warning=橙・info=シアン */
  severity: 'critical' | 'warning' | 'info';
  /** 1行タイトル（30字程度） */
  title: string;
  /** なぜそうなったか（中学生向け説明） */
  reason: string;
  /** 次に何をすべきかの解説（中学生向け） */
  hint: string;
  /** 関連する KPI（バッジ表示） */
  metrics: Array<{ label: string; value: string; tone?: 'red' | 'orange' | 'cyan' | 'green' }>;
  /** deep-link CTA（最大 3 個・最初が primary） */
  ctas: Array<{
    label: string;
    /** 飛び先 admin タブ */
    tab: 'funnel' | 'uxr' | 'sessions' | 'marketing' | 'products' | 'homepage';
    /** ヒートマップ用 path（uxr タブ用） */
    path?: string;
    /** session 再生用 sid（sessions タブ用） */
    sid?: string;
  }>;
}

export interface InsightsResult {
  /** 集計対象期間（日数） */
  days: number;
  /** 生成された insight（重要度高い順、最大 5 件） */
  insights: MarketingInsight[];
  /** 集計のもとになった生データの件数（diagnostic） */
  meta: {
    totalSessions: number;
    productPathsAnalyzed: number;
    cartPathsAnalyzed: number;
  };
}

let cachedInsights: { ts: number; key: string; result: InsightsResult } | null = null;
const INSIGHTS_CACHE_MS = 60_000;

/**
 * Top3 おすすめアクションを生成する。
 *
 * ルール:
 * 1. ファネル最悪段階（離脱率 50% 以上）→ critical insight 1件
 *    - cart→checkout の場合: 「ファネル詳細を見る」「セッション再生で購入手続きの離脱を見る」
 *    - product→cart の場合: 該当商品の最頻 path のヒートマップへ
 *    - landing→product の場合: トップページのヒートマップ + ホームページ編集 CTA
 * 2. rage click が多い page → warning insight 1件
 *    - 「セッション再生で原因を見る」「ヒートマップで rage 発生箇所を見る」
 * 3. クリックなしゾーン（pageview ≧ 5 だが unique link click が少ない page）→ warning insight 1件
 *    - 「ヒートマップで死角を見る」
 * 4. 上記 3 件で埋まらなければ「Top hot link」を info で 1 件追加（ポジティブ強化）
 */
export async function generateInsights(
  env: Record<string, unknown> | null | undefined,
  options?: { days?: number },
): Promise<InsightsResult> {
  const days = options?.days ?? 7;
  const cacheKey = `d=${days}`;
  const now = Date.now();
  if (cachedInsights && cachedInsights.key === cacheKey && now - cachedInsights.ts < INSIGHTS_CACHE_MS) {
    return cachedInsights.result;
  }

  const insights: MarketingInsight[] = [];

  // ── 0. データ取得 ──
  let funnel: FunnelResult;
  try {
    funnel = await computeFunnel(env, { days });
  } catch {
    funnel = {
      days,
      totalSessions: 0,
      stages: [],
      topProductPaths: [],
      topCartPaths: [],
    };
  }

  let sessionList: Awaited<ReturnType<typeof listRecentSessions>> = [];
  try {
    sessionList = await listRecentSessions(env, {
      limit: 100,
      sinceMs: now - days * 24 * 60 * 60 * 1000,
    });
  } catch {
    // 取れなくても funnel だけで insight は出せる
  }

  // ── 1. ファネル最悪段階の insight ──
  // landing は離脱率 0 なので、index 1 以降のうち最大 dropoffRate のものを選ぶ
  if (funnel.stages.length >= 2) {
    const worst = funnel.stages
      .slice(1)
      .filter((s) => s.dropoffCount > 0)
      .sort((a, b) => b.dropoffRate - a.dropoffRate)[0];

    if (worst && worst.dropoffRate >= 50) {
      const stageName: Record<string, string> = {
        product: '商品ページ',
        cart: 'カート',
        checkout: '購入手続き',
      };
      const reasons: Record<string, string> = {
        product: 'お客様はサイトに来ていますが、商品ページまで進んでいません。トップページのバナーが目を引いていない・関連商品が見つからない可能性があります。',
        cart: 'お客様は商品を見ていますが、カートに入れていません。「カートに入れる」ボタンが目立たない・在庫がない・選択肢（プルダウン）が分かりにくい可能性があります。',
        checkout: 'お客様はカートまで来ていますが、購入手続きに進んでいません。送料・支払方法・到着日が分からず不安になっている可能性があります。',
      };
      const hints: Record<string, string> = {
        product: 'トップページのヒートマップでクリック箇所を確認し、新作 IP コラボのバナーを目立つ位置に配置しましょう。',
        cart: '商品ページのヒートマップで「カートに入れる」ボタン周辺の動きを確認し、ボタンの色・サイズ・位置を改善しましょう。',
        checkout: 'カートページのセッション再生で離脱直前の動きを観察し、送料無料表示・お届け日表示・支払方法アイコンを追加しましょう。',
      };

      const ctas: MarketingInsight['ctas'] = [
        { label: '🪜 ファネル詳細を見る', tab: 'funnel' },
      ];

      // 段階別 deep-link
      if (worst.stage === 'product' || worst.stage === 'cart') {
        // 該当 path のヒートマップへ
        const path = worst.stage === 'product'
          ? funnel.topProductPaths[0]?.path
          : funnel.topCartPaths[0]?.path;
        if (path) {
          ctas.push({ label: '🔥 このページのヒートマップ', tab: 'uxr', path });
        } else if (worst.stage === 'product') {
          ctas.push({ label: '🏠 トップページを編集', tab: 'homepage' });
        }
      } else if (worst.stage === 'checkout') {
        // /cart のヒートマップ
        const cartPath = funnel.topCartPaths[0]?.path;
        if (cartPath) {
          ctas.push({ label: '🔥 カートページのヒートマップ', tab: 'uxr', path: cartPath });
        }
      }

      // セッション再生候補（最近のセッション）
      if (sessionList.length > 0) {
        ctas.push({
          label: `📹 録画を見る (${Math.min(10, sessionList.length)}件)`,
          tab: 'sessions',
        });
      }

      insights.push({
        id: `funnel-worst-${worst.stage}`,
        severity: 'critical',
        title: `${stageName[worst.stage] || worst.stage} で ${worst.dropoffRate.toFixed(0)}% が離脱しています`,
        reason: reasons[worst.stage] || `${stageName[worst.stage] || worst.stage} で多くのお客様が離脱しています。`,
        hint: hints[worst.stage] || '関連するヒートマップとセッション再生で原因を特定しましょう。',
        metrics: [
          { label: '離脱', value: `${worst.dropoffRate.toFixed(0)}%`, tone: 'red' },
          { label: '逃した人数', value: `${worst.dropoffCount}人`, tone: 'red' },
          { label: 'まだ到達', value: `${worst.sessions}人`, tone: 'cyan' },
        ],
        ctas: ctas.slice(0, 3),
      });
    }
  }

  // ── 2. rage click 多発 page の insight ──
  // top product + top cart path の中から rage 件数を見つける
  const candidatePaths = [
    ...funnel.topProductPaths.map((p) => p.path),
    ...funnel.topCartPaths.map((p) => p.path),
  ].slice(0, 8);

  let worstRagePath: { path: string; rageCount: number; sessions: number } | null = null;
  let bestNoClickPath:
    | { path: string; pageviews: number; uniqueClickedSelectors: number }
    | null = null;

  for (const path of candidatePaths) {
    try {
      const batches = await readBatchesForPath(env, path, {
        maxBatches: 100,
        sinceMs: now - days * 24 * 60 * 60 * 1000,
      });
      let rageCount = 0;
      let pageviews = 0;
      const uniqueSelectors = new Set<string>();
      const sessions = new Set<string>();
      for (const b of batches) {
        sessions.add(b.sid);
        for (const e of b.events) {
          if (e.t === 'rage') rageCount++;
          else if (e.t === 'pv') pageviews++;
          else if (e.t === 'click' && e.sel) uniqueSelectors.add(e.sel);
        }
      }
      if (rageCount > 0 && (!worstRagePath || rageCount > worstRagePath.rageCount)) {
        worstRagePath = { path, rageCount, sessions: sessions.size };
      }
      // クリックなしゾーン候補: pv ≧ 5 だが unique click selector ≦ 2
      if (pageviews >= 5 && uniqueSelectors.size <= 2) {
        if (!bestNoClickPath || pageviews > bestNoClickPath.pageviews) {
          bestNoClickPath = { path, pageviews, uniqueClickedSelectors: uniqueSelectors.size };
        }
      }
    } catch {
      // skip this path on error
    }
  }

  if (worstRagePath && worstRagePath.rageCount >= 2) {
    insights.push({
      id: `rage-${worstRagePath.path}`,
      severity: 'warning',
      title: `${worstRagePath.path} でお客様がイライラしています`,
      reason: `同じ場所を短時間に何度もクリックする「rage click」が ${worstRagePath.rageCount}回 発生しました。ボタンが反応しない・リンクが切れている・読み込みが遅いなどが原因の可能性があります。`,
      hint: 'セッション再生で実際の動きを見て、原因のボタンやリンクを特定しましょう。読み込み速度が遅い場合は商品画像のサイズを確認してください。',
      metrics: [
        { label: 'rage 発生', value: `${worstRagePath.rageCount}回`, tone: 'orange' },
        { label: '影響セッション', value: `${worstRagePath.sessions}人`, tone: 'orange' },
      ],
      ctas: [
        { label: '🔥 ヒートマップで場所を見る', tab: 'uxr', path: worstRagePath.path },
        { label: '📹 セッション再生を見る', tab: 'sessions' },
      ],
    });
  }

  if (bestNoClickPath && insights.length < 3) {
    insights.push({
      id: `noclick-${bestNoClickPath.path}`,
      severity: 'warning',
      title: `${bestNoClickPath.path} に「クリックなしゾーン」があります`,
      reason: `このページは ${bestNoClickPath.pageviews}回 見られていますが、クリックされたボタンの種類が ${bestNoClickPath.uniqueClickedSelectors}種類しかありません。大事なボタンが見えていない・スクロールしないと出てこない位置にある可能性があります。`,
      hint: 'ヒートマップでスクロール深度とクリック分布を確認し、最重要ボタン（「カートに入れる」「購入する」）を画面内に常に見えるように配置しましょう。',
      metrics: [
        { label: '閲覧数', value: `${bestNoClickPath.pageviews}回`, tone: 'cyan' },
        { label: 'クリックされた種類', value: `${bestNoClickPath.uniqueClickedSelectors}種`, tone: 'orange' },
      ],
      ctas: [
        { label: '🔥 死角をヒートマップで見る', tab: 'uxr', path: bestNoClickPath.path },
      ],
    });
  }

  // ── 3. positive: Top hot product path（insights が少ない時のみ） ──
  if (insights.length < 3 && funnel.topProductPaths.length > 0) {
    const top = funnel.topProductPaths[0];
    insights.push({
      id: `top-product-${top.path}`,
      severity: 'info',
      title: `人気商品: ${top.path}`,
      reason: `この商品ページは ${top.sessions}人 のお客様が訪れています。よく見られている＝興味を持たれている商品です。`,
      hint: 'この商品をトップページのヒーローバナーに昇格させる、または関連商品としてカートに「あわせ買い」推薦すると売上が伸びます。',
      metrics: [
        { label: '訪問', value: `${top.sessions}人`, tone: 'green' },
      ],
      ctas: [
        { label: '🔥 このページのヒートマップ', tab: 'uxr', path: top.path },
        { label: '🖼 トップページに昇格', tab: 'homepage' },
      ],
    });
  }

  // データがゼロ件の時のフォールバック
  if (insights.length === 0) {
    insights.push({
      id: 'no-data',
      severity: 'info',
      title: 'まだお客様の行動データが集まっていません',
      reason: 'クリックヒートマップ・セッション再生・ファネルは、お客様がサイトを訪れると自動で記録されます。数日から1週間で本格的な分析が始まります。',
      hint: 'SNSや広告でサイトへの訪問を増やすと、AIが自動でおすすめアクションを提案できるようになります。',
      metrics: [],
      ctas: [
        { label: '🎁 キャンペーンを作る', tab: 'marketing' },
        { label: '🖼 トップページを編集', tab: 'homepage' },
      ],
    });
  }

  const result: InsightsResult = {
    days,
    insights: insights.slice(0, 5),
    meta: {
      totalSessions: funnel.totalSessions,
      productPathsAnalyzed: funnel.topProductPaths.length,
      cartPathsAnalyzed: funnel.topCartPaths.length,
    },
  };
  cachedInsights = { ts: now, key: cacheKey, result };
  return result;
}

/** テスト用: insights キャッシュをリセット */
export function _resetInsightsCache(): void {
  cachedInsights = null;
}
