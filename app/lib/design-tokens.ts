/**
 * Design Tokens — Astromeda CEO Dashboard
 *
 * Stripe/Apple基準のデザインシステム
 * 8pxグリッド、3色原則（cyan/green/red + グレースケール）
 * WCAG AA準拠（コントラスト比4.5:1以上）
 */

// ── カラーパレット ──
export const color = {
  // Primary accent
  cyan: '#00F0FF',
  cyanDim: 'rgba(0,240,255,.15)',
  cyanHover: 'rgba(0,240,255,.25)',

  // Semantic
  green: '#00E676',
  greenDim: 'rgba(0,230,118,.12)',
  yellow: '#FFB300',
  yellowDim: 'rgba(255,179,0,.12)',
  red: '#FF2D55',
  redDim: 'rgba(255,45,85,.12)',
  orange: '#FF6B00',

  // Backgrounds (dark → light)
  bg0: '#06060C',        // page
  bg1: '#0D0D18',        // card
  bg2: '#14142A',        // hover / raised
  bg3: '#1C1C3A',        // active / modal overlay

  // Borders
  border: 'rgba(255,255,255,.06)',
  borderHover: 'rgba(255,255,255,.12)',
  borderFocus: 'rgba(0,240,255,.4)',

  // Text (WCAG AA on bg0)
  text: '#FFFFFF',                    // 21:1
  textSecondary: 'rgba(255,255,255,.7)',  // ~14:1
  textMuted: 'rgba(255,255,255,.55)',     // ~11:1
  textDim: 'rgba(255,255,255,.3)',        // decorative only
} as const;

// ── スペーシング (8px grid) ──
export const space = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
} as const;

// ── タイポグラフィ ──
export const font = {
  family: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, sans-serif',
  mono: '"SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace',

  // sizes (rem, 16px base)
  xs: '0.6875rem',   // 11px
  sm: '0.8125rem',   // 13px
  base: '0.875rem',  // 14px
  md: '1rem',        // 16px
  lg: '1.25rem',     // 20px
  xl: '1.5rem',      // 24px
  '2xl': '2rem',     // 32px
  '3xl': '2.5rem',   // 40px

  // weights
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',

  // line-heights
  tight: '1.2',
  normal: '1.5',
  relaxed: '1.625',
} as const;

// ── ラジウス ──
export const radius = {
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;

// ── シャドウ ──
export const shadow = {
  sm: '0 1px 2px rgba(0,0,0,.3)',
  md: '0 4px 12px rgba(0,0,0,.4)',
  lg: '0 8px 24px rgba(0,0,0,.5)',
  glow: (c: string, opacity = 0.3) => `0 0 20px rgba(${hexToRgb(c)},${opacity})`,
} as const;

// ── トランジション ──
export const transition = {
  fast: '120ms cubic-bezier(.4,0,.2,1)',
  normal: '200ms cubic-bezier(.4,0,.2,1)',
  slow: '300ms cubic-bezier(.4,0,.2,1)',
  spring: '400ms cubic-bezier(.175,.885,.32,1.275)',
} as const;

// ── ブレークポイント ──
export const breakpoint = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// ── Z-index ──
export const zIndex = {
  sidebar: 40,
  header: 50,
  modal: 100,
  cmdK: 110,
  toast: 120,
} as const;

// ── Andonステータスカラー ──
export const andonColor = {
  green: color.green,
  yellow: color.yellow,
  red: color.red,
} as const;

// ── エージェントステータスカラー ──
export const agentStatusColor = {
  healthy: color.green,
  degraded: color.yellow,
  error: color.red,
  offline: color.textDim,
  pending: color.textMuted,
} as const;

// ── チャート用カラー（Recharts向け） ──
export const chartPalette = [
  '#00F0FF', // cyan
  '#00E676', // green
  '#FF6B00', // orange
  '#FFB300', // yellow
  '#FF2D55', // red
  '#A78BFA', // purple
  '#38BDF8', // sky
  '#F472B6', // pink
] as const;

// ── ユーティリティ ──
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
}

/** JPY金額フォーマット */
export function formatJPY(amount: number): string {
  if (amount >= 1_000_000_000) return `¥${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 100_000_000) return `¥${(amount / 100_000_000).toFixed(1)}億`;
  if (amount >= 10_000) return `¥${(amount / 10_000).toFixed(amount >= 100_000 ? 0 : 1)}万`;
  return `¥${amount.toLocaleString()}`;
}

/** パーセントフォーマット */
export function formatPct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/** 数値省略フォーマット */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

/** 相対時間 */
export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '今';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`;
  return `${Math.floor(diff / 86_400_000)}日前`;
}
