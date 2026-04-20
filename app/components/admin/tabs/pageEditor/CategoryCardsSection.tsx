/**
 * CategoryCardsSection — patch 0050 Phase C 第2段で AdminPageEditor.tsx から切り出し
 *
 * トップページ「CATEGORY」ナビカードの Metaobject (astromeda_category_card) 管理 UI。
 * 元々 AdminPageEditor.tsx の L798-1132 にインライン定義されていた ~334行を
 * 独立ファイルへ移動し、モンスターファイル解体を更に進める。
 *
 * 依存は shared.tsx (同フォルダ) に集約された共有型・スタイル・API ヘルパーと、
 * 既存 admin/ds/UrlPicker + admin/preview/PreviewFrame のみ。
 * 振る舞いは移動前と完全同一。
 */

import React, {useCallback, useEffect, useState} from 'react';
import {T, al} from '~/lib/astromeda-data';
import PreviewFrame, {type PreviewDevice} from '~/components/admin/preview/PreviewFrame';
import {UrlPicker} from '~/components/admin/ds/UrlPicker';
import {ToggleSwitch} from '~/components/admin/ds/ToggleSwitch';
import {
  type CategoryCard,
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
// CategoryCardsSection
// ══════════════════════════════════════════════════════════

export function CategoryCardsSection({pushToast, confirm}: SectionProps) {
  const [items, setItems] = useState<CategoryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CategoryCard | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<{categoryCards: CategoryCard[]}>('/api/admin/category-cards');
    setItems(res?.categoryCards || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (form: Partial<CategoryCard> & {handle?: string}, isCreate: boolean) => {
    setSaving(true);
    const body: Record<string, unknown> = isCreate
      ? {
          action: 'create',
          handle: form.handle || '',
          title: form.title || '',
          description: form.description || '',
          priceFrom: form.priceFrom ?? 0,
          linkUrl: form.linkUrl || '',
          sortOrder: form.sortOrder ?? 0,
          isActive: form.isActive ?? true,
          image: form.image || undefined,
        }
      : {
          action: 'update',
          metaobjectId: form.id,
          title: form.title,
          description: form.description,
          priceFrom: form.priceFrom,
          linkUrl: form.linkUrl,
          sortOrder: form.sortOrder,
          isActive: form.isActive,
          image: form.image || undefined,
        };
    const res = await apiPost('/api/admin/category-cards', body);
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
    const res = await apiPost('/api/admin/category-cards', {action: 'delete', metaobjectId: id});
    if (res.success) {
      pushToast('削除しました', 'success');
      await load();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const modalOpen = creating || editing !== null;
  const initial: Partial<CategoryCard> = creating ? {sortOrder: 0, priceFrom: 0, isActive: true} : editing || {};

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>カテゴリカード ({items.length})</div>
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
              {/* patch 0026: 現在の画像を先頭列に。カテゴリカードは file_reference で GID の場合がある。
                  URL のときだけ素直に表示し、それ以外はグラデーションでフォールバック。*/}
              <th style={thStyle}>現在の画像</th>
              <th style={thStyle}>タイトル</th>
              <th style={thStyle}>説明</th>
              <th style={thStyle}>最低価格</th>
              <th style={thStyle}>リンク</th>
              <th style={thStyle}>順</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const storedImg = (c.image || '').trim();
              const usableStored = storedImg && /^https?:\/\//i.test(storedImg) ? storedImg : null;
              return (
                <tr key={c.id}>
                  <td style={{...tdStyle, width: 84}}>
                    {usableStored ? (
                      <img
                        src={usableStored}
                        alt={c.title || 'preview'}
                        style={{width: 72, height: 48, objectFit: 'cover', borderRadius: 4, border: `1px solid ${al(T.tx, 0.15)}`}}
                      />
                    ) : (
                      <div
                        style={{
                          width: 72, height: 48, borderRadius: 4,
                          background: `linear-gradient(135deg, ${T.c}, ${T.s})`,
                          color: T.bg, fontSize: 9, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          textAlign: 'center', lineHeight: 1.1, padding: 4,
                        }}
                      >
                        画像{'\n'}未設定
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>{c.title}</td>
                  <td style={{...tdStyle, color: T.t5, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{c.description}</td>
                  <td style={tdStyle}>¥{c.priceFrom.toLocaleString('ja-JP')}</td>
                  <td style={{...tdStyle, color: T.t5, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{c.linkUrl}</td>
                  <td style={tdStyle}>{c.sortOrder}</td>
                  <td style={tdStyle}>{c.isActive ? '✓' : '—'}</td>
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
        <CategoryCardForm
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

function CategoryCardForm({
  initial,
  isCreate,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: Partial<CategoryCard>;
  isCreate: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (form: Partial<CategoryCard> & {handle?: string}) => void;
}) {
  const [handle, setHandle] = useState(initial.handle || '');
  const [title, setTitle] = useState(initial.title || '');
  const [description, setDescription] = useState(initial.description || '');
  const [priceFrom, setPriceFrom] = useState(initial.priceFrom ?? 0);
  const [image, setImage] = useState(initial.image || '');
  const [linkUrl, setLinkUrl] = useState(initial.linkUrl || '');
  const [sortOrder, setSortOrder] = useState(initial.sortOrder ?? 0);
  const [isActive, setIsActive] = useState(initial.isActive ?? true);
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  // Live preview — _index.tsx の Category quick nav インラインレンダリングを再現
  const accent = T.c;
  const bg = '#0a0e1a';
  const previewImg = image || '';
  const priceLabel = priceFrom > 0 ? `¥${priceFrom.toLocaleString('ja-JP')}〜` : '';
  const previewPane = (
    <PreviewFrame device={device} onDeviceChange={setDevice}>
      <div style={{padding: 20}}>
        <div style={{fontSize: 12, fontWeight: 800, color: T.t4, letterSpacing: 2, marginBottom: 12}}>CATEGORY</div>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14}}>
          <div
            style={{
              position: 'relative',
              borderRadius: 14,
              overflow: 'hidden',
              aspectRatio: '5/4',
              textDecoration: 'none',
              display: 'block',
              border: `1px solid ${al(accent, 0.2)}`,
              background: bg,
              opacity: isActive ? 1 : 0.5,
            }}
          >
            {previewImg && (
              <div
                style={{
                  position: 'absolute',
                  right: '-5%',
                  top: '5%',
                  width: '70%',
                  height: '90%',
                  backgroundImage: `url(${previewImg}${previewImg.includes('?') ? '&' : '?'}width=600)`,
                  backgroundSize: 'contain',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center right',
                }}
              />
            )}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(90deg, ${bg} 0%, ${bg} 25%, ${bg}cc 45%, transparent 75%)`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: '55%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: 24,
              }}
            >
              {description && (
                <div style={{fontSize: 11, fontWeight: 700, color: accent, letterSpacing: 2, marginBottom: 6, opacity: 0.8}}>
                  {description}
                </div>
              )}
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  color: '#fff',
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                }}
              >
                {title || '(未入力)'}
              </div>
              {priceLabel && (
                <div style={{fontSize: 15, fontWeight: 900, color: accent, marginTop: 8}}>
                  {priceLabel}
                </div>
              )}
              <div style={{marginTop: 12, fontSize: 10, fontWeight: 700, color: al(accent, 0.7)}}>
                見る →
              </div>
            </div>
          </div>
          {/* placeholder slots for layout demonstration */}
          <div style={{aspectRatio: '5/4', border: `1px dashed ${al(T.tx, 0.1)}`, borderRadius: 14, background: al(T.tx, 0.02)}} />
          <div style={{aspectRatio: '5/4', border: `1px dashed ${al(T.tx, 0.1)}`, borderRadius: 14, background: al(T.tx, 0.02)}} />
        </div>
        <div style={{fontSize: 9, color: T.t4, textAlign: 'center', marginTop: 12}}>
          ※ 実サイトでは 3カード並列。点線は他のカード位置
        </div>
      </div>
    </PreviewFrame>
  );

  return (
    <Modal title={isCreate ? 'カテゴリカード 新規追加' : 'カテゴリカード 編集'} onClose={onCancel} preview={previewPane}>
      <div style={{display: 'grid', gap: 12}}>
        {isCreate && (
          <div>
            <label style={labelStyle}>Handle</label>
            <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} style={inputStyle} />
          </div>
        )}
        <div>
          <label style={labelStyle}>タイトル</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>説明 (サブタイトル / 英語キャッチ等)</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>最低価格 (円)</label>
          <input type="number" value={priceFrom} onChange={(e) => setPriceFrom(parseInt(e.target.value, 10) || 0)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>image (Shopify file GID、optional)</label>
          <input type="text" value={image} onChange={(e) => setImage(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <UrlPicker
            label="リンク URL"
            optional
            value={linkUrl}
            onChange={(next) => setLinkUrl(next)}
          />
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
            hint="オフにすると下書き扱いになり、お客様にはこのカードが見えません。"
          />
        </div>
        <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
          <button type="button" onClick={onCancel} style={btn()} disabled={saving}>キャンセル</button>
          <button
            type="button"
            onClick={() => onSubmit({id: initial.id, handle, title, description, priceFrom, image, linkUrl, sortOrder, isActive})}
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
