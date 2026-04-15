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
import {CollabGrid} from '~/components/astro/CollabGrid';
import {HeroSlider} from '~/components/astro/HeroSlider';

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
  subtitle: string;
  productIds: string[];
  limit: number;
  sortKey: 'manual' | 'best_selling' | 'newest';
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

interface IpBanner {
  id: string;
  handle: string;
  name: string;
  shopHandle: string;
  image: string | null;
  tagline: string | null;
  label: string | null;
  sortOrder: number;
  featured: boolean;
}

interface HeroBanner {
  id: string;
  handle: string;
  title: string;
  subtitle: string | null;
  image: string | null;
  linkUrl: string | null;
  ctaLabel: string | null;
  sortOrder: number;
  active: boolean;
  startAt: string | null;
  endAt: string | null;
}

type SubTab = 'color_models' | 'category_cards' | 'product_shelves' | 'about_sections' | 'footer_configs' | 'ip_banners' | 'hero_banners' | 'customization_matrix';

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

const VALID_SUB_TABS: SubTab[] = ['color_models', 'category_cards', 'product_shelves', 'about_sections', 'footer_configs', 'ip_banners', 'hero_banners', 'customization_matrix'];

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
    {key: 'ip_banners', label: 'IPコラボ'},
    {key: 'hero_banners', label: 'ヒーローバナー'},
    {key: 'color_models', label: 'カラーモデル'},
    {key: 'category_cards', label: 'カテゴリカード'},
    {key: 'product_shelves', label: '商品棚'},
    {key: 'about_sections', label: 'ABOUT'},
    {key: 'footer_configs', label: 'フッター'},
    {key: 'customization_matrix', label: 'カスタマイズマトリックス'},
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

      {subTab === 'ip_banners' && <IpBannersSection pushToast={push} />}
      {subTab === 'hero_banners' && <HeroBannersSection pushToast={push} />}
      {subTab === 'color_models' && <ColorModelsSection pushToast={push} />}
      {subTab === 'category_cards' && <CategoryCardsSection pushToast={push} />}
      {subTab === 'product_shelves' && <ProductShelvesSection pushToast={push} />}
      {subTab === 'about_sections' && <AboutSectionsSection pushToast={push} />}
      {subTab === 'footer_configs' && <FooterConfigsSection pushToast={push} />}
      {subTab === 'customization_matrix' && <CustomizationMatrixSection pushToast={push} />}

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
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  // Live preview — 2カラム ABOUT セクション(左 image / 右 title+bodyHtml+CTA)
  const safeBodyHtml = bodyHtml.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  const previewPane = (
    <PreviewFrame device={device} onDeviceChange={setDevice}>
      <div style={{padding: 32, opacity: isActive ? 1 : 0.5}}>
        <div
          className="aped-about-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: device === 'mobile' ? '1fr' : '1fr 1fr',
            gap: 28,
            alignItems: 'center',
            background: `linear-gradient(135deg, #0a0e1a 0%, #0f1a2e 50%, #162040 100%)`,
            border: `1px solid ${al(T.c, 0.15)}`,
            borderRadius: 16,
            padding: 32,
          }}
        >
          {/* 左: Image */}
          <div
            style={{
              aspectRatio: '4/3',
              borderRadius: 12,
              overflow: 'hidden',
              position: 'relative',
              background: image
                ? T.bg
                : `linear-gradient(160deg, ${al(T.c, 0.18)}, ${al(T.tx, 0.02)} 70%)`,
              border: `1px solid ${al(T.tx, 0.08)}`,
            }}
          >
            {image && /^https?:\/\//.test(image) ? (
              <img
                src={image}
                alt={title || ''}
                style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block'}}
              />
            ) : (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: T.t4,
                  fontSize: 11,
                }}
              >
                {image ? `(GID: ${image.slice(0, 30)}...)` : '(画像未設定)'}
              </div>
            )}
          </div>

          {/* 右: Content */}
          <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: T.c,
                letterSpacing: 4,
                opacity: 0.8,
              }}
            >
              ABOUT
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 900,
                color: '#fff',
                lineHeight: 1.3,
                margin: 0,
              }}
            >
              {title || '(タイトル未入力)'}
            </div>
            {safeBodyHtml ? (
              <div
                style={{
                  fontSize: 13,
                  color: T.t5,
                  lineHeight: 1.7,
                }}
                dangerouslySetInnerHTML={{__html: safeBodyHtml}}
              />
            ) : (
              <div style={{fontSize: 12, color: T.t4, fontStyle: 'italic'}}>
                (本文未入力)
              </div>
            )}
            {(linkLabel || linkUrl) && (
              <div style={{marginTop: 8}}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '10px 20px',
                    background: al(T.c, 0.12),
                    border: `1px solid ${al(T.c, 0.4)}`,
                    borderRadius: 8,
                    color: T.c,
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: 1,
                  }}
                >
                  {linkLabel || '(ラベル未入力)'}
                </span>
                {linkUrl && (
                  <div style={{fontSize: 9, color: T.t4, marginTop: 4, fontFamily: 'monospace'}}>
                    → {linkUrl}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{fontSize: 9, color: T.t4, textAlign: 'center', marginTop: 14}}>
          ※ 2カラム layout preview (mobile = 縦積み)
        </div>
      </div>
    </PreviewFrame>
  );

  return (
    <Modal
      title={isCreate ? 'ABOUT セクション 新規追加' : 'ABOUT セクション 編集'}
      onClose={onCancel}
      preview={previewPane}
    >
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
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  const updateLink = (idx: number, key: 'label' | 'url', value: string) => {
    setLinks((prev) => prev.map((x, i) => (i === idx ? {...x, [key]: value} : x)));
  };
  const addLink = () => setLinks((prev) => [...prev, {label: '', url: ''}]);
  const removeLink = (idx: number) => setLinks((prev) => prev.filter((_, i) => i !== idx));
  const moveLink = (idx: number, dir: -1 | 1) => {
    setLinks((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  // Live preview — AstroFooter.tsx multi-column mode を再現
  // 1 FooterConfig エントリ = 1 カラム。編集中カラム + 3 プレースホルダーで 4カラムグリッド
  const previewLinks = links.filter((l) => l.label.trim() !== '');
  const isMobile = device === 'mobile';
  const previewPane = (
    <PreviewFrame device={device} onDeviceChange={setDevice}>
      <footer
        style={{
          borderTop: `1px solid ${al(T.c, 0.2)}`,
          background: '#000',
          opacity: isActive ? 1 : 0.5,
        }}
      >
        <section style={{padding: '36px 28px 20px'}}>
          {/* Brand */}
          <div style={{marginBottom: 28}}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 900,
                color: T.tx,
                letterSpacing: 4,
                marginBottom: 8,
              }}
            >
              ASTROMEDA
            </div>
            <div style={{fontSize: 11, color: T.t4, maxWidth: 500, lineHeight: 1.6}}>
              株式会社マイニングベースが手掛けるゲーミングPCブランド。
            </div>
          </div>

          {/* 4-column grid (編集中カラム + 3 placeholder) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)',
              gap: 20,
              marginBottom: 28,
            }}
          >
            {/* 編集中カラム */}
            <div>
              <div
                style={{
                  fontWeight: 800,
                  color: T.tx,
                  fontSize: 12,
                  letterSpacing: 1,
                  marginBottom: 10,
                  paddingBottom: 6,
                  borderBottom: `1px solid ${al(T.c, 0.3)}`,
                }}
              >
                {sectionTitle || '(セクション名未入力)'}
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                {previewLinks.length === 0 ? (
                  <div style={{fontSize: 10, color: T.t4, fontStyle: 'italic'}}>(リンク未設定)</div>
                ) : (
                  previewLinks.map((lk, i) => (
                    <div
                      key={`link-${i}-${lk.label}`}
                      style={{
                        color: T.t4,
                        textDecoration: 'underline',
                        fontSize: 11,
                        cursor: 'default',
                        display: 'block',
                        lineHeight: 1.4,
                      }}
                    >
                      {lk.label}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* placeholder columns (non-mobile のみ) */}
            {!isMobile &&
              [0, 1, 2].map((i) => (
                <div key={`ph${i}`}>
                  <div
                    style={{
                      fontWeight: 800,
                      color: al(T.tx, 0.25),
                      fontSize: 12,
                      letterSpacing: 1,
                      marginBottom: 10,
                      paddingBottom: 6,
                      borderBottom: `1px dashed ${al(T.tx, 0.1)}`,
                    }}
                  >
                    (他のカラム)
                  </div>
                  <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                    {[0, 1, 2].map((j) => (
                      <div
                        key={j}
                        style={{
                          height: 8,
                          background: al(T.tx, 0.05),
                          borderRadius: 2,
                          width: `${60 + j * 10}%`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </div>

          {/* Copyright + SNS (固定) */}
          <div
            style={{
              borderTop: `1px solid ${al(T.tx, 0.1)}`,
              paddingTop: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{fontSize: 10, color: T.t3}}>
              © 2026 Mining Base Co., Ltd. ALL RIGHTS RESERVED.
            </div>
            <div style={{display: 'flex', gap: 10, fontSize: 10, color: T.t4}}>
              <span>X</span>
              <span>LINE</span>
              <span>Instagram</span>
            </div>
          </div>
        </section>
      </footer>
      <div style={{fontSize: 9, color: T.t4, textAlign: 'center', marginTop: 8, padding: '0 8px'}}>
        ※ 1 エントリ = 1 カラム。他カラムは別 FooterConfig エントリとして管理
      </div>
    </PreviewFrame>
  );

  return (
    <Modal title={isCreate ? 'フッター 新規追加' : 'フッター 編集'} onClose={onCancel} preview={previewPane}>
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
              <div key={i} style={{display: 'grid', gridTemplateColumns: '1fr 2fr auto auto auto', gap: 4, alignItems: 'center'}}>
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
                <button type="button" onClick={() => moveLink(i, -1)} disabled={i === 0} style={{...btn(), padding: '4px 8px'}}>↑</button>
                <button type="button" onClick={() => moveLink(i, 1)} disabled={i === links.length - 1} style={{...btn(), padding: '4px 8px'}}>↓</button>
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

// ══════════════════════════════════════════════════════════
// IpBannersSection (astromeda_ip_banner) — Sprint 4 Part C
// ══════════════════════════════════════════════════════════

function IpBannersSection({pushToast}: SectionProps) {
  const [items, setItems] = useState<IpBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<IpBanner | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<{collabs: IpBanner[]}>('/api/admin/homepage');
    setItems(res?.collabs || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

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
    if (!window.confirm('このエントリを削除しますか？')) return;
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

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>IPコラボバナー ({items.length})</div>
        <button type="button" onClick={() => setCreating(true)} style={btn(true)}>＋ 新規追加</button>
      </div>
      {loading ? (
        <div style={{textAlign: 'center', padding: 40}}><Spinner /></div>
      ) : items.length === 0 ? (
        <div style={{color: T.t4, fontSize: 12, textAlign: 'center', padding: 30}}>エントリがありません（フロントは COLLABS 26件フォールバック使用中）</div>
      ) : (
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <thead>
            <tr>
              <th style={thStyle}>IP名</th>
              <th style={thStyle}>コレクション</th>
              <th style={thStyle}>ラベル</th>
              <th style={thStyle}>順</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
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
            ))}
          </tbody>
        </table>
      )}

      {modalOpen && (
        <IpBannerForm
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

function IpBannerForm({
  initial,
  isCreate,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: Partial<IpBanner>;
  isCreate: boolean;
  saving: boolean;
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
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  // Live preview: CollabGrid に 1 件の MetaCollab を渡して 1 カードを描画
  const previewMeta = [
    {
      id: initial.id || 'preview',
      handle: handle || 'preview',
      name: name || '(未入力)',
      shopHandle: shopHandle || 'preview',
      image: image || null,
      tagline: tagline || null,
      label: label || null,
      sortOrder,
      featured: true,
    },
  ];

  const previewPane = (
    <PreviewFrame device={device} onDeviceChange={setDevice}>
      <CollabGrid collections={null} metaCollabs={previewMeta} />
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
          <label style={labelStyle}>Shopifyコレクションハンドル</label>
          <input type="text" value={shopHandle} onChange={(e) => setShopHandle(e.target.value)} style={inputStyle} placeholder="onepiece" />
        </div>
        <div>
          <label style={labelStyle}>画像 (URL または Shopify file GID)</label>
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
        <div>
          <label style={{...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
            有効（フロント表示）
          </label>
        </div>
        <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
          <button type="button" onClick={onCancel} style={btn()} disabled={saving}>キャンセル</button>
          <button
            type="button"
            onClick={() => onSubmit({id: initial.id, handle, name, shopHandle, image, tagline, label, sortOrder, featured})}
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
// HeroBannersSection (astromeda_hero_banner) — Sprint 4 Part C
// ══════════════════════════════════════════════════════════

function HeroBannersSection({pushToast}: SectionProps) {
  const [items, setItems] = useState<HeroBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<HeroBanner | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<{banners: HeroBanner[]}>('/api/admin/homepage');
    setItems(res?.banners || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

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
    if (!window.confirm('このエントリを削除しますか？')) return;
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
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>ヒーローバナー ({items.length})</div>
        <button type="button" onClick={() => setCreating(true)} style={btn(true)}>＋ 新規追加</button>
      </div>
      {loading ? (
        <div style={{textAlign: 'center', padding: 40}}><Spinner /></div>
      ) : items.length === 0 ? (
        <div style={{color: T.t4, fontSize: 12, textAlign: 'center', padding: 30}}>エントリがありません（フロントは FEATURED フォールバック使用中）</div>
      ) : (
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <thead>
            <tr>
              <th style={thStyle}>タイトル</th>
              <th style={thStyle}>CTA</th>
              <th style={thStyle}>期間</th>
              <th style={thStyle}>順</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
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
            ))}
          </tbody>
        </table>
      )}

      {modalOpen && (
        <HeroBannerForm
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

function HeroBannerForm({
  initial,
  isCreate,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: Partial<HeroBanner>;
  isCreate: boolean;
  saving: boolean;
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

  const previewMeta = [
    {
      id: initial.id || 'preview',
      handle: handle || 'preview',
      title: title || '(タイトル未入力)',
      subtitle: subtitle || null,
      image: image || null,
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
      <HeroSlider collections={null} metaBanners={previewMeta} />
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
          <label style={labelStyle}>画像 (URL または Shopify file GID)</label>
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
          <label style={{...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            有効（フロント表示）
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

// ══════════════════════════════════════════════════════════
// CustomizationMatrixSection — Sprint 5 M2
// 商品タグ × カスタマイズ option のマトリックス編集
// ══════════════════════════════════════════════════════════

interface MatrixOption {
  id: string;
  handle: string;
  name: string;
  category: string;
  choices: Array<{value: string; label: string}>;
  isRequired: boolean;
  sortOrder: number;
  appliesToTags: string; // CSV
}

function CustomizationMatrixSection({pushToast}: SectionProps) {
  const [options, setOptions] = useState<MatrixOption[]>([]);
  const [productTags, setProductTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // 初回ロード: 全商品 (ページネーションで最大 200 件まで) + カスタマイズ option
  const load = useCallback(async () => {
    setLoading(true);
    const optRes = await apiGet<{options: MatrixOption[]}>('/api/admin/customization');
    const allOptions = (optRes?.options || []).sort((a, b) => a.sortOrder - b.sortOrder);

    // 商品タグ収集: 50 件 × 最大 4 ページ = 200 件まで
    type ProductsPageResponse = {
      products: Array<{tags: string[]; cursor: string}>;
      pageInfo: {hasNextPage: boolean; endCursor: string | null};
    };
    const tagSet = new Set<string>();
    let cursor: string | undefined = undefined;
    for (let page = 0; page < 4; page++) {
      const url: string = cursor
        ? `/api/admin/products?limit=50&cursor=${encodeURIComponent(cursor)}`
        : '/api/admin/products?limit=50';
      const res: ProductsPageResponse | null = await apiGet<ProductsPageResponse>(url);
      if (!res) break;
      for (const p of res.products || []) {
        for (const t of p.tags || []) {
          if (t.trim()) tagSet.add(t.trim().toLowerCase());
        }
      }
      if (!res.pageInfo?.hasNextPage) break;
      cursor = res.pageInfo.endCursor || undefined;
      if (!cursor) break;
    }
    const sortedTags = Array.from(tagSet).sort();

    setOptions(allOptions);
    setProductTags(sortedTags);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // セル状態判定: option.appliesToTags (CSV) に tag が含まれるか
  // appliesToTags が空 = 全商品適用なので全セル ON として扱う
  const isChecked = useCallback((opt: MatrixOption, tag: string): boolean => {
    const tags = opt.appliesToTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (tags.length === 0) return true;
    return tags.includes(tag);
  }, []);

  // tag set を更新 + debounce 保存
  const updateOptionTags = useCallback(
    (optId: string, newTagsLower: Set<string>) => {
      const newCsv = Array.from(newTagsLower).sort().join(',');
      setOptions((prev) =>
        prev.map((o) => (o.id === optId ? {...o, appliesToTags: newCsv} : o)),
      );
      if (debounceRef.current[optId]) {
        clearTimeout(debounceRef.current[optId]);
      }
      debounceRef.current[optId] = setTimeout(async () => {
        setSavingMap((prev) => ({...prev, [optId]: true}));
        const res = await apiPost('/api/admin/customization', {
          action: 'update',
          metaobjectId: optId,
          appliesToTags: newCsv,
        });
        setSavingMap((prev) => {
          const next = {...prev};
          delete next[optId];
          return next;
        });
        if (!res.success) {
          pushToast(`保存失敗: ${res.error || 'unknown'}`, 'error');
        }
      }, 300);
    },
    [pushToast],
  );

  const toggleCell = (opt: MatrixOption, tag: string) => {
    const currentTags = new Set(
      opt.appliesToTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
    );
    // 空 = 全適用状態からの初回操作: 全タグを明示セットしたうえで対象タグを抜く
    if (currentTags.size === 0) {
      productTags.forEach((t) => currentTags.add(t));
    }
    if (currentTags.has(tag)) currentTags.delete(tag);
    else currentTags.add(tag);
    updateOptionTags(opt.id, currentTags);
  };

  const setAllForOption = (opt: MatrixOption, enable: boolean) => {
    const next = new Set<string>();
    if (enable) productTags.forEach((t) => next.add(t));
    updateOptionTags(opt.id, next);
  };

  const toggleColumn = (tag: string) => {
    // 全 option で当該 tag の状態を集計 → 半数以上が ON なら全 OFF、それ以外は全 ON
    const onCount = options.filter((o) => isChecked(o, tag)).length;
    const enable = onCount < options.length / 2;
    options.forEach((opt) => {
      const currentTags = new Set(
        opt.appliesToTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
      );
      if (currentTags.size === 0) {
        productTags.forEach((t) => currentTags.add(t));
      }
      if (enable) currentTags.add(tag);
      else currentTags.delete(tag);
      updateOptionTags(opt.id, currentTags);
    });
  };

  // フィルタリング
  const searchLower = search.trim().toLowerCase();
  const filteredOptions = searchLower
    ? options.filter(
        (o) => o.name.toLowerCase().includes(searchLower) || o.category.toLowerCase().includes(searchLower),
      )
    : options;
  const filteredTags = searchLower
    ? productTags.filter((t) => t.includes(searchLower))
    : productTags;

  if (loading) {
    return (
      <div style={cardStyle}>
        <div style={{textAlign: 'center', padding: 40}}>
          <Spinner />
          <div style={{fontSize: 11, color: T.t4, marginTop: 10}}>商品タグ + option を取得中...</div>
        </div>
      </div>
    );
  }

  if (options.length === 0 || productTags.length === 0) {
    return (
      <div style={cardStyle}>
        <div style={{textAlign: 'center', padding: 30, color: T.t4, fontSize: 12}}>
          {options.length === 0 && <div>カスタマイズ option が未登録です。</div>}
          {productTags.length === 0 && <div>商品タグが検出できません（全商品で tags 未設定の可能性）。</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap'}}>
        <div>
          <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>カスタマイズマトリックス</div>
          <div style={{fontSize: 10, color: T.t4, marginTop: 2}}>
            商品タグ {productTags.length} 種 × option {options.length} 件 = {productTags.length * options.length} セル
          </div>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="タグ・option名で絞り込み"
          style={{...inputStyle, maxWidth: 260}}
        />
      </div>

      <div style={{fontSize: 10, color: T.t4, marginBottom: 10}}>
        ※ チェック ON = その option がその商品タグに適用される。空行(全チェック)= 全商品適用。変更は 300ms debounce で自動保存。
      </div>

      <div style={{overflow: 'auto', maxHeight: '65vh', border: `1px solid ${al(T.tx, 0.08)}`, borderRadius: 6}}>
        <table style={{borderCollapse: 'separate', borderSpacing: 0, fontSize: 11}}>
          <thead>
            <tr>
              <th
                style={{
                  position: 'sticky',
                  top: 0,
                  left: 0,
                  zIndex: 3,
                  background: T.bgC,
                  padding: '8px 10px',
                  borderBottom: `1px solid ${al(T.tx, 0.1)}`,
                  borderRight: `1px solid ${al(T.tx, 0.1)}`,
                  textAlign: 'left',
                  color: T.t4,
                  fontSize: 10,
                  minWidth: 200,
                }}
              >
                option ＼ タグ
              </th>
              {filteredTags.map((tag) => (
                <th
                  key={tag}
                  onClick={() => toggleColumn(tag)}
                  title={`列一括トグル: ${tag}`}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    background: T.bgC,
                    padding: '8px 6px',
                    borderBottom: `1px solid ${al(T.tx, 0.1)}`,
                    color: T.t5,
                    fontSize: 9,
                    fontWeight: 700,
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    cursor: 'pointer',
                    minWidth: 28,
                    maxHeight: 100,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tag}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredOptions.map((opt) => {
              const isSaving = !!savingMap[opt.id];
              return (
                <tr key={opt.id}>
                  <td
                    style={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                      background: T.bg,
                      padding: '6px 10px',
                      borderBottom: `1px solid ${al(T.tx, 0.05)}`,
                      borderRight: `1px solid ${al(T.tx, 0.1)}`,
                      color: T.tx,
                      minWidth: 200,
                    }}
                  >
                    <div style={{display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                      <div style={{flex: 1, minWidth: 0}}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {opt.name}
                        </div>
                        <div style={{fontSize: 9, color: T.t4}}>{opt.category}</div>
                      </div>
                      <button type="button" onClick={() => setAllForOption(opt, true)} title="全タグ対象化" style={{...btn(), padding: '2px 6px', fontSize: 9}}>
                        全ON
                      </button>
                      <button type="button" onClick={() => setAllForOption(opt, false)} title="全タグ解除" style={{...btn(), padding: '2px 6px', fontSize: 9}}>
                        全OFF
                      </button>
                      {isSaving && <span style={{fontSize: 9, color: T.c}}>●</span>}
                    </div>
                  </td>
                  {filteredTags.map((tag) => {
                    const checked = isChecked(opt, tag);
                    return (
                      <td
                        key={tag}
                        style={{
                          textAlign: 'center',
                          padding: 0,
                          borderBottom: `1px solid ${al(T.tx, 0.05)}`,
                          background: checked ? al(T.c, 0.08) : 'transparent',
                          minWidth: 28,
                        }}
                      >
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCell(opt, tag)}
                            style={{accentColor: T.c, cursor: 'pointer'}}
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{fontSize: 10, color: T.t4, marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap'}}>
        <span>● 保存中</span>
        <span>行ヘッダ: 全ON/全OFF ショートカット</span>
        <span>列ヘッダクリック: 列一括トグル</span>
      </div>
    </div>
  );
}
