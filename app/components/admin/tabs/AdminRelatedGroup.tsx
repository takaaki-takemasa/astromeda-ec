/**
 * AdminRelatedGroup — 関連製品グループ admin CRUD タブ (patch 0195)
 *
 * 商品ページ下段の「その他モデル」「マウスパッド」等のグループ別関連商品表示の設定。
 * group_tag を持つ商品が同グループとして自動表示される (storefront loader は patch 0193-full)。
 */
import {useEffect, useState, useCallback} from 'react';
import {color, radius, space} from '~/lib/design-tokens';
import {useToast} from '~/components/admin/ds/Toast';
import {useConfirmDialog} from '~/hooks/useConfirmDialog';
import {ConfirmDialog} from '~/components/admin/ds/ConfirmDialog';
import {AdminListSkeleton, AdminEmptyCard} from '~/components/admin/ds/InlineListState';
import {TabHeaderHint} from '~/components/admin/ds/TabHeaderHint';
import TagPicker from '~/components/admin/TagPicker';

interface GroupItem {
  id: string; handle: string;
  groupTag: string; groupLabel: string;
  displayOrder: number; maxItems: number; isActive: boolean;
}

const inputStyle: React.CSSProperties = {width: '100%', padding: '8px 10px', background: color.bg0, color: color.text, border: `1px solid ${color.border}`, borderRadius: 4, fontSize: 13};
const labelStyle: React.CSSProperties = {display: 'block', fontSize: 12, fontWeight: 700, color: color.text, marginBottom: 4, marginTop: 12};

function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  return document.querySelector<HTMLMetaElement>('meta[name="_csrf"]')?.content || '';
}

async function loadAll(): Promise<GroupItem[]> {
  const r = await fetch('/api/admin/cms?type=astromeda_related_group');
  const j = await r.json();
  return ((j.items || []) as Array<Record<string, string>>).map((i) => ({
    id: i.id, handle: i.handle,
    groupTag: i.group_tag || '', groupLabel: i.group_label || '',
    displayOrder: parseInt(i.display_order || '0', 10),
    maxItems: parseInt(i.max_items || '4', 10),
    isActive: i.is_active === 'true',
  })).sort((a, b) => a.displayOrder - b.displayOrder);
}

export default function AdminRelatedGroup() {
  const [items, setItems] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<GroupItem | null>(null);
  const [isNew, setIsNew] = useState(false);
  const {showToast, Toast} = useToast();
  const {confirm, dialogProps} = useConfirmDialog();

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setItems(await loadAll()); } catch (e) { showToast(`読み込み失敗: ${(e as Error).message}`, 'error'); } finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { refresh(); }, [refresh]);

  const onNew = () => { setEditing({id: '', handle: '', groupTag: '', groupLabel: '', displayOrder: 10, maxItems: 4, isActive: true}); setIsNew(true); };
  const onEdit = (it: GroupItem) => { setEditing({...it}); setIsNew(false); };
  const onCancel = () => { setEditing(null); setIsNew(false); };

  const onSave = async () => {
    if (!editing) return;
    if (!editing.groupTag.trim()) { showToast('グループタグを入力してください', 'error'); return; }
    const csrf = getCsrfToken();
    const fields = [
      {key: 'group_tag', value: editing.groupTag.trim()},
      {key: 'group_label', value: editing.groupLabel},
      {key: 'display_order', value: String(editing.displayOrder)},
      {key: 'max_items', value: String(editing.maxItems)},
      {key: 'is_active', value: editing.isActive ? 'true' : 'false'},
    ];
    try {
      const body: Record<string, unknown> = {action: isNew ? 'create' : 'update', type: 'astromeda_related_group', fields};
      if (isNew) body.handle = `rg-${Date.now()}`; else body.id = editing.id;
      const r = await fetch('/api/admin/cms', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify(body)});
      const j = await r.json();
      if (!j.success) throw new Error(j.error || '保存失敗');
      showToast(isNew ? '✅ 新規作成' : '✅ 更新', 'success');
      setEditing(null); setIsNew(false); await refresh();
    } catch (e) { showToast(`保存失敗: ${(e as Error).message}`, 'error'); }
  };

  const onDelete = async (it: GroupItem) => {
    const ok = await confirm({title: '削除しますか？', message: `「${it.groupLabel || it.groupTag}」を削除します。`, confirmLabel: '削除', confirmVariant: 'destructive'});
    if (!ok) return;
    try {
      const r = await fetch('/api/admin/cms', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken()}, body: JSON.stringify({action: 'delete', type: 'astromeda_related_group', id: it.id, confirm: true})});
      const j = await r.json();
      if (!j.success) throw new Error(j.error || '削除失敗');
      showToast('🗑 削除しました', 'success');
      await refresh();
    } catch (e) { showToast(`削除失敗: ${(e as Error).message}`, 'error'); }
  };

  return (
    <div style={{maxWidth: 1200, margin: '0 auto'}}>
      <TabHeaderHint
        title="🔗 関連製品グループ (商品ページ下段の「その他モデル」)"
        description="商品ページ下段に「その他モデル」「マウスパッド」等の関連商品グループを表示。グループタグを持つ商品が同じグループに自動分類されます。"
        relatedTabs={[{label: 'タグ管理', tab: 'bulkTags'}]}
      />
      <Toast />
      <ConfirmDialog {...dialogProps} />
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
        <div style={{fontSize: 13, color: color.textSecondary}}>{items.length} 件のグループ</div>
        <button onClick={onNew} style={{padding: '10px 20px', background: '#00b496', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 800, cursor: 'pointer'}}>+ 新しいグループ</button>
      </div>
      {loading ? <AdminListSkeleton rows={3} /> : items.length === 0 ? (
        <AdminEmptyCard icon="🔗" title="まだ関連製品グループがありません" description="「+ 新しいグループ」を押して、関連商品の表示グループを作成しましょう。" />
      ) : (
        <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
          {items.map((it) => (
            <div key={it.id} style={{padding: 14, background: color.bg1, border: `1px solid ${color.border}`, borderRadius: radius.lg, display: 'flex', gap: 14, alignItems: 'center'}}>
              <div style={{flex: 1}}>
                <div style={{fontSize: 14, fontWeight: 800, color: color.text}}>{it.groupLabel || '(見出し未設定)'}</div>
                <div style={{fontSize: 11, color: color.textSecondary, marginTop: 4}}>グループタグ: <code style={{background: color.bg0, padding: '2px 6px'}}>{it.groupTag}</code> / 最大 {it.maxItems} 件 / 順番 {it.displayOrder} {it.isActive ? <span style={{color: '#0e0', marginLeft: 8}}>● 公開中</span> : <span style={{color: '#888', marginLeft: 8}}>○ 非公開</span>}</div>
              </div>
              <button onClick={() => onEdit(it)} style={{padding: '8px 14px', background: color.bg0, color: color.text, border: `1px solid ${color.border}`, borderRadius: 4, cursor: 'pointer', fontSize: 12}}>編集</button>
              <button onClick={() => onDelete(it)} style={{padding: '8px 14px', background: '#3a1a1a', color: '#ff8a8a', border: '1px solid #5a2a2a', borderRadius: 4, cursor: 'pointer', fontSize: 12}}>削除</button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20}} onClick={onCancel}>
          <div style={{background: color.bg, borderRadius: 12, padding: 24, maxWidth: 600, width: '100%', maxHeight: '90vh', overflow: 'auto'}} onClick={(e) => e.stopPropagation()}>
            <h2 style={{fontSize: 18, fontWeight: 800, marginBottom: 12, color: color.text}}>{isNew ? '新しい関連製品グループ' : '関連製品グループを編集'}</h2>

            <label style={labelStyle}>グループタグ <span style={{color: '#ff6464'}}>*必須</span></label>
            <TagPicker id="group-tag" value={editing.groupTag} onChange={(csv) => setEditing({...editing, groupTag: csv.split(',')[0].trim()})} placeholder="related-group:lovelive-pc など" />
            <p style={{fontSize: 10, color: color.textSecondary, marginTop: 4}}>💡 同じタグを持つ商品が自動的にこのグループに分類されます</p>

            <label style={labelStyle}>見出し (お客様向け表示)</label>
            <input style={inputStyle} value={editing.groupLabel} onChange={(e) => setEditing({...editing, groupLabel: e.target.value})} placeholder="例: その他モデル / マウスパッド" />

            <label style={labelStyle}>最大表示件数</label>
            <input type="number" style={inputStyle} value={editing.maxItems} onChange={(e) => setEditing({...editing, maxItems: parseInt(e.target.value || '4', 10)})} />

            <label style={labelStyle}>並び順 (数字が小さいほど上)</label>
            <input type="number" style={inputStyle} value={editing.displayOrder} onChange={(e) => setEditing({...editing, displayOrder: parseInt(e.target.value || '0', 10)})} />

            <label style={{...labelStyle, display: 'flex', alignItems: 'center', gap: 8}}>
              <input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({...editing, isActive: e.target.checked})} />
              公開する
            </label>

            <div style={{marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
              <button onClick={onCancel} style={{padding: '10px 20px', background: color.bg1, color: color.text, border: `1px solid ${color.border}`, borderRadius: 6, cursor: 'pointer'}}>キャンセル</button>
              <button onClick={onSave} style={{padding: '10px 24px', background: '#00b496', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 800, cursor: 'pointer'}}>{isNew ? '作成' : '更新'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
