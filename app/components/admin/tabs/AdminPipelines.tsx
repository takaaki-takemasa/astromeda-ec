/**
 * AdminPipelines Tab — Pipeline Monitoring & Execution
 */

import { useState, useCallback, useEffect, Suspense } from 'react';
import { color, font } from '~/lib/design-tokens';
import { PipelineMonitor } from '~/components/admin/PipelineMonitor';
import { statusColor, statusLabel } from '~/lib/admin-utils';
import type { PipelineStatus } from '~/types/admin';
import { AdminListSkeleton } from '~/components/admin/ds/InlineListState';

interface AdminPipelinesProps {
  pipelines: PipelineStatus[];
}

export default function AdminPipelines({pipelines}: AdminPipelinesProps) {
  const [execState, setExecState] = useState<Record<string, {loading: boolean; result?: string; error?: string}>>({});
  const [pipeViewMode, setPipeViewMode] = useState<'monitor' | 'cards'>('monitor');
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);

  const handleRunPipeline = useCallback(async (pipelineId: string) => {
    setExecState(prev => ({...prev, [pipelineId]: {loading: true}}));
    try {
      const res = await fetch('/api/admin/pipelines', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({pipelineId}),
      });
      const result = await res.json() as Record<string, unknown>;
      if (result.success) {
        setExecState(prev => ({...prev, [pipelineId]: {loading: false, result: `${result.execution?.executionTime || 0}ms`}}));
      } else {
        setExecState(prev => ({...prev, [pipelineId]: {loading: false, error: result.error || 'Failed'}}));
      }
    } catch (err) {
      setExecState(prev => ({...prev, [pipelineId]: {loading: false, error: 'Network error'}}));
    }
  }, []);

  useEffect(() => {
    fetch('/api/admin/pipelines').then(r => r.json()).then((d: unknown) => {
      const recentLogs: Array<Record<string, unknown>> = [];
      const pList = (d as { pipelines?: unknown[] })?.pipelines || [];
      pList.forEach((p: unknown) => {
        const pipeline = p as Record<string, unknown>;
        if ((pipeline.lastRun as number | undefined || 0) > 0) {
          recentLogs.push({
            pipelineId: pipeline.id, pipelineName: pipeline.name, status: pipeline.status,
            timestamp: pipeline.lastRun, successRate: pipeline.successRate, duration: pipeline.avgDuration,
          });
        }
      });
      recentLogs.sort((a: Record<string, unknown>, b: Record<string, unknown>) => (b.timestamp as number || 0) - (a.timestamp as number || 0));
      setLogs(recentLogs.slice(0, 10));
    }).catch(() => {});
  }, []);

  return (
    <div>
      <div style={{display: 'flex', gap: 8, marginBottom: 20}}>
        {(['monitor', 'cards'] as const).map(m => (
          <button key={m} onClick={() => setPipeViewMode(m)} style={{
            padding: '6px 14px', borderRadius: 8, border: `1px solid ${pipeViewMode === m ? color.cyan : color.border}`,
            background: pipeViewMode === m ? color.cyanDim : 'transparent',
            color: pipeViewMode === m ? color.cyan : color.textMuted,
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: font.family,
          }}>
            {m === 'monitor' ? 'モニタービュー' : 'カードビュー'}
          </button>
        ))}
      </div>

      {pipeViewMode === 'monitor' && (
        <Suspense fallback={<AdminListSkeleton rows={4} />}>
          <PipelineMonitor pipelines={pipelines} />
        </Suspense>
      )}

      {pipeViewMode === 'cards' && (
      <>
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        color: color.textDim,
        letterSpacing: 2,
        marginBottom: 16,
      }}>
        PIPELINE STATUS — 16フロー
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 12,
        marginBottom: 32,
      }}>
        {pipelines.map((p) => {
          const es = execState[p.id];
          return (
          <div key={p.id} style={{
            background: color.bg1,
            borderRadius: 12,
            border: `1px solid ${color.border}`,
            padding: 16,
          }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
              <span style={{fontSize: 13, fontWeight: 800, color: color.text}}>
                {p.name}
              </span>
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                color: statusColor(p.status),
                padding: '3px 10px',
                borderRadius: 8,
                background: `${statusColor(p.status)}15`,
              }}>
                {statusLabel(p.status)}
              </span>
            </div>

            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8}}>
              <div>
                <div style={{fontSize: 8, color: color.textDim, fontWeight: 600}}>成功率</div>
                <div style={{fontSize: 14, fontWeight: 900, color: p.successRate >= 90 ? color.green : p.successRate >= 70 ? color.yellow : color.textDim}}>
                  {p.successRate > 0 ? `${p.successRate}%` : '—'}
                </div>
              </div>
              <div>
                <div style={{fontSize: 8, color: color.textDim, fontWeight: 600}}>平均時間</div>
                <div style={{fontSize: 14, fontWeight: 900, color: color.text}}>
                  {p.avgDuration > 0 ? `${(p.avgDuration / 1000).toFixed(1)}s` : '—'}
                </div>
              </div>
              <div>
                <div style={{fontSize: 8, color: color.textDim, fontWeight: 600}}>本日実行</div>
                <div style={{fontSize: 14, fontWeight: 900, color: color.cyan}}>
                  {p.runsToday}
                </div>
              </div>
            </div>

            <div style={{
              marginTop: 10,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: `1px solid ${color.border}`,
              paddingTop: 8,
            }}>
              <span style={{fontSize: 9, color: color.textDim}}>
                最終実行: {p.lastRun > 0 ? new Date(p.lastRun).toLocaleString('ja-JP') : '未実行'}
              </span>
              <button
                onClick={() => handleRunPipeline(p.id)}
                disabled={es?.loading}
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '4px 12px',
                  borderRadius: 8,
                  border: `1px solid ${color.cyan}40`,
                  background: es?.loading ? color.bg2 : 'transparent',
                  color: es?.error ? color.red : es?.result ? color.green : color.cyan,
                  cursor: es?.loading ? 'wait' : 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {es?.loading ? '...' : es?.error ? es.error : es?.result ? `Done ${es.result}` : 'Run'}
              </button>
            </div>
          </div>
        )})}
      </div>

      {/* Recent Logs */}
      {logs.length > 0 && (
        <div style={{marginBottom: 24}}>
          <div style={{fontSize: 11, fontWeight: 800, color: color.textDim, letterSpacing: 2, marginBottom: 12}}>
            RECENT EXECUTION LOG
          </div>
          <div style={{background: color.bg1, borderRadius: 12, border: `1px solid ${color.border}`, overflow: 'hidden'}}>
            {logs.map((log: Record<string, unknown>, i: number) => (
              <div key={i} style={{
                padding: '10px 14px', borderBottom: i < logs.length - 1 ? `1px solid ${color.border}` : 'none',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: log.status === 'running' ? color.green : log.status === 'error' ? color.red : color.textDim,
                  }} />
                  <div>
                    <div style={{fontSize: 11, fontWeight: 700, color: color.text}}>{log.pipelineName}</div>
                    <div style={{fontSize: 9, color: color.textDim}}>
                      {new Date(log.timestamp).toLocaleString('ja-JP')} · {log.duration > 0 ? `${(log.duration / 1000).toFixed(1)}s` : '—'}
                    </div>
                  </div>
                </div>
                <div style={{textAlign: 'right'}}>
                  <div style={{fontSize: 11, fontWeight: 700, color: log.successRate >= 90 ? color.green : log.successRate >= 70 ? color.yellow : color.red}}>
                    {log.successRate}%
                  </div>
                  <div style={{fontSize: 8, color: color.textDim}}>成功率</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
