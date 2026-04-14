/**
 * Badge — ステータスバッジ + ドットインジケーター
 */
import { color, font, radius, transition } from '~/lib/design-tokens';

type Variant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const variantStyles: Record<Variant, { bg: string; text: string; dot: string }> = {
  success: { bg: color.greenDim, text: color.green, dot: color.green },
  warning: { bg: color.yellowDim, text: color.yellow, dot: color.yellow },
  error:   { bg: color.redDim, text: color.red, dot: color.red },
  info:    { bg: color.cyanDim, text: color.cyan, dot: color.cyan },
  neutral: { bg: 'rgba(255,255,255,.06)', text: color.textMuted, dot: color.textDim },
};

interface BadgeProps {
  children: string;
  variant?: Variant;
  dot?: boolean;
  pulse?: boolean;
  size?: 'sm' | 'md';
}

export function Badge({ children, variant = 'neutral', dot = false, pulse = false, size = 'sm' }: BadgeProps) {
  const v = variantStyles[variant];
  const fontSize = size === 'sm' ? font.xs : font.sm;
  const pad = size === 'sm' ? '2px 8px' : '4px 10px';

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      fontSize,
      fontWeight: font.medium,
      color: v.text,
      background: v.bg,
      padding: pad,
      borderRadius: radius.full,
      whiteSpace: 'nowrap' as const,
      transition: `all ${transition.fast}`,
      lineHeight: '1.4',
    }}>
      {dot && (
        <span style={{
          width: '6px', height: '6px',
          borderRadius: '50%',
          background: v.dot,
          flexShrink: 0,
          animation: pulse ? 'badge-pulse 2s ease-in-out infinite' : undefined,
        }} />
      )}
      {children}
      {pulse && (
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes badge-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}} />
      )}
    </span>
  );
}

/** エージェントステータスをBadgeバリアントに変換 */
export function statusToVariant(status: string): Variant {
  switch (status) {
    case 'healthy': case 'running': case 'active': return 'success';
    case 'degraded': case 'paused': case 'idle': return 'warning';
    case 'error': return 'error';
    case 'offline': case 'stopped': return 'neutral';
    default: return 'info';
  }
}
