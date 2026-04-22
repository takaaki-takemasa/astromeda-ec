/**
 * AdminFiles Tab — Shopify Files ライブラリ管理 (patch 0067)
 *
 * CEO 指摘「Shopify 上作業して管理画面に戻る二段階をやめたい」の P3。
 * Shopify Files ライブラリ（バナー・コレクション画像・汎用ファイル）を
 * 管理画面から棚卸し・削除できるタブ。
 *
 *   - グリッド: サムネ + 種別バッジ + 日付 + サイズ + 選択チェックボックス
 *   - 検索: filename / 高度検索構文両対応
 *   - 種別フィルタ: すべて / 画像 / 動画 / ファイル
 *   - カーソル式ページネーション（cursorHistory stack で prev/next）
 *   - 単一削除: useConfirmDialog（destructive）
 *   - 一括削除: 選択中アイテムをまとめて削除（確認必須）
 *   - URL / GID コピー: クリックでクリップボード
 *
 * 効果器: 倉庫の棚卸し（在庫の可視化と撤去）
 *
 * アップロード機能は既存 /api/admin/images 経由（fileCreate）なので本タブでは扱わない。
 */

import {useState, useEffect, useCallback, useMemo} from 'react';
import {color, font, radius, space} from '~/lib/design-tokens';
import {useConfirmDialog} from '~/hooks/useConfirmDialog';
import {AdminListSkeleton, AdminEmptyCard} from '~/components/admin/ds/InlineListState';
// patch 0087: useToast 統合プリミティブ
import { useToast } from '~/components/admin/ds/Toast';

// ━━━ Types ━━━

interface ShopifyFile {
  id: string;
  fileStatus: string;
  url: string;
  previewUrl: string;
  alt: string;
  mimeType: string;
  createdAt: string;
  originalFileName: string;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  typeName: string;
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

type TypeFilter = 'ALL' | 'IMAGE' | 'VIDEO' | 'FILE';

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
  padding: '6px 10px',
  background: 'transparent',
  color: color.cyan,
  border: `1px solid ${color.cyan}`,
  borderRadius: radius.sm,
  fontSize: font.xs,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: font.family,
};

const filterChip = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  background: active ? color.cyan : 'transparent',
  color: active ? '#000' : color.textMuted,
  border: `1px solid ${active ? color.cyan : color.border}`,
  borderRadius: radius.full,
  fontSize: font.xs,
  fontWeight: active ? 700 : 500,
  cursor: 'pointer',
  fontFamily: font.family,
});

// ━━━ API helpers ━━━

async function apiList(
  query: string,
  type: TypeFilter,
  cursor: string | null,
): Promise<{items: ShopifyFile[]; pageInfo: PageInfo}> {
  const params = new URLSearchParams({limit: '50'});
  if (query) params.set('query', query);
  if (type !== 'ALL') params.set('type', type);
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`/api/admin/files?${params.toString()}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'API error');
  return {
    items: json.files ?? [],
    pageInfo: json.pageInfo ?? {hasNextPage: false, endCursor: null},
  };
}

async function apiDelete(
  ids: string[],
): Promise<{
  success: boolean;
  error?: string;
  deletedFileIds?: string[];
  requested?: number;
  deleted?: number;
}> {
  const body =
    ids.length === 1
      ? {action: 'delete', id: ids[0]}
      : {action: 'delete_bulk', ids};
  const res = await fetch('/api/admin/files', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  return res.json();
}

// ━━━ helpers ━━━

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  } catch {
    return iso.substring(0, 10);
  }
}

function typeLabel(f: ShopifyFile): string {
  if (f.typeName === 'MediaImage') return '画像';
  if (f.typeName === 'Video') return '動画';
  if (f.typeName === 'GenericFile') return 'ファイル';
  return f.typeName;
}

function typeBadgeColor(typeName: string): string {
  if (typeName === 'MediaImage') return '#00d9ff';
  if (typeName === 'Video') return '#c084fc';
  if (typeName === 'GenericFile') return '#facc15';
  return '#6b7280';
}

// ━━━ Toast ━━━
// patch 0087: ローカル Toast は ~/components/admin/ds/Toast に統合

// ━━━ File Card ━━━

function FileCard({
  f,
  selected,
  onToggle,
  onDelete,
  onCopy,
}: {
  f: ShopifyFile;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onCopy: (text: string, label: string) => void;
}) {
  const imgSrc = f.previewUrl || f.url;
  const isImage = f.typeName === 'MediaImage';
  return (
    <div
      style={{
        background: color.bg1,
        border: `1px solid ${selected ? color.cyan : color.border}`,
        borderRadius: radius.md,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Thumbnail area */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '1',
          background: '#0a0a0a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {isImage && imgSrc ? (
          <img
            src={imgSrc}
            alt={f.alt || f.originalFileName || ''}
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              fontSize: 40,
              color: color.textMuted,
              textAlign: 'center',
            }}
          >
            {f.typeName === 'Video' ? '🎬' : '📄'}
          </div>
        )}
        {/* type badge */}
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            background: 'rgba(0,0,0,0.65)',
            color: typeBadgeColor(f.typeName),
            padding: '2px 8px',
            borderRadius: radius.sm,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          {typeLabel(f)}
        </div>
        {/* select checkbox */}
        <label
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            background: 'rgba(0,0,0,0.65)',
            borderRadius: radius.sm,
            padding: '2px 4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            style={{margin: 0, cursor: 'pointer'}}
          />
        </label>
      </div>

      {/* Info area */}
      <div style={{padding: space[2], flex: 1, display: 'flex', flexDirection: 'column'}}>
        <div
          style={{
            fontSize: font.xs,
            fontWeight: 600,
            color: color.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={f.originalFileName || f.alt || f.id}
        >
          {f.originalFileName || f.alt || '(名前なし)'}
        </div>
        <div style={{fontSize: 10, color: color.textMuted, marginTop: 4, lineHeight: 1.6}}>
          {f.width && f.height ? `${f.width}×${f.height}` : ''}
          {(f.width && f.height) && f.fileSize != null ? ' · ' : ''}
          {formatBytes(f.fileSize)}
          {' · '}
          {formatDate(f.createdAt)}
        </div>
        {/* Actions */}
        <div style={{display: 'flex', gap: 6, marginTop: space[2], flexWrap: 'wrap'}}>
          {f.url && (
            <button
              type="button"
              style={btnGhost}
              onClick={() => onCopy(f.url, 'URL')}
              title="画像/ファイルの公開 URL をコピー"
            >
              🔗 URL
            </button>
          )}
          <button
            type="button"
            style={btnGhost}
            onClick={() => onCopy(f.id, '画像ID')}
            title="画像ID をコピー（開発者向け）"
            aria-label="画像IDをコピー（開発者向け）"
          >
            🆔 画像ID
          </button>
          <button type="button" style={btnDanger} onClick={onDelete}>
            削除
          </button>
        </div>
      </div>
    </div>
  );
}

// ━━━ Main Component ━━━

export default function AdminFiles() {
  const [list, setList] = useState<ShopifyFile[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo>({hasNextPage: false, endCursor: null});
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([null]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // patch 0087: 保存中/削除中ボタン状態
  const [deleting, setDeleting] = useState(false);
  const {confirm: confirmDialog, ConfirmDialog: Dialog, dialogProps} = useConfirmDialog();

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
      const {items, pageInfo: pi} = await apiList(searchQuery, typeFilter, currentCursor);
      setList(items);
      setPageInfo(pi);
      // 現在のページに残らないアイテムは選択解除
      setSelectedIds((prev) => {
        const remaining = new Set<string>();
        items.forEach((x) => {
          if (prev.has(x.id)) remaining.add(x.id);
        });
        return remaining;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '取得失敗');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, typeFilter, currentCursor]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSearchSubmit = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      setCursorHistory([null]);
      setSearchQuery(searchInput.trim());
    },
    [searchInput],
  );

  const setFilterAndReset = useCallback((next: TypeFilter) => {
    setTypeFilter(next);
    setCursorHistory([null]);
  }, []);

  const nextPage = useCallback(() => {
    if (!pageInfo.hasNextPage || !pageInfo.endCursor) return;
    setCursorHistory((h) => [...h, pageInfo.endCursor]);
  }, [pageInfo]);

  const prevPage = useCallback(() => {
    setCursorHistory((h) => (h.length <= 1 ? h : h.slice(0, -1)));
  }, []);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllOnPage = useCallback(() => {
    setSelectedIds((prev) => {
      const onPageIds = list.map((f) => f.id);
      const allSelected = onPageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        onPageIds.forEach((id) => next.delete(id));
      } else {
        onPageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [list]);

  const copyToClipboard = useCallback(
    async (text: string, label: string) => {
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        showToast(`${label} をコピーしました`, 'ok');
      } catch {
        showToast(`${label} のコピーに失敗`, 'err');
      }
    },
    [showToast],
  );

  const deleteOne = useCallback(
    async (f: ShopifyFile) => {
      const ok = await confirmDialog({
        title: 'ファイルを削除しますか？',
        message: `${f.originalFileName || f.alt || f.id} を削除します。このファイルを使っている商品やページがある場合は、その画像が表示されなくなります。この操作は取り消せません。`,
        confirmLabel: '削除',
        destructive: true,
        contextPath: ['コマース', '📝 コンテンツ・ページ', '📁 ファイル'],
      });
      if (!ok) return;
      const res = await apiDelete([f.id]);
      if (res.success) {
        showToast('削除しました', 'ok');
        setSelectedIds((prev) => {
          const n = new Set(prev);
          n.delete(f.id);
          return n;
        });
        reload();
      } else {
        showToast(`削除失敗: ${res.error}`, 'err');
      }
    },
    [confirmDialog, showToast, reload],
  );

  const deleteSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      showToast('削除するファイルを選択してください', 'err');
      return;
    }
    const ok = await confirmDialog({
      title: `${ids.length} 件のファイルを削除しますか？`,
      message: `選択中の ${ids.length} ファイルをまとめて削除します。参照されている画像は失われます。この操作は取り消せません。`,
      confirmLabel: `${ids.length} 件削除`,
      destructive: true,
      contextPath: ['コマース', '📝 コンテンツ・ページ', '📁 ファイル'],
    });
    if (!ok) return;
    // patch 0087: 進行中は多重発火を防ぐ
    setDeleting(true);
    try {
      const res = await apiDelete(ids);
      if (res.success) {
        showToast(`${res.deleted ?? ids.length} / ${res.requested ?? ids.length} 件削除しました`, 'ok');
        setSelectedIds(new Set());
        reload();
      } else {
        showToast(`一括削除失敗: ${res.error}`, 'err');
      }
    } finally {
      setDeleting(false);
    }
  }, [selectedIds, confirmDialog, showToast, reload]);

  const rows = useMemo(() => list, [list]);

  const pageCount = cursorHistory.length;
  const selectedCount = selectedIds.size;

  // ━━━ Render ━━━
  return (
    <div style={{padding: space[4], color: color.text, fontFamily: font.family}}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: space[4],
          gap: space[3],
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{fontSize: font.xl, fontWeight: 700, margin: 0}}>📁 ファイルライブラリ</h1>
          <p
            style={{
              fontSize: font.sm,
              color: color.textMuted,
              marginTop: '6px',
              maxWidth: 680,
              lineHeight: 1.6,
            }}
          >
            Shopify Files に登録された画像・動画・ファイルを棚卸し・削除できます。アップロードはバナー/商品編集画面から行います。
            削除したファイルを参照している商品・バナーは画像が消えるので注意してください。
          </p>
        </div>
        {selectedCount > 0 && (
          <button
            type="button"
            style={{
              ...btnDanger,
              fontSize: font.sm,
              padding: '8px 16px',
              opacity: deleting ? 0.5 : 1,
              cursor: deleting ? 'not-allowed' : 'pointer',
            }}
            onClick={deleteSelected}
            disabled={deleting}
            aria-busy={deleting}
          >
            {deleting ? '削除中…' : `🗑 選択した ${selectedCount} 件を削除`}
          </button>
        )}
      </div>

      {/* Filters + Search */}
      <div style={{display: 'flex', gap: space[2], marginBottom: space[3], flexWrap: 'wrap'}}>
        {(['ALL', 'IMAGE', 'VIDEO', 'FILE'] as TypeFilter[]).map((t) => (
          <button
            key={t}
            type="button"
            style={filterChip(typeFilter === t)}
            onClick={() => setFilterAndReset(t)}
          >
            {t === 'ALL' ? 'すべて' : t === 'IMAGE' ? '画像' : t === 'VIDEO' ? '動画' : 'ファイル'}
          </button>
        ))}
      </div>

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
          placeholder="ファイル名で検索（例: hero / banner）"
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
        <button type="button" style={btnOutline} onClick={toggleAllOnPage}>
          ☑ ページ全選択
        </button>
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

      {/* Grid */}
      {loading ? (
        <AdminListSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <AdminEmptyCard
          icon="📁"
          title="ファイルはまだありません"
          description="商品画像やバナー画像などを Shopify にアップロードすると、ここに一覧表示されます。検索条件で絞り込んでいる場合は、条件をクリアしてください。"
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: space[3],
          }}
        >
          {rows.map((f) => (
            <FileCard
              key={f.id}
              f={f}
              selected={selectedIds.has(f.id)}
              onToggle={() => toggleOne(f.id)}
              onDelete={() => deleteOne(f)}
              onCopy={copyToClipboard}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: space[4],
          paddingTop: space[3],
          borderTop: `1px solid ${color.border}`,
        }}
      >
        <div style={{fontSize: font.xs, color: color.textMuted}}>
          {rows.length} 件表示 · ページ {pageCount}
          {selectedCount > 0 ? ` · 選択 ${selectedCount} 件` : ''}
        </div>
        <div style={{display: 'flex', gap: space[2]}}>
          <button
            type="button"
            style={{...btnOutline, opacity: pageCount <= 1 ? 0.4 : 1}}
            onClick={prevPage}
            disabled={pageCount <= 1}
            aria-label="前のページ"
          >
            ← 前のページ
          </button>
          <button
            type="button"
            style={{...btnOutline, opacity: pageInfo.hasNextPage ? 1 : 0.4}}
            onClick={nextPage}
            disabled={!pageInfo.hasNextPage}
            aria-label="次のページ"
          >
            次のページ →
          </button>
        </div>
      </div>

      <Toast />
      <Dialog {...dialogProps} />
    </div>
  );
}
