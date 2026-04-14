/**
 * AdminProducts Tab — 商品管理ショートカット
 *
 * commerceセクションのタブとして表示。
 * 商品管理の全機能は /admin/products ルートにあるため、
 * ここではクイックアクセスとサマリーを提供する。
 */

import { useState, useEffect } from 'react';
import { color } from '~/lib/design-tokens';
import { CompactKPI } from '~/components/admin/CompactKPI';

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

export default function AdminProducts() {
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
      } catch (e) {
        if (!cancelled) setError('商品データの取得に失敗しました');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: color.text, margin: 0 }}>
          商品管理
        </h2>
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
            display: 'inline-block',
          }}
        >
          全商品を管理 →
        </a>
      </div>

      {loading && (
        <div style={{ color: color.textMuted, fontSize: 14 }}>読み込み中...</div>
      )}

      {error && (
        <div style={{ color: '#ff6b6b', fontSize: 14, padding: '16px', background: '#3a1515', borderRadius: 8 }}>
          {error}
        </div>
      )}

      {summary && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
            <CompactKPI label="登録商品数" value={String(summary.total)} />
          </div>

          {summary.products.length > 0 && (
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
        </>
      )}
    </div>
  );
}
