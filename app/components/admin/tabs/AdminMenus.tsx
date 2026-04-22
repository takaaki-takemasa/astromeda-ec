/**
 * AdminMenus Tab — ナビゲーションメニュー管理 (patch 0070)
 *
 * CEO 指摘「Shopify 上作業して管理画面に戻る二段階をやめたい」への最終章。
 * ヘッダー/フッターの navigation menu を admin 画面だけで CRUD するタブ。
 *
 * 効果器: 末梢神経の再配線（ユーザー動線のラベル構造を組み替える）
 *
 * 機能:
 *   - 一覧: handle / title / itemsCount / 既定バッジ
 *   - 新規作成: title + handle + 項目（top-level のみ編集可）
 *   - 編集: title + handle + 項目 (top-level 追加/削除/並べ替え)
 *     + 既存のネスト項目は state で保持し、更新時に書き戻す（失わない）
 *   - 削除: 確認ダイアログ付き（既定 menu は Shopify 側で拒否される）
 *
 * item の type:
 *   - HTTP: 自由な URL（相対 / 絶対）
 *   - FRONTPAGE / SEARCH / SHOP_POLICY / CATALOG / COLLECTIONS / CUSTOMER_ACCOUNT_PAGE:
 *     resourceId / url 不要 (Shopify 側で自動解決)
 *   - COLLECTION / PRODUCT / PAGE / BLOG / ARTICLE / METAOBJECT: resourceId 必須 (gid)
 */

import {useState, useEffect, useCallback, useMemo} from 'react';
import {color, font, radius, space} from '~/lib/design-tokens';
import {Modal} from '~/components/admin/Modal';
import {useConfirmDialog} from '~/hooks/useConfirmDialog';
import {AdminListSkeleton} from '~/components/admin/ds/InlineListState';
// patch 0087: useToast 統合プリミティブ
import { useToast } from '~/components/admin/ds/Toast';

// ━━━ Types ━━━

type MenuItemType =
  | 'FRONTPAGE'
  | 'COLLECTION'
  | 'COLLECTIONS'
  | 'CATALOG'
  | 'PRODUCT'
  | 'PAGE'
  | 'BLOG'
  | 'ARTICLE'
  | 'SEARCH'
  | 'SHOP_POLICY'
  | 'CUSTOMER_ACCOUNT_PAGE'
  | 'METAOBJECT'
  | 'HTTP';

interface MenuItem {
  id?: string;
  title: string;
  type: MenuItemType;
  resourceId?: string | null;
  url?: string | null;
  tags?: string[];
  items?: MenuItem[]; // 既存のネスト構造は保持（UI では編集しない）
}

interface MenuSummary {
  id: string;
  handle: string;
  title: string;
  itemsCount: number;
  isDefault: boolean;
}

interface MenuDetail extends MenuSummary {
  items: MenuItem[];
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface FormState {
  id?: string; // null = 新規
  title: string;
  handle: string;
  items: MenuItem[];
  /** 編集対象が既存 menu のとき、isDefault (handle 編集不可) */
  isDefault?: boolean;
}

const EMPTY_FORM: FormState = {title: '', handle: '', items: []};

const ITEM_TYPE_LABELS: Record<MenuItemType, string> = {
  HTTP: 'カスタムURL',
  FRONTPAGE: 'トップページ',
  COLLECTION: 'コレクション',
  COLLECTIONS: 'コレクション一覧',
  CATALOG: 'カタログ',
  PRODUCT: '商品',
  PAGE: '固定ページ',
  BLOG: 'ブログ',
  ARTICLE: 'ブログ記事',
  SEARCH: '検索',
  SHOP_POLICY: 'ポリシー',
  CUSTOMER_ACCOUNT_PAGE: 'マイページ',
  METAOBJECT: 'Metaobject',
};

const NEEDS_RESOURCE_ID: ReadonlySet<MenuItemType> = new Set<MenuItemType>([
  'COLLECTION',
  'PRODUCT',
  'PAGE',
  'BLOG',
  'ARTICLE',
  'METAOBJECT',
]);

const NEEDS_URL: ReadonlySet<MenuItemType> = new Set<MenuItemType>(['HTTP']);

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

const btnIcon: React.CSSProperties = {
  padding: '4px 8px',
  background: 'transparent',
  color: color.textMuted,
  border: `1px solid ${color.border}`,
  borderRadius: radius.sm,
  fontSize: font.xs,
  cursor: 'pointer',
  fontFamily: font.family,
};

const badgeDefault: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  background: 'rgba(0,200,255,0.15)',
  color: color.cyan,
  border: `1px solid ${color.cyan}`,
  borderRadius: radius.sm,
  fontSize: font.xs,
  fontWeight: 600,
  marginLeft: '8px',
};

// ━━━ API helpers ━━━

async function apiList(cursor: string | null): Promise<{items: MenuSummary[]; pageInfo: PageInfo}> {
  const params = new URLSearchParams({limit: '50'});
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`/api/admin/menus?${params.toString()}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const json = (await res.json()) as {
    success: boolean;
    error?: string;
    menus?: MenuSummary[];
    pageInfo?: PageInfo;
  };
  if (!json.success) throw new Error(json.error || 'API error');
  return {
    items: json.menus ?? [],
    pageInfo: json.pageInfo ?? {hasNextPage: false, endCursor: null},
  };
}

async function apiGet(id: string): Promise<MenuDetail> {
  const res = await fetch(`/api/admin/menus?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const json = (await res.json()) as {
    success: boolean;
    error?: string;
    menu?: MenuDetail;
  };
  if (!json.success || !json.menu) throw new Error(json.error || 'API error');
  return json.menu;
}

async function apiAction(
  body: Record<string, unknown>,
): Promise<{
  success: boolean;
  error?: string;
  details?: string[];
  id?: string;
  handle?: string;
  title?: string;
  // patch 0113: menu update 時に server から差分内訳が返る (kept/added/removed/renamed)
  diff?: {
    kept: number;
    added: number;
    removed: number;
    renamed: number;
    totalCurrent: number;
    totalIncoming: number;
  };
}> {
  const res = await fetch('/api/admin/menus', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  return (await res.json()) as {
    success: boolean;
    error?: string;
    details?: string[];
    id?: string;
    handle?: string;
    title?: string;
    diff?: {
      kept: number;
      added: number;
      removed: number;
      renamed: number;
      totalCurrent: number;
      totalIncoming: number;
    };
  };
}

// ━━━ Toast ━━━
// patch 0087: ローカル Toast は ~/components/admin/ds/Toast に統合

// ━━━ Helpers ━━━

/** 新しい空のトップレベル項目 */
function newBlankItem(): MenuItem {
  return {title: '', type: 'HTTP', url: '/'};
}

/** item tree の総項目数 (ネスト込み) をカウント */
function countItemsDeep(items: MenuItem[] | undefined): number {
  if (!items) return 0;
  return items.reduce((acc, it) => acc + 1 + countItemsDeep(it.items), 0);
}

/** 項目から入力として不要なフィールドを削ぎ落とす */
function sanitizeItemForSubmit(it: MenuItem): MenuItem {
  const out: MenuItem = {
    title: it.title.trim(),
    type: it.type,
  };
  if (it.id) out.id = it.id;
  if (NEEDS_RESOURCE_ID.has(it.type) && it.resourceId) {
    out.resourceId = it.resourceId.trim();
  }
  if (NEEDS_URL.has(it.type) && it.url) {
    out.url = it.url.trim();
  }
  if (it.tags && it.tags.length > 0) out.tags = it.tags;
  if (it.items && it.items.length > 0) {
    out.items = it.items.map(sanitizeItemForSubmit);
  }
  return out;
}

// ━━━ Main Component ━━━

export default function AdminMenus() {
  const [list, setList] = useState<MenuSummary[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo>({hasNextPage: false, endCursor: null});
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([null]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<'closed' | 'new' | 'edit'>('closed');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
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
      const {items, pageInfo: pi} = await apiList(currentCursor);
      setList(items);
      setPageInfo(pi);
    } catch (e) {
      setError(e instanceof Error ? e.message : '取得失敗');
    } finally {
      setLoading(false);
    }
  }, [currentCursor]);

  useEffect(() => {
    reload();
  }, [reload]);

  const nextPage = useCallback(() => {
    if (!pageInfo.hasNextPage || !pageInfo.endCursor) return;
    setCursorHistory((h) => [...h, pageInfo.endCursor]);
  }, [pageInfo]);

  const prevPage = useCallback(() => {
    setCursorHistory((h) => (h.length <= 1 ? h : h.slice(0, -1)));
  }, []);

  // Open "new" modal
  const openNew = useCallback(() => {
    setForm({...EMPTY_FORM, items: [newBlankItem()]});
    setEditMode('new');
  }, []);

  // Open "edit" modal (fetch detail first)
  const openEdit = useCallback(
    async (m: MenuSummary) => {
      setEditMode('edit');
      setLoadingDetail(true);
      setForm({...EMPTY_FORM, id: m.id, title: m.title, handle: m.handle, isDefault: m.isDefault});
      try {
        const detail = await apiGet(m.id);
        setForm({
          id: detail.id,
          title: detail.title,
          handle: detail.handle,
          items: detail.items ?? [],
          isDefault: detail.isDefault,
        });
      } catch (e) {
        showToast(`詳細取得失敗: ${e instanceof Error ? e.message : 'unknown'}`, 'err');
        setEditMode('closed');
      } finally {
        setLoadingDetail(false);
      }
    },
    [showToast],
  );

  const closeModal = useCallback(() => {
    setEditMode('closed');
    setForm(EMPTY_FORM);
  }, []);

  // Item editor helpers (top-level only)
  const updateItem = useCallback((index: number, patch: Partial<MenuItem>) => {
    setForm((f) => {
      const items = f.items.map((it, i) => (i === index ? {...it, ...patch} : it));
      return {...f, items};
    });
  }, []);

  const addItem = useCallback(() => {
    setForm((f) => ({...f, items: [...f.items, newBlankItem()]}));
  }, []);

  const removeItem = useCallback((index: number) => {
    setForm((f) => ({...f, items: f.items.filter((_, i) => i !== index)}));
  }, []);

  const moveItem = useCallback((index: number, direction: -1 | 1) => {
    setForm((f) => {
      const items = [...f.items];
      const target = index + direction;
      if (target < 0 || target >= items.length) return f;
      [items[index], items[target]] = [items[target], items[index]];
      return {...f, items};
    });
  }, []);

  // Save
  const handleSave = useCallback(async () => {
    const title = form.title.trim();
    const handle = form.handle.trim();
    if (!title) {
      showToast('title は必須です', 'err');
      return;
    }
    if (!handle) {
      showToast('handle は必須です', 'err');
      return;
    }
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(handle)) {
      showToast('handle は英数字/ハイフン/アンダースコアのみ', 'err');
      return;
    }
    // Validate items
    for (let i = 0; i < form.items.length; i++) {
      const it = form.items[i];
      if (!it.title.trim()) {
        showToast(`項目 ${i + 1}: title は必須です`, 'err');
        return;
      }
      if (NEEDS_RESOURCE_ID.has(it.type) && !it.resourceId?.trim()) {
        showToast(`項目 ${i + 1}: この type には resourceId (gid) が必要です`, 'err');
        return;
      }
      if (NEEDS_URL.has(it.type) && !it.url?.trim()) {
        showToast(`項目 ${i + 1}: URL は必須です`, 'err');
        return;
      }
    }

    setSaving(true);
    const items = form.items.map(sanitizeItemForSubmit);
    const body: Record<string, unknown> =
      editMode === 'new'
        ? {action: 'create', title, handle, items}
        : {action: 'update', id: form.id, title, handle, items};
    const res = await apiAction(body);
    setSaving(false);
    if (res.success) {
      // patch 0113: 更新時は diff 内訳を CEO に見せる (中学生レベル日本語)
      let okMessage: string;
      if (editMode === 'new') {
        okMessage = 'メニューを作成しました';
      } else if (res.diff) {
        const {kept, added, removed, renamed} = res.diff;
        const parts: string[] = [];
        if (kept > 0) parts.push(`保持${kept}件`);
        if (added > 0) parts.push(`追加${added}件`);
        if (removed > 0) parts.push(`削除${removed}件`);
        if (renamed > 0) parts.push(`名前変更${renamed}件`);
        okMessage = parts.length > 0
          ? `メニューを更新しました（${parts.join('・')}）`
          : 'メニューを更新しました（変更なし）';
      } else {
        okMessage = 'メニューを更新しました';
      }
      showToast(okMessage, 'ok');
      closeModal();
      reload();
    } else {
      const detail = res.details?.join(', ');
      showToast(`保存失敗: ${res.error}${detail ? ` (${detail})` : ''}`, 'err');
    }
  }, [form, editMode, showToast, closeModal, reload]);

  // Delete
  const handleDelete = useCallback(
    async (m: MenuSummary) => {
      if (m.isDefault) {
        showToast('既定メニュー (main-menu / footer) は削除できません', 'err');
        return;
      }
      const ok = await confirmDialog({
        title: 'メニューを削除しますか？',
        message: `「${m.title}」(handle: ${m.handle}) を削除します。この操作は取り消せません。`,
        confirmLabel: '削除',
        destructive: true,
        contextPath: ['コマース', '🧭 ナビ・マーケ・分析', '🧭 メニュー'],
      });
      if (!ok) return;
      const res = await apiAction({action: 'delete', id: m.id});
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
  const deepItemCount = useMemo(() => countItemsDeep(form.items), [form.items]);

  // ━━━ Render ━━━
  return (
    <div style={{padding: space[4], color: color.text, fontFamily: font.family}}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: space[4],
        }}
      >
        <div>
          <h1 style={{fontSize: font.xl, fontWeight: 700, margin: 0}}>🧭 ナビゲーションメニュー</h1>
          <p style={{fontSize: font.sm, color: color.textMuted, marginTop: '6px', maxWidth: 720}}>
            ヘッダーやフッターに表示されるメニュー項目を管理します。Shopify 上の
            オンラインストア → ナビゲーション と同期されます。既定メニュー
            (main-menu / footer) は handle 変更・削除ができません。
          </p>
        </div>
        <button type="button" style={btnPrimary} onClick={openNew}>
          ＋ 新規メニュー
        </button>
      </div>

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
              <th
                style={{
                  textAlign: 'left',
                  padding: '10px 14px',
                  fontSize: font.xs,
                  color: color.textMuted,
                  fontWeight: 600,
                }}
              >
                タイトル
              </th>
              <th
                style={{
                  textAlign: 'left',
                  padding: '10px 14px',
                  fontSize: font.xs,
                  color: color.textMuted,
                  fontWeight: 600,
                }}
              >
                handle
              </th>
              <th
                style={{
                  textAlign: 'right',
                  padding: '10px 14px',
                  fontSize: font.xs,
                  color: color.textMuted,
                  fontWeight: 600,
                  width: 100,
                }}
              >
                項目数
              </th>
              <th
                style={{
                  textAlign: 'right',
                  padding: '10px 14px',
                  fontSize: font.xs,
                  color: color.textMuted,
                  fontWeight: 600,
                  width: 200,
                }}
              >
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
                      border: `1px dashed ${color.border}`,
                      borderRadius: radius.lg,
                      padding: `${space[5]} ${space[4]}`,
                      textAlign: 'center',
                      background: color.bg0,
                      margin: space[3],
                    }}
                    role="status"
                    aria-live="polite"
                  >
                    <div style={{fontSize: 32, marginBottom: 8}} aria-hidden="true">🧭</div>
                    <div style={{fontWeight: 700, color: color.text, fontSize: font.md, marginBottom: 6}}>
                      メニューはまだありません
                    </div>
                    <div style={{color: color.textMuted, fontSize: font.sm, marginBottom: 12, lineHeight: 1.6}}>
                      ヘッダー / フッターに表示するナビゲーションメニューを作成してください。
                    </div>
                    <div style={{color: color.textDim, fontSize: font.xs}}>
                      右上の「＋ 新規メニュー」ボタンから作成できます。
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((m) => (
                <tr key={m.id} style={{borderBottom: `1px solid ${color.border}`}}>
                  <td style={{padding: '10px 14px', color: color.text}}>
                    {m.title}
                    {m.isDefault && <span style={badgeDefault}>既定</span>}
                  </td>
                  <td
                    style={{
                      padding: '10px 14px',
                      fontFamily: 'monospace',
                      fontSize: font.xs,
                      color: color.cyan,
                    }}
                  >
                    {m.handle}
                  </td>
                  <td
                    style={{
                      padding: '10px 14px',
                      textAlign: 'right',
                      color: color.textMuted,
                      fontSize: font.sm,
                    }}
                  >
                    {m.itemsCount}
                  </td>
                  <td style={{padding: '10px 14px', textAlign: 'right'}}>
                    <button type="button" style={btnGhost} onClick={() => openEdit(m)}>
                      編集
                    </button>
                    {!m.isDefault && (
                      <button type="button" style={btnDanger} onClick={() => handleDelete(m)}>
                        削除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space[3],
          marginTop: space[3],
        }}
      >
        <button type="button" style={btnOutline} disabled={pageCount <= 1} onClick={prevPage} aria-label="前のページ">
          ← 前へ
        </button>
        <span style={{fontSize: font.sm, color: color.textMuted}}>{pageCount} ページ目</span>
        <button type="button" style={btnOutline} disabled={!pageInfo.hasNextPage} onClick={nextPage} aria-label="次のページ">
          次へ →
        </button>
      </div>

      {/* Edit/New Modal */}
      {editMode !== 'closed' && (
        <Modal
          onClose={closeModal}
          title={editMode === 'new' ? '新規メニュー' : `メニューを編集（${form.handle}）`}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: space[3],
              minWidth: 640,
              maxWidth: 880,
            }}
          >
            {loadingDetail && <AdminListSkeleton rows={4} />}

            {!loadingDetail && (
              <>
                {/* Title & Handle */}
                <div style={{display: 'flex', gap: space[3]}}>
                  <div style={{flex: 1}}>
                    <label htmlFor="menu-title" style={labelStyle}>
                      メニュータイトル *
                    </label>
                    <input
                      id="menu-title"
                      type="text"
                      placeholder="メインメニュー"
                      value={form.title}
                      onChange={(e) => setForm((f) => ({...f, title: e.target.value}))}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{flex: 1}}>
                    <label htmlFor="menu-handle" style={labelStyle}>
                      handle *（URL で使う識別子）
                    </label>
                    <input
                      id="menu-handle"
                      type="text"
                      placeholder="main-menu"
                      value={form.handle}
                      onChange={(e) => setForm((f) => ({...f, handle: e.target.value}))}
                      style={inputStyle}
                      disabled={form.isDefault}
                    />
                    {form.isDefault && (
                      <p style={{fontSize: font.xs, color: color.textMuted, marginTop: '4px'}}>
                        既定メニューの handle は変更できません
                      </p>
                    )}
                  </div>
                </div>

                {/* Items editor */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: space[2],
                    }}
                  >
                    <label style={labelStyle}>
                      メニュー項目（トップレベル {form.items.length} / 深い階層も含め {deepItemCount} 個）
                    </label>
                    <button type="button" style={btnGhost} onClick={addItem}>
                      ＋ 項目を追加
                    </button>
                  </div>

                  {form.items.length === 0 && (
                    <div
                      style={{
                        padding: space[4],
                        textAlign: 'center',
                        color: color.textMuted,
                        fontSize: font.sm,
                        border: `1px dashed ${color.border}`,
                        borderRadius: radius.md,
                      }}
                    >
                      項目がありません。「＋ 項目を追加」で追加してください。
                    </div>
                  )}

                  <div style={{display: 'flex', flexDirection: 'column', gap: space[2]}}>
                    {form.items.map((it, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '30px 1fr 160px 1fr 140px',
                          gap: space[2],
                          alignItems: 'center',
                          padding: space[2],
                          background: color.bg1,
                          border: `1px solid ${color.border}`,
                          borderRadius: radius.md,
                        }}
                      >
                        {/* Position + 保持/新規 バッジ (patch 0113: ID 保持の可視化) */}
                        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2}}>
                          <div style={{color: color.textMuted, fontSize: font.xs}}>
                            {i + 1}
                          </div>
                          {editMode === 'edit' && (
                            it.id ? (
                              <span
                                title="既存項目（保存しても URL や設定は引き継がれます）"
                                style={{
                                  fontSize: 9,
                                  padding: '1px 4px',
                                  borderRadius: 3,
                                  background: '#dcfce7',
                                  color: '#166534',
                                  fontWeight: 600,
                                }}
                              >
                                保持
                              </span>
                            ) : (
                              <span
                                title="新規項目（保存時に新しく作られます）"
                                style={{
                                  fontSize: 9,
                                  padding: '1px 4px',
                                  borderRadius: 3,
                                  background: '#fef3c7',
                                  color: '#92400e',
                                  fontWeight: 600,
                                }}
                              >
                                新規
                              </span>
                            )
                          )}
                        </div>

                        {/* Title */}
                        <input
                          type="text"
                          placeholder="表示ラベル"
                          value={it.title}
                          onChange={(e) => updateItem(i, {title: e.target.value})}
                          style={inputStyle}
                          aria-label={`項目 ${i + 1} のタイトル`}
                        />

                        {/* Type */}
                        <select
                          value={it.type}
                          onChange={(e) =>
                            updateItem(i, {
                              type: e.target.value as MenuItemType,
                              // type 切り替え時、不要フィールドをクリア
                              resourceId: null,
                              url: NEEDS_URL.has(e.target.value as MenuItemType) ? '/' : null,
                            })
                          }
                          style={inputStyle}
                          aria-label={`項目 ${i + 1} のタイプ`}
                        >
                          {(Object.keys(ITEM_TYPE_LABELS) as MenuItemType[]).map((t) => (
                            <option key={t} value={t}>
                              {ITEM_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>

                        {/* Value (URL or resourceId) */}
                        {NEEDS_URL.has(it.type) && (
                          <input
                            type="text"
                            placeholder="/collections/new-arrivals"
                            value={it.url ?? ''}
                            onChange={(e) => updateItem(i, {url: e.target.value})}
                            style={inputStyle}
                            aria-label={`項目 ${i + 1} の URL`}
                          />
                        )}
                        {NEEDS_RESOURCE_ID.has(it.type) && (
                          <input
                            type="text"
                            placeholder="コレクション/商品などの識別子（例: gid://shopify/Collection/12345）"
                            value={it.resourceId ?? ''}
                            onChange={(e) => updateItem(i, {resourceId: e.target.value})}
                            style={{...inputStyle, fontSize: font.xs, fontFamily: 'monospace'}}
                            aria-label={`項目 ${i + 1} の遷移先識別子`}
                            title="Shopify 管理画面の各コレクション/商品ページからコピーした識別子を貼り付けます"
                          />
                        )}
                        {!NEEDS_URL.has(it.type) && !NEEDS_RESOURCE_ID.has(it.type) && (
                          <div
                            style={{
                              fontSize: font.xs,
                              color: color.textMuted,
                              fontStyle: 'italic',
                              padding: '8px 12px',
                            }}
                          >
                            このタイプは自動解決されます
                          </div>
                        )}

                        {/* Controls */}
                        <div style={{display: 'flex', gap: '4px', justifyContent: 'flex-end'}}>
                          <button
                            type="button"
                            style={btnIcon}
                            onClick={() => moveItem(i, -1)}
                            disabled={i === 0}
                            aria-label="上へ"
                            title="上へ"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            style={btnIcon}
                            onClick={() => moveItem(i, 1)}
                            disabled={i === form.items.length - 1}
                            aria-label="下へ"
                            title="下へ"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            style={btnDanger}
                            onClick={() => removeItem(i)}
                            aria-label="削除"
                            title="削除"
                          >
                            ✕
                          </button>
                        </div>

                        {/* Nested items warning */}
                        {it.items && it.items.length > 0 && (
                          <div
                            style={{
                              gridColumn: '1 / -1',
                              fontSize: font.xs,
                              color: color.textMuted,
                              background: 'rgba(255,200,0,0.08)',
                              border: `1px solid rgba(255,200,0,0.3)`,
                              borderRadius: radius.sm,
                              padding: '6px 10px',
                              marginTop: '4px',
                            }}
                          >
                            💡 この項目には {it.items.length} 個のサブメニュー項目が含まれています。
                            このUIでは編集できませんが、保存時に保持されます（Shopify admin で階層編集できます）。
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: space[2],
                    marginTop: space[2],
                    paddingTop: space[3],
                    borderTop: `1px solid ${color.border}`,
                  }}
                >
                  <button type="button" style={btnOutline} onClick={closeModal} disabled={saving}>
                    キャンセル
                  </button>
                  <button type="button" style={btnPrimary} onClick={handleSave} disabled={saving}>
                    {saving ? '保存中...' : editMode === 'new' ? '作成' : '更新'}
                  </button>
                </div>
              </>
            )}
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
