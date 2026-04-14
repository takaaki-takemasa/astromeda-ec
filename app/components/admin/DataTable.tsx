/**
 * DataTable — ソート/フィルタ対応テーブル
 * Stripe風: 行ホバー、スティッキーヘッダー、コンパクト
 */
import { useState, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { color, font, radius, transition } from '~/lib/design-tokens';

export interface Column<T> {
  key: string;
  label: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  render?: (row: T, index: number) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  maxHeight?: string;
  compact?: boolean;
}

export function DataTable<T extends Record<string, unknown>>({
  columns, data, rowKey, onRowClick, emptyMessage = 'データなし', maxHeight, compact = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const cellPad = compact ? '8px 12px' : '10px 16px';

  const thStyle = (col: Column<T>): CSSProperties => ({
    padding: cellPad,
    fontSize: font.xs,
    fontWeight: font.semibold,
    color: color.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    textAlign: col.align ?? 'left',
    width: col.width,
    borderBottom: `1px solid ${color.border}`,
    position: 'sticky' as const,
    top: 0,
    background: color.bg1,
    zIndex: 1,
    cursor: col.sortable ? 'pointer' : undefined,
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
  });

  const tdStyle = (col: Column<T>): CSSProperties => ({
    padding: cellPad,
    fontSize: compact ? font.xs : font.sm,
    color: color.text,
    textAlign: col.align ?? 'left',
    borderBottom: `1px solid ${color.border}`,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: col.width ?? '200px',
  });

  return (
    <div style={{
      borderRadius: radius.md,
      border: `1px solid ${color.border}`,
      overflow: 'auto',
      maxHeight,
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontFamily: font.family,
      }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                style={thStyle(col)}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                {col.label}
                {col.sortable && sortKey === col.key && (
                  <span style={{ marginLeft: '4px' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{
                padding: '32px', textAlign: 'center',
                color: color.textMuted, fontSize: font.sm,
              }}>
                {emptyMessage}
              </td>
            </tr>
          ) : sorted.map((row, i) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{
                cursor: onRowClick ? 'pointer' : undefined,
                transition: `background ${transition.fast}`,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = color.bg2)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {columns.map(col => (
                <td key={col.key} style={tdStyle(col)}>
                  {col.render ? col.render(row, i) : String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
