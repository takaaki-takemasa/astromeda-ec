/**
 * Admin Users — ユーザー管理画面（MHC免疫レジストリUI）
 *
 * 医学メタファー: MHC免疫レジストリの管理コンソール
 * 「自己」として認識されるユーザーの一覧、登録、ロール変更、無効化を行う。
 *
 * RBAC: owner のみアクセス可能
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, data, useLoaderData } from 'react-router';
import { AppSession } from '~/lib/session';

// ── テーマ定数 ──
const D = {
  bg: '#06060C',
  bgCard: '#0D0D18',
  bgHover: '#14142A',
  border: 'rgba(255,255,255,.06)',
  cyan: '#00F0FF',
  green: '#00E676',
  yellow: '#FFB300',
  red: '#FF2D55',
  orange: '#FF6B00',
  text: '#fff',
  textMuted: 'rgba(255,255,255,.55)',
  textDim: 'rgba(255,255,255,.3)',
};

// ── Loader ──
export async function loader({ request, context }: { request: Request; context: { env: Env } }) {
  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env);
  if (!auth.authenticated) return auth.response;

  return data({ ok: true });
}

export const meta = () => [
  { title: 'ASTROMEDA | ユーザー管理' },
  { name: 'robots', content: 'noindex, nofollow' },
];

// ── 型 ──
interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
  createdAt: number;
  lastLoginAt?: number;
  permissions: string[];
}

interface RoleInfo {
  id: string;
  name: string;
  description: string;
  permissionCount: number;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Create form state
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('admin');
  const [newPassword, setNewPassword] = useState('');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPasswordChange, setNewPasswordChange] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');

  const fetchUsers = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000); // 5s timeout for internal API
    try {
      const res = await fetch('/api/admin/users', { signal: controller.signal });
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        if (data.success) {
          setUsers((data.users as UserRecord[]) || []);
          setRoles((data.roles as RoleInfo[]) || []);
        }
      }
    } catch { /* silent */ } finally {
      clearTimeout(timeoutId);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async () => {
    if (!newEmail || !newName || !newPassword) {
      setError('全フィールドを入力してください');
      return;
    }
    if (newPassword.length < 8) {
      setError('パスワードは8文字以上');
      return;
    }
    setActionLoading(true);
    setError('');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000); // 5s timeout for internal API
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          email: newEmail,
          displayName: newName,
          role: newRole,
          password: newPassword,
        }),
        signal: controller.signal,
      });
      const data = await res.json() as Record<string, unknown>;
      if (data.success) {
        setShowCreateForm(false);
        setNewEmail(''); setNewName(''); setNewPassword('');
        await fetchUsers();
      } else {
        setError((data.error as string) || 'エラーが発生しました');
      }
    } catch { setError('通信エラー'); } finally {
      clearTimeout(timeoutId);
    }
    setActionLoading(false);
  };

  const handleDeactivate = async (userId: string) => {
    if (!confirm('このユーザーを無効化しますか？')) return;
    setActionLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000); // 5s timeout for internal API
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deactivate', userId }),
        signal: controller.signal,
      });
      const data = await res.json() as Record<string, unknown>;
      if (data.success) await fetchUsers();
      else setError((data.error as string) || 'エラー');
    } catch { setError('通信エラー'); } finally {
      clearTimeout(timeoutId);
    }
    setActionLoading(false);
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    setActionLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000); // 5s timeout for internal API
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'changeRole', userId, newRole }),
        signal: controller.signal,
      });
      const data = await res.json() as Record<string, unknown>;
      if (data.success) await fetchUsers();
      else setError((data.error as string) || 'エラー');
    } catch { setError('通信エラー'); } finally {
      clearTimeout(timeoutId);
    }
    setActionLoading(false);
  };

  const handlePasswordChange = async () => {
    if (!currentPassword || !newPasswordChange) {
      setPasswordMsg('全フィールドを入力してください');
      return;
    }
    if (newPasswordChange.length < 8) {
      setPasswordMsg('新パスワードは8文字以上');
      return;
    }
    setActionLoading(true);
    setPasswordMsg('');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000); // 5s timeout for internal API
    try {
      const res = await fetch('/api/admin/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword: newPasswordChange }),
        signal: controller.signal,
      });
      const data = await res.json() as Record<string, unknown>;
      if (data.success) {
        setPasswordMsg('パスワードを変更しました');
        setCurrentPassword(''); setNewPasswordChange('');
        setShowPasswordForm(false);
      } else {
        setPasswordMsg((data.error as string) || ((data.hint as string) ? `${data.error}\n${data.hint}` : 'エラー'));
      }
    } catch { setPasswordMsg('通信エラー'); } finally {
      clearTimeout(timeoutId);
    }
    setActionLoading(false);
  };

  const roleColor = (role: string) => {
    switch (role) {
      case 'owner': return D.cyan;
      case 'admin': return D.green;
      case 'viewer': return D.yellow;
      default: return D.textMuted;
    }
  };

  return (
    <div style={{
      background: D.bg,
      minHeight: '100vh',
      fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif",
      color: D.text,
      padding: 'clamp(16px, 3vw, 32px)',
    }}>
      {/* ヘッダー */}
      <div style={{
        maxWidth: 1000,
        margin: '0 auto',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}>
          <div>
            <Link to="/admin" style={{
              color: D.textDim,
              textDecoration: 'none',
              fontSize: 10,
              letterSpacing: 2,
            }}>
              ← DASHBOARD
            </Link>
            <h1 style={{
              fontSize: 'clamp(18px, 3vw, 24px)',
              fontWeight: 900,
              color: D.cyan,
              margin: '8px 0 4px',
              letterSpacing: 2,
            }}>
              USER MANAGEMENT
            </h1>
            <div style={{fontSize: 11, color: D.textDim}}>
              ユーザー管理 — MHC免疫レジストリ
            </div>
          </div>
          <div style={{display: 'flex', gap: 8}}>
            <button
              type="button"
              onClick={() => setShowPasswordForm(!showPasswordForm)}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: `1px solid ${D.border}`,
                background: 'none',
                color: D.textMuted,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🔑 パスワード変更
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(!showCreateForm)}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: D.cyan,
                color: '#000',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                letterSpacing: 1,
              }}
            >
              + 新規ユーザー
            </button>
          </div>
        </div>

        {/* エラー表示 */}
        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: `${D.red}10`,
            border: `1px solid ${D.red}30`,
            color: D.red,
            fontSize: 12,
            marginBottom: 16,
          }}>
            {error}
            <button type="button" onClick={() => setError('')} style={{
              float: 'right', background: 'none', border: 'none', color: D.red, cursor: 'pointer',
            }}>✕</button>
          </div>
        )}

        {/* パスワード変更フォーム */}
        {showPasswordForm && (
          <div style={{
            background: D.bgCard,
            borderRadius: 14,
            border: `1px solid ${D.border}`,
            padding: 20,
            marginBottom: 16,
          }}>
            <div style={{fontSize: 13, fontWeight: 800, color: D.text, marginBottom: 12}}>
              🔑 パスワード変更
            </div>
            <div style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
              <input
                type="password"
                placeholder="現在のパスワード"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                style={inputStyle}
              />
              <input
                type="password"
                placeholder="新しいパスワード（8文字以上）"
                value={newPasswordChange}
                onChange={(e) => setNewPasswordChange(e.target.value)}
                style={inputStyle}
              />
              <button
                type="button"
                onClick={handlePasswordChange}
                disabled={actionLoading}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: D.green,
                  color: '#000',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                変更
              </button>
            </div>
            {passwordMsg && (
              <div style={{
                fontSize: 11,
                color: passwordMsg.includes('変更しました') ? D.green : D.red,
                marginTop: 8,
              }}>
                {passwordMsg}
              </div>
            )}
          </div>
        )}

        {/* 新規ユーザー作成フォーム */}
        {showCreateForm && (
          <div style={{
            background: D.bgCard,
            borderRadius: 14,
            border: `1px solid ${D.cyan}30`,
            padding: 20,
            marginBottom: 16,
          }}>
            <div style={{fontSize: 13, fontWeight: 800, color: D.cyan, marginBottom: 12}}>
              新規ユーザー登録
            </div>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10}}>
              <input
                type="email"
                placeholder="メールアドレス"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                style={inputStyle}
              />
              <input
                type="text"
                placeholder="表示名"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={inputStyle}
              />
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                style={{...inputStyle, cursor: 'pointer'}}
              >
                <option value="admin">管理者（Admin）</option>
                <option value="viewer">閲覧者（Viewer）</option>
                <option value="owner">オーナー（Owner）</option>
              </select>
              <input
                type="password"
                placeholder="パスワード（8文字以上）"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{marginTop: 12, display: 'flex', gap: 8}}>
              <button
                type="button"
                onClick={handleCreate}
                disabled={actionLoading}
                style={{
                  padding: '10px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: D.cyan,
                  color: '#000',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {actionLoading ? '作成中...' : '作成'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: `1px solid ${D.border}`,
                  background: 'none',
                  color: D.textMuted,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* ロール一覧 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          marginBottom: 24,
        }}>
          {roles.map((role) => (
            <div key={role.id} style={{
              background: D.bgCard,
              borderRadius: 12,
              border: `1px solid ${roleColor(role.id)}20`,
              padding: 14,
            }}>
              <div style={{
                fontSize: 10,
                fontWeight: 800,
                color: roleColor(role.id),
                letterSpacing: 2,
                marginBottom: 4,
              }}>
                {role.name.toUpperCase()}
              </div>
              <div style={{fontSize: 10, color: D.textMuted, lineHeight: 1.4}}>
                {role.description}
              </div>
              <div style={{fontSize: 9, color: D.textDim, marginTop: 6}}>
                権限: {role.permissionCount}項目
              </div>
            </div>
          ))}
        </div>

        {/* ユーザー一覧 */}
        <div style={{
          fontSize: 11,
          fontWeight: 800,
          color: D.textDim,
          letterSpacing: 2,
          marginBottom: 10,
        }}>
          REGISTERED USERS — {users.length}名
        </div>

        {loading ? (
          <div style={{textAlign: 'center', padding: 40, color: D.textMuted, fontSize: 11}}>
            読み込み中...
          </div>
        ) : (
          <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
            {users.map((user) => (
              <div key={user.id} style={{
                background: D.bgCard,
                borderRadius: 14,
                border: `1px solid ${user.isActive ? D.border : `${D.red}20`}`,
                padding: 16,
                opacity: user.isActive ? 1 : 0.5,
              }}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <div>
                    <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                      <span style={{fontSize: 14, fontWeight: 800, color: D.text}}>
                        {user.displayName}
                      </span>
                      <span style={{
                        fontSize: 9,
                        fontWeight: 800,
                        color: roleColor(user.role),
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: `${roleColor(user.role)}15`,
                        border: `1px solid ${roleColor(user.role)}30`,
                        letterSpacing: 1,
                      }}>
                        {user.role.toUpperCase()}
                      </span>
                      {!user.isActive && (
                        <span style={{
                          fontSize: 9,
                          color: D.red,
                          fontWeight: 700,
                        }}>
                          無効
                        </span>
                      )}
                    </div>
                    <div style={{fontSize: 10, color: D.textMuted, marginTop: 4}}>
                      {user.email}
                    </div>
                    <div style={{fontSize: 9, color: D.textDim, marginTop: 4}}>
                      作成: {new Date(user.createdAt).toLocaleDateString('ja-JP')}
                      {user.lastLoginAt && ` | 最終ログイン: ${new Date(user.lastLoginAt).toLocaleDateString('ja-JP')}`}
                    </div>
                  </div>

                  {/* アクション */}
                  {user.isActive && user.role !== 'owner' && (
                    <div style={{display: 'flex', gap: 6}}>
                      <select
                        value={user.role}
                        onChange={(e) => handleChangeRole(user.id, e.target.value)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: `1px solid ${D.border}`,
                          background: D.bg,
                          color: D.textMuted,
                          fontSize: 10,
                          cursor: 'pointer',
                        }}
                      >
                        <option value="admin">Admin</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleDeactivate(user.id)}
                        disabled={actionLoading}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: `1px solid ${D.red}40`,
                          background: 'none',
                          color: D.red,
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        無効化
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 共通スタイル ──
const inputStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 8,
  border: `1px solid rgba(255,255,255,.06)`,
  background: '#06060C',
  color: '#fff',
  fontSize: 12,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  width: '100%',
};

export { RouteErrorBoundary as ErrorBoundary } from '~/components/astro/RouteErrorBoundary';
