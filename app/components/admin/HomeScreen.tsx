/**
 * HomeScreen — CEO 3秒レビュー画面
 * Stripe Dashboard風: 大きなKPI、トレンドライン、アラート、マイルストーン
 */
import { useState, useEffect, useMemo } from 'react';
import { color, font, radius, formatJPY, formatPct, timeAgo, chartPalette } from '~/lib/design-tokens';
import { KPICard } from './KPICard';
import { SectionCard } from './Card';
import { Badge } from './Badge';
import { ProgressBar } from './ProgressBar';
import { HorizontalBar, DonutChart, ChartLegend } from './MiniChart';
import { SalesTrendChart, ChannelDonut } from './RechartsWidgets';

interface HomeScreenProps {
  metrics: {
    andonStatus: 'green' | 'yellow' | 'red';
    totalAgents: number;
    activeAgents: number;
    healthyAgents: number;
    totalPipelines: number;
    activePipelines: number;
    eventsPerMinute: number;
    cascadesActive: number;
    feedbackRecords: number;
    uptime: number;
  };
  agents: Array<{
    id: string; name: string; status: string; errorCount: number;
  }>;
  pipelines: Array<{
    id: string; name: string; status: string; successRate: number;
  }>;
  revenueToday?: { totalRevenue: number; orderCount: number; averageOrderValue: number; isMock: boolean };
  revenue7d: { totalRevenue: number; orderCount: number; averageOrderValue: number; isMock: boolean };
  revenue30d: { totalRevenue: number; orderCount: number; averageOrderValue: number; isMock: boolean };
  revenue365d?: { totalRevenue: number; orderCount: number; averageOrderValue: number; isMock: boolean };
  attribution: { totalRevenue: number; topChannels: Array<{ channel: string; revenue: number; orders: number }> };
  pendingApprovals: number;
  onNavigate?: (section: string) => void;
}

export function HomeScreen({
  metrics, agents, pipelines, revenueToday, revenue7d, revenue30d, revenue365d, attribution, pendingApprovals, onNavigate,
}: HomeScreenProps) {
  const healthyPct = metrics.activeAgents > 0 ? Math.round((metrics.healthyAgents / metrics.activeAgents) * 100) : 100;
  const errorAgents = agents.filter(a => a.status === 'error' || a.status === 'degraded');
  const errorPipelines = pipelines.filter(p => p.status === 'error');

  const dailyAvg = revenue7d.orderCount > 0 ? Math.round(revenue7d.totalRevenue / 7) : 0;
  // 年間実績: 365日データがあれば実データ、なければ7日平均からの推計
  const yearlyActual = revenue365d && !revenue365d.isMock ? revenue365d.totalRevenue : 0;
  const yearlyEstimate = yearlyActual > 0 ? yearlyActual : dailyAvg * 365;
  const target10B = 10_000_000_000;
  const targetPct = yearlyEstimate > 0 ? (yearlyEstimate / target10B) * 100 : 0;

  // 前週比（30日売上から前週平均を算出して比較）
  const prevWeekAvg = revenue30d.totalRevenue > 0 && revenue7d.totalRevenue > 0
    ? (revenue30d.totalRevenue - revenue7d.totalRevenue) / 3  // 残り23日を3週で割る
    : 0;
  const weekOverWeek = prevWeekAvg > 0
    ? ((revenue7d.totalRevenue - prevWeekAvg) / prevWeekAvg) * 100
    : 0;

  // 今日の売上
  const todayRevenue = revenueToday && !revenueToday.isMock ? revenueToday.totalRevenue : 0;
  const todayOrders = revenueToday && !revenueToday.isMock ? revenueToday.orderCount : 0;
  const isTodayLive = revenueToday ? !revenueToday.isMock : false;

  // アラート
  const alerts: Array<{ level: 'critical' | 'warning' | 'info'; text: string }> = [];
  if (metrics.andonStatus === 'red') alerts.push({ level: 'critical', text: 'Andon発動中 — 全Agent緊急停止' });
  if (pendingApprovals > 0) alerts.push({ level: 'warning', text: `${pendingApprovals}件の承認が待機中` });
  if (errorAgents.length > 0) alerts.push({ level: 'warning', text: `Agent異常: ${errorAgents.map(a => a.name).join(', ')}` });
  if (errorPipelines.length > 0) alerts.push({ level: 'warning', text: `Pipeline異常 ${errorPipelines.length}件` });

  // Recharts 用トレンドデータ（実データベース: 7日平均を日別に表示）
  const dayLabels = ['月', '火', '水', '木', '金', '土', '日'];
  const trendData = dayLabels.map((label, i) => ({
    label,
    revenue: revenue7d.isMock ? 0 : Math.round(revenue7d.totalRevenue / 7),
    orders: revenue7d.isMock ? 0 : Math.round(revenue7d.orderCount / 7),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ── AI Briefing（3秒サマリー）── */}
      <div style={{
        background: `linear-gradient(135deg, ${color.cyanDim}, rgba(0,128,255,.08))`,
        border: `1px solid ${color.borderHover}`,
        borderRadius: radius.lg,
        padding: '16px 24px',
        display: 'flex', alignItems: 'center', gap: '16px',
      }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: radius.md,
          background: color.cyanDim, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '18px', flexShrink: 0,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color.cyan} strokeWidth="2" strokeLinecap="round">
            <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: font.xs, color: color.cyan, fontWeight: font.semibold, marginBottom: '2px' }}>
            AI ブリーフィング
          </div>
          <div style={{ fontSize: font.sm, color: color.textSecondary, lineHeight: font.relaxed }}>
            {revenue7d.isMock
              ? 'Shopify API接続待ち。接続後、売上・注文データがリアルタイムで表示されます。'
              : `7日間売上 ${formatJPY(revenue7d.totalRevenue)}（${revenue7d.orderCount}件）。Agent ${metrics.healthyAgents}/${metrics.activeAgents} 正常稼働。${pendingApprovals > 0 ? `承認待ち${pendingApprovals}件あり。` : ''}`
            }
          </div>
        </div>
      </div>

      {/* ── アラートバナー ── */}
      {alerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {alerts.map((alert, i) => (
            <div key={i} style={{
              padding: '10px 16px', borderRadius: radius.md,
              background: alert.level === 'critical' ? color.redDim
                : alert.level === 'warning' ? color.yellowDim : color.cyanDim,
              border: `1px solid ${alert.level === 'critical' ? 'rgba(255,45,85,.3)'
                : alert.level === 'warning' ? 'rgba(255,179,0,.2)' : 'rgba(0,240,255,.15)'}`,
              display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke={alert.level === 'critical' ? color.red : alert.level === 'warning' ? color.yellow : color.cyan}
                strokeWidth="2" strokeLinecap="round">
                {alert.level === 'critical'
                  ? <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  : <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                }
              </svg>
              <span style={{
                fontSize: font.sm, fontWeight: font.semibold,
                color: alert.level === 'critical' ? color.red : alert.level === 'warning' ? color.yellow : color.textMuted,
              }}>
                {alert.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Hero KPI ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
      }}>
        <KPICard
          label="本日売上"
          value={isTodayLive ? formatJPY(todayRevenue) : '—'}
          accentColor={color.cyan}
          subtitle={isTodayLive ? `${todayOrders}件` : 'API接続待ち'}
        />
        <KPICard
          label="7日間売上"
          value={revenue7d.isMock ? '—' : formatJPY(revenue7d.totalRevenue)}
          trend={!revenue7d.isMock && weekOverWeek !== 0 ? { value: Math.round(weekOverWeek * 10) / 10, label: '前週比' } : undefined}
          accentColor={color.green}
          subtitle={revenue7d.isMock ? 'API接続待ち' : `${revenue7d.orderCount}件`}
        />
        <KPICard
          label="30日間売上"
          value={revenue30d.isMock ? '—' : formatJPY(revenue30d.totalRevenue)}
          accentColor={color.orange}
          subtitle={revenue30d.isMock ? 'API接続待ち' : `AOV ${formatJPY(revenue30d.averageOrderValue)}`}
        />
        <KPICard
          label="Agent稼働率"
          value={`${healthyPct}%`}
          accentColor={healthyPct >= 90 ? color.green : healthyPct >= 70 ? color.yellow : color.red}
          subtitle={`${metrics.healthyAgents}/${metrics.activeAgents} 正常`}
        />
      </div>

      {/* ── 売上トレンド（Recharts） ── */}
      <SectionCard
        title="7日間売上トレンド"
        subtitle={revenue7d.isMock ? 'モックデータ' : `合計 ${formatJPY(revenue7d.totalRevenue)}`}
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3v18h18" /><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
          </svg>
        }
      >
        <SalesTrendChart data={trendData} height={200} />
      </SectionCard>

      {/* ── メインコンテンツ 2カラム（レスポンシブ） ── */}
      <style dangerouslySetInnerHTML={{__html: `
        @media(max-width:767px){
          .admin-home-2col{grid-template-columns:1fr !important;}
        }
      `}} />
      <div className="admin-home-2col" style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 360px',
        gap: '16px',
        alignItems: 'start',
      }}>
        {/* 左カラム */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 100億目標 */}
          <SectionCard
            title="100億円ロードマップ"
            subtitle={`年間推定 ${formatJPY(yearlyEstimate)} / 目標 ¥100億`}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            }
          >
            <ProgressBar
              value={targetPct}
              max={100}
              height={8}
              showValue
              thresholds={{ warn: 30, danger: 10 }}
            />
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginTop: '16px',
            }}>
              {[
                { label: '月商1千万', target: 120_000_000 },
                { label: '月商5千万', target: 600_000_000 },
                { label: '年商10億', target: 1_000_000_000 },
                { label: '年商50億', target: 5_000_000_000 },
                { label: '年商100億', target: 10_000_000_000 },
              ].map(ms => {
                const pct = yearlyEstimate > 0 ? Math.min(100, (yearlyEstimate / ms.target) * 100) : 0;
                const done = pct >= 100;
                return (
                  <div key={ms.label} style={{ textAlign: 'center' }}>
                    <div style={{
                      fontSize: font.xs, fontWeight: font.bold,
                      color: done ? color.green : pct > 50 ? color.yellow : color.textDim,
                      marginBottom: '4px',
                    }}>
                      {done ? '達成' : `${pct.toFixed(0)}%`}
                    </div>
                    <ProgressBar value={pct} height={4} barColor={done ? color.green : undefined} />
                    <div style={{ fontSize: '10px', color: color.textDim, marginTop: '4px' }}>{ms.label}</div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          {/* チャネル売上（Recharts ドーナツ） */}
          {attribution.topChannels.length > 0 && (
            <SectionCard
              title="チャネル別売上"
              subtitle="30日間のアトリビューション"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                  <path d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                </svg>
              }
            >
              <ChannelDonut data={attribution.topChannels.slice(0, 6)} height={180} />
            </SectionCard>
          )}
        </div>

        {/* 右カラム */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* システムヘルス */}
          <SectionCard
            title="システムヘルス"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: font.sm, color: color.textSecondary }}>Agent</span>
                <Badge
                  variant={healthyPct >= 90 ? 'success' : healthyPct >= 70 ? 'warning' : 'error'}
                  dot pulse={healthyPct < 90}
                >
                  {`${metrics.healthyAgents}/${metrics.activeAgents} 正常`}
                </Badge>
              </div>
              <ProgressBar
                value={healthyPct}
                barColor={healthyPct >= 90 ? color.green : healthyPct >= 70 ? color.yellow : color.red}
                height={4}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: font.sm, color: color.textSecondary }}>Pipeline</span>
                <Badge
                  variant={errorPipelines.length === 0 ? 'success' : 'warning'}
                  dot
                >
                  {`${metrics.activePipelines}/${metrics.totalPipelines} 稼働`}
                </Badge>
              </div>
              <ProgressBar
                value={metrics.totalPipelines > 0 ? (metrics.activePipelines / metrics.totalPipelines) * 100 : 100}
                barColor={errorPipelines.length === 0 ? color.green : color.yellow}
                height={4}
              />

              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px',
              }}>
                <div style={{
                  padding: '8px 12px', borderRadius: radius.md,
                  background: 'rgba(255,255,255,.03)',
                }}>
                  <div style={{ fontSize: '10px', color: color.textDim }}>イベント/分</div>
                  <div style={{ fontSize: font.md, fontWeight: font.bold, color: color.text, fontFamily: font.mono }}>
                    {metrics.eventsPerMinute}
                  </div>
                </div>
                <div style={{
                  padding: '8px 12px', borderRadius: radius.md,
                  background: 'rgba(255,255,255,.03)',
                }}>
                  <div style={{ fontSize: '10px', color: color.textDim }}>稼働時間</div>
                  <div style={{ fontSize: font.md, fontWeight: font.bold, color: color.text, fontFamily: font.mono }}>
                    {metrics.uptime > 3600 ? `${Math.floor(metrics.uptime / 3600)}h` : `${Math.floor(metrics.uptime / 60)}m`}
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* 承認待ち */}
          {pendingApprovals > 0 && (
            <SectionCard
              title="承認待ち"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: radius.md,
                background: color.yellowDim, border: `1px solid rgba(255,179,0,.15)`,
              }}>
                <div>
                  <div style={{ fontSize: font.lg, fontWeight: font.bold, color: color.yellow }}>
                    {pendingApprovals}件
                  </div>
                  <div style={{ fontSize: font.xs, color: color.textMuted }}>対応を待っています</div>
                </div>
                <button
                  onClick={() => onNavigate?.('operations')}
                  style={{
                    padding: '6px 14px', borderRadius: radius.md,
                    background: color.yellow, color: '#000', border: 'none',
                    fontSize: font.xs, fontWeight: font.semibold, cursor: 'pointer',
                    fontFamily: font.family,
                  }}
                >
                  確認する
                </button>
              </div>
            </SectionCard>
          )}

          {/* 異常Agent */}
          {errorAgents.length > 0 && (
            <SectionCard
              title="異常Agent"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color.red} strokeWidth="2">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {errorAgents.slice(0, 5).map(a => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 10px', borderRadius: radius.sm,
                    background: 'rgba(255,255,255,.02)',
                  }}>
                    <span style={{ fontSize: font.xs, color: color.textSecondary }}>{a.name}</span>
                    <Badge variant={a.status === 'error' ? 'error' : 'warning'} size="sm" dot>
                      {a.status === 'error' ? 'エラー' : '低下'}
                    </Badge>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
