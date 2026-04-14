/**
 * EmptyState — データなし/ローディング/エラー状態
 */
import type { ReactNode } from 'react';
import { color, font, radius } from '~/lib/design-tokens';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '48px 24px', textAlign: 'center',
    }}>
      {icon && <div style={{ fontSize: '32px', color: color.textDim, marginBottom: '16px' }}>{icon}</div>}
      <h4 style={{ margin: 0, fontSize: font.base, fontWeight: font.semibold, color: color.textSecondary }}>{title}</h4>
      {description && <p style={{ margin: '6px 0 0', fontSize: font.sm, color: color.textMuted, maxWidth: '320px' }}>{description}</p>}
      {action && <div style={{ marginTop: '16px' }}>{action}</div>}
    </div>
  );
}

/** シマーローディング */
export function Shimmer({ width = '100%', height = 16 }: { width?: string | number; height?: number }) {
  return (
    <>
      <div style={{
        width, height: `${height}px`,
        background: `linear-gradient(90deg, ${color.bg2} 25%, ${color.bg3} 50%, ${color.bg2} 75%)`,
        backgroundSize: '200% 100%',
        borderRadius: radius.sm,
        animation: 'shimmer 1.5s infinite',
      }} />
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}} />
    </>
  );
}

/** セクション区切り */
export function Divider({ label }: { label?: string }) {
  if (!label) return <div style={{ height: '1px', background: color.border, margin: '16px 0' }} />;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
      <div style={{ flex: 1, height: '1px', background: color.border }} />
      <span style={{ fontSize: font.xs, color: color.textDim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <div style={{ flex: 1, height: '1px', background: color.border }} />
    </div>
  );
}
