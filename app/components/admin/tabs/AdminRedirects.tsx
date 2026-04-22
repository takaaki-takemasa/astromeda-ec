/**
 * AdminRedirects Tab — URL リダイレクト管理 (patch 0066)
 *
 * CEO 指摘「Shopify 上作業して管理画面に戻る二段階をやめたい」に応え、
 * 管理画面だけで URL リダイレクトを CRUD するタブを新設：
 *   - 一覧: path → target / 検索 / カーソル式ページネーション
 *   - 新規作成モーダル: path (/ から始まる相対) + target (相対 or 絶対 URL)
 *   - 編集モーダル: path / target の差し替え
 *   - 削除: 確認ダイアログ（useConfirmDialog）
 *
 * 効果器: 記憶の再経路化（旧URL→新URLへ神経経路を接続）
 *
 * 旧サイト→新サイトのパス変更の際、CUSTOM_ROUTE_HANDLES のハードコードを
 * 編集せずに管理画面からリダイレクトを設定できるようにする。
 */

import {useState, useEffect, useCallback, useMemo} from 'react';
import {color, font, radius, space} from '~/lib/design-tokens';
import {Modal} from '~/components/admin/Modal';
import {useConfirmDialog} from '~/hooks/useConfirmDialog';
import {AdminListSkeleton} from '~/components/admin/ds/InlineListState';
// patch 0087: useToast 統合プリミティブ
import { useToast } from '~/components/admin/ds/Toast';

// ━━━ Types ━━━

interface UrlRedirect {
  id: string;
  path: string;
  target: string;
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface FormState {
  id?: string;
  path: string;
  target: string;
}

const EMPTY_FORM: FormState = {path: '', target: ''};

// ━━━ Styles ━━━

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: color.bg0,
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  color: color.text,
  fontSize: font.sm,
  fontFamily: font.family,
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: font.xs,
  color: color.textMuted,
  display: 'block',
  marginBottom: '4px',
  fontWeight: 500,
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 20px',
  background: color.cyan,
  color: '#000',
  border: 'none',
  borderRadius: radius.md,
  fontSize: font.sm,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: font.family,
};

const btnOutline: React.CSSProperties = {
  padding: '8px 20px',
  background: 'transparent',
  color: color.textMuted,
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  fontSize: font.sm,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: font.family,
};

const btnDanger: React.CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  color: color.red,
  border: `1px solid ${color.red}`,
  borderRadius: radius.sm,
  fontSize: font.xs,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: font.family,
};

const btnGhost: React.CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  color: color.cyan,
  border: `1px solid ${color.cyan}`,
  borderRadius: radius.sm,
  fontSize: font.xs,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: font.family,
  marginRight: '6px',
};

// ━━━ API helpers ━━━

async function apiList(query: string, cursor: string | null): Promise<{items: UrlRedirect[]; pageInfo: PageInfo}> {
  const params = new URLSearchParams({limit: '50'});
  if (query) params.set('query', query);
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`/api/admin/redirects?${params.toString()}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'API error');
  return {items: json.redirects ?? [], pageInfo: json.pageInfo ?? {hasNextPage: false, endCursor: null}};
}

async function apiAction(
  body: Record<string, unknown>,
): Promise<{success: boolean; error?: string; details?: string[]; id?: string; path?: string; target?: string}> {
  const res = await fetch('/api/admin/redirects', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  return res.json();
}

// ━━━ Toast ━━━
// patch 0087: ローカル Toast は ~/components/admin/ds/Toast に統合

// ━━━ Main Component ━━━

export default function AdminRedirects() {
  const [list, setList] = useState<UrlRedirect[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo>({hasNextPage: false, endCursor: null});
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([null]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editId, setEditId] = useState<string | null | 'new'>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const {confirm: confirmDialog, dialogProps, ConfirmDialog: Dialog} = useConfirmDialog();

  // patch 0087: useToast 統合プリミティブで variant 別 duration (error=6.5s)
  const { pushToast, Toast } = useToast();
  const showToast = useCallback(
    (msg: string, type: 'ok' | 'err') => pushToast(msg, type),
    [pushToast],
  );

  const currentCursor = cursorHistory[cursorHistory.length - 1];

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {items, pageInfo: pi} = await apiList(searchQuery, currentCursor);
      setList(items);
      setPageInfo(pi);
    } catch (e) {
      setError(e instanceof Error ? e.message : '取得失敗');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, currentCursor]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Search triggers cursor reset
  const handleSearchSubmit = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      setCursorHistory([null]);
      setSearchQuery(searchInput.trim());
    },
    [searchInput],
  );

  const nextPage = useCallback(() => {
    if (!pageInfo.hasNextPage || !pageInfo.endCursor) return;
    setCursorHistory((h) => [...h, pageInfo.endCursor]);
  }, [pageInfo]);

  const prevPage = useCallback(() => {
    setCursorHistory((h) => (h.length <= 1 ? h : h.slice(0, -1)));
  }, []);

  const openNew = useCallback(() => {
    setForm(EMPTY_FORM);
    setEditId('new');
  }, []);

  const openEdit = useCallback((r: UrlRedirect) => {
    setForm({id: r.id, path: r.path, target: r.target});
    setEditId(r.id);
  }, []);

  const closeModal = useCallback(() => {
    setEditId(null);
    setForm(EMPTY_FORM);
  }, []);

  const handleSave = useCallback(async () => {
    const path = form.path.trim();
    const target = form.target.trim();
    if (!path) {
      showToast('path は必須です', 'err');
      return;
    }
    if (!path.startsWith('/')) {
      showToast('path は / から始めてください', 'err');
      return;
    }
    if (!target) {
      showToast('target は必須です', 'err');
      return;
    }
    if (!target.startsWith('/') && !/^https?:\/\//i.test(target)) {
      showToast('target は / から始まる相対パス or http(s):// 絶対URL', 'err');
      return;
    }
    setSaving(true);
    const body: Record<string, unknown> = {
      action: editId === 'new' ? 'create' : 'update',
      path,
      target,
    };
    if (editId !== 'new' && form.id) body.id = form.id;
    const res = await apiAction(body);
    setSaving(false);
    if (res.success) {
      showToast(editId === 'new' ? 'リダイレクトを作成しました' : 'リダイレクトを更新しました', 'ok');
      closeModal();
      reload();
    } else {
      const detail = res.details?.join(', ');
      showToast(`保存失敗: ${res.error}${detail ? ` (${detail})` : ''}`, 'err');
    }
  }, [form, editId, showToast, closeModal, reload]);

  const handleDelete = useCallback(
    async (r: UrlRedirect) => {
      const ok = await confirmDialog({
        title: 'リダイレクトを削除しますか？',
        message: `${r.path} → ${r.target} を削除します。この操作は取り消せません。`,
        confirmLabel: '削除',
        destructive: true,
        contextPath: ['コマース', '🧭 ナビ・マーケ・分析', '🔀 リダイレクト'],
      });
      if (!ok) return;
      // patch 0114: P1-4 サーバ Zod が confirm:true を要求（誤削除防止）
      const res = await apiAction({action: 'delete', id: r.id, confirm: true});
      if (res.success) {
        showToast('削除しました', 'ok');
        reload();
      } else {
        showToast(`削除失敗: ${res.error}`, 'err');
      }
    },
    [confirmDialog, showToast, reload],
  );

  const pageCount = cursorHistory.length;

  const rows = useMemo(() => list, [list]);

  // ━━━ Render ━━━
  return (
    <div style={{padding: space[4], color: color.text, fontFamily: font.family}}>
      {/* Header */}
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[4]}}>
        <div>
          <h1 style={{fontSize: font.xl, fontWeight: 700, margin: 0}}>🔀 URL リダイレクト</h1>
          <p style={{fontSize: font.sm, color: color.textMuted, marginTop: '6px', maxWidth: 640}}>
            旧サイトの URL から新サイトの URL への 301 リダイレクトを管理します。Shopify 上の URL リダイレクト
            （設定 → Apps and sales channels → オンラインストア → ナビゲーション → URL リダイレクト）と同期します。
          </p>
        </div>
        <button type="button" style={btnPrimary} onClick={openNew}>
          ＋ 新規リダイレクト
        </button>
      </div>

      {/* Search */}
      <form
        onSubmit={handleSearchSubmit}
        style={{
          display: 'flex',
          gap: space[2],
          marginBottom: space[3],
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          placeholder="path で検索（例: /pages/old-page）"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{...inputStyle, flex: 1, maxWidth: 480}}
        />
        <button type="submit" style={btnOutline}>
          🔍 検索
        </button>
        {searchQuery && (
          <button
            type="button"
            style={btnOutline}
            onClick={() => {
              setSearchInput('');
              setSearchQuery('');
              setCursorHistory([null]);
            }}
          >
            クリア
          </button>
        )}
      </form>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: space[3],
            background: 'rgba(255,80,80,0.1)',
            border: `1px solid ${color.red}`,
            borderRadius: radius.md,
            color: color.red,
            marginBottom: space[3],
          }}
        >
          エラー: {error}
        </div>
      )}

      {/* List table */}
      <div
        style={{
          background: color.bg1,
          border: `1px solid ${color.border}`,
          borderRadius: radius.lg,
          overflow: 'hidden',
        }}
      >
        <table style={{width: '100%', borderCollapse: 'collapse', fontSize: font.sm}}>
          <thead>
            <tr style={{background: color.bg0, borderBottom: `1px solid ${color.border}`}}>
              <th style={{textAlign: 'left', padding: '10px 14px', fontSize: font.xs, color: color.textMuted, fontWeight: 600}}>
                元のパス
              </th>
              <th style={{textAlign: 'left', padding: '10px 14px', fontSize: font.xs, color: color.textMuted, fontWeight: 600}}>
                →
              </th>
              <th style={{textAlign: 'left', padding: '10px 14px', fontSize: font.xs, color: color.textMuted, fontWeight: 600}}>
                リダイレクト先
              </th>
              <th style={{textAlign: 'right', padding: '10px 14px', fontSize: font.xs, color: color.textMuted, fontWeight: 600, width: 160}}>
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} style={{padding: 0}}>
                  <AdminListSkeleton rows={4} />
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} style={{padding: 0}}>
                  <div
                    style={{
                      padding: `${space[6]}px ${space[4]}px`,
                      textAlign: 'center',
                      background: color.bg1,
                      border: `1px dashed ${color.border}`,
                      borderRadius: radius.md,
                      margin: space[3],
                    }}
                  >
                    <div style={{fontSize: 32, marginBottom: space[2]}}>🔀</div>
                    <div style={{fontSize: font.md, fontWeight: 700, color: color.text, marginBottom: space[1]}}>
                      {searchQuery ? `"${searchQuery}" に一致するリダイレクトはありません` : 'リダイレクトはまだありません'}
                    </div>
                    <div style={{fontSize: font.sm, color: color.textMuted}}>
                      {searchQuery ? '検索条件を変更してください。' : '旧URL→新URLへ301リダイレクトを設定すると、SEO評価を維持できます。右上の「＋ 新規リダイレクト」から作成できます。'}
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr key={r.id} style={{borderBottom: `1px solid ${color.border}`}}>
                  <td style={{padding: '10px 14px', fontFamily: 'monospace', fontSize: font.xs, color: color.text}}>
                    {r.path}
                  </td>
                  <td style={{padding: '10px 14px', color: color.textMuted, fontSize: font.sm}}>→</td>
                  <td
                    style={{
                      padding: '10px 14px',
                      fontFamily: 'monospace',
                      fontSize: font.xs,
                      color: color.cyan,
                      maxWidth: 420,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={r.target}
                  >
                    {r.target}
                  </td>
                  <td style={{padding: '10px 14px', textAlign: 'right'}}>
                    <button type="button" style={btnGhost} onClick={() => openEdit(r)}>
                      編集
                    </button>
                    <button type="button" style={btnDanger} onClick={() => handleDelete(r)}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: space[3], marginTop: space[3]}}>
        <button type="button" style={btnOutline} disabled={pageCount <= 1} onClick={prevPage} aria-label="前のページ">
          ← 前へ
        </button>
        <span style={{fontSize: font.sm, color: color.textMuted}}>{pageCount} ページ目</span>
        <button type="button" style={btnOutline} disabled={!pageInfo.hasNextPage} onClick={nextPage} aria-label="次のページ">
          次へ →
        </button>
      </div>

      {/* Edit/New Modal */}
      {editId !== null && (
        <Modal onClose={closeModal} title={editId === 'new' ? '新規リダイレクト' : 'リダイレクトを編集'}>
          <div style={{display: 'flex', flexDirection: 'column', gap: space[3], minWidth: 480}}>
            <div>
              <label htmlFor="redirect-path" style={labelStyle}>
                元のパス（path）*
              </label>
              <input
                id="redirect-path"
                type="text"
                placeholder="/pages/old-page"
                value={form.path}
                onChange={(e) => setForm((f) => ({...f, path: e.target.value}))}
                style={inputStyle}
              />
              <p style={{fontSize: font.xs, color: color.textMuted, marginTop: '4px'}}>
                / で始まる相対パス（2048 文字以内）。http(s):// 絶対URLは不可。
              </p>
            </div>
            <div>
              <label htmlFor="redirect-target" style={labelStyle}>
                リダイレクト先（target）*
              </label>
              <input
                id="redirect-target"
                type="text"
                placeholder="/collections/new-collection"
                value={form.target}
                onChange={(e) => setForm((f) => ({...f, target: e.target.value}))}
                style={inputStyle}
              />
              <p style={{fontSize: font.xs, color: color.textMuted, marginTop: '4px'}}>
                / 始まりの内部パス or http(s):// の絶対URL（2048 文字以内）。
              </p>
            </div>
            <div style={{display: 'flex', justifyContent: 'flex-end', gap: space[2], marginTop: space[2]}}>
              <button type="button" style={btnOutline} onClick={closeModal} disabled={saving}>
                キャンセル
              </button>
              <button type="button" style={btnPrimary} onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : editId === 'new' ? '作成' : '更新'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm dialog */}
      <Dialog {...dialogProps} />

      {/* Toast */}
      <Toast />
    </div>
  );
}
