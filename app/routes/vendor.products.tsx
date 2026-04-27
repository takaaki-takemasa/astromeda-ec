/**
 * /vendor/products — ベンダー担当商品の一覧 + 画像差し替え + タグ編集 (patch 0184 Phase 2.1)
 *
 * セキュリティ:
 *  - サーバ側の /api/admin/products は role=vendor に対して IP コラボを既に除外済 (patch 0178)
 *  - 本ページは更に client-side で `vendor:{username}` タグでフィルタ (vendor 担当範囲)
 *  - tag 編集は productUpdate 経由 (server side で vendor RBAC が二重防御)
 *  - 価格・在庫・商品名 は readonly (vendor が触れる範囲外)
 */
import { useState, useEffect, useCallback } from 'react';
import { redirect, Link, useLoaderData } from 'react-router';
import type { Route } from './+types/vendor.products';
import { AppSession } from '~/lib/session';

interface Product {
  id: string;
  title: string;
  handle: string;
  status: string;
  tags: string[];
  featuredImage?: { url: string; altText?: string };
  totalInventory?: number;
  priceRangeV2?: { minVariantPrice?: { amount: string; currencyCode: string } };
}

interface VendorProductsLoaderData {
  username: string;
  vendorTag: string;
}

export async function loader({ context, request }: Route.LoaderArgs) {
  try {
    const env = context.env as Env;
    if (!env.SESSION_SECRET) return redirect('/admin/login');
    const sharedSession = (context as unknown as {session?: AppSession}).session;
    const session = sharedSession ?? await AppSession.init(request, [env.SESSION_SECRET]);
    if (session.get('isAdmin') !== true) return redirect('/admin/login?next=/vendor/products');
    const role = session.get('role') as string | undefined;
    if (role !== 'vendor' && role !== 'owner') return redirect('/admin');
    const username = (session.get('username') as string) ?? 'vendor';
    return { username, vendorTag: `vendor:${username}` };
  } catch {
    return redirect('/admin/login');
  }
}

export const meta = () => [
  { title: 'ASTROMEDA | ベンダー — 担当商品の画像' },
  { name: 'robots', content: 'noindex, nofollow' },
];

const C = {
  bg: '#0a0e1a', panel: '#11172a', border: '#1f2940', text: '#e8ecf3',
  muted: '#8a96b3', accent: '#3498DB', success: '#10b981', warn: '#f59e0b',
};

export default function VendorProducts() {
  const { username, vendorTag } = useLoaderData<typeof loader>() as VendorProductsLoaderData;
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | null>(null);
  const [newTagInput, setNewTagInput] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/products?limit=250', {credentials: 'include'});
      const j = await res.json();
      const items = (j.products || []) as Product[];
      // client-side filter: only products with vendor:{username} tag
      const myProducts = items.filter((p) => (p.tags || []).includes(vendorTag));
      setAllProducts(myProducts);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [vendorTag]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const startEdit = (p: Product) => {
    setEditing(p);
    setImageUrl(p.featuredImage?.url || '');
    setNewTagInput('');
  };

  const handleAddTag = () => {
    if (!editing || !newTagInput.trim()) return;
    const tag = newTagInput.trim();
    // vendor が許可されているタグだけ許す: gpc-* / vendor-section-* / vendor-sort-*
    if (!/^(gpc-|vendor-section-|vendor-sort-)/.test(tag) && tag !== vendorTag) {
      setToast('追加できるタグは gpc-* / vendor-section-* / vendor-sort-* のみです');
      setTimeout(() => setToast(null), 4000);
      return;
    }
    setEditing({...editing, tags: Array.from(new Set([...editing.tags, tag]))});
    setNewTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    if (!editing) return;
    if (tag === vendorTag) {
      setToast('担当タグは削除できません (削除すると編集権限を失います)');
      setTimeout(() => setToast(null), 4000);
      return;
    }
    setEditing({...editing, tags: editing.tags.filter((t) => t !== tag)});
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      // tag 更新 — productUpdate 経由
      const res = await fetch('/api/admin/products', {
        method: 'POST', credentials: 'include',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'update',
          productId: editing.id,
          product: { tags: editing.tags },
        }),
      });
      const j = await res.json();
      if (j.success) {
        setToast('保存しました');
        setEditing(null);
        await fetchProducts();
      } else {
        setToast(`エラー: ${j.error || '保存に失敗'}`);
      }
    } catch (e) {
      setToast(`エラー: ${(e as Error).message}`);
    }
    setSaving(false);
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <div style={{minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif'}}>
      <header style={{padding: '16px 24px', borderBottom: `1px solid ${C.border}`}}>
        <Link to="/vendor" style={{color: C.accent, textDecoration: 'none', fontSize: 14}}>← ベンダーホームに戻る</Link>
        <h1 style={{fontSize: 24, fontWeight: 900, marginTop: 8}}>🖼️ 担当商品の画像とタグ</h1>
        <p style={{fontSize: 13, color: C.muted, marginTop: 4}}>
          <code style={{background: C.panel, padding: '2px 6px', borderRadius: 4, color: C.accent}}>{vendorTag}</code> タグが付いた商品を一覧表示。タグ編集と画像確認ができます。価格・在庫は ASTROMEDA 担当者のみ編集可能です。
        </p>
      </header>

      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, padding: '12px 20px',
          background: toast.startsWith('エラー') || toast.includes('できません') ? '#dc2626' : C.success,
          color: '#fff', borderRadius: 8, fontWeight: 700, zIndex: 1000, maxWidth: 400,
        }}>{toast}</div>
      )}

      <main style={{maxWidth: 1100, margin: '0 auto', padding: 24}}>
        {loading ? (
          <div style={{color: C.muted, fontSize: 14, textAlign: 'center', padding: 60}}>商品を読み込み中…</div>
        ) : allProducts.length === 0 ? (
          <div style={{
            padding: 48, textAlign: 'center',
            background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12,
          }}>
            <div style={{fontSize: 48, marginBottom: 16}}>📦</div>
            <h2 style={{fontSize: 18, fontWeight: 800, marginBottom: 8}}>担当商品がまだありません</h2>
            <p style={{fontSize: 14, color: C.muted, lineHeight: 1.7}}>
              ASTROMEDA 担当者に商品の「タグ」に <code style={{background: C.bg, padding: '2px 6px', borderRadius: 4, color: C.accent}}>{vendorTag}</code> を追加してもらってください。<br />
              追加されると、この一覧に表示されます。
            </p>
            <p style={{fontSize: 12, color: C.muted, marginTop: 16}}>
              📞 担当者: business@mng-base.com
            </p>
          </div>
        ) : (
          <>
            <div style={{marginBottom: 16, fontSize: 14, color: C.muted}}>
              担当商品: <strong style={{color: C.text}}>{allProducts.length}</strong> 件
            </div>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16}}>
              {allProducts.map((p) => (
                <div key={p.id} style={{
                  background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12,
                  overflow: 'hidden', cursor: 'pointer',
                }} onClick={() => startEdit(p)}>
                  <div style={{
                    width: '100%', aspectRatio: '4/3', background: '#1a1f33',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {p.featuredImage?.url ? (
                      <img src={p.featuredImage.url} alt={p.featuredImage.altText || p.title}
                        style={{width: '100%', height: '100%', objectFit: 'contain'}} />
                    ) : (
                      <div style={{color: C.muted, fontSize: 32}}>📦</div>
                    )}
                  </div>
                  <div style={{padding: 12}}>
                    <div style={{fontSize: 13, fontWeight: 700, marginBottom: 6, lineHeight: 1.4}}>{p.title}</div>
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6}}>
                      {p.tags.slice(0, 4).map((t) => (
                        <span key={t} style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 4,
                          background: t === vendorTag ? C.accent + '33' : C.bg,
                          color: t === vendorTag ? C.accent : C.muted,
                          border: `1px solid ${t === vendorTag ? C.accent : C.border}`,
                        }}>{t}</span>
                      ))}
                      {p.tags.length > 4 && (
                        <span style={{fontSize: 10, color: C.muted}}>+{p.tags.length - 4}</span>
                      )}
                    </div>
                    {p.priceRangeV2?.minVariantPrice && (
                      <div style={{fontSize: 12, color: C.muted}}>
                        ¥{Number(p.priceRangeV2.minVariantPrice.amount).toLocaleString()}〜
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* edit modal */}
        {editing && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 24,
          }} onClick={() => setEditing(null)}>
            <div style={{
              background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: 24, maxWidth: 600, width: '100%', maxHeight: '85vh', overflowY: 'auto',
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
                <h3 style={{fontSize: 16, fontWeight: 800}}>商品を編集</h3>
                <button onClick={() => setEditing(null)} style={{padding: '4px 12px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer'}}>閉じる</button>
              </div>
              <div style={{marginBottom: 16}}>
                <div style={{fontSize: 12, color: C.muted, marginBottom: 4}}>商品名 (編集不可)</div>
                <div style={{padding: 10, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 14}}>{editing.title}</div>
              </div>
              {imageUrl && (
                <div style={{marginBottom: 16}}>
                  <div style={{fontSize: 12, color: C.muted, marginBottom: 4}}>現在の画像</div>
                  <img src={imageUrl} alt="" style={{maxWidth: '100%', maxHeight: 200, background: C.panel, borderRadius: 6}} />
                  <div style={{fontSize: 11, color: C.muted, marginTop: 8}}>
                    💡 画像差し替えは Phase 2.2 で実装予定。今は現在の画像を確認のみできます。
                  </div>
                </div>
              )}
              <div style={{marginBottom: 16}}>
                <div style={{fontSize: 12, color: C.muted, marginBottom: 4}}>タグ</div>
                <div style={{display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8}}>
                  {editing.tags.map((t) => (
                    <span key={t} style={{
                      fontSize: 12, padding: '4px 10px', borderRadius: 4,
                      background: t === vendorTag ? C.accent + '33' : C.panel,
                      color: t === vendorTag ? C.accent : C.text,
                      border: `1px solid ${t === vendorTag ? C.accent : C.border}`,
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}>
                      {t}
                      {t !== vendorTag && (
                        <button onClick={() => handleRemoveTag(t)} style={{background: 'transparent', color: C.muted, border: 'none', cursor: 'pointer', padding: 0, fontSize: 14}}>×</button>
                      )}
                    </span>
                  ))}
                </div>
                <div style={{display: 'flex', gap: 8}}>
                  <input
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                    placeholder="新しいタグ (gpc-* / vendor-section-* / vendor-sort-*)"
                    style={{flex: 1, padding: 8, background: C.panel, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13}}
                  />
                  <button onClick={handleAddTag} style={{padding: '8px 16px', background: C.border, color: C.text, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13}}>追加</button>
                </div>
                <div style={{fontSize: 11, color: C.muted, marginTop: 8, lineHeight: 1.6}}>
                  💡 追加できるタグは <code>gpc-*</code> (例: gpc-feature-1) / <code>vendor-section-*</code> / <code>vendor-sort-*</code> のみ。<br />
                  例: <code>vendor-section-extra1</code> を付けると、その商品が「追加セクション 1」枠に表示されます。
                </div>
              </div>
              <button onClick={handleSave} disabled={saving} style={{
                padding: '10px 24px', background: saving ? C.border : C.accent, color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer', width: '100%',
              }}>{saving ? '保存中…' : '💾 タグを保存'}</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
