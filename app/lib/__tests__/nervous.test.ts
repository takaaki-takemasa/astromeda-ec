/**
 * NV: 神経系（Nervous System）テスト
 *
 * NV-03~07: DataTable ページネーション・フィルタ・ソート・バルク・エクスポート
 * NV-10: Admin Store 状態管理
 * NV-11: Keyboard Shortcuts
 * NV-12: a11y / 構造検証
 */
import {describe, it, expect, beforeEach} from 'vitest';

// NV-03~07
import {
  paginate,
  applyFilters,
  applySort,
  executeBulkAction,
  exportToCSV,
  exportToJSON,
  processDataTable,
} from '../data-table';

// NV-10
import {
  createAdminStoreSlice,
  initialAdminState,
  type AdminState,
} from '../admin-store';

// NV-11: keyboard-shortcuts はクライアント専用（window依存）のため
// ここでは構造テストのみ。実際の操作テストはE2E/ブラウザテストで実施。

// ━━━ テストデータ ━━━

interface TestItem {
  id: string;
  name: string;
  status: string;
  score: number;
}

const testItems: TestItem[] = [
  {id: '1', name: 'Alpha', status: 'active', score: 90},
  {id: '2', name: 'Beta', status: 'inactive', score: 75},
  {id: '3', name: 'Gamma', status: 'active', score: 60},
  {id: '4', name: 'Delta', status: 'active', score: 95},
  {id: '5', name: 'Epsilon', status: 'inactive', score: 80},
  {id: '6', name: 'Zeta', status: 'active', score: 70},
  {id: '7', name: 'Eta', status: 'inactive', score: 85},
];

// ━━━ NV-03: Pagination ━━━

describe('NV-03: Pagination', () => {
  it('正しくページ分割する', () => {
    const result = paginate(testItems, {page: 1, pageSize: 3, total: 7});
    expect(result.items).toHaveLength(3);
    expect(result.totalPages).toBe(3);
    expect(result.hasNext).toBe(true);
    expect(result.hasPrev).toBe(false);
  });

  it('2ページ目を取得', () => {
    const result = paginate(testItems, {page: 2, pageSize: 3, total: 7});
    expect(result.items).toHaveLength(3);
    expect(result.items[0].name).toBe('Delta');
    expect(result.hasNext).toBe(true);
    expect(result.hasPrev).toBe(true);
  });

  it('最終ページは残りアイテムのみ', () => {
    const result = paginate(testItems, {page: 3, pageSize: 3, total: 7});
    expect(result.items).toHaveLength(1);
    expect(result.hasNext).toBe(false);
  });

  it('範囲外ページは安全にクランプ', () => {
    const result = paginate(testItems, {page: 99, pageSize: 3, total: 7});
    expect(result.page).toBe(3); // 最終ページに丸め
  });

  it('page 0以下は1に補正', () => {
    const result = paginate(testItems, {page: 0, pageSize: 3, total: 7});
    expect(result.page).toBe(1);
  });
});

// ━━━ NV-04: Filtering ━━━

describe('NV-04: Filtering', () => {
  it('eq: 完全一致フィルタ', () => {
    const result = applyFilters(testItems, [{field: 'status', operator: 'eq', value: 'active'}]);
    expect(result).toHaveLength(4);
    expect(result.every((i) => i.status === 'active')).toBe(true);
  });

  it('contains: 部分一致（大文字小文字無視）', () => {
    const result = applyFilters(testItems, [{field: 'name', operator: 'contains', value: 'eta'}]);
    // Beta contains 'eta', Zeta contains 'eta', Eta contains 'eta' = 3件
    expect(result).toHaveLength(3);
  });

  it('gt: 数値比較', () => {
    const result = applyFilters(testItems, [{field: 'score', operator: 'gt', value: 80}]);
    expect(result.every((i) => i.score > 80)).toBe(true);
  });

  it('複数フィルタはAND条件', () => {
    const result = applyFilters(testItems, [
      {field: 'status', operator: 'eq', value: 'active'},
      {field: 'score', operator: 'gte', value: 80},
    ]);
    expect(result.every((i) => i.status === 'active' && i.score >= 80)).toBe(true);
  });

  it('空フィルタは全件返す', () => {
    const result = applyFilters(testItems, []);
    expect(result).toHaveLength(7);
  });
});

// ━━━ NV-05: Sorting ━━━

describe('NV-05: Sorting', () => {
  it('名前昇順ソート', () => {
    const result = applySort(testItems, [{field: 'name', direction: 'asc'}]);
    expect(result[0].name).toBe('Alpha');
    expect(result[result.length - 1].name).toBe('Zeta');
  });

  it('スコア降順ソート', () => {
    const result = applySort(testItems, [{field: 'score', direction: 'desc'}]);
    expect(result[0].score).toBe(95);
    expect(result[result.length - 1].score).toBe(60);
  });

  it('複数フィールドソート', () => {
    const result = applySort(testItems, [
      {field: 'status', direction: 'asc'},
      {field: 'score', direction: 'desc'},
    ]);
    // active が先（昇順）、active内ではスコア降順
    expect(result[0].status).toBe('active');
    expect(result[0].score).toBe(95);
  });

  it('空ソートは元の順序を維持', () => {
    const result = applySort(testItems, []);
    expect(result).toEqual(testItems);
  });
});

// ━━━ NV-06: Bulk Actions ━━━

describe('NV-06: Bulk Actions', () => {
  it('全件成功', async () => {
    const result = await executeBulkAction(
      testItems.slice(0, 3),
      async () => {},
    );
    expect(result.success).toBe(3);
    expect(result.failed).toBe(0);
  });

  it('一部失敗', async () => {
    let callCount = 0;
    const result = await executeBulkAction(
      testItems.slice(0, 3),
      async () => {
        callCount++;
        if (callCount === 2) throw new Error('Test failure');
      },
    );
    expect(result.success).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
  });
});

// ━━━ NV-07: Export ━━━

describe('NV-07: Export', () => {
  it('CSVエクスポート（BOM付きUTF-8）', () => {
    const csv = exportToCSV(testItems.slice(0, 2), [
      {field: 'name', label: '名前'},
      {field: 'score', label: 'スコア'},
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('名前,スコア');
    expect(csv).toContain('Alpha,90');
  });

  it('CSVのカンマ含み値はダブルクォート', () => {
    const items = [{id: '1', name: 'Alpha, Beta', score: 90}];
    const csv = exportToCSV(items, [{field: 'name', label: 'Name'}]);
    expect(csv).toContain('"Alpha, Beta"');
  });

  it('JSONエクスポート', () => {
    const json = exportToJSON(testItems.slice(0, 1));
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Alpha');
  });
});

// ━━━ NV-03~07 統合パイプライン ━━━

describe('NV-03~07: processDataTable Integration', () => {
  it('フィルタ→ソート→ページネーション', () => {
    const result = processDataTable(testItems, {
      filters: [{field: 'status', operator: 'eq', value: 'active'}],
      sorts: [{field: 'score', direction: 'desc'}],
      page: 1,
      pageSize: 2,
    });
    expect(result.total).toBe(4); // 4件のactive
    expect(result.items).toHaveLength(2); // pageSize=2
    expect(result.items[0].score).toBe(95); // 最高スコアが先
    expect(result.totalPages).toBe(2);
  });

  it('デフォルトページサイズ20', () => {
    const result = processDataTable(testItems, {});
    expect(result.pageSize).toBe(20);
    expect(result.items).toHaveLength(7); // 全件（20未満）
  });
});

// ━━━ NV-10: Admin Store ━━━

describe('NV-10: Admin Store', () => {
  let state: AdminState;
  let store: ReturnType<typeof createAdminStoreSlice>;

  beforeEach(() => {
    state = {...initialAdminState};
    const set = (partial: Partial<AdminState> | ((s: AdminState) => Partial<AdminState>)) => {
      if (typeof partial === 'function') {
        Object.assign(state, partial(state));
      } else {
        Object.assign(state, partial);
      }
    };
    const get = () => state;
    store = createAdminStoreSlice(set as any, get as any);
  });

  it('初期状態が正しい', () => {
    expect(state.sidebarOpen).toBe(true);
    expect(state.theme).toBe('dark');
    expect(state.agents).toEqual([]);
    expect(state.unreadCount).toBe(0);
  });

  it('toggleSidebar で開閉切替', () => {
    store.toggleSidebar();
    expect(state.sidebarOpen).toBe(false);
    store.toggleSidebar();
    expect(state.sidebarOpen).toBe(true);
  });

  it('setTheme でテーマ切替', () => {
    store.setTheme('light');
    expect(state.theme).toBe('light');
  });

  it('setAgents でエージェント設定', () => {
    const agents = [{id: 'a1', name: 'Test', level: 'L0' as const, team: 'core', status: 'healthy' as const, uptime: 100, errorCount: 0, lastHeartbeat: Date.now(), taskQueue: 0, version: '1.0'}];
    store.setAgents(agents);
    expect(state.agents).toHaveLength(1);
  });

  it('addNotification で通知追加', () => {
    store.addNotification({type: 'info', title: 'Test', message: 'Hello'});
    expect(state.notifications).toHaveLength(1);
    expect(state.unreadCount).toBe(1);
    expect(state.notifications[0].read).toBe(false);
  });

  it('markAllRead で全件既読', () => {
    store.addNotification({type: 'info', title: 'A', message: ''});
    store.addNotification({type: 'warning', title: 'B', message: ''});
    store.markAllRead();
    expect(state.unreadCount).toBe(0);
    expect(state.notifications.every((n) => n.read)).toBe(true);
  });

  it('reset で初期状態に戻る', () => {
    store.setTheme('light');
    store.setAndonStatus('red');
    store.reset();
    expect(state.theme).toBe('dark');
    expect(state.andonStatus).toBe('green');
  });
});

// ━━━ NV-12: a11y構造検証 ━━━

describe('NV-12: Accessibility', () => {
  it('api-schemas の safeString がHTMLタグを拒否（XSS防止）', async () => {
    const {AndonActionSchema} = await import('../api-schemas');
    const result = AndonActionSchema.safeParse({action: 'pull', reason: '<script>alert(1)</script>'});
    expect(result.success).toBe(false);
  });

  it('api-schemas が strict で未知フィールドを拒否', async () => {
    const {AndonActionSchema} = await import('../api-schemas');
    const result = AndonActionSchema.safeParse({action: 'pull', unknown: 'field'});
    expect(result.success).toBe(false);
  });

  it('sanitize-html が基本的なXSS攻撃を除去', async () => {
    const {sanitizeHtml} = await import('../sanitize-html');
    expect(sanitizeHtml('<script>alert(1)</script>Hello')).not.toContain('<script>');
    expect(sanitizeHtml('<img onerror="alert(1)" src="x">')).not.toContain('onerror');
  });
});
