/**
 * AdminAnalytics Tab — Data Analytics & Reports
 */

import { useState, useEffect } from 'react';
import { color } from '~/lib/design-tokens';
import { AdminListSkeleton, AdminEmptyCard } from '~/components/admin/ds/InlineListState';

export default function AdminAnalytics() {
  const [reports, setReports] = useState<unknown[]>([]);
  const [insights, setInsights] = useState<unknown[]>([]);
  const [funnel, setFunnel] = useState<unknown>(null);
  const [agentStatus, setAgentStatus] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<'insights' | 'funnel' | 'reports'>('insights');

  useEffect(() => {
    fetch('/api/admin/reports').then(r => r.json()).then((d: unknown) => {
      const data = d as { reports?: unknown[]; insights?: unknown[]; funnel?: unknown; agentStatus?: Record<string, boolean> };
      setReports(data.reports || []);
      setInsights(data.insights || []);
      setFunnel(data.funnel ?? null);
      setAgentStatus(data.agentStatus || {});
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <AdminListSkeleton rows={5} />;

  const subTabs = [
    {key: 'insights' as const, label: '💡 インサイト', count: insights.length},
    {key: 'funnel' as const, label: '📊 ファネル', count: funnel?.steps?.length || 0},
    {key: 'reports' as const, label: '📋 レポート', count: reports.length},
  ];

  return (
    <div>
      <div style={{display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap'}}>
        {[
          {label: 'DataAnalyst', active: agentStatus.dataAnalyst},
          {label: 'InsightAgent', active: agentStatus.insightAgent},
          {label: 'ConversionAgent', active: agentStatus.conversionAgent},
        ].map(a => (
          <div key={a.label} style={{
            background: color.bg1, borderRadius: 8, border: `1px solid ${color.border}`, padding: '6px 12px',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 10,
          }}>
            <span style={{width: 6, height: 6, borderRadius: '50%', background: a.active ? color.green : color.red}} />
            <span style={{color: color.textMuted, fontWeight: 600}}>{a.label}</span>
          </div>
        ))}
      </div>

      <div style={{display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap'}}>
        {subTabs.map(st => (
          <button key={st.key} onClick={() => setSubTab(st.key)} style={{
            padding: '8px 16px', borderRadius: 8, border: `1px solid ${subTab === st.key ? color.cyan : color.border}`,
            background: subTab === st.key ? 'rgba(0,240,255,.08)' : color.bg1,
            color: subTab === st.key ? color.cyan : color.textMuted, fontSize: 12, cursor: 'pointer', fontWeight: 700,
          }}>
            {st.label} ({st.count})
          </button>
        ))}
      </div>

      {subTab === 'insights' && (
        <div style={{display: 'grid', gap: 12}}>
          {insights.length === 0 ? (
            <AdminEmptyCard
              icon="💡"
              title="インサイトはまだありません"
              description="InsightAgent がユーザー行動・売上・コンバージョンを分析すると、ここにリスク警告・機会提案・改善アイデアが自動で並びます。"
            />
          ) : insights.map((ins: Record<string, unknown>, i: number) => (
            <div key={i} style={{
              background: color.bg1, borderRadius: 12, padding: 16,
              border: `1px solid ${ins.category === 'risk' ? 'rgba(255,45,85,.2)' : ins.category === 'opportunity' ? 'rgba(0,230,118,.2)' : color.border}`,
            }}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8}}>
                <div style={{fontSize: 13, fontWeight: 700, color: color.text}}>
                  {ins.category === 'risk' ? '⚠️' : ins.category === 'opportunity' ? '🎯' : '💡'} {ins.title}
                </div>
                <span style={{
                  fontSize: 9, padding: '3px 8px', borderRadius: 10, fontWeight: 700,
                  background: ins.impact === 'high' ? 'rgba(255,45,85,.1)' : ins.impact === 'medium' ? 'rgba(255,179,0,.1)' : 'rgba(255,255,255,.05)',
                  color: ins.impact === 'high' ? color.red : ins.impact === 'medium' ? color.yellow : color.textMuted,
                }}>
                  影響: {ins.impact}
                </span>
              </div>
              <div style={{fontSize: 11, color: color.textMuted, marginBottom: 8}}>{ins.description}</div>
              {ins.recommendation && (
                <div style={{fontSize: 11, color: color.cyan, background: 'rgba(0,240,255,.05)', borderRadius: 8, padding: '8px 12px'}}>
                  💡 推奨: {ins.recommendation}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {subTab === 'funnel' && funnel && (
        <div>
          <div style={{background: color.bg1, borderRadius: 12, border: `1px solid ${color.border}`, padding: 20, marginBottom: 20}}>
            <div style={{fontSize: 12, fontWeight: 700, color: color.text, marginBottom: 16}}>
              コンバージョンファネル <span style={{fontSize: 10, color: color.cyan, fontWeight: 600}}>（全体CVR: {funnel.overallConversionRate}%）</span>
            </div>
            {funnel.steps?.map((step: Record<string, unknown>, i: number) => {
              const maxUsers = funnel.steps[0]?.users || 1;
              const widthPct = Math.max((step.users / maxUsers) * 100, 8);
              return (
                <div key={i} style={{marginBottom: 12}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4}}>
                    <span style={{color: color.text, fontWeight: 600}}>Step {step.step}: {step.name}</span>
                    <span style={{color: color.cyan}}>{step.users.toLocaleString()} users</span>
                  </div>
                  <div style={{background: 'rgba(255,255,255,.04)', borderRadius: 6, height: 24, overflow: 'hidden', position: 'relative'}}>
                    <div style={{
                      width: `${widthPct}%`, height: '100%', borderRadius: 6,
                      background: `linear-gradient(90deg, ${color.cyan}, ${i === funnel.steps.length - 1 ? color.green : 'rgba(0,240,255,.4)'})`,
                      transition: 'width .6s ease',
                    }} />
                    <span style={{position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: color.textMuted, fontWeight: 700}}>
                      {step.conversionRate}%
                    </span>
                  </div>
                  {step.dropoffRate > 0 && i > 0 && (
                    <div style={{fontSize: 9, color: color.red, marginTop: 2, textAlign: 'right'}}>
                      ▼ 離脱 {step.dropoffRate}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {subTab === 'reports' && (
        <div>
          {reports.length === 0 ? (
            <AdminEmptyCard
              icon="📋"
              title="レポートはまだありません"
              description="DataAnalyst Agent が分析レポートを生成すると、ここにレポート一覧が表示されます。"
            />
          ) : (
            <div style={{display: 'grid', gap: 12}}>
              {reports.map((r: Record<string, unknown>, i: number) => (
                <div key={i} style={{background: color.bg1, borderRadius: 12, border: `1px solid ${color.border}`, padding: 16}}>
                  <div style={{fontSize: 13, fontWeight: 700, color: color.text}}>{r.title || 'レポート'}</div>
                  <div style={{fontSize: 11, color: color.textMuted, marginTop: 4}}>
                    {r.generatedAt ? new Date(r.generatedAt).toLocaleString('ja-JP') : '日時不明'}
                  </div>
                  {r.summary && <div style={{fontSize: 11, color: color.textMuted, marginTop: 8}}>{r.summary}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
