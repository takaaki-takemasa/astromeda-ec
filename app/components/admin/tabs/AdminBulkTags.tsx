/**
 * AdminBulkTags Tab — 商品タグ一括編集 (patch 0065)
 *
 * CEO 指摘「Shopify 上作業して管理画面に戻る二段階をやめたい」の P1 応答。
 * 管理画面だけで以下を完結する：
 *   - 商品一覧の検索・ページング
 *   - 複数選択（全選択/解除/個別チェック）
 *   - タグ入力（カンマ区切り or 1行1タグ）
 *   - 「＋ 一括付与」/「－ 一括削除」ボタン
 *   - 実行後に各商品の成否を結果テーブルで表示（失敗あれば赤ハイライト）
 *
 * 裏の API: POST /api/admin/products に action=tags_bulk_add / tags_bulk_remove
 * Shopify 2025-10 の tagsAdd / tagsRemove mutation を利用（既存タグ保持・冪等）
 */

import {useState, useEffect, useCallback} from 'react';
import {color, font, radius, space} from '~/lib/design-tokens';
import {useConfirmDialog} from '~/hooks/useConfirmDialog';
import {AdminListSkeleton, AdminEmptyCard} from '~/components/admin/ds/InlineListState';
// patch 0087: useToast 統合プリミティブ
import { useToast } from '~/components/admin/ds/Toast';
// patch 0082 (R0-P0-4): 生 Shopify ENUM を中学生向け日本語に変換
import {productStatusLabel, productStatusColor} from '~/lib/admin-utils';
// patch 0099: タグ入力を TagPicker に統一（既存タグ候補から選ぶ→タイポ・UX 根絶）
import TagPicker from '~/components/admin/TagPicker';
import { TabHeaderHint } from '~/components/admin/ds/TabHeaderHint';
// patch 0134 P0: タグ管理 UX 全面刷新 — 効果説明カード + 7 カテゴリ早見表
import {TagEffectCard} from '~/components/admin/ds/TagEffectCard';
import {TAG_CATEGORY_META, type TagCategory} from '~/lib/tag-classifier';
// patch 0136 P0: 一括 vs 個別の使い分けガイド
import {TagWorkflowGuide} from '~/components/admin/ds/TagWorkflowGuide';

// ── Types ──
interface ProductListItem {
  id: string;
  title: string;
  handle: string;
  status: string;
  productType: string;
  vendor: string;
  tags: string[];
  totalInventory: number;
  priceRange: {
    minVariantPrice: {amount: string; currencyCode: string};
    maxVariantPrice: {amount: string; currencyCode: string};
  };
  imageUrl: string | null;
  updatedAt: string;
  createdAt: string;
  cursor: string;
}

interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  endCursor: string | null;
}

interface BulkResult {
  id: string;
  success: boolean;
  error?: string;
}

// ── Styles ──
const cardStyle: React.CSSProperties = {
  background: color.bg1,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  padding: space[4],
  marginBottom: space[3],
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: color.bg0,
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  color: color.text,
  fontSize: font.sm,
  fontFamily: font.family,
  boxSizing: 'border-box' as const,
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
  padding: '8px 20px',
  background: 'transparent',
  color: color.red,
  border: `1px solid ${color.red}`,
  borderRadius: radius.md,
  fontSize: font.sm,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: font.family,
};

// ── Toast ──
// patch 0087: ローカル Toast は ~/components/admin/ds/Toast に統合

// ── API helpers ──
async function apiList(
  query: string,
  cursor?: string,
  limit = 50,
): Promise<{products: ProductListItem[]; pageInfo: PageInfo}> {
  const qs = new URLSearchParams();
  if (query) qs.set('query', query);
  if (cursor) qs.set('cursor', cursor);
  qs.set('limit', String(limit));
  const res = await fetch(`/api/admin/products?${qs.toString()}`);
  const json = (await res.json()) as {
    success?: boolean;
    products?: ProductListItem[];
    pageInfo?: PageInfo;
    error?: string;
  };
  if (!res.ok || !json.success) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return {products: json.products || [], pageInfo: json.pageInfo || {hasNextPage: false, hasPreviousPage: false, endCursor: null}};
}

async function apiBulkTags(
  action: 'tags_bulk_add' | 'tags_bulk_remove',
  productIds: string[],
  tags: string[],
): Promise<{
  success: boolean;
  error?: string;
  results?: BulkResult[];
  summary?: {total: number; ok: number; failed: number; tags: string[]};
}> {
  const res = await fetch('/api/admin/products', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action, productIds, tags}),
  });
  return res.json();
}

// ── tag 文字列の正規化 ──
function parseTagInput(raw: string): string[] {
  // カンマ・改行・タブで分割し、trim して空を除外
  return raw
    .split(/[,\n\t]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 255);
}

// ══════════════════════════════════
// Main Component
// ══════════════════════════════════
export default function AdminBulkTags() {
  const [list, setList] = useState<ProductListItem[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo>({hasNextPage: false, hasPreviousPage: false, endCursor: null});
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState('');
  const [running, setRunning] = useState(false);
  const [lastResults, setLastResults] = useState<BulkResult[] | null>(null);
  const [lastAction, setLastAction] = useState<'add' | 'remove' | null>(null);
  const [lastTags, setLastTags] = useState<string[]>([]);
  const {confirm: confirmDialog, dialogProps, ConfirmDialog: Dialog} = useConfirmDialog();

  // patch 0087: useToast 統合プリミティブで variant 別 duration (error=6.5s)
  const { pushToast, Toast } = useToast();
  const showToast = useCallback(
    (msg: string, type: 'ok' | 'err') => pushToast(msg, type),
    [pushToast],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {products, pageInfo: pi} = await apiList(searchQuery, cursor, 50);
      setList(products);
      setPageInfo(pi);
    } catch (e) {
      setError(e instanceof Error ? e.message : '取得失敗');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, cursor]);

  useEffect(() => {
    reload();
    // cursor 変更時も再取得
  }, [reload]);

  // ── 選択制御 ──
  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(() => {
    setSelected((prev) => {
      const allSelected = list.length > 0 && list.every((p) => prev.has(p.id));
      if (allSelected) {
        const next = new Set(prev);
        for (const p of list) next.delete(p.id);
        return next;
      }
      const next = new Set(prev);
      for (const p of list) next.add(p.id);
      return next;
    });
  }, [list]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  // patch 0088 (R2-P2-3): 一括タグの「元に戻す」(Undo) 実行
  // 成功した商品 ID 集合に対して逆操作（add→remove / remove→add）を同一 tags で適用する。
  // 第 2 引数の `skipUndo=true` で「Undo 実行時にさらに Undo を連鎖させない」ガードを付ける。
  const applyBulk = useCallback(
    async (
      op: 'add' | 'remove',
      ids: string[],
      tags: string[],
      opts?: {skipUndo?: boolean},
    ): Promise<boolean> => {
      if (ids.length === 0 || tags.length === 0) return false;
      const verb = op === 'add' ? '付与' : '削除';
      setRunning(true);
      try {
        const res = await apiBulkTags(
          op === 'add' ? 'tags_bulk_add' : 'tags_bulk_remove',
          ids,
          tags,
        );
        setLastAction(op);
        setLastTags(tags);
        if (res.results) setLastResults(res.results);

        // 「次に Undo できる」候補 = このオペレーションで実際に成功した商品 ID
        const okIds = (res.results || [])
          .filter((r) => r.success)
          .map((r) => r.id);

        if (res.success || (res.summary?.ok ?? 0) > 0) {
          const msg = res.success
            ? `✓ ${res.summary?.ok ?? ids.length}/${ids.length} 件に${verb}しました`
            : `一部成功 (成功 ${res.summary?.ok ?? 0} / 失敗 ${res.summary?.failed ?? 0})`;

          // Undo 可能: 成功件数が 1 件以上 かつ 今回が Undo 実行自体ではない
          const canUndo = !opts?.skipUndo && okIds.length > 0;
          const inverseOp: 'add' | 'remove' = op === 'add' ? 'remove' : 'add';
          const inverseVerb = inverseOp === 'add' ? '付与' : '削除';

          pushToast(msg, res.success ? 'success' : 'warning', {
            durationMs: canUndo ? 30000 : undefined,
            action: canUndo
              ? {
                  label: '↩ 元に戻す',
                  onClick: async () => {
                    // 再読込直前に Toast は自動 dismiss される
                    pushToast(`↩ 元に戻しています…`, 'info', {durationMs: 3000});
                    const undoOk = await applyBulk(inverseOp, okIds, tags, {
                      skipUndo: true,
                    });
                    if (undoOk) {
                      pushToast(
                        `↩ ${okIds.length} 件を${inverseVerb}して元に戻しました`,
                        'info',
                      );
                    }
                  },
                }
              : undefined,
          });
          return true;
        }

        // 全件失敗
        pushToast(
          `一括${verb}に失敗しました (成功 0 / 失敗 ${res.summary?.failed ?? ids.length})`,
          'error',
        );
        return false;
      } catch (e) {
        pushToast(`エラー: ${e instanceof Error ? e.message : 'Unknown'}`, 'error');
        return false;
      } finally {
        setRunning(false);
        // 成功後、結果表示のために selected はクリアせず保持する。
        // 再読込で最新タグ状態を反映。
        await reload();
      }
    },
    [pushToast, reload],
  );

  // ── 一括実行 ──
  const runBulk = useCallback(
    async (op: 'add' | 'remove') => {
      const tags = parseTagInput(tagInput);
      const ids = Array.from(selected);
      if (ids.length === 0) {
        showToast('商品が選択されていません', 'err');
        return;
      }
      if (tags.length === 0) {
        showToast('タグを 1 つ以上入力してください', 'err');
        return;
      }

      const verb = op === 'add' ? '付与' : '削除';
      const confirmed = await confirmDialog({
        title: `タグを一括${verb}しますか？`,
        message: `${ids.length} 件の商品に対して、${tags.length} 個のタグ [${tags.join(', ')}] を一括${verb}します。\nShopify に即時反映されます。30 秒以内なら通知の「↩ 元に戻す」で取り消し可能です。`,
        confirmLabel: `一括${verb}を実行`,
        destructive: op === 'remove',
        contextPath: ['コマース', '🛍️ 商品・販売', '🏷️ タグ一括編集'],
      });
      if (!confirmed) return;

      setLastResults(null);
      await applyBulk(op, ids, tags);
    },
    [tagInput, selected, confirmDialog, showToast, applyBulk],
  );

  const selectedCount = selected.size;
  const parsedTags = parseTagInput(tagInput);
  const allVisibleSelected = list.length > 0 && list.every((p) => selected.has(p.id));

  // ── Render ──
  return (
    <div style={{maxWidth: 1400, margin: '0 auto'}}>
    {/* patch 0119 (Apple CEO ライフサイクル監査): 高校生向け 1 行説明 */}
    <TabHeaderHint
      title="商品にラベルを一気に付ける"
      description="たくさんの商品に同じタグ（ラベル）を一気に付けたり外したりできます。コレクションの自動振り分け条件にも使われます。"
      relatedTabs={[{label: '商品をジャンルでまとめる', tab: 'collections'}, {label: '商品を作る・直す', tab: 'products'}]}
    />
    {/* patch 0136 P0: 「一括 vs 個別」の使い分けを冒頭で必ず示す */}
    <TagWorkflowGuide highlight="bulk" />
      <Toast />
      <Dialog {...dialogProps} />

      {/* patch 0137 P0: 高校生にも分かる ①②③ 順序バー (ヘッダー説明文は削除) */}
      <ol
        aria-label="操作の順番"
        style={{
          listStyle: 'none',
          padding: 0,
          margin: `0 0 ${space[3]}px 0`,
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        {[
          {n: '①', label: '商品を選ぶ', icon: '📦'},
          {n: '②', label: 'タグを入れる', icon: '🏷️'},
          {n: '③', label: 'ボタンを押す', icon: '✅'},
        ].map((s) => (
          <li
            key={s.n}
            style={{
              flex: 1,
              minWidth: 140,
              padding: '10px 14px',
              background: color.bg1,
              border: `1px solid ${color.border}`,
              borderLeft: `4px solid ${color.cyan}`,
              borderRadius: radius.md,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
              fontWeight: 700,
              color: color.text,
              fontFamily: font.family,
            }}
          >
            <span aria-hidden style={{fontSize: 22, color: color.cyan}}>{s.n}</span>
            <span aria-hidden style={{fontSize: 18}}>{s.icon}</span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>

      {/* patch 0134: タグ用途の早見表 — 7 カテゴリの説明カード */}
      <details
        style={{
          ...cardStyle,
          marginBottom: space[3],
          background: color.bg0,
        }}
      >
        <summary
          style={{
            cursor: 'pointer',
            fontSize: font.sm,
            fontWeight: 600,
            color: color.text,
            padding: 4,
            listStyle: 'revert',
          }}
        >
          📚 タグの「種類」早見表 — 各タグはどんな機能を持つの？ (クリックで開く)
        </summary>
        <div
          style={{
            marginTop: 12,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 10,
          }}
        >
          {(Object.keys(TAG_CATEGORY_META) as TagCategory[]).map((cat) => {
            const meta = TAG_CATEGORY_META[cat];
            return (
              <div
                key={cat}
                style={{
                  padding: 10,
                  background: color.bg1,
                  border: `1px solid ${color.border}`,
                  borderRadius: radius.sm,
                  fontSize: 12,
                  color: color.text,
                  lineHeight: 1.5,
                }}
              >
                <div style={{fontWeight: 700, marginBottom: 4}}>
                  {meta.icon} {meta.label}
                </div>
                <div style={{color: color.textMuted, fontSize: 11}}>
                  {meta.categoryDescription}
                </div>
              </div>
            );
          })}
        </div>
      </details>

      {/* 操作バー */}
      <div style={{...cardStyle, display: 'flex', flexDirection: 'column', gap: space[3]}}>
        <div>
          <label style={{fontSize: font.xs, color: color.textMuted, display: 'block', marginBottom: 4, fontWeight: 500}}>
            付与・削除したいタグ（複数指定可）
          </label>
          {/* patch 0099: textarea → TagPicker（既存タグを候補から選ぶ UX に統一） */}
          <TagPicker
            id="admin-bulk-tags-picker"
            value={tagInput}
            onChange={(csv) => setTagInput(csv)}
            placeholder="既存タグを検索 / 新しいタグ名を入力 → Enter で追加"
            excludePulldown
          />
          <div style={{marginTop: 6, fontSize: font.xs, color: color.textMuted}}>
            {parsedTags.length > 0 ? (
              <>
                入力済み: <code style={{color: color.cyan}}>[{parsedTags.join(', ')}]</code>
              </>
            ) : (
              '💡 既存のタグは候補から選べます。新しいタグは入力後 Enter で追加できます。'
            )}
          </div>
        </div>

        {/* patch 0134: 選択タグの効果リアルタイムプレビュー — 「これを付けると何が起きるか」 */}
        {parsedTags.length > 0 && (
          <div
            role="region"
            aria-label="選択タグの効果プレビュー"
            style={{
              padding: 12,
              background: color.bg0,
              border: `1px solid ${color.cyan}44`,
              borderLeft: `3px solid ${color.cyan}`,
              borderRadius: radius.md,
            }}
          >
            <div
              style={{
                fontSize: font.xs,
                fontWeight: 700,
                color: color.cyan,
                marginBottom: 8,
              }}
            >
              👀 プレビュー: 上のボタンを押すと、選択中の {selectedCount} 件の商品にこれらのタグが {parsedTags.length} 個 付与または削除されます
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
              {parsedTags.map((t) => (
                <TagEffectCard key={t} tag={t} size="default" />
              ))}
            </div>
          </div>
        )}

        <div style={{display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center'}}>
          <span style={{fontSize: font.sm, color: color.text, fontWeight: 600}}>
            選択中: <span style={{color: color.cyan}}>{selectedCount}</span> 件
          </span>
          <button
            onClick={clearSelection}
            disabled={selectedCount === 0}
            style={{...btnOutline, opacity: selectedCount === 0 ? 0.4 : 1}}
          >
            選択解除
          </button>
          <div style={{flex: 1}} />
          <button
            onClick={() => runBulk('add')}
            disabled={running || selectedCount === 0 || parsedTags.length === 0}
            style={{
              ...btnPrimary,
              opacity: running || selectedCount === 0 || parsedTags.length === 0 ? 0.4 : 1,
              cursor: running ? 'not-allowed' : 'pointer',
            }}
          >
            {running ? '処理中...' : `＋ ${selectedCount} 件に一括付与`}
          </button>
          <button
            onClick={() => runBulk('remove')}
            disabled={running || selectedCount === 0 || parsedTags.length === 0}
            style={{
              ...btnDanger,
              opacity: running || selectedCount === 0 || parsedTags.length === 0 ? 0.4 : 1,
              cursor: running ? 'not-allowed' : 'pointer',
            }}
          >
            {running ? '処理中...' : `－ ${selectedCount} 件から一括削除`}
          </button>
        </div>
      </div>

      {/* 検索 */}
      <div style={{marginBottom: space[3], display: 'flex', gap: 8, alignItems: 'center'}}>
        <input
          type="search"
          placeholder="商品名 / URL末尾 / メーカー名 / タグ で検索（例: vendor:Astromeda, tag:featured）"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{...inputStyle, maxWidth: 500}}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setCursor(undefined);
              reload();
            }
          }}
        />
        <button
          onClick={() => {
            setCursor(undefined);
            reload();
          }}
          style={btnOutline}
        >
          🔍 検索
        </button>
        <div style={{flex: 1}} />
        <span style={{fontSize: font.xs, color: color.textMuted}}>
          {list.length} 件表示 {pageInfo.hasNextPage && '（続きあり）'}
        </span>
      </div>

      {/* 一覧 */}
      {loading ? (
        <AdminListSkeleton rows={6} />
      ) : error ? (
        <div
          style={{
            padding: 24,
            background: 'rgba(255,0,0,.1)',
            border: `1px solid ${color.red}`,
            borderRadius: radius.md,
            color: color.red,
          }}
        >
          エラー: {error}
        </div>
      ) : list.length === 0 ? (
        <AdminEmptyCard
          icon="🔎"
          title="該当する商品がありません"
          description="検索条件を変更するか、ステータス・タイプ・ベンダーの絞り込みを解除してください。"
        />
      ) : (
        <div style={{...cardStyle, padding: 0, overflow: 'hidden'}}>
          <table style={{width: '100%', borderCollapse: 'collapse', fontSize: font.sm}}>
            <thead>
              <tr
                style={{
                  background: color.bg0,
                  textAlign: 'left',
                  color: color.textMuted,
                  fontSize: font.xs,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                <th style={{padding: '10px 12px', width: 40, textAlign: 'center'}}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="表示中を全選択"
                    style={{cursor: 'pointer', width: 16, height: 16}}
                  />
                </th>
                <th style={{padding: '10px 12px', width: 48}}>画像</th>
                <th style={{padding: '10px 12px'}}>タイトル</th>
                <th style={{padding: '10px 12px'}}>URL末尾</th>
                <th style={{padding: '10px 12px'}}>現在のタグ</th>
                <th style={{padding: '10px 12px', width: 80}}>在庫</th>
                <th style={{padding: '10px 12px', width: 90}}>状態</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const checked = selected.has(p.id);
                const lastResult = lastResults?.find((r) => r.id === p.id);
                return (
                  <tr
                    key={p.id}
                    onClick={() => toggleOne(p.id)}
                    style={{
                      borderTop: `1px solid ${color.border}`,
                      cursor: 'pointer',
                      background: checked
                        ? 'rgba(0,240,255,.08)'
                        : lastResult && !lastResult.success
                          ? 'rgba(255,0,0,.08)'
                          : 'transparent',
                    }}
                  >
                    <td style={{padding: '10px 12px', textAlign: 'center'}}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`${p.title} を選択`}
                        style={{cursor: 'pointer', width: 16, height: 16}}
                      />
                    </td>
                    <td style={{padding: '10px 12px'}}>
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt=""
                          style={{
                            width: 36,
                            height: 36,
                            objectFit: 'cover',
                            borderRadius: radius.sm,
                            border: `1px solid ${color.border}`,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            background: color.bg0,
                            border: `1px dashed ${color.border}`,
                            borderRadius: radius.sm,
                          }}
                        />
                      )}
                    </td>
                    <td style={{padding: '10px 12px', fontWeight: 600, color: color.text}}>
                      {p.title}
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        fontFamily: 'ui-monospace, monospace',
                        fontSize: font.xs,
                        color: color.textMuted,
                      }}
                    >
                      {p.handle}
                    </td>
                    <td style={{padding: '10px 12px'}}>
                      <div style={{display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 380}}>
                        {p.tags.length === 0 ? (
                          <span style={{color: color.textMuted, fontSize: font.xs}}>（なし）</span>
                        ) : (
                          p.tags.slice(0, 8).map((t) => (
                            <span
                              key={t}
                              style={{
                                padding: '2px 6px',
                                background: parsedTags.includes(t)
                                  ? 'rgba(0,240,255,.2)'
                                  : color.bg0,
                                color: parsedTags.includes(t) ? color.cyan : color.textMuted,
                                borderRadius: radius.sm,
                                fontSize: 11,
                                fontWeight: parsedTags.includes(t) ? 600 : 400,
                              }}
                            >
                              {t}
                            </span>
                          ))
                        )}
                        {p.tags.length > 8 && (
                          <span style={{fontSize: 11, color: color.textMuted}}>
                            +{p.tags.length - 8}
                          </span>
                        )}
                      </div>
                      {lastResult && !lastResult.success && (
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 11,
                            color: color.red,
                            fontWeight: 600,
                          }}
                        >
                          ✗ {lastResult.error}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        textAlign: 'right',
                        color: p.totalInventory > 0 ? color.text : color.red,
                        fontSize: font.xs,
                      }}
                    >
                      {p.totalInventory}
                    </td>
                    <td style={{padding: '10px 12px'}}>
                      {/* patch 0082 (R0-P0-4): 生 ENUM → 中学生向け日本語ラベル */}
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: radius.sm,
                          fontSize: font.xs,
                          fontWeight: 600,
                          background: productStatusColor(p.status).bg,
                          color: productStatusColor(p.status).fg,
                        }}
                        aria-label={`商品ステータス: ${productStatusLabel(p.status)}`}
                      >
                        {productStatusLabel(p.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* ページング */}
          {(pageInfo.hasNextPage || cursor) && (
            <div
              style={{
                padding: '10px 12px',
                borderTop: `1px solid ${color.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: color.bg0,
              }}
            >
              <button
                onClick={() => {
                  setCursor(undefined);
                }}
                disabled={!cursor}
                style={{...btnOutline, opacity: cursor ? 1 : 0.4}}
              >
                ← 先頭に戻る
              </button>
              <button
                onClick={() => {
                  if (pageInfo.endCursor) setCursor(pageInfo.endCursor);
                }}
                disabled={!pageInfo.hasNextPage}
                style={{...btnOutline, opacity: pageInfo.hasNextPage ? 1 : 0.4}}
              >
                次のページ →
              </button>
            </div>
          )}
        </div>
      )}

      {/* 結果サマリー */}
      {lastResults && (
        <div style={{...cardStyle, marginTop: space[4]}}>
          <h3 style={{margin: 0, fontSize: font.md, fontWeight: 700, color: color.text}}>
            最新の実行結果（{lastAction === 'add' ? '付与' : '削除'}: {lastTags.join(', ')}）
          </h3>
          <div style={{marginTop: 8, fontSize: font.sm, color: color.textMuted}}>
            成功 <span style={{color: color.cyan, fontWeight: 700}}>
              {lastResults.filter((r) => r.success).length}
            </span>{' '}
            / 失敗{' '}
            <span style={{color: color.red, fontWeight: 700}}>
              {lastResults.filter((r) => !r.success).length}
            </span>{' '}
            / 合計 {lastResults.length}
          </div>
          {lastResults.some((r) => !r.success) && (
            <details style={{marginTop: 12}}>
              <summary style={{cursor: 'pointer', color: color.red, fontSize: font.sm, fontWeight: 600}}>
                失敗の詳細を表示
              </summary>
              <ul style={{marginTop: 8, paddingLeft: 20, fontSize: font.xs, color: color.textMuted}}>
                {lastResults
                  .filter((r) => !r.success)
                  .map((r) => (
                    <li key={r.id} style={{marginBottom: 4}}>
                      <code>{r.id}</code>: {r.error}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
