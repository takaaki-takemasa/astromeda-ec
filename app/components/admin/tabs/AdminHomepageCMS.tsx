/**
 * AdminHomepageCMS Tab — ホームページCMS管理
 *
 * IPコラボ / ヒーローバナー / 8色カラー / マーキー を管理。
 * /api/admin/cms 統一エンドポイントと連携。CRUDフォーム付き。
 */

import { useState, useEffect, useCallback } from 'react';
import { color } from '~/lib/design-tokens';
import { CompactKPI } from '~/components/admin/CompactKPI';

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

      {loading && <div style={{ color: color.textMuted, fontSize: 14 }}>読み込み中...</div>}
      {error && <div style={{ color: '#ff6b6b', fontSize: 14, marginBottom: 16 }}>{error}</div>}

      {!loading && activeTab === 'collabs' && (
        <CollabList items={collabs} onRefresh={fetchAll} onMsg={showMsg} />
      )}
      {!loading && activeTab === 'banners' && (
        <BannerList items={banners} onRefresh={fetchAll} onMsg={showMsg} />
      )}
      {!loading && activeTab === 'colors' && (
        <ColorList items={colors} onRefresh={fetchAll} onMsg={showMsg} />
      )}
      {!loading && activeTab === 'marquee' && (
        <MarqueeList items={marquee} onRefresh={fetchAll} onMsg={showMsg} />
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

  const startEdit = (item: MetaobjectNode) => {
    setEditing(item.id);
    setForm({
      name: f(item, 'name'),
      shop_handle: f(item, 'shop_handle'),
      tagline: f(item, 'tagline'),
      label: f(item, 'label'),
      sort_order: f(item, 'sort_order'),
      featured: f(item, 'featured'),
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

  const sorted = [...items].sort((a, b) => Number(f(a, 'sort_order') || 99) - Number(f(b, 'sort_order') || 99));

  return (
    <div style={cardStyle}>
      {sorted.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: color.textMuted, fontSize: 14 }}>
          IPコラボ未登録（astromeda-data.tsのフォールバックが使用されます）
        </div>
      ) : sorted.map((item) => (
        <div key={item.id} style={rowStyle}>
          {editing === item.id ? (
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={labelStyle}>IP名</label>
                <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Shopifyハンドル</label>
                <input style={inputStyle} value={form.shop_handle} onChange={(e) => setForm({ ...form, shop_handle: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>タグライン</label>
                <input style={inputStyle} value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>ラベル (HOT/NEW)</label>
                <input style={inputStyle} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>並び順</label>
                <input style={inputStyle} type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>フィーチャー (true/false)</label>
                <input style={inputStyle} value={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.value })} />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, marginTop: 4 }}>
                <button style={btnPrimary} onClick={() => save(item.id)}>保存</button>
                <button style={btnSecondary} onClick={() => setEditing(null)}>キャンセル</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ width: 36, fontSize: 13, color: color.textMuted, textAlign: 'center' }}>
                {f(item, 'sort_order') || '—'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: color.text }}>{f(item, 'name')}</div>
                <div style={{ fontSize: 11, color: color.textMuted }}>{item.handle} → {f(item, 'shop_handle')}</div>
              </div>
              <div style={{ fontSize: 11, color: f(item, 'featured') === 'true' ? color.cyan : color.textMuted }}>
                {f(item, 'featured') === 'true' ? '★ Featured' : ''}
              </div>
              {f(item, 'label') && (
                <span style={{ fontSize: 10, padding: '2px 8px', background: `${color.cyan}20`, color: color.cyan, borderRadius: 4 }}>
                  {f(item, 'label')}
                </span>
              )}
              <button style={btnSecondary} onClick={() => startEdit(item)}>編集</button>
            </>
          )}
        </div>
      ))}
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

  const emptyForm = () => ({
    title: '', collection_handle: '', link_url: '', alt_text: '',
    sort_order: String((items.length || 0) + 1), active: 'true',
    schedule_start: '', schedule_end: '',
  });

  const startEdit = (item: MetaobjectNode) => {
    setEditing(item.id);
    setForm({
      title: f(item, 'title'),
      collection_handle: f(item, 'collection_handle'),
      link_url: f(item, 'link_url'),
      alt_text: f(item, 'alt_text'),
      sort_order: f(item, 'sort_order'),
      active: f(item, 'active'),
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

  const sorted = [...items].sort((a, b) => Number(f(a, 'sort_order') || 99) - Number(f(b, 'sort_order') || 99));

  const renderForm = (onSave: () => void, onCancel: () => void) => (
    <div style={{ padding: 16, borderBottom: `1px solid ${color.border}`, background: color.bg2 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={labelStyle}>タイトル</label>
          <input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="バナータイトル" />
        </div>
        <div>
          <label style={labelStyle}>コレクションハンドル</label>
          <input style={inputStyle} value={form.collection_handle} onChange={(e) => setForm({ ...form, collection_handle: e.target.value })} placeholder="jujutsukaisen-collaboration" />
        </div>
        <div>
          <label style={labelStyle}>リンクURL (任意)</label>
          <input style={inputStyle} value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} placeholder="/collections/..." />
        </div>
        <div>
          <label style={labelStyle}>代替テキスト</label>
          <input style={inputStyle} value={form.alt_text} onChange={(e) => setForm({ ...form, alt_text: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>並び順</label>
          <input style={inputStyle} type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>有効 (true/false)</label>
          <input style={inputStyle} value={form.active} onChange={(e) => setForm({ ...form, active: e.target.value })} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button style={btnPrimary} onClick={onSave}>保存</button>
        <button style={btnSecondary} onClick={onCancel}>キャンセル</button>
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
        {showAdd && renderForm(create, () => setShowAdd(false))}
        {sorted.length === 0 && !showAdd ? (
          <div style={{ padding: 32, textAlign: 'center', color: color.textMuted, fontSize: 14 }}>
            バナー未登録（コレクション画像が自動使用されます）
          </div>
        ) : sorted.map((item) => (
          <div key={item.id}>
            {editing === item.id ? (
              renderForm(() => save(item.id), () => setEditing(null))
            ) : (
              <div style={rowStyle}>
                <div style={{ width: 36, fontSize: 13, color: color.textMuted, textAlign: 'center' }}>
                  {f(item, 'sort_order') || '—'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: color.text }}>{f(item, 'title') || '(無題)'}</div>
                  <div style={{ fontSize: 11, color: color.textMuted }}>
                    {f(item, 'collection_handle') || f(item, 'link_url') || '—'}
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: f(item, 'active') === 'true' ? '#6bff7b' : '#ff6b6b' }}>
                  {f(item, 'active') === 'true' ? '有効' : '無効'}
                </div>
                <button style={btnSecondary} onClick={() => startEdit(item)}>編集</button>
                <button style={btnDanger} onClick={() => remove(item.id)}>削除</button>
              </div>
            )}
          </div>
        ))}
      </div>
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

  const sorted = [...items].sort((a, b) => Number(f(a, 'sort_order') || 99) - Number(f(b, 'sort_order') || 99));

  const renderForm = (onSave: () => void, onCancel: () => void) => (
    <div style={{ padding: 16, borderBottom: `1px solid ${color.border}`, background: color.bg2 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
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
          <label style={labelStyle}>バナー画像URL（ホームページ 8色カラーで表示）</label>
          <input style={inputStyle} value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="/images/pc-setup/white.jpg または https://cdn.shopify.com/..." />
          {form.image_url && (
            <div style={{ marginTop: 8, padding: 8, background: color.bg0, border: `1px solid ${color.border}`, borderRadius: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
              <img
                src={form.image_url}
                alt="バナープレビュー"
                style={{ width: 160, height: 100, objectFit: 'cover', borderRadius: 4, border: `1px solid ${color.border}` }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.3'; }}
              />
              <div style={{ fontSize: 11, color: color.textMuted }}>
                プレビュー（実サイトでは aspect 16/10 で表示）
                <div style={{ fontFamily: 'monospace', color: color.text, marginTop: 4, wordBreak: 'break-all' }}>{form.image_url}</div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button style={btnPrimary} onClick={onSave}>保存</button>
        <button style={btnSecondary} onClick={onCancel}>キャンセル</button>
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
        {showAdd && renderForm(create, () => setShowAdd(false))}
        {sorted.length === 0 && !showAdd ? (
          <div style={{ padding: 32, textAlign: 'center', color: color.textMuted, fontSize: 14 }}>
            カラー未登録（astromeda-data.tsのPC_COLORSフォールバックが使用されます）
          </div>
        ) : sorted.map((item) => (
          <div key={item.id}>
            {editing === item.id ? (
              renderForm(() => save(item.id), () => setEditing(null))
            ) : (
              <div style={rowStyle}>
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
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════
// マーキー管理 + 新規追加
// ══════════════════════════════════════
function MarqueeList({ items, onRefresh, onMsg }: { items: MetaobjectNode[]; onRefresh: () => void; onMsg: (s: string) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const emptyForm = () => ({
    text: '', icon: '✦', sort_order: String((items.length || 0) + 1),
  });

  const startEdit = (item: MetaobjectNode) => {
    setEditing(item.id);
    setForm({
      text: f(item, 'text'),
      icon: f(item, 'icon'),
      sort_order: f(item, 'sort_order'),
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

  const sorted = [...items].sort((a, b) => Number(f(a, 'sort_order') || 99) - Number(f(b, 'sort_order') || 99));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button style={btnPrimary} onClick={() => { setShowAdd(true); setForm(emptyForm()); }}>
          ＋ マーキー追加
        </button>
      </div>
      <div style={cardStyle}>
        {showAdd && (
          <div style={{ padding: 16, borderBottom: `1px solid ${color.border}`, background: color.bg2 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px', gap: 8 }}>
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
                <input style={inputStyle} type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button style={btnPrimary} onClick={create}>追加</button>
              <button style={btnSecondary} onClick={() => setShowAdd(false)}>キャンセル</button>
            </div>
          </div>
        )}
        {sorted.length === 0 && !showAdd ? (
          <div style={{ padding: 32, textAlign: 'center', color: color.textMuted, fontSize: 14 }}>
            マーキー未登録（astromeda-data.tsのMARQUEE_ITEMSフォールバックが使用されます）
          </div>
        ) : sorted.map((item) => (
          <div key={item.id}>
            {editing === item.id ? (
              <div style={{ padding: 16, borderBottom: `1px solid ${color.border}`, background: color.bg2 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px', gap: 8 }}>
                  <div>
                    <label style={labelStyle}>アイコン</label>
                    <input style={inputStyle} value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>テキスト</label>
                    <input style={inputStyle} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>並び順</label>
                    <input style={inputStyle} type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button style={btnPrimary} onClick={() => save(item.id)}>保存</button>
                  <button style={btnSecondary} onClick={() => setEditing(null)}>キャンセル</button>
                </div>
              </div>
            ) : (
              <div style={rowStyle}>
                <div style={{ width: 36, fontSize: 13, color: color.textMuted, textAlign: 'center' }}>
                  {f(item, 'sort_order') || '—'}
                </div>
                <div style={{ fontSize: 18, width: 28, textAlign: 'center' }}>{f(item, 'icon') || '✦'}</div>
                <div style={{ flex: 1, fontSize: 13, color: color.text }}>{f(item, 'text')}</div>
                <button style={btnSecondary} onClick={() => startEdit(item)}>編集</button>
                <button style={btnDanger} onClick={() => remove(item.id)}>削除</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
