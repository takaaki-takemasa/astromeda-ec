/**
 * DecisionTimeline — AI判断履歴タイムライン
 * AIBrainの判断プロセスを時系列で可視化
 */
import { useState, useEffect } from 'react';
import { color, font, radius, transition } from '~/lib/design-tokens';
import { Badge } from './Badge';

interface Decision {
  pipelineId: string;
  stepId: string;
  action: string;
  reasoning: string;
  confidence: number;
  riskLevel: string;
  requiresApproval: boolean;
  timestamp: number;
}

interface DecisionTimelineProps {
  maxItems?: number;
}

export function DecisionTimeline({ maxItems = 10 }: DecisionTimelineProps) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/ai')
      .then(r => r.json())
      .then((d: unknown) => {
        setDecisions((d as { recentDecisions?: Decision[] })?.recentDecisions ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: color.textDim, fontSize: font.sm }}>
        読み込み中...
      </div>
    );
  }

  if (decisions.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: color.textDim, fontSize: font.sm }}>
        AI判断履歴はまだありません
      </div>
    );
  }

  const riskColor = (level: string) => {
    switch (level) {
      case 'high': return color.red;
      case 'medium': return color.yellow;
      default: return color.green;
    }
  };

  const actionLabel = (action: string) => {
    switch (action) {
      case 'execute': return '実行';
      case 'skip': return 'スキップ';
      case 'pause': return '一時停止';
      case 'abort': return '中断';
      default: return action;
    }
  };

  return (
    <div style={{ position: 'relative', paddingLeft: '24px' }}>
      {/* タイムラインライン */}
      <div style={{
        position: 'absolute', left: '8px', top: '4px', bottom: '4px',
        width: '2px', background: color.border,
      }} />

      {decisions.slice(0, maxItems).map((d, i) => (
        <div key={`${d.pipelineId}-${d.timestamp}-${i}`} style={{
          position: 'relative', paddingBottom: '16px',
        }}>
          {/* ドット */}
          <div style={{
            position: 'absolute', left: '-20px', top: '4px',
            width: '12px', height: '12px', borderRadius: '50%',
            background: color.bg1, border: `2px solid ${riskColor(d.riskLevel)}`,
          }} />

          <div style={{
            padding: '10px 14px', borderRadius: radius.md,
            background: color.bg2, border: `1px solid ${color.border}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: font.xs, fontWeight: font.bold, color: color.text }}>{d.pipelineId}</span>
                <Badge
                  variant={d.action === 'execute' ? 'success' : d.action === 'abort' ? 'error' : 'warning'}
                  size="sm"
                >
                  {actionLabel(d.action)}
                </Badge>
              </div>
              <span style={{ fontSize: '10px', color: color.textDim, fontFamily: font.mono }}>
                {new Date(d.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            <p style={{ margin: '0 0 8px', fontSize: font.xs, color: color.textSecondary, lineHeight: font.normal }}>
              {d.reasoning}
            </p>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: color.textDim }}>確信度</span>
                <span style={{
                  fontSize: font.xs, fontWeight: font.bold, fontFamily: font.mono,
                  color: d.confidence >= 80 ? color.green : d.confidence >= 50 ? color.yellow : color.red,
                }}>
                  {d.confidence}%
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: color.textDim }}>リスク</span>
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: riskColor(d.riskLevel),
                }} />
                <span style={{ fontSize: font.xs, color: riskColor(d.riskLevel) }}>{d.riskLevel}</span>
              </div>
              {d.requiresApproval && (
                <Badge variant="warning" size="sm">承認要</Badge>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
