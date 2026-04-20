/**
 * ToggleSwitch — Apple/Stripe 水準の ON/OFF スイッチプリミティブ
 *
 * patch 0081 (2026-04-20) R0-P0-3:
 * admin で点在していた `<input type="checkbox">` + 「有効」ラベルを
 * iOS 風のスライドトグルに統一。中学生向けに「はい / いいえ」文言も表示。
 *
 * 使用例:
 *   <ToggleSwitch
 *     checked={isActive}
 *     onChange={setIsActive}
 *     label="フロントに表示する"
 *     hint="オフにすると下書き扱いになり、お客様には見えません。"
 *   />
 *
 * aria:
 *   - role="switch" + aria-checked
 *   - label クリック全領域がトグル
 *   - disabled 状態ありなら opacity 0.5 + cursor not-allowed
 */
import {color, font} from '~/lib/design-tokens';

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
  /** true のとき ON ラベル/OFF ラベルを表示（デフォルト "はい"/"いいえ"） */
  showStateText?: boolean;
  onText?: string;
  offText?: string;
  id?: string;
  'aria-label'?: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
  showStateText = true,
  onText = 'はい',
  offText = 'いいえ',
  id,
  'aria-label': ariaLabel,
}: ToggleSwitchProps) {
  const uid = id ?? `toggle-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <div style={{display: 'inline-flex', flexDirection: 'column', gap: 4}}>
      <label
        htmlFor={uid}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          userSelect: 'none',
        }}
      >
        {/* Slider */}
        <button
          id={uid}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={ariaLabel ?? label ?? 'toggle'}
          onClick={() => !disabled && onChange(!checked)}
          disabled={disabled}
          style={{
            position: 'relative',
            width: 44,
            height: 24,
            borderRadius: 999,
            background: checked ? color.cyan : color.border,
            border: `1px solid ${checked ? color.cyan : color.border}`,
            padding: 0,
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'background 180ms ease, border-color 180ms ease',
            flexShrink: 0,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 2,
              left: checked ? 22 : 2,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,.3)',
              transition: 'left 180ms ease',
            }}
          />
        </button>

        {/* Label + state text */}
        {(label || showStateText) && (
          <span style={{display: 'inline-flex', flexDirection: 'column', gap: 1}}>
            {label && (
              <span
                style={{
                  fontSize: font.sm,
                  color: color.text,
                  fontWeight: 500,
                  lineHeight: 1.3,
                }}
              >
                {label}
              </span>
            )}
            {showStateText && (
              <span
                style={{
                  fontSize: font.xs,
                  color: checked ? color.cyan : color.textMuted,
                  fontWeight: checked ? 700 : 400,
                  lineHeight: 1.3,
                }}
              >
                {checked ? onText : offText}
              </span>
            )}
          </span>
        )}
      </label>
      {hint && (
        <div
          style={{
            fontSize: font.xs,
            color: color.textMuted,
            marginLeft: 54,
            lineHeight: 1.5,
            maxWidth: 360,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

export default ToggleSwitch;
