/**
 * AdminMembers — メンバー管理タブ (patch 0156)
 *
 * 個別ユーザーアカウントの管理。
 *  - 一覧表示 (username/displayName/role/active/最終ログイン)
 *  - 新規作成 (bootstrap 時は強制 owner)
 *  - 編集 (displayName/role/active)
 *  - パスワード再設定 (admin)
 *  - 削除 (confirm 必須)
 *
 * RBAC: owner / admin (users.view+) のみ閲覧可
 *       users.create でユーザー作成可
 *       users.edit で編集・パスワード再設定可
 *       users.delete で削除可
 *
 * 全 fetch は credentials:'include' で session cookie を送る + _csrf body field を含める。
 */
import {useEffect, useState, useCallback} from 'react';
import {color, radius, space} from '~/lib/design-tokens';
import {useConfirmDialog} from '~/hooks/useConfirmDialog';
import {useToast} from '~/components/admin/ds/Toast';
import {AdminListSkeleton, AdminEmptyCard} from '~/components/admin/ds/InlineListState';
import {TabHeaderHint} from '~/components/admin/ds/TabHeaderHint';

// ── Types ──
interface MemberSafe {
  id: string;
  handle: string;
  username: string;
  displayName: string;
  // patch 0169: 姓+名+メール (任意・後方互換のため optional)
  firstName?: string;
  lastName?: string;
  email?: string;
  // patch 0165: vendor (他社デザイン会社等の限定ロール) 追加
  role: 'owner' | 'admin' | 'editor' | 'vendor' | 'viewer';
  active: boolean;
  lastLoginAt: string | null;
  updatedAt: string;
}

// patch 0169: 姓+名 から表示名を組み立てる (空なら fallback)
function joinNamesForDisplay(firstName?: string, lastName?: string, fallback = ''): string {
  const f = (firstName || '').trim();
  const l = (lastName || '').trim();
  if (f && l) return `${f} ${l}`;
  if (f) return f;
  if (l) return l;
  return fallback;
}

// patch 0169: owner / admin はメール必須
function isEmailRequiredFor(role: MemberSafe['role']): boolean {
  return role === 'owner' || role === 'admin';
}

interface BootstrapState {
  definitionExists: boolean;
  userCount: number;
  bootstrapMode: boolean;
}

const ROLE_LABEL: Record<MemberSafe['role'], {label: string; color: string; description: string}> = {
  owner: {label: 'オーナー', color: '#FF2D55', description: 'すべての操作・メンバー管理可'},
  admin: {label: '管理者', color: '#FF9500', description: '商品・コンテンツ・メンバー閲覧可'},
  editor: {label: '編集者', color: '#00F0FF', description: '商品・コンテンツ編集可'},
  // patch 0165: vendor — 他社（デザイン会社・PC組立業者など）に渡す限定ロール
  vendor: {label: '外注先（限定）', color: '#A855F7', description: 'ゲーミングPCタブの編集 + コラボ以外の商品/コレクション編集のみ。IPコラボ・トップページ・メンバー管理には触れません。'},
  viewer: {label: '閲覧者', color: '#888', description: '閲覧のみ'},
};

const cardStyle: React.CSSProperties = {
  background: color.bg1,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  padding: space[4],
  marginBottom: space[3],
};

// CSRF トークンを meta tag から取得
function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const meta = document.querySelector<HTMLMetaElement>('meta[name="_csrf"]');
  return meta?.content || '';
}

async function api(method: 'GET' | 'POST', body?: Record<string, unknown>, url = '/api/admin/members'): Promise<{success: boolean; [k: string]: unknown}> {
  const init: RequestInit = {
    method,
    credentials: 'include',
    // patch 0169-fu: CSRF は X-CSRF-Token header (Origin/Referer ベース) のみで検証する。
    // body に _csrf を入れると Zod schema の .strict() が unknown key として reject し
    // 「リクエストの形式が不正です」になる。patch 0166-fu2 と同じ修正。
    headers: {'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken()},
  };
  if (body && method === 'POST') {
    init.body = JSON.stringify(body); // _csrf を body には入れない
  }
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({success: false, error: 'JSON parse error'}))) as {success: boolean; error?: string; [k: string]: unknown};
  if (!res.ok && !json.error) {
    // patch 0169-fu: Zod issues があれば最初の問題をユーザに見せる
    const issues = (json as {issues?: Array<{message?: string; path?: (string | number)[]}>}).issues;
    if (Array.isArray(issues) && issues.length > 0) {
      const first = issues[0];
      const path = (first.path || []).join('.');
      json.error = `入力エラー: ${path ? path + ' — ' : ''}${first.message || `HTTP ${res.status}`}`;
    } else {
      json.error = `HTTP ${res.status}`;
    }
  }
  return json;
}

export default function AdminMembers() {
  const [members, setMembers] = useState<MemberSafe[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootstrap, setBootstrap] = useState<BootstrapState | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberSafe | null>(null);
  const [resetPasswordFor, setResetPasswordFor] = useState<MemberSafe | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const {confirm, dialogProps, ConfirmDialog} = useConfirmDialog();
  const {pushToast, Toast} = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // bootstrap 状態をまず取得 (definition 不在ならエラーになる)
      const bsRes = await api('GET', undefined, '/api/admin/members?mode=bootstrap');
      if (bsRes.success) {
        setBootstrap({
          definitionExists: !!bsRes.definitionExists,
          userCount: Number(bsRes.userCount) || 0,
          bootstrapMode: !!bsRes.bootstrapMode,
        });
      } else {
        setBootstrap({definitionExists: false, userCount: 0, bootstrapMode: true});
      }

      const listRes = await api('GET', undefined, '/api/admin/members');
      if (listRes.success && Array.isArray(listRes.users)) {
        setMembers(listRes.users as MemberSafe[]);
      } else {
        setMembers([]);
      }
    } catch (err) {
      pushToast(
        `データ取得に失敗: ${err instanceof Error ? err.message : 'ネットワークエラー'}`,
        'error',
      );
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSetupDefinition = async () => {
    setSetupBusy(true);
    try {
      const res = await api('POST', {action: 'setup_definition'});
      if (res.success) {
        pushToast('初期化完了：メンバー保管用の領域を準備しました', 'success');
        await refresh();
      } else {
        pushToast(`初期化に失敗: ${String(res.error || '')}`, 'error');
      }
    } finally {
      setSetupBusy(false);
    }
  };

  const handleDelete = async (member: MemberSafe) => {
    const ok = await confirm({
      title: `${member.displayName} (${member.username}) を削除しますか?`,
      message: 'このユーザーは以後ログインできなくなります。元に戻せません。',
      confirmLabel: '削除する',
      destructive: true,
    });
    if (!ok) return;

    const res = await api('POST', {action: 'delete', id: member.id, confirm: true});
    if (res.success) {
      pushToast('削除しました', 'success');
      void refresh();
    } else {
      pushToast(`削除に失敗: ${String(res.error || '')}`, 'error');
    }
  };

  const handleToggleActive = async (member: MemberSafe) => {
    const next = !member.active;
    const res = await api('POST', {action: 'update', id: member.id, active: next});
    if (res.success) {
      pushToast(next ? '有効化しました' : '無効化しました', 'success');
      void refresh();
    } else {
      pushToast(`更新に失敗: ${String(res.error || '')}`, 'error');
    }
  };

  // ─── Render ───
  const sortedMembers = [...members].sort((a, b) => {
    // patch 0165: vendor は editor (2) と viewer (4) の間 (3) に挿入
    const order = {owner: 0, admin: 1, editor: 2, vendor: 3, viewer: 4} as const;
    return (order[a.role] - order[b.role]) || a.username.localeCompare(b.username);
  });

  return (
    <div style={{padding: space[4]}}>
      <TabHeaderHint
        title="👥 メンバー管理"
        description="管理画面にログインできる人を登録・管理します。退職時は無効化してください。"
      />

      <Toast />
      <ConfirmDialog {...dialogProps} />

      {/* Bootstrap setup banner */}
      {bootstrap && !bootstrap.definitionExists && (
        <div style={{
          ...cardStyle,
          background: 'rgba(0,240,255,0.05)',
          border: '1px solid rgba(0,240,255,0.3)',
        }}>
          <div style={{fontSize: 14, fontWeight: 800, color: '#00F0FF', marginBottom: 8}}>
            🔧 初期セットアップが必要です
          </div>
          <div style={{fontSize: 12, color: color.textMuted, lineHeight: 1.6, marginBottom: 12}}>
            メンバー保管用の領域がまだ作られていません。<br />
            下のボタンを押すと一度だけ準備が走ります (やり直し OK・既に準備済みなら何もしません)。
          </div>
          <button
            onClick={handleSetupDefinition}
            disabled={setupBusy}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: 700,
              color: '#000',
              background: setupBusy ? '#666' : '#00F0FF',
              border: 'none',
              borderRadius: 8,
              cursor: setupBusy ? 'wait' : 'pointer',
            }}
          >
            {setupBusy ? '準備中...' : '✓ 初期化する'}
          </button>
        </div>
      )}

      {bootstrap && bootstrap.definitionExists && bootstrap.bootstrapMode && (
        <div style={{
          ...cardStyle,
          background: 'rgba(255,149,0,0.08)',
          border: '1px solid rgba(255,149,0,0.3)',
        }}>
          <div style={{fontSize: 14, fontWeight: 800, color: '#FF9500', marginBottom: 8}}>
            ⚠ 個別ユーザーが登録されていません
          </div>
          <div style={{fontSize: 12, color: color.textMuted, lineHeight: 1.6, marginBottom: 12}}>
            現在は環境変数 ADMIN_PASSWORD を共有してログインしています。<br />
            最初のオーナーユーザーを作ると、以後は個別ログイン (誰がいつ何を変更したか追跡可能) になります。
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: 700,
              color: '#000',
              background: '#FF9500',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            + 最初のオーナーを作る
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[3], gap: space[3]}}>
        <div style={{fontSize: 12, color: color.textMuted}}>
          {loading ? '読み込み中...' : `${members.length} 名のメンバー`}
        </div>
        {bootstrap?.definitionExists && (
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 700,
              color: '#000',
              background: '#00E676',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            + 新規メンバーを追加
          </button>
        )}
      </div>

      {/* Member list */}
      {loading ? (
        <AdminListSkeleton rows={3} />
      ) : sortedMembers.length === 0 ? (
        <AdminEmptyCard
          title="メンバーがまだいません"
          description={bootstrap?.definitionExists
            ? '右上の「+ 新規メンバーを追加」から最初のメンバーを作成してください。'
            : '上の「初期化する」ボタンを押してから作成してください。'}
        />
      ) : (
        <div style={cardStyle}>
          <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 13}}>
            <thead>
              <tr style={{textAlign: 'left', borderBottom: `1px solid ${color.border}`}}>
                <th style={{padding: '10px 8px', fontWeight: 700, color: color.textMuted, fontSize: 11}}>ユーザー名</th>
                <th style={{padding: '10px 8px', fontWeight: 700, color: color.textMuted, fontSize: 11}}>姓 名 / 表示名</th>
                <th style={{padding: '10px 8px', fontWeight: 700, color: color.textMuted, fontSize: 11}}>メールアドレス</th>
                <th style={{padding: '10px 8px', fontWeight: 700, color: color.textMuted, fontSize: 11}}>役割</th>
                <th style={{padding: '10px 8px', fontWeight: 700, color: color.textMuted, fontSize: 11}}>状態</th>
                <th style={{padding: '10px 8px', fontWeight: 700, color: color.textMuted, fontSize: 11}}>最終ログイン</th>
                <th style={{padding: '10px 8px', fontWeight: 700, color: color.textMuted, fontSize: 11}}>操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((m) => {
                const fullName = joinNamesForDisplay(m.firstName, m.lastName, m.displayName);
                const emailWarning = isEmailRequiredFor(m.role) && !m.email;
                return (
                <tr key={m.id} style={{borderBottom: `1px solid ${color.border}`, opacity: m.active ? 1 : 0.5}}>
                  <td style={{padding: '12px 8px', fontFamily: 'monospace', color: color.text}}>{m.username}</td>
                  <td style={{padding: '12px 8px', color: color.text}}>
                    <div>{fullName}</div>
                    {/* patch 0169: 姓+名 がある場合は表示名も小さく併記 (差異がある時) */}
                    {(m.firstName || m.lastName) && m.displayName && m.displayName !== fullName && (
                      <div style={{fontSize: 10, color: color.textMuted, marginTop: 2}}>表示名: {m.displayName}</div>
                    )}
                  </td>
                  <td style={{padding: '12px 8px', color: m.email ? color.text : color.textMuted, fontSize: 12}}>
                    {m.email ? (
                      m.email
                    ) : emailWarning ? (
                      // patch 0169: owner/admin にメール未設定なら警告
                      <span style={{color: '#FF2D55', fontSize: 11}} title="ログインできなくなった時の本人確認用に必須です">
                        ⚠ 未設定
                      </span>
                    ) : (
                      <span style={{color: color.textMuted, fontSize: 11}}>—</span>
                    )}
                  </td>
                  <td style={{padding: '12px 8px'}}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 700,
                      color: ROLE_LABEL[m.role].color,
                      background: `${ROLE_LABEL[m.role].color}20`,
                      border: `1px solid ${ROLE_LABEL[m.role].color}40`,
                    }}>
                      {ROLE_LABEL[m.role].label}
                    </span>
                  </td>
                  <td style={{padding: '12px 8px'}}>
                    {m.active
                      ? <span style={{color: '#00E676', fontSize: 11}}>● 有効</span>
                      : <span style={{color: '#888', fontSize: 11}}>○ 無効</span>}
                  </td>
                  <td style={{padding: '12px 8px', color: color.textMuted, fontSize: 11}}>
                    {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString('ja-JP') : '未ログイン'}
                  </td>
                  <td style={{padding: '12px 8px'}}>
                    <div style={{display: 'flex', gap: 4, flexWrap: 'wrap'}}>
                      <button
                        onClick={() => setEditingMember(m)}
                        style={miniBtnStyle('#00F0FF')}
                        aria-label={`${m.displayName} を編集`}
                      >編集</button>
                      <button
                        onClick={() => setResetPasswordFor(m)}
                        style={miniBtnStyle('#FF9500')}
                        aria-label={`${m.displayName} のパスワードを再設定`}
                      >🔑 PW</button>
                      <button
                        onClick={() => handleToggleActive(m)}
                        style={miniBtnStyle(m.active ? '#888' : '#00E676')}
                        aria-label={m.active ? `${m.displayName} を無効化` : `${m.displayName} を有効化`}
                      >{m.active ? '無効化' : '有効化'}</button>
                      <button
                        onClick={() => handleDelete(m)}
                        style={miniBtnStyle('#FF2D55')}
                        aria-label={`${m.displayName} を削除`}
                      >削除</button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showCreateModal && bootstrap && (
        <CreateMemberModal
          isBootstrap={bootstrap.bootstrapMode}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            void refresh();
          }}
        />
      )}

      {editingMember && (
        <EditMemberModal
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSuccess={() => {
            setEditingMember(null);
            void refresh();
          }}
        />
      )}

      {resetPasswordFor && (
        <ResetPasswordModal
          member={resetPasswordFor}
          onClose={() => setResetPasswordFor(null)}
          onSuccess={() => {
            setResetPasswordFor(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function miniBtnStyle(c: string): React.CSSProperties {
  return {
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 600,
    color: c,
    background: 'transparent',
    border: `1px solid ${c}66`,
    borderRadius: 4,
    cursor: 'pointer',
  };
}

// ── Modals ──

function ModalShell({title, children, onClose}: {title: string; children: React.ReactNode; onClose: () => void}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}>
      <div style={{
        background: color.bg0,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        padding: space[5],
        width: '100%',
        maxWidth: 480,
        maxHeight: '90vh',
        overflow: 'auto',
      }}>
        <h2 id="member-modal-title" style={{fontSize: 18, fontWeight: 800, margin: 0, marginBottom: space[4], color: color.text}}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function CreateMemberModal({isBootstrap, onClose, onSuccess}: {isBootstrap: boolean; onClose: () => void; onSuccess: () => void}) {
  const [username, setUsername] = useState('');
  // patch 0169: 姓 + 名 を分けて入力 (リカバリー連絡時の本人特定用)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  // patch 0169: メールアドレス (owner/admin 必須・ログイン復旧手段)
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState(''); // 任意・空なら 姓+名 から自動生成
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<MemberSafe['role']>(isBootstrap ? 'owner' : 'editor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const {pushToast} = useToast();

  // patch 0169: 役割によって email 必須かを動的に判定
  const emailRequired = isBootstrap || isEmailRequiredFor(role);
  const computedDisplayName = joinNamesForDisplay(firstName, lastName, displayName.trim() || username);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    // patch 0169: 姓+名+メール を含めて送信 (空文字は trim で空欄として扱われる)
    const res = await api('POST', {
      action: 'create',
      username: username.trim(),
      displayName: displayName.trim() || undefined,
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      email: email.trim() || undefined,
      password,
      role,
    });
    setBusy(false);
    if (res.success) {
      pushToast(
        `作成しました：${username} (${computedDisplayName}) を ${ROLE_LABEL[role].label} で登録`,
        'success',
      );
      onSuccess();
    } else {
      setError(String(res.error || '作成に失敗しました'));
    }
  };

  return (
    <ModalShell title={isBootstrap ? '🔧 最初のオーナーを作る' : '+ 新規メンバーを追加'} onClose={onClose}>
      <form onSubmit={submit}>
        <FormField label="ユーザー名 (ログイン ID・3-32 文字英数字)" required>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
            minLength={3}
            maxLength={32}
            pattern="[a-zA-Z0-9._\-@]+"
            style={inputStyle}
            placeholder="tanaka-marketing"
          />
        </FormField>

        {/* patch 0169: 姓 + 名 (横並び・両方入れると displayName 自動生成) */}
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3]}}>
          <FormField label="姓 (例: 武正)" required>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              maxLength={50}
              style={inputStyle}
              placeholder="武正"
            />
          </FormField>
          <FormField label="名 (例: 貴昭)" required>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              maxLength={50}
              style={inputStyle}
              placeholder="貴昭"
            />
          </FormField>
        </div>

        {/* patch 0169: メールアドレス — owner/admin は必須 (ログイン復旧手段) */}
        <FormField label={emailRequired ? 'メールアドレス (ログインできなくなった時の本人確認用)' : 'メールアドレス (任意)'} required={emailRequired}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required={emailRequired}
            maxLength={254}
            style={inputStyle}
            placeholder="example@mining-base.co.jp"
          />
          {emailRequired && (
            <div style={{fontSize: 11, color: '#FF9500', marginTop: 4, lineHeight: 1.5}}>
              ⚠ オーナー / 管理者は必須です。パスワードを忘れた時や不正アクセス疑いがあった時に、このアドレスへ連絡します。
            </div>
          )}
        </FormField>

        <FormField label="表示名 (画面に出る名前・空なら 姓+名 を自動利用)">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
            style={inputStyle}
            placeholder={computedDisplayName || '田中太郎'}
          />
          {(firstName || lastName) && !displayName.trim() && (
            <div style={{fontSize: 11, color: color.textMuted, marginTop: 4}}>
              → 表示名: <strong style={{color: color.text}}>{computedDisplayName}</strong> として登録されます
            </div>
          )}
        </FormField>

        <FormField label="パスワード (8 文字以上)" required>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            maxLength={128}
            style={inputStyle}
          />
        </FormField>
        <FormField label="役割">
          {isBootstrap ? (
            <div style={{...inputStyle, color: '#FF2D55', fontSize: 13}}>
              オーナー (初期セットアップでは強制)
            </div>
          ) : (
            <select value={role} onChange={(e) => setRole(e.target.value as MemberSafe['role'])} style={inputStyle as React.CSSProperties}>
              <option value="owner">オーナー — 全権限・メンバー削除可</option>
              <option value="admin">管理者 — メンバー閲覧・全機能</option>
              <option value="editor">編集者 — 商品・コンテンツ編集</option>
              <option value="vendor">外注先（限定）— ゲーミングPCタブ + コラボ以外の商品</option>
              <option value="viewer">閲覧者 — 閲覧のみ</option>
            </select>
          )}
          <div style={{fontSize: 11, color: color.textMuted, marginTop: 4}}>
            {ROLE_LABEL[role].description}
          </div>
        </FormField>

        {error && (
          <div style={{padding: 10, background: 'rgba(255,45,85,0.1)', border: '1px solid rgba(255,45,85,0.3)', borderRadius: 6, color: '#FF2D55', fontSize: 12, marginBottom: space[3]}}>
            {error}
          </div>
        )}

        <div style={{display: 'flex', gap: space[2], justifyContent: 'flex-end'}}>
          <button type="button" onClick={onClose} style={cancelBtnStyle}>キャンセル</button>
          <button type="submit" disabled={busy} style={primaryBtnStyle(busy)}>
            {busy ? '作成中...' : '作成する'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function EditMemberModal({member, onClose, onSuccess}: {member: MemberSafe; onClose: () => void; onSuccess: () => void}) {
  // patch 0169: 姓 + 名 + メール を編集可能に
  const [firstName, setFirstName] = useState(member.firstName || '');
  const [lastName, setLastName] = useState(member.lastName || '');
  const [email, setEmail] = useState(member.email || '');
  const [displayName, setDisplayName] = useState(member.displayName);
  const [role, setRole] = useState<MemberSafe['role']>(member.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const {pushToast} = useToast();

  const emailRequired = isEmailRequiredFor(role);
  const computedDisplayName = joinNamesForDisplay(firstName, lastName, displayName.trim() || member.username);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    // patch 0169: 姓+名+メール も update に含める (空文字は明示クリア意図)
    const res = await api('POST', {
      action: 'update',
      id: member.id,
      displayName: displayName.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      role,
    });
    setBusy(false);
    if (res.success) {
      pushToast('更新しました', 'success');
      onSuccess();
    } else {
      setError(String(res.error || '更新に失敗しました'));
    }
  };

  return (
    <ModalShell title={`${member.username} を編集`} onClose={onClose}>
      <form onSubmit={submit}>
        {/* patch 0169: 姓 + 名 (横並び) */}
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3]}}>
          <FormField label="姓">
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={50}
              style={inputStyle}
              placeholder="武正"
            />
          </FormField>
          <FormField label="名">
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={50}
              style={inputStyle}
              placeholder="貴昭"
            />
          </FormField>
        </div>

        {/* patch 0169: メール — owner/admin は必須 */}
        <FormField label={emailRequired ? 'メールアドレス (ログイン復旧用)' : 'メールアドレス'} required={emailRequired}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required={emailRequired}
            maxLength={254}
            style={inputStyle}
            placeholder="example@mining-base.co.jp"
          />
          {emailRequired && (
            <div style={{fontSize: 11, color: '#FF9500', marginTop: 4, lineHeight: 1.5}}>
              ⚠ オーナー / 管理者は必須です。パスワードを忘れた時の連絡先になります。
            </div>
          )}
        </FormField>

        <FormField label="表示名 (画面に出る名前・空なら 姓+名 を自動利用)">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
            style={inputStyle}
            placeholder={computedDisplayName}
          />
          {(firstName || lastName) && (
            <div style={{fontSize: 11, color: color.textMuted, marginTop: 4}}>
              → 表示名: <strong style={{color: color.text}}>{computedDisplayName}</strong>
            </div>
          )}
        </FormField>

        <FormField label="役割">
          <select value={role} onChange={(e) => setRole(e.target.value as MemberSafe['role'])} style={inputStyle as React.CSSProperties}>
            <option value="owner">オーナー</option>
            <option value="admin">管理者</option>
            <option value="editor">編集者</option>
            <option value="vendor">外注先（限定）</option>
            <option value="viewer">閲覧者</option>
          </select>
          <div style={{fontSize: 11, color: color.textMuted, marginTop: 4}}>
            {ROLE_LABEL[role].description}
          </div>
        </FormField>

        {error && (
          <div style={{padding: 10, background: 'rgba(255,45,85,0.1)', border: '1px solid rgba(255,45,85,0.3)', borderRadius: 6, color: '#FF2D55', fontSize: 12, marginBottom: space[3]}}>
            {error}
          </div>
        )}

        <div style={{display: 'flex', gap: space[2], justifyContent: 'flex-end'}}>
          <button type="button" onClick={onClose} style={cancelBtnStyle}>キャンセル</button>
          <button type="submit" disabled={busy} style={primaryBtnStyle(busy)}>
            {busy ? '保存中...' : '保存する'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ResetPasswordModal({member, onClose, onSuccess}: {member: MemberSafe; onClose: () => void; onSuccess: () => void}) {
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const {pushToast} = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await api('POST', {action: 'reset_password', id: member.id, newPassword});
    setBusy(false);
    if (res.success) {
      pushToast(`パスワードを更新しました。${member.displayName} に新しいパスワードを伝えてください`, 'success');
      onSuccess();
    } else {
      setError(String(res.error || '更新に失敗しました'));
    }
  };

  return (
    <ModalShell title={`🔑 ${member.username} のパスワードを再設定`} onClose={onClose}>
      <div style={{padding: 12, background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.3)', borderRadius: 6, fontSize: 12, color: '#FF9500', marginBottom: space[3]}}>
        ⚠ 設定後、新しいパスワードを {member.displayName} さんに直接伝えてください。
      </div>
      <form onSubmit={submit}>
        <FormField label="新しいパスワード (8 文字以上)" required>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} maxLength={128} autoFocus style={inputStyle} />
        </FormField>

        {error && (
          <div style={{padding: 10, background: 'rgba(255,45,85,0.1)', border: '1px solid rgba(255,45,85,0.3)', borderRadius: 6, color: '#FF2D55', fontSize: 12, marginBottom: space[3]}}>
            {error}
          </div>
        )}

        <div style={{display: 'flex', gap: space[2], justifyContent: 'flex-end'}}>
          <button type="button" onClick={onClose} style={cancelBtnStyle}>キャンセル</button>
          <button type="submit" disabled={busy} style={primaryBtnStyle(busy)}>
            {busy ? '更新中...' : 'パスワードを設定'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── 共通スタイル ──

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: color.bg1,
  border: `1px solid ${color.border}`,
  borderRadius: 6,
  color: color.text,
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  background: 'transparent',
  border: `1px solid ${color.border}`,
  borderRadius: 6,
  color: color.text,
  fontSize: 13,
  cursor: 'pointer',
};

function primaryBtnStyle(busy: boolean): React.CSSProperties {
  return {
    padding: '10px 24px',
    background: busy ? '#666' : '#00E676',
    border: 'none',
    borderRadius: 6,
    color: '#000',
    fontSize: 13,
    fontWeight: 700,
    cursor: busy ? 'wait' : 'pointer',
  };
}

function FormField({label, required, children}: {label: string; required?: boolean; children: React.ReactNode}) {
  return (
    <div style={{marginBottom: space[3]}}>
      <label style={{display: 'block', fontSize: 11, fontWeight: 700, color: color.textMuted, letterSpacing: 1, marginBottom: 6}}>
        {label}{required && <span style={{color: '#FF2D55', marginLeft: 4}}>*</span>}
      </label>
      {children}
    </div>
  );
}
