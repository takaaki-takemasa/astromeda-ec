/**
 * Card — 基本カードコンポーネント
 * 8pxグリッド準拠、hover glow対応
 */
import type { CSSProperties, ReactNode } from 'react';
import { color, radius, shadow, transition } from '~/lib/design-tokens';

interface CardProps {
  children: ReactNode;
  padding?: string;
  glow?: string;
  hover?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
  className?: string;
}

export function Card({ children, padding = '24px', glow, hover = false, onClick, style, className }: CardProps) {
  const base: CSSProperties = {
    background: color.bg1,
    border: `1px solid ${color.border}`,
    borderRadius: radius.lg,
    padding,
    transition: `all ${transition.normal}`,
    cursor: onClick ? 'pointer' : undefined,
    ...style,
  };

  const hoverStyle = hover || onClick ? `
    .admin-card:hover {
      border-color: ${color.borderHover};
      box-shadow: ${glow ? shadow.glow(glow, 0.15) : shadow.md};
    }
  ` : '';

  return (
    <>
      {hoverStyle && <style dangerouslySetInnerHTML={{__html: hoverStyle}} />}
      <div
        className={`admin-card ${className ?? ''}`}
        style={base}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
      >
        {children}
      </div>
    </>
  );
}

/** セクションヘッダー付きカード */
interface SectionCardProps extends CardProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function SectionCard({ title, subtitle, action, icon, children, ...rest }: SectionCardProps) {
  return (
    <Card {...rest}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {icon && <span style={{ color: color.cyan, fontSize: '18px', display: 'flex' }}>{icon}</span>}
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: color.text }}>{title}</h3>
            {subtitle && <p style={{ margin: '2px 0 0', fontSize: '12px', color: color.textMuted }}>{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}
