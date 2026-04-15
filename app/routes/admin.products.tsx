/**
 * Admin Products Dashboard — 商品管理+バリアントUI+CRUD
 *
 * 医学メタファー: 手術室（Operating Room）
 * 商品の検査（閲覧）、誕生（作成）、治療（編集）、アポトーシス（削除）を
 * すべてこの画面で完結させる。
 *
 * Features:
 * - Search/filter bar
 * - Product grid/table with expandable variant details
 * - Stats header
 * - CRUD modals: create / edit / delete
 * - Admin API integration via useFetcher
 */

import { useState, useCallback } from 'react';
import { useLoaderData, useNavigation, useFetcher, Link } from 'react-router';
import type { Route } from './+types/admin.products';
import { AppError } from '~/lib/app-error';
import { PAGE_WIDTH, T } from '~/lib/astromeda-data';
import {
  formatPrice,
  getProductStatus,
  searchProducts,
  getPriceRangeDisplay,
  getThumbnail,
  type Product,
} from '~/lib/product-manager';
import { RouteErrorBoundary } from '~/components/astro/RouteErrorBoundary';

// ─── GraphQL Query: Fetch products with variants ──────
// TODO(Sprint 2+): Admin API ベースへ移行（totalInventory/status/全フィールド取得のため）
//   現状は Storefront API 経由のため totalInventory は取得不可。
//   client.getProductDetail() の一覧版メソッドを agents/core/shopify-admin.ts に追加予定。
const ADMIN_PRODUCTS_QUERY = `#graphql
  query AdminProducts($first: Int!) {
    products(first: $first) {
      nodes {
        id
        title
        handle
        productType
        vendor
        availableForSale
        priceRange {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }
        images(first: 1) {
          nodes { url altText width height }
        }
        variants(first: 50) {
          nodes {
            id
            title
            price { amount currencyCode }
            availableForSale
            sku
          }
        }
      }
    }
  }
` as const;

export async function loader({ context }: Route.LoaderArgs) {
  try {
    const { products } = await context.storefront.query(ADMIN_PRODUCTS_QUERY, {
      variables: { first: 50 },
      cache: context.storefront.CacheShort(),
    });

    const productList = (products?.nodes || []) as Product[];
    const totalProducts = productList.length;
    const totalVariants = productList.reduce((sum, p) => sum + (p.variants?.length || 0), 0);

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    productList.forEach((p) => {
      const minVal = parseFloat(p.priceRange?.minVariantPrice?.amount || '0');
      const maxVal = parseFloat(p.priceRange?.maxVariantPrice?.amount || '0');
      minPrice = Math.min(minPrice, minVal);
      maxPrice = Math.max(maxPrice, maxVal);
    });

    const priceRange =
      minPrice !== Infinity && maxPrice !== -Infinity
        ? `¥${Math.round(minPrice).toLocaleString('ja-JP')} - ¥${Math.round(maxPrice).toLocaleString('ja-JP')}`
        : 'N/A';

    return {
      products: productList,
      stats: { totalProducts, totalVariants, priceRange },
    };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Admin products loader error:', error);
    }
    throw AppError.internal('商品データの読み込みに失敗しました');
  }
}

export const meta: Route.MetaFunction = () => [
  { title: '商品管理 | ASTROMEDA Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

// ─── Types ──────

interface ProductFormData {
  title: string;
  descriptionHtml: string;
  productType: string;
  vendor: string;
  tags: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  variantPrice: string;
  variantSku: string;
}

const EMPTY_FORM: ProductFormData = {
  title: '',
  descriptionHtml: '',
  productType: '',
  vendor: 'ASTROMEDA',
  tags: '',
  status: 'DRAFT',
  variantPrice: '',
  variantSku: '',
};

// ─── Overlay / Modal Backdrop ──────

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}

// ─── Product Create/Edit Modal ──────

function ProductModal({
  mode,
  initialData,
  productId,
  onClose,
}: {
  mode: 'create' | 'edit';
  initialData: ProductFormData;
  productId?: string;
  onClose: () => void;
}) {
  const fetcher = useFetcher();
  const [form, setForm] = useState<ProductFormData>(initialData);
  const isSubmitting = fetcher.state !== 'idle';

  const handleSubmit = () => {
    const payload =
      mode === 'create'
        ? {
            action: 'create' as const,
            product: {
              title: form.title.trim(),
              descriptionHtml: form.descriptionHtml.trim() || undefined,
              productType: form.productType.trim() || undefined,
              vendor: form.vendor.trim() || undefined,
              tags: form.tags
                ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)
                : undefined,
              status: form.status,
              variants: form.variantPrice
                ? [{ price: form.variantPrice, sku: form.variantSku || undefined }]
                : undefined,
            },
          }
        : {
            action: 'update' as const,
            productId: productId!,
            product: {
              title: form.title.trim() || undefined,
              descriptionHtml: form.descriptionHtml.trim() || undefined,
              productType: form.productType.trim() || undefined,
              vendor: form.vendor.trim() || undefined,
              tags: form.tags
                ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)
                : undefined,
              status: form.status,
            },
          };

    fetcher.submit(payload as Record<string, unknown>, {
      method: 'POST',
      action: '/api/admin/products',
      encType: 'application/json',
    });
  };

  const fetcherData = fetcher.data as { success?: boolean; error?: string } | undefined;
  const hasError = fetcherData && !fetcherData.success;
  const hasSuccess = fetcherData?.success;

  return (
    <Overlay onClose={onClose}>
      <div
        style={{
          background: T.t1,
          border: `1px solid ${T.bd}`,
          borderRadius: 16,
          padding: '32px',
          width: '100%',
          maxWidth: 560,
          maxHeight: '85vh',
          overflowY: 'auto',
          color: T.tx,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 800 }}>
          {mode === 'create' ? '新規商品を作成' : '商品を編集'}
        </h2>

        {hasError && (
          <div style={{ background: '#3a1515', border: '1px solid #6b2020', borderRadius: 8, padding: '12px', marginBottom: 16, fontSize: 13, color: '#ff6b6b' }}>
            {fetcherData?.error || 'エラーが発生しました'}
          </div>
        )}

        {hasSuccess && (
          <div style={{ background: '#153a1a', border: '1px solid #206b2a', borderRadius: 8, padding: '12px', marginBottom: 16, fontSize: 13, color: '#6bff7b' }}>
            {mode === 'create' ? '商品を作成しました' : '商品を更新しました'}。ページを再読み込みして反映してください。
          </div>
        )}

        <div style={{ display: 'grid', gap: 16 }}>
          <FormField label="商品名 *" value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="例: ASTROMEDA ゲーミングPC" />
          <FormField label="商品タイプ" value={form.productType} onChange={(v) => setForm({ ...form, productType: v })} placeholder="例: ゲーミングPC, キーボード" />
          <FormField label="ベンダー" value={form.vendor} onChange={(v) => setForm({ ...form, vendor: v })} placeholder="例: ASTROMEDA" />
          <FormField label="タグ (カンマ区切り)" value={form.tags} onChange={(v) => setForm({ ...form, tags: v })} placeholder="例: ゲーミング, PC, Intel" />

          <div>
            <label style={labelStyle}>ステータス</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as ProductFormData['status'] })}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="DRAFT">下書き</option>
              <option value="ACTIVE">公開</option>
              <option value="ARCHIVED">アーカイブ</option>
            </select>
          </div>

          <FormField label="説明 (HTML可)" value={form.descriptionHtml} onChange={(v) => setForm({ ...form, descriptionHtml: v })} multiline placeholder="商品の説明文..." />

          {mode === 'create' && (
            <>
              <div style={{ borderTop: `1px solid ${T.bd}`, paddingTop: 16, marginTop: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.t4, marginBottom: 12 }}>初期バリアント（任意）</div>
              </div>
              <FormField label="価格" value={form.variantPrice} onChange={(v) => setForm({ ...form, variantPrice: v })} placeholder="例: 34980" />
              <FormField label="SKU" value={form.variantSku} onChange={(v) => setForm({ ...form, variantSku: v })} placeholder="例: AST-KB-001" />
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondaryStyle}>キャンセル</button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !form.title.trim()}
            style={{
              ...btnPrimaryStyle,
              opacity: isSubmitting || !form.title.trim() ? 0.5 : 1,
              cursor: isSubmitting || !form.title.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {isSubmitting ? '処理中...' : mode === 'create' ? '作成' : '更新'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ─── Delete Confirm Modal ──────

function DeleteModal({
  productTitle,
  productId,
  onClose,
}: {
  productTitle: string;
  productId: string;
  onClose: () => void;
}) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== 'idle';

  const handleDelete = () => {
    fetcher.submit(
      { action: 'delete', productId },
      { method: 'POST', action: '/api/admin/products', encType: 'application/json' },
    );
  };

  const fetcherData = fetcher.data as { success?: boolean; error?: string } | undefined;
  const hasError = fetcherData && !fetcherData.success;
  const hasSuccess = fetcherData?.success;

  return (
    <Overlay onClose={onClose}>
      <div
        style={{
          background: T.t1,
          border: `1px solid ${T.bd}`,
          borderRadius: 16,
          padding: '32px',
          width: '100%',
          maxWidth: 440,
          color: T.tx,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 800, color: '#ff6b6b' }}>
          商品を削除
        </h2>

        {hasError && (
          <div style={{ background: '#3a1515', border: '1px solid #6b2020', borderRadius: 8, padding: '12px', marginBottom: 16, fontSize: 13, color: '#ff6b6b' }}>
            {fetcherData?.error || '削除に失敗しました'}
          </div>
        )}

        {hasSuccess ? (
          <div style={{ marginBottom: 16 }}>
            <div style={{ background: '#153a1a', border: '1px solid #206b2a', borderRadius: 8, padding: '12px', fontSize: 13, color: '#6bff7b', marginBottom: 16 }}>
              商品を削除しました。ページを再読み込みして反映してください。
            </div>
            <button onClick={onClose} style={btnSecondaryStyle}>閉じる</button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 14, color: T.t5, margin: '0 0 24px', lineHeight: 1.6 }}>
              「<strong style={{ color: T.tx }}>{productTitle}</strong>」を削除します。
              この操作は取り消せません。
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={btnSecondaryStyle}>キャンセル</button>
              <button
                onClick={handleDelete}
                disabled={isSubmitting}
                style={{
                  ...btnPrimaryStyle,
                  background: '#dc2626',
                  opacity: isSubmitting ? 0.5 : 1,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? '削除中...' : '削除する'}
              </button>
            </div>
          </>
        )}
      </div>
    </Overlay>
  );
}

// ─── Form Field Component ──────

function FormField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <Tag
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={multiline ? 4 : undefined}
        style={{
          ...inputStyle,
          ...(multiline ? { resize: 'vertical' as const, minHeight: 80 } : {}),
        }}
      />
    </div>
  );
}

// ─── Shared Styles ──────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: T.t4,
  marginBottom: 6,
  letterSpacing: 0.3,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 14,
  color: T.tx,
  background: T.bg,
  border: `1px solid ${T.bd}`,
  borderRadius: 8,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: '10px 24px',
  fontSize: 14,
  fontWeight: 700,
  color: '#000',
  background: T.c,
  border: 'none',
  borderRadius: 8,
  fontFamily: 'inherit',
};

const btnSecondaryStyle: React.CSSProperties = {
  padding: '10px 24px',
  fontSize: 14,
  fontWeight: 600,
  color: T.t5,
  background: 'transparent',
  border: `1px solid ${T.bd}`,
  borderRadius: 8,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

// ─── ProductRow Component ──────

interface ProductRowProps {
  product: Product;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ProductRow({ product, isExpanded, onToggle, onEdit, onDelete }: ProductRowProps) {
  const status = getProductStatus(product);
  const thumbnail = getThumbnail(product.images);
  const statusColor = status === 'active' ? T.c : status === 'out_of_stock' ? T.r : T.t4;
  const statusLabel = status === 'active' ? '販売中' : status === 'out_of_stock' ? '在庫なし' : '準備中';

  return (
    <div style={{ borderBottom: `1px solid ${T.bd}` }}>
      <div
        style={{
          padding: '16px 0',
          display: 'grid',
          gridTemplateColumns: '60px 1fr 120px 120px 80px 80px 100px',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        {/* Thumbnail — clickable to expand */}
        <button
          onClick={onToggle}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
          aria-label="バリアント詳細を表示"
        >
          <div
            style={{
              width: 60,
              height: 60,
              background: thumbnail ? `url(${thumbnail}) center / cover` : T.t2,
              borderRadius: 8,
            }}
          />
        </button>

        {/* Title — clickable to expand */}
        <button
          onClick={onToggle}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: 0,
            textAlign: 'left',
            color: 'inherit',
            font: 'inherit',
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: T.tx, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {product.title}
          </div>
          <div style={{ fontSize: 11, color: T.t4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {product.productType || product.vendor || 'N/A'}
          </div>
        </button>

        {/* Price Range */}
        <div style={{ fontSize: 13, fontWeight: 600, color: T.c }}>
          {getPriceRangeDisplay(product.priceRange)}
        </div>

        {/* Status */}
        <div style={{ fontSize: 11, fontWeight: 700, color: statusColor, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {statusLabel}
        </div>

        {/* Variant Count */}
        <div style={{ fontSize: 12, color: T.t5, textAlign: 'center' }}>
          {product.variants?.length || 0}
          <div style={{ fontSize: 10, color: T.t4 }}>{isExpanded ? '▼' : '▶'}</div>
        </div>

        {/* Detail Button — Sprint 1 Part 3 */}
        <Link
          to={`/admin/products/${encodeURIComponent(product.id.split('/').pop() || product.id)}`}
          style={{
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 600,
            color: T.tx,
            background: T.c,
            border: `1px solid ${T.c}`,
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'inherit',
            textDecoration: 'none',
          }}
        >
          詳細
        </Link>

        {/* Edit Button */}
        <button
          onClick={onEdit}
          style={{
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 600,
            color: T.c,
            background: 'transparent',
            border: `1px solid ${T.c}40`,
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          編集
        </button>

        {/* Delete Button */}
        <button
          onClick={onDelete}
          style={{
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 600,
            color: '#ff6b6b',
            background: 'transparent',
            border: '1px solid #ff6b6b40',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          削除
        </button>
      </div>

      {/* Expanded Variants Detail */}
      {isExpanded && (
        <div style={{ background: T.t1, padding: '16px', borderTop: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.t4, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 }}>
            バリアント情報 ({product.variants?.length || 0})
          </div>

          {product.variants && product.variants.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              {product.variants.map((variant) => (
                <div key={variant.id} style={{ background: T.bg, border: `1px solid ${T.bd}`, borderRadius: 8, padding: '12px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {variant.title}
                  </div>
                  <div style={{ display: 'grid', gap: '6px', fontSize: 11, color: T.t5 }}>
                    <div>
                      <span style={{ color: T.t4 }}>価格: </span>
                      <span style={{ fontWeight: 600, color: T.c }}>{formatPrice(variant.price.amount)}</span>
                    </div>
                    {variant.sku && (
                      <div>
                        <span style={{ color: T.t4 }}>SKU: </span>
                        <span style={{ fontFamily: 'monospace' }}>{variant.sku}</span>
                      </div>
                    )}
                    <div>
                      <span style={{ color: T.t4 }}>在庫: </span>
                      <span style={{ color: variant.availableForSale ? T.c : T.r, fontWeight: 600 }}>
                        {variant.availableForSale ? '利用可能' : '品切れ'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: T.t4, fontSize: 12 }}>バリアントなし</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────

export default function AdminProductsDashboard() {
  const { products, stats } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = navigation.state === 'loading';

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modal state
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'delete' | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const filteredProducts = searchProducts(products, searchQuery);

  const handleToggleExpand = useCallback((productId: string) => {
    setExpandedId((prev) => (prev === productId ? null : productId));
  }, []);

  const openCreate = useCallback(() => {
    setSelectedProduct(null);
    setModalMode('create');
  }, []);

  const openEdit = useCallback((product: Product) => {
    setSelectedProduct(product);
    setModalMode('edit');
  }, []);

  const openDelete = useCallback((product: Product) => {
    setSelectedProduct(product);
    setModalMode('delete');
  }, []);

  const closeModal = useCallback(() => {
    setModalMode(null);
    setSelectedProduct(null);
  }, []);

  return (
    <div
      style={{
        background: T.bg,
        color: T.tx,
        minHeight: '100vh',
        padding: '32px 0',
        fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif",
      }}
    >
      <div style={PAGE_WIDTH}>
        {/* Header */}
        <div style={{ marginBottom: '48px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h1 style={{ fontSize: 'clamp(24px, 5vw, 40px)', fontWeight: 900, color: T.tx, margin: 0, letterSpacing: -1 }}>
              商品管理
            </h1>
            <button
              onClick={openCreate}
              style={{
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 700,
                color: '#000',
                background: T.c,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              + 新規商品
            </button>
          </div>
          <p style={{ fontSize: 14, color: T.t4, margin: '0 0 24px 0' }}>
            全商品のバリアント・在庫・価格情報を管理
          </p>

          {/* Stats Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            {[
              { label: '総商品数', value: stats.totalProducts },
              { label: '総バリアント数', value: stats.totalVariants },
              { label: '価格範囲', value: stats.priceRange, isText: true },
            ].map((card) => (
              <div key={card.label} style={{ background: T.t1, border: `1px solid ${T.bd}`, borderRadius: 12, padding: '20px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.t4, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
                  {card.label}
                </div>
                <div style={{
                  fontSize: card.isText ? 'clamp(14px, 4vw, 20px)' : 'clamp(20px, 5vw, 32px)',
                  fontWeight: 800, color: T.c, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {card.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ marginBottom: '32px' }}>
          <input
            type="text"
            placeholder="商品名、ベンダー、商品タイプで検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '16px',
              fontSize: 14,
              fontWeight: 500,
              color: T.tx,
              background: T.t1,
              border: `1px solid ${T.bd}`,
              borderRadius: 12,
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
          {searchQuery && (
            <div style={{ marginTop: 8, fontSize: 12, color: T.t4 }}>
              検索結果: {filteredProducts.length} 件
            </div>
          )}
        </div>

        {/* Products Table */}
        <div style={{ background: T.t1, border: `1px solid ${T.bd}`, borderRadius: 12, overflow: 'hidden' }}>
          {/* Column Headers */}
          <div style={{
            padding: '16px 0',
            borderBottom: `1px solid ${T.bd}`,
            display: 'grid',
            gridTemplateColumns: '60px 1fr 120px 120px 80px 80px 100px',
            gap: '12px',
            fontSize: 10,
            fontWeight: 700,
            color: T.t4,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            background: T.bg,
          }}>
            <div>画像</div>
            <div>商品名</div>
            <div>価格</div>
            <div>ステータス</div>
            <div style={{ textAlign: 'center' }}>VR</div>
            <div style={{ textAlign: 'center' }}>編集</div>
            <div style={{ textAlign: 'center' }}>削除</div>
          </div>

          {/* Product Rows */}
          {isLoading ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: T.t4 }}>読み込み中...</div>
          ) : filteredProducts.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: T.t4 }}>
              {searchQuery ? '検索結果がありません' : '商品がありません'}
            </div>
          ) : (
            <div>
              {filteredProducts.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  isExpanded={expandedId === product.id}
                  onToggle={() => handleToggleExpand(product.id)}
                  onEdit={() => openEdit(product)}
                  onDelete={() => openDelete(product)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: '32px', fontSize: 11, color: T.t4, textAlign: 'center' }}>
          表示件数: {filteredProducts.length} / {products.length}
          {searchQuery && ` (フィルタ適用中)`}
        </div>
      </div>

      {/* ─── Modals ─── */}
      {modalMode === 'create' && (
        <ProductModal mode="create" initialData={EMPTY_FORM} onClose={closeModal} />
      )}

      {modalMode === 'edit' && selectedProduct && (
        <ProductModal
          mode="edit"
          productId={selectedProduct.id}
          initialData={{
            title: selectedProduct.title || '',
            descriptionHtml: '',
            productType: selectedProduct.productType || '',
            vendor: selectedProduct.vendor || '',
            tags: '',
            status: 'ACTIVE',
            variantPrice: '',
            variantSku: '',
          }}
          onClose={closeModal}
        />
      )}

      {modalMode === 'delete' && selectedProduct && (
        <DeleteModal
          productTitle={selectedProduct.title}
          productId={selectedProduct.id}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from '~/components/astro/RouteErrorBoundary';
