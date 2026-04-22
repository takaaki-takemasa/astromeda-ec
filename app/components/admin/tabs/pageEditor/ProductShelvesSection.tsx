/**
 * ProductShelvesSection — patch 0051 Phase C 第2段で AdminPageEditor.tsx から切り出し
 *
 * トップページ「商品棚 / NEW ARRIVALS」の Metaobject (astromeda_product_shelf) 管理 UI。
 * 元々 AdminPageEditor.tsx の L803-1169 にインライン定義されていた ~367行を
 * 独立ファイルへ移動し、モンスターファイル解体を更に進める。
 *
 * 依存は shared.tsx (同フォルダ) に集約された共有型・スタイル・API ヘルパーのみ。
 * PreviewFrame だけ外部 admin/preview/PreviewFrame を直接 import。
 * 振る舞いは移動前と完全同一。
 */

import React, {useCallback, useEffect, useState} from 'react';
import {T, al} from '~/lib/astromeda-data';
import PreviewFrame, {type PreviewDevice} from '~/components/admin/preview/PreviewFrame';
import {ToggleSwitch} from '~/components/admin/ds/ToggleSwitch';
import {
  type ProductShelf,
  type SectionProps,
  cardStyle,
  labelStyle,
  inputStyle,
  btn,
  thStyle,
  tdStyle,
  Spinner,
  Modal,
  apiGet,
  apiPost,
} from './shared';

// ══════════════════════════════════════════════════════════
// ProductShelvesSection
// ══════════════════════════════════════════════════════════

export function ProductShelvesSection({pushToast, confirm}: SectionProps) {
  const [items, setItems] = useState<ProductShelf[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProductShelf | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<{productShelves: ProductShelf[]}>('/api/admin/product-shelves');
    setItems(res?.productShelves || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (form: Partial<ProductShelf> & {handle?: string}, isCreate: boolean) => {
    setSaving(true);
    const body: Record<string, unknown> = isCreate
      ? {
          action: 'create',
          handle: form.handle || '',
          title: form.title || '',
          subtitle: form.subtitle || '',
          productIds: form.productIds || [],
          limit: form.limit ?? 6,
          sortKey: form.sortKey || 'manual',
          sortOrder: form.sortOrder ?? 0,
          isActive: form.isActive ?? true,
        }
      : {
          action: 'update',
          metaobjectId: form.id,
          title: form.title,
          subtitle: form.subtitle,
          productIds: form.productIds,
          limit: form.limit,
          sortKey: form.sortKey,
          sortOrder: form.sortOrder,
          isActive: form.isActive,
        };
    const res = await apiPost('/api/admin/product-shelves', body);
    setSaving(false);
    if (res.success) {
      pushToast('保存しました', 'success');
      setEditing(null);
      setCreating(false);
      await load();
    } else {
      pushToast(`失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm('このエントリを削除しますか？'))) return;
    const res = await apiPost('/api/admin/product-shelves', {action: 'delete', metaobjectId: id});
    if (res.success) {
      pushToast('削除しました', 'success');
      await load();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const modalOpen = creating || editing !== null;
  const initial: Partial<ProductShelf> = creating
    ? {sortOrder: 0, isActive: true, productIds: [], subtitle: '', limit: 6, sortKey: 'manual'}
    : editing || {};

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>商品棚 ({items.length})</div>
        <button type="button" onClick={() => setCreating(true)} style={btn(true)}>＋ 新規追加</button>
      </div>
      {loading ? (
        <div style={{textAlign: 'center', padding: 40}}><Spinner /></div>
      ) : items.length === 0 ? (
        <div style={{color: T.t4, fontSize: 12, textAlign: 'center', padding: 30}}>エントリがありません</div>
      ) : (
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <thead>
            <tr>
              <th style={thStyle}>タイトル</th>
              <th style={thStyle}>商品数</th>
              <th style={thStyle}>順</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td style={tdStyle}>{c.title}</td>
                <td style={tdStyle}>{c.productIds.length}</td>
                <td style={tdStyle}>{c.sortOrder}</td>
                <td style={tdStyle}>{c.isActive ? '✓' : '—'}</td>
                <td style={{...tdStyle, textAlign: 'right'}}>
                  <button type="button" onClick={() => setEditing(c)} style={{...btn(), marginRight: 6}}>編集</button>
                  <button type="button" onClick={() => handleDelete(c.id)} style={btn(false, true)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalOpen && (
        <ProductShelfForm
          initial={initial}
          isCreate={creating}
          saving={saving}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSubmit={(form) => handleSave(form, creating)}
        />
      )}
    </div>
  );
}

function ProductShelfForm({
  initial,
  isCreate,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: Partial<ProductShelf>;
  isCreate: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (form: Partial<ProductShelf> & {handle?: string}) => void;
}) {
  const [handle, setHandle] = useState(initial.handle || '');
  const [title, setTitle] = useState(initial.title || '');
  const [subtitle, setSubtitle] = useState(initial.subtitle || '');
  const [productIds, setProductIds] = useState<string[]>(initial.productIds || []);
  const [limit, setLimit] = useState<number>(initial.limit ?? 6);
  const [sortKey, setSortKey] = useState<'manual' | 'best_selling' | 'newest'>(initial.sortKey || 'manual');
  const [sortOrder, setSortOrder] = useState(initial.sortOrder ?? 0);
  const [isActive, setIsActive] = useState(initial.isActive ?? true);
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  // Live preview — NEW ARRIVALS 風シェルフレイアウトを再現（商品実データは placeholder）
  const validIds = productIds.filter((x) => x.trim() !== '');
  // limit に合わせてスロット数を計算
  const slotsToShow = Math.max(0, Math.min(limit, 24));
  const previewSlots: Array<{pid: string | null; index: number}> = Array.from({length: slotsToShow}).map((_, i) => ({
    pid: validIds[i] || null,
    index: i,
  }));
  const sortKeyLabel = sortKey === 'best_selling' ? 'ベストセラー順' : sortKey === 'newest' ? '新着順' : '手動順';
  const previewPane = (
    <PreviewFrame device={device} onDeviceChange={setDevice}>
      <div style={{padding: 20, opacity: isActive ? 1 : 0.5}}>
        <div style={{display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4}}>
          <span style={{fontSize: 18, fontWeight: 900, color: T.tx, letterSpacing: 1}}>
            {title || '(シェルフタイトル未入力)'}
          </span>
          <span style={{fontSize: 10, color: T.t4, fontFamily: 'monospace'}}>
            {sortKeyLabel} · 最大{limit}件
          </span>
        </div>
        {subtitle && (
          <div style={{fontSize: 13, fontWeight: 700, color: T.c, letterSpacing: 1.5, marginBottom: 16}}>
            {subtitle}
          </div>
        )}
        {!subtitle && <div style={{marginBottom: 16}} />}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 14,
          }}
        >
          {previewSlots.map(({pid, index: i}) => {
            if (!pid) {
              return (
                <div
                  key={`slot${i}`}
                  style={{
                    aspectRatio: '4/3',
                    border: `1px dashed ${al(T.tx, 0.15)}`,
                    borderRadius: 8,
                    background: al(T.tx, 0.01),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: T.t4,
                    fontSize: 10,
                  }}
                >
                  (商品未設定)
                </div>
              );
            }
            const numMatch = pid.match(/\/(\d+)$/);
            const numId = numMatch ? numMatch[1] : String(i + 1);
            return (
              <div
                key={pid + i}
                style={{
                  background: al(T.tx, 0.03),
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: `1px solid ${al(T.tx, 0.06)}`,
                }}
              >
                <div
                  style={{
                    aspectRatio: '4/3',
                    background: `linear-gradient(135deg, ${al(T.c, 0.12)}, ${al(T.tx, 0.03)})`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: T.t4,
                    fontSize: 10,
                    fontFamily: 'monospace',
                  }}
                >
                  #{numId}
                </div>
                <div style={{padding: 10}}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: T.tx,
                      lineHeight: 1.3,
                      marginBottom: 4,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    商品 #{i + 1}
                  </div>
                  <div style={{fontSize: 14, color: T.c, fontWeight: 900}}>
                    ¥—
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{fontSize: 9, color: T.t4, textAlign: 'center', marginTop: 14}}>
          ※ 実サイトでは Shopify Storefront API で商品タイトル/画像/価格を動的取得
        </div>
      </div>
    </PreviewFrame>
  );

  const updateId = (idx: number, value: string) => {
    setProductIds((prev) => prev.map((x, i) => (i === idx ? value : x)));
  };
  const addId = () => setProductIds((prev) => [...prev, '']);
  const removeId = (idx: number) => setProductIds((prev) => prev.filter((_, i) => i !== idx));

  return (
    <Modal title={isCreate ? '商品棚 新規追加' : '商品棚 編集'} onClose={onCancel} preview={previewPane}>
      <div style={{display: 'grid', gap: 12}}>
        {isCreate && (
          <div>
            <label style={labelStyle}>Handle</label>
            <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} style={inputStyle} />
          </div>
        )}
        <div>
          <label style={labelStyle}>シェルフタイトル</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="スタッフのおすすめ" />
        </div>
        <div>
          <label style={labelStyle}>サブタイトル（英語キャッチ等、任意）</label>
          <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} style={inputStyle} placeholder="STAFF PICKS" />
        </div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
          <div>
            <label style={labelStyle}>最大表示件数 (1-24)</label>
            <input
              type="number"
              value={limit}
              min={1}
              max={24}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) setLimit(Math.max(1, Math.min(24, n)));
              }}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>並び順</label>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as 'manual' | 'best_selling' | 'newest')}
              style={inputStyle}
            >
              <option value="manual">手動 (productIds 順)</option>
              <option value="best_selling">ベストセラー順</option>
              <option value="newest">新着順</option>
            </select>
          </div>
        </div>
        <div>
          <label style={labelStyle}>商品ID 一覧（{productIds.length} 件・開発者向け）</label>
          <div style={{display: 'grid', gap: 6}}>
            {productIds.map((pid, i) => (
              <div key={i} style={{display: 'flex', gap: 6}}>
                <input
                  type="text"
                  value={pid}
                  onChange={(e) => updateId(i, e.target.value)}
                  placeholder="gid://shopify/Product/1234567890"
                  style={{...inputStyle, flex: 1, fontFamily: 'monospace', fontSize: 11}}
                />
                <button type="button" onClick={() => removeId(i)} style={btn(false, true)}>−</button>
              </div>
            ))}
            <button type="button" onClick={addId} style={{...btn(), alignSelf: 'flex-start'}}>＋ 行を追加</button>
          </div>
        </div>
        <div>
          <label style={labelStyle}>表示順</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)} style={inputStyle} />
        </div>
        <div>
          <ToggleSwitch
            checked={isActive}
            onChange={setIsActive}
            label="フロントに表示する"
            hint="オフにすると下書き扱いになり、お客様にはこの商品棚が見えません。"
          />
        </div>
        <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
          <button type="button" onClick={onCancel} style={btn()} disabled={saving}>キャンセル</button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                id: initial.id,
                handle,
                title,
                subtitle,
                productIds: productIds.filter((x) => x.trim() !== ''),
                limit,
                sortKey,
                sortOrder,
                isActive,
              })
            }
            style={btn(true)}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
