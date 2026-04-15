/**
 * Admin Page Editor — Sprint 2 Part 4-B
 *
 * Metaobject 5種 (color_model / category_card / product_shelf / about_section / footer_config)
 * を管理画面から完全編集できる統合タブ。
 *
 * セキュリティ: 既存 admin._index.tsx の authGuard 継承、各 API が RateLimit→AdminAuth→RBAC→CSRF→Zod。
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useSearchParams} from 'react-router';
import {T, al} from '~/lib/astromeda-data';
import PreviewFrame, {type PreviewDevice} from '~/components/admin/preview/PreviewFrame';
import {PCShowcase} from '~/components/astro/PCShowcase';

// ══════════════════════════════════════════════════════════
// 型定義
// ══════════════════════════════════════════════════════════

interface ColorModel {
  id: string;
  handle: string;
  name: string;
  slug: string;
  image: string | null;
  colorCode: string;
  sortOrder: number;
  isActive: boolean;
}
interface CategoryCard {
  id: string;
  handle: string;
  title: string;
  description: string;
  priceFrom: number;
  image: string | null;
  linkUrl: string;
  sortOrder: number;
  isActive: boolean;
}
interface ProductShelf {
  id: string;
  handle: string;
  title: string;
  productIds: string[];
  sortOrder: number;
  isActive: boolean;
}
interface AboutSection {
  id: string;
  handle: string;
  title: string;
  bodyHtml: string;
  image: string | null;
  linkUrl: string;
  linkLabel: string;
  isActive: boolean;
}
interface FooterConfig {
  id: string;
  handle: string;
  sectionTitle: string;
  links: Array<{label: string; url: string}>;
  sortOrder: number;
  isActive: boolean;
}

type SubTab = 'color_models' | 'category_cards' | 'product_shelves' | 'about_sections' | 'footer_configs';

type Toast = {id: number; message: string; type: 'success' | 'error'};

// ══════════════════════════════════════════════════════════
// 共通スタイル
// ══════════════════════════════════════════════════════════

const cardStyle: React.CSSProperties = {
  background: T.bgC,
  border: `1px solid ${al(T.tx, 0.08)}`,
  borderRadius: 10,
  padding: 20,
};
const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: T.t4,
  letterSpacing: 1,
  marginBottom: 6,
  display: 'block',
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: T.bg,
  border: `1px solid ${al(T.tx, 0.15)}`,
  borderRadius: 6,
  color: T.tx,
  fontSize: 13,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
const btn = (primary = false, danger = false): React.CSSProperties => ({
  padding: '6px 14px',
  background: primary ? T.c : danger ? 'transparent' : 'transparent',
  border: `1px solid ${primary ? T.c : danger ? al(T.r, 0.5) : al(T.tx, 0.25)}`,
  borderRadius: 6,
  color: primary ? T.bg : danger ? T.r : T.tx,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
});
const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  color: T.t4,
  fontSize: 11,
  fontWeight: 700,
  borderBottom: `1px solid ${al(T.tx, 0.1)}`,
};
const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  color: T.tx,
  fontSize: 12,
  borderBottom: `1px solid ${al(T.tx, 0.05)}`,
};

// ══════════════════════════════════════════════════════════
// 共通ヘルパー
// ══════════════════════════════════════════════════════════

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const push = useCallback((message: string, type: 'success' | 'error') => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, {id, message, type}]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);
  return {toasts, push};
}

function Spinner() {
  return (
    <div
      style={{
        width: 14,
        height: 14,
        border: `2px solid ${al(T.c, 0.3)}`,
        borderTopColor: T.c,
        borderRadius: '50%',
        animation: 'aped-spin 0.8s linear infinite',
      }}
    />
  );
}

function ToastContainer({toasts}: {toasts: Toast[]}) {
  return (
    <div style={{position: 'fixed', bottom: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999}}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            padding: '10px 16px',
            background: t.type === 'success' ? al(T.c, 0.95) : al(T.r, 0.95),
            color: T.bg,
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            boxShadow: '0 4px 12px rgba(0,0,0,.4)',
            minWidth: 220,
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
  preview,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  preview?: React.ReactNode;
}) {
  const isTwoPane = !!preview;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: T.bg,
          border: `1px solid ${al(T.tx, 0.15)}`,
          borderRadius: 12,
          width: '100%',
          maxWidth: isTwoPane ? 1400 : 600,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 12px 32px rgba(0,0,0,.6)',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: `1px solid ${al(T.tx, 0.1)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{fontSize: 14, fontWeight: 900, color: T.tx}}>{title}</div>
          <button type="button" onClick={onClose} style={{...btn(), padding: '4px 10px'}}>
            ×
          </button>
        </div>
        {isTwoPane ? (
          <div
            className="admin-modal-2pane"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(360px, 1fr) minmax(380px, 1.3fr)',
              flex: 1,
              minHeight: 0,
            }}
          >
            <div
              style={{
                padding: 20,
                overflow: 'auto',
                borderRight: `1px solid ${al(T.tx, 0.08)}`,
              }}
            >
              {children}
            </div>
            <div style={{padding: 16, background: al(T.tx, 0.02), overflow: 'auto'}}>
              {preview}
            </div>
          </div>
        ) : (
          <div style={{padding: 20, overflow: 'auto'}}>{children}</div>
        )}
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @media (max-width: 1100px) {
          .admin-modal-2pane {
            grid-template-columns: 1fr !important;
          }
        }
      `}} />
    </div>
  );
}

async function apiPost(endpoint: string, body: Record<string, unknown>): Promise<{success: boolean; error?: string; [k: string]: unknown}> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return json as {success: boolean; error?: string};
  } catch (err) {
    return {success: false, error: err instanceof Error ? err.message : 'Network error'};
  }
}

async function apiGet<T>(endpoint: string): Promise<T | null> {
  try {
    const res = await fetch(endpoint, {credentials: 'include'});
    if (!res.ok) return null;
    const json = (await res.json()) as {success?: boolean} & T;
    if (json.success === false) return null;
    return json as T;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════
// メインコンポーネント
// ══════════════════════════════════════════════════════════

const VALID_SUB_TABS: SubTab[] = ['color_models', 'category_cards', 'product_shelves', 'about_sections', 'footer_configs'];

export default function AdminPageEditor() {
  const [searchParams] = useSearchParams();
  const subParam = searchParams.get('sub');
  const initialSubTab: SubTab =
    subParam && (VALID_SUB_TABS as string[]).includes(subParam) ? (subParam as SubTab) : 'color_models';
  const [subTab, setSubTab] = useState<SubTab>(initialSubTab);

  // URL の sub パラメータ変化に追従（Site Map からの遷移対応）
  useEffect(() => {
    if (subParam && (VALID_SUB_TABS as string[]).includes(subParam)) {
      setSubTab(subParam as SubTab);
    }
  }, [subParam]);

  const {toasts, push} = useToasts();

  const tabs: Array<{key: SubTab; label: string}> = [
    {key: 'color_models', label: 'カラーモデル'},
    {key: 'category_cards', label: 'カテゴリカード'},
    {key: 'product_shelves', label: '商品棚'},
    {key: 'about_sections', label: 'ABOUT'},
    {key: 'footer_configs', label: 'フッター'},
  ];

  return (
    <div style={{padding: 20, color: T.tx}}>
      <div style={{marginBottom: 16}}>
        <h2 style={{fontSize: 18, fontWeight: 900, margin: 0, color: T.tx}}>ページ編集</h2>
        <div style={{fontSize: 11, color: T.t4, marginTop: 4}}>
          トップページ構成要素を Metaobject で編集します。管理画面の変更は保存後すぐ本番に反映されます。
        </div>
      </div>

      <div style={{display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${al(T.tx, 0.1)}`, flexWrap: 'wrap'}}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSubTab(t.key)}
            style={{
              padding: '10px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${subTab === t.key ? T.c : 'transparent'}`,
              color: subTab === t.key ? T.tx : T.t4,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'color_models' && <ColorModelsSection pushToast={push} />}
      {subTab === 'category_cards' && <CategoryCardsSection pushToast={push} />}
      {subTab === 'product_shelves' && <ProductShelvesSection pushToast={push} />}
      {subTab === 'about_sections' && <AboutSectionsSection pushToast={push} />}
      {subTab === 'footer_configs' && <FooterConfigsSection pushToast={push} />}

      <ToastContainer toasts={toasts} />
      <style dangerouslySetInnerHTML={{__html: `@keyframes aped-spin { to { transform: rotate(360deg); } }`}} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ColorModelsSection
// ══════════════════════════════════════════════════════════

interface SectionProps {
  pushToast: (msg: string, type: 'success' | 'error') => void;
}

function ColorModelsSection({pushToast}: SectionProps) {
  const [items, setItems] = useState<ColorModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ColorModel | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<{colorModels: ColorModel[]}>('/api/admin/color-models');
    setItems(res?.colorModels || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

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
    if (!window.confirm('このエントリを削除しますか？')) return;
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

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>PC カラーモデル ({items.length})</div>
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
              <th style={thStyle}>色</th>
              <th style={thStyle}>名前</th>
              <th style={thStyle}>slug</th>
              <th style={thStyle}>順</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
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
            ))}
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
          <label style={{...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            有効 (フロント表示)
          </label>
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

// ══════════════════════════════════════════════════════════
// CategoryCardsSection
// ══════════════════════════════════════════════════════════

function CategoryCardsSection({pushToast}: SectionProps) {
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
    if (!window.confirm('このエントリを削除しますか？')) return;
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
            {items.map((c) => (
              <tr key={c.id}>
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
            ))}
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

  return (
    <Modal title={isCreate ? 'カテゴリカード 新規追加' : 'カテゴリカード 編集'} onClose={onCancel}>
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
          <label style={labelStyle}>リンク URL</label>
          <input type="text" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} style={inputStyle} placeholder="/collections/astromeda" />
        </div>
        <div>
          <label style={labelStyle}>表示順</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)} style={inputStyle} />
        </div>
        <div>
          <label style={{...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            有効
          </label>
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

// ══════════════════════════════════════════════════════════
// ProductShelvesSection
// ══════════════════════════════════════════════════════════

function ProductShelvesSection({pushToast}: SectionProps) {
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
          productIds: form.productIds || [],
          sortOrder: form.sortOrder ?? 0,
          isActive: form.isActive ?? true,
        }
      : {
          action: 'update',
          metaobjectId: form.id,
          title: form.title,
          productIds: form.productIds,
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
    if (!window.confirm('このエントリを削除しますか？')) return;
    const res = await apiPost('/api/admin/product-shelves', {action: 'delete', metaobjectId: id});
    if (res.success) {
      pushToast('削除しました', 'success');
      await load();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const modalOpen = creating || editing !== null;
  const initial: Partial<ProductShelf> = creating ? {sortOrder: 0, isActive: true, productIds: []} : editing || {};

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
  const [productIds, setProductIds] = useState<string[]>(initial.productIds || []);
  const [sortOrder, setSortOrder] = useState(initial.sortOrder ?? 0);
  const [isActive, setIsActive] = useState(initial.isActive ?? true);

  const updateId = (idx: number, value: string) => {
    setProductIds((prev) => prev.map((x, i) => (i === idx ? value : x)));
  };
  const addId = () => setProductIds((prev) => [...prev, '']);
  const removeId = (idx: number) => setProductIds((prev) => prev.filter((_, i) => i !== idx));

  return (
    <Modal title={isCreate ? '商品棚 新規追加' : '商品棚 編集'} onClose={onCancel}>
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
          <label style={labelStyle}>商品 GID 一覧 ({productIds.length} 件)</label>
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
          <label style={{...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            有効
          </label>
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
                productIds: productIds.filter((x) => x.trim() !== ''),
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

// ══════════════════════════════════════════════════════════
// AboutSectionsSection
// ══════════════════════════════════════════════════════════

function AboutSectionsSection({pushToast}: SectionProps) {
  const [items, setItems] = useState<AboutSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AboutSection | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<{aboutSections: AboutSection[]}>('/api/admin/about-sections');
    setItems(res?.aboutSections || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (form: Partial<AboutSection> & {handle?: string}, isCreate: boolean) => {
    setSaving(true);
    const body: Record<string, unknown> = isCreate
      ? {
          action: 'create',
          handle: form.handle || '',
          title: form.title || '',
          bodyHtml: form.bodyHtml || '',
          linkUrl: form.linkUrl || '',
          linkLabel: form.linkLabel || '',
          isActive: form.isActive ?? true,
          image: form.image || undefined,
        }
      : {
          action: 'update',
          metaobjectId: form.id,
          title: form.title,
          bodyHtml: form.bodyHtml,
          linkUrl: form.linkUrl,
          linkLabel: form.linkLabel,
          isActive: form.isActive,
          image: form.image || undefined,
        };
    const res = await apiPost('/api/admin/about-sections', body);
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
    if (!window.confirm('このエントリを削除しますか？')) return;
    const res = await apiPost('/api/admin/about-sections', {action: 'delete', metaobjectId: id});
    if (res.success) {
      pushToast('削除しました', 'success');
      await load();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const modalOpen = creating || editing !== null;
  const initial: Partial<AboutSection> = creating ? {isActive: true} : editing || {};

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>ABOUT セクション ({items.length})</div>
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
              <th style={thStyle}>本文 (抜粋)</th>
              <th style={thStyle}>リンクラベル</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td style={tdStyle}>{c.title}</td>
                <td style={{...tdStyle, color: T.t5, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                  {c.bodyHtml.replace(/<[^>]*>/g, '').slice(0, 60)}
                </td>
                <td style={tdStyle}>{c.linkLabel}</td>
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
        <AboutSectionForm
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

function AboutSectionForm({
  initial,
  isCreate,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: Partial<AboutSection>;
  isCreate: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (form: Partial<AboutSection> & {handle?: string}) => void;
}) {
  const [handle, setHandle] = useState(initial.handle || '');
  const [title, setTitle] = useState(initial.title || '');
  const [bodyHtml, setBodyHtml] = useState(initial.bodyHtml || '');
  const [image, setImage] = useState(initial.image || '');
  const [linkUrl, setLinkUrl] = useState(initial.linkUrl || '');
  const [linkLabel, setLinkLabel] = useState(initial.linkLabel || '');
  const [isActive, setIsActive] = useState(initial.isActive ?? true);

  return (
    <Modal title={isCreate ? 'ABOUT セクション 新規追加' : 'ABOUT セクション 編集'} onClose={onCancel}>
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
          <label style={labelStyle}>本文 HTML</label>
          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            rows={6}
            style={{...inputStyle, fontFamily: 'monospace'}}
          />
          <div style={{fontSize: 10, color: T.t4, marginTop: 4}}>
            &lt;script&gt;タグは使用不可。その他 HTML タグは許可。
          </div>
        </div>
        <div>
          <label style={labelStyle}>image (Shopify file GID、optional)</label>
          <input type="text" value={image} onChange={(e) => setImage(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>リンク URL</label>
          <input type="text" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>リンクラベル</label>
          <input type="text" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} style={inputStyle} placeholder="詳しく見る →" />
        </div>
        <div>
          <label style={{...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            有効
          </label>
        </div>
        <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
          <button type="button" onClick={onCancel} style={btn()} disabled={saving}>キャンセル</button>
          <button
            type="button"
            onClick={() => onSubmit({id: initial.id, handle, title, bodyHtml, image, linkUrl, linkLabel, isActive})}
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
// FooterConfigsSection
// ══════════════════════════════════════════════════════════

function FooterConfigsSection({pushToast}: SectionProps) {
  const [items, setItems] = useState<FooterConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FooterConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<{footerConfigs: FooterConfig[]}>('/api/admin/footer-configs');
    setItems(res?.footerConfigs || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (form: Partial<FooterConfig> & {handle?: string}, isCreate: boolean) => {
    setSaving(true);
    const body: Record<string, unknown> = isCreate
      ? {
          action: 'create',
          handle: form.handle || '',
          sectionTitle: form.sectionTitle || '',
          links: form.links || [],
          sortOrder: form.sortOrder ?? 0,
          isActive: form.isActive ?? true,
        }
      : {
          action: 'update',
          metaobjectId: form.id,
          sectionTitle: form.sectionTitle,
          links: form.links,
          sortOrder: form.sortOrder,
          isActive: form.isActive,
        };
    const res = await apiPost('/api/admin/footer-configs', body);
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
    if (!window.confirm('このエントリを削除しますか？')) return;
    const res = await apiPost('/api/admin/footer-configs', {action: 'delete', metaobjectId: id});
    if (res.success) {
      pushToast('削除しました', 'success');
      await load();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const modalOpen = creating || editing !== null;
  const initial: Partial<FooterConfig> = creating ? {sortOrder: 0, isActive: true, links: []} : editing || {};

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>フッター設定 ({items.length})</div>
        <button type="button" onClick={() => setCreating(true)} style={btn(true)}>＋ 新規追加</button>
      </div>
      <div style={{fontSize: 10, color: T.t4, marginBottom: 10}}>
        ※ 全エントリが完全 (section_title + links ≥1) になった時点でフロント Footer が Metaobject 表示に切替わります。不完全な間は既存の 13 リンク固定表示。
      </div>
      {loading ? (
        <div style={{textAlign: 'center', padding: 40}}><Spinner /></div>
      ) : items.length === 0 ? (
        <div style={{color: T.t4, fontSize: 12, textAlign: 'center', padding: 30}}>エントリがありません</div>
      ) : (
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <thead>
            <tr>
              <th style={thStyle}>セクション名</th>
              <th style={thStyle}>リンク数</th>
              <th style={thStyle}>順</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td style={tdStyle}>{c.sectionTitle}</td>
                <td style={tdStyle}>{c.links.length}</td>
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
        <FooterConfigForm
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

function FooterConfigForm({
  initial,
  isCreate,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: Partial<FooterConfig>;
  isCreate: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (form: Partial<FooterConfig> & {handle?: string}) => void;
}) {
  const [handle, setHandle] = useState(initial.handle || '');
  const [sectionTitle, setSectionTitle] = useState(initial.sectionTitle || '');
  const [links, setLinks] = useState<Array<{label: string; url: string}>>(initial.links || []);
  const [sortOrder, setSortOrder] = useState(initial.sortOrder ?? 0);
  const [isActive, setIsActive] = useState(initial.isActive ?? true);

  const updateLink = (idx: number, key: 'label' | 'url', value: string) => {
    setLinks((prev) => prev.map((x, i) => (i === idx ? {...x, [key]: value} : x)));
  };
  const addLink = () => setLinks((prev) => [...prev, {label: '', url: ''}]);
  const removeLink = (idx: number) => setLinks((prev) => prev.filter((_, i) => i !== idx));

  return (
    <Modal title={isCreate ? 'フッター 新規追加' : 'フッター 編集'} onClose={onCancel}>
      <div style={{display: 'grid', gap: 12}}>
        {isCreate && (
          <div>
            <label style={labelStyle}>Handle</label>
            <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} style={inputStyle} />
          </div>
        )}
        <div>
          <label style={labelStyle}>セクション名</label>
          <input type="text" value={sectionTitle} onChange={(e) => setSectionTitle(e.target.value)} style={inputStyle} placeholder="ポリシー" />
        </div>
        <div>
          <label style={labelStyle}>リンク一覧 ({links.length} 件)</label>
          <div style={{display: 'grid', gap: 6}}>
            {links.map((lk, i) => (
              <div key={i} style={{display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 6}}>
                <input
                  type="text"
                  value={lk.label}
                  onChange={(e) => updateLink(i, 'label', e.target.value)}
                  placeholder="利用規約"
                  style={inputStyle}
                />
                <input
                  type="text"
                  value={lk.url}
                  onChange={(e) => updateLink(i, 'url', e.target.value)}
                  placeholder="/policies/terms"
                  style={inputStyle}
                />
                <button type="button" onClick={() => removeLink(i)} style={btn(false, true)}>−</button>
              </div>
            ))}
            <button type="button" onClick={addLink} style={{...btn(), alignSelf: 'flex-start'}}>＋ リンク追加</button>
          </div>
        </div>
        <div>
          <label style={labelStyle}>表示順</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)} style={inputStyle} />
        </div>
        <div>
          <label style={{...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            有効
          </label>
        </div>
        <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
          <button type="button" onClick={onCancel} style={btn()} disabled={saving}>キャンセル</button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                id: initial.id,
                handle,
                sectionTitle,
                links: links.filter((l) => l.label.trim() !== '' && l.url.trim() !== ''),
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
