/**
 * MiniChart — 軽量チャートコンポーネント（Recharts不要）
 * BarChart, DonutChart, AreaChart の3種
 */
import { color, font, radius, transition } from '~/lib/design-tokens';
import { chartPalette } from '~/lib/design-tokens';

// ── BarChart（横棒） ──
interface BarChartProps {
  data: Array<{ label: string; value: number; color?: string }>;
  maxValue?: number;
  height?: number;
  showValues?: boolean;
  formatValue?: (v: number) => string;
}

export function HorizontalBar({ data, maxValue, height = 24, showValues = true, formatValue = String }: BarChartProps) {
  const max = maxValue ?? Math.max(...data.map(d => d.value), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {data.map((d, i) => (
        <div key={d.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ fontSize: font.xs, color: color.textSecondary }}>{d.label}</span>
            {showValues && (
              <span style={{ fontSize: font.xs, color: color.textMuted, fontFamily: font.mono }}>{formatValue(d.value)}</span>
            )}
          </div>
          <div style={{
            height: `${height}px`, background: 'rgba(255,255,255,.04)',
            borderRadius: radius.sm, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, (d.value / max) * 100)}%`,
              background: d.color ?? chartPalette[i % chartPalette.length],
              borderRadius: radius.sm,
              transition: `width ${transition.slow}`,
              opacity: 0.85,
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Donut Chart ──
interface DonutProps {
  data: Array<{ label: string; value: number; color?: string }>;
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string;
}

export function DonutChart({ data, size = 120, strokeWidth = 14, centerLabel, centerValue }: DonutProps) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(255,255,255,.04)" strokeWidth={strokeWidth} />
        {data.map((d, i) => {
          const segLen = (d.value / total) * circumference;
          const dashOffset = circumference - segLen;
          const rotation = (offset / total) * 360;
          offset += d.value;
          return (
            <circle key={d.label}
              cx={size / 2} cy={size / 2} r={r}
              fill="none"
              stroke={d.color ?? chartPalette[i % chartPalette.length]}
              strokeWidth={strokeWidth}
              strokeDasharray={`${segLen} ${circumference - segLen}`}
              strokeDashoffset={0}
              style={{
                transform: `rotate(${rotation}deg)`,
                transformOrigin: '50% 50%',
                transition: `all ${transition.slow}`,
              }}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      {(centerLabel || centerValue) && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          {centerValue && <span style={{ fontSize: font.lg, fontWeight: font.bold, color: color.text }}>{centerValue}</span>}
          {centerLabel && <span style={{ fontSize: font.xs, color: color.textMuted }}>{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

// ── Legend ──
interface LegendProps {
  items: Array<{ label: string; value?: string; color?: string }>;
  direction?: 'row' | 'column';
}

export function ChartLegend({ items, direction = 'column' }: LegendProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: direction, gap: direction === 'row' ? '16px' : '6px',
      flexWrap: 'wrap',
    }}>
      {items.map((item, i) => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '2px', flexShrink: 0,
            background: item.color ?? chartPalette[i % chartPalette.length],
          }} />
          <span style={{ fontSize: font.xs, color: color.textSecondary }}>{item.label}</span>
          {item.value && (
            <span style={{ fontSize: font.xs, color: color.textMuted, fontFamily: font.mono, marginLeft: 'auto' }}>{item.value}</span>
          )}
        </div>
      ))}
    </div>
  );
}
