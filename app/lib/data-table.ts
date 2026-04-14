/**
 * DataTable ユーティリティ — 神経繊維の束（白質）
 *
 * NV-03~07: Admin DataTable のページネーション・フィルタ・ソート・
 * バルクアクション・エクスポート機能
 *
 * 医学メタファー: 脊髄の灰白質→白質→末梢神経
 * データの処理（灰白質=ビジネスロジック）→ 伝送（白質=テーブル表示）→
 * 出力（末梢神経=CSV/JSONエクスポート）
 *
 * 設計:
 * - ヘッドレス設計（UIはReactコンポーネント側で描画）
 * - サーバーサイドでもクライアントサイドでも使用可能
 * - ジェネリック型でどんなデータ型にも対応
 */

// ━━━ NV-03: ページネーション ━━━

export interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
}

export interface PaginationResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function paginate<T>(items: T[], config: PaginationConfig): PaginationResult<T> {
  const {page, pageSize, total} = config;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;

  return {
    items: items.slice(start, end),
    page: safePage,
    pageSize,
    total,
    totalPages,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1,
  };
}

// ━━━ NV-04: フィルタリング ━━━

export type FilterOperator = 'eq' | 'neq' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'gte' | 'lt' | 'lte';

export interface FilterCondition<T> {
  field: keyof T;
  operator: FilterOperator;
  value: unknown;
}

export function applyFilters<T extends Record<string, unknown>>(
  items: T[],
  filters: FilterCondition<T>[],
): T[] {
  if (filters.length === 0) return items;

  return items.filter((item) =>
    filters.every((f) => matchFilter(item, f)),
  );
}

function matchFilter<T extends Record<string, unknown>>(
  item: T,
  filter: FilterCondition<T>,
): boolean {
  const val = item[filter.field];
  const target = filter.value;

  switch (filter.operator) {
    case 'eq':
      return val === target;
    case 'neq':
      return val !== target;
    case 'contains':
      return typeof val === 'string' && typeof target === 'string'
        ? val.toLowerCase().includes(target.toLowerCase())
        : false;
    case 'startsWith':
      return typeof val === 'string' && typeof target === 'string'
        ? val.toLowerCase().startsWith(target.toLowerCase())
        : false;
    case 'endsWith':
      return typeof val === 'string' && typeof target === 'string'
        ? val.toLowerCase().endsWith(target.toLowerCase())
        : false;
    case 'gt':
      return typeof val === 'number' && typeof target === 'number' ? val > target : false;
    case 'gte':
      return typeof val === 'number' && typeof target === 'number' ? val >= target : false;
    case 'lt':
      return typeof val === 'number' && typeof target === 'number' ? val < target : false;
    case 'lte':
      return typeof val === 'number' && typeof target === 'number' ? val <= target : false;
    default:
      return true;
  }
}

// ━━━ NV-05: ソート ━━━

export type SortDirection = 'asc' | 'desc';

export interface SortConfig<T> {
  field: keyof T;
  direction: SortDirection;
}

export function applySort<T extends Record<string, unknown>>(
  items: T[],
  sorts: SortConfig<T>[],
): T[] {
  if (sorts.length === 0) return items;

  return [...items].sort((a, b) => {
    for (const sort of sorts) {
      const aVal = a[sort.field];
      const bVal = b[sort.field];
      const cmp = compareValues(aVal, bVal);
      if (cmp !== 0) {
        return sort.direction === 'asc' ? cmp : -cmp;
      }
    }
    return 0;
  });
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b, 'ja');
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b));
}

// ━━━ NV-06: バルクアクション ━━━

export interface BulkActionResult {
  success: number;
  failed: number;
  errors: {id: string; error: string}[];
}

export async function executeBulkAction<T extends {id: string}>(
  items: T[],
  action: (item: T) => Promise<void>,
): Promise<BulkActionResult> {
  const result: BulkActionResult = {success: 0, failed: 0, errors: []};

  // 並列実行（最大10同時）
  const batchSize = 10;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map((item) => action(item)));

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'fulfilled') {
        result.success++;
      } else {
        result.failed++;
        result.errors.push({
          id: batch[j].id,
          error: (results[j] as PromiseRejectedResult).reason?.message ?? 'Unknown error',
        });
      }
    }
  }

  return result;
}

// ━━━ NV-07: エクスポート ━━━

export function exportToCSV<T extends Record<string, unknown>>(
  items: T[],
  columns: {field: keyof T; label: string}[],
): string {
  const header = columns.map((c) => escapeCSV(c.label)).join(',');
  const rows = items.map((item) =>
    columns.map((c) => escapeCSV(String(item[c.field] ?? ''))).join(','),
  );
  // BOM付きUTF-8（Excelでの日本語文字化け防止）
  return '\uFEFF' + [header, ...rows].join('\n');
}

export function exportToJSON<T>(items: T[]): string {
  return JSON.stringify(items, null, 2);
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ━━━ NV-03~07 統合パイプライン ━━━

export interface DataTableQuery<T> {
  filters?: FilterCondition<T>[];
  sorts?: SortConfig<T>[];
  page?: number;
  pageSize?: number;
}

/**
 * フィルタ→ソート→ページネーションの統合パイプライン
 * 全操作をワンショットで実行する。
 */
export function processDataTable<T extends Record<string, unknown>>(
  items: T[],
  query: DataTableQuery<T>,
): PaginationResult<T> {
  // Step 1: フィルタ
  let result = query.filters ? applyFilters(items, query.filters) : items;

  // Step 2: ソート
  if (query.sorts && query.sorts.length > 0) {
    result = applySort(result, query.sorts);
  }

  // Step 3: ページネーション
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  return paginate(result, {page, pageSize, total: result.length});
}
