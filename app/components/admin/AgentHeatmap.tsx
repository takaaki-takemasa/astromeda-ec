/**
 * AgentHeatmap — Agent稼働ヒートマップ
 * 47体のAgentを6チーム×層でグリッド表示
 * ステータス別に色分け、クリックで詳細表示
 */
import { useState } from 'react';
import { color, font, radius, transition, agentStatusColor } from '~/lib/design-tokens';
import { Badge, statusToVariant } from './Badge';

interface Agent {
  id: string;
  name: string;
  level: string;
  team: string;
  status: string;
  uptime: number;
  errorCount: number;
  lastHeartbeat: number;
  taskQueue: number;
  version: string;
}

interface AgentHeatmapProps {
  agents: Agent[];
}

const TEAMS = [
  { id: 'brain', label: 'Brain (L0)', color: '#FF6B00' },
  { id: 'content', label: 'Content', color: '#00F0FF' },
  { id: 'commerce', label: 'Commerce', color: '#00E676' },
  { id: 'analytics', label: 'Analytics', color: '#A78BFA' },
  { id: 'ops', label: 'Operations', color: '#FFB300' },
  { id: 'security', label: 'Security', color: '#FF2D55' },
];

function getTeam(agent: Agent): string {
  const name = agent.name.toLowerCase();
  if (name.includes('brain') || agent.level === 'L0') return 'brain';
  if (name.includes('content') || name.includes('seo') || name.includes('image')) return 'content';
  if (name.includes('pricing') || name.includes('promotion') || name.includes('product') || name.includes('conversion') || name.includes('ab-test')) return 'commerce';
  if (name.includes('analyt') || name.includes('insight') || name.includes('data')) return 'analytics';
  if (name.includes('security') || name.includes('quality') || name.includes('devops')) return 'security';
  return 'ops';
}

export function AgentHeatmap({ agents }: AgentHeatmapProps) {
  const [selected, setSelected] = useState<Agent | null>(null);

  const grouped = TEAMS.map(team => ({
    ...team,
    agents: agents.filter(a => getTeam(a) === team.id),
  }));

  const statusCounts = {
    healthy: agents.filter(a => a.status === 'healthy').length,
    degraded: agents.filter(a => a.status === 'degraded').length,
    error: agents.filter(a => a.status === 'error').length,
    offline: agents.filter(a => a.status === 'offline').length,
  };

  return (
    <div>
      {/* ステータスサマリー */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {Object.entries(statusCounts).map(([status, count]) => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              width: '10px', height: '10px', borderRadius: '3px',
              background: agentStatusColor[status as keyof typeof agentStatusColor] ?? color.textDim,
            }} />
            <span style={{ fontSize: font.xs, color: color.textMuted }}>
              {status === 'healthy' ? '正常' : status === 'degraded' ? '低下' : status === 'error' ? 'エラー' : 'オフライン'}
            </span>
            <span style={{ fontSize: font.xs, fontWeight: font.bold, color: color.text, fontFamily: font.mono }}>
              {count}
            </span>
          </div>
        ))}
      </div>

      {/* チーム別グリッド */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {grouped.filter(g => g.agents.length > 0).map(group => (
          <div key={group.id}>
            <div style={{
              fontSize: font.xs, fontWeight: font.semibold, color: group.color,
              marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <span style={{ width: '4px', height: '12px', borderRadius: '2px', background: group.color }} />
              {group.label} ({group.agents.length})
            </div>
            <div style={{
              display: 'flex', gap: '4px', flexWrap: 'wrap',
            }}>
              {group.agents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => setSelected(selected?.id === agent.id ? null : agent)}
                  title={`${agent.name} (${agent.status})`}
                  style={{
                    width: '32px', height: '32px',
                    borderRadius: radius.sm,
                    border: selected?.id === agent.id ? `2px solid ${color.cyan}` : `1px solid ${color.border}`,
                    background: agentStatusColor[agent.status as keyof typeof agentStatusColor]
                      ? `${agentStatusColor[agent.status as keyof typeof agentStatusColor]}20`
                      : color.bg2,
                    cursor: 'pointer',
                    transition: `all ${transition.fast}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '8px', fontWeight: font.bold, fontFamily: font.mono,
                    color: agentStatusColor[agent.status as keyof typeof agentStatusColor] ?? color.textDim,
                    padding: 0,
                  }}
                >
                  {agent.name.slice(0, 2).toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 選択Agent詳細 */}
      {selected && (
        <div style={{
          marginTop: '16px', padding: '16px',
          background: color.bg2, borderRadius: radius.md,
          border: `1px solid ${color.borderHover}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: font.sm, fontWeight: font.bold, color: color.text }}>{selected.name}</span>
            <Badge variant={statusToVariant(selected.status)} dot>{selected.status}</Badge>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px',
          }}>
            {[
              { label: 'Level', value: selected.level },
              { label: 'Uptime', value: `${(selected.uptime / 3600).toFixed(1)}h` },
              { label: 'Errors', value: String(selected.errorCount) },
              { label: 'Queue', value: String(selected.taskQueue) },
              { label: 'Version', value: selected.version },
              { label: 'Heartbeat', value: selected.lastHeartbeat > 0 ? `${Math.floor((Date.now() - selected.lastHeartbeat) / 1000)}s ago` : '—' },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontSize: '10px', color: color.textDim }}>{item.label}</div>
                <div style={{ fontSize: font.xs, fontWeight: font.semibold, color: color.textSecondary, fontFamily: font.mono }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
