/**
 * AdminAgents Tab — AI Agent Monitoring
 */

import { useState, Suspense } from 'react';
import { color, font } from '~/lib/design-tokens';
import { AgentHeatmap } from '~/components/admin/AgentHeatmap';
import { DecisionTimeline } from '~/components/admin/DecisionTimeline';
import { formatUptime, statusColor, statusLabel } from '~/lib/admin-utils';
import type { AgentStatus } from '~/types/admin';

interface AdminAgentsProps {
  agents: AgentStatus[];
}

export default function AdminAgents({agents}: AdminAgentsProps) {
  const levels = ['L0', 'L1', 'L2'] as const;
  const [viewMode, setViewMode] = useState<'heatmap' | 'hierarchy'>('heatmap');

  return (
    <div>
      <div style={{display: 'flex', gap: 8, marginBottom: 20}}>
        {(['heatmap', 'hierarchy'] as const).map(m => (
          <button key={m} onClick={() => setViewMode(m)} style={{
            padding: '6px 14px', borderRadius: 8, border: `1px solid ${viewMode === m ? color.cyan : color.border}`,
            background: viewMode === m ? color.cyanDim : 'transparent',
            color: viewMode === m ? color.cyan : color.textMuted,
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: font.family,
          }}>
            {m === 'heatmap' ? 'ヒートマップ' : '階層ビュー'}
          </button>
        ))}
      </div>

      {viewMode === 'heatmap' && (
        <div style={{marginBottom: 32}}>
          <Suspense fallback={<div style={{height:200,display:'flex',justifyContent:'center',alignItems:'center',color:color.textMuted}}>読み込み中...</div>}>
            <AgentHeatmap agents={agents} />
          </Suspense>
        </div>
      )}

      {viewMode === 'heatmap' && (
        <div style={{
          background: color.bg1, borderRadius: 12, border: `1px solid ${color.border}`, padding: 20, marginBottom: 32,
        }}>
          <div style={{fontSize: 14, fontWeight: 700, color: color.text, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color.cyan} strokeWidth="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            AI判断タイムライン
          </div>
          <Suspense fallback={null}><DecisionTimeline maxItems={8} /></Suspense>
        </div>
      )}

      {viewMode === 'hierarchy' && (
      <>
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        color: color.textDim,
        letterSpacing: 2,
        marginBottom: 16,
      }}>
        AGENT HIERARCHY — 47体構成
      </div>

      {levels.map((level) => {
        const levelAgents = agents.filter(a => a.level === level);
        if (levelAgents.length === 0) return null;

        return (
          <div key={level} style={{marginBottom: 28}}>
            <div style={{
              fontSize: 12,
              fontWeight: 800,
              color: level === 'L0' ? color.red : level === 'L1' ? color.cyan : color.green,
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span style={{
                padding: '2px 8px',
                borderRadius: 4,
                background: (level === 'L0' ? color.red : level === 'L1' ? color.cyan : color.green) + '20',
                fontSize: 10,
                fontWeight: 900,
              }}>
                {level}
              </span>
              {level === 'L0' && '司令塔'}
              {level === 'L1' && 'チームリード'}
              {level === 'L2' && '実行Agent'}
              <span style={{fontSize: 10, color: color.textDim, fontWeight: 400}}>
                ({levelAgents.length}体)
              </span>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 10,
            }}>
              {levelAgents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          </div>
        );
      })}
      </>
      )}
    </div>
  );
}

function AgentCard({agent}: {agent: AgentStatus}) {
  const isPending = agent.status === 'pending';

  return (
    <div style={{
      background: color.bg1,
      borderRadius: 12,
      border: `1px solid ${color.border}`,
      padding: 14,
      opacity: isPending ? 0.5 : 1,
      position: 'relative',
    }}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10}}>
        <div>
          <div style={{fontSize: 13, fontWeight: 800, color: color.text}}>
            {agent.name}
          </div>
          <div style={{fontSize: 9, color: color.textDim}}>
            {agent.team} · v{agent.version}
          </div>
        </div>
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          color: statusColor(agent.status),
          padding: '3px 10px',
          borderRadius: 8,
          background: `${statusColor(agent.status)}15`,
          border: `1px solid ${statusColor(agent.status)}30`,
        }}>
          {statusLabel(agent.status)}
        </span>
      </div>

      {!isPending && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8,
        }}>
          <div>
            <div style={{fontSize: 8, color: color.textDim, fontWeight: 600}}>稼働時間</div>
            <div style={{fontSize: 12, fontWeight: 700, color: color.text}}>
              {formatUptime(agent.uptime)}
            </div>
          </div>
          <div>
            <div style={{fontSize: 8, color: color.textDim, fontWeight: 600}}>エラー</div>
            <div style={{fontSize: 12, fontWeight: 700, color: agent.errorCount > 0 ? color.red : color.green}}>
              {agent.errorCount}
            </div>
          </div>
          <div>
            <div style={{fontSize: 8, color: color.textDim, fontWeight: 600}}>タスクQ</div>
            <div style={{fontSize: 12, fontWeight: 700, color: color.text}}>
              {agent.taskQueue}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
