/**
 * AdminControl Tab — CEO Emergency Control Panel
 */

import { useState, useEffect } from 'react';
import { color } from '~/lib/design-tokens';
import { andonColor, formatActionResult } from '~/lib/admin-utils';
import type { SystemMetrics, QuickActionDefinition } from '~/types/admin';
import { TabHeaderHint } from '~/components/admin/ds/TabHeaderHint';

interface AdminControlProps {
  metrics: SystemMetrics;
  onAndonPull: () => void;
  andonConfirm: boolean;
  onAndonConfirm: () => void;
  onAndonCancel: () => void;
  quickActions: QuickActionDefinition[];
  actionResults: Record<string, {loading: boolean; result?: unknown; error?: string}>;
  onExecuteAction: (actionId: string) => void;
}

export default function AdminControl({
  metrics,
  onAndonPull,
  andonConfirm,
  onAndonConfirm,
  onAndonCancel,
  quickActions,
  actionResults,
  onExecuteAction,
}: AdminControlProps) {
  return (
    <div>
    {/* patch 0119 (Apple CEO ライフサイクル監査): 高校生向け 1 行説明 */}
    <TabHeaderHint
      title="困ったときの緊急停止"
      description="何かおかしい時は、ここから AI を一旦すべて止められます（Andon 緊急停止）。緊急時専用です。"
      relatedTabs={[{label: 'AI スタッフが今やっている事', tab: 'agents'}, {label: '自動化（パイプライン）', tab: 'pipelines'}]}
    />
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        color: color.textDim,
        letterSpacing: 2,
        marginBottom: 16,
      }}>
        CEO CONTROL PANEL — ワンクリック操作
      </div>

      {/* Andon Cord Section */}
      <div style={{
        background: metrics.andonStatus === 'red' ? 'rgba(255,45,85,.08)' : color.bg1,
        borderRadius: 16,
        border: `1px solid ${metrics.andonStatus === 'red' ? 'rgba(255,45,85,.3)' : color.border}`,
        padding: 24,
        marginBottom: 24,
        textAlign: 'center',
      }}>
        <div style={{fontSize: 14, fontWeight: 900, color: color.text, marginBottom: 8}}>
          Andon Cord — 緊急停止
        </div>
        <div style={{fontSize: 11, color: color.textMuted, marginBottom: 20}}>
          全AIエージェントを即座に停止します。安全確認後に解除してください。
        </div>

        {!andonConfirm ? (
          <button
            type="button"
            onClick={onAndonPull}
            style={{
              padding: '14px 40px',
              borderRadius: 12,
              border: `2px solid ${metrics.andonStatus === 'red' ? color.green : color.red}`,
              background: `${metrics.andonStatus === 'red' ? color.green : color.red}15`,
              color: metrics.andonStatus === 'red' ? color.green : color.red,
              fontSize: 14,
              fontWeight: 900,
              cursor: 'pointer',
              letterSpacing: 1,
              transition: 'all .2s',
            }}
          >
            {metrics.andonStatus === 'red' ? '🟢 Andon解除（全Agent再開）' : '🔴 Andon発動（全Agent停止）'}
          </button>
        ) : (
          <div>
            <div style={{fontSize: 13, fontWeight: 800, color: color.yellow, marginBottom: 12}}>
              {metrics.andonStatus === 'red'
                ? '全Agentを再開してよろしいですか？'
                : '全Agentを緊急停止してよろしいですか？'}
            </div>
            <div style={{display: 'flex', gap: 12, justifyContent: 'center'}}>
              <button
                type="button"
                onClick={onAndonConfirm}
                style={{
                  padding: '10px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: metrics.andonStatus === 'red' ? color.green : color.red,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                実行する
              </button>
              <button
                type="button"
                onClick={onAndonCancel}
                style={{
                  padding: '10px 24px',
                  borderRadius: 8,
                  border: `1px solid ${color.border}`,
                  background: 'none',
                  color: color.textMuted,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions Grid */}
      {(['analytics', 'operations', 'quality', 'marketing'] as const).map((category) => {
        const categoryActions = quickActions.filter(a => a.category === category);
        if (categoryActions.length === 0) return null;
        const catLabel = {analytics: 'ANALYTICS', operations: 'OPERATIONS', quality: 'QUALITY', marketing: 'MARKETING'}[category];
        const catColor = {analytics: color.cyan, operations: color.green, quality: color.orange, marketing: color.yellow}[category];

        return (
          <div key={category} style={{marginBottom: 24}}>
            <div style={{
              fontSize: 11,
              fontWeight: 800,
              color: catColor,
              letterSpacing: 2,
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: catColor, boxShadow: `0 0 6px ${catColor}60`,
              }} />
              {catLabel}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 10,
            }}>
              {categoryActions.map((action) => {
                const state = actionResults[action.id];
                const isLoading = state?.loading;
                const hasResult = state && !state.loading && state.result;
                const hasError = state && !state.loading && state.error;

                return (
                  <button
                    key={action.id}
                    type="button"
                    disabled={isLoading}
                    onClick={() => onExecuteAction(action.id)}
                    style={{
                      background: hasResult ? `${color.green}08` : hasError ? `${color.red}08` : color.bg1,
                      borderRadius: 12,
                      border: `1px solid ${hasResult ? `${color.green}30` : hasError ? `${color.red}30` : color.border}`,
                      padding: 14,
                      textAlign: 'left',
                      cursor: isLoading ? 'wait' : 'pointer',
                      opacity: isLoading ? 0.7 : 1,
                      transition: 'all .2s',
                    }}
                  >
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                      <span style={{fontSize: 20}}>{action.icon}</span>
                      {isLoading && (
                        <span style={{fontSize: 9, color: color.cyan, fontWeight: 700, animation: 'pulse 1s infinite'}}>
                          実行中...
                        </span>
                      )}
                      {hasResult && (
                        <span style={{fontSize: 9, color: color.green, fontWeight: 700}}>完了</span>
                      )}
                      {hasError && (
                        <span style={{fontSize: 9, color: color.red, fontWeight: 700}}>エラー</span>
                      )}
                    </div>
                    <div style={{fontSize: 12, fontWeight: 800, color: color.text, marginBottom: 4, marginTop: 6}}>
                      {action.name}
                    </div>
                    <div style={{fontSize: 10, color: color.textDim, lineHeight: 1.4}}>
                      {action.description}
                    </div>
                    <div style={{fontSize: 9, color: color.textDim, marginTop: 6, fontStyle: 'italic'}}>
                      Agent: {action.agentId}
                    </div>
                    {hasResult && (
                      <div style={{
                        marginTop: 8,
                        padding: 8,
                        borderRadius: 6,
                        background: 'rgba(0,230,118,.06)',
                        border: `1px solid rgba(0,230,118,.15)`,
                        fontSize: 10,
                        color: color.textMuted,
                        maxHeight: 120,
                        overflow: 'auto',
                        lineHeight: 1.5,
                      }}>
                        {formatActionResult(state.result)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
