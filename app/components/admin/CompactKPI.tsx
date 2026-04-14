/**
 * CompactKPI Component — Small KPI display card
 */

import { color } from '~/lib/design-tokens';

interface CompactKPIProps {
  label: string;
  value: string;
  sub?: string;
  accent: string;
}

export function CompactKPI({ label, value, sub, accent }: CompactKPIProps) {
  return (
    <div
      style={{
        background: color.bg1,
        borderRadius: 10,
        border: `1px solid ${color.border}`,
        padding: '10px 14px',
      }}
    >
      <div
        style={{
          fontSize: 8,
          color: color.textDim,
          fontWeight: 700,
          letterSpacing: 1,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 900, color: accent }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 8, color: color.textMuted, marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
