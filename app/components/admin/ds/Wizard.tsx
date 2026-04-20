/**
 * Wizard — 複数ステップのフォームを分割して非エンジニアが迷わず登録できるようにする
 *
 * patch 0086 (2026-04-20) R2-P2-1:
 * CEO の「新規IPコラボを中学生が迷わず追加できること」標準への対応。
 * 一画面に 8 フィールド並べて圧倒する UI を、3 ステップに分割。
 * 各ステップに「何を入力するか」のタイトルと補足説明を添える。
 *
 * 使用例:
 *   <Wizard
 *     steps={[
 *       {id: 'basics', title: '① 基本情報', description: '最低限これだけで登録できます', body: <StepA />, canProceed: !!name},
 *       {id: 'visual', title: '② 見た目', description: '省略すると Shopify 側の画像が使われます', body: <StepB />},
 *       {id: 'publish', title: '③ 公開設定', description: '公開/下書きを選んで保存', body: <StepC />},
 *     ]}
 *     onCancel={onCancel}
 *     onSubmit={handleSave}
 *     submitLabel="公開する"
 *     saving={saving}
 *   />
 *
 * UX:
 *   - 上部に番号付き進捗バー（完了したステップは色付き）
 *   - 「戻る / 次へ / 最終ステップで 公開」 3ボタン
 *   - canProceed=false のとき「次へ」ボタンを無効化し tooltip に errorMessage
 *   - 最終ステップ (isLast=true) のみ onSubmit を呼ぶ
 */
import {useState} from 'react';
import {color, font, space} from '~/lib/design-tokens';

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  body: React.ReactNode;
  /** false のとき次のステップへ進めない。デフォルトは true */
  canProceed?: boolean;
  /** canProceed=false の時 tooltip と下部に表示されるメッセージ */
  errorMessage?: string;
}

export interface WizardProps {
  steps: WizardStep[];
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  saving?: boolean;
  /** ステップ番号の表記。デフォルトは "ステップ N / M" */
  stepLabelFormatter?: (index: number, total: number) => string;
}

export function Wizard({
  steps,
  onCancel,
  onSubmit,
  submitLabel = '公開する',
  saving = false,
  stepLabelFormatter = (i, total) => `ステップ ${i + 1} / ${total}`,
}: WizardProps) {
  const [idx, setIdx] = useState(0);
  if (steps.length === 0) return null;
  const step = steps[idx];
  const isLast = idx === steps.length - 1;
  const isFirst = idx === 0;
  const canAdvance = step.canProceed !== false;

  const handleNext = () => {
    if (!canAdvance) return;
    if (isLast) {
      onSubmit();
    } else {
      setIdx(idx + 1);
    }
  };

  return (
    <div style={{display: 'grid', gap: space[4]}}>
      {/* Progress bar */}
      <ol
        aria-label="ウィザードの進捗"
        style={{
          display: 'flex',
          gap: space[2],
          margin: 0,
          padding: 0,
          listStyle: 'none',
        }}
      >
        {steps.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <li
              key={s.id}
              aria-current={active ? 'step' : undefined}
              style={{
                flex: 1,
                padding: `${space[2]} ${space[3]}`,
                borderRadius: 8,
                background: done ? color.greenDim : active ? color.cyanDim : color.bg2,
                border: `1px solid ${done ? color.green : active ? color.cyan : color.border}`,
                fontSize: font.xs,
                fontWeight: active ? font.bold : font.medium,
                color: done ? color.green : active ? color.cyan : color.textMuted,
                lineHeight: 1.3,
              }}
            >
              <div style={{fontSize: '0.625rem', opacity: 0.85}}>{stepLabelFormatter(i, steps.length)}</div>
              <div>{s.title}</div>
            </li>
          );
        })}
      </ol>

      {/* Step header */}
      <div>
        <div
          style={{
            fontSize: font.lg,
            fontWeight: font.bold,
            color: color.text,
            marginBottom: step.description ? space[1] : 0,
          }}
        >
          {step.title}
        </div>
        {step.description && (
          <div style={{fontSize: font.sm, color: color.textMuted, lineHeight: 1.5}}>{step.description}</div>
        )}
      </div>

      {/* Step body */}
      <div>{step.body}</div>

      {/* Error / hint line */}
      {!canAdvance && step.errorMessage && (
        <div
          role="alert"
          style={{
            fontSize: font.xs,
            color: color.red,
            padding: `${space[2]} ${space[3]}`,
            background: color.redDim,
            border: `1px solid ${color.red}`,
            borderRadius: 6,
          }}
        >
          {step.errorMessage}
        </div>
      )}

      {/* Footer buttons */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: space[2],
          borderTop: `1px solid ${color.border}`,
          paddingTop: space[4],
          marginTop: space[2],
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          style={secondaryBtn(saving)}
        >
          キャンセル
        </button>
        <div style={{display: 'flex', gap: space[2]}}>
          <button
            type="button"
            onClick={() => setIdx(idx - 1)}
            disabled={isFirst || saving}
            style={secondaryBtn(isFirst || saving)}
            aria-label="前のステップへ戻る"
          >
            ← 戻る
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canAdvance || saving}
            title={!canAdvance ? step.errorMessage : undefined}
            style={primaryBtn(!canAdvance || saving)}
            aria-label={isLast ? submitLabel : '次のステップへ進む'}
          >
            {saving ? '保存中…' : isLast ? submitLabel : '次へ →'}
          </button>
        </div>
      </div>
    </div>
  );
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: `${space[2]} ${space[5]}`,
    borderRadius: 8,
    background: disabled ? color.bg2 : color.cyan,
    color: disabled ? color.textMuted : color.bg0,
    border: `1px solid ${disabled ? color.border : color.cyan}`,
    fontSize: font.sm,
    fontWeight: font.bold,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transition: 'background 150ms ease, opacity 150ms ease',
  };
}

function secondaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: `${space[2]} ${space[4]}`,
    borderRadius: 8,
    background: 'transparent',
    color: disabled ? color.textDim : color.text,
    border: `1px solid ${color.border}`,
    fontSize: font.sm,
    fontWeight: font.medium,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'opacity 150ms ease, border-color 150ms ease',
  };
}

export default Wizard;
