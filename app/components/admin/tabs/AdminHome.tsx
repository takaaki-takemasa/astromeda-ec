/**
 * AdminHome Tab — Executive Summary
 * 経営サマリータブコンポーネント（売上・KPI・Agent健全性）
 */

import { useState } from 'react';
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
}: AdminHomeProps) {
  const [showTechDetails, setShowTechDetails] = useState(false);
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

  const alerts: Array<{level: 'critical' | 'warning' | 'info'; text: string}> = [];
  if (metrics.andonStatus === 'red') alerts.push({level: 'critical', text: 'Andon発動中 — 全Agent停止中'});
  if (pendingApprovals > 0) alerts.push({level: 'warning', text: `承認待ち ${pendingApprovals}件 — 対応が必要です`});
  if (errorAgents.length > 0) alerts.push({level: 'warning', text: `Agent異常 ${errorAgents.length}件 — ${errorAgents.map(a => a.name).join(', ')}`});
  if (errorPipelines.length > 0) alerts.push({level: 'warning', text: `Pipeline異常 ${errorPipelines.length}件`});
  if (revenue7d.isMock) alerts.push({level: 'info', text: 'Shopify API未接続 — 売上データはまだ取得できません'});

  return (
    <div>
      {/* ── アラートバナー ── */}
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

      {/* ── 売上 KPI（最重要）── */}
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
