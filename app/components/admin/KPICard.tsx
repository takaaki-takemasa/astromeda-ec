/**
 * KPICard — CEO用KPI表示カード
 * Stripe風: 大きな数値 + トレンド矢印 + スパークライン
 */
import type { CSSProperties, ReactNode } from 'react';
import { color, font, radius, transition, shadow } from '~/lib/design-tokens';

interface KPICardProps {
  label: string;
  value: string;
  trend?: { value: number; label?: string };
  icon?: ReactNode;
  accentColor?: string;
  sparkData?: number[];
  onClick?: () => void;
  subtitle?: string;
}

export function KPICard({ label, value, trend, icon, accentColor = color.cyan, sparkData, onClick, subtitle }: KPICardProps) {
  const trendColor = trend
    ? trend.value > 0 ? color.green : trend.value < 0 ? color.red : color.textMuted
    : undefined;

  return (
    <div
      style={{
        background: color.bg1,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        padding: '20px 24px',
        cursor: onClick ? 'pointer' : undefined,
        transition: `all ${transition.normal}`,
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
      }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
    >
      {/* Accent top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
        background: accentColor, opacity: 0.6,
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* Label */}
          <div style={{
            fontSize: font.xs,
            fontWeight: font.medium,
            color: color.textMuted,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
            marginBottom: '8px',
          }}>
            {label}
          </div>

          {/* Value */}
          <div style={{
            fontSize: font['2xl'],
            fontWeight: font.bold,
            color: color.text,
            lineHeight: font.tight,
            letterSpacing: '-0.02em',
          }}>
            {value}
          </div>

          {/* Trend + subtitle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
            {trend && (
              <span style={{
                fontSize: font.xs,
                fontWeight: font.semibold,
                color: trendColor,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                padding: '2px 6px',
                borderRadius: radius.sm,
                background: trend.value > 0 ? color.greenDim : trend.value < 0 ? color.redDim : 'transparent',
              }}>
                {trend.value > 0 ? '↑' : trend.value < 0 ? '↓' : '→'}
                {Math.abs(trend.value).toFixed(1)}%
              </span>
            )}
            {(trend?.label || subtitle) && (
              <span style={{ fontSize: font.xs, color: color.textDim }}>
                {trend?.label || subtitle}
              </span>
            )}
          </div>
        </div>

        {/* Icon */}
        {icon && (
          <div style={{
            color: accentColor,
            opacity: 0.7,
            fontSize: '20px',
            display: 'flex',
            flexShrink: 0,
            marginLeft: '12px',
          }}>
            {icon}
          </div>
        )}
      </div>

      {/* Sparkline */}
      {sparkData && sparkData.length > 1 && (
        <div style={{ marginTop: '12px' }}>
          <MiniSparkline data={sparkData} color={accentColor} />
        </div>
      )}
    </div>
  );
}

/** SVGスパークライン（Rechartsなし、軽量） */
function MiniSparkline({ data, color: c, height = 28 }: { data: number[]; color: string; height?: number }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: '100%', height: `${height}px`, display: 'block' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-${c.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity="0.3" />
          <stop offset="100%" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${w},${height}`}
        fill={`url(#spark-${c.replace('#', '')})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={c}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
