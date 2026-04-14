/**
 * ProgressBar — アニメーション付きプログレスバー
 * ゲージ、目標進捗、コスト上限表示に使用
 */
import { color, radius, transition, font } from '~/lib/design-tokens';

interface ProgressBarProps {
  value: number;       // 0-100
  max?: number;        // デフォルト100
  barColor?: string;
  bgColor?: string;
  height?: number;
  label?: string;
  showValue?: boolean;
  animate?: boolean;
  thresholds?: { warn: number; danger: number };
}

export function ProgressBar({
  value, max = 100, barColor, bgColor, height = 6, label,
  showValue = false, animate = true, thresholds,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  const resolvedColor = barColor ?? (
    thresholds
      ? pct >= thresholds.danger ? color.red
        : pct >= thresholds.warn ? color.yellow
        : color.green
      : color.cyan
  );

  return (
    <div>
      {(label || showValue) && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: '4px',
        }}>
          {label && <span style={{ fontSize: font.xs, color: color.textMuted }}>{label}</span>}
          {showValue && <span style={{ fontSize: font.xs, color: color.textSecondary, fontFamily: font.mono }}>{pct.toFixed(0)}%</span>}
        </div>
      )}
      <div style={{
        height: `${height}px`,
        background: bgColor ?? 'rgba(255,255,255,.06)',
        borderRadius: radius.full,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: resolvedColor,
          borderRadius: radius.full,
          transition: animate ? `width ${transition.slow}` : undefined,
        }} />
      </div>
    </div>
  );
}

/** 円形プログレス（ゲージ表示用） */
interface CircularGaugeProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  gaugeColor?: string;
  label?: string;
  centerText?: string;
}

export function CircularGauge({
  value, max = 100, size = 80, strokeWidth = 6, gaugeColor, label, centerText,
}: CircularGaugeProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;

  const resolvedColor = gaugeColor ?? (
    pct >= 90 ? color.red : pct >= 70 ? color.yellow : color.cyan
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={resolvedColor} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: `stroke-dashoffset ${transition.slow}` }}
        />
      </svg>
      {centerText && (
        <div style={{
          position: 'relative', marginTop: `-${size / 2 + 10}px`,
          fontSize: font.md, fontWeight: font.bold, color: color.text,
          textAlign: 'center', width: `${size}px`, height: `${size / 2}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {centerText}
        </div>
      )}
      {label && <span style={{ fontSize: font.xs, color: color.textMuted, marginTop: centerText ? '0' : '0' }}>{label}</span>}
    </div>
  );
}
