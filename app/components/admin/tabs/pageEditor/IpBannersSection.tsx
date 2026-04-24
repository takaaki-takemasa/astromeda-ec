/**
 * IpBannersSection — patch 0054 Phase C 第2段で AdminPageEditor.tsx から切り出し
 *
 * astromeda_ip_banner Metaobject を管理する UI。トップページ CollabGrid の表示を制御する。
 * Metaobject が空の時は COLLABS 26件フォールバックを表で表示し、「一括登録」ボタン1発で
 * Metaobject 化できるようにしてある (patch 0037)。編集モーダルは CollabGrid を右ペインに
 * ライブプレビューとして埋め込み、Shopify コレクション画像フォールバック (patch 0006) と
 * file_reference URL 解決 (patch 0026) の両方を反映する。
 *
 * 元々 AdminPageEditor.tsx の L825-1213 にインライン定義されていた ~389行を独立ファイル化。
 * 振る舞いは移動前と完全同一。
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {T, al, COLLABS} from '~/lib/astromeda-data';
import PreviewFrame, {type PreviewDevice} from '~/components/admin/preview/PreviewFrame';
import {CollabGrid} from '~/components/astro/CollabGrid';
import {ToggleSwitch} from '~/components/admin/ds/ToggleSwitch';
import {Wizard, type WizardStep} from '~/components/admin/ds/Wizard';
// patch 0152 (2026-04-24): IPバナーのリンク先を「コレクション/記事/外部URL」から選べるようにする
import {UrlPicker} from '~/components/admin/ds/UrlPicker';
import {
  type IpBanner,
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
// IpBannersSection (astromeda_ip_banner) — Sprint 4 Part C
// ══════════════════════════════════════════════════════════

export function IpBannersSection({pushToast, confirm}: SectionProps) {
  const [items, setItems] = useState<IpBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<IpBanner | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  // patch 0006: Shopify コレクション画像マップ (handle -> CDN URL)
  const [collabImages, setCollabImages] = useState<Record<string, string>>({});
  // patch 0037: 一括登録（COLLABS 26 件 → astromeda_ip_banner Metaobject）中フラグ
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<{collabs: IpBanner[]}>('/api/admin/homepage');
    setItems(res?.collabs || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // patch 0006: items 変化時 + マウント時に Shopify collection 画像を一括取得
  useEffect(() => {
    const handles: string[] = [];
    for (const it of items) if (it.shopHandle) handles.push(it.shopHandle);
    for (const c of COLLABS) if (c.shop) handles.push(c.shop);
    let cancelled = false;
    fetchCollectionImagesMap(handles).then((map) => {
      if (!cancelled) setCollabImages(map);
    });
    return () => {
      cancelled = true;
    };
  }, [items.map((i) => i.shopHandle).join('|')]);

  const synthCols = useMemo(() => synthesizeCollections(collabImages), [collabImages]);

  const handleSave = async (form: Partial<IpBanner> & {handle?: string}, isCreate: boolean) => {
    setSaving(true);
    const body: Record<string, unknown> = isCreate
      ? {
          action: 'create_collab',
          handle: form.handle || '',
          name: form.name || '',
          shopHandle: form.shopHandle || '',
          featured: form.featured ?? true,
          sortOrder: form.sortOrder ?? 0,
          image: form.image || undefined,
          tagline: form.tagline || undefined,
          label: form.label || undefined,
          // patch 0152: 自由リンク先 (記事/外部) を保存
          linkUrl: form.linkUrl || undefined,
        }
      : {
          action: 'update_collab',
          metaobjectId: form.id,
          name: form.name,
          shopHandle: form.shopHandle,
          featured: form.featured,
          sortOrder: form.sortOrder,
          image: form.image || undefined,
          tagline: form.tagline || undefined,
          label: form.label || undefined,
          // patch 0152: 自由リンク先 (記事/外部) を保存
          linkUrl: form.linkUrl || undefined,
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
    const res = await apiPost('/api/admin/homepage', {action: 'delete_collab', metaobjectId: id});
    if (res.success) {
      pushToast('削除しました', 'success');
      await load();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const modalOpen = creating || editing !== null;
  const initial: Partial<IpBanner> = creating ? {sortOrder: 0, featured: true} : editing || {};

  // patch 0037: astromeda_ip_banner Metaobject が空の時、
  // フロントが使っている COLLABS 26 件フォールバックをそのまま admin に表示し、
  // 「一括登録」で Metaobject 化できるようにする。
  const handleSeedCollabs = async () => {
    if (!(await confirm('COLLABS 26件を登録データに一括登録しますか？（既存エントリには影響しません）'))) return;
    setSeeding(true);
    try {
      const res = await fetch('/api/admin/cms-seed', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({types: ['astromeda_ip_banner']}),
      });
      const json = (await res.json().catch(() => ({}))) as {success?: boolean; error?: string};
      if (res.ok && json.success) {
        pushToast('COLLABS を登録データに登録しました', 'success');
        await load();
      } else {
        pushToast(`一括登録失敗: ${json.error || res.status}`, 'error');
      }
    } catch (e) {
      pushToast(`一括登録失敗: ${(e as Error).message}`, 'error');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>IPコラボバナー ({items.length})</div>
        <button type="button" onClick={() => setCreating(true)} style={btn(true)}>＋ 新規追加</button>
      </div>
      {loading ? (
        <div style={{textAlign: 'center', padding: 40}}><Spinner /></div>
      ) : items.length === 0 ? (
        <div>
          <div style={{
            background: al(T.c, 0.08),
            border: `1px solid ${al(T.c, 0.4)}`,
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
          }}>
            <div style={{flex: 1, minWidth: 240}}>
              <div style={{fontSize: 12, fontWeight: 800, color: T.tx, marginBottom: 4}}>
                まだ登録データがありません — ページは初期値の COLLABS 26件を表示中
              </div>
              <div style={{fontSize: 11, color: T.t4, lineHeight: 1.5}}>
                下に表示されているのが現在ページで使われている初期値の画像です。
                「一括登録」ボタンを押すと、26件を編集可能な登録データとして登録できます。
              </div>
            </div>
            <button
              type="button"
              onClick={handleSeedCollabs}
              disabled={seeding}
              style={{...btn(true), opacity: seeding ? 0.6 : 1}}
            >
              {seeding ? '登録中…' : '📦 COLLABS 26件を一括登録'}
            </button>
          </div>
          <table style={{width: '100%', borderCollapse: 'collapse'}}>
            <thead>
              <tr>
                <th style={thStyle}>現在の画像（フォールバック）</th>
                <th style={thStyle}>IP名</th>
                <th style={thStyle}>コレクション</th>
                <th style={thStyle}>ラベル</th>
                <th style={thStyle}>順</th>
                <th style={thStyle}>状態</th>
              </tr>
            </thead>
            <tbody>
              {COLLABS.map((c, idx) => {
                const img = c.shop ? collabImages[c.shop] : null;
                return (
                  <tr key={`fallback-${c.shop || idx}`}>
                    <td style={{...tdStyle, width: 84}}>
                      {img ? (
                        <img
                          src={img}
                          alt={c.name}
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
                          画像{'\n'}未取得
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>{c.name}</td>
                    <td style={{...tdStyle, color: T.t5, fontFamily: 'monospace', fontSize: 11}}>{c.shop || '—'}</td>
                    <td style={tdStyle}>{c.tag || '—'}</td>
                    <td style={tdStyle}>{idx + 1}</td>
                    <td style={{...tdStyle, color: T.t5, fontSize: 11}}>フォールバック</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <thead>
            <tr>
              {/* patch 0026: CEO 要望「同線にもどこかわかるように現在の画像を入れてください」
                  — 各行が storefront のどの IP コラボカードを制御するか一目で分かるように
                  現在の表示画像のサムネを先頭列に置く。Metaobject に image 未設定なら
                  shopHandle から解決した Shopify コレクション画像で代用する。*/}
              <th style={thStyle}>現在の画像</th>
              <th style={thStyle}>IP名</th>
              <th style={thStyle}>コレクション</th>
              <th style={thStyle}>ラベル</th>
              <th style={thStyle}>順</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const storedImg = (c.image || '').trim();
              const usableStored = storedImg && /^https?:\/\//i.test(storedImg) ? storedImg : null;
              const fallbackImg = c.shopHandle ? collabImages[c.shopHandle] : null;
              const thumb = usableStored || fallbackImg || null;
              return (
                <tr key={c.id}>
                  <td style={{...tdStyle, width: 84}}>
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={c.name || c.shopHandle || 'preview'}
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
                  <td style={tdStyle}>{c.name}</td>
                  <td style={{...tdStyle, color: T.t5, fontFamily: 'monospace', fontSize: 11}}>{c.shopHandle}</td>
                  <td style={tdStyle}>{c.label || '—'}</td>
                  <td style={tdStyle}>{c.sortOrder}</td>
                  <td style={tdStyle}>{c.featured ? '✓' : '—'}</td>
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

      {modalOpen && creating && (
        <IpBannerWizard
          saving={saving}
          collections={synthCols}
          collabImages={collabImages}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSubmit={(form) => handleSave(form, true)}
        />
      )}
      {modalOpen && !creating && editing && (
        <IpBannerForm
          initial={initial}
          isCreate={false}
          saving={saving}
          collections={synthCols}
          collabImages={collabImages}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSubmit={(form) => handleSave(form, false)}
        />
      )}
    </div>
  );
}

function IpBannerForm({
  initial,
  isCreate,
  saving,
  collections,
  collabImages,
  onCancel,
  onSubmit,
}: {
  initial: Partial<IpBanner>;
  isCreate: boolean;
  saving: boolean;
  collections: SynthCollection[];
  collabImages: Record<string, string>;
  onCancel: () => void;
  onSubmit: (form: Partial<IpBanner> & {handle?: string}) => void;
}) {
  const [handle, setHandle] = useState(initial.handle || '');
  const [name, setName] = useState(initial.name || '');
  const [shopHandle, setShopHandle] = useState(initial.shopHandle || '');
  const [image, setImage] = useState(initial.image || '');
  const [tagline, setTagline] = useState(initial.tagline || '');
  const [label, setLabel] = useState(initial.label || '');
  const [sortOrder, setSortOrder] = useState(initial.sortOrder ?? 0);
  const [featured, setFeatured] = useState(initial.featured ?? true);
  // patch 0152 (2026-04-24): 自由リンク先 (空のときは shopHandle から自動算出)
  const [linkUrl, setLinkUrl] = useState(initial.linkUrl || '');
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  // patch 0006: Live preview — Shopify collection 画像フォールバックを image URL に組込
  // 画像フィールドが空なら shopHandle から公開コレクション画像を引き当てる
  const resolvedImage = image || (shopHandle ? collabImages[shopHandle] || null : null);
  const previewMeta = [
    {
      id: initial.id || 'preview',
      handle: handle || 'preview',
      name: name || '(未入力)',
      shopHandle: shopHandle || 'preview',
      image: resolvedImage,
      tagline: tagline || null,
      label: label || null,
      sortOrder,
      featured: true,
    },
  ];

  const previewPane = (
    <PreviewFrame device={device} onDeviceChange={setDevice}>
      <CollabGrid collections={collections} metaCollabs={previewMeta} />
    </PreviewFrame>
  );

  return (
    <Modal
      title={isCreate ? 'IPコラボ 新規追加' : 'IPコラボ 編集'}
      onClose={onCancel}
      preview={previewPane}
    >
      <div style={{display: 'grid', gap: 12}}>
        {isCreate && (
          <div>
            <label style={labelStyle}>Handle</label>
            <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} style={inputStyle} placeholder="onepiece-collab" />
          </div>
        )}
        <div>
          <label style={labelStyle}>IP名</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="ONE PIECE" />
        </div>
        <div>
          {/* patch 0085: 「Shopifyコレクションハンドル」→「Shopify コレクション URL」 */}
          <label style={labelStyle}>Shopify コレクション URL 末尾</label>
          <input type="text" value={shopHandle} onChange={(e) => setShopHandle(e.target.value)} style={inputStyle} placeholder="onepiece" />
        </div>
        <div>
          {/* patch 0085: 「Shopify file GID」→「Shopify 画像 ID」（GID は内部用語） */}
          <label style={labelStyle}>画像 (URL または Shopify 画像 ID)</label>
          <input type="text" value={image} onChange={(e) => setImage(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>タグライン（任意）</label>
          <input type="text" value={tagline} onChange={(e) => setTagline(e.target.value)} style={inputStyle} placeholder="15カテゴリ" />
        </div>
        <div>
          <label style={labelStyle}>ラベル（NEW / HOT / COLLAB など）</label>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle} placeholder="HOT" />
        </div>
        <div>
          <label style={labelStyle}>表示順</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)} style={inputStyle} />
        </div>
        {/* patch 0152 (2026-04-24): リンク先を自由化。空の場合は shopHandle から /collections/ を自動算出。
            記事 (/blog/...) や外部 URL も指定可能。 */}
        <div style={{
          background: al(T.c, 0.06),
          border: `1px dashed ${al(T.c, 0.4)}`,
          borderRadius: 8,
          padding: '12px 14px',
        }}>
          <div style={{fontSize: 12, fontWeight: 700, color: T.tx, marginBottom: 6}}>
            🔗 リンク先 (任意・空の場合は上のコレクションが自動でリンク先になります)
          </div>
          <div style={{fontSize: 11, color: T.t4, marginBottom: 10}}>
            「記事」「外部 URL」など、コレクション以外をリンク先にしたい場合だけここを設定してください。
          </div>
          <UrlPicker
            value={linkUrl}
            onChange={setLinkUrl}
            optional
            label=""
          />
        </div>
        <div>
          <ToggleSwitch
            checked={featured}
            onChange={setFeatured}
            label="フロントに表示する"
            hint="オフにすると下書き扱いになり、お客様にはこのバナーが見えません。"
          />
        </div>
        <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
          <button type="button" onClick={onCancel} style={btn()} disabled={saving}>キャンセル</button>
          <button
            type="button"
            onClick={() => onSubmit({id: initial.id, handle, name, shopHandle, image, tagline, label, sortOrder, featured, linkUrl: linkUrl || null})}
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

// ══════════════════════════════════════════════════════════
// IpBannerWizard — patch 0086 (2026-04-20) R2-P2-1
// 「新規追加」フローだけウィザードに差し替え。3ステップで迷わず登録できる。
// 編集フローは既存の IpBannerForm をそのまま使う（既存 UX を壊さないため）。
// ══════════════════════════════════════════════════════════

function IpBannerWizard({
  saving,
  collections,
  collabImages,
  onCancel,
  onSubmit,
}: {
  saving: boolean;
  collections: SynthCollection[];
  collabImages: Record<string, string>;
  onCancel: () => void;
  onSubmit: (form: Partial<IpBanner> & {handle?: string}) => void;
}) {
  // ステップ①「基本情報」
  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [shopHandle, setShopHandle] = useState('');
  // ステップ②「見た目」
  const [image, setImage] = useState('');
  const [tagline, setTagline] = useState('');
  const [label, setLabel] = useState('');
  // ステップ③「公開設定」
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [featured, setFeatured] = useState<boolean>(true);

  const [device, setDevice] = useState<PreviewDevice>('desktop');

  // Handle 自動生成（IP名から slug っぽくする）— 空ならステップ③で generate
  const autoHandle = useMemo(() => {
    if (handle) return handle;
    const base = (name || shopHandle || '').toLowerCase().trim();
    return base.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  }, [handle, name, shopHandle]);

  // ライブプレビュー画像: image URL 入力が空なら Shopify コレクション画像で代替
  const resolvedImage = image || (shopHandle ? collabImages[shopHandle] || null : null);

  const previewMeta = [
    {
      id: 'preview',
      handle: autoHandle || 'preview',
      name: name || '(IP名未入力)',
      shopHandle: shopHandle || 'preview',
      image: resolvedImage,
      tagline: tagline || null,
      label: label || null,
      sortOrder,
      featured,
    },
  ];

  const previewPane = (
    <PreviewFrame device={device} onDeviceChange={setDevice}>
      <CollabGrid collections={collections} metaCollabs={previewMeta} />
    </PreviewFrame>
  );

  // バリデーション: ステップ①は name と shopHandle が必須
  const step1Ok = name.trim().length > 0 && shopHandle.trim().length > 0;

  const handleFinalSubmit = () => {
    onSubmit({
      handle: autoHandle,
      name,
      shopHandle,
      image: image || undefined,
      tagline: tagline || undefined,
      label: label || undefined,
      sortOrder,
      featured,
    });
  };

  const steps: WizardStep[] = [
    {
      id: 'basics',
      title: '① 基本情報',
      description: '最低限ここだけ入れれば登録できます。続きのステップは自動で後回しにできます。',
      canProceed: step1Ok,
      errorMessage: 'IP名と Shopify コレクション URL 末尾の両方を入力してください。',
      body: (
        <div style={{display: 'grid', gap: 12}}>
          <div>
            <label style={labelStyle}>
              IP名 <span style={{color: T.r, fontWeight: 800}}>＊</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              placeholder="例: ONE PIECE"
              autoFocus
            />
            <div style={{fontSize: 11, color: T.t5, marginTop: 4, lineHeight: 1.5}}>
              お客様に見えるバナーのタイトルになります。
            </div>
          </div>
          <div>
            <label style={labelStyle}>
              Shopify コレクション URL 末尾 <span style={{color: T.r, fontWeight: 800}}>＊</span>
            </label>
            <input
              type="text"
              value={shopHandle}
              onChange={(e) => setShopHandle(e.target.value)}
              style={inputStyle}
              placeholder="例: one-piece-bountyrush-collaboration"
            />
            <div style={{fontSize: 11, color: T.t5, marginTop: 4, lineHeight: 1.5}}>
              Shopify の商品コレクションを開いた時の URL 末尾部分（/collections/xxx の xxx）を入力してください。
              このコレクションの画像が自動でバナーに使われます。
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'visual',
      title: '② 見た目の調整（任意）',
      description: 'すべて省略できます。画像は Shopify コレクションのものが自動で使われます。',
      body: (
        <div style={{display: 'grid', gap: 12}}>
          <div>
            <label style={labelStyle}>画像 URL（任意）</label>
            <input
              type="text"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              style={inputStyle}
              placeholder="https://cdn.shopify.com/... または Shopify 画像 ID"
            />
            <div style={{fontSize: 11, color: T.t5, marginTop: 4, lineHeight: 1.5}}>
              空のままにすると Shopify の「{shopHandle || 'コレクション'}」の画像が自動で使われます。
              {resolvedImage && (
                <span style={{color: T.c, fontWeight: 700}}> 現在のプレビュー画像あり ✓</span>
              )}
            </div>
          </div>
          <div>
            <label style={labelStyle}>タグライン（任意）</label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              style={inputStyle}
              placeholder="例: 15カテゴリ"
            />
          </div>
          <div>
            <label style={labelStyle}>ラベル（任意）</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={inputStyle}
              placeholder="例: HOT / NEW / COLLAB"
            />
            <div style={{fontSize: 11, color: T.t5, marginTop: 4, lineHeight: 1.5}}>
              バナーの右上に小さく表示されるバッジです。
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'publish',
      title: '③ 公開設定',
      description: 'お客様に見せるか、下書きのままにするかを選んでください。',
      body: (
        <div style={{display: 'grid', gap: 12}}>
          <div>
            <label style={labelStyle}>表示順</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
              style={inputStyle}
            />
            <div style={{fontSize: 11, color: T.t5, marginTop: 4, lineHeight: 1.5}}>
              数字が小さいほど先に表示されます（0 が先頭）。分からない場合は 0 のままで OK です。
            </div>
          </div>
          <div>
            <ToggleSwitch
              checked={featured}
              onChange={setFeatured}
              label="すぐ公開する"
              hint="オフにすると下書き扱いになり、お客様にはこのバナーが見えません。"
            />
          </div>
          <div
            style={{
              padding: 12,
              background: al(T.c, 0.06),
              border: `1px solid ${al(T.c, 0.3)}`,
              borderRadius: 8,
              fontSize: 12,
              color: T.tx,
              lineHeight: 1.6,
            }}
          >
            <div style={{fontWeight: 700, marginBottom: 6}}>入力内容の確認</div>
            <div>IP名: <b>{name || '(未入力)'}</b></div>
            <div>Shopify URL 末尾: <b style={{fontFamily: 'monospace', fontSize: 11}}>{shopHandle || '(未入力)'}</b></div>
            <div>ラベル: <b>{label || 'なし'}</b></div>
            <div>画像: <b>{image ? '手動指定あり' : resolvedImage ? 'Shopify から自動取得' : 'グラデーション代用'}</b></div>
            <div>公開: <b>{featured ? 'すぐ公開' : '下書きのまま'}</b></div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <Modal title="IPコラボ 新規追加" onClose={onCancel} preview={previewPane}>
      <Wizard
        steps={steps}
        onCancel={onCancel}
        onSubmit={handleFinalSubmit}
        submitLabel="保存して公開"
        saving={saving}
      />
    </Modal>
  );
}
