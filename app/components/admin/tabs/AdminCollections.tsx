/**
 * AdminCollections Tab — コレクション管理 (patch 0064)
 *
 * CEO 指摘「Shopify 上作業して管理画面に戻る二段階をやめたい」に応え、
 * 管理画面だけで以下を完結するタブを新設：
 *   - コレクション一覧（draft 含む / 画像サムネ / 商品数 / ルール有無バッジ）
 *   - 新規作成モーダル: title / handle / descriptionHtml / image(URL or アップロード) / ルールセット(スマート)
 *   - 編集モーダル: 上記全フィールドの差分更新
 *   - 削除: 確認ダイアログ（useConfirmDialog）
 *
 * 画像アップロードは /api/admin/images の staged_upload → create_file の 2 段階で
 * Shopify Files に置き、取得した URL を image.src として collectionCreate/Update に渡す。
 */

import {useState, useEffect, useCallback, useRef} from 'react';
import {color, font, radius, space} from '~/lib/design-tokens';
import {Modal} from '~/components/admin/Modal';
import {useConfirmDialog} from '~/hooks/useConfirmDialog';
import {AdminListSkeleton, AdminEmptyCard} from '~/components/admin/ds/InlineListState';
// patch 0087: useToast 統合プリミティブ
import {useToast} from '~/components/admin/ds/Toast';
import { TabHeaderHint } from '~/components/admin/ds/TabHeaderHint';
// patch 0141: ジャンル一覧を 3 軸 (製品群×IP×製品ジャンル) で階層化
import {groupCollectionsHierarchical, PRODUCT_GROUP_META, GROUP_ORDER} from '~/lib/collection-classifier';

// ── Types ──
interface RuleInput {
  column: string;
  relation: string;
  condition: string;
}
interface RuleSetInput {
  appliedDisjunctively: boolean;
  rules: RuleInput[];
}
interface CollectionListItem {
  id: string;
  handle: string;
  title: string;
  updatedAt: string;
  productsCount: number;
  imageUrl: string | null;
  ruleSet: RuleSetInput | null;
  sortOrder: string;
  // patch 0149: 公開状態 (Apple Just Works 視覚化)
  publishedCount?: number;
  totalChannels?: number;
}
interface CollectionDetail extends CollectionListItem {
  descriptionHtml: string;
  description: string;
  seo: {title: string | null; description: string | null};
  templateSuffix: string | null;
}

interface FormState {
  id?: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  imageUrl: string;
  imageAlt: string;
  useRuleSet: boolean;
  appliedDisjunctively: boolean;
  rules: RuleInput[];
  seoTitle: string;
  seoDescription: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  handle: '',
  descriptionHtml: '',
  imageUrl: '',
  imageAlt: '',
  useRuleSet: true,
  appliedDisjunctively: false,
  rules: [{column: 'TAG', relation: 'EQUALS', condition: ''}],
  seoTitle: '',
  seoDescription: '',
};

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

// ── API Helpers ──
async function apiList(queryStr = ''): Promise<CollectionListItem[]> {
  const qs = queryStr ? `?query=${encodeURIComponent(queryStr)}&limit=100` : '?limit=100';
  const res = await fetch(`/api/admin/collections${qs}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'API error');
  return json.collections ?? [];
}

async function apiDetail(id: string): Promise<CollectionDetail> {
  const res = await fetch(`/api/admin/collections?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'API error');
  return json.collection;
}

async function apiAction(body: Record<string, unknown>): Promise<{success: boolean; error?: string; id?: string; handle?: string}> {
  const res = await fetch('/api/admin/collections', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  return res.json();
}

/**
 * 画像を Shopify Files にアップロードし、公開 URL を返す。
 * 手順: staged_upload (署名付き URL 取得) → そこへ PUT → create_file (Shopify Files 登録)
 */
async function uploadImageToShopify(file: File): Promise<string> {
  // Step 1: staged upload URL 取得
  const stagedRes = await fetch('/api/admin/images', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      action: 'staged_upload',
      filename: file.name,
      mimeType: file.type || 'image/jpeg',
      fileSize: file.size,
    }),
  });
  const stagedJson = (await stagedRes.json()) as {
    success?: boolean;
    error?: string;
    stagedTarget?: {
      url: string;
      resourceUrl: string;
      parameters?: Array<{name: string; value: string}>;
    };
  };
  if (!stagedRes.ok || !stagedJson.success || !stagedJson.stagedTarget) {
    throw new Error(`staged_upload 失敗: ${stagedJson.error || stagedRes.status}`);
  }
  const {url, resourceUrl, parameters} = stagedJson.stagedTarget;

  // Step 2: 署名付き URL に POST アップロード
  const fd = new FormData();
  if (parameters) for (const p of parameters) fd.append(p.name, p.value);
  fd.append('file', file);
  const uploadRes = await fetch(url, {method: 'POST', body: fd});
  if (!uploadRes.ok) throw new Error(`画像アップロード失敗: ${uploadRes.status}`);

  // Step 3: Shopify Files に create_file 登録
  const createRes = await fetch('/api/admin/images', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action: 'create_file', resourceUrl, alt: file.name}),
  });
  const createJson = (await createRes.json()) as {
    success?: boolean;
    error?: string;
    file?: {id: string; url: string};
  };
  if (!createRes.ok || !createJson.success || !createJson.file) {
    throw new Error(`fileCreate 失敗: ${createJson.error || createRes.status}`);
  }

  // CDN URL を返す。無ければ resourceUrl を fallback。
  return createJson.file.url || resourceUrl;
}

// ── Toast ──
// patch 0087: ローカル Toast は ~/components/admin/ds/Toast に統合

// ── Column/Relation options ──
const COLUMN_OPTIONS: Array<{value: string; label: string}> = [
  {value: 'TAG', label: '商品タグ'},
  {value: 'TITLE', label: '商品タイトル'},
  {value: 'TYPE', label: '商品タイプ'},
  {value: 'VENDOR', label: 'ベンダー'},
  {value: 'VARIANT_PRICE', label: '価格'},
  {value: 'IS_PRICE_REDUCED', label: 'セール中'},
];

const RELATION_OPTIONS: Array<{value: string; label: string}> = [
  {value: 'EQUALS', label: '等しい'},
  {value: 'NOT_EQUALS', label: '等しくない'},
  {value: 'CONTAINS', label: '含む'},
  {value: 'NOT_CONTAINS', label: '含まない'},
  {value: 'STARTS_WITH', label: 'で始まる'},
  {value: 'ENDS_WITH', label: 'で終わる'},
  {value: 'GREATER_THAN', label: 'より大きい'},
  {value: 'LESS_THAN', label: 'より小さい'},
];

// ══════════════════════════════════
// Main Component
// ══════════════════════════════════
export default function AdminCollections() {
  const [list, setList] = useState<CollectionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // patch 0087: useToast 統合プリミティブで variant 別 duration (error=6.5s)
  const {pushToast, Toast} = useToast();
  const [editId, setEditId] = useState<string | null | 'new'>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const {confirm: confirmDialog, dialogProps, ConfirmDialog: Dialog} = useConfirmDialog();

  const showToast = useCallback(
    (msg: string, type: 'ok' | 'err') => pushToast(msg, type),
    [pushToast],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cols = await apiList(searchQuery);
      setList(cols);
    } catch (e) {
      setError(e instanceof Error ? e.message : '取得失敗');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    reload();
  }, [reload]);

  const openNew = useCallback(() => {
    setForm(EMPTY_FORM);
    setEditId('new');
  }, []);

  const openEdit = useCallback(async (id: string) => {
    setEditId(id);
    setForm({...EMPTY_FORM});
    try {
      const c = await apiDetail(id);
      setForm({
        id: c.id,
        title: c.title,
        handle: c.handle,
        descriptionHtml: c.descriptionHtml,
        imageUrl: c.imageUrl ?? '',
        imageAlt: '',
        useRuleSet: !!c.ruleSet,
        appliedDisjunctively: c.ruleSet?.appliedDisjunctively ?? false,
        rules:
          c.ruleSet?.rules?.length
            ? c.ruleSet.rules.map((r) => ({column: r.column, relation: r.relation, condition: r.condition}))
            : [{column: 'TAG', relation: 'EQUALS', condition: ''}],
        seoTitle: c.seo.title ?? '',
        seoDescription: c.seo.description ?? '',
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : '取得失敗', 'err');
      setEditId(null);
    }
  }, [showToast]);

  const closeModal = useCallback(() => {
    setEditId(null);
    setForm(EMPTY_FORM);
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImageToShopify(file);
      setForm((f) => ({...f, imageUrl: url, imageAlt: f.imageAlt || file.name}));
      showToast('画像をアップロードしました', 'ok');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'アップロード失敗', 'err');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [showToast]);

  const handleSave = useCallback(async () => {
    if (!form.title.trim()) {
      showToast('タイトルは必須です', 'err');
      return;
    }
    if (form.useRuleSet) {
      const invalid = form.rules.some((r) => !r.condition.trim());
      if (invalid) {
        showToast('ルール条件が空です', 'err');
        return;
      }
    }
    setSaving(true);
    const body: Record<string, unknown> = {
      action: editId === 'new' ? 'create' : 'update',
      title: form.title,
      descriptionHtml: form.descriptionHtml || undefined,
      handle: form.handle || undefined,
    };
    if (editId !== 'new' && form.id) body.id = form.id;
    if (form.imageUrl.trim()) {
      body.image = {src: form.imageUrl, altText: form.imageAlt || undefined};
    }
    if (form.useRuleSet) {
      body.ruleSet = {
        appliedDisjunctively: form.appliedDisjunctively,
        rules: form.rules.map((r) => ({
          column: r.column,
          relation: r.relation,
          condition: r.condition,
        })),
      };
    }
    if (form.seoTitle || form.seoDescription) {
      body.seo = {title: form.seoTitle || undefined, description: form.seoDescription || undefined};
    }

    const res = await apiAction(body);
    setSaving(false);
    if (res.success) {
      // patch 0149: Apple/Stripe Graceful — 公開状態に応じて Toast 分岐
      if (editId === 'new') {
        const pc = (res as {publishedToCount?: number}).publishedToCount ?? 0;
        const needsManual = (res as {needsManualPublish?: boolean}).needsManualPublish ?? false;
        const publishUrl = (res as {publishUrl?: string}).publishUrl;
        if (pc > 0) {
          showToast(`🟢 お店に出しました (${pc} チャネル)`, 'ok');
        } else if (needsManual && publishUrl) {
          // 失敗時はリンク付き toast (1 クリックで Shopify 公開ページへ)
          showToast(`🟡 作成完了 — 公開設定が必要です`, 'ok');
          // 簡易: ブラウザで Shopify 公開ページを別タブで開く
          window.open(publishUrl, '_blank', 'noopener,noreferrer');
        } else {
          showToast('コレクションを作成しました', 'ok');
        }
      } else {
        showToast('コレクションを更新しました', 'ok');
      }
      closeModal();
      reload();
    } else {
      showToast(`保存失敗: ${res.error}`, 'err');
    }
  }, [form, editId, showToast, closeModal, reload]);

  const handleDelete = useCallback(
    async (id: string, title: string) => {
      const ok = await confirmDialog({
        title: 'コレクションを削除しますか？',
        message: `"${title}" を完全に削除します。この操作は取り消せません。`,
        confirmLabel: '削除',
        destructive: true,
        contextPath: ['コマース', '🛍️ 商品・販売', '📚 コレクション'],
      });
      if (!ok) return;
      // patch 0114: P1-4 サーバ Zod が confirm:true を要求（誤削除防止）
      const res = await apiAction({action: 'delete', id, confirm: true});
      if (res.success) {
        showToast('削除しました', 'ok');
        reload();
      } else {
        showToast(`削除失敗: ${res.error}`, 'err');
      }
    },
    [confirmDialog, showToast, reload],
  );

  // ── Render ──
  return (
    <div style={{maxWidth: 1200, margin: '0 auto'}}>
    {/* patch 0119 (Apple CEO ライフサイクル監査): 高校生向け 1 行説明 */}
    {/* patch 0151 (2026-04-24): ジャンル → コレクション に用語統一。
        Shopify Collections と一致する概念は「コレクション」を canonical 用語とする。
        商品ジャンル (productType: PC/ガジェット/グッズ/着せ替え/その他) や
        製品ジャンル (コレクション内サブ分類) は別概念のため残置。 */}
    <TabHeaderHint
      title="商品をコレクションでまとめる"
      description="コレクション = お客様がストアで商品を絞り込む単位です。下では「コラボPC / スタンダードPC / ガジェット / グッズ」の 4 大製品群に分けて表示し、コラボPCは更にIP別、ガジェット/グッズは製品種別に細分化されます。"
      relatedTabs={[{label: '商品を作る・直す', tab: 'products'}, {label: '一括タグ', tab: 'bulkTags'}]}
    />
      <Toast />
      {/* patch 0087: useToast が自前で render するため条件分岐不要 */}
      <Dialog {...dialogProps} />

      {/* ヘッダー */}
      <div style={{...cardStyle, background: color.bg2, marginBottom: space[4]}}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'}}>
          <div>
            <h2 style={{margin: 0, fontSize: 22, fontWeight: 800, color: color.text}}>
              📚 コレクション管理
            </h2>
            <p style={{margin: '6px 0 0', fontSize: 13, color: color.textMuted, lineHeight: 1.6}}>
              IP コラボ用の親コレクションや、スマート条件で自動に商品を束ねるコレクションを管理画面だけで作成・編集できます。
              ここで作成したコレクションは Shopify 側にも同時に反映されます。
            </p>
          </div>
          <button onClick={openNew} style={btnPrimary}>＋ 新規コレクション</button>
        </div>
      </div>

      {/* 検索 */}
      <div style={{marginBottom: space[3], display: 'flex', gap: 8}}>
        <input
          type="search"
          placeholder="タイトルや handle で検索"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{...inputStyle, maxWidth: 360}}
          onKeyDown={(e) => {
            if (e.key === 'Enter') reload();
          }}
        />
        <button onClick={reload} style={btnOutline}>🔍 検索</button>
      </div>

      {/* 一覧 */}
      {loading ? (
        <AdminListSkeleton rows={6} />
      ) : error ? (
        <div style={{padding: 24, background: 'rgba(255,0,0,.1)', border: `1px solid ${color.red}`, borderRadius: radius.md, color: color.red}}>
          エラー: {error}
        </div>
      ) : list.length === 0 ? (
        <AdminEmptyCard
          icon="🗂️"
          title="コレクションはまだありません"
          description="商品をまとめるグループ（例: ゲーミングPC、キーボード、IPコラボ）を作成すると、ここに一覧表示されます。スマートコレクション（ルールで自動追加）にも対応しています。"
          action={<button onClick={openNew} style={btnPrimary}>＋ 最初のコレクションを作る</button>}
        />
      ) : (
        // patch 0141: 3 軸 (製品群 × IP × 製品ジャンル) で階層レンダリング
        (() => {
          const hierarchy = groupCollectionsHierarchical(list);
          const groupsWithItems = GROUP_ORDER.filter((g) => {
            const data = hierarchy.get(g);
            return data && (data.items.length > 0 || data.subGroups.size > 0);
          });

          // 共通 table render helper
          const renderTable = (items: typeof list) => (
            <div style={{...cardStyle, padding: 0, overflow: 'hidden', marginTop: 0, marginBottom: 0}}>
              <table style={{width: '100%', borderCollapse: 'collapse', fontSize: font.sm}}>
                <thead>
                  <tr style={{background: color.bg0, textAlign: 'left', color: color.textMuted, fontSize: font.xs, textTransform: 'uppercase', letterSpacing: 1}}>
                    <th style={{padding: '10px 12px', width: 60}}>画像</th>
                    <th style={{padding: '10px 12px'}}>タイトル</th>
                    <th style={{padding: '10px 12px'}}>handle</th>
                    <th style={{padding: '10px 12px', textAlign: 'right'}}>商品数</th>
                    <th style={{padding: '10px 12px', textAlign: 'center', width: 80}}>公開</th>
                    <th style={{padding: '10px 12px'}}>種別</th>
                    <th style={{padding: '10px 12px'}}>更新日</th>
                    <th style={{padding: '10px 12px', width: 160}}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                <tr key={c.id} style={{borderTop: `1px solid ${color.border}`, cursor: 'pointer'}}>
                  <td style={{padding: '10px 12px'}} onClick={() => openEdit(c.id)}>
                    {c.imageUrl ? (
                      <img
                        src={c.imageUrl}
                        alt=""
                        style={{width: 40, height: 40, objectFit: 'cover', borderRadius: radius.sm, border: `1px solid ${color.border}`}}
                      />
                    ) : (
                      <div style={{width: 40, height: 40, background: color.bg0, border: `1px dashed ${color.border}`, borderRadius: radius.sm, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color.textMuted, fontSize: 10}}>
                        無
                      </div>
                    )}
                  </td>
                  <td style={{padding: '10px 12px', fontWeight: 600, color: color.text}} onClick={() => openEdit(c.id)}>
                    {c.title}
                  </td>
                  <td style={{padding: '10px 12px', fontFamily: 'ui-monospace, monospace', fontSize: font.xs, color: color.textMuted}} onClick={() => openEdit(c.id)}>
                    {c.handle}
                  </td>
                  <td style={{padding: '10px 12px', textAlign: 'right', color: color.text}} onClick={() => openEdit(c.id)}>
                    {c.productsCount}
                  </td>
                  {/* patch 0149: 公開状態を視覚的に大型アイコンで表示 (文字を読まずに状態が分かる) */}
                  <td style={{padding: '10px 12px', textAlign: 'center'}} onClick={() => openEdit(c.id)}
                      title={
                        c.publishedCount === undefined
                          ? '公開状態を取得できませんでした'
                          : c.publishedCount === 0
                            ? `非公開 (お客様に見えていません)`
                            : c.totalChannels && c.publishedCount < c.totalChannels
                              ? `一部公開 (${c.publishedCount}/${c.totalChannels} チャネル)`
                              : `公開中 (${c.publishedCount} チャネル全部)`
                      }>
                    {c.publishedCount === undefined ? (
                      <span style={{fontSize: 22, opacity: 0.4}}>⚪</span>
                    ) : c.publishedCount === 0 ? (
                      <span style={{fontSize: 22}} aria-label="非公開">🔴</span>
                    ) : c.totalChannels && c.publishedCount < c.totalChannels ? (
                      <span style={{fontSize: 22}} aria-label={`一部公開 ${c.publishedCount}/${c.totalChannels}`}>🟡</span>
                    ) : (
                      <span style={{fontSize: 22}} aria-label="公開中">🟢</span>
                    )}
                  </td>
                  <td style={{padding: '10px 12px'}} onClick={() => openEdit(c.id)}>
                    {c.ruleSet ? (
                      <span style={{padding: '2px 8px', background: 'rgba(0,240,255,.12)', color: color.cyan, borderRadius: radius.sm, fontSize: font.xs, fontWeight: 600}}>
                        スマート ({c.ruleSet.rules.length}件)
                      </span>
                    ) : (
                      <span style={{padding: '2px 8px', background: color.bg0, color: color.textMuted, borderRadius: radius.sm, fontSize: font.xs}}>
                        手動
                      </span>
                    )}
                  </td>
                  <td style={{padding: '10px 12px', color: color.textMuted, fontSize: font.xs}} onClick={() => openEdit(c.id)}>
                    {new Date(c.updatedAt).toLocaleDateString('ja-JP')}
                  </td>
                  <td style={{padding: '10px 12px', whiteSpace: 'nowrap'}}>
                    <button onClick={() => openEdit(c.id)} style={{...btnOutline, padding: '6px 12px', fontSize: font.xs, marginRight: 6}}>
                      編集
                    </button>
                    <button onClick={() => handleDelete(c.id, c.title)} style={btnDanger}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            </div>
          );

          return (
            <>
              {/* 上部 chip ナビ: 製品群件数で全体像を即把握 */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: 14,
                  padding: 10,
                  background: color.bg0,
                  border: `1px solid ${color.border}`,
                  borderRadius: radius.md,
                  fontSize: font.xs,
                }}
              >
                <span style={{color: color.textMuted, alignSelf: 'center', marginRight: 4}}>📂 製品群:</span>
                {groupsWithItems.map((g) => {
                  const meta = PRODUCT_GROUP_META[g];
                  const data = hierarchy.get(g)!;
                  const total = data.items.length + Array.from(data.subGroups.values()).reduce((s, a) => s + a.length, 0);
                  return (
                    <a
                      key={g}
                      href={`#group-${g}`}
                      style={{
                        padding: '3px 10px',
                        background: color.bg1,
                        border: `1px solid ${color.border}`,
                        borderRadius: 999,
                        color: color.text,
                        textDecoration: 'none',
                        fontWeight: 600,
                      }}
                    >
                      {meta.icon} {meta.label}: {total}
                    </a>
                  );
                })}
              </div>

              {/* 製品群ごとに section render */}
              {groupsWithItems.map((g) => {
                const meta = PRODUCT_GROUP_META[g];
                const data = hierarchy.get(g)!;
                const total = data.items.length + Array.from(data.subGroups.values()).reduce((s, a) => s + a.length, 0);
                // sub key 順序: 商品数 (group 内合計) 降順
                const subKeysSorted = Array.from(data.subGroups.entries())
                  .sort((a, b) => {
                    const ac = a[1].reduce((s, c) => s + (c.productsCount ?? 0), 0);
                    const bc = b[1].reduce((s, c) => s + (c.productsCount ?? 0), 0);
                    return bc - ac;
                  });
                return (
                  <section key={g} id={`group-${g}`} style={{marginBottom: space[5]}}>
                    {/* 製品群ヘッダー: アイコン + ラベル + ユーザーメリット */}
                    <header
                      style={{
                        padding: '14px 16px',
                        background: color.bg2,
                        borderRadius: `${radius.md}px ${radius.md}px 0 0`,
                        borderLeft: `4px solid ${color.cyan}`,
                      }}
                    >
                      <div style={{display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap'}}>
                        <h3 style={{margin: 0, fontSize: 18, fontWeight: 800, color: color.text}}>
                          {meta.icon} {meta.label}
                        </h3>
                        <span style={{fontSize: font.xs, color: color.textMuted, fontWeight: 600}}>
                          {total} 件
                        </span>
                        <span style={{fontSize: font.xs, color: color.textMuted, marginLeft: 'auto'}}>
                          ↓ 商品数の多い順
                        </span>
                      </div>
                      <p style={{
                        margin: '6px 0 0',
                        fontSize: 12,
                        color: color.cyan,
                        lineHeight: 1.5,
                        fontWeight: 600,
                      }}>
                        💡 お客様メリット: {meta.userBenefit}
                      </p>
                    </header>

                    {/* sub-group なし items (= 製品群直接所属) */}
                    {data.items.length > 0 && (
                      <div style={{marginTop: 0, borderTop: `1px solid ${color.border}`}}>
                        {renderTable(data.items)}
                      </div>
                    )}

                    {/* sub-groups (IP別 or 製品ジャンル別) */}
                    {subKeysSorted.map(([subKey, items]) => (
                      <div key={subKey} style={{marginTop: 8}}>
                        <div
                          style={{
                            padding: '8px 14px',
                            background: color.bg1,
                            borderTop: `1px solid ${color.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span style={{fontSize: 13, fontWeight: 700, color: color.text}}>
                            {subKey}
                          </span>
                          <span style={{fontSize: 11, color: color.textMuted}}>
                            {items.length} 件
                          </span>
                        </div>
                        {renderTable(items)}
                      </div>
                    ))}
                  </section>
                );
              })}
            </>
          );
        })()
      )}

      {/* 編集/新規モーダル */}
      {editId && (
        <Modal
          title={editId === 'new' ? '＋ 新規コレクション' : `コレクションを編集: ${form.title}`}
          onClose={closeModal}
        >
          <div style={{display: 'grid', gap: 12}}>
            <div>
              <label style={labelStyle}>タイトル *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({...f, title: e.target.value}))}
                placeholder="例: ワンピース コラボ"
                style={inputStyle}
                autoFocus={editId === 'new'}
              />
            </div>

            <div>
              <label style={labelStyle}>
                URL (handle) {editId === 'new' ? '— 空欄なら自動生成' : ''}
              </label>
              <input
                type="text"
                value={form.handle}
                onChange={(e) => setForm((f) => ({...f, handle: e.target.value}))}
                placeholder="one-piece-collaboration"
                style={{...inputStyle, fontFamily: 'ui-monospace, monospace'}}
              />
              <div style={{fontSize: font.xs, color: color.textMuted, marginTop: 4}}>
                半角英数とハイフンのみ。既存コレクションの handle を変更すると URL が変わり SEO に影響します。
              </div>
            </div>

            <div>
              <label style={labelStyle}>説明文 (HTML可)</label>
              <textarea
                value={form.descriptionHtml}
                onChange={(e) => setForm((f) => ({...f, descriptionHtml: e.target.value}))}
                placeholder="コレクションページの先頭に表示される紹介文"
                style={{...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: font.family}}
              />
            </div>

            {/* 画像 */}
            <div>
              <label style={labelStyle}>ヒーロー画像 (1920×600px 推奨)</label>
              <div style={{display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap'}}>
                {form.imageUrl && (
                  <img
                    src={form.imageUrl}
                    alt={form.imageAlt}
                    style={{width: 120, height: 60, objectFit: 'cover', borderRadius: radius.sm, border: `1px solid ${color.border}`}}
                  />
                )}
                <input
                  type="text"
                  value={form.imageUrl}
                  onChange={(e) => setForm((f) => ({...f, imageUrl: e.target.value}))}
                  placeholder="https://cdn.shopify.com/... (URL 直接指定も可)"
                  style={{...inputStyle, flex: 1, minWidth: 200}}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleFileUpload}
                  style={{display: 'none'}}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  style={{...btnOutline, opacity: uploading ? 0.6 : 1}}
                >
                  {uploading ? 'アップ中...' : '📁 画像を選択'}
                </button>
              </div>
              {form.imageUrl && (
                <input
                  type="text"
                  value={form.imageAlt}
                  onChange={(e) => setForm((f) => ({...f, imageAlt: e.target.value}))}
                  placeholder="alt テキスト (アクセシビリティ・SEO)"
                  style={{...inputStyle, marginTop: 8}}
                />
              )}
            </div>

            {/* スマート条件 */}
            <div style={{...cardStyle, marginBottom: 0, background: color.bg0}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10}}>
                <input
                  id="cl-useRuleSet"
                  type="checkbox"
                  checked={form.useRuleSet}
                  onChange={(e) => setForm((f) => ({...f, useRuleSet: e.target.checked}))}
                />
                <label htmlFor="cl-useRuleSet" style={{fontSize: font.sm, fontWeight: 600, color: color.text, cursor: 'pointer'}}>
                  スマート条件で自動に商品を束ねる
                </label>
              </div>
              {form.useRuleSet && (
                <>
                  <div style={{marginBottom: 10, fontSize: font.xs, color: color.textMuted, lineHeight: 1.6}}>
                    条件を満たす商品が自動でこのコレクションに含まれます。<br />
                    例: 「商品タグ」「等しい」「one-piece」と設定すれば、one-piece タグの商品が自動所属します。
                  </div>
                  <div style={{marginBottom: 10}}>
                    <label style={{fontSize: font.xs, color: color.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 16}}>
                      <input
                        type="radio"
                        name="cl-rsMode"
                        checked={!form.appliedDisjunctively}
                        onChange={() => setForm((f) => ({...f, appliedDisjunctively: false}))}
                      />
                      すべての条件を満たす (AND)
                    </label>
                    <label style={{fontSize: font.xs, color: color.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6}}>
                      <input
                        type="radio"
                        name="cl-rsMode"
                        checked={form.appliedDisjunctively}
                        onChange={() => setForm((f) => ({...f, appliedDisjunctively: true}))}
                      />
                      いずれかを満たす (OR)
                    </label>
                  </div>
                  {form.rules.map((r, i) => (
                    <div key={i} style={{display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center'}}>
                      <select
                        value={r.column}
                        onChange={(e) => setForm((f) => ({...f, rules: f.rules.map((x, j) => j === i ? {...x, column: e.target.value} : x)}))}
                        style={{...inputStyle, width: 140}}
                      >
                        {COLUMN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <select
                        value={r.relation}
                        onChange={(e) => setForm((f) => ({...f, rules: f.rules.map((x, j) => j === i ? {...x, relation: e.target.value} : x)}))}
                        style={{...inputStyle, width: 120}}
                      >
                        {RELATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <input
                        type="text"
                        value={r.condition}
                        onChange={(e) => setForm((f) => ({...f, rules: f.rules.map((x, j) => j === i ? {...x, condition: e.target.value} : x)}))}
                        placeholder="値 (例: one-piece)"
                        style={{...inputStyle, flex: 1}}
                      />
                      {form.rules.length > 1 && (
                        <button
                          onClick={() => setForm((f) => ({...f, rules: f.rules.filter((_, j) => j !== i)}))}
                          style={btnDanger}
                          aria-label="このルールを削除"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => setForm((f) => ({...f, rules: [...f.rules, {column: 'TAG', relation: 'EQUALS', condition: ''}]}))}
                    style={{...btnOutline, fontSize: font.xs, padding: '6px 12px'}}
                  >
                    ＋ 条件を追加
                  </button>
                </>
              )}
            </div>

            {/* SEO */}
            <details>
              <summary style={{fontSize: font.sm, color: color.text, cursor: 'pointer', fontWeight: 600, padding: '6px 0'}}>
                🔎 SEO 設定 (任意)
              </summary>
              <div style={{display: 'grid', gap: 8, marginTop: 8}}>
                <input
                  type="text"
                  value={form.seoTitle}
                  onChange={(e) => setForm((f) => ({...f, seoTitle: e.target.value}))}
                  placeholder="SEO タイトル (検索結果の見出し)"
                  style={inputStyle}
                />
                <textarea
                  value={form.seoDescription}
                  onChange={(e) => setForm((f) => ({...f, seoDescription: e.target.value}))}
                  placeholder="SEO メタディスクリプション"
                  style={{...inputStyle, minHeight: 60, resize: 'vertical', fontFamily: font.family}}
                />
              </div>
            </details>

            {/* ボタン */}
            <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, borderTop: `1px solid ${color.border}`, paddingTop: 12}}>
              <button onClick={closeModal} style={btnOutline} disabled={saving}>
                キャンセル
              </button>
              <button onClick={handleSave} style={{...btnPrimary, opacity: saving ? 0.6 : 1}} disabled={saving}>
                {saving ? '保存中...' : editId === 'new' ? '作成する' : '保存する'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
