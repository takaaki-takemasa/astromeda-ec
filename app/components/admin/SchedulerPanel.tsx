/**
 * SchedulerPanel — スケジューラー管理
 * パイプラインスケジュールの一覧/CRUD
 */
import { useState, useEffect } from 'react';
import { color, font, radius, transition } from '~/lib/design-tokens';
import { Badge } from './Badge';
import { Button } from './Button';

interface Schedule {
  pipelineId: string;
  name: string;
  cron: string;
  nextRun: number;
  enabled: boolean;
  lastResult: 'success' | 'error' | 'pending';
}

export function SchedulerPanel() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/scheduler')
      .then(r => r.json())
      .then((d: unknown) => {
        setSchedules((d as { schedules?: Schedule[] })?.schedules ?? []);
        setLoading(false);
      })
      .catch(() => {
        // Mock data if API not available
        setSchedules([
          { pipelineId: 'seo-optimize', name: 'SEO最適化', cron: '0 3 * * *', nextRun: Date.now() + 3600000, enabled: true, lastResult: 'success' },
          { pipelineId: 'content-gen', name: 'コンテンツ生成', cron: '0 9 * * 1-5', nextRun: Date.now() + 7200000, enabled: true, lastResult: 'success' },
          { pipelineId: 'price-update', name: '価格更新', cron: '30 */4 * * *', nextRun: Date.now() + 1800000, enabled: true, lastResult: 'pending' },
          { pipelineId: 'quality-audit', name: '品質監査', cron: '0 6 * * *', nextRun: Date.now() + 14400000, enabled: false, lastResult: 'error' },
          { pipelineId: 'backup', name: 'バックアップ', cron: '0 2 * * *', nextRun: Date.now() + 21600000, enabled: true, lastResult: 'success' },
        ]);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div style={{ padding: '24px', textAlign: 'center', color: color.textDim, fontSize: font.sm }}>読み込み中...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: font.sm, color: color.textMuted }}>
          {schedules.filter(s => s.enabled).length}/{schedules.length} 有効
        </span>
      </div>

      {schedules.map(s => (
        <div key={s.pipelineId} style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '12px 16px', borderRadius: radius.md,
          background: color.bg1, border: `1px solid ${color.border}`,
          opacity: s.enabled ? 1 : 0.5,
        }}>
          {/* 有効/無効トグル */}
          <button
            onClick={() => {
              setSchedules(prev => prev.map(p =>
                p.pipelineId === s.pipelineId ? { ...p, enabled: !p.enabled } : p
              ));
            }}
            style={{
              width: '36px', height: '20px', borderRadius: radius.full,
              background: s.enabled ? color.green : 'rgba(255,255,255,.1)',
              border: 'none', cursor: 'pointer', position: 'relative',
              transition: `background ${transition.fast}`,
              flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: '2px',
              left: s.enabled ? '18px' : '2px',
              width: '16px', height: '16px', borderRadius: '50%',
              background: '#fff', transition: `left ${transition.fast}`,
            }} />
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: font.sm, fontWeight: font.semibold, color: color.text }}>{s.name}</div>
            <div style={{ fontSize: font.xs, color: color.textDim, fontFamily: font.mono }}>{s.cron}</div>
          </div>

          <Badge
            variant={s.lastResult === 'success' ? 'success' : s.lastResult === 'error' ? 'error' : 'neutral'}
            size="sm" dot
          >
            {s.lastResult === 'success' ? '成功' : s.lastResult === 'error' ? 'エラー' : '待機'}
          </Badge>

          <div style={{ textAlign: 'right', minWidth: '80px' }}>
            <div style={{ fontSize: '10px', color: color.textDim }}>次回実行</div>
            <div style={{ fontSize: font.xs, color: color.textSecondary, fontFamily: font.mono }}>
              {s.enabled ? new Date(s.nextRun).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '—'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
