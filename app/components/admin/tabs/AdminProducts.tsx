/**
 * AdminProducts Tab — 商品管理 + PCティア + UGCレビュー
 *
 * commerceセクション: 商品サマリー / PCティアCRUD / UGCレビューCRUD
 * /api/admin/cms 統一エンドポイント経由でMetaobject CRUD。
 */

import { useState, useEffect, useCallback } from 'react';
import { color, font, radius, space } from '~/lib/design-tokens';
import { CompactKPI } from '~/components/admin/CompactKPI';
import { Modal } from '~/components/admin/Modal';
import PreviewFrame, { type PreviewDevice } from '~/components/admin/preview/PreviewFrame';
import { T, al } from '~/lib/astromeda-data';
// patch 0048 (Phase A 適用): window.confirm() 置換用の Stripe 水準確認モーダル
import { useConfirmDialog } from '~/hooks/useConfirmDialog';
// patch 0073 (R2-3): canonical path unification — 非正規タブでの誘導バナー
import { CanonicalRedirectBanner } from '~/components/admin/ds/CanonicalRedirectBanner';

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
// Preview Components
// ══════════════════════════════════

/**
 * TierCardPreview — PCShowcase の PCティアカードに合わせたライブプレビュー
 */
function TierCardPreview({
  tier_name,
  gpu_range,
  cpu_range,
  ram,
  base_price,
  is_popular,
}: {
  tier_name?: string;
  gpu_range?: string;
  cpu_range?: string;
  ram?: string;
  base_price?: string;
  is_popular?: string;
}) {
  const popular = is_popular === 'true';
  const priceNum = Number(base_price || 0);
  const cyan = T.c; // theme accent

  return (
    <div style={{ background: T.bg, color: T.tx, fontFamily: 'inherit', padding: 20 }}>
      <div style={{
        fontSize: 11,
        color: T.t4,
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: `1px solid ${al(T.tx, 0.1)}`,
      }}>
        トップページ「SPEC TIERS」エリアのイメージ
      </div>

      <div
        style={{
          background: T.bgC || '#0a0a0a',
          borderRadius: 18,
          border: popular ? `2px solid ${al(cyan, 0.3)}` : `1px solid ${al(T.tx, 0.15)}`,
          padding: 22,
          position: 'relative',
          overflow: 'hidden',
          maxWidth: 280,
        }}
      >
        {popular && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: cyan,
          }} />
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{
            fontSize: 14,
            fontWeight: 900,
            color: popular ? cyan : T.t5,
            letterSpacing: '0.05em',
          }}>
            {tier_name || '(ティア名未入力)'}
          </span>
          {popular && (
            <span style={{
              fontSize: 9,
              fontWeight: 900,
              padding: '3px 8px',
              borderRadius: 4,
              background: al(cyan, 0.12),
              color: cyan,
              border: `1px solid ${al(cyan, 0.3)}`,
            }}>
              人気No.1
            </span>
          )}
        </div>

        <div style={{
          fontSize: 10,
          color: T.t4,
          marginBottom: 12,
          lineHeight: 1.5,
        }}>
          {gpu_range || '—'}
          {cpu_range && ` / ${cpu_range}`}
          {ram && ` / ${ram}`}
        </div>

        <div style={{
          fontSize: 26,
          fontWeight: 900,
          color: cyan,
          marginBottom: 14,
          letterSpacing: '-0.01em',
        }}>
          ¥{priceNum.toLocaleString('ja-JP')}
          <span style={{ fontSize: 11, color: T.t4, fontWeight: 500, marginLeft: 2 }}>〜</span>
        </div>

        <div style={{
          display: 'block',
          width: '100%',
          padding: '12px',
          fontSize: 12,
          fontWeight: 800,
          textAlign: 'center',
          background: popular ? cyan : 'transparent',
          color: popular ? '#000' : cyan,
          border: `1px solid ${cyan}`,
          borderRadius: 8,
          boxSizing: 'border-box',
          cursor: 'default',
        }}>
          この構成で見る →
        </div>
      </div>

      <div style={{
        marginTop: 14,
        padding: 10,
        background: al(T.tx, 0.02),
        border: `1px dashed ${al(T.tx, 0.1)}`,
        borderRadius: 6,
        fontSize: 10,
        color: T.t4,
        lineHeight: 1.5,
      }}>
        「人気ティア」にチェックを入れると、上部アクセントラインと「人気No.1」バッジが表示されます。
      </div>
    </div>
  );
}

/**
 * ReviewCardPreview — _index.tsx のUGC REVIEWSセクションに合わせたライブプレビュー
 */
function ReviewCardPreview({
  username,
  review_text,
  accent_color,
  rating,
  date_label,
  likes,
  product_name,
  is_active,
}: {
  username?: string;
  review_text?: string;
  accent_color?: string;
  rating?: string;
  date_label?: string;
  likes?: string;
  product_name?: string;
  is_active?: string;
}) {
  const active = is_active !== 'false';
  const accent = accent_color || '#00F0FF';
  const ratingNum = Math.max(0, Math.min(5, Number(rating || 5)));
  const likesNum = Number(likes || 0);
  const initial = (username || 'A').slice(0, 1).toUpperCase();

  return (
    <div style={{ background: T.bg, color: T.tx, fontFamily: 'inherit', padding: 20 }}>
      <div style={{
        fontSize: 11,
        color: T.t4,
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: `1px solid ${al(T.tx, 0.1)}`,
      }}>
        トップページ「REVIEWS」セクションのイメージ
      </div>

      <div style={{
        background: T.bgC || '#0a0a0a',
        borderRadius: 16,
        border: `1px solid ${al(accent, 0.2)}`,
        padding: 18,
        opacity: active ? 1 : 0.5,
        maxWidth: 320,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${accent}, ${al(accent, 0.4)})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 15,
            fontWeight: 900,
            color: '#000',
            flexShrink: 0,
          }}>
            {initial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 12,
              fontWeight: 700,
              color: T.t5,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {username || '(ユーザー名未入力)'}
            </div>
            <div style={{ fontSize: 10, color: T.t3 }}>
              {date_label || '—'}
              {product_name && <span style={{ marginLeft: 6 }}>· {product_name}</span>}
            </div>
          </div>
          {!active && (
            <span style={{
              fontSize: 9,
              padding: '2px 6px',
              borderRadius: 4,
              background: al(T.tx, 0.08),
              color: T.t4,
              flexShrink: 0,
            }}>
              非表示
            </span>
          )}
        </div>

        <div style={{
          fontSize: 12,
          color: T.t5,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          marginBottom: 12,
        }}>
          {review_text || '（本文未入力）'}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 10,
          borderTop: `1px solid ${al(T.tx, 0.06)}`,
        }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} style={{
                fontSize: 14,
                color: i < ratingNum ? '#FFB300' : al(T.tx, 0.15),
              }}>
                ★
              </span>
            ))}
            <span style={{ fontSize: 11, color: T.t4, marginLeft: 4 }}>
              {ratingNum}/5
            </span>
          </div>
          <span style={{ fontSize: 11, color: T.t3 }}>
            ♡ {likesNum}
          </span>
        </div>
      </div>

      <div style={{
        marginTop: 14,
        padding: 10,
        background: al(T.tx, 0.02),
        border: `1px dashed ${al(T.tx, 0.1)}`,
        borderRadius: 6,
        fontSize: 10,
        color: T.t4,
        lineHeight: 1.5,
      }}>
        アクセントカラーはカード枠線色とアバターグラデに反映されます。
      </div>
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
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');
  // patch 0048: window.confirm 置換用
  const {confirm: confirmDialog, dialogProps, ConfirmDialog: Dialog} = useConfirmDialog();

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
    const ok = await confirmDialog({
      title: 'このティアを削除しますか？',
      message: 'この操作は取り消せません。',
      confirmLabel: '削除する',
      destructive: true,
      contextPath: ['コマース', '🛍️ 商品・販売', '📦 商品管理', 'PCティア'],
    });
    if (!ok) return;
    const r = await cmsPost({ type: 'astromeda_pc_tier', action: 'delete', id });
    if (r.success) {
      onToast('ティア削除完了', 'ok');
      await fetchData();
    } else {
      onToast(r.error || '削除失敗', 'err');
    }
  };

  if (loading) return <div style={{ color: color.textMuted, padding: 20 }}>読み込み中...</div>;

  const isModalOpen = !!editId;
  const modalTitle = editId === '__new__' ? '新規ティア作成' : 'ティア編集';
  const closeModal = () => setEditId(null);

  const previewPane = (
    <PreviewFrame device={previewDevice} onDeviceChange={setPreviewDevice}>
      <TierCardPreview
        tier_name={form.tier_name}
        gpu_range={form.gpu_range}
        cpu_range={form.cpu_range}
        ram={form.ram}
        base_price={form.base_price}
        is_popular={form.is_popular}
      />
    </PreviewFrame>
  );

  const editForm = (
    <div>
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
        <button onClick={closeModal} style={btnOutline}>キャンセル</button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <CompactKPI label="ティア数" value={String(items.length)} />
        <button onClick={startCreate} style={btnOutline}>+ 新規ティア</button>
      </div>

      {isModalOpen && (
        <Modal title={modalTitle} onClose={closeModal} preview={previewPane}>
          {editForm}
        </Modal>
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
      <Dialog {...dialogProps} />
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
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('mobile');
  // patch 0048: window.confirm 置換用
  const {confirm: confirmDialog, dialogProps, ConfirmDialog: Dialog} = useConfirmDialog();

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
    const ok = await confirmDialog({
      title: 'このレビューを削除しますか？',
      message: 'この操作は取り消せません。',
      confirmLabel: '削除する',
      destructive: true,
      contextPath: ['コマース', '🛍️ 商品・販売', '📦 商品管理', 'UGCレビュー'],
    });
    if (!ok) return;
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

  const isModalOpen = !!editId;
  const modalTitle = editId === '__new__' ? '新規レビュー作成' : 'レビュー編集';
  const closeModal = () => setEditId(null);

  const previewPane = (
    <PreviewFrame device={previewDevice} onDeviceChange={setPreviewDevice}>
      <ReviewCardPreview
        username={form.username}
        review_text={form.review_text}
        accent_color={form.accent_color}
        rating={form.rating}
        date_label={form.date_label}
        likes={form.likes}
        product_name={form.product_name}
        is_active={form.is_active}
      />
    </PreviewFrame>
  );

  const editForm = (
    <div>
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
        <button onClick={closeModal} style={btnOutline}>キャンセル</button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <CompactKPI label="レビュー数" value={String(items.length)} />
          <CompactKPI label="表示中" value={String(items.filter(i => i.is_active === 'true').length)} />
        </div>
        <button onClick={startCreate} style={btnOutline}>+ 新規レビュー</button>
      </div>

      {isModalOpen && (
        <Modal title={modalTitle} onClose={closeModal} preview={previewPane}>
          {editForm}
        </Modal>
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
      <Dialog {...dialogProps} />
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
      {tab === 'tiers' && (
        <>
          <CanonicalRedirectBanner
            metaobjectType="astromeda_pc_tier"
            currentTab="products"
            note="PCティア（GAMER/CREATOR 等）はトップページの横スクロール表示に直結します。価格や並びをビジュアルで確認しながら編集したい場合は「ビジュアル編集」がおすすめです。"
          />
          <TierList onToast={showToast} />
        </>
      )}
      {tab === 'reviews' && (
        <>
          <CanonicalRedirectBanner
            metaobjectType="astromeda_ugc_review"
            currentTab="products"
            note="UGCレビューはトップページの「お客様の声」ブロックに表示されます。配置プレビュー付きで編集したい場合は「ビジュアル編集」が便利です。"
          />
          <ReviewList onToast={showToast} />
        </>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}
