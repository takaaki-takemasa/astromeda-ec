/**
 * AdminHomepageCMS Tab — ホームページCMS管理
 *
 * IPコラボ / ヒーローバナー / 8色カラー / マーキー を管理。
 * /api/admin/cms 統一エンドポイントと連携。CRUDフォーム付き。
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { color } from '~/lib/design-tokens';
import { CompactKPI } from '~/components/admin/CompactKPI';
import { Modal } from '~/components/admin/Modal';
import PreviewFrame, { type PreviewDevice } from '~/components/admin/preview/PreviewFrame';
import { PCShowcase, type MetaColorModel } from '~/components/astro/PCShowcase';
import { HeroSlider, type MetaBanner } from '~/components/astro/HeroSlider';
import { CollabGrid, type MetaCollab } from '~/components/astro/CollabGrid';
import { T, al } from '~/lib/astromeda-data';
import { UrlPicker } from '~/components/admin/ds/UrlPicker';
import { ImagePicker } from '~/components/admin/ds/ImagePicker';
import { CanonicalRedirectBanner } from '~/components/admin/ds/CanonicalRedirectBanner';
import { AdminListSkeleton, AdminEmptyCard } from '~/components/admin/ds/InlineListState';

// ── Types ──
interface MetaField {
  key: string;
  value: string;
}

interface MetaobjectNode {
  id: string;
  handle: string;
  type: string;
  updatedAt?: string;
  fields: MetaField[];
}

type SubTab = 'collabs' | 'banners' | 'colors' | 'marquee';

// ── Styles ──
const cardStyle: React.CSSProperties = {
  background: color.bg1,
  border: `1px solid ${color.border}`,
  borderRadius: 12,
  overflow: 'hidden',
};

const rowStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: `1px solid ${color.border}`,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: color.bg0,
  border: `1px solid ${color.border}`,
  borderRadius: 8,
  color: color.text,
  fontSize: 13,
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: color.textMuted,
  marginBottom: 4,
  display: 'block',
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 20px',
  fontSize: 13,
  fontWeight: 700,
  color: '#000',
  background: color.cyan,
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: 600,
  color: color.textMuted,
  background: 'transparent',
  border: `1px solid ${color.border}`,
  borderRadius: 8,
  cursor: 'pointer',
};

const btnDanger: React.CSSProperties = {
  ...btnSecondary,
  color: color.red,
  borderColor: 'rgba(255,45,85,.3)',
};

// ── Helper: extract field value ──
// v166+ /api/admin/cms はフィールドをノード直下にフラット化して返す。
// 旧形式 (node.fields[]) も後方互換で対応。
function f(node: MetaobjectNode | Record<string, unknown>, key: string): string {
  const n = node as Record<string, unknown>;
  // 直接プロパティ (v166+ フラット形式)
  const direct = n[key];
  if (typeof direct === 'string') return direct;
  if (typeof direct === 'number' || typeof direct === 'boolean') return String(direct);
  // 旧形式: fields[] 配列
  const fields = (n as {fields?: Array<{key: string; value: string}>}).fields;
  if (Array.isArray(fields)) {
    return fields.find((x) => x.key === key)?.value ?? '';
  }
  return '';
}

// ── CMS API wrapper ──
async function cmsGet(type: string): Promise<MetaobjectNode[]> {
  const res = await fetch(`/api/admin/cms?type=${type}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const json = await res.json();
  return json.items ?? [];
}

async function cmsPost(body: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('/api/admin/cms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Shopify コレクション画像の一括取得（プレビュー用フォールバック）──
// 管理画面で画像を未設定でも、collection_handle/shop_handle から公開コレクションの画像を補完する。
async function fetchCollectionImages(
  handles: string[],
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(handles.filter(Boolean)));
  if (unique.length === 0) return {};
  try {
    const res = await fetch('/api/admin/collection-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handles: unique }),
    });
    if (!res.ok) return {};
    const json = await res.json();
    return (json?.images ?? {}) as Record<string, string>;
  } catch {
    return {};
  }
}

/** items の特定 key から handle を集めて Shopify 画像を取得し handle→url map を返す hook */
function useShopifyCollectionImages(
  items: MetaobjectNode[],
  handleKey: string,
  extraHandles: string[] = [],
): Record<string, string> {
  const [images, setImages] = useState<Record<string, string>>({});
  const handles = useMemo(
    () => {
      const arr: string[] = [];
      for (const item of items) {
        const h = f(item, handleKey);
        if (h) arr.push(h);
      }
      for (const h of extraHandles) if (h) arr.push(h);
      return Array.from(new Set(arr));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, handleKey, extraHandles.join('|')],
  );

  useEffect(() => {
    if (handles.length === 0) {
      setImages({});
      return;
    }
    let cancelled = false;
    fetchCollectionImages(handles).then((map) => {
      if (!cancelled) setImages(map);
    });
    return () => {
      cancelled = true;
    };
  }, [handles.join('|')]);

  return images;
}

/** handle→image を CollabGrid/HeroSlider の collections[] 形式に変換 */
function synthCollections(
  images: Record<string, string>,
): Array<{ id: string; title: string; handle: string; image: { url: string } }> {
  return Object.entries(images).map(([handle, url]) => ({
    id: `synth-${handle}`,
    title: handle,
    handle,
    image: { url },
  }));
}

// ══════════════════════════════════════
// Main Component
// ══════════════════════════════════════
export default function AdminHomepageCMS() {
  const [activeTab, setActiveTab] = useState<SubTab>('collabs');
  const [collabs, setCollabs] = useState<MetaobjectNode[]>([]);
  const [banners, setBanners] = useState<MetaobjectNode[]>([]);
  const [colors, setColors] = useState<MetaobjectNode[]>([]);
  const [marquee, setMarquee] = useState<MetaobjectNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [c, b, co, m] = await Promise.all([
        cmsGet('astromeda_ip_banner'),
        cmsGet('astromeda_hero_banner'),
        cmsGet('astromeda_pc_color'),
        cmsGet('astromeda_marquee_item'),
      ]);
      setCollabs(c);
      setBanners(b);
      setColors(co);
      setMarquee(m);
    } catch (e) {
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const showMsg = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(null), 3000);
  };

  const tabs: { key: SubTab; label: string; count: number }[] = [
    { key: 'collabs', label: 'IPコラボ', count: collabs.length },
    { key: 'banners', label: 'ヒーローバナー', count: banners.length },
    { key: 'colors', label: '8色カラー', count: colors.length },
    { key: 'marquee', label: 'マーキー', count: marquee.length },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: color.text, margin: '0 0 16px' }}>
        ホームページCMS
      </h2>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 20 }}>
        <CompactKPI label="IPコラボ" value={String(collabs.length)} />
        <CompactKPI label="バナー" value={String(banners.length)} />
        <CompactKPI label="カラー" value={String(colors.length)} />
        <CompactKPI label="マーキー" value={String(marquee.length)} />
      </div>

      {/* Status Messages */}
      {msg && (
        <div style={{
          background: msg.includes('失敗') || msg.includes('エラー') ? '#3a1515' : '#153a1a',
          border: `1px solid ${msg.includes('失敗') || msg.includes('エラー') ? '#6b2020' : '#206b2a'}`,
          borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13,
          color: msg.includes('失敗') || msg.includes('エラー') ? '#ff6b6b' : '#6bff7b',
        }}>
          {msg}
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${color.border}`, marginBottom: 20 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: activeTab === t.key ? 700 : 400,
              color: activeTab === t.key ? color.cyan : color.textMuted,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === t.key ? `2px solid ${color.cyan}` : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {loading && <AdminListSkeleton rows={5} />}
      {error && <div style={{ color: '#ff6b6b', fontSize: 14, marginBottom: 16 }}>{error}</div>}

      {!loading && activeTab === 'collabs' && (
        <>
          <CanonicalRedirectBanner metaobjectType="astromeda_ip_banner" currentTab="homepage" />
          <CollabList items={collabs} onRefresh={fetchAll} onMsg={showMsg} />
        </>
      )}
      {!loading && activeTab === 'banners' && (
        <>
          <CanonicalRedirectBanner metaobjectType="astromeda_hero_banner" currentTab="homepage" />
          <BannerList items={banners} onRefresh={fetchAll} onMsg={showMsg} />
        </>
      )}
      {!loading && activeTab === 'colors' && (
        <>
          <CanonicalRedirectBanner metaobjectType="astromeda_pc_color" currentTab="homepage" />
          <ColorList items={colors} onRefresh={fetchAll} onMsg={showMsg} />
        </>
      )}
      {!loading && activeTab === 'marquee' && (
        <>
          <CanonicalRedirectBanner metaobjectType="astromeda_marquee_item" currentTab="homepage" />
          <MarqueeList items={marquee} onRefresh={fetchAll} onMsg={showMsg} />
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════
// IPコラボ一覧 + 編集
// ══════════════════════════════════════
function CollabList({ items, onRefresh, onMsg }: { items: MetaobjectNode[]; onRefresh: () => void; onMsg: (s: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');

  const startEdit = (item: MetaobjectNode) => {
    setEditing(item.id);
    setForm({
      name: f(item, 'name'),
      collection_handle: f(item, 'collection_handle'),
      tagline: f(item, 'tagline'),
      label: f(item, 'label'),
      display_order: f(item, 'display_order'),
      is_active: f(item, 'is_active'),
    });
  };

  const save = async (id: string) => {
    const res = await cmsPost({
      type: 'astromeda_ip_banner',
      action: 'update',
      id,
      fields: Object.entries(form).map(([key, value]) => ({ key, value })),
    });
    if (res.success) { onMsg('IPコラボを更新しました'); setEditing(null); onRefresh(); }
    else onMsg(`エラー: ${res.error}`);
  };

  const sorted = [...items].sort((a, b) => Number(f(a, 'display_order') || 99) - Number(f(b, 'display_order') || 99));

  // 編集中のフォーム値にあるハンドルも含めて Shopify 画像を取得（プレビューをリアル反映）
  const extraHandles = useMemo(
    () => (editing && form.collection_handle ? [form.collection_handle] : []),
    [editing, form.collection_handle],
  );
  const shopifyImages = useShopifyCollectionImages(items, 'collection_handle', extraHandles);
  const synthCols = useMemo(() => synthCollections(shopifyImages), [shopifyImages]);

  // ── プレビュー: 編集中 item を form 値で上書き ──
  const previewMetaCollabs = useMemo<MetaCollab[]>(() => {
    const mapItem = (item: MetaobjectNode): MetaCollab => {
      const useForm = editing === item.id;
      const nm = useForm ? form.name : f(item, 'name');
      const sh = useForm ? form.collection_handle : f(item, 'collection_handle');
      const tl = useForm ? form.tagline : f(item, 'tagline');
      const lb = useForm ? form.label : f(item, 'label');
      const ord = useForm ? form.display_order : f(item, 'display_order');
      const fe = useForm ? form.is_active : f(item, 'is_active');
      // 画像: Metaobject image field（file_reference のURL形式）> Shopify collection 画像 > null
      const storedImg = f(item, 'image');
      const fallbackImg = sh ? shopifyImages[sh] : undefined;
      return {
        id: item.id,
        handle: item.handle,
        name: nm || '(未入力)',
        shopHandle: sh || '',
        image: storedImg || fallbackImg || null,
        tagline: tl || null,
        label: lb || null,
        sortOrder: Number(ord || 99),
        featured: fe === 'true',
      };
    };
    return items.map(mapItem);
  }, [items, editing, form, shopifyImages]);

  const isModalOpen = !!editing;
  const closeModal = () => { setEditing(null); };
  const modalSave = () => { if (editing) save(editing); };

  const previewPane = (
    <PreviewFrame device={previewDevice} onDeviceChange={setPreviewDevice}>
      <div style={{background: T.bg, padding: 'clamp(8px, 2vw, 16px)'}}>
        <CollabGrid collections={synthCols} metaCollabs={previewMetaCollabs} />
      </div>
    </PreviewFrame>
  );

  const renderForm = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <div>
        <label style={labelStyle}>IP名</label>
        <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div>
        <label style={labelStyle}>Shopifyハンドル</label>
        <input style={inputStyle} value={form.collection_handle} onChange={(e) => setForm({ ...form, collection_handle: e.target.value })} />
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={labelStyle}>タグライン</label>
        <input style={inputStyle} value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
      </div>
      <div>
        <label style={labelStyle}>ラベル (HOT/NEW)</label>
        <input style={inputStyle} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      </div>
      <div>
        <label style={labelStyle}>並び順</label>
        <input style={inputStyle} type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={labelStyle}>フィーチャー (true/false)</label>
        <input style={inputStyle} value={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.value })} />
      </div>
    </div>
  );

  return (
    <div>
      <div style={cardStyle}>
        {sorted.length === 0 ? (
          <AdminEmptyCard
            icon="🎨"
            title="IPコラボはまだ登録されていません"
            description="Shopifyコレクションのハンドル（例: jujutsukaisen-collaboration）でIPコラボを登録すると、トップページのグリッドに表示されます。登録されるまでは astromeda-data.ts のフォールバックが使用されます。"
          />
        ) : sorted.map((item) => (
          <div key={item.id} style={rowStyle}>
            <div style={{ width: 36, fontSize: 13, color: color.textMuted, textAlign: 'center' }}>
              {f(item, 'display_order') || '—'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: color.text }}>{f(item, 'name')}</div>
              <div style={{ fontSize: 11, color: color.textMuted }}>{item.handle} → {f(item, 'collection_handle')}</div>
            </div>
            <div style={{ fontSize: 11, color: f(item, 'is_active') === 'true' ? color.cyan : color.textMuted }}>
              {f(item, 'is_active') === 'true' ? '★ Featured' : ''}
            </div>
            {f(item, 'label') && (
              <span style={{ fontSize: 10, padding: '2px 8px', background: `${color.cyan}20`, color: color.cyan, borderRadius: 4 }}>
                {f(item, 'label')}
              </span>
            )}
            <button style={btnSecondary} onClick={() => startEdit(item)}>編集</button>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <Modal title="IPコラボ編集" onClose={closeModal} preview={previewPane} maxWidth={1400}>
          {renderForm()}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${color.border}` }}>
            <button style={btnPrimary} onClick={modalSave}>保存</button>
            <button style={btnSecondary} onClick={closeModal}>キャンセル</button>
          </div>
          <div style={{ fontSize: 11, color: color.textMuted, marginTop: 12, padding: 10, background: color.bg0, borderRadius: 6 }}>
            💡 右側プレビューはIPコラボグリッド全体を表示。編集中のIPはフォーム入力で即時反映されます。
          </div>
        </Modal>
      )}
    </div>
  );
}

// ══════════════════════════════════════
// ヒーローバナー + 新規追加
// ══════════════════════════════════════
function BannerList({ items, onRefresh, onMsg }: { items: MetaobjectNode[]; onRefresh: () => void; onMsg: (s: string) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');

  const emptyForm = () => ({
    title: '', collection_handle: '', link_url: '', alt_text: '',
    display_order: String((items.length || 0) + 1), is_active: 'true',
    schedule_start: '', schedule_end: '',
  });

  const startEdit = (item: MetaobjectNode) => {
    setEditing(item.id);
    setForm({
      title: f(item, 'title'),
      collection_handle: f(item, 'collection_handle'),
      link_url: f(item, 'link_url'),
      alt_text: f(item, 'alt_text'),
      display_order: f(item, 'display_order'),
      is_active: f(item, 'is_active'),
      schedule_start: f(item, 'schedule_start'),
      schedule_end: f(item, 'schedule_end'),
    });
  };

  const save = async (id: string) => {
    const res = await cmsPost({
      type: 'astromeda_hero_banner',
      action: 'update',
      id,
      fields: Object.entries(form).map(([key, value]) => ({ key, value })),
    });
    if (res.success) { onMsg('バナーを更新しました'); setEditing(null); onRefresh(); }
    else onMsg(`エラー: ${res.error}`);
  };

  const create = async () => {
    const handle = `banner-${Date.now()}`;
    const res = await cmsPost({
      type: 'astromeda_hero_banner',
      action: 'create',
      handle,
      fields: Object.entries(form).map(([key, value]) => ({ key, value })),
    });
    if (res.success) { onMsg('バナーを追加しました'); setShowAdd(false); onRefresh(); }
    else onMsg(`エラー: ${res.error}`);
  };

  const remove = async (id: string) => {
    const res = await cmsPost({ type: 'astromeda_hero_banner', action: 'delete', id });
    if (res.success) { onMsg('バナーを削除しました'); onRefresh(); }
    else onMsg(`エラー: ${res.error}`);
  };

  const sorted = [...items].sort((a, b) => Number(f(a, 'display_order') || 99) - Number(f(b, 'display_order') || 99));

  // Shopify コレクション画像をプレビュー用に取得（IPバナーと同じ仕組み）
  const bannerExtraHandles = useMemo(
    () => (form.collection_handle ? [form.collection_handle] : []),
    [form.collection_handle],
  );
  const bannerShopifyImages = useShopifyCollectionImages(items, 'collection_handle', bannerExtraHandles);

  // ── プレビュー: 編集中itemをform値で上書き / 新規追加中は合成item追加 ──
  const previewMetaBanners = useMemo<MetaBanner[]>(() => {
    const mapItem = (item: MetaobjectNode): MetaBanner => {
      const useForm = editing === item.id;
      const title = useForm ? form.title : f(item, 'title');
      const ch = useForm ? form.collection_handle : f(item, 'collection_handle');
      const url = useForm ? form.link_url : f(item, 'link_url');
      const alt = useForm ? form.alt_text : f(item, 'alt_text');
      const ord = useForm ? form.display_order : f(item, 'display_order');
      const act = useForm ? form.is_active : f(item, 'is_active');
      const storedImg = f(item, 'image');
      const fallbackImg = ch ? bannerShopifyImages[ch] : undefined;
      return {
        id: item.id,
        handle: item.handle,
        title: title || '(無題)',
        subtitle: alt || null,
        image: storedImg || fallbackImg || null,
        linkUrl: url || (ch ? `/collections/${ch}` : null),
        ctaLabel: null,
        sortOrder: Number(ord || 99),
        isActive: act === 'true',
        startAt: null,
        endAt: null,
      };
    };
    const mapped = items.map(mapItem);
    if (showAdd) {
      const ch = form.collection_handle;
      const fallbackImg = ch ? bannerShopifyImages[ch] : undefined;
      mapped.push({
        id: 'preview-new',
        handle: 'preview-new',
        title: form.title || '(新規バナー)',
        subtitle: form.alt_text || null,
        image: fallbackImg || null,
        linkUrl: form.link_url || (ch ? `/collections/${ch}` : null),
        ctaLabel: null,
        sortOrder: Number(form.display_order || items.length + 1),
        isActive: (form.is_active || 'true') === 'true',
        startAt: null,
        endAt: null,
      });
    }
    return mapped;
  }, [items, editing, showAdd, form, bannerShopifyImages]);

  const isModalOpen = !!editing || showAdd;
  const modalTitle = editing ? 'バナー編集' : 'バナー 新規追加';
  const closeModal = () => { setEditing(null); setShowAdd(false); };
  const modalSave = () => { if (editing) save(editing); else create(); };

  const previewPane = (
    <PreviewFrame device={previewDevice} onDeviceChange={setPreviewDevice}>
      <div style={{background: T.bg}}>
        <HeroSlider collections={null} metaBanners={previewMetaBanners} />
      </div>
    </PreviewFrame>
  );

  const renderForm = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <div>
        <label style={labelStyle}>タイトル</label>
        <input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="バナータイトル" />
      </div>
      <div>
        <label style={labelStyle}>コレクションハンドル</label>
        <input style={inputStyle} value={form.collection_handle} onChange={(e) => setForm({ ...form, collection_handle: e.target.value })} placeholder="jujutsukaisen-collaboration" />
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <UrlPicker
          label="リンクURL"
          optional
          value={form.link_url}
          onChange={(next) => setForm({ ...form, link_url: next })}
        />
      </div>
      <div>
        <label style={labelStyle}>代替テキスト</label>
        <input style={inputStyle} value={form.alt_text} onChange={(e) => setForm({ ...form, alt_text: e.target.value })} />
      </div>
      <div>
        <label style={labelStyle}>並び順</label>
        <input style={inputStyle} type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
      </div>
      <div>
        <label style={labelStyle}>有効 (true/false)</label>
        <input style={inputStyle} value={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.value })} />
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button style={btnPrimary} onClick={() => { setShowAdd(true); setForm(emptyForm()); }}>
          ＋ バナー追加
        </button>
      </div>
      <div style={cardStyle}>
        {sorted.length === 0 ? (
          <AdminEmptyCard
            icon="🖼️"
            title="ヒーローバナーはまだ登録されていません"
            description="トップページ最上部の大型ヒーローバナーを登録してください。未登録の間はコレクション画像が自動で使用されます。"
            action={
              <button style={btnPrimary} onClick={() => { setShowAdd(true); setForm(emptyForm()); }}>
                ＋ バナー追加
              </button>
            }
          />
        ) : sorted.map((item) => (
          <div key={item.id} style={rowStyle}>
            <div style={{ width: 36, fontSize: 13, color: color.textMuted, textAlign: 'center' }}>
              {f(item, 'display_order') || '—'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: color.text }}>{f(item, 'title') || '(無題)'}</div>
              <div style={{ fontSize: 11, color: color.textMuted }}>
                {f(item, 'collection_handle') || f(item, 'link_url') || '—'}
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: f(item, 'is_active') === 'true' ? '#6bff7b' : '#ff6b6b' }}>
              {f(item, 'is_active') === 'true' ? '有効' : '無効'}
            </div>
            <button style={btnSecondary} onClick={() => startEdit(item)}>編集</button>
            <button style={btnDanger} onClick={() => remove(item.id)}>削除</button>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <Modal title={modalTitle} onClose={closeModal} preview={previewPane} maxWidth={1400}>
          {renderForm()}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${color.border}` }}>
            <button style={btnPrimary} onClick={modalSave}>保存</button>
            <button style={btnSecondary} onClick={closeModal}>キャンセル</button>
          </div>
          <div style={{ fontSize: 11, color: color.textMuted, marginTop: 12, padding: 10, background: color.bg0, borderRadius: 6 }}>
            💡 右側プレビューは現行ヒーロースライダー全体を表示。編集中のバナーはフォーム入力で即時反映されます。
          </div>
        </Modal>
      )}
    </div>
  );
}

// ══════════════════════════════════════
// 8色カラー + 編集
// ══════════════════════════════════════
function ColorList({ items, onRefresh, onMsg }: { items: MetaobjectNode[]; onRefresh: () => void; onMsg: (s: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');

  const startEdit = (item: MetaobjectNode) => {
    setEditing(item.id);
    setForm({
      name: f(item, 'name'),
      slug: f(item, 'slug'),
      hex_color: f(item, 'hex_color'),
      gradient_color: f(item, 'gradient_color'),
      collection_handle: f(item, 'collection_handle'),
      color_keywords: f(item, 'color_keywords'),
      display_order: f(item, 'display_order'),
      is_dark: f(item, 'is_dark'),
      is_active: f(item, 'is_active') || 'true',
      image_url: f(item, 'image_url'),
    });
  };

  const emptyForm = () => ({
    name: '', slug: '', hex_color: '#000000', gradient_color: '',
    collection_handle: '', color_keywords: '',
    display_order: String((items.length || 0) + 1),
    is_dark: 'false', is_active: 'true', image_url: '',
  });

  const save = async (id: string) => {
    const res = await cmsPost({
      type: 'astromeda_pc_color',
      action: 'update',
      id,
      fields: Object.entries(form).map(([key, value]) => ({ key, value })),
    });
    if (res.success) { onMsg('カラーを更新しました'); setEditing(null); onRefresh(); }
    else onMsg(`エラー: ${res.error}`);
  };

  const create = async () => {
    const handle = `color-${form.slug || Date.now()}`.toLowerCase().replace(/\s+/g, '-');
    const res = await cmsPost({
      type: 'astromeda_pc_color',
      action: 'create',
      handle,
      fields: Object.entries(form).map(([key, value]) => ({ key, value })),
    });
    if (res.success) { onMsg('カラーを追加しました'); setShowAdd(false); onRefresh(); }
    else onMsg(`エラー: ${res.error}`);
  };

  // ── プレビュー用: 全items + 編集中のform値で該当itemを上書き / 新規追加中なら末尾に合成item追加 ──
  const previewMetaColors = useMemo<MetaColorModel[]>(() => {
    const mapItem = (item: MetaobjectNode): MetaColorModel => {
      const useForm = editing === item.id;
      const nm = useForm ? form.name : f(item, 'name');
      const sl = useForm ? form.slug : f(item, 'slug');
      const hx = useForm ? form.hex_color : f(item, 'hex_color');
      const img = useForm ? form.image_url : f(item, 'image_url');
      const ord = useForm ? form.display_order : f(item, 'display_order');
      const act = useForm ? form.is_active : (f(item, 'is_active') || 'true');
      return {
        id: item.id,
        handle: item.handle,
        name: nm || '(未入力)',
        slug: sl || 'preview',
        image: img || null,
        colorCode: /^#[0-9A-Fa-f]{6}$/.test(hx || '') ? hx : '#888888',
        sortOrder: Number(ord || 99),
        isActive: act === 'true',
      };
    };
    const mapped = items.map(mapItem);
    if (showAdd) {
      mapped.push({
        id: 'preview-new',
        handle: 'preview-new',
        name: form.name || '(新規)',
        slug: form.slug || 'preview-new',
        image: form.image_url || null,
        colorCode: /^#[0-9A-Fa-f]{6}$/.test(form.hex_color || '') ? form.hex_color : '#888888',
        sortOrder: Number(form.display_order || (items.length + 1)),
        isActive: (form.is_active || 'true') === 'true',
      });
    }
    return mapped.filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [items, editing, showAdd, form]);

  const isModalOpen = !!editing || showAdd;
  const modalTitle = editing ? 'カラー編集' : 'カラー 新規追加';
  const closeModal = () => { setEditing(null); setShowAdd(false); };
  const modalSave = () => { if (editing) save(editing); else create(); };

  const previewPane = (
    <PreviewFrame device={previewDevice} onDeviceChange={setPreviewDevice}>
      <div style={{padding: 'clamp(12px, 2vw, 20px)', background: T.bg}}>
        <PCShowcase colorImages={{}} metaColors={previewMetaColors} />
      </div>
    </PreviewFrame>
  );

  const sorted = [...items].sort((a, b) => Number(f(a, 'display_order') || 99) - Number(f(b, 'display_order') || 99));

  const renderForm = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>名前 (JP)</label>
          <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ホワイト" />
        </div>
        <div>
          <label style={labelStyle}>スラッグ (EN)</label>
          <input style={inputStyle} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="white" />
        </div>
        <div>
          <label style={labelStyle}>HEX カラー</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="color" value={form.hex_color || '#000000'} onChange={(e) => setForm({ ...form, hex_color: e.target.value })} style={{ width: 36, height: 32, border: 'none', cursor: 'pointer' }} />
            <input style={{ ...inputStyle, flex: 1 }} value={form.hex_color} onChange={(e) => setForm({ ...form, hex_color: e.target.value })} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>コレクションハンドル</label>
          <input style={inputStyle} value={form.collection_handle} onChange={(e) => setForm({ ...form, collection_handle: e.target.value })} placeholder="white" />
        </div>
        <div>
          <label style={labelStyle}>表示順</label>
          <input style={inputStyle} type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>ダーク (true/false)</label>
          <input style={inputStyle} value={form.is_dark} onChange={(e) => setForm({ ...form, is_dark: e.target.value })} placeholder="false" />
        </div>
        <div>
          <label style={labelStyle}>カラーキーワード (カンマ区切り)</label>
          <input style={inputStyle} value={form.color_keywords} onChange={(e) => setForm({ ...form, color_keywords: e.target.value })} placeholder="ホワイト,White,WHITE" />
        </div>
        <div>
          <label style={labelStyle}>表示中 (true/false)</label>
          <input style={inputStyle} value={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.value })} placeholder="true" />
        </div>
        <div>
          <label style={labelStyle}>グラデーションカラー (HEX・任意)</label>
          <input style={inputStyle} value={form.gradient_color} onChange={(e) => setForm({ ...form, gradient_color: e.target.value })} placeholder="#E8E0FF" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          {/* patch 0083 R1-P1-1: URL 手打ちから ImagePicker(アップロード/ライブラリ/URL) 3モードへ */}
          <ImagePicker
            label="バナー画像（ホームページ 8色カラーで表示）"
            optional
            value={form.image_url}
            onChange={(url) => setForm({ ...form, image_url: url })}
            hint="PC本体ではなく「PC利用シーン」のライフスタイル画像を推奨。空の場合は /images/pc-setup/{slug}.jpg が自動使用されます。"
          />
        </div>
      </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button style={btnPrimary} onClick={() => { setShowAdd(true); setForm(emptyForm()); }}>
          ＋ カラー追加
        </button>
      </div>
      <div style={cardStyle}>
        {sorted.length === 0 ? (
          <AdminEmptyCard
            icon="🎨"
            title="8色カラーはまだ登録されていません"
            description="トップページの8色カラーグリッドに表示されるカラー（白・黒・ピンク・紫・水色・赤・緑・オレンジ等）を登録してください。未登録の間は astromeda-data.ts の PC_COLORS フォールバックが使用されます。"
            action={
              <button style={btnPrimary} onClick={() => { setShowAdd(true); setForm(emptyForm()); }}>
                ＋ カラー追加
              </button>
            }
          />
        ) : sorted.map((item) => (
          <div key={item.id} style={rowStyle}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: f(item, 'hex_color') || '#888',
              border: '2px solid rgba(255,255,255,.2)',
              flexShrink: 0,
            }} />
            {f(item, 'image_url') ? (
              <img
                src={f(item, 'image_url')}
                alt={f(item, 'name')}
                style={{ width: 64, height: 40, objectFit: 'cover', borderRadius: 4, border: `1px solid ${color.border}`, flexShrink: 0 }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.3'; }}
              />
            ) : (
              <div style={{ width: 64, height: 40, background: color.bg2, borderRadius: 4, border: `1px solid ${color.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: color.textMuted, flexShrink: 0 }}>
                画像なし
              </div>
            )}
            <div style={{ width: 36, fontSize: 13, color: color.textMuted, textAlign: 'center' }}>
              {f(item, 'display_order') || '—'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: color.text }}>
                {f(item, 'name')} <span style={{ color: color.textMuted, fontWeight: 400 }}>({f(item, 'slug')})</span>
              </div>
              <div style={{ fontSize: 11, color: color.textMuted, fontFamily: 'monospace' }}>
                {f(item, 'hex_color')} → {f(item, 'collection_handle')}
              </div>
            </div>
            <button style={btnSecondary} onClick={() => startEdit(item)}>編集</button>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <Modal title={modalTitle} onClose={closeModal} preview={previewPane} maxWidth={1400}>
          {renderForm()}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${color.border}` }}>
            <button style={btnPrimary} onClick={modalSave}>保存</button>
            <button style={btnSecondary} onClick={closeModal}>キャンセル</button>
          </div>
          <div style={{ fontSize: 11, color: color.textMuted, marginTop: 12, padding: 10, background: color.bg0, borderRadius: 6 }}>
            💡 右側プレビューは「現在のサイト全カラー」を表示中。編集中のカラーはフォームの入力値が即時反映されます。
          </div>
        </Modal>
      )}
    </div>
  );
}

// ══════════════════════════════════════
// マーキー管理 + 新規追加
// ══════════════════════════════════════
// ── Marquee プレビュー用の軽量レンダラ ──
function MarqueePreview({items}: {items: Array<{icon: string; text: string}>}) {
  const list = items.length > 0 ? items : [{icon: '✦', text: '(マーキー未登録)'}];
  return (
    <div style={{
      width: '100%',
      background: '#000',
      borderTop: `1px solid ${al(T.tx, 0.1)}`,
      borderBottom: `1px solid ${al(T.tx, 0.1)}`,
      padding: '10px 0',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
    }}>
      <div style={{
        display: 'inline-flex',
        gap: 40,
        animation: 'admin-marquee-scroll 20s linear infinite',
      }}>
        {[...list, ...list, ...list].map((m, i) => (
          <span key={i} style={{fontSize: 13, color: T.tx, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6}}>
            <span style={{color: T.c}}>{m.icon}</span>
            <span>{m.text}</span>
          </span>
        ))}
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes admin-marquee-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.33%); }
        }
      `}} />
    </div>
  );
}

function MarqueeList({ items, onRefresh, onMsg }: { items: MetaobjectNode[]; onRefresh: () => void; onMsg: (s: string) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');

  const emptyForm = () => ({
    text: '', icon: '✦', display_order: String((items.length || 0) + 1),
  });

  const startEdit = (item: MetaobjectNode) => {
    setEditing(item.id);
    setForm({
      text: f(item, 'text'),
      icon: f(item, 'icon'),
      display_order: f(item, 'display_order'),
    });
  };

  const save = async (id: string) => {
    const res = await cmsPost({
      type: 'astromeda_marquee_item',
      action: 'update',
      id,
      fields: Object.entries(form).map(([key, value]) => ({ key, value })),
    });
    if (res.success) { onMsg('マーキーを更新しました'); setEditing(null); onRefresh(); }
    else onMsg(`エラー: ${res.error}`);
  };

  const create = async () => {
    const handle = `marquee-${Date.now()}`;
    const res = await cmsPost({
      type: 'astromeda_marquee_item',
      action: 'create',
      handle,
      fields: Object.entries(form).map(([key, value]) => ({ key, value })),
    });
    if (res.success) { onMsg('マーキーを追加しました'); setShowAdd(false); onRefresh(); }
    else onMsg(`エラー: ${res.error}`);
  };

  const remove = async (id: string) => {
    const res = await cmsPost({ type: 'astromeda_marquee_item', action: 'delete', id });
    if (res.success) { onMsg('マーキーを削除しました'); onRefresh(); }
    else onMsg(`エラー: ${res.error}`);
  };

  const sorted = [...items].sort((a, b) => Number(f(a, 'display_order') || 99) - Number(f(b, 'display_order') || 99));

  // ── プレビュー: 編集中 item を form 値で上書き / 新規追加中は合成 item 追加 ──
  const previewItems = useMemo<Array<{icon: string; text: string; sort: number}>>(() => {
    const mapped = items.map((item) => {
      const useForm = editing === item.id;
      return {
        icon: (useForm ? form.icon : f(item, 'icon')) || '✦',
        text: (useForm ? form.text : f(item, 'text')) || '',
        sort: Number((useForm ? form.display_order : f(item, 'display_order')) || 99),
      };
    });
    if (showAdd) {
      mapped.push({
        icon: form.icon || '✦',
        text: form.text || '(新規)',
        sort: Number(form.display_order || items.length + 1),
      });
    }
    return mapped.filter((m) => m.text).sort((a, b) => a.sort - b.sort);
  }, [items, editing, showAdd, form]);

  const isModalOpen = !!editing || showAdd;
  const modalTitle = editing ? 'マーキー編集' : 'マーキー 新規追加';
  const closeModal = () => { setEditing(null); setShowAdd(false); };
  const modalSave = () => { if (editing) save(editing); else create(); };

  const previewPane = (
    <PreviewFrame device={previewDevice} onDeviceChange={setPreviewDevice}>
      <div style={{background: T.bg, paddingTop: 30, paddingBottom: 30}}>
        <MarqueePreview items={previewItems} />
      </div>
    </PreviewFrame>
  );

  const renderForm = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px', gap: 10 }}>
      <div>
        <label style={labelStyle}>アイコン</label>
        <input style={inputStyle} value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
      </div>
      <div>
        <label style={labelStyle}>テキスト</label>
        <input style={inputStyle} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="送料無料" />
      </div>
      <div>
        <label style={labelStyle}>並び順</label>
        <input style={inputStyle} type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button style={btnPrimary} onClick={() => { setShowAdd(true); setForm(emptyForm()); }}>
          ＋ マーキー追加
        </button>
      </div>
      <div style={cardStyle}>
        {sorted.length === 0 ? (
          <AdminEmptyCard
            icon="📣"
            title="マーキーはまだ登録されていません"
            description="トップページ上部を横に流れるマーキー（ティッカー）のテキストを登録してください。未登録の間は astromeda-data.ts の MARQUEE_ITEMS フォールバックが使用されます。"
            action={
              <button style={btnPrimary} onClick={() => { setShowAdd(true); setForm(emptyForm()); }}>
                ＋ マーキー追加
              </button>
            }
          />
        ) : sorted.map((item) => (
          <div key={item.id} style={rowStyle}>
            <div style={{ width: 36, fontSize: 13, color: color.textMuted, textAlign: 'center' }}>
              {f(item, 'display_order') || '—'}
            </div>
            <div style={{ fontSize: 18, width: 28, textAlign: 'center' }}>{f(item, 'icon') || '✦'}</div>
            <div style={{ flex: 1, fontSize: 13, color: color.text }}>{f(item, 'text')}</div>
            <button style={btnSecondary} onClick={() => startEdit(item)}>編集</button>
            <button style={btnDanger} onClick={() => remove(item.id)}>削除</button>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <Modal title={modalTitle} onClose={closeModal} preview={previewPane} maxWidth={1400}>
          {renderForm()}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${color.border}` }}>
            <button style={btnPrimary} onClick={modalSave}>保存</button>
            <button style={btnSecondary} onClick={closeModal}>キャンセル</button>
          </div>
          <div style={{ fontSize: 11, color: color.textMuted, marginTop: 12, padding: 10, background: color.bg0, borderRadius: 6 }}>
            💡 右側プレビューはマーキー全体をスクロール表示。編集中の項目はフォーム入力で即時反映されます。
          </div>
        </Modal>
      )}
    </div>
  );
}
