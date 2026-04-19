/**
 * FormField — 一体化フォームフィールド
 *
 * patch 0043 (2026-04-19)  — Phase A 基盤整備
 *
 * Stripe Dashboard 水準の「label + required mark + help + error + placeholder」を
 * 1 コンポーネントで提供する共有 Design System プリミティブ。
 *
 * 既存 admin 各タブの `<label>` + `<input>` の散在パターンを段階的に置換する。
 * children 方式で input 本体は呼び出し側が渡せるので、既存のカスタム input や
 * UrlPicker/Select/TextArea もそのまま差し込める。
 *
 * Usage:
 *   <FormField label="タイトル" required help="SEO に使われます">
 *     <input value={title} onChange={e => setTitle(e.target.value)} />
 *   </FormField>
 *
 *   <FormField label="価格" required error={errors.price}>
 *     <input type="number" value={price} onChange={...} />
 *   </FormField>
 */
import type { CSSProperties, ReactNode } from 'react';
import { color, font, radius, space } from '~/lib/design-tokens';

interface FormFieldProps {
  /** 可視ラベル */
  label: string;
  /** 必須項目か。true なら赤いアスタリスクを付与 */
  required?: boolean;
  /** 補助説明（フィールド下に灰色で） */
  help?: string;
  /** エラーメッセージ（あれば赤背景で表示、input border も赤化） */
  error?: string;
  /** フィールド本体（input/textarea/select/UrlPicker 等） */
  children: ReactNode;
  /** fieldset で使う htmlFor に近い意味合い。通常は不要 */
  htmlFor?: string;
  /** 行内 layout を強制する */
  inline?: boolean;
  /** style override */
  style?: CSSProperties;
}

const labelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: font.xs,
  fontWeight: font.semibold,
  color: color.textSecondary,
  marginBottom: 4,
};

const requiredMarkStyle: CSSProperties = {
  color: color.red,
  fontSize: font.xs,
  fontWeight: font.bold,
  marginLeft: 2,
};

const helpStyle: CSSProperties = {
  fontSize: font.xs,
  color: color.textMuted,
  marginTop: 4,
  lineHeight: font.normal,
};

const errorStyle: CSSProperties = {
  fontSize: font.xs,
  color: color.red,
  marginTop: 4,
  padding: '4px 8px',
  background: color.redDim,
  borderRadius: radius.sm,
  lineHeight: font.normal,
};

export function FormField({
  label,
  required,
  help,
  error,
  children,
  htmlFor,
  inline,
  style,
}: FormFieldProps) {
  const wrapStyle: CSSProperties = inline
    ? { display: 'grid', gridTemplateColumns: '120px 1fr', gap: space[3], alignItems: 'start', ...style }
    : { display: 'flex', flexDirection: 'column', gap: space[1], ...style };

  return (
    <div style={wrapStyle}>
      <label style={labelStyle} htmlFor={htmlFor}>
        <span>{label}</span>
        {required ? <span style={requiredMarkStyle} aria-label="必須">*</span> : null}
      </label>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* input 本体 */}
        <div
          style={{
            // error 時、直下の input/select/textarea に赤い border を伝える
            ...(error
              ? {
                  // CSS で子要素の border-color を上書きするためのラッパ
                  // inline style では子セレクタが使えないため、error 時のみ dataset を付ける
                }
              : {}),
          }}
          data-formfield-error={error ? 'true' : undefined}
        >
          {children}
        </div>
        {/* help / error */}
        {error ? (
          <div role="alert" style={errorStyle}>
            {error}
          </div>
        ) : help ? (
          <div style={helpStyle}>{help}</div>
        ) : null}
      </div>
      {/* error scope CSS: FormField 内の <input>/<textarea>/<select> に赤 border */}
      <style
        dangerouslySetInnerHTML={{
          __html: `[data-formfield-error="true"] > input,
[data-formfield-error="true"] > textarea,
[data-formfield-error="true"] > select {
  border-color: ${color.red} !important;
  background: ${color.redDim} !important;
}`,
        }}
      />
    </div>
  );
}

/**
 * プレーンな input を FormField に合わせて装飾するスタイル。
 * 既存フォームの inputStyle を段階的に置き換える用途。
 */
export const fieldInputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: font.sm,
  fontFamily: font.family,
  color: color.text,
  background: color.bg1,
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  outline: 'none',
  boxSizing: 'border-box',
};
