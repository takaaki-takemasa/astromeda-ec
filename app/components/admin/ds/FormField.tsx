/**
 * FormField — 一体化フォームフィールド
 *
 * patch 0043 (2026-04-19)  — Phase A 基盤整備（初版）
 * patch 0084 (2026-04-20)  — R1-P1-2 必須/任意マーカー + hint 統一
 *
 * Stripe Dashboard 水準の「label + required/optional mark + help + error + placeholder」を
 * 1 コンポーネントで提供する共有 Design System プリミティブ。
 *
 * 既存 admin 各タブの `<label>` + `<input>` の散在パターンを段階的に置換する。
 * children 方式で input 本体は呼び出し側が渡せるので、既存のカスタム input や
 * UrlPicker/Select/TextArea もそのまま差し込める。
 *
 * patch 0084 で追加: 全面書き換えずに inline form の見出しだけ改善できるよう、
 *   - `<RequiredMark />` …… 赤い * 印
 *   - `<OptionalMark />` …… 「(任意)」のグレーピル
 *   - `<HintText>{...}</HintText>` …… ヒント（入力欄下の灰色説明）の統一スタイル
 * を単独コンポーネントとしても export する。
 *
 * Usage:
 *   <FormField label="タイトル" required help="SEO に使われます">
 *     <input value={title} onChange={e => setTitle(e.target.value)} />
 *   </FormField>
 *
 *   <FormField label="タグライン" optional help="カードに表示されるキャッチ">
 *     <input value={tagline} onChange={...} />
 *   </FormField>
 *
 *   <FormField label="価格" required error={errors.price}>
 *     <input type="number" value={price} onChange={...} />
 *   </FormField>
 *
 *   // 既存 inline form の retrofit:
 *   <label>IP名 <RequiredMark /></label>
 *   <input ... />
 *   <HintText>Shopify コレクションの日本語表示名です</HintText>
 */
import type { CSSProperties, ReactNode } from 'react';
import { color, font, radius, space } from '~/lib/design-tokens';

interface FormFieldProps {
  /** 可視ラベル */
  label: string;
  /** 必須項目か。true なら赤いアスタリスクを付与 */
  required?: boolean;
  /** 任意項目か。true なら (任意) マーカーを付与。required と同時指定時は required が優先 */
  optional?: boolean;
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

// patch 0084: 任意項目の小さなグレーピル
const optionalMarkStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: font.semibold,
  color: color.textMuted,
  background: 'rgba(255,255,255,.06)',
  padding: '1px 6px',
  borderRadius: 999,
  marginLeft: 6,
  letterSpacing: '.02em',
  lineHeight: 1.4,
};

// patch 0084: ヒント文（灰色・小さめ・控えめ）
const hintTextStyle: CSSProperties = {
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

/**
 * 必須マーカー（赤の *）。既存 inline label の右に貼り付け可能。
 * ARIA: `aria-label="必須"` を付与してスクリーンリーダーに読み上げさせる。
 */
export function RequiredMark() {
  return (
    <span style={requiredMarkStyle} aria-label="必須">
      *
    </span>
  );
}

/**
 * 任意マーカー（「(任意)」グレーピル）。
 * 必須でないフィールドを明示したいときに label 末尾に貼る。
 * 例: `<label>タグライン <OptionalMark /></label>`
 */
export function OptionalMark() {
  return (
    <span style={optionalMarkStyle} aria-label="任意項目">
      任意
    </span>
  );
}

/**
 * ヒント文（入力欄下の灰色説明）の統一スタイルラッパ。
 * FormField 外で使う場合（inline form の retrofit など）の視覚一貫性を担保する。
 */
export function HintText({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...hintTextStyle, ...style }}>{children}</div>;
}

export function FormField({
  label,
  required,
  optional,
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
        {required ? <RequiredMark /> : optional ? <OptionalMark /> : null}
      </label>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* input 本体 */}
        <div data-formfield-error={error ? 'true' : undefined}>{children}</div>
        {/* help / error */}
        {error ? (
          <div role="alert" style={errorStyle}>
            {error}
          </div>
        ) : help ? (
          <HintText>{help}</HintText>
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
