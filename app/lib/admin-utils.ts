/**
 * Admin Dashboard Utility Functions
 */

import { color } from '~/lib/design-tokens';

export function formatUptime(seconds: number): string {
  if (seconds === 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 24) return `${Math.floor(h / 24)}日${h % 24}h`;
  return `${h}h ${m}m`;
}

export function statusColor(status: string): string {
  switch (status) {
    case 'healthy': case 'running': return color.green;
    case 'degraded': case 'paused': return color.yellow;
    case 'error': return color.red;
    case 'pending': case 'offline': case 'idle': return color.textDim;
    default: return color.textMuted;
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'healthy': return '正常';
    case 'degraded': return '低下';
    case 'error': return 'エラー';
    case 'pending': return '未稼働';
    case 'offline': return 'オフライン';
    case 'running': return '実行中';
    case 'idle': return '待機中';
    case 'paused': return '一時停止';
    default: return status;
  }
}

export function andonColor(status: 'green' | 'yellow' | 'red'): string {
  switch (status) {
    case 'green': return color.green;
    case 'yellow': return color.yellow;
    case 'red': return color.red;
  }
}

export function formatActionResult(result: unknown): string {
  if (!result) return '結果なし';
  if (typeof result === 'string') return result;

  const lines: string[] = [];
  const walk = (obj: unknown, prefix = ''): void => {
    if (obj == null) return;
    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
      lines.push(`${prefix}${obj}`);
      return;
    }
    if (Array.isArray(obj)) {
      if (obj.length === 0) { lines.push(`${prefix}(なし)`); return; }
      obj.slice(0, 10).forEach((item: unknown, i: number) => {
        if (typeof item === 'object' && item !== null) {
          const summary = Object.entries(item).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ');
          lines.push(`${prefix}[${i}] ${summary}${Object.keys(item).length > 3 ? '...' : ''}`);
        } else {
          lines.push(`${prefix}[${i}] ${item}`);
        }
      });
      if (obj.length > 10) lines.push(`${prefix}... (+${obj.length - 10} more)`);
      return;
    }
    if (typeof obj === 'object') {
      Object.entries(obj).forEach(([k, v]: [string, unknown]) => {
        if (typeof v === 'object' && v !== null) {
          lines.push(`${prefix}${k}:`);
          walk(v, prefix + '  ');
        } else {
          lines.push(`${prefix}${k}: ${v}`);
        }
      });
    }
  };
  walk(result);
  return lines.join('\n');
}
