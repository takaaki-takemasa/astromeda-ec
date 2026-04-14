/**
 * EmergencyPanel — 緊急対応パネル
 * Andon Cord + Quick Actions + 承認キュー
 */
import { color, font, radius, transition } from '~/lib/design-tokens';
import { Badge } from './Badge';
import { Button } from './Button';

interface EmergencyPanelProps {
  andonStatus: 'green' | 'yellow' | 'red';
  onAndonPull: () => void;
  pendingApprovals: number;
  quickActions: Array<{
    id: string;
    label: string;
    description: string;
    category: string;
    riskLevel: string;
  }>;
  actionResults: Record<string, { loading: boolean; result?: unknown; error?: string }>;
  onExecuteAction: (actionId: string) => void;
}

export function EmergencyPanel({
  andonStatus, onAndonPull, pendingApprovals, quickActions, actionResults, onExecuteAction,
}: EmergencyPanelProps) {
  const andonConfig = {
    green: { label: '正常稼働', desc: '全システム正常動作中', bg: color.greenDim, border: 'rgba(0,230,118,.2)', text: color.green },
    yellow: { label: '注意', desc: '一部システムに問題があります', bg: color.yellowDim, border: 'rgba(255,179,0,.2)', text: color.yellow },
    red: { label: '緊急停止中', desc: '全AI処理が停止されています', bg: color.redDim, border: 'rgba(255,45,85,.2)', text: color.red },
  };
  const a = andonConfig[andonStatus];

  const categoryGroups = quickActions.reduce<Record<string, typeof quickActions>>((acc, qa) => {
    (acc[qa.category] ??= []).push(qa);
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Andon Card */}
      <div style={{
        background: a.bg, border: `1px solid ${a.border}`,
        borderRadius: radius.lg, padding: '24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: radius.md,
            background: `${a.text}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{
              width: '20px', height: '20px', borderRadius: '50%', background: a.text,
              animation: andonStatus !== 'green' ? 'pulse-andon 1.5s ease-in-out infinite' : undefined,
            }} />
          </div>
          <div>
            <div style={{ fontSize: font.lg, fontWeight: font.bold, color: a.text }}>{a.label}</div>
            <div style={{ fontSize: font.sm, color: color.textMuted }}>{a.desc}</div>
          </div>
        </div>
        <Button
          variant={andonStatus === 'red' ? 'primary' : 'danger'}
          size="lg"
          onClick={onAndonPull}
        >
          {andonStatus === 'red' ? 'Andon解除' : '緊急停止'}
        </Button>
      </div>
      <style dangerouslySetInnerHTML={{__html: `@keyframes pulse-andon { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(1.1); } }`}} />

      {/* Quick Actions */}
      {Object.entries(categoryGroups).map(([category, actions]) => (
        <div key={category}>
          <div style={{
            fontSize: font.xs, fontWeight: font.semibold, color: color.textMuted,
            textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px',
          }}>
            {category}
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px',
          }}>
            {actions.map(qa => {
              const result = actionResults[qa.id];
              const riskColor = qa.riskLevel === 'high' ? color.red : qa.riskLevel === 'medium' ? color.yellow : color.green;
              return (
                <div key={qa.id} style={{
                  padding: '12px 16px', borderRadius: radius.md,
                  background: color.bg1, border: `1px solid ${color.border}`,
                  display: 'flex', alignItems: 'center', gap: '12px',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                      <span style={{ fontSize: font.sm, fontWeight: font.semibold, color: color.text }}>{qa.label}</span>
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: riskColor }} />
                    </div>
                    <div style={{ fontSize: font.xs, color: color.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {qa.description}
                    </div>
                    {result?.error && (
                      <div style={{ fontSize: '10px', color: color.red, marginTop: '2px' }}>{result.error}</div>
                    )}
                    {result?.result && (
                      <div style={{ fontSize: '10px', color: color.green, marginTop: '2px' }}>完了</div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={result?.loading}
                    onClick={() => onExecuteAction(qa.id)}
                  >
                    実行
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* 承認キュー */}
      {pendingApprovals > 0 && (
        <div style={{
          padding: '16px 20px', borderRadius: radius.md,
          background: color.yellowDim, border: `1px solid rgba(255,179,0,.15)`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: font.sm, fontWeight: font.bold, color: color.yellow }}>
              承認待ち {pendingApprovals}件
            </div>
            <div style={{ fontSize: font.xs, color: color.textMuted }}>
              AI判断の承認が必要です
            </div>
          </div>
          <Badge variant="warning" size="md" dot pulse>{`${pendingApprovals}件`}</Badge>
        </div>
      )}
    </div>
  );
}
