/**
 * AdminMarketing Tab — Marketing Campaigns
 */

import { useState, useEffect } from 'react';
import { color } from '~/lib/design-tokens';
import { CompactKPI } from '~/components/admin/CompactKPI';

export default function AdminMarketing() {
  const [campaigns, setCampaigns] = useState<unknown[]>([]);
  const [discountCodes, setDiscountCodes] = useState<unknown[]>([]);
  const [saleCalendar, setSaleCalendar] = useState<unknown[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({active: 0, planned: 0, completed: 0});
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<'campaigns' | 'codes' | 'calendar'>('campaigns');

  useEffect(() => {
    fetch('/api/admin/campaigns').then(r => r.json()).then((d: unknown) => {
      const data = d as { campaigns?: unknown[]; discountCodes?: unknown[]; saleCalendar?: unknown[]; stats?: Record<string, number> };
      setCampaigns(data.campaigns || []);
      setDiscountCodes(data.discountCodes || []);
      setSaleCalendar(data.saleCalendar || []);
      setStats(data.stats || {active: 0, planned: 0, completed: 0});
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{color: color.textMuted, textAlign: 'center', padding: 60}}>読み込み中...</div>;

  const subTabs = [
    {key: 'campaigns' as const, label: '📣 キャンペーン', count: campaigns.length},
    {key: 'codes' as const, label: '🏷️ 割引コード', count: discountCodes.length},
    {key: 'calendar' as const, label: '📅 セールカレンダー', count: saleCalendar.length},
  ];

  return (
    <div>
      <div style={{display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap'}}>
        <CompactKPI label="ACTIVE" value={String(stats.active)} accent={color.green} />
        <CompactKPI label="PLANNED" value={String(stats.planned)} accent={color.cyan} />
        <CompactKPI label="COMPLETED" value={String(stats.completed)} accent={color.textMuted} />
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

      {subTab === 'campaigns' && (
        <div>
          {campaigns.length === 0 ? (
            <div style={{background: color.bg1, borderRadius: 12, border: `1px solid ${color.border}`, padding: 40, textAlign: 'center'}}>
              <div style={{fontSize: 32, marginBottom: 12}}>📣</div>
              <div style={{color: color.textMuted, fontSize: 13}}>キャンペーンはまだありません</div>
              <div style={{color: color.textDim, fontSize: 11, marginTop: 8}}>PromotionAgentが稼働するとキャンペーンが自動生成されます</div>
            </div>
          ) : (
            <div style={{display: 'grid', gap: 12}}>
              {campaigns.map((c: Record<string, unknown>, i: number) => (
                <div key={i} style={{background: color.bg1, borderRadius: 12, border: `1px solid ${color.border}`, padding: 16}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <div style={{fontSize: 13, fontWeight: 700, color: color.text}}>{c.name || '無名キャンペーン'}</div>
                    <span style={{
                      fontSize: 10, padding: '4px 10px', borderRadius: 20, fontWeight: 700,
                      background: c.status === 'active' ? 'rgba(0,230,118,.1)' : c.status === 'planned' ? 'rgba(0,240,255,.1)' : 'rgba(255,255,255,.05)',
                      color: c.status === 'active' ? color.green : c.status === 'planned' ? color.cyan : color.textMuted,
                    }}>
                      {c.status === 'active' ? '実施中' : c.status === 'planned' ? '予定' : '完了'}
                    </span>
                  </div>
                  {c.budget && <div style={{fontSize: 11, color: color.textMuted, marginTop: 6}}>予算: ¥{Number(c.budget).toLocaleString()}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'codes' && (
        <div>
          {discountCodes.length === 0 ? (
            <div style={{background: color.bg1, borderRadius: 12, border: `1px solid ${color.border}`, padding: 40, textAlign: 'center'}}>
              <div style={{fontSize: 32, marginBottom: 12}}>🏷️</div>
              <div style={{color: color.textMuted, fontSize: 13}}>割引コードはまだありません</div>
            </div>
          ) : (
            <div style={{background: color.bg1, borderRadius: 12, border: `1px solid ${color.border}`, overflow: 'hidden'}}>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px', padding: '10px 14px', borderBottom: `1px solid ${color.border}`, fontSize: 10, fontWeight: 700, color: color.textDim}}>
                <div>コード</div><div style={{textAlign:'right'}}>割引率</div><div style={{textAlign:'right'}}>使用回数</div><div style={{textAlign:'right'}}>有効期限</div>
              </div>
              {discountCodes.map((dc: Record<string, unknown>, i: number) => (
                <div key={i} style={{display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px', padding: '8px 14px', borderBottom: `1px solid ${color.border}`, fontSize: 11, color: color.text}}>
                  <div style={{fontWeight: 700, fontFamily: 'monospace'}}>{dc.code}</div>
                  <div style={{textAlign:'right', color: color.cyan}}>{dc.discount || '—'}%</div>
                  <div style={{textAlign:'right', color: color.textMuted}}>{dc.usageCount || 0}</div>
                  <div style={{textAlign:'right', color: color.textMuted, fontSize: 10}}>{dc.expiresAt ? new Date(dc.expiresAt).toLocaleDateString('ja-JP') : '無期限'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'calendar' && (
        <div style={{display: 'grid', gap: 12}}>
          {saleCalendar.map((s: Record<string, unknown>, i: number) => {
            const now = Date.now();
            const isActive = s.startDate <= now && s.endDate >= now;
            const isPast = s.endDate < now;
            return (
              <div key={i} style={{
                background: color.bg1, borderRadius: 12, padding: 16,
                border: `1px solid ${isActive ? color.green : color.border}`,
                opacity: isPast ? 0.5 : 1,
              }}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <div>
                    <div style={{fontSize: 13, fontWeight: 700, color: color.text}}>{s.name}</div>
                    <div style={{fontSize: 10, color: color.textMuted, marginTop: 4}}>
                      {new Date(s.startDate).toLocaleDateString('ja-JP')} 〜 {new Date(s.endDate).toLocaleDateString('ja-JP')}
                    </div>
                  </div>
                  <div style={{textAlign: 'right'}}>
                    <div style={{fontSize: 18, fontWeight: 900, color: color.cyan}}>{s.discountRate}%</div>
                    <div style={{fontSize: 9, color: isActive ? color.green : isPast ? color.textDim : color.yellow}}>
                      {isActive ? '🟢 開催中' : isPast ? '終了' : '予定'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
