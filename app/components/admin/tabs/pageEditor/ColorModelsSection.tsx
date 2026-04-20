/**
 * ColorModelsSection — patch 0049 Phase C 第2段で AdminPageEditor.tsx から切り出し
 *
 * トップページ「8色カラー」セクションの Metaobject (astromeda_pc_color) 管理 UI。
 * 元々 AdminPageEditor.tsx の L799-1156 にインライン定義されていた ~358行を
 * 独立ファイルへ移動し、モンスターファイル解体を更に進める。
 *
 * 依存は shared.tsx (同フォルダ) に集約された共有型・スタイル・API ヘルパーのみ。
 * 振る舞いは移動前と完全同一（patch 0027 の 🧹 重複削除 + patch 0026 画像サムネ列を含む）。
 */

import React, {useCallback, useEffect, useState} from 'react';
import {T, al} from '~/lib/astromeda-data';
import PreviewFrame, {type PreviewDevice} from '~/components/admin/preview/PreviewFrame';
import {PCShowcase} from '~/components/astro/PCShowcase';
import {ToggleSwitch} from '~/components/admin/ds/ToggleSwitch';
import {
  type ColorModel,
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

export function ColorModelsSection({pushToast, confirm}: SectionProps) {
  const [items, setItems] = useState<ColorModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ColorModel | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  // patch 0027: 重複削除ボタンの処理中フラグ
  const [deduping, setDeduping] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<{colorModels: ColorModel[]}>('/api/admin/color-models');
    setItems(res?.colorModels || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // patch 0027: CEO 指摘「16行×#000000 固定」 → 過去のシード重複を slug 単位で dedup。
  // 各 slug につき 1件だけ残し、残りを削除する。
  const handleDedupe = useCallback(async () => {
    // slug ごとにグループ化
    const bySlug = new Map<string, ColorModel[]>();
    for (const it of items) {
      const slug = (it.slug || '').trim() || '(no-slug)';
      if (!bySlug.has(slug)) bySlug.set(slug, []);
      bySlug.get(slug)!.push(it);
    }
    // 削除対象を抽出（各グループの 2件目以降）
    const victims: ColorModel[] = [];
    for (const group of bySlug.values()) {
      if (group.length <= 1) continue;
      // 表示順が小さい or image が埋まっているものを優先して残す
      group.sort((a, b) => {
        const aImg = a.image && /^https?:\/\//i.test(a.image) ? 0 : 1;
        const bImg = b.image && /^https?:\/\//i.test(b.image) ? 0 : 1;
        if (aImg !== bImg) return aImg - bImg;
        return (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
      });
      victims.push(...group.slice(1));
    }
    if (victims.length === 0) {
      pushToast('重複はありません（全 slug が一意です）', 'success');
      return;
    }
    const ok = await confirm(
      `${victims.length} 件の重複を削除します。各カラーにつき 1 件を残します。実行しますか？`,
    );
    if (!ok) return;
    setDeduping(true);
    let deleted = 0;
    let failed = 0;
    for (const v of victims) {
      const res = await apiPost('/api/admin/color-models', {
        action: 'delete',
        metaobjectId: v.id,
      });
      if (res.success) deleted += 1;
      else failed += 1;
    }
    setDeduping(false);
    if (failed === 0) {
      pushToast(`${deleted} 件削除しました`, 'success');
    } else {
      pushToast(`削除 ${deleted} 件 / 失敗 ${failed} 件`, failed === victims.length ? 'error' : 'success');
    }
    await load();
  }, [items, confirm, pushToast, load]);

  const handleSave = async (form: Partial<ColorModel> & {handle?: string}, isCreate: boolean) => {
    setSaving(true);
    const body: Record<string, unknown> = isCreate
      ? {
          action: 'create',
          handle: form.handle || '',
          name: form.name || '',
          slug: form.slug || '',
          colorCode: form.colorCode || '#000000',
          sortOrder: form.sortOrder ?? 0,
          isActive: form.isActive ?? true,
          image: form.image || undefined,
        }
      : {
          action: 'update',
          metaobjectId: form.id,
          name: form.name,
          slug: form.slug,
          colorCode: form.colorCode,
          sortOrder: form.sortOrder,
          isActive: form.isActive,
          image: form.image || undefined,
        };
    const res = await apiPost('/api/admin/color-models', body);
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
    const res = await apiPost('/api/admin/color-models', {action: 'delete', metaobjectId: id});
    if (res.success) {
      pushToast('削除しました', 'success');
      await load();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const modalOpen = creating || editing !== null;
  const initial: Partial<ColorModel> = creating ? {colorCode: '#888888', sortOrder: 0, isActive: true} : editing || {};

  // patch 0027: slug 重複を検出して「重複削除」ボタンの表示判定
  const dupCount = (() => {
    const seen = new Map<string, number>();
    for (const it of items) {
      const slug = (it.slug || '').trim() || '(no-slug)';
      seen.set(slug, (seen.get(slug) || 0) + 1);
    }
    let extras = 0;
    for (const v of seen.values()) if (v > 1) extras += v - 1;
    return extras;
  })();

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap'}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>
          PC カラーモデル ({items.length})
          {dupCount > 0 && (
            <span style={{marginLeft: 8, fontSize: 11, color: T.r, fontWeight: 700}}>
              ⚠ 重複 {dupCount} 件
            </span>
          )}
        </div>
        <div style={{display: 'flex', gap: 6}}>
          {dupCount > 0 && (
            <button
              type="button"
              onClick={() => void handleDedupe()}
              style={{
                ...btn(false),
                background: al(T.r, 0.1),
                border: `1px solid ${al(T.r, 0.4)}`,
                color: T.r,
              }}
              disabled={deduping}
              title="slug が同じレコードを 1 件に集約します"
            >
              {deduping ? '処理中...' : `🧹 重複削除 (${dupCount})`}
            </button>
          )}
          <button type="button" onClick={() => setCreating(true)} style={btn(true)}>＋ 新規追加</button>
        </div>
      </div>
      {loading ? (
        <div style={{textAlign: 'center', padding: 40}}><Spinner /></div>
      ) : items.length === 0 ? (
        <div style={{color: T.t4, fontSize: 12, textAlign: 'center', padding: 30}}>エントリがありません</div>
      ) : (
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <thead>
            <tr>
              {/* patch 0026: 現在の画像を先頭列に追加。PC カラー行では
                  「ライフスタイル画像 → /images/pc-setup/{slug}.jpg（プロジェクト既定） → 色スウォッチ」
                  の順で表示し、CEO がトップページ8色カードのどの行かを一目で判断できるようにする。*/}
              <th style={thStyle}>現在の画像</th>
              <th style={thStyle}>色</th>
              <th style={thStyle}>名前</th>
              <th style={thStyle}>slug</th>
              <th style={thStyle}>順</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const storedImg = (c.image || '').trim();
              const usableStored = storedImg && /^https?:\/\//i.test(storedImg) ? storedImg : null;
              const defaultImg = c.slug ? `/images/pc-setup/${c.slug}.jpg` : null;
              const thumb = usableStored || defaultImg;
              return (
                <tr key={c.id}>
                  <td style={{...tdStyle, width: 84}}>
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={c.name || c.slug || 'preview'}
                        style={{width: 72, height: 48, objectFit: 'cover', borderRadius: 4, border: `1px solid ${al(T.tx, 0.15)}`}}
                        onError={(e) => {
                          const img = e.currentTarget;
                          img.style.display = 'none';
                          const sib = img.nextElementSibling as HTMLElement | null;
                          if (sib) sib.style.display = 'block';
                        }}
                      />
                    ) : null}
                    <div
                      style={{
                        display: thumb ? 'none' : 'block',
                        width: 72, height: 48, borderRadius: 4,
                        background: c.colorCode,
                        border: `1px solid ${al(T.tx, 0.2)}`,
                      }}
                    />
                  </td>
                  <td style={tdStyle}>
                    <span style={{display: 'inline-block', width: 16, height: 16, borderRadius: 3, background: c.colorCode, border: `1px solid ${al(T.tx, 0.2)}`, verticalAlign: 'middle'}} />
                    <span style={{marginLeft: 8, color: T.t4, fontSize: 10}}>{c.colorCode}</span>
                  </td>
                  <td style={tdStyle}>{c.name}</td>
                  <td style={tdStyle}>{c.slug}</td>
                  <td style={tdStyle}>{c.sortOrder}</td>
                  <td style={tdStyle}>{c.isActive ? '✓ 有効' : '— 無効'}</td>
                  <td style={{...tdStyle, textAlign: 'right'}}>
                    <button type="button" onClick={() => setEditing(c)} style={{...btn(), marginRight: 6}}>編集</button>
                    <button type="button" onClick={() => handleDelete(c.id)} style={btn(false, true)}>削除</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {modalOpen && (
        <ColorModelForm
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

function ColorModelForm({
  initial,
  isCreate,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: Partial<ColorModel>;
  isCreate: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (form: Partial<ColorModel> & {handle?: string}) => void;
}) {
  const [handle, setHandle] = useState(initial.handle || '');
  const [name, setName] = useState(initial.name || '');
  const [slug, setSlug] = useState(initial.slug || '');
  const [image, setImage] = useState(initial.image || '');
  const [colorCode, setColorCode] = useState(initial.colorCode || '#888888');
  const [sortOrder, setSortOrder] = useState(initial.sortOrder ?? 0);
  const [isActive, setIsActive] = useState(initial.isActive ?? true);
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  // Live preview props — PCShowcase に渡す MetaColorModel[] を form 値から構築
  const previewMeta = [
    {
      id: initial.id || 'preview',
      handle: handle || 'preview',
      name: name || '(未入力)',
      slug: slug || 'preview',
      image: image || null,
      colorCode: /^#[0-9A-Fa-f]{6}$/.test(colorCode) ? colorCode : '#888888',
      sortOrder,
      isActive: true, // プレビューは常に表示
    },
  ];

  const previewPane = (
    <PreviewFrame device={device} onDeviceChange={setDevice}>
      <PCShowcase colorImages={{}} metaColors={previewMeta} />
    </PreviewFrame>
  );

  return (
    <Modal
      title={isCreate ? 'カラーモデル 新規追加' : 'カラーモデル 編集'}
      onClose={onCancel}
      preview={previewPane}
    >
      <div style={{display: 'grid', gap: 12}}>
        {isCreate && (
          <div>
            <label style={labelStyle}>Handle (一意識別子、小文字英数)</label>
            <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} style={inputStyle} placeholder="white-model" />
          </div>
        )}
        <div>
          <label style={labelStyle}>カラー名</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="ホワイト" />
        </div>
        <div>
          <label style={labelStyle}>slug (ルーティング用)</label>
          <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} style={inputStyle} placeholder="white" />
        </div>
        <div>
          <label style={labelStyle}>image (Shopify file GID、optional)</label>
          <input type="text" value={image} onChange={(e) => setImage(e.target.value)} style={inputStyle} placeholder="gid://shopify/MediaImage/..." />
        </div>
        <div>
          <label style={labelStyle}>カラーコード (#RRGGBB)</label>
          <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
            <input type="color" value={colorCode} onChange={(e) => setColorCode(e.target.value)} style={{width: 50, height: 36, border: 'none', background: 'transparent'}} />
            <input type="text" value={colorCode} onChange={(e) => setColorCode(e.target.value)} style={{...inputStyle, flex: 1}} />
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
            hint="オフにすると下書き扱いになり、お客様にはこのカラーが見えません。"
          />
        </div>
        <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6}}>
          <button type="button" onClick={onCancel} style={btn()} disabled={saving}>キャンセル</button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                id: initial.id,
                handle,
                name,
                slug,
                image,
                colorCode,
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
