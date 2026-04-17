/**
 * AdminProducts Tab — 商品管理 + PCティア + UGCレビュー
 *
 * commerceセクション: 商品サマリー / PCティアCRUD / UGCレビューCRUD
 * /api/admin/cms 統一エンドポイント経由でMetaobject CRUD。
 */

import { useState, useEffect, useCallback } from 'react';
import { color, font, radius, space } from '~/lib/design-tokens';
import { CompactKPI } from '~/components/admin/CompactKPI';

// ── Types ──
interface ProductSummary {
  total: number;
  products: Array<{
    id: string;
    title: string;
    status: string;
    imageUrl: string | null;
    priceRange: {
      minVariantPrice: { amount: string; currencyCode: string };
      maxVariantPrice: { amount: string; currencyCode: string };
    };
  }>;
}

interface MetaobjectNode {
  id: string;
  handle: string;
  type: string;
  updatedAt?: string;
  [key: string]: string | undefined;
}

type SubTab = 'products' | 'tiers' | 'reviews';

// ── Styles ──
const cardStyle: React.CSSProperties = {
  background: color.bg1,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  padding: space[4],
  marginBottom: space[3],
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: color.bg0,
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  color: color.text,
  fontSize: font.sm,
  fontFamily: font.family,
  boxSizing: 'border-box' as const,
};

const labelStyle: React.CSSProperties = {
  fontSize: font.xs,
  color: color.textMuted,
  display: 'block',
  marginBottom: '4px',
  fontWeight: 500,
};

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  fontSize: font.sm,
  fontWeight: active ? 700 : 500,
  color: active ? '#000' : color.cyan,
  background: active ? color.cyan : 'transparent',
  border: `1px solid ${active ? color.cyan : 'rgba(0,240,255,.3)'}`,
  borderRadius: radius.md,
  cursor: 'pointer',
  fontFamily: font.family,
  transition: 'all 150ms ease',
});

const btnPrimary: React.CSSProperties = {
  padding: '8px 20px',
  background: color.cyan,
  color: '#000',
  border: 'none',
  borderRadius: radius.md,
  fontSize: font.sm,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: font.family,
};

const btnDanger: React.CSSProperties = {
  padding: '6px 12px',
  background: color.red,
  color: '#fff',
  border: 'none',
  borderRadius: radius.md,
  fontSize: font.xs,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: font.family,
};

const btnOutline: React.CSSProperties = {
  padding: '6px 14px',
  background: 'transparent',
  color: color.cyan,
  border: `1px solid rgba(0,240,255,.3)`,
  borderRadius: radius.md,
  fontSize: font.xs,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: font.family,
};

// ── CMS API helpers ──
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

// ── Toast ──
function Toast({ msg, type }: { msg: string; type: 'ok' | 'err' }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        padding: '10px 20px',
        borderRadius: radius.md,
        fontSize: font.sm,
        fontWeight: 600,
        color: type === 'ok' ? '#000' : '#fff',
        background: type === 'ok' ? color.cyan : color.red,
        zIndex: 200,
        boxShadow: '0 4px 20px rgba(0,0,0,.5)',
      }}
    >
      {msg}
    </div>
  );
}

// ══════════════════════════════════
// ① ProductList — 商品サマリー
// ══════════════════════════════════
function ProductList() {
  const [summary, setSummary] = useState<ProductSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/products?limit=5');
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        if (!cancelled && json.success) {
          setSummary({ total: json.total, products: json.products });
        }
      } catch {
        if (!cancelled) setError('商品データの取得に失敗しました');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div style={{ color: color.textMuted, fontSize: 14 }}>読み込み中...</div>;
  if (error) return (
    <div style={{ color: '#ff6b6b', fontSize: 14, padding: 16, background: '#3a1515', borderRadius: 8 }}>
      {error}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <CompactKPI label="登録商品数" value={String(summary?.total ?? 0)} />
        <a
          href="/admin/products"
          style={{
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 700,
            color: '#000',
            background: color.cyan,
            borderRadius: 8,
            textDecoration: 'none',
          }}
        >
          全商品を管理 →
        </a>
      </div>

      {summary && summary.products.length > 0 && (
        <div style={{ background: color.bg0, border: `1px solid ${color.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: color.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', padding: '12px 16px', borderBottom: `1px solid ${color.border}` }}>
            最近の商品（上位5件）
          </div>
          {summary.products.map((p) => (
            <div key={p.id} style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${color.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <div style={{
                width: 40, height: 40,
                background: p.imageUrl ? `url(${p.imageUrl}) center/cover` : color.bg1,
                borderRadius: 6, flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: color.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.title}
                </div>
                <div style={{ fontSize: 11, color: color.textMuted }}>
                  {p.status === 'ACTIVE' ? '公開中' : p.status === 'DRAFT' ? '下書き' : 'アーカイブ'}
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: color.cyan }}>
                ¥{Number(p.priceRange?.minVariantPrice?.amount || 0).toLocaleString('ja-JP')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════
// ② TierList — PCティア CRUD
// ══════════════════════════════════
function TierList({ onToast }: { onToast: (m: string, t: 'ok' | 'err') => void }) {
  const [items, setItems] = useState<MetaobjectNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await cmsGet('astromeda_pc_tier');
      setItems(data.sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0)));
    } catch {
      onToast('PCティア取得失敗', 'err');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const startEdit = (item: MetaobjectNode) => {
    setEditId(item.id);
    setForm({
      tier_name: item.tier_name || '',
      gpu_range: item.gpu_range || '',
      cpu_range: item.cpu_range || '',
      ram: item.ram || '',
      base_price: item.base_price || '0',
      is_popular: item.is_popular || 'false',
      benchmarks_json: item.benchmarks_json || '{}',
      display_order: item.display_order || '0',
    });
  };

  const startCreate = () => {
    setEditId('__new__');
    setForm({
      tier_name: '',
      gpu_range: '',
      cpu_range: '',
      ram: '',
      base_price: '0',
      is_popular: 'false',
      benchmarks_json: '{}',
      display_order: String(items.length),
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fields = Object.entries(form).map(([key, value]) => ({ key, value }));
      if (editId === '__new__') {
        const handle = `tier-${form.tier_name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || Date.now()}`;
        const r = await cmsPost({ type: 'astromeda_pc_tier', action: 'create', handle, fields });
        if (!r.success) throw new Error(r.error);
        onToast('ティア作成完了', 'ok');
      } else {
        const r = await cmsPost({ type: 'astromeda_pc_tier', action: 'update', id: editId, fields });
        if (!r.success) throw new Error(r.error);
        onToast('ティア保存完了', 'ok');
      }
      setEditId(null);
      await fetchData();
    } catch (e) {
      onToast(e instanceof Error ? e.message : '保存失敗', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このティアを削除しますか？')) return;
    const r = await cmsPost({ type: 'astromeda_pc_tier', action: 'delete', id });
    if (r.success) {
      onToast('ティア削除完了', 'ok');
      await fetchData();
    } else {
      onToast(r.error || '削除失敗', 'err');
    }
  };

  if (loading) return <div style={{ color: color.textMuted, padding: 20 }}>読み込み中...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <CompactKPI label="ティア数" value={String(items.length)} />
        <button onClick={startCreate} style={btnOutline}>+ 新規ティア</button>
      </div>

      {/* Edit form */}
      {editId && (
        <div style={{ ...cardStyle, borderColor: color.cyan, marginBottom: 16 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: color.cyan }}>
            {editId === '__new__' ? '新規ティア作成' : 'ティア編集'}
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>ティア名</label>
              <input style={inputStyle} value={form.tier_name || ''} onChange={(e) => setForm({ ...form, tier_name: e.target.value })} placeholder="例: GAMER ENTRY" />
            </div>
            <div>
              <label style={labelStyle}>表示順</label>
              <input style={inputStyle} type="number" value={form.display_order || '0'} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>GPU範囲</label>
              <input style={inputStyle} value={form.gpu_range || ''} onChange={(e) => setForm({ ...form, gpu_range: e.target.value })} placeholder="例: RTX 4060 ~ RTX 4070" />
            </div>
            <div>
              <label style={labelStyle}>CPU範囲</label>
              <input style={inputStyle} value={form.cpu_range || ''} onChange={(e) => setForm({ ...form, cpu_range: e.target.value })} placeholder="例: Ryzen 5 7600 ~ i7-14700" />
            </div>
            <div>
              <label style={labelStyle}>RAM</label>
              <input style={inputStyle} value={form.ram || ''} onChange={(e) => setForm({ ...form, ram: e.target.value })} placeholder="例: 16GB ~ 32GB" />
            </div>
            <div>
              <label style={labelStyle}>最低価格（円）</label>
              <input style={inputStyle} type="number" value={form.base_price || '0'} onChange={(e) => setForm({ ...form, base_price: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>ベンチマークJSON</label>
            <textarea
              style={{ ...inputStyle, fontFamily: font.mono, fontSize: font.xs, resize: 'vertical' }}
              rows={4}
              value={form.benchmarks_json || '{}'}
              onChange={(e) => setForm({ ...form, benchmarks_json: e.target.value })}
            />
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.is_popular === 'true'}
                onChange={(e) => setForm({ ...form, is_popular: String(e.target.checked) })}
                style={{ width: 16, height: 16, accentColor: color.cyan }}
              />
              <span style={{ fontSize: font.sm, color: color.text }}>人気ティア</span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving} style={btnPrimary}>
              {saving ? '保存中...' : editId === '__new__' ? '作成' : '保存'}
            </button>
            <button onClick={() => setEditId(null)} style={btnOutline}>キャンセル</button>
          </div>
        </div>
      )}

      {/* Item list */}
      {items.length === 0 ? (
        <div style={{ color: color.textMuted, textAlign: 'center', padding: 24 }}>
          PCティアが未登録です。「新規ティア」から作成してください。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item) => (
            <div key={item.id} style={{
              ...cardStyle,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 0,
              padding: '12px 16px',
            }}>
              <div style={{
                width: 8, height: 40, borderRadius: 4,
                background: item.is_popular === 'true' ? color.cyan : color.border,
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: color.text }}>
                    {item.tier_name || item.handle}
                  </span>
                  {item.is_popular === 'true' && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 6px',
                      background: color.cyanDim, color: color.cyan, borderRadius: 4,
                    }}>
                      人気
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: color.textMuted, marginTop: 2 }}>
                  {item.gpu_range && `GPU: ${item.gpu_range}`}
                  {item.cpu_range && ` | CPU: ${item.cpu_range}`}
                  {item.ram && ` | RAM: ${item.ram}`}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: color.cyan, whiteSpace: 'nowrap' }}>
                ¥{Number(item.base_price || 0).toLocaleString('ja-JP')}〜
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => startEdit(item)} style={btnOutline}>編集</button>
                <button onClick={() => handleDelete(item.id)} style={btnDanger}>削除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════
// ③ ReviewList — UGCレビュー CRUD
// ══════════════════════════════════
function ReviewList({ onToast }: { onToast: (m: string, t: 'ok' | 'err') => void }) {
  const [items, setItems] = useState<MetaobjectNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await cmsGet('astromeda_ugc_review');
      setItems(data.sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0)));
    } catch {
      onToast('レビュー取得失敗', 'err');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const startEdit = (item: MetaobjectNode) => {
    setEditId(item.id);
    setForm({
      username: item.username || '',
      review_text: item.review_text || '',
      accent_color: item.accent_color || '#00F0FF',
      rating: item.rating || '5',
      date_label: item.date_label || '',
      likes: item.likes || '0',
      product_name: item.product_name || '',
      display_order: item.display_order || '0',
      is_active: item.is_active || 'true',
    });
  };

  const startCreate = () => {
    setEditId('__new__');
    setForm({
      username: '',
      review_text: '',
      accent_color: '#00F0FF',
      rating: '5',
      date_label: new Date().toISOString().slice(0, 10),
      likes: '0',
      product_name: '',
      display_order: String(items.length),
      is_active: 'true',
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fields = Object.entries(form).map(([key, value]) => ({ key, value }));
      if (editId === '__new__') {
        const handle = `review-${form.username?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || Date.now()}`;
        const r = await cmsPost({ type: 'astromeda_ugc_review', action: 'create', handle, fields });
        if (!r.success) throw new Error(r.error);
        onToast('レビュー作成完了', 'ok');
      } else {
        const r = await cmsPost({ type: 'astromeda_ugc_review', action: 'update', id: editId, fields });
        if (!r.success) throw new Error(r.error);
        onToast('レビュー保存完了', 'ok');
      }
      setEditId(null);
      await fetchData();
    } catch (e) {
      onToast(e instanceof Error ? e.message : '保存失敗', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このレビューを削除しますか？')) return;
    const r = await cmsPost({ type: 'astromeda_ugc_review', action: 'delete', id });
    if (r.success) {
      onToast('レビュー削除完了', 'ok');
      await fetchData();
    } else {
      onToast(r.error || '削除失敗', 'err');
    }
  };

  if (loading) return <div style={{ color: color.textMuted, padding: 20 }}>読み込み中...</div>;

  // Star display helper
  const renderStars = (rating: number) => {
    return '★'.repeat(Math.min(5, Math.max(0, rating))) + '☆'.repeat(Math.max(0, 5 - rating));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <CompactKPI label="レビュー数" value={String(items.length)} />
          <CompactKPI label="表示中" value={String(items.filter(i => i.is_active === 'true').length)} />
        </div>
        <button onClick={startCreate} style={btnOutline}>+ 新規レビュー</button>
      </div>

      {/* Edit form */}
      {editId && (
        <div style={{ ...cardStyle, borderColor: color.cyan, marginBottom: 16 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: color.cyan }}>
            {editId === '__new__' ? '新規レビュー作成' : 'レビュー編集'}
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>ユーザー名</label>
              <input style={inputStyle} value={form.username || ''} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="例: gaming_user123" />
            </div>
            <div>
              <label style={labelStyle}>商品名</label>
              <input style={inputStyle} value={form.product_name || ''} onChange={(e) => setForm({ ...form, product_name: e.target.value })} placeholder="例: Astromeda Sirius" />
            </div>
            <div>
              <label style={labelStyle}>評価（1-5）</label>
              <select
                style={inputStyle}
                value={form.rating || '5'}
                onChange={(e) => setForm({ ...form, rating: e.target.value })}
              >
                {[5, 4, 3, 2, 1].map(n => (
                  <option key={n} value={String(n)}>{'★'.repeat(n)}{'☆'.repeat(5 - n)} ({n})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>日付ラベル</label>
              <input style={inputStyle} value={form.date_label || ''} onChange={(e) => setForm({ ...form, date_label: e.target.value })} placeholder="例: 2026-04-15" />
            </div>
            <div>
              <label style={labelStyle}>いいね数</label>
              <input style={inputStyle} type="number" value={form.likes || '0'} onChange={(e) => setForm({ ...form, likes: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>表示順</label>
              <input style={inputStyle} type="number" value={form.display_order || '0'} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>アクセントカラー</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="color"
                  value={form.accent_color || '#00F0FF'}
                  onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                  style={{ width: 40, height: 32, border: 'none', cursor: 'pointer', borderRadius: 4 }}
                />
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={form.accent_color || ''}
                  onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'end', paddingBottom: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.is_active === 'true'}
                  onChange={(e) => setForm({ ...form, is_active: String(e.target.checked) })}
                  style={{ width: 16, height: 16, accentColor: color.cyan }}
                />
                <span style={{ fontSize: font.sm, color: color.text }}>表示中</span>
              </label>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>レビュー本文</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical' }}
              rows={4}
              value={form.review_text || ''}
              onChange={(e) => setForm({ ...form, review_text: e.target.value })}
              placeholder="レビュー本文を入力..."
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving} style={btnPrimary}>
              {saving ? '保存中...' : editId === '__new__' ? '作成' : '保存'}
            </button>
            <button onClick={() => setEditId(null)} style={btnOutline}>キャンセル</button>
          </div>
        </div>
      )}

      {/* Item list */}
      {items.length === 0 ? (
        <div style={{ color: color.textMuted, textAlign: 'center', padding: 24 }}>
          レビューが未登録です。「新規レビュー」から作成してください。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item) => (
            <div key={item.id} style={{
              ...cardStyle,
              marginBottom: 0,
              padding: '12px 16px',
              borderLeftWidth: 3,
              borderLeftColor: item.accent_color || color.cyan,
              opacity: item.is_active === 'true' ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: color.text }}>
                      {item.username || 'Anonymous'}
                    </span>
                    <span style={{ fontSize: 12, color: '#FFB300', letterSpacing: 1 }}>
                      {renderStars(Number(item.rating || 0))}
                    </span>
                    {item.is_active !== 'true' && (
                      <span style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 4,
                        background: 'rgba(255,255,255,.08)', color: color.textMuted,
                      }}>
                        非表示
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 13, color: color.textSecondary, lineHeight: 1.5,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                  }}>
                    {item.review_text || '（本文なし）'}
                  </div>
                  <div style={{ fontSize: 11, color: color.textMuted, marginTop: 4 }}>
                    {item.product_name && <span>{item.product_name}</span>}
                    {item.date_label && <span style={{ marginLeft: 8 }}>{item.date_label}</span>}
                    {item.likes && Number(item.likes) > 0 && (
                      <span style={{ marginLeft: 8 }}>♥ {item.likes}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => startEdit(item)} style={btnOutline}>編集</button>
                  <button onClick={() => handleDelete(item.id)} style={btnDanger}>削除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════
// Main Component
// ══════════════════════════════════
export default function AdminProducts() {
  const [tab, setTab] = useState<SubTab>('products');
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  const showToast = useCallback((msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: color.text, margin: 0 }}>
          商品管理
        </h2>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button onClick={() => setTab('products')} style={tabStyle(tab === 'products')}>
          商品一覧
        </button>
        <button onClick={() => setTab('tiers')} style={tabStyle(tab === 'tiers')}>
          PCティア
        </button>
        <button onClick={() => setTab('reviews')} style={tabStyle(tab === 'reviews')}>
          UGCレビュー
        </button>
      </div>

      {/* Content */}
      {tab === 'products' && <ProductList />}
      {tab === 'tiers' && <TierList onToast={showToast} />}
      {tab === 'reviews' && <ReviewList onToast={showToast} />}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}
