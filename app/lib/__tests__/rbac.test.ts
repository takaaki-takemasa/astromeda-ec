/**
 * RBAC テスト — 心臓弁膜の権限制御テスト
 *
 * H-001/H-002: ロール定義・権限マトリクス・ミドルウェア
 */
import {describe, it, expect, vi} from 'vitest';
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  isRoleAtLeast,
  getPermissions,
  isValidRole,
  getSessionRole,
  requireRole,
  requirePermission,
  requireAnyPermission,
  ALL_ROLES,
  type Role,
  type Permission,
} from '../rbac';
import {AppError} from '../app-error';

// ━━━ モックセッション ━━━
function mockSession(data: Record<string, unknown> = {}) {
  const store = new Map(Object.entries(data));
  return {
    get: (key: string) => store.get(key),
    set: vi.fn(),
    has: vi.fn(),
    unset: vi.fn(),
    flash: vi.fn(),
    destroy: vi.fn(),
    commit: vi.fn(),
    isPending: false,
  } as any;
}

// ━━━ ロール定義 ━━━
// patch 0198-fu (2026-04-28): vendor ロール追加 (patch 0165) に追従。
// 旧テストは 4 ロール想定で stale になり、Run 309 以降 6 連続デプロイ失敗の原因の 1 つだった。
describe('RBAC ロール定義 (H-001)', () => {
  it('5つのロールが定義されている', () => {
    expect(ALL_ROLES).toEqual(['owner', 'admin', 'editor', 'vendor', 'viewer']);
  });

  it('isValidRole が正しく判定する', () => {
    expect(isValidRole('owner')).toBe(true);
    expect(isValidRole('admin')).toBe(true);
    expect(isValidRole('editor')).toBe(true);
    expect(isValidRole('vendor')).toBe(true);
    expect(isValidRole('viewer')).toBe(true);
    expect(isValidRole('superadmin')).toBe(false);
    expect(isValidRole('')).toBe(false);
    expect(isValidRole(null)).toBe(false);
    expect(isValidRole(undefined)).toBe(false);
    expect(isValidRole(42)).toBe(false);
  });
});

// ━━━ 権限マトリクス ━━━
describe('権限マトリクス', () => {
  describe('viewer権限', () => {
    it('閲覧系の権限を持つ', () => {
      expect(hasPermission('viewer', 'dashboard.view')).toBe(true);
      expect(hasPermission('viewer', 'agents.view')).toBe(true);
      expect(hasPermission('viewer', 'revenue.view')).toBe(true);
    });

    it('編集系の権限を持たない', () => {
      expect(hasPermission('viewer', 'products.edit')).toBe(false);
      expect(hasPermission('viewer', 'agents.control')).toBe(false);
      expect(hasPermission('viewer', 'settings.edit')).toBe(false);
    });
  });

  describe('editor権限', () => {
    it('viewerの全権限を継承', () => {
      const viewerPerms = getPermissions('viewer');
      for (const p of viewerPerms) {
        expect(hasPermission('editor', p)).toBe(true);
      }
    });

    it('商品編集・エージェント操作ができる', () => {
      expect(hasPermission('editor', 'products.edit')).toBe(true);
      expect(hasPermission('editor', 'agents.control')).toBe(true);
      expect(hasPermission('editor', 'pipelines.execute')).toBe(true);
    });

    it('ユーザー管理はできない', () => {
      expect(hasPermission('editor', 'users.view')).toBe(false);
      expect(hasPermission('editor', 'users.create')).toBe(false);
    });
  });

  describe('admin権限', () => {
    it('editorの全権限を継承', () => {
      const editorPerms = getPermissions('editor');
      for (const p of editorPerms) {
        expect(hasPermission('admin', p)).toBe(true);
      }
    });

    it('設定閲覧・ユーザー閲覧ができる', () => {
      expect(hasPermission('admin', 'settings.view')).toBe(true);
      expect(hasPermission('admin', 'users.view')).toBe(true);
      expect(hasPermission('admin', 'agents.configure')).toBe(true);
    });

    it('ユーザー作成・設定編集はできない', () => {
      expect(hasPermission('admin', 'users.create')).toBe(false);
      expect(hasPermission('admin', 'settings.edit')).toBe(false);
    });
  });

  describe('owner権限', () => {
    it('adminの全権限を継承', () => {
      const adminPerms = getPermissions('admin');
      for (const p of adminPerms) {
        expect(hasPermission('owner', p)).toBe(true);
      }
    });

    it('全権限を持つ', () => {
      expect(hasPermission('owner', 'users.create')).toBe(true);
      expect(hasPermission('owner', 'users.delete')).toBe(true);
      expect(hasPermission('owner', 'settings.edit')).toBe(true);
    });
  });

  describe('階層継承の整合性', () => {
    it('上位ロールは下位の全権限を含む', () => {
      const roles: Role[] = ['viewer', 'editor', 'admin', 'owner'];
      for (let i = 0; i < roles.length - 1; i++) {
        const lower = getPermissions(roles[i]);
        const higher = getPermissions(roles[i + 1]);
        for (const perm of lower) {
          expect(higher.has(perm)).toBe(true);
        }
      }
    });
  });
});

// ━━━ hasAllPermissions / hasAnyPermission ━━━
describe('複合権限チェック', () => {
  it('hasAllPermissions: 全権限を持つ場合のみtrue', () => {
    expect(hasAllPermissions('editor', ['products.edit', 'agents.control'])).toBe(true);
    expect(hasAllPermissions('viewer', ['dashboard.view', 'products.edit'])).toBe(false);
  });

  it('hasAnyPermission: いずれかの権限を持てばtrue', () => {
    expect(hasAnyPermission('viewer', ['dashboard.view', 'products.edit'])).toBe(true);
    expect(hasAnyPermission('viewer', ['products.edit', 'settings.edit'])).toBe(false);
  });
});

// ━━━ ロール階層 ━━━
describe('ロール階層', () => {
  it('owner は全ロール以上', () => {
    expect(isRoleAtLeast('owner', 'owner')).toBe(true);
    expect(isRoleAtLeast('owner', 'admin')).toBe(true);
    expect(isRoleAtLeast('owner', 'editor')).toBe(true);
    expect(isRoleAtLeast('owner', 'viewer')).toBe(true);
  });

  it('viewer は viewer のみ', () => {
    expect(isRoleAtLeast('viewer', 'viewer')).toBe(true);
    expect(isRoleAtLeast('viewer', 'editor')).toBe(false);
    expect(isRoleAtLeast('viewer', 'admin')).toBe(false);
    expect(isRoleAtLeast('viewer', 'owner')).toBe(false);
  });

  it('admin は admin/editor/viewer', () => {
    expect(isRoleAtLeast('admin', 'admin')).toBe(true);
    expect(isRoleAtLeast('admin', 'editor')).toBe(true);
    expect(isRoleAtLeast('admin', 'owner')).toBe(false);
  });
});

// ━━━ セッション連携 ━━━
describe('セッションからロール取得', () => {
  it('isAdmin=false → null', () => {
    const session = mockSession({isAdmin: false});
    expect(getSessionRole(session)).toBeNull();
  });

  it('isAdmin=true, role未設定 → owner（後方互換）', () => {
    const session = mockSession({isAdmin: true});
    expect(getSessionRole(session)).toBe('owner');
  });

  it('isAdmin=true, role=editor → editor', () => {
    const session = mockSession({isAdmin: true, role: 'editor'});
    expect(getSessionRole(session)).toBe('editor');
  });

  it('isAdmin=true, role=invalid → owner（フォールバック）', () => {
    const session = mockSession({isAdmin: true, role: 'superadmin'});
    expect(getSessionRole(session)).toBe('owner');
  });

  it('セッションなし（isAdmin undefined） → null', () => {
    const session = mockSession({});
    expect(getSessionRole(session)).toBeNull();
  });
});

// ━━━ ミドルウェア (H-002) ━━━
describe('requireRole ミドルウェア (H-002)', () => {
  it('認証済み + 十分な権限 → ロールを返す', () => {
    const session = mockSession({isAdmin: true, role: 'admin'});
    expect(requireRole(session, 'admin')).toBe('admin');
    expect(requireRole(session, 'editor')).toBe('admin');
    expect(requireRole(session, 'viewer')).toBe('admin');
  });

  it('未認証 → 401 AppError', () => {
    const session = mockSession({isAdmin: false});
    expect(() => requireRole(session, 'viewer')).toThrow(AppError);
    try {
      requireRole(session, 'viewer');
    } catch (err) {
      expect(AppError.isAppError(err)).toBe(true);
      if (AppError.isAppError(err)) {
        expect(err.status).toBe(401);
        expect(err.category).toBe('AUTHENTICATION');
      }
    }
  });

  it('権限不足 → 403 AppError', () => {
    const session = mockSession({isAdmin: true, role: 'viewer'});
    expect(() => requireRole(session, 'admin')).toThrow(AppError);
    try {
      requireRole(session, 'admin');
    } catch (err) {
      expect(AppError.isAppError(err)).toBe(true);
      if (AppError.isAppError(err)) {
        expect(err.status).toBe(403);
        expect(err.category).toBe('AUTHORIZATION');
      }
    }
  });
});

describe('requirePermission ミドルウェア', () => {
  it('権限あり → ロールを返す', () => {
    const session = mockSession({isAdmin: true, role: 'editor'});
    expect(requirePermission(session, 'products.edit')).toBe('editor');
  });

  it('権限なし → 403', () => {
    const session = mockSession({isAdmin: true, role: 'viewer'});
    expect(() => requirePermission(session, 'products.edit')).toThrow(AppError);
    try {
      requirePermission(session, 'products.edit');
    } catch (err) {
      if (AppError.isAppError(err)) {
        expect(err.status).toBe(403);
      }
    }
  });
});

describe('requireAnyPermission ミドルウェア', () => {
  it('いずれかの権限あり → ロールを返す', () => {
    const session = mockSession({isAdmin: true, role: 'viewer'});
    expect(requireAnyPermission(session, ['dashboard.view', 'settings.edit'])).toBe('viewer');
  });

  it('全権限なし → 403', () => {
    const session = mockSession({isAdmin: true, role: 'viewer'});
    expect(() => requireAnyPermission(session, ['products.edit', 'settings.edit'])).toThrow(AppError);
  });

  it('未認証 → 401', () => {
    const session = mockSession({});
    expect(() => requireAnyPermission(session, ['dashboard.view'])).toThrow(AppError);
  });
});
