/**
 * AdminProductContent — 製品コンテンツ admin CRUD タブ (patch 0194)
 *
 * CEO P0 「Apple CEO 水準」「高校生でも出品できる」要求への対応:
 * 商品ページ下段の「製品コンテンツ」(画像+H2+説明 HTML) を admin だけで作成・編集できる。
 * 商品の tags に target_tag が含まれると storefront 商品ページ下段に自動表示される
 * (loader matching は patch 0192 で実装済)。
 *
 * 「Apple Just Works」原則:
 *   - 1 ボタンで「+ 新しい製品コンテンツ」モーダル
 *   - 必要最小限の入力欄: 対象タグ / 見出し / 画像 / 本文 HTML
 *   - リアルタイムプレビュー (右ペイン)
 *   - 一覧で is_active バッジ + 編集/削除ボタン
 */
import {useEffect, useState, useMemo, useCallback} from 'react';
import {color, radius, space} from '~/lib/design-tokens';
import {useToast} from '~/components/admin/ds/Toast';
import {useConfirmDialog} from '~/hooks/useConfirmDialog';
import {ConfirmDialog} from '~/components/admin/ds/ConfirmDialog';
import {AdminListSkeleton, AdminEmptyCard} from '~/components/admin/ds/InlineListState';
import {TabHeaderHint} from '~/components/admin/ds/TabHeaderHint';
import {ImagePicker} from '~/components/admin/ds/ImagePicker';
import {RichTextEditor} from '~/components/admin/ds/RichTextEditor';
import TagPicker from '~/components/admin/TagPicker';

interface ContentItem {
  id: string;
  handle: string;
  targetTag: string;
  heading: string;
  contentHtml: string;
  imageUrl: string;
  displayOrder: number;
  isActive: boolean;
  updatedAt: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', background: color.bg0,
  color: color.text, border: `1px solid ${color.border}`,
  borderRadius: 4, fontSize: 13,
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700,
  color: color.text, marginBottom: 4, marginTop: 12,
};

function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  return document.querySelector<HTMLMetaElement>('meta[name="_csrf"]')?.content || '';
}

async function loadAll(): Promise<ContentItem[]> {
  const r = await fetch('/api/admin/cms?type=astromeda_product_content');
  const j = await r.json();
  return ((j.items || []) as Array<Record<string, string>>).map((i) => ({
    id: i.id, handle: i.handle,
    targetTag: i.target_tag || '', heading: i.heading || '',
    contentHtml: i.content_html || '', imageUrl: i.image_url || '',
    displayOrder: parseInt(i.display_order || '0', 10),
    isActive: i.is_active === 'true',
    updatedAt: i.updatedAt || '',
  })).sort((a, b) => a.displayOrder - b.displayOrder);
}

export default function AdminProductContent() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [isNew, setIsNew] = useState(false);
  const {showToast, Toast} = useToast();
  const {confirm, dialogProps} = useConfirmDialog();

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setItems(await loadAll()); } catch (e) {
      showToast(`読み込み失敗: ${(e as Error).message}`, 'error');
    } finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { refresh(); }, [refresh]);

  const onNew = () => {
    setEditing({
      id: '', handle: '',
      targetTag: '', heading: '',
      contentHtml: '<p></p>', imageUrl: '',
      displayOrder: 10, isActive: true,
      updatedAt: '',
    });
    setIsNew(true);
  };
  const onEdit = (it: ContentItem) => { setEditing({...it}); setIsNew(false); };
  const onCancel = () => { setEditing(null); setIsNew(false); };

  const onSave = async () => {
    if (!editing) return;
    if (!editing.targetTag.trim()) { showToast('対象タグを入力してください', 'error'); return; }
    const csrf = getCsrfToken();
    const fields = [
      {key: 'target_tag', value: editing.targetTag.trim()},
      {key: 'heading', value: editing.heading},
      {key: 'content_html', value: editing.contentHtml},
      {key: 'image_url', value: editing.imageUrl},
      {key: 'display_order', value: String(editing.displayOrder)},
      {key: 'is_active', value: editing.isActive ? 'true' : 'false'},
    ];
    try {
      const body: Record<string, unknown> = {action: isNew ? 'create' : 'update', type: 'astromeda_product_content', fields};
      if (isNew) body.handle = `pc-${Date.now()}`;
      else body.id = editing.id;
      const r = await fetch('/api/admin/cms', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify(body)});
      const j = await r.json();
      if (!j.success) throw new Error(j.error || '保存失敗');
      showToast(isNew ? '✅ 新規作成しました' : '✅ 更新しました', 'success');
      setEditing(null); setIsNew(false);
      await refresh();
    } catch (e) {
      showToast(`保存失敗: ${(e as Error).message}`, 'error');
    }
  };

  const onDelete = async (it: ContentItem) => {
    const ok = await confirm({title: '削除しますか？', message: `「${it.heading || it.handle}」を削除します。元に戻せません。`, confirmLabel: '削除', confirmVariant: 'destructive'});
    if (!ok) return;
    const csrf = getCsrfToken();
    try {
      const r = await fetch('/api/admin/cms', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify({action: 'delete', type: 'astromeda_product_content', id: it.id, confirm: true})});
      const j = await r.json();
      if (!j.success) throw new Error(j.error || '削除失敗');
      showToast('🗑 削除しました', 'success');
      await refresh();
    } catch (e) { showToast(`削除失敗: ${(e as Error).message}`, 'error'); }
  };

  return (
    <div style={{maxWidth: 1400, margin: '0 auto'}}>
      <TabHeaderHint
        title="📝 製品コンテンツ (商品ページ下段の説明)"
        description="商品ごとの専用説明文 (画像+見出し+本文) を作成。商品に「対象タグ」と同じタグをつけると、その商品ページ下段に自動表示されます。"
        relatedTabs={[{label: 'タグ管理', tab: 'bulkTags'}, {label: '商品一覧', tab: 'products'}]}
      />
      <Toast />
      <ConfirmDialog {...dialogProps} />
      <div style={{display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
        <div style={{fontSize: 13, color: color.textSecondary}}>{items.length} 件の製品コンテンツ</div>
        <button onClick={onNew} style={{padding: '10px 20px', background: '#00b496', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 800, cursor: 'pointer', fontSize: 14}}>+ 新しい製品コンテンツ</button>
      </div>
      {loading ? <AdminListSkeleton rows={3} /> : items.length === 0 ? (
        <AdminEmptyCard icon="📝" title="まだ製品コンテンツがありません" description="「+ 新しい製品コンテンツ」を押して、商品ページ下段に表示する説明を作成しましょう。" />
      ) : (
        <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
          {items.map((it) => (
            <div key={it.id} style={{padding: 14, background: color.bg1, border: `1px solid ${color.border}`, borderRadius: radius.lg, display: 'flex', gap: 14, alignItems: 'center'}}>
              {it.imageUrl ? <img src={it.imageUrl} alt="" style={{width: 60, height: 60, objectFit: 'cover', borderRadius: 6}} /> : <div style={{width: 60, height: 60, background: color.bg0, borderRadius: 6}} />}
              <div style={{flex: 1}}>
                <div style={{fontSize: 14, fontWeight: 800, color: color.text, marginBottom: 4}}>{it.heading || '(見出し未設定)'}</div>
                <div style={{fontSize: 11, color: color.textSecondary}}>対象タグ: <code style={{background: color.bg0, padding: '2px 6px', borderRadius: 3}}>{it.targetTag}</code> / 順番 {it.displayOrder} {it.isActive ? <span style={{color: '#0e0', marginLeft: 8}}>● 公開中</span> : <span style={{color: '#888', marginLeft: 8}}>○ 非公開</span>}</div>
              </div>
              <button onClick={() => onEdit(it)} style={{padding: '8px 14px', background: color.bg0, color: color.text, border: `1px solid ${color.border}`, borderRadius: 4, cursor: 'pointer', fontSize: 12}}>編集</button>
              <button onClick={() => onDelete(it)} style={{padding: '8px 14px', background: '#3a1a1a', color: '#ff8a8a', border: '1px solid #5a2a2a', borderRadius: 4, cursor: 'pointer', fontSize: 12}}>削除</button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20}} onClick={onCancel}>
          <div style={{background: color.bg, borderRadius: 12, padding: 24, maxWidth: 900, width: '100%', maxHeight: '90vh', overflow: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20}} onClick={(e) => e.stopPropagation()}>
            {/* 左: 入力 */}
            <div>
              <h2 style={{fontSize: 18, fontWeight: 800, marginBottom: 4, color: color.text}}>{isNew ? '新しい製品コンテンツ' : '製品コンテンツを編集'}</h2>
              <p style={{fontSize: 11, color: color.textSecondary, marginBottom: 12}}>右側にプレビューが表示されます</p>

              <label style={labelStyle}>対象タグ <span style={{color: '#ff6464'}}>*必須</span></label>
              <TagPicker id="content-target-tag" value={editing.targetTag} onChange={(csv) => setEditing({...editing, targetTag: csv.split(',')[0].trim()})} placeholder="content:lovelive-pc-spec など" />
              <p style={{fontSize: 10, color: color.textSecondary, marginTop: 4}}>💡 商品にこのタグをつけると、その商品ページ下段に表示されます</p>

              <label style={labelStyle}>見出し (H2)</label>
              <input style={inputStyle} value={editing.heading} onChange={(e) => setEditing({...editing, heading: e.target.value})} placeholder="例: 360mmの水冷クーラーで強力冷却" />

              <label style={labelStyle}>代表画像</label>
              <ImagePicker value={editing.imageUrl} onChange={(url) => setEditing({...editing, imageUrl: url})} />

              <label style={labelStyle}>本文</label>
              <RichTextEditor value={editing.contentHtml} onChange={(v) => setEditing({...editing, contentHtml: v})} rows={8} />

              <label style={labelStyle}>並び順 (数字が小さいほど上)</label>
              <input type="number" style={inputStyle} value={editing.displayOrder} onChange={(e) => setEditing({...editing, displayOrder: parseInt(e.target.value || '0', 10)})} />

              <label style={{...labelStyle, display: 'flex', alignItems: 'center', gap: 8}}>
                <input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({...editing, isActive: e.target.checked})} />
                公開する (チェックを外すと storefront に表示されない)
              </label>

              <div style={{marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
                <button onClick={onCancel} style={{padding: '10px 20px', background: color.bg1, color: color.text, border: `1px solid ${color.border}`, borderRadius: 6, cursor: 'pointer'}}>キャンセル</button>
                <button onClick={onSave} style={{padding: '10px 24px', background: '#00b496', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 800, cursor: 'pointer'}}>{isNew ? '作成' : '更新'}</button>
              </div>
            </div>

            {/* 右: プレビュー */}
            <div style={{background: '#0a0e1a', borderRadius: 8, padding: 20, color: '#e8ecf3', maxHeight: 600, overflow: 'auto'}}>
              <div style={{fontSize: 11, opacity: 0.6, marginBottom: 12}}>👁 storefront プレビュー</div>
              {editing.imageUrl && <img src={editing.imageUrl} alt="" style={{width: '100%', borderRadius: 8, marginBottom: 12}} />}
              {editing.heading && <h2 style={{fontSize: 22, fontWeight: 900, lineHeight: 1.4, margin: '0 0 12px'}}>{editing.heading}</h2>}
              {editing.contentHtml && <div style={{fontSize: 14, lineHeight: 1.8, opacity: 0.85}} dangerouslySetInnerHTML={{__html: editing.contentHtml}} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
