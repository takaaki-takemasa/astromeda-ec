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

/**
 * productStatusLabel — Shopify 商品 status を中学生向けに日本語化
 *
 * patch 0082 (2026-04-20) R0-P0-4:
 * admin で点在していた `{product.status}` 素出しを一箇所に集約。
 * Shopify の生の ENUM ('ACTIVE'/'DRAFT'/'ARCHIVED') を、販売中の店員が
 * 見て迷わない日本語（「公開中」「下書き」「アーカイブ」）に変換する。
 *
 * 使用例:
 *   <span>{productStatusLabel(p.status)}</span>  // "公開中"
 *
 * また、バッジ色もセットで統一したい場合は `productStatusColor()` を使う。
 */
export function productStatusLabel(status: string): string {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE': return '公開中';
    case 'DRAFT': return '下書き';
    case 'ARCHIVED': return 'アーカイブ';
    default: return status || '—';
  }
}

/**
 * productStatusColor — 商品 status と対になるバッジ色
 *
 * ACTIVE=緑系（安心）／DRAFT=橙系（注意）／ARCHIVED=灰（非表示）。
 * `color.green` / `color.yellow` / `color.textMuted` を避けて、ラベルだけ
 * 見ればわかるよう純粋な hex を返す。
 */
export function productStatusColor(status: string): {bg: string; fg: string} {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE':
      return {bg: 'rgba(0,240,160,.15)', fg: '#00f0a0'};
    case 'DRAFT':
      return {bg: 'rgba(255,170,0,.15)', fg: '#ffaa00'};
    case 'ARCHIVED':
      return {bg: 'rgba(160,160,160,.15)', fg: color.textMuted};
    default:
      return {bg: color.bg0, fg: color.textMuted};
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
