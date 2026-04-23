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

import { useState, useCallback, useEffect } from 'react';
import { useLoaderData, useNavigation, useFetcher, Link } from 'react-router';
import type { Route } from './+types/admin.products';
import { AppError } from '~/lib/app-error';
import { PAGE_WIDTH, T } from '~/lib/astromeda-data';
import { ImageUploader } from '~/components/admin/ImageUploader';
import type { ImageUploadResult } from '~/components/admin/ImageUploader';
// patch 0099: タグ入力を TagPicker に統一
import TagPicker from '~/components/admin/TagPicker';
// patch 0135 Phase B: 選択タグの効果リアルタイムプレビュー
import { TagEffectCard } from '~/components/admin/ds/TagEffectCard';
// patch 0107: 商品説明をリッチテキストエディタに統一
import RichTextEditor from '~/components/admin/ds/RichTextEditor';
import {
  formatPrice,
  getProductStatus,
  searchProducts,
  getPriceRangeDisplay,
  getThumbnail,
  type Product,
} from '~/lib/product-manager';
import { RouteErrorBoundary } from '~/components/astro/RouteErrorBoundary';

// patch 0008 (2026-04-18): Storefront API → Admin API 移行
// 理由:
//   - Storefront API は ACTIVE 公開商品のみ（DRAFT が見えない）
//   - totalInventory / status フィールドが欠落
//   - 管理画面で「DRAFT 商品が一覧に出てこない」不具合が発生
// 対策:
//   - verifyAdminAuth + RBAC `products.view` 検証
//   - agents/core/shopify-admin.ts getProducts() を使って DRAFT 含む全商品を取得
//   - ShopifyProduct → Product 型へマップし、既存 UI は変更なし

export async function loader({ request, context }: Route.LoaderArgs) {
  const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);

  // Step 1: 認証チェック（layout でも検査するが loader でも二重防御）
  try {
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    const { AppSession } = await import('~/lib/session');
    const { requirePermission } = await import('~/lib/rbac');
    const session = await AppSession.init(request, [
      String((contextEnv as unknown as { SESSION_SECRET?: string }).SESSION_SECRET || ''),
    ]);
    requirePermission(session, 'products.view');
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Admin products auth error:', error);
    }
    throw AppError.internal('認証に失敗しました');
  }

  // Step 2: Admin API から商品一覧取得（DRAFT 含む）
  try {
    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv as unknown as Record<string, string | undefined>);
    const client = getAdminClient();
    const shopifyProducts = await client.getProducts(50);

    // ShopifyProduct (Admin API) → Product (UI 型) へ正規化
    // featuredImage: {url, altText} → images: [{url, altText}]
    // variants.nodes: [{price: string}] → variants: [{price: {amount, currencyCode}, availableForSale}]
    // priceRangeV2 → priceRange
    const productList: Product[] = shopifyProducts.map((p) => {
      const variants = (p.variants?.nodes || []).map((v) => ({
        id: v.id,
        title: v.title,
        price: { amount: String(v.price ?? '0'), currencyCode: 'JPY' },
        availableForSale: (v.inventoryQuantity ?? 0) > 0,
        sku: v.sku || undefined,
      }));
      const images = p.featuredImage
        ? [{
            url: p.featuredImage.url,
            altText: p.featuredImage.altText || undefined,
          }]
        : [];
      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        productType: p.productType || '',
        vendor: p.vendor || '',
        // Admin API `status` は 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
        availableForSale: String(p.status || '').toUpperCase() === 'ACTIVE',
        totalInventory: p.totalInventory ?? 0,
        priceRange: {
          minVariantPrice: {
            amount: p.priceRangeV2?.minVariantPrice?.amount || '0',
            currencyCode: p.priceRangeV2?.minVariantPrice?.currencyCode || 'JPY',
          },
          maxVariantPrice: {
            amount: p.priceRangeV2?.maxVariantPrice?.amount || '0',
            currencyCode: p.priceRangeV2?.maxVariantPrice?.currencyCode || 'JPY',
          },
        },
        images,
        variants,
      };
    });

    const totalProducts = productList.length;
    const totalVariants = productList.reduce(
      (sum, p) => sum + (p.variants?.length || 0),
      0,
    );

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    productList.forEach((p) => {
      const minVal = parseFloat(p.priceRange?.minVariantPrice?.amount || '0');
      const maxVal = parseFloat(p.priceRange?.maxVariantPrice?.amount || '0');
      if (!Number.isNaN(minVal)) minPrice = Math.min(minPrice, minVal);
      if (!Number.isNaN(maxVal)) maxPrice = Math.max(maxPrice, maxVal);
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
    // Admin API 失敗時は空リストで返して UI 側でメッセージ表示
    // throw するとフルページエラーになるため、graceful fallback に変更
    return {
      products: [] as Product[],
      stats: {
        totalProducts: 0,
        totalVariants: 0,
        priceRange: 'N/A',
      },
      loadError: '商品データの読み込みに失敗しました。Admin API 設定を確認してください。',
    };
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
  imageResourceUrl: string;
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
  imageResourceUrl: '',
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
  const fetcher = useFetcher<{success?: boolean; product?: {id: string}}>();
  const imageFetcher = useFetcher();
  const [form, setForm] = useState<ProductFormData>(initialData);
  const [imageAttaching, setImageAttaching] = useState(false);
  const isSubmitting = fetcher.state !== 'idle';

  // 商品作成成功後に画像を自動 attach
  useEffect(() => {
    if (
      fetcher.state === 'idle' &&
      fetcher.data?.success &&
      fetcher.data?.product?.id &&
      form.imageResourceUrl &&
      !imageAttaching
    ) {
      setImageAttaching(true);
      imageFetcher.submit(
        {
          action: 'attach_product',
          productId: fetcher.data.product.id,
          resourceUrl: form.imageResourceUrl,
          alt: form.title || '',
        },
        {
          method: 'post',
          action: '/api/admin/images',
          encType: 'application/json',
        },
      );
    }
  }, [fetcher.state, fetcher.data, form.imageResourceUrl, form.title, imageAttaching, imageFetcher]);

  const handleSubmit = () => {
    // patch 0111 (P0-1, 全保存パターン監査 2026-04-22):
    // 編集モードでは tags を全置換せず、initial vs current を diff して tagsAdd/tagsRemove に分割。
    // 新規作成モードでは初期タグを丸ごと付与 (差分の参照元がないため)。
    const splitTags = (csv: string): string[] =>
      csv ? csv.split(',').map((t) => t.trim()).filter(Boolean) : [];

    let payload: Record<string, unknown>;
    if (mode === 'create') {
      payload = {
        action: 'create' as const,
        product: {
          title: form.title.trim(),
          descriptionHtml: form.descriptionHtml.trim() || undefined,
          productType: form.productType.trim() || undefined,
          vendor: form.vendor.trim() || undefined,
          tags: form.tags ? splitTags(form.tags) : undefined,
          status: form.status,
          variants: form.variantPrice
            ? [{ price: form.variantPrice, sku: form.variantSku || undefined }]
            : undefined,
        },
      };
    } else {
      const initialTags = splitTags(initialData.tags);
      const currentTags = splitTags(form.tags);
      const initialSet = new Set(initialTags);
      const currentSet = new Set(currentTags);
      const tagsAdd = currentTags.filter((t) => !initialSet.has(t));
      const tagsRemove = initialTags.filter((t) => !currentSet.has(t));
      payload = {
        action: 'update' as const,
        productId: productId!,
        product: {
          title: form.title.trim() || undefined,
          descriptionHtml: form.descriptionHtml.trim() || undefined,
          productType: form.productType.trim() || undefined,
          vendor: form.vendor.trim() || undefined,
          // tags はここに含めない (patch 0111: 全置換を回避)
          status: form.status,
        },
        tagsAdd,
        tagsRemove,
      };
    }

    fetcher.submit(payload, {
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
          {/* patch 0109 (CEO P0): 商品タイプ→「商品ジャンル」、ベンダー→「ブランド名（メーカー）」に統一 */}
          <FormField label="商品ジャンル" value={form.productType} onChange={(v) => setForm({ ...form, productType: v })} placeholder="例: ゲーミングPC" hint="商品の大ざっぱな分類です。検索や並び替えに使われます。" />
          <FormField label="ブランド名（メーカー）" value={form.vendor} onChange={(v) => setForm({ ...form, vendor: v })} placeholder="例: Astromeda" hint="通常は「Astromeda」のままで OK。商品ページに小さく表示されます。" />
          {/* patch 0099: タグ入力を TagPicker に統一 */}
          <div>
            <label style={labelStyle}>タグ</label>
            <TagPicker
              id="product-create-tags-picker"
              value={form.tags}
              onChange={(csv) => setForm({ ...form, tags: csv })}
              placeholder="既存タグを検索 / 新しいタグ名を入力 → Enter で追加"
              excludePulldown
            />
            <div style={{marginTop: 6, fontSize: 11, color: '#999', lineHeight: 1.5}}>
              💡 既存のタグは候補から選べます。新しいタグは入力後 Enter で追加できます。
            </div>
            {/* patch 0135 Phase B: 選択タグの効果リアルタイムプレビュー */}
            {form.tags && form.tags.trim() && (
              <div style={{marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6}}>
                {form.tags
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .map((tag) => (
                    <TagEffectCard key={tag} tag={tag} size="compact" />
                  ))}
              </div>
            )}
          </div>

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

          <ImageUploader
            label="商品画像"
            onUpload={(result: ImageUploadResult) => setForm({...form, imageResourceUrl: result.resourceUrl})}
            currentImageUrl={form.imageResourceUrl || null}
            height={160}
            disabled={isSubmitting}
          />

          {/* patch 0107: 中学生でも編集できるリッチテキスト UI（WYSIWYG/プレビュー/HTMLの3モード切替） */}
          <div>
            <label htmlFor="prod-modal-description-editor" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.t4, marginBottom: 6 }}>
              商品説明
            </label>
            <RichTextEditor
              id="prod-modal-description-editor"
              ariaLabel="商品説明エディタ"
              value={form.descriptionHtml}
              onChange={(html) => setForm({ ...form, descriptionHtml: html })}
              minHeight={200}
              placeholder="商品の特長を書きましょう..."
            />
          </div>

          {mode === 'create' && (
            <>
              <div style={{ borderTop: `1px solid ${T.bd}`, paddingTop: 16, marginTop: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.t4, marginBottom: 12 }}>はじめの種類（任意）</div>
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
    // patch 0114: P1-4 サーバ Zod が confirm:true を要求（誤削除防止）
    fetcher.submit(
      { action: 'delete', productId, confirm: true },
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
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  /** patch 0109: 中学生向けヒント文（input 下にグレーで表示） */
  hint?: string;
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
      {hint && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#999', lineHeight: 1.5 }}>
          💡 {hint}
        </div>
      )}
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
          aria-label="種類（色・サイズ）の詳細を表示"
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
            種類（色・サイズ）の情報 ({product.variants?.length || 0})
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
            <div style={{ color: T.t4, fontSize: 12 }}>種類分けなし（1種類のみ）</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────

export default function AdminProductsDashboard() {
  const data = useLoaderData<typeof loader>();
  const products = data.products;
  const stats = data.stats;
  const loadError = (data as { loadError?: string }).loadError;
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
            全商品の種類（色・サイズ）・在庫・価格を管理できます
          </p>

          {/* Load Error Banner (patch 0008: graceful fallback 時の案内) */}
          {loadError && (
            <div
              role="alert"
              style={{
                padding: '12px 16px',
                marginBottom: 24,
                background: '#3a1515',
                border: '1px solid #ff6b6b',
                borderRadius: 8,
                color: '#ff9b9b',
                fontSize: 13,
              }}
            >
              {loadError}
            </div>
          )}

          {/* Stats Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            {[
              { label: '総商品数', value: stats.totalProducts },
              { label: '種類の合計数', value: stats.totalVariants },
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
            placeholder="商品名、ブランド名、商品ジャンルで検索..."
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
            imageResourceUrl: getThumbnail(selectedProduct.images) || '',
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
