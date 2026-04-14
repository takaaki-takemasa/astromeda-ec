/**
 * PipelineMonitor — パイプライン監視パネル
 * 16パイプラインのリアルタイムステータス + 実行ログ
 */
import { useState } from 'react';
import { color, font, radius, transition } from '~/lib/design-tokens';
import { Badge, statusToVariant } from './Badge';
import { ProgressBar } from './ProgressBar';

interface Pipeline {
  id: string;
  name: string;
  status: string;
  lastRun: number;
  successRate: number;
  avgDuration: number;
  runsToday: number;
}

interface PipelineMonitorProps {
  pipelines: Pipeline[];
}

export function PipelineMonitor({ pipelines }: PipelineMonitorProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const statusOrder = { error: 0, running: 1, paused: 2, idle: 3 };
  const sorted = [...pipelines].sort((a, b) =>
    (statusOrder[a.status as keyof typeof statusOrder] ?? 4) - (statusOrder[b.status as keyof typeof statusOrder] ?? 4)
  );

  const summary = {
    running: pipelines.filter(p => p.status === 'running').length,
    error: pipelines.filter(p => p.status === 'error').length,
    idle: pipelines.filter(p => p.status === 'idle').length,
    paused: pipelines.filter(p => p.status === 'paused').length,
  };

  return (
    <div>
      {/* サマリーバー */}
      <div style={{
        display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap',
      }}>
        {[
          { label: '実行中', count: summary.running, c: color.green },
          { label: 'エラー', count: summary.error, c: color.red },
          { label: '待機中', count: summary.idle, c: color.textMuted },
          { label: '一時停止', count: summary.paused, c: color.yellow },
        ].map(s => (
          <div key={s.label} style={{
            padding: '8px 14px', borderRadius: radius.md,
            background: color.bg2, display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.c }} />
            <span style={{ fontSize: font.xs, color: color.textMuted }}>{s.label}</span>
            <span style={{ fontSize: font.sm, fontWeight: font.bold, color: color.text, fontFamily: font.mono }}>{s.count}</span>
          </div>
        ))}
      </div>

      {/* パイプラインリスト */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {sorted.map(p => {
          const expanded = expandedId === p.id;
          return (
            <div key={p.id}>
              <button
                onClick={() => setExpandedId(expanded ? null : p.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 16px', borderRadius: radius.md,
                  background: expanded ? color.bg2 : 'transparent',
                  border: `1px solid ${expanded ? color.borderHover : color.border}`,
                  cursor: 'pointer', transition: `all ${transition.fast}`,
                  textAlign: 'left', fontFamily: font.family,
                }}
                onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = color.bg2; }}
                onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = 'transparent'; }}
              >
                <Badge variant={statusToVariant(p.status)} dot size="sm">
                  {p.status}
                </Badge>
                <span style={{ fontSize: font.sm, color: color.text, fontWeight: font.medium, flex: 1 }}>
                  {p.name}
                </span>
                <span style={{ fontSize: font.xs, color: color.textMuted, fontFamily: font.mono }}>
                  {p.runsToday}回/日
                </span>
                <div style={{ width: '80px' }}>
                  <ProgressBar value={p.successRate} height={4} thresholds={{ warn: 80, danger: 50 }} />
                </div>
                <span style={{ fontSize: font.xs, color: color.textMuted, fontFamily: font.mono, width: '36px', textAlign: 'right' }}>
                  {p.successRate}%
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color.textDim} strokeWidth="2"
                  style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: `transform ${transition.fast}` }}>
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {expanded && (
                <div style={{
                  padding: '12px 16px 12px 48px',
                  display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px',
                }}>
                  {[
                    { label: '平均所要時間', value: `${(p.avgDuration / 1000).toFixed(1)}s` },
                    { label: '本日実行', value: `${p.runsToday}回` },
                    { label: '成功率', value: `${p.successRate}%` },
                    { label: '最終実行', value: p.lastRun > 0 ? new Date(p.lastRun).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '—' },
                  ].map(item => (
                    <div key={item.label}>
                      <div style={{ fontSize: '10px', color: color.textDim, marginBottom: '2px' }}>{item.label}</div>
                      <div style={{ fontSize: font.sm, fontWeight: font.semibold, color: color.textSecondary, fontFamily: font.mono }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
