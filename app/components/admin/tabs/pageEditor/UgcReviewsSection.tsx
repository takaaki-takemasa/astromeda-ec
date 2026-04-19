/**
 * UgcReviewsSection — patch 0047 Phase C 第1段で AdminPageEditor.tsx から切り出し
 *
 * トップページ「REVIEWS」セクションの Metaobject (astromeda_ugc_review) 管理 UI。
 * 元々 AdminPageEditor.tsx の L4582-4800 にインライン定義されていた ~220行を
 * 独立ファイルへ移動し、モンスターファイル解体の第一歩とする。
 *
 * 依存は shared.tsx (同フォルダ) に集約された共有型・スタイル・API ヘルパーのみ。
 * 振る舞いは移動前と完全同一（patch 0039 / 0046 と同じバージョン）。
 */

import React, {useCallback, useEffect, useState} from 'react';
import {T, al} from '~/lib/astromeda-data';
import {
  type SectionProps,
  Spinner,
  Modal,
  apiGet,
  cmsCreate,
  cmsUpdate,
  cmsDelete,
  cardStyle,
  thStyle,
  tdStyle,
  btn,
  labelStyle,
  inputStyle,
} from './shared';

export type UgcCmsItem = {
  id: string;
  handle: string;
  username?: string;
  review_text?: string;
  accent_color?: string;
  rating?: string;
  date_label?: string;
  likes?: string;
  product_name?: string;
  display_order?: string;
  is_active?: string;
};

export function UgcReviewsSection({pushToast, confirm}: SectionProps) {
  const [items, setItems] = useState<UgcCmsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UgcCmsItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fHandle, setFHandle] = useState('');
  const [fUsername, setFUsername] = useState('');
  const [fReviewText, setFReviewText] = useState('');
  const [fAccentColor, setFAccentColor] = useState('#F06292');
  const [fRating, setFRating] = useState(5);
  const [fDateLabel, setFDateLabel] = useState('');
  const [fLikes, setFLikes] = useState(0);
  const [fProductName, setFProductName] = useState('');
  const [fDisplayOrder, setFDisplayOrder] = useState(0);
  const [fIsActive, setFIsActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<{success: boolean; items?: UgcCmsItem[]}>(
      '/api/admin/cms?type=astromeda_ugc_review',
    );
    const list = (res?.items || []) as UgcCmsItem[];
    list.sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));
    setItems(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setCreating(true);
    setEditing(null);
    setFHandle('');
    setFUsername('');
    setFReviewText('');
    setFAccentColor('#F06292');
    setFRating(5);
    setFDateLabel('');
    setFLikes(0);
    setFProductName('');
    setFDisplayOrder(items.length + 1);
    setFIsActive(true);
  };

  const openEdit = (item: UgcCmsItem) => {
    setEditing(item);
    setCreating(false);
    setFHandle(item.handle || '');
    setFUsername(item.username || '');
    setFReviewText(item.review_text || '');
    setFAccentColor(item.accent_color || '#F06292');
    setFRating(Number(item.rating || 5));
    setFDateLabel(item.date_label || '');
    setFLikes(Number(item.likes || 0));
    setFProductName(item.product_name || '');
    setFDisplayOrder(Number(item.display_order || 0));
    setFIsActive(item.is_active !== 'false');
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!fUsername.trim()) {
      pushToast('ユーザー名は必須です', 'error');
      return;
    }
    if (!fReviewText.trim()) {
      pushToast('レビュー本文は必須です', 'error');
      return;
    }
    setSaving(true);
    const fields: Array<{key: string; value: string}> = [
      {key: 'username', value: fUsername},
      {key: 'review_text', value: fReviewText},
      {key: 'accent_color', value: fAccentColor},
      {key: 'rating', value: String(fRating)},
      {key: 'date_label', value: fDateLabel},
      {key: 'likes', value: String(fLikes)},
      {key: 'product_name', value: fProductName},
      {key: 'display_order', value: String(fDisplayOrder)},
      {key: 'is_active', value: fIsActive ? 'true' : 'false'},
    ];
    const res = creating
      ? await cmsCreate(
          'astromeda_ugc_review',
          fHandle || `ugc-review-${Date.now()}`,
          fields,
        )
      : await cmsUpdate('astromeda_ugc_review', editing!.id, fields);
    setSaving(false);
    if (res.success) {
      pushToast(creating ? '作成しました' : '更新しました', 'success');
      closeModal();
      await load();
    } else {
      pushToast(`保存失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const handleDelete = async (item: UgcCmsItem) => {
    if (!(await confirm(`「${item.username || item.handle}」のレビューを削除しますか？`))) return;
    const res = await cmsDelete('astromeda_ugc_review', item.id);
    if (res.success) {
      pushToast('削除しました', 'success');
      await load();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const modalOpen = creating || editing !== null;

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <div>
          <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>
            ⭐ ユーザーレビュー (UGC) ({items.length})
          </div>
          <div style={{fontSize: 10, color: T.t4, marginTop: 3}}>
            トップページ「REVIEWS」セクションの星・コメント・いいね数。
          </div>
        </div>
        <button type="button" onClick={openCreate} style={btn(true)}>
          ＋ 新規追加
        </button>
      </div>
      {items.length === 0 && !loading && (
        <div
          style={{
            background: al(T.c, 0.08),
            border: `1px solid ${al(T.c, 0.3)}`,
            borderRadius: 8,
            padding: 14,
            fontSize: 12,
            color: T.tx,
            marginBottom: 14,
            lineHeight: 1.6,
          }}
        >
          <div style={{fontWeight: 800, marginBottom: 4}}>
            📦 Metaobject 空 — フロントはハードコード UGC 定数を表示中
          </div>
          <div style={{color: T.t4, fontSize: 11}}>
            1件追加するとフロントが Metaobject 値に切り替わります（exclusive-OR merge）。
          </div>
        </div>
      )}
      {loading ? (
        <div style={{textAlign: 'center', padding: 30}}>
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <div style={{color: T.t4, fontSize: 12, textAlign: 'center', padding: 20}}>
          レビューがありません
        </div>
      ) : (
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <thead>
            <tr>
              <th style={thStyle}>ユーザー</th>
              <th style={thStyle}>本文</th>
              <th style={thStyle}>★</th>
              <th style={thStyle}>♡</th>
              <th style={thStyle}>順</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={tdStyle}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: item.accent_color || '#F06292',
                      marginRight: 6,
                    }}
                  />
                  {item.username || <span style={{color: T.t4}}>(未入力)</span>}
                </td>
                <td
                  style={{
                    ...tdStyle,
                    maxWidth: 320,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.review_text || '—'}
                </td>
                <td style={tdStyle}>{item.rating || 5}/5</td>
                <td style={tdStyle}>{item.likes || 0}</td>
                <td style={tdStyle}>{item.display_order || 0}</td>
                <td style={tdStyle}>{item.is_active !== 'false' ? '✓' : '—'}</td>
                <td style={{...tdStyle, textAlign: 'right'}}>
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    style={{...btn(), marginRight: 6}}
                  >
                    編集
                  </button>
                  <button type="button" onClick={() => handleDelete(item)} style={btn(false, true)}>
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalOpen && (
        <Modal title={creating ? 'レビュー新規追加' : 'レビュー編集'} onClose={closeModal}>
          <div style={{display: 'grid', gap: 12}}>
            {creating && (
              <div>
                <label style={labelStyle}>Handle（省略時は自動生成）</label>
                <input
                  type="text"
                  value={fHandle}
                  onChange={(e) => setFHandle(e.target.value)}
                  style={inputStyle}
                  placeholder="ugc-review-xxx"
                />
              </div>
            )}
            <div>
              <label style={labelStyle}>ユーザー名 *</label>
              <input
                type="text"
                value={fUsername}
                onChange={(e) => setFUsername(e.target.value)}
                style={inputStyle}
                placeholder="ASTRO"
              />
            </div>
            <div>
              <label style={labelStyle}>レビュー本文 *</label>
              <textarea
                value={fReviewText}
                onChange={(e) => setFReviewText(e.target.value)}
                style={{...inputStyle, minHeight: 80, fontFamily: 'inherit'}}
                placeholder="購入してから3ヶ月、毎日使っていますが…"
              />
            </div>
            <div style={{display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr 1fr'}}>
              <div>
                <label style={labelStyle}>評価（1〜5）</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={fRating}
                  onChange={(e) =>
                    setFRating(Math.max(1, Math.min(5, parseInt(e.target.value, 10) || 5)))
                  }
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>いいね数</label>
                <input
                  type="number"
                  min="0"
                  value={fLikes}
                  onChange={(e) => setFLikes(parseInt(e.target.value, 10) || 0)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>表示順</label>
                <input
                  type="number"
                  value={fDisplayOrder}
                  onChange={(e) => setFDisplayOrder(parseInt(e.target.value, 10) || 0)}
                  style={inputStyle}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>アクセントカラー (HEX)</label>
              <input
                type="text"
                value={fAccentColor}
                onChange={(e) => setFAccentColor(e.target.value)}
                style={inputStyle}
                placeholder="#F06292"
              />
            </div>
            <div>
              <label style={labelStyle}>日付ラベル</label>
              <input
                type="text"
                value={fDateLabel}
                onChange={(e) => setFDateLabel(e.target.value)}
                style={inputStyle}
                placeholder="2026/04/15"
              />
            </div>
            <div>
              <label style={labelStyle}>商品名（任意）</label>
              <input
                type="text"
                value={fProductName}
                onChange={(e) => setFProductName(e.target.value)}
                style={inputStyle}
                placeholder="Astromeda Sirius RTX5080 モデル"
              />
            </div>
            <div>
              <label
                style={{...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}
              >
                <input
                  type="checkbox"
                  checked={fIsActive}
                  onChange={(e) => setFIsActive(e.target.checked)}
                />
                有効
              </label>
            </div>
            <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
              <button type="button" onClick={closeModal} style={btn()} disabled={saving}>
                キャンセル
              </button>
              <button type="button" onClick={handleSave} style={btn(true)} disabled={saving}>
                {saving ? '保存中…' : creating ? '作成' : '保存'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
