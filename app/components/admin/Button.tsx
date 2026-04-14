/**
 * Button — プライマリ/セカンダリ/ゴーストボタン
 */
import type { CSSProperties, ReactNode, ButtonHTMLAttributes } from 'react';
import { color, font, radius, transition } from '~/lib/design-tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

const variants: Record<Variant, { bg: string; text: string; border: string; hoverBg: string }> = {
  primary:   { bg: color.cyan, text: '#000', border: 'transparent', hoverBg: '#33F3FF' },
  secondary: { bg: 'transparent', text: color.cyan, border: color.cyan, hoverBg: color.cyanDim },
  ghost:     { bg: 'transparent', text: color.textSecondary, border: 'transparent', hoverBg: 'rgba(255,255,255,.06)' },
  danger:    { bg: color.redDim, text: color.red, border: 'transparent', hoverBg: 'rgba(255,45,85,.2)' },
};

const sizes: Record<Size, { pad: string; fontSize: string; height: string }> = {
  sm: { pad: '0 12px', fontSize: font.xs, height: '28px' },
  md: { pad: '0 16px', fontSize: font.sm, height: '34px' },
  lg: { pad: '0 24px', fontSize: font.base, height: '40px' },
};

export function Button({
  variant = 'primary', size = 'md', icon, loading, fullWidth, children, disabled, style, ...rest
}: ButtonProps) {
  const v = variants[variant];
  const s = sizes[size];

  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    height: s.height, padding: s.pad,
    fontSize: s.fontSize, fontWeight: font.semibold, fontFamily: font.family,
    color: v.text, background: v.bg,
    border: v.border !== 'transparent' ? `1px solid ${v.border}` : 'none',
    borderRadius: radius.md,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.5 : 1,
    transition: `all ${transition.fast}`,
    whiteSpace: 'nowrap',
    width: fullWidth ? '100%' : undefined,
    ...style,
  };

  return (
    <button
      style={base}
      disabled={disabled || loading}
      onMouseEnter={e => { if (!disabled) (e.currentTarget.style.background = v.hoverBg); }}
      onMouseLeave={e => { (e.currentTarget.style.background = v.bg); }}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : icon}
      {children}
    </button>
  );
}

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <>
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
          strokeDasharray="60 40" />
      </svg>
      <style dangerouslySetInnerHTML={{__html: `@keyframes spin { to { transform: rotate(360deg); } }`}} />
    </>
  );
}
