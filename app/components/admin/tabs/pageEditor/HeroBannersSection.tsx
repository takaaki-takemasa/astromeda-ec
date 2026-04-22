/**
 * HeroBannersSection — patch 0055 Phase C 第2段で AdminPageEditor.tsx から切り出し
 *
 * astromeda_hero_banner Metaobject を管理する UI。トップページ HeroSlider の表示を制御する。
 * items が 3 件未満の時は「⬇ FEATURED から自動投入」ボタンを表示し、/api/admin/cms-seed で
 * デフォルトの 3 バナー (新着/IPコラボ/ティア) を一括作成できる (patch 0027)。
 * 編集モーダルは HeroSlider を右ペインにライブプレビューとして埋め込み、Shopify コレクション
 * 画像フォールバック (patch 0006) と file_reference URL 解決 (patch 0026) の両方を反映する。
 *
 * 元々 AdminPageEditor.tsx の L828-1192 にインライン定義されていた ~365行を独立ファイル化。
 * 振る舞いは移動前と完全同一。
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {T, al, COLLABS} from '~/lib/astromeda-data';
import PreviewFrame, {type PreviewDevice} from '~/components/admin/preview/PreviewFrame';
import {HeroSlider} from '~/components/astro/HeroSlider';
import {ToggleSwitch} from '~/components/admin/ds/ToggleSwitch';
import {
  type HeroBanner,
  type SectionProps,
  type SynthCollection,
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
  fetchCollectionImagesMap,
  synthesizeCollections,
} from './shared';

// ══════════════════════════════════════════════════════════
// HeroBannersSection (astromeda_hero_banner) — Sprint 4 Part C
// ══════════════════════════════════════════════════════════

export function HeroBannersSection({pushToast, confirm}: SectionProps) {
  const [items, setItems] = useState<HeroBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<HeroBanner | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  // patch 0006: Shopify コレクション画像マップ (handle -> CDN URL)
  const [heroImages, setHeroImages] = useState<Record<string, string>>({});
  // patch 0027: FEATURED 自動投入ボタンの処理中フラグ
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<{banners: HeroBanner[]}>('/api/admin/homepage');
    setItems(res?.banners || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // patch 0027: CEO 指摘「なんで現在のバナーがないのか」 → FEATURED 初期値を Metaobject に自動投入。
  // /api/admin/cms-seed は冪等なので既存 handle はスキップされる（再実行しても安全）。
  const handleSeedFromFeatured = useCallback(async () => {
    const ok = await confirm(
      'FEATURED の初期ヒーローバナー 3件を自動投入します。既存のエントリはそのまま残ります。実行しますか？',
    );
    if (!ok) return;
    setSeeding(true);
    const res = await apiPost('/api/admin/cms-seed', {
      types: ['astromeda_hero_banner'],
    });
    setSeeding(false);
    if (res.success) {
      const totals = (res as {totals?: {created?: number; skipped?: number}}).totals || {};
      const created = totals.created ?? 0;
      const skipped = totals.skipped ?? 0;
      pushToast(`投入完了: 新規 ${created} 件 / スキップ ${skipped} 件`, 'success');
      await load();
    } else {
      pushToast(`投入失敗: ${res.error || 'unknown'}`, 'error');
    }
  }, [confirm, pushToast, load]);

  // patch 0006: items 変化時 + マウント時に Shopify collection 画像を一括取得
  // HeroSlider は MetaBanner.handle をコレクション handle として imageMap を引く
  useEffect(() => {
    const handles: string[] = [];
    for (const it of items) if (it.handle) handles.push(it.handle);
    for (const c of COLLABS) if (c.shop) handles.push(c.shop);
    let cancelled = false;
    fetchCollectionImagesMap(handles).then((map) => {
      if (!cancelled) setHeroImages(map);
    });
    return () => {
      cancelled = true;
    };
  }, [items.map((i) => i.handle).join('|')]);

  const synthCols = useMemo(() => synthesizeCollections(heroImages), [heroImages]);

  const handleSave = async (form: Partial<HeroBanner> & {handle?: string}, isCreate: boolean) => {
    setSaving(true);
    const body: Record<string, unknown> = isCreate
      ? {
          action: 'create_banner',
          handle: form.handle || '',
          title: form.title || '',
          subtitle: form.subtitle || undefined,
          image: form.image || undefined,
          linkUrl: form.linkUrl || undefined,
          ctaLabel: form.ctaLabel || undefined,
          sortOrder: form.sortOrder ?? 0,
          active: form.active ?? true,
          startAt: form.startAt || undefined,
          endAt: form.endAt || undefined,
        }
      : {
          action: 'update_banner',
          metaobjectId: form.id,
          title: form.title,
          subtitle: form.subtitle || undefined,
          image: form.image || undefined,
          linkUrl: form.linkUrl || undefined,
          ctaLabel: form.ctaLabel || undefined,
          sortOrder: form.sortOrder,
          active: form.active,
          startAt: form.startAt || undefined,
          endAt: form.endAt || undefined,
        };
    const res = await apiPost('/api/admin/homepage', body);
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
    const res = await apiPost('/api/admin/homepage', {action: 'delete_banner', metaobjectId: id});
    if (res.success) {
      pushToast('削除しました', 'success');
      await load();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const modalOpen = creating || editing !== null;
  const initial: Partial<HeroBanner> = creating ? {sortOrder: 0, active: true} : editing || {};

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap'}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>ヒーローバナー ({items.length})</div>
        <div style={{display: 'flex', gap: 6}}>
          {/* patch 0027: items が空 or 少ない時に初期データ投入ショートカット */}
          {items.length < 3 && (
            <button
              type="button"
              onClick={() => void handleSeedFromFeatured()}
              style={{
                ...btn(false),
                background: al(T.g, 0.12),
                border: `1px solid ${al(T.g, 0.4)}`,
                color: T.g,
              }}
              disabled={seeding}
              title="FEATURED 初期バナー 3件を一括投入（既存はスキップ）"
            >
              {seeding ? '投入中...' : '⬇ FEATURED から自動投入'}
            </button>
          )}
          <button type="button" onClick={() => setCreating(true)} style={btn(true)}>＋ 新規追加</button>
        </div>
      </div>
      {loading ? (
        <div style={{textAlign: 'center', padding: 40}}><Spinner /></div>
      ) : items.length === 0 ? (
        <div style={{color: T.t4, fontSize: 12, textAlign: 'center', padding: 30}}>
          エントリがありません。<br />
          <span style={{color: T.t5, fontSize: 11}}>
            上の <b style={{color: T.g}}>「⬇ FEATURED から自動投入」</b> ボタンでデフォルトの 3 バナー（新着/IPコラボ/ティア）を一括作成できます。
          </span>
        </div>
      ) : (
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <thead>
            <tr>
              {/* patch 0026: CEO 要望「現在の画像を入れてください」— ヒーロー配信先のコレクション画像を先頭列に。*/}
              <th style={thStyle}>現在の画像</th>
              <th style={thStyle}>タイトル</th>
              <th style={thStyle}>CTA</th>
              <th style={thStyle}>期間</th>
              <th style={thStyle}>順</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const storedImg = (c.image || '').trim();
              const usableStored = storedImg && /^https?:\/\//i.test(storedImg) ? storedImg : null;
              const fallbackImg = c.handle ? heroImages[c.handle] : null;
              const thumb = usableStored || fallbackImg || null;
              return (
                <tr key={c.id}>
                  <td style={{...tdStyle, width: 84}}>
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={c.title || c.handle || 'preview'}
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
                  <td style={{...tdStyle, color: T.t5}}>{c.ctaLabel || '—'}</td>
                  <td style={{...tdStyle, color: T.t5, fontSize: 10, fontFamily: 'monospace'}}>
                    {c.startAt || '∞'} 〜 {c.endAt || '∞'}
                  </td>
                  <td style={tdStyle}>{c.sortOrder}</td>
                  <td style={tdStyle}>{c.active ? '✓' : '—'}</td>
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
        <HeroBannerForm
          initial={initial}
          isCreate={creating}
          saving={saving}
          collections={synthCols}
          heroImages={heroImages}
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

function HeroBannerForm({
  initial,
  isCreate,
  saving,
  collections,
  heroImages,
  onCancel,
  onSubmit,
}: {
  initial: Partial<HeroBanner>;
  isCreate: boolean;
  saving: boolean;
  collections: SynthCollection[];
  heroImages: Record<string, string>;
  onCancel: () => void;
  onSubmit: (form: Partial<HeroBanner> & {handle?: string}) => void;
}) {
  const [handle, setHandle] = useState(initial.handle || '');
  const [title, setTitle] = useState(initial.title || '');
  const [subtitle, setSubtitle] = useState(initial.subtitle || '');
  const [image, setImage] = useState(initial.image || '');
  const [linkUrl, setLinkUrl] = useState(initial.linkUrl || '');
  const [ctaLabel, setCtaLabel] = useState(initial.ctaLabel || '');
  const [sortOrder, setSortOrder] = useState(initial.sortOrder ?? 0);
  const [active, setActive] = useState(initial.active ?? true);
  const [startAt, setStartAt] = useState(initial.startAt || '');
  const [endAt, setEndAt] = useState(initial.endAt || '');
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  // patch 0006: Live preview — Shopify collection 画像フォールバック
  // 画像フィールドが空なら handle から公開コレクション画像を引き当てる
  const resolvedImage = image || (handle ? heroImages[handle] || null : null);
  const previewMeta = [
    {
      id: initial.id || 'preview',
      handle: handle || 'preview',
      title: title || '(タイトル未入力)',
      subtitle: subtitle || null,
      image: resolvedImage,
      linkUrl: linkUrl || null,
      ctaLabel: ctaLabel || null,
      sortOrder,
      isActive: true,
      startAt: null, // preview では期間フィルタ無効化
      endAt: null,
    },
  ];

  const previewPane = (
    <PreviewFrame device={device} onDeviceChange={setDevice}>
      <HeroSlider collections={collections} metaBanners={previewMeta} />
    </PreviewFrame>
  );

  return (
    <Modal
      title={isCreate ? 'ヒーローバナー 新規追加' : 'ヒーローバナー 編集'}
      onClose={onCancel}
      preview={previewPane}
    >
      <div style={{display: 'grid', gap: 12}}>
        {isCreate && (
          <div>
            <label style={labelStyle}>Handle</label>
            <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} style={inputStyle} placeholder="spring-sale-banner" />
          </div>
        )}
        <div>
          <label style={labelStyle}>タイトル</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>サブタイトル（任意）</label>
          <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>画像（画像URL または Shopify 画像ID）</label>
          <input type="text" value={image} onChange={(e) => setImage(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>リンク URL</label>
          <input type="text" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} style={inputStyle} placeholder="/collections/sale" />
        </div>
        <div>
          <label style={labelStyle}>CTA ラベル</label>
          <input type="text" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} style={inputStyle} placeholder="今すぐ見る →" />
        </div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
          <div>
            <label style={labelStyle}>開始日時（ISO）</label>
            <input type="text" value={startAt} onChange={(e) => setStartAt(e.target.value)} style={inputStyle} placeholder="2026-01-01T00:00:00Z" />
          </div>
          <div>
            <label style={labelStyle}>終了日時（ISO）</label>
            <input type="text" value={endAt} onChange={(e) => setEndAt(e.target.value)} style={inputStyle} placeholder="2026-12-31T23:59:59Z" />
          </div>
        </div>
        <div>
          <label style={labelStyle}>表示順</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)} style={inputStyle} />
        </div>
        <div>
          <ToggleSwitch
            checked={active}
            onChange={setActive}
            label="フロントに表示する"
            hint="オフにすると下書き扱いになり、お客様にはこのバナーが見えません。"
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
                image,
                linkUrl,
                ctaLabel,
                sortOrder,
                active,
                startAt,
                endAt,
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
