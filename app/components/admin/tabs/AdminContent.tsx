/**
 * AdminContent Tab — コンテンツ管理（記事・IPバナー・SEO記事）
 *
 * CMS API経由でMetaobjectのCRUD。
 * astromeda_article_content / astromeda_ip_banner / astromeda_seo_article
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { color, font, radius, space } from '~/lib/design-tokens';
import { CompactKPI } from '~/components/admin/CompactKPI';
import { Modal } from '~/components/admin/Modal';
import PreviewFrame, { type PreviewDevice } from '~/components/admin/preview/PreviewFrame';
import { CollabGrid, type MetaCollab } from '~/components/astro/CollabGrid';
import { T } from '~/lib/astromeda-data';
// patch 0048 (Phase A 適用): window.confirm() 置換用の Stripe 水準確認モーダル
import { useConfirmDialog } from '~/hooks/useConfirmDialog';
// patch 0073 (R2-3): canonical path unification — 非正規タブでの誘導バナー
import { CanonicalRedirectBanner } from '~/components/admin/ds/CanonicalRedirectBanner';
// patch 0074 (R1-2): Stripe/Apple 水準の Skeleton + CTA 付き EmptyState primitive
import { AdminListSkeleton, AdminEmptyCard } from '~/components/admin/ds/InlineListState';
// patch 0087: useToast 統合プリミティブ
import { useToast } from '~/components/admin/ds/Toast';
import { TabHeaderHint } from '~/components/admin/ds/TabHeaderHint';

// ── Article/SEO 用軽量プレビュー ──
function ArticlePreview({title, body, excerpt, author, tags, metaDesc}: {
  title: string;
  body: string;
  excerpt?: string;
  author?: string;
  tags?: string;
  metaDesc?: string;
}) {
  return (
    <article style={{
      background: T.bg,
      color: T.tx,
      padding: 'clamp(16px, 3vw, 32px)',
      fontFamily: font.family,
      lineHeight: 1.7,
    }}>
      {metaDesc && (
        <div style={{
          background: 'rgba(0,240,255,0.08)',
          border: '1px dashed rgba(0,240,255,0.3)',
          borderRadius: 6, padding: '8px 12px', marginBottom: 20,
          fontSize: 11, color: '#9ad',
        }}>
          <div style={{fontSize: 9, color: '#6cf', marginBottom: 2, fontWeight: 700}}>検索結果プレビュー</div>
          <div>{metaDesc}</div>
        </div>
      )}
      <h1 style={{fontSize: 'clamp(22px, 4vw, 34px)', fontWeight: 900, margin: '0 0 12px', lineHeight: 1.3}}>
        {title || '(タイトル未入力)'}
      </h1>
      <div style={{fontSize: 12, color: '#888', marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap'}}>
        {author && <span>✒️ {author}</span>}
        {tags && <span>🏷 {tags.split(',').slice(0, 3).join(' · ')}</span>}
      </div>
      {excerpt && (
        <div style={{
          fontSize: 14, color: '#bbb',
          borderLeft: '3px solid #06f', paddingLeft: 12, marginBottom: 20,
          fontStyle: 'italic',
        }}>
          {excerpt}
        </div>
      )}
      <div
        style={{fontSize: 14, color: '#ddd'}}
        dangerouslySetInnerHTML={{__html: body || '<p style="color:#666">(本文未入力)</p>'}}
      />
    </article>
  );
}

// ── Types ──
interface MetaobjectNode {
  id: string;
  handle: string;
  type: string;
  updatedAt?: string;
  [key: string]: string | undefined;
}

type SubTab = 'articles' | 'banners' | 'seo';

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

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  fontSize: font.sm,
  fontWeight: active ? 700 : 500,
  color: active ? '#000' : color.cyan,
  background: active ? color.cyan : 'transparent',
  border: `1px solid ${active ? color.cyan : 'rgba(0,240,255,.3)'}`,
  borderRadius: radius.md,
  cursor: 'pointer',
  fontFamily: font.family,
});

const btnPrimary: React.CSSProperties = {
  padding: '8px 20px',
  background: color.cyan,
  color: '#000',
  border: 'none',
  borderRadius: radius.md,
  fontSize: font.sm,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: font.family,
};

const btnDanger: React.CSSProperties = {
  padding: '6px 12px',
  background: color.red,
  color: '#fff',
  border: 'none',
  borderRadius: radius.md,
  fontSize: font.xs,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: font.family,
};

const btnOutline: React.CSSProperties = {
  padding: '6px 14px',
  background: 'transparent',
  color: color.cyan,
  border: `1px solid rgba(0,240,255,.3)`,
  borderRadius: radius.md,
  fontSize: font.xs,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: font.family,
};

// ── CMS API helpers ──
async function cmsGet(type: string): Promise<MetaobjectNode[]> {
  const res = await fetch(`/api/admin/cms?type=${type}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const json = await res.json();
  return json.items ?? [];
}

async function cmsPost(body: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('/api/admin/cms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Toast ──
// patch 0087: ローカル Toast は ~/components/admin/ds/Toast に統合

// ══════════════════════════════════
// ① ArticleList — 記事コンテンツ CRUD
// ══════════════════════════════════
function ArticleList({ onToast }: { onToast: (m: string, t: 'ok' | 'err') => void }) {
  const [items, setItems] = useState<MetaobjectNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');
  // patch 0048: window.confirm 置換用
  const {confirm: confirmDialog, dialogProps, ConfirmDialog: Dialog} = useConfirmDialog();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await cmsGet('astromeda_article_content');
      setItems(data);
    } catch {
      onToast('記事取得失敗', 'err');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const startEdit = (item: MetaobjectNode) => {
    setEditId(item.id);
    setForm({
      title: item.title || '',
      slug: item.slug || '',
      content_type: item.content_type || 'article',
      body_html: item.body_html || '',
      excerpt: item.excerpt || '',
      status: item.status || 'draft',
      author: item.author || '',
      tags: item.tags || '',
      display_order: item.display_order || '0',
    });
  };

  const startCreate = () => {
    setEditId('__new__');
    setForm({
      title: '',
      slug: '',
      content_type: 'article',
      body_html: '',
      excerpt: '',
      status: 'draft',
      author: '',
      tags: '',
      display_order: '0',
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fields = Object.entries(form).map(([key, value]) => ({ key, value }));
      if (editId === '__new__') {
        const handle = `article-${form.slug || form.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || Date.now()}`;
        const r = await cmsPost({ type: 'astromeda_article_content', action: 'create', handle, fields });
        if (!r.success) throw new Error(r.error);
        onToast('記事作成完了', 'ok');
      } else {
        const r = await cmsPost({ type: 'astromeda_article_content', action: 'update', id: editId, fields });
        if (!r.success) throw new Error(r.error);
        onToast('記事保存完了', 'ok');
      }
      setEditId(null);
      await fetchData();
    } catch (e) {
      onToast(e instanceof Error ? e.message : '保存失敗', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: 'この記事を削除しますか？',
      message: 'この操作は取り消せません。',
      confirmLabel: '削除する',
      destructive: true,
      contextPath: ['コマース', '📝 コンテンツ・ページ', '📄 記事・CMS', '記事コンテンツ'],
    });
    if (!ok) return;
    // patch 0114: P1-4 サーバ Zod が confirm:true を要求（誤削除防止）
    const r = await cmsPost({ type: 'astromeda_article_content', action: 'delete', id, confirm: true });
    if (r.success) { onToast('記事削除完了', 'ok'); await fetchData(); }
    else onToast(r.error || '削除失敗', 'err');
  };

  if (loading) return <AdminListSkeleton rows={5} />;

  const statusColor = (s: string) =>
    s === 'published' ? color.green : s === 'review' ? color.yellow : color.textMuted;
  const statusLabel = (s: string) =>
    s === 'published' ? '公開中' : s === 'review' ? 'レビュー待ち' : '下書き';

  const previewPane = editId ? (
    <PreviewFrame device={previewDevice} onDeviceChange={setPreviewDevice}>
      <ArticlePreview
        title={form.title || ''}
        body={form.body_html || ''}
        excerpt={form.excerpt}
        author={form.author}
        tags={form.tags}
      />
    </PreviewFrame>
  ) : null;

  const modalTitle = editId === '__new__' ? '新規記事作成' : '記事編集';

  const editForm = (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>タイトル</label>
          <input style={inputStyle} value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="記事タイトル" />
        </div>
        <div>
          {/* patch 0085: 「スラッグ」→「URL 末尾（英数字）」 */}
          <label style={labelStyle}>URL 末尾（英数字）</label>
          <input style={inputStyle} value={form.slug || ''} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="例: gaming-pc-guide" />
        </div>
        <div>
          <label style={labelStyle}>タイプ</label>
          <select style={inputStyle} value={form.content_type || 'article'} onChange={(e) => setForm({ ...form, content_type: e.target.value })}>
            <option value="article">記事</option>
            <option value="guide">ガイド</option>
            <option value="news">ニュース</option>
            <option value="review">レビュー</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>ステータス</label>
          <select style={inputStyle} value={form.status || 'draft'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="draft">下書き</option>
            <option value="review">レビュー待ち</option>
            <option value="published">公開</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>著者</label>
          <input style={inputStyle} value={form.author || ''} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="著者名" />
        </div>
        <div>
          <label style={labelStyle}>タグ（カンマ区切り）</label>
          <input style={inputStyle} value={form.tags || ''} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="例: gaming,pc,guide" />
        </div>
        <div>
          <label style={labelStyle}>表示順</label>
          <input style={inputStyle} type="number" value={form.display_order || '0'} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>概要</label>
        <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={form.excerpt || ''} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} placeholder="記事の概要（検索結果に表示）" />
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>本文HTML</label>
        <textarea style={{ ...inputStyle, fontFamily: font.mono, fontSize: font.xs, resize: 'vertical' }} rows={10} value={form.body_html || ''} onChange={(e) => setForm({ ...form, body_html: e.target.value })} placeholder="<p>本文をHTMLで入力...</p>" />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${color.border}` }}>
        <button onClick={handleSave} disabled={saving} style={btnPrimary}>
          {saving ? '保存中...' : editId === '__new__' ? '作成' : '保存'}
        </button>
        <button onClick={() => setEditId(null)} style={btnOutline}>キャンセル</button>
      </div>
      <div style={{ fontSize: 11, color: color.textMuted, marginTop: 12, padding: 10, background: color.bg0, borderRadius: 6 }}>
        💡 右側プレビューは実際の記事ページと同じスタイルでリアルタイム反映されます。
      </div>
    </>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <CompactKPI label="記事数" value={String(items.length)} />
          <CompactKPI label="公開中" value={String(items.filter(i => i.status === 'published').length)} accent={color.green} />
        </div>
        <button onClick={startCreate} style={btnOutline}>+ 新規記事</button>
      </div>

      {editId && (
        <Modal title={modalTitle} onClose={() => setEditId(null)} preview={previewPane} maxWidth={1400}>
          {editForm}
        </Modal>
      )}

      {items.length === 0 ? (
        <AdminEmptyCard
          icon="📝"
          title="記事はまだありません"
          description="最初の記事を作成してサイトに公開してみましょう。"
          action={<button onClick={startCreate} style={btnPrimary}>＋ 新しい記事を作る</button>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item) => (
            <div key={item.id} style={{
              ...cardStyle,
              marginBottom: 0,
              padding: '12px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: color.text }}>
                  {item.title || item.handle}
                </div>
                <div style={{ fontSize: 11, color: color.textMuted, marginTop: 2 }}>
                  {item.content_type || 'article'}
                  {item.author && ` · ${item.author}`}
                  {item.tags && ` · ${item.tags}`}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 10, padding: '3px 10px', borderRadius: 20, fontWeight: 700,
                  background: `${statusColor(item.status || 'draft')}20`,
                  color: statusColor(item.status || 'draft'),
                }}>
                  {statusLabel(item.status || 'draft')}
                </span>
                <button onClick={() => startEdit(item)} style={btnOutline}>編集</button>
                <button onClick={() => handleDelete(item.id)} style={btnDanger}>削除</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog {...dialogProps} />
    </div>
  );
}

// ══════════════════════════════════
// ② BannerList — IPバナー CRUD
// ══════════════════════════════════
function BannerList({ onToast }: { onToast: (m: string, t: 'ok' | 'err') => void }) {
  const [items, setItems] = useState<MetaobjectNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');
  // patch 0048: window.confirm 置換用
  const {confirm: confirmDialog, dialogProps, ConfirmDialog: Dialog} = useConfirmDialog();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await cmsGet('astromeda_ip_banner');
      setItems(data.sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0)));
    } catch {
      onToast('IPバナー取得失敗', 'err');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const startEdit = (item: MetaobjectNode) => {
    setEditId(item.id);
    setForm({
      ip_name: item.ip_name || '',
      collection_handle: item.collection_handle || '',
      tagline: item.tagline || '',
      label: item.label || '',
      accent_color: item.accent_color || '#00F0FF',
      is_featured: item.is_featured || 'false',
      display_order: item.display_order || '0',
      is_active: item.is_active || 'true',
    });
  };

  const startCreate = () => {
    setEditId('__new__');
    setForm({
      ip_name: '',
      collection_handle: '',
      tagline: '',
      label: 'NEW',
      accent_color: '#00F0FF',
      is_featured: 'false',
      display_order: String(items.length),
      is_active: 'true',
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fields = Object.entries(form).map(([key, value]) => ({ key, value }));
      if (editId === '__new__') {
        const handle = `ip-${form.collection_handle || form.ip_name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || Date.now()}`;
        const r = await cmsPost({ type: 'astromeda_ip_banner', action: 'create', handle, fields });
        if (!r.success) throw new Error(r.error);
        onToast('IPバナー作成完了', 'ok');
      } else {
        const r = await cmsPost({ type: 'astromeda_ip_banner', action: 'update', id: editId, fields });
        if (!r.success) throw new Error(r.error);
        onToast('IPバナー保存完了', 'ok');
      }
      setEditId(null);
      await fetchData();
    } catch (e) {
      onToast(e instanceof Error ? e.message : '保存失敗', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: 'このIPバナーを削除しますか？',
      message: 'この操作は取り消せません。',
      confirmLabel: '削除する',
      destructive: true,
      contextPath: ['コマース', '📝 コンテンツ・ページ', '📄 記事・CMS', 'IPバナー'],
    });
    if (!ok) return;
    // patch 0114: P1-4 サーバ Zod が confirm:true を要求（誤削除防止）
    const r = await cmsPost({ type: 'astromeda_ip_banner', action: 'delete', id, confirm: true });
    if (r.success) { onToast('IPバナー削除完了', 'ok'); await fetchData(); }
    else onToast(r.error || '削除失敗', 'err');
  };

  if (loading) return <AdminListSkeleton rows={5} />;

  // ── プレビュー用: 全items + 編集中itemをform値で上書き / 新規追加中は末尾に合成item追加 ──
  const previewMetaCollabs: MetaCollab[] = items.map((item) => {
    const useForm = editId === item.id;
    return {
      id: item.id,
      handle: item.handle,
      name: (useForm ? form.ip_name : item.ip_name) || '(未入力)',
      shopHandle: (useForm ? form.collection_handle : item.collection_handle) || '',
      image: null,
      tagline: (useForm ? form.tagline : item.tagline) || null,
      label: (useForm ? form.label : item.label) || null,
      sortOrder: Number((useForm ? form.display_order : item.display_order) || 99),
      featured: (useForm ? form.is_featured : item.is_featured) === 'true',
    };
  });
  if (editId === '__new__') {
    previewMetaCollabs.push({
      id: 'preview-new',
      handle: 'preview-new',
      name: form.ip_name || '(新規)',
      shopHandle: form.collection_handle || '',
      image: null,
      tagline: form.tagline || null,
      label: form.label || null,
      sortOrder: Number(form.display_order || items.length + 1),
      featured: form.is_featured === 'true',
    });
  }
  const previewPane = editId ? (
    <PreviewFrame device={previewDevice} onDeviceChange={setPreviewDevice}>
      <div style={{background: T.bg, padding: 'clamp(8px, 2vw, 16px)'}}>
        <CollabGrid collections={null} metaCollabs={previewMetaCollabs} />
      </div>
    </PreviewFrame>
  ) : null;

  const modalTitle = editId === '__new__' ? '新規IPバナー' : 'IPバナー編集';

  const editForm = (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>IP名</label>
          <input style={inputStyle} value={form.ip_name || ''} onChange={(e) => setForm({ ...form, ip_name: e.target.value })} placeholder="例: 呪術廻戦" />
        </div>
        <div>
          {/* patch 0085: 「コレクションハンドル」→「商品グループ URL」 */}
          <label style={labelStyle}>商品グループ URL</label>
          <input style={inputStyle} value={form.collection_handle || ''} onChange={(e) => setForm({ ...form, collection_handle: e.target.value })} placeholder="例: jujutsukaisen-collaboration" />
        </div>
        <div>
          <label style={labelStyle}>タグライン</label>
          <input style={inputStyle} value={form.tagline || ''} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="例: 領域展開" />
        </div>
        <div>
          <label style={labelStyle}>ラベル</label>
          <input style={inputStyle} value={form.label || ''} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="例: NEW / HOT / SALE" />
        </div>
        <div>
          <label style={labelStyle}>アクセントカラー</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="color" value={form.accent_color || '#00F0FF'} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} style={{ width: 40, height: 32, border: 'none', cursor: 'pointer', borderRadius: 4 }} />
            <input style={{ ...inputStyle, flex: 1 }} value={form.accent_color || ''} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>表示順</label>
          <input style={inputStyle} type="number" value={form.display_order || '0'} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
        </div>
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.is_featured === 'true'} onChange={(e) => setForm({ ...form, is_featured: String(e.target.checked) })} style={{ width: 16, height: 16, accentColor: color.cyan }} />
          <span style={{ fontSize: font.sm, color: color.text }}>注目IP</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.is_active === 'true'} onChange={(e) => setForm({ ...form, is_active: String(e.target.checked) })} style={{ width: 16, height: 16, accentColor: color.cyan }} />
          <span style={{ fontSize: font.sm, color: color.text }}>表示中</span>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${color.border}` }}>
        <button onClick={handleSave} disabled={saving} style={btnPrimary}>
          {saving ? '保存中...' : editId === '__new__' ? '作成' : '保存'}
        </button>
        <button onClick={() => setEditId(null)} style={btnOutline}>キャンセル</button>
      </div>
      <div style={{ fontSize: 11, color: color.textMuted, marginTop: 12, padding: 10, background: color.bg0, borderRadius: 6 }}>
        💡 右側プレビューはトップページのIPコラボグリッド全体を表示。編集中のIPはフォーム入力で即時反映されます。
      </div>
    </>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <CompactKPI label="IPバナー" value={String(items.length)} />
          <CompactKPI label="表示中" value={String(items.filter(i => i.is_active === 'true').length)} accent={color.green} />
          <CompactKPI label="注目" value={String(items.filter(i => i.is_featured === 'true').length)} accent={color.cyan} />
        </div>
        <button onClick={startCreate} style={btnOutline}>+ 新規IP</button>
      </div>

      {editId && (
        <Modal title={modalTitle} onClose={() => setEditId(null)} preview={previewPane} maxWidth={1400}>
          {editForm}
        </Modal>
      )}

      {items.length === 0 ? (
        <AdminEmptyCard
          icon="🖼️"
          title="IPバナーが未登録です"
          description="トップページの IPコラボグリッドに表示するバナーを追加しましょう。"
          action={<button onClick={startCreate} style={btnPrimary}>＋ 新しいIPバナーを作る</button>}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {items.map((item) => (
            <div key={item.id} style={{
              ...cardStyle,
              marginBottom: 0,
              padding: 0,
              overflow: 'hidden',
              opacity: item.is_active === 'true' ? 1 : 0.5,
              borderColor: item.is_featured === 'true' ? color.cyan : color.border,
            }}>
              <div style={{
                height: 60,
                background: `linear-gradient(135deg, ${item.accent_color || '#1a1a3e'}40, ${color.bg2})`,
                display: 'flex',
                alignItems: 'center',
                padding: '0 12px',
              }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: color.text }}>
                  {item.ip_name || item.handle}
                </span>
                {item.label && (
                  <span style={{
                    marginLeft: 8, fontSize: 9, fontWeight: 700, padding: '2px 6px',
                    background: item.accent_color || color.cyan, color: '#000', borderRadius: 4,
                  }}>
                    {item.label}
                  </span>
                )}
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: color.textMuted, marginBottom: 6 }}>
                  {item.collection_handle || '（URL 未設定）'}
                  {item.tagline && ` · ${item.tagline}`}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => startEdit(item)} style={btnOutline}>編集</button>
                  <button onClick={() => handleDelete(item.id)} style={btnDanger}>削除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog {...dialogProps} />
    </div>
  );
}

// ══════════════════════════════════
// ③ SEOArticleList — SEO記事 CRUD
// ══════════════════════════════════
function SEOArticleList({ onToast }: { onToast: (m: string, t: 'ok' | 'err') => void }) {
  const [items, setItems] = useState<MetaobjectNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');
  // patch 0048: window.confirm 置換用
  const {confirm: confirmDialog, dialogProps, ConfirmDialog: Dialog} = useConfirmDialog();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await cmsGet('astromeda_seo_article');
      setItems(data);
    } catch {
      onToast('SEO記事取得失敗', 'err');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const startEdit = (item: MetaobjectNode) => {
    setEditId(item.id);
    setForm({
      title: item.title || '',
      slug: item.slug || '',
      target_keyword: item.target_keyword || '',
      meta_description: item.meta_description || '',
      body_html: item.body_html || '',
      schema_json: item.schema_json || '{}',
      status: item.status || 'draft',
      display_order: item.display_order || '0',
    });
  };

  const startCreate = () => {
    setEditId('__new__');
    setForm({
      title: '', slug: '', target_keyword: '', meta_description: '',
      body_html: '', schema_json: '{}', status: 'draft', display_order: '0',
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fields = Object.entries(form).map(([key, value]) => ({ key, value }));
      if (editId === '__new__') {
        const handle = `seo-${form.slug || Date.now()}`;
        const r = await cmsPost({ type: 'astromeda_seo_article', action: 'create', handle, fields });
        if (!r.success) throw new Error(r.error);
        onToast('SEO記事作成完了', 'ok');
      } else {
        const r = await cmsPost({ type: 'astromeda_seo_article', action: 'update', id: editId, fields });
        if (!r.success) throw new Error(r.error);
        onToast('SEO記事保存完了', 'ok');
      }
      setEditId(null);
      await fetchData();
    } catch (e) {
      onToast(e instanceof Error ? e.message : '保存失敗', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: 'このSEO記事を削除しますか？',
      message: 'この操作は取り消せません。',
      confirmLabel: '削除する',
      destructive: true,
      contextPath: ['コマース', '📝 コンテンツ・ページ', '📄 記事・CMS', 'SEO記事'],
    });
    if (!ok) return;
    // patch 0114: P1-4 サーバ Zod が confirm:true を要求（誤削除防止）
    const r = await cmsPost({ type: 'astromeda_seo_article', action: 'delete', id, confirm: true });
    if (r.success) { onToast('SEO記事削除完了', 'ok'); await fetchData(); }
    else onToast(r.error || '削除失敗', 'err');
  };

  if (loading) return <AdminListSkeleton rows={5} />;

  const previewPane = editId ? (
    <PreviewFrame device={previewDevice} onDeviceChange={setPreviewDevice}>
      <ArticlePreview
        title={form.title || ''}
        body={form.body_html || ''}
        excerpt={form.target_keyword ? `🎯 ターゲット: ${form.target_keyword}` : undefined}
        metaDesc={form.meta_description}
      />
    </PreviewFrame>
  ) : null;

  const modalTitle = editId === '__new__' ? '新規SEO記事' : 'SEO記事編集';

  const editForm = (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>タイトル</label>
          <input style={inputStyle} value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="SEO記事タイトル" />
        </div>
        <div>
          {/* patch 0085: 「スラッグ」→「URL 末尾（英数字）」 */}
          <label style={labelStyle}>URL 末尾（英数字）</label>
          <input style={inputStyle} value={form.slug || ''} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="例: best-gaming-pc-2026" />
        </div>
        <div>
          <label style={labelStyle}>ターゲットキーワード</label>
          <input style={inputStyle} value={form.target_keyword || ''} onChange={(e) => setForm({ ...form, target_keyword: e.target.value })} placeholder="例: ゲーミングPC おすすめ" />
        </div>
        <div>
          <label style={labelStyle}>ステータス</label>
          <select style={inputStyle} value={form.status || 'draft'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="draft">下書き</option>
            <option value="review">レビュー待ち</option>
            <option value="published">公開</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>表示順</label>
          <input style={inputStyle} type="number" value={form.display_order || '0'} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>メタディスクリプション</label>
        <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={form.meta_description || ''} onChange={(e) => setForm({ ...form, meta_description: e.target.value })} placeholder="検索結果に表示される説明文（120文字以内推奨）" />
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>本文HTML</label>
        <textarea style={{ ...inputStyle, fontFamily: font.mono, fontSize: font.xs, resize: 'vertical' }} rows={10} value={form.body_html || ''} onChange={(e) => setForm({ ...form, body_html: e.target.value })} />
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>構造化データJSON</label>
        <textarea style={{ ...inputStyle, fontFamily: font.mono, fontSize: font.xs, resize: 'vertical' }} rows={4} value={form.schema_json || '{}'} onChange={(e) => setForm({ ...form, schema_json: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${color.border}` }}>
        <button onClick={handleSave} disabled={saving} style={btnPrimary}>
          {saving ? '保存中...' : editId === '__new__' ? '作成' : '保存'}
        </button>
        <button onClick={() => setEditId(null)} style={btnOutline}>キャンセル</button>
      </div>
      <div style={{ fontSize: 11, color: color.textMuted, marginTop: 12, padding: 10, background: color.bg0, borderRadius: 6 }}>
        💡 右側プレビューはGoogle検索結果（上部）と記事ページの見た目をリアルタイム反映。
      </div>
    </>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <CompactKPI label="SEO記事" value={String(items.length)} />
        <button onClick={startCreate} style={btnOutline}>+ 新規SEO記事</button>
      </div>

      {editId && (
        <Modal title={modalTitle} onClose={() => setEditId(null)} preview={previewPane} maxWidth={1400}>
          {editForm}
        </Modal>
      )}

      {items.length === 0 ? (
        <AdminEmptyCard
          icon="🔍"
          title="SEO記事はまだありません"
          description="検索流入を増やす SEO 記事を作成しましょう。"
          action={<button onClick={startCreate} style={btnPrimary}>＋ 新しいSEO記事を作る</button>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item) => (
            <div key={item.id} style={{
              ...cardStyle, marginBottom: 0, padding: '12px 16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: color.text }}>{item.title || item.handle}</div>
                <div style={{ fontSize: 11, color: color.textMuted, marginTop: 2 }}>
                  {item.target_keyword && `🎯 ${item.target_keyword}`}
                  {item.slug && ` · /${item.slug}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => startEdit(item)} style={btnOutline}>編集</button>
                <button onClick={() => handleDelete(item.id)} style={btnDanger}>削除</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog {...dialogProps} />
    </div>
  );
}

// ══════════════════════════════════
// Main Component
// ══════════════════════════════════
export default function AdminContent() {
  const [tab, setTab] = useState<SubTab>('articles');
  // patch 0087: useToast 統合プリミティブで variant 別 duration (error=6.5s)
  const { pushToast, Toast } = useToast();

  const showToast = useCallback(
    (msg: string, type: 'ok' | 'err') => pushToast(msg, type),
    [pushToast],
  );

  return (
    <div>
    {/* patch 0119 (Apple CEO ライフサイクル監査): 高校生向け 1 行説明 */}
    <TabHeaderHint
      title="記事・お知らせ"
      description="ブログ記事や新商品のお知らせ、IPコラボの紹介ページなどを書きます。"
      relatedTabs={[{label: 'お店の見た目を変える', tab: 'pageEditor'}, {label: '商品を作る・直す', tab: 'products'}]}
    />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: color.text, margin: 0 }}>
          コンテンツ管理
        </h2>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button onClick={() => setTab('articles')} style={tabStyle(tab === 'articles')}>
          記事コンテンツ
        </button>
        <button onClick={() => setTab('banners')} style={tabStyle(tab === 'banners')}>
          IPバナー
        </button>
        <button onClick={() => setTab('seo')} style={tabStyle(tab === 'seo')}>
          SEO記事
        </button>
      </div>

      {tab === 'articles' && <ArticleList onToast={showToast} />}
      {tab === 'banners' && (
        <>
          <CanonicalRedirectBanner
            metaobjectType="astromeda_ip_banner"
            currentTab="content"
            note="ここでも編集できますが、トップページのレイアウト全体をビジュアル確認しながら編集したい場合は「ビジュアル編集」タブが便利です。"
          />
          <BannerList onToast={showToast} />
        </>
      )}
      {tab === 'seo' && <SEOArticleList onToast={showToast} />}

      <Toast />
      {/* patch 0087: useToast が自前で render する */}
    </div>
  );
}
