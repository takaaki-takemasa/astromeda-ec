/**
 * AdminHome Tab — 今日のお店日報 (Daily Store Report)
 *
 * patch 0122 (2026-04-23): Apple/Stripe CEO 視点 + 中学生でも分かる版に全面刷新。
 * - 「今日のお店日報」を最上部に配置（カート離脱/在庫/AOV/週次売上）
 * - 「今日やることTop3」を実データから自動生成（説明付き）
 * - 「これって何？」ツールチップでAOV/カート離脱率の意味を解説
 * - 既存の5KPIは規模把握用に下に残す
 * - 技術詳細はさらに下に折り畳み
 */

import { useEffect, useState } from 'react';
import { color, font, formatJPY } from '~/lib/design-tokens';
import { CompactKPI } from '~/components/admin/CompactKPI';
import { formatUptime, statusColor, statusLabel, andonColor } from '~/lib/admin-utils';
import type { AgentStatus, PipelineStatus, SystemMetrics, StorageStats, AttributionData, RevenueData } from '~/types/admin';

interface AdminHomeProps {
  metrics: SystemMetrics;
  agents: AgentStatus[];
  pipelines: PipelineStatus[];
  storageStats: StorageStats;
  attribution: AttributionData;
  revenueToday?: RevenueData;
  revenue7d: RevenueData;
  revenue30d: RevenueData;
  revenue365d?: RevenueData;
  pendingApprovals: number;
  onNavigate?: (section: string) => void;
  /**
   * patch 0126 Phase D: AI insight からの deep-link
   * tab だけでなく path/sid も渡せる（uxr ヒートマップ・sessions 再生に直接飛ぶ）
   */
  onDeepLink?: (target: { tab: string; path?: string; sid?: string }) => void;
}

// patch 0126 Phase D: AI insight 型
interface MarketingInsight {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  reason: string;
  hint: string;
  metrics: Array<{ label: string; value: string; tone?: 'red' | 'orange' | 'cyan' | 'green' }>;
  ctas: Array<{
    label: string;
    tab: 'funnel' | 'uxr' | 'sessions' | 'marketing' | 'products' | 'homepage';
    path?: string;
    sid?: string;
  }>;
}

interface InsightsData {
  success: boolean;
  days?: number;
  insights?: MarketingInsight[];
  meta?: {
    totalSessions: number;
    productPathsAnalyzed: number;
    cartPathsAnalyzed: number;
  };
}

// ── 「これって何？」ツールチップ（中学生向け説明） ──
function TermTooltip({ term, explain }: { term: string; explain: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{position: 'relative', display: 'inline-block'}}>
      <button
        type="button"
        aria-label={`${term} の説明を見る`}
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: 'rgba(0,240,255,.12)',
          border: `1px solid ${color.cyan}40`,
          color: color.cyan,
          fontSize: 10,
          fontWeight: 800,
          cursor: 'help',
          padding: 0,
          marginLeft: 4,
          verticalAlign: 'middle',
        }}
      >?</button>
      {open && (
        <span style={{
          position: 'absolute',
          bottom: 'calc(100% + 6px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1A1A2E',
          color: color.text,
          fontSize: 11,
          fontWeight: 500,
          lineHeight: 1.5,
          padding: '8px 12px',
          borderRadius: 8,
          border: `1px solid ${color.cyan}40`,
          boxShadow: '0 4px 12px rgba(0,0,0,.4)',
          whiteSpace: 'normal',
          width: 240,
          zIndex: 50,
          textAlign: 'left',
        }}>
          <span style={{fontWeight: 800, color: color.cyan, display: 'block', marginBottom: 2}}>{term} とは？</span>
          {explain}
        </span>
      )}
    </span>
  );
}

// ── API レスポンス型 ──
interface CartAbandonmentData {
  success: boolean;
  abandonmentRate?: number;
  totalCheckouts?: number;
  abandonedCheckouts?: number;
  completedCheckouts?: number;
  abandonedValue?: number;
  recentAbandoned?: Array<{ id: string; createdAt: string; totalPrice: number; customerEmail?: string }>;
}

interface InventoryAlertsData {
  success: boolean;
  alerts?: Array<{
    productId: string;
    productTitle: string;
    handle: string;
    inventoryQuantity: number;
    severity: 'critical' | 'warning' | 'info';
  }>;
  summary?: { total: number; critical: number; warning: number };
}

export default function AdminHome({
  metrics,
  agents,
  pipelines,
  storageStats,
  attribution,
  revenueToday,
  revenue7d,
  revenue30d,
  revenue365d,
  pendingApprovals,
  onNavigate,
  onDeepLink,
}: AdminHomeProps) {
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [cartData, setCartData] = useState<CartAbandonmentData | null>(null);
  const [invData, setInvData] = useState<InventoryAlertsData | null>(null);
  const [loadingDaily, setLoadingDaily] = useState(true);
  // patch 0126 Phase D: AI マーケアシスタント insights
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(true);

  // ── 「今日のお店日報」用データ取得（カート離脱 + 在庫アラート） ──
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetch('/api/admin/cart-abandonment?days=30', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/admin/inventory-alerts?threshold=5', { credentials: 'include' }).then(r => r.json()),
    ]).then(([cart, inv]) => {
      if (cancelled) return;
      if (cart.status === 'fulfilled') setCartData(cart.value as CartAbandonmentData);
      if (inv.status === 'fulfilled') setInvData(inv.value as InventoryAlertsData);
      setLoadingDaily(false);
    });
    return () => { cancelled = true; };
  }, []);

  // patch 0126 Phase D: AI insight 取得（自社製 UXR + funnel からルールベース生成）
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/uxr?action=insights&days=7', { credentials: 'include' })
      .then((r) => r.json() as Promise<InsightsData>)
      .then((j) => {
        if (cancelled) return;
        setInsightsData(j);
        setLoadingInsights(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadingInsights(false);
      });
    return () => { cancelled = true; };
  }, []);

  const healthyPct = metrics.activeAgents > 0 ? Math.round((metrics.healthyAgents / metrics.activeAgents) * 100) : 100;
  const errorAgents = agents.filter(a => a.status === 'error' || a.status === 'degraded');
  const errorPipelines = pipelines.filter(p => p.status === 'error');

  const fmtYen = (n: number) => {
    if (n === 0) return '—';
    if (n >= 100000000) return `¥${(n / 100000000).toFixed(2)}億`;
    if (n >= 10000) return `¥${(n / 10000).toFixed(0)}万`;
    return `¥${n.toLocaleString()}`;
  };

  const dailyAvg = revenue7d.orderCount > 0 ? Math.round(revenue7d.totalRevenue / 7) : 0;
  const yearlyActual = revenue365d && !revenue365d.isMock ? revenue365d.totalRevenue : 0;
  const yearlyEstimate = yearlyActual > 0 ? yearlyActual : dailyAvg * 365;
  const target = 10000000000;
  const targetPct = yearlyEstimate > 0 ? Math.min(100, (yearlyEstimate / target) * 100) : 0;

  // 本日売上
  const todayRevenue = revenueToday && !revenueToday.isMock ? revenueToday.totalRevenue : 0;
  const todayOrders = revenueToday && !revenueToday.isMock ? revenueToday.orderCount : 0;
  const isTodayLive = revenueToday ? !revenueToday.isMock : false;

  // ── 「今日のお店日報」用の派生指標 ──
  const abRate = cartData?.success ? (cartData.abandonmentRate ?? 0) : 0;
  const abValue = cartData?.success ? (cartData.abandonedValue ?? 0) : 0;
  const abCount = cartData?.success ? (cartData.abandonedCheckouts ?? 0) : 0;
  const invTotal = invData?.success ? (invData.summary?.total ?? 0) : 0;
  const invCritical = invData?.success ? (invData.summary?.critical ?? 0) : 0;
  const aov = revenue7d.averageOrderValue || revenue30d.averageOrderValue || 0;

  // ── 「今日やることTop3」自動生成 ──
  const todoList: Array<{ rank: number; title: string; reason: string; cta: string; ctaUrl?: string; ctaSection?: string; severity: 'critical' | 'warning' | 'info' }> = [];

  // 優先度1: カート離脱が高い（最大の機会損失）
  if (abRate >= 60 && abCount >= 5) {
    todoList.push({
      rank: 1,
      title: `カート離脱を減らそう (${abRate.toFixed(0)}% 離脱中)`,
      reason: `お客様が商品をカートに入れたあと、${abCount}人が買わずに帰ってしまっています。失った金額は ${fmtYen(abValue)}。送料無料キャンペーンや「あと少しで送料無料」表示で背中を押せます。`,
      cta: '🎁 キャンペーンを作る',
      ctaSection: 'marketing',
      severity: 'critical',
    });
  }

  // 優先度2: 在庫アラート
  if (invTotal > 0) {
    todoList.push({
      rank: todoList.length + 1,
      title: `在庫が少ない商品が ${invTotal}件 あります`,
      reason: invCritical > 0
        ? `そのうち ${invCritical}件 はもう在庫ゼロです。Shopify管理画面から早めに補充しましょう。在庫切れ商品は売れません。`
        : `早めに補充しないと、人気商品なら数日で売り切れます。Shopify管理画面で確認してください。`,
      cta: '📦 商品を確認',
      ctaSection: 'products',
      severity: invCritical > 0 ? 'critical' : 'warning',
    });
  }

  // 優先度3: 売上ゼロ → 集客 / 売上あり → AOV改善
  if (revenue7d.totalRevenue === 0 || revenue7d.orderCount === 0) {
    todoList.push({
      rank: todoList.length + 1,
      title: 'まずはお客様を呼び込もう',
      reason: '今週はまだ売上が立っていません。トップページのバナーを新作IPコラボに変える、SNSで告知する、Google広告を出すなどでお客様を呼び込みましょう。',
      cta: '🖼️ トップページを編集',
      ctaSection: 'homepage',
      severity: 'warning',
    });
  } else if (aov > 0 && aov < 30000) {
    todoList.push({
      rank: todoList.length + 1,
      title: `お客様1人あたりの購入額を上げよう (今 ${fmtYen(aov)})`,
      reason: 'カートに「あわせ買い」のおすすめ商品を出すと、1人あたりの購入額が上がります。アクセサリーやキーボードを推薦してみましょう。',
      cta: '🛒 関連商品を設定',
      ctaSection: 'marketing',
      severity: 'info',
    });
  }

  // 優先度4: 承認待ち
  if (pendingApprovals > 0 && todoList.length < 3) {
    todoList.push({
      rank: todoList.length + 1,
      title: `承認待ちが ${pendingApprovals}件 あります`,
      reason: 'AIエージェントが「これやっていい？」と聞いています。確認して承認/却下しましょう。',
      cta: '👀 承認画面へ',
      ctaSection: 'agents',
      severity: 'warning',
    });
  }

  // フォールバック: 何もなければデータ取得状況を促す
  if (todoList.length === 0 && !loadingDaily) {
    todoList.push({
      rank: 1,
      title: '今のところ大きな問題はありません',
      reason: 'カート離脱・在庫・売上すべて健全です。新商品の追加やキャンペーン企画に時間を使いましょう。',
      cta: '📝 商品を追加',
      ctaSection: 'products',
      severity: 'info',
    });
  }

  const top3 = todoList.slice(0, 3);

  const alerts: Array<{level: 'critical' | 'warning' | 'info'; text: string}> = [];
  if (metrics.andonStatus === 'red') alerts.push({level: 'critical', text: 'Andon発動中 — 全Agent停止中'});
  if (errorAgents.length > 0) alerts.push({level: 'warning', text: `Agent異常 ${errorAgents.length}件 — ${errorAgents.map(a => a.name).join(', ')}`});
  if (errorPipelines.length > 0) alerts.push({level: 'warning', text: `Pipeline異常 ${errorPipelines.length}件`});
  if (revenue7d.isMock) alerts.push({level: 'info', text: 'Shopify API未接続 — 売上データはまだ取得できません'});

  // 日付フォーマット
  const today = new Date();
  const todayStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][today.getDay()];

  return (
    <div>
      {/* ════════════════════════════════════════════ */}
      {/* ── 🌟 今日のお店日報 (CEO/中学生 共通の入口) ── */}
      {/* ════════════════════════════════════════════ */}
      <section
        aria-labelledby="daily-report-heading"
        style={{
          background: `linear-gradient(135deg, ${color.bg1} 0%, rgba(0,240,255,.04) 100%)`,
          border: `1px solid ${color.cyan}30`,
          borderRadius: 20,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8}}>
          <h2 id="daily-report-heading" style={{fontSize: 22, fontWeight: 900, color: color.text, margin: 0, letterSpacing: -0.5}}>
            🌟 今日のお店日報
          </h2>
          <span style={{fontSize: 12, color: color.textMuted, fontWeight: 600}}>
            {todayStr} ({weekday}) · 過去30日のデータ
          </span>
        </div>

        {/* ── 4つの大きなカード（中学生でも一目で分かる） ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}>
          {/* (1) 過去7日 売上 */}
          <div style={{
            background: color.bg1,
            borderRadius: 14,
            border: `1px solid ${revenue7d.totalRevenue > 0 ? `${color.green}40` : color.border}`,
            padding: 18,
          }}>
            <div style={{fontSize: 11, color: color.textMuted, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center'}}>
              💰 今週の売上
              <TermTooltip term="今週の売上" explain="過去7日間でお店が売り上げた金額の合計です。お客様が決済を完了した注文の合計額。" />
            </div>
            <div style={{fontSize: 28, fontWeight: 900, color: revenue7d.totalRevenue > 0 ? color.green : color.textDim, lineHeight: 1.1}}>
              {fmtYen(revenue7d.totalRevenue)}
            </div>
            <div style={{fontSize: 11, color: color.textMuted, marginTop: 6}}>
              {revenue7d.orderCount}件の注文
            </div>
            <div style={{fontSize: 10, color: revenue7d.totalRevenue > 0 ? color.green : color.textDim, marginTop: 4, fontWeight: 600}}>
              {revenue7d.totalRevenue > 0 ? '✅ 売上が立っています' : '⚠️ まだ今週の売上はゼロです'}
            </div>
          </div>

          {/* (2) ⚠️ カート離脱（最重要・赤強調） */}
          <div style={{
            background: abRate >= 60 ? `${color.red}10` : color.bg1,
            borderRadius: 14,
            border: `2px solid ${abRate >= 60 ? color.red : abRate >= 30 ? color.orange : color.border}`,
            padding: 18,
            position: 'relative',
          }}>
            {abRate >= 60 && (
              <span style={{
                position: 'absolute',
                top: -10,
                right: 12,
                background: color.red,
                color: '#FFF',
                fontSize: 9,
                fontWeight: 900,
                padding: '3px 8px',
                borderRadius: 10,
                letterSpacing: 1,
              }}>
                最優先
              </span>
            )}
            <div style={{fontSize: 11, color: color.textMuted, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center'}}>
              🛒 カート離脱
              <TermTooltip term="カート離脱" explain="お客様が商品をカートに入れたのに、買わずにサイトを離れること。離脱率が高い＝買う気だった人を逃している＝大きな機会損失。" />
            </div>
            <div style={{fontSize: 28, fontWeight: 900, color: abRate >= 60 ? color.red : abRate >= 30 ? color.orange : color.textDim, lineHeight: 1.1}}>
              {loadingDaily ? '…' : cartData?.success ? `${abRate.toFixed(0)}%` : '—'}
            </div>
            <div style={{fontSize: 11, color: color.textMuted, marginTop: 6}}>
              {cartData?.success ? `${abCount}人がカート放置` : 'API取得中…'}
            </div>
            <div style={{fontSize: 11, color: abValue > 0 ? color.red : color.textDim, marginTop: 4, fontWeight: 700}}>
              {abValue > 0 ? `失った売上 ${fmtYen(abValue)}` : ''}
            </div>
          </div>

          {/* (3) 在庫アラート */}
          <div style={{
            background: invCritical > 0 ? `${color.orange}10` : color.bg1,
            borderRadius: 14,
            border: `1px solid ${invCritical > 0 ? `${color.orange}50` : invTotal > 0 ? `${color.yellow}40` : color.border}`,
            padding: 18,
          }}>
            <div style={{fontSize: 11, color: color.textMuted, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center'}}>
              📦 在庫アラート
              <TermTooltip term="在庫アラート" explain="在庫が少なくなった商品の数。0件なら安全。多い＝補充が必要＝放置すると売れない時間が増える。" />
            </div>
            <div style={{fontSize: 28, fontWeight: 900, color: invCritical > 0 ? color.orange : invTotal > 0 ? color.yellow : color.green, lineHeight: 1.1}}>
              {loadingDaily ? '…' : invData?.success ? `${invTotal}件` : '—'}
            </div>
            <div style={{fontSize: 11, color: color.textMuted, marginTop: 6}}>
              {invData?.success ? (invCritical > 0 ? `うち${invCritical}件は在庫ゼロ` : invTotal > 0 ? '在庫少 (補充推奨)' : '✅ 在庫は十分') : 'API取得中…'}
            </div>
          </div>

          {/* (4) AOV (お客様1人あたりの購入額) */}
          <div style={{
            background: color.bg1,
            borderRadius: 14,
            border: `1px solid ${color.border}`,
            padding: 18,
          }}>
            <div style={{fontSize: 11, color: color.textMuted, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center'}}>
              👤 お客様1人あたり
              <TermTooltip term="お客様1人あたり購入額 (AOV)" explain="1回の注文の平均金額。AOV (Average Order Value) とも言う。これが上がる＝お客様が高い商品を買ってくれる、または複数買ってくれる＝お店が儲かる。" />
            </div>
            <div style={{fontSize: 28, fontWeight: 900, color: aov > 0 ? color.cyan : color.textDim, lineHeight: 1.1}}>
              {fmtYen(aov)}
            </div>
            <div style={{fontSize: 11, color: color.textMuted, marginTop: 6}}>
              1回の注文の平均
            </div>
            <div style={{fontSize: 10, color: color.textDim, marginTop: 4}}>
              ゲーミングPC平均 ¥150,000+
            </div>
          </div>
        </div>

        {/* ── 🎯 今日やることTop3 ── */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
          }}>
            <span style={{fontSize: 16, fontWeight: 900, color: color.text}}>🎯 今日やることTop3</span>
            <span style={{fontSize: 10, color: color.textMuted, fontWeight: 600}}>
              データから自動おすすめ
            </span>
          </div>

          {loadingDaily && top3.length === 0 ? (
            <div style={{
              padding: 20,
              background: color.bg1,
              borderRadius: 12,
              border: `1px solid ${color.border}`,
              color: color.textMuted,
              fontSize: 13,
              textAlign: 'center',
            }}>
              データを読み込み中…
            </div>
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
              {top3.map((todo) => {
                const sevColor = todo.severity === 'critical' ? color.red : todo.severity === 'warning' ? color.orange : color.cyan;
                return (
                  <div
                    key={todo.rank}
                    style={{
                      background: color.bg1,
                      border: `1px solid ${sevColor}40`,
                      borderLeft: `4px solid ${sevColor}`,
                      borderRadius: 12,
                      padding: 16,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 14,
                    }}
                  >
                    <div style={{
                      flexShrink: 0,
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: `${sevColor}20`,
                      color: sevColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16,
                      fontWeight: 900,
                    }}>
                      {todo.rank}
                    </div>
                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{fontSize: 14, fontWeight: 800, color: color.text, marginBottom: 4}}>
                        {todo.title}
                      </div>
                      <div style={{fontSize: 12, color: color.textMuted, lineHeight: 1.6, marginBottom: 8}}>
                        <span style={{color: sevColor, fontWeight: 700}}>なぜ？ </span>
                        {todo.reason}
                      </div>
                      <button
                        type="button"
                        onClick={() => todo.ctaSection && onNavigate?.(todo.ctaSection)}
                        style={{
                          background: `${sevColor}15`,
                          border: `1px solid ${sevColor}50`,
                          borderRadius: 8,
                          padding: '6px 14px',
                          color: sevColor,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {todo.cta} →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════════ */}
      {/* ── 🤖 AI マーケアシスタント (patch 0126 Phase D) ── */}
      {/* ════════════════════════════════════════════ */}
      <section
        aria-labelledby="ai-insights-heading"
        style={{
          background: `linear-gradient(135deg, ${color.bg1} 0%, rgba(167,139,250,.04) 100%)`,
          border: `1px solid rgba(167,139,250,.30)`,
          borderRadius: 20,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8}}>
          <h2 id="ai-insights-heading" style={{fontSize: 20, fontWeight: 900, color: color.text, margin: 0, letterSpacing: -0.5}}>
            🤖 AI マーケアシスタント
            <span style={{fontSize: 11, color: color.textMuted, fontWeight: 600, marginLeft: 10, letterSpacing: 0}}>
              お客様の動きから自動でおすすめを生成
            </span>
          </h2>
          <span style={{fontSize: 11, color: color.textMuted, fontWeight: 600}}>
            過去{insightsData?.days ?? 7}日 ·
            セッション {insightsData?.meta?.totalSessions ?? 0} ·
            ページ {(insightsData?.meta?.productPathsAnalyzed ?? 0) + (insightsData?.meta?.cartPathsAnalyzed ?? 0)}
          </span>
        </div>

        {loadingInsights ? (
          <div style={{
            padding: 20,
            background: color.bg1,
            borderRadius: 12,
            border: `1px solid ${color.border}`,
            color: color.textMuted,
            fontSize: 13,
            textAlign: 'center',
          }}>
            お客様の動きを分析中…
          </div>
        ) : (insightsData?.insights ?? []).length === 0 ? (
          <div style={{
            padding: 20,
            background: color.bg1,
            borderRadius: 12,
            border: `1px solid ${color.border}`,
            color: color.textMuted,
            fontSize: 13,
            textAlign: 'center',
          }}>
            まだおすすめできるデータがありません。お客様がサイトを訪れると、ここに自動でおすすめが表示されます。
          </div>
        ) : (
          <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
            {(insightsData?.insights ?? []).map((ins) => {
              const sevColor = ins.severity === 'critical' ? color.red : ins.severity === 'warning' ? color.orange : color.cyan;
              const sevIcon = ins.severity === 'critical' ? '🚨' : ins.severity === 'warning' ? '⚠️' : '💡';
              const toneColor = (t?: 'red' | 'orange' | 'cyan' | 'green') => {
                if (t === 'red') return color.red;
                if (t === 'orange') return color.orange;
                if (t === 'cyan') return color.cyan;
                if (t === 'green') return color.green;
                return color.textMuted;
              };
              return (
                <div
                  key={ins.id}
                  style={{
                    background: color.bg1,
                    border: `1px solid ${sevColor}40`,
                    borderLeft: `4px solid ${sevColor}`,
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <div style={{display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8}}>
                    <span style={{fontSize: 18, lineHeight: 1, flexShrink: 0}}>{sevIcon}</span>
                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{fontSize: 14, fontWeight: 800, color: color.text, marginBottom: 6}}>
                        {ins.title}
                      </div>
                      <div style={{fontSize: 12, color: color.textMuted, lineHeight: 1.6, marginBottom: 6}}>
                        <span style={{color: sevColor, fontWeight: 700}}>なぜ？ </span>
                        {ins.reason}
                      </div>
                      <div style={{fontSize: 12, color: color.textMuted, lineHeight: 1.6}}>
                        <span style={{color: color.cyan, fontWeight: 700}}>次にどうする？ </span>
                        {ins.hint}
                      </div>
                    </div>
                  </div>

                  {ins.metrics.length > 0 && (
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, marginLeft: 30}}>
                      {ins.metrics.map((m, i) => (
                        <span
                          key={i}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 10px',
                            borderRadius: 999,
                            background: `${toneColor(m.tone)}15`,
                            border: `1px solid ${toneColor(m.tone)}40`,
                            fontSize: 11,
                            fontWeight: 700,
                            color: toneColor(m.tone),
                          }}
                        >
                          <span style={{opacity: .8, fontWeight: 600}}>{m.label}:</span>
                          {m.value}
                        </span>
                      ))}
                    </div>
                  )}

                  {ins.ctas.length > 0 && (
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: 6, marginLeft: 30}}>
                      {ins.ctas.map((cta, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            if (onDeepLink) {
                              onDeepLink({ tab: cta.tab, path: cta.path, sid: cta.sid });
                            } else if (onNavigate) {
                              onNavigate(cta.tab);
                            }
                          }}
                          style={{
                            background: `${sevColor}15`,
                            border: `1px solid ${sevColor}50`,
                            borderRadius: 8,
                            padding: '6px 14px',
                            color: sevColor,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {cta.label} →
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── アラートバナー（システム異常など、ある時だけ） ── */}
      {alerts.length > 0 && (
        <div style={{marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 6}}>
          {alerts.map((alert, i) => (
            <div key={i} style={{
              padding: '10px 16px',
              borderRadius: 10,
              background: alert.level === 'critical' ? `${color.red}12` : alert.level === 'warning' ? `${color.orange}10` : `${color.cyan}08`,
              border: `1px solid ${alert.level === 'critical' ? `${color.red}40` : alert.level === 'warning' ? `${color.orange}30` : `${color.cyan}20`}`,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span style={{fontSize: 14}}>
                {alert.level === 'critical' ? '🚨' : alert.level === 'warning' ? '⚠️' : 'ℹ️'}
              </span>
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                color: alert.level === 'critical' ? color.red : alert.level === 'warning' ? color.orange : color.textMuted,
              }}>
                {alert.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── 売上 KPI（規模感の把握）── */}
      <div style={{marginBottom: 12}}>
        <div style={{fontSize: 11, fontWeight: 800, color: color.textDim, letterSpacing: 2, marginBottom: 10}}>
          📈 売上の規模感
        </div>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12,
        marginBottom: 24,
      }}>
        <div style={{background: color.bg1, borderRadius: 16, border: `1px solid ${isTodayLive ? `${color.cyan}40` : color.border}`, padding: 20}}>
          <div style={{fontSize: 10, color: color.textMuted, fontWeight: 600, letterSpacing: 1, marginBottom: 8}}>
            本日売上
          </div>
          <div style={{fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 900, color: isTodayLive ? color.cyan : color.textDim}}>
            {isTodayLive ? fmtYen(todayRevenue) : '—'}
          </div>
          <div style={{fontSize: 11, color: color.textMuted, marginTop: 6}}>
            {isTodayLive ? `${todayOrders}件` : 'API接続待ち'}
          </div>
        </div>

        <div style={{background: color.bg1, borderRadius: 16, border: `1px solid ${color.border}`, padding: 20}}>
          <div style={{fontSize: 10, color: color.textMuted, fontWeight: 600, letterSpacing: 1, marginBottom: 8}}>
            過去7日 売上
          </div>
          <div style={{fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 900, color: revenue7d.totalRevenue > 0 ? color.green : color.textDim}}>
            {fmtYen(revenue7d.totalRevenue)}
          </div>
          <div style={{fontSize: 11, color: color.textMuted, marginTop: 6}}>
            {revenue7d.orderCount}件 · AOV {fmtYen(revenue7d.averageOrderValue)}
          </div>
        </div>

        <div style={{background: color.bg1, borderRadius: 16, border: `1px solid ${color.border}`, padding: 20}}>
          <div style={{fontSize: 10, color: color.textMuted, fontWeight: 600, letterSpacing: 1, marginBottom: 8}}>
            過去30日 売上
          </div>
          <div style={{fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 900, color: revenue30d.totalRevenue > 0 ? color.cyan : color.textDim}}>
            {fmtYen(revenue30d.totalRevenue)}
          </div>
          <div style={{fontSize: 11, color: color.textMuted, marginTop: 6}}>
            {revenue30d.orderCount}件 · AOV {fmtYen(revenue30d.averageOrderValue)}
          </div>
        </div>

        <div style={{background: color.bg1, borderRadius: 16, border: `1px solid ${color.border}`, padding: 20}}>
          <div style={{fontSize: 10, color: color.textMuted, fontWeight: 600, letterSpacing: 1, marginBottom: 8}}>
            年間推定（現ペース）
          </div>
          <div style={{fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 900, color: yearlyEstimate > 0 ? color.yellow : color.textDim}}>
            {fmtYen(yearlyEstimate)}
          </div>
          <div style={{fontSize: 11, color: color.textMuted, marginTop: 6}}>
            日次平均 {fmtYen(dailyAvg)}
          </div>
        </div>

        <div style={{background: color.bg1, borderRadius: 16, border: `1px solid ${targetPct >= 100 ? `${color.green}40` : color.border}`, padding: 20}}>
          <div style={{fontSize: 10, color: color.textMuted, fontWeight: 600, letterSpacing: 1, marginBottom: 8}}>
            100億目標
          </div>
          <div style={{fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 900, color: targetPct >= 100 ? color.green : targetPct >= 50 ? color.yellow : color.orange}}>
            {targetPct.toFixed(1)}%
          </div>
          <div style={{height: 6, borderRadius: 3, background: 'rgba(255,255,255,.06)', marginTop: 10, overflow: 'hidden'}}>
            <div style={{
              height: '100%',
              width: `${Math.min(targetPct, 100)}%`,
              borderRadius: 3,
              background: targetPct >= 100 ? color.green : targetPct >= 50 ? color.yellow : color.orange,
              transition: 'width 1s ease',
            }} />
          </div>
          <div style={{fontSize: 9, color: color.textDim, marginTop: 6}}>目標: ¥100億 / 年</div>
        </div>
      </div>

      {/* ── システムヘルス概要（コンパクト）── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 10,
        marginBottom: 24,
      }}>
        <CompactKPI label="システム" value={metrics.andonStatus === 'green' ? '正常' : metrics.andonStatus === 'yellow' ? '注意' : '停止'} accent={andonColor(metrics.andonStatus)} />
        <CompactKPI label="AI Agent" value={`${metrics.activeAgents}体`} sub={`健全率 ${healthyPct}%`} accent={healthyPct >= 90 ? color.green : color.yellow} />
        <CompactKPI label="Pipeline" value={`${metrics.activePipelines}稼働`} accent={errorPipelines.length === 0 ? color.green : color.red} />
        <CompactKPI label="承認待ち" value={`${pendingApprovals}件`} accent={pendingApprovals > 0 ? color.orange : color.green} />
        <CompactKPI label="稼働時間" value={formatUptime(metrics.uptime)} accent={color.cyan} />
      </div>

      {/* ── チャネル別売上 ── */}
      {attribution.topChannels.length > 0 && (
        <div style={{marginBottom: 24}}>
          <div style={{fontSize: 11, fontWeight: 800, color: color.textDim, letterSpacing: 2, marginBottom: 10}}>
            CHANNEL ATTRIBUTION
          </div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10}}>
            {attribution.topChannels.slice(0, 5).map((ch) => (
              <div key={ch.channel} style={{
                background: color.bg1,
                borderRadius: 12,
                border: `1px solid ${color.border}`,
                padding: 14,
              }}>
                <div style={{fontSize: 10, color: color.textDim, fontWeight: 600, marginBottom: 4}}>
                  {ch.channel}
                </div>
                <div style={{fontSize: 18, fontWeight: 900, color: color.cyan}}>
                  {fmtYen(ch.revenue)}
                </div>
                <div style={{fontSize: 9, color: color.textMuted, marginTop: 2}}>
                  {ch.orders}注文
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 技術詳細（折りたたみ）── */}
      <div style={{marginTop: 24}}>
        <button
          type="button"
          onClick={() => setShowTechDetails(!showTechDetails)}
          style={{
            background: 'none',
            border: `1px solid ${color.border}`,
            borderRadius: 8,
            padding: '8px 16px',
            color: color.textDim,
            fontSize: 10,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: 1,
          }}
        >
          {showTechDetails ? '▼ 技術詳細を閉じる' : '▶ 技術詳細を表示'}
        </button>

        {showTechDetails && (
          <div style={{marginTop: 12}}>
            <div style={{fontSize: 10, fontWeight: 800, color: color.textDim, letterSpacing: 2, marginBottom: 8}}>
              AGENT STATUS
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 8,
              marginBottom: 20,
            }}>
              {agents.filter(a => a.status !== 'pending').map((agent) => (
                <div key={agent.id} style={{
                  background: color.bg1,
                  borderRadius: 8,
                  border: `1px solid ${color.border}`,
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: statusColor(agent.status),
                    flexShrink: 0,
                  }} />
                  <div style={{flex: 1, minWidth: 0}}>
                    <div style={{fontSize: 10, fontWeight: 700, color: color.text}}>{agent.name}</div>
                    <div style={{fontSize: 8, color: color.textDim}}>{agent.level} · {formatUptime(agent.uptime)}</div>
                  </div>
                  <span style={{fontSize: 8, fontWeight: 700, color: statusColor(agent.status)}}>
                    {statusLabel(agent.status)}
                  </span>
                </div>
              ))}
            </div>

            {Object.keys(storageStats.tables).length > 0 && (
              <div style={{marginBottom: 20}}>
                <div style={{fontSize: 10, fontWeight: 800, color: color.textDim, letterSpacing: 2, marginBottom: 8}}>
                  STORAGE
                </div>
                <div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
                  {Object.entries(storageStats.tables).map(([table, count]) => (
                    <div key={table} style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      background: color.bg1,
                      border: `1px solid ${color.border}`,
                    }}>
                      <span style={{fontSize: 8, color: color.textDim}}>{table}: </span>
                      <span style={{fontSize: 10, fontWeight: 800, color: color.cyan}}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
