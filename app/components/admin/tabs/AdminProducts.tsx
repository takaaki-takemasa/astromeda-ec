/**
 * AdminProducts Tab — 商品管理 + PCティア + UGCレビュー
 *
 * commerceセクション: 商品一覧 CRUD (patch 0079) / PCティアCRUD / UGCレビューCRUD
 * /api/admin/products (商品 CRUD) + /api/admin/cms (Metaobject CRUD)
 *
 * patch 0079 (2026-04-20): R0-P0-1 admin 完結の新規商品作成モーダル実装。
 * Shopify admin への外部遷移を廃止し、中学生基準で「商品を追加→公開」を
 * 迷わず一発でできる UI に全面刷新。
 */

import { useState, useEffect, useCallback } from 'react';
// patch 0101: バナーから「🎛️ カスタマイズ」タブへの直接ジャンプボタン用
import { useSearchParams } from 'react-router';
import { color, font, radius, space } from '~/lib/design-tokens';
import { CompactKPI } from '~/components/admin/CompactKPI';
import { Modal } from '~/components/admin/Modal';
import PreviewFrame, { type PreviewDevice } from '~/components/admin/preview/PreviewFrame';
import { T, al } from '~/lib/astromeda-data';
// patch 0048 (Phase A 適用): window.confirm() 置換用の Stripe 水準確認モーダル
import { useConfirmDialog } from '~/hooks/useConfirmDialog';
// patch 0073 (R2-3): canonical path unification — 非正規タブでの誘導バナー
import { CanonicalRedirectBanner } from '~/components/admin/ds/CanonicalRedirectBanner';
// patch 0074 (R1-2): Stripe/Apple 水準の Skeleton + CTA 付き EmptyState primitive
import { AdminListSkeleton, AdminEmptyCard } from '~/components/admin/ds/InlineListState';
// patch 0087: useToast 統合プリミティブ
import { useToast } from '~/components/admin/ds/Toast';
// patch 0099: IPタグ入力を TagPicker に統一（既存タグを autocomplete 選択）
import TagPicker from '~/components/admin/TagPicker';
// patch 0107 (CEO P0-α): 新規商品作成モーダルでも生 HTML textarea を WYSIWYG に置換
import RichTextEditor from '~/components/admin/ds/RichTextEditor';

// ── Types ──
interface ProductListItem {
  id: string;
  title: string;
  handle: string;
  status: string;
  productType: string;
  vendor: string;
  tags: string[];
  totalInventory: number;
  priceRange: {
    minVariantPrice: { amount: string; currencyCode: string };
    maxVariantPrice: { amount: string; currencyCode: string };
  };
  imageUrl: string | null;
  updatedAt: string;
  createdAt: string;
  cursor: string;
}

interface ProductListResponse {
  success: boolean;
  products: ProductListItem[];
  pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; endCursor: string | null };
  total: number;
  totalProducts?: number | null;
  hiddenComponentCount?: number; // patch 0100: 部品 (Globo 旧データ) で隠された件数
  showComponents?: boolean; // patch 0100: 現在の表示モード
}

// patch 0079: 新規商品作成フォーム state
interface NewProductForm {
  title: string;
  productType: string;
  price: string;
  stock: string;
  sku: string;
  descriptionHtml: string;
  categoryTag: string; // 'PC' | 'ガジェット' | 'グッズ' | '着せ替え' — 必須の分類タグ
  ipTag: string; // 例: one-piece (任意)
  status: 'DRAFT' | 'ACTIVE';
}

const EMPTY_NEW_PRODUCT: NewProductForm = {
  title: '',
  productType: '',
  price: '',
  stock: '',
  sku: '',
  descriptionHtml: '',
  categoryTag: '',
  ipTag: '',
  status: 'DRAFT',
};

const CATEGORY_TAGS = [
  { value: 'PC', label: '🖥️ PC', hint: 'ゲーミングPC本体' },
  { value: 'ガジェット', label: '⌨️ ガジェット', hint: 'キーボード / マウスパッド / PCケース等' },
  { value: 'グッズ', label: '🎁 グッズ', hint: 'アクリルスタンド / Tシャツ / トートバッグ等' },
  { value: '着せ替え', label: '🎨 着せ替え', hint: 'PCパネル / カラーモデル' },
  { value: 'その他', label: '📦 その他', hint: '上記に当てはまらない商品' },
];

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: '公開中',
  DRAFT: '下書き',
  ARCHIVED: 'アーカイブ',
};

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
// patch 0087: ローカル Toast は ~/components/admin/ds/Toast に統合

// ══════════════════════════════════
// ① ProductList — 商品一覧 + 新規作成 (patch 0079)
// ══════════════════════════════════

/**
 * NewProductCardPreview — 新規作成モーダル右ペインのライブプレビュー
 * ストアフロントでのカード描画を模擬
 */
function NewProductCardPreview({ form }: { form: NewProductForm }) {
  const priceNum = Number(form.price || 0);
  const statusLabel = form.status === 'ACTIVE' ? '公開中' : '下書き';
  const statusColor = form.status === 'ACTIVE' ? color.green : color.textMuted;

  return (
    <div style={{ background: T.bg, color: T.tx, fontFamily: 'inherit', padding: 20 }}>
      <div style={{
        fontSize: 11,
        color: T.t4,
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: `1px solid ${al(T.tx, 0.1)}`,
      }}>
        ストアフロント商品カードのプレビュー
      </div>

      <div style={{
        background: T.bgC || '#0a0a0a',
        borderRadius: 12,
        border: `1px solid ${al(T.tx, 0.1)}`,
        overflow: 'hidden',
        maxWidth: 280,
      }}>
        {/* 画像エリア (画像未指定ならグラデ) */}
        <div style={{
          width: '100%',
          aspectRatio: '1 / 1',
          background: `linear-gradient(135deg, ${al(T.c, 0.12)}, ${al(T.t3, 0.08)})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 36,
          color: al(T.tx, 0.3),
        }}>
          {form.categoryTag === 'PC' ? '🖥️' :
            form.categoryTag === 'ガジェット' ? '⌨️' :
            form.categoryTag === 'グッズ' ? '🎁' :
            form.categoryTag === '着せ替え' ? '🎨' : '📦'}
        </div>

        <div style={{ padding: 14 }}>
          {/* タグチップ */}
          {(form.categoryTag || form.ipTag) && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
              {form.categoryTag && (
                <span style={{
                  fontSize: 9,
                  padding: '2px 6px',
                  borderRadius: 3,
                  background: al(T.c, 0.15),
                  color: T.c,
                  fontWeight: 700,
                }}>
                  {form.categoryTag}
                </span>
              )}
              {/* patch 0099: ipTag は CSV。複数チップを描画 */}
              {form.ipTag.split(',').map((t) => t.trim()).filter(Boolean).map((tagName) => (
                <span key={tagName} style={{
                  fontSize: 9,
                  padding: '2px 6px',
                  borderRadius: 3,
                  background: al(T.tx, 0.08),
                  color: T.t4,
                }}>
                  {tagName}
                </span>
              ))}
            </div>
          )}

          {/* 商品名 */}
          <div style={{
            fontSize: 13,
            fontWeight: 700,
            color: T.t5,
            lineHeight: 1.4,
            marginBottom: 8,
            minHeight: 36,
          }}>
            {form.title || '(商品名を入力してください)'}
          </div>

          {/* 価格 */}
          <div style={{
            fontSize: 18,
            fontWeight: 900,
            color: T.c,
            marginBottom: 4,
          }}>
            ¥{priceNum.toLocaleString('ja-JP')}
          </div>

          {/* ステータス */}
          <div style={{ fontSize: 10, color: statusColor, fontWeight: 600 }}>
            ● {statusLabel}
            {form.status === 'DRAFT' && (
              <span style={{ color: T.t4, marginLeft: 6, fontWeight: 400 }}>
                (お客様には表示されません)
              </span>
            )}
          </div>
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
        💡「下書き」で保存すればお客様には見えません。準備が整ったら「公開」に変えてください。画像は作成後に「編集」から差し替えられます。
      </div>
    </div>
  );
}

function ProductList({ onToast }: { onToast: (m: string, t: 'ok' | 'err') => void }) {
  // patch 0101: バナーの「カスタマイズで編集」ボタン用に searchParams を使う
  const [, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DRAFT'>('ALL');
  const [inputQuery, setInputQuery] = useState('');
  // patch 0100: プルダウン部品 (Globo 旧データ: tags 空 + productType 空) を既定で隠す。
  // CEO 指摘「商品一覧をクリックすると製品名の下に大量にプルダウンが羅列する」対応。
  const [showComponents, setShowComponents] = useState(false);
  const [hiddenComponentCount, setHiddenComponentCount] = useState(0);

  // patch 0079: 新規作成モーダル
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<NewProductForm>(EMPTY_NEW_PRODUCT);
  const [saving, setSaving] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('mobile');

  // 削除確認
  const { confirm: confirmDialog, dialogProps, ConfirmDialog: Dialog } = useConfirmDialog();

  const fetchProducts = useCallback(async (opts: { reset?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (!opts.reset && cursor) params.set('cursor', cursor);
      if (searchQuery.trim()) params.set('query', searchQuery.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      // patch 0100: 「部品を含める」トグルが ON のときだけ Globo 旧プルダウン部品も返してもらう
      if (showComponents) params.set('showComponents', 'true');
      const res = await fetch(`/api/admin/products?${params.toString()}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const json: ProductListResponse & { error?: string } = await res.json();
      if (!json.success) throw new Error(json.error || '取得失敗');
      setItems(opts.reset ? json.products : [...items, ...json.products]);
      setTotal(json.total);
      setHasNext(json.pageInfo.hasNextPage);
      setCursor(json.pageInfo.endCursor);
      // patch 0100: 隠した部品件数を保持 (reset 時のみ。ページング時は累積しない)
      if (opts.reset) setHiddenComponentCount(json.hiddenComponentCount ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '商品データ取得に失敗しました');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    setCursor(null);
    fetchProducts({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, statusFilter, showComponents]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(inputQuery);
  };

  const openCreate = () => {
    setForm(EMPTY_NEW_PRODUCT);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    // 中学生向け validation
    if (!form.title.trim()) {
      onToast('商品名を入れてください', 'err');
      return;
    }
    if (!form.categoryTag) {
      onToast('商品のジャンル(PC/ガジェット/グッズ等)を選んでください', 'err');
      return;
    }
    const priceNum = Number(form.price);
    if (!form.price || !Number.isFinite(priceNum) || priceNum < 0) {
      onToast('価格は 0 以上の数字で入れてください', 'err');
      return;
    }
    setSaving(true);
    try {
      const tags: string[] = [form.categoryTag];
      // patch 0099: ipTag は CSV（複数 IP タグ可）として処理
      form.ipTag
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .forEach((t) => tags.push(t));
      const stockNum = Number(form.stock);
      const body = {
        action: 'create',
        product: {
          title: form.title.trim(),
          descriptionHtml: form.descriptionHtml.trim() || undefined,
          productType: form.productType.trim() || form.categoryTag,
          tags,
          status: form.status,
          variants: [{
            price: priceNum.toFixed(2),
            sku: form.sku.trim() || undefined,
            inventoryQuantity: Number.isFinite(stockNum) && form.stock.trim() !== '' ? stockNum : undefined,
          }],
        },
      };
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        const detail = Array.isArray(json.details) ? json.details.join(' / ') : (json.error || '作成失敗');
        throw new Error(detail);
      }
      onToast('商品を作成しました', 'ok');
      setCreateOpen(false);
      setForm(EMPTY_NEW_PRODUCT);
      // 一覧再取得
      setCursor(null);
      await fetchProducts({ reset: true });
    } catch (e) {
      onToast(e instanceof Error ? e.message : '作成失敗', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: ProductListItem) => {
    const ok = await confirmDialog({
      title: `「${p.title}」を削除しますか？`,
      message: 'この商品をストアから完全に削除します。この操作は取り消せません。',
      confirmLabel: '削除する',
      destructive: true,
      contextPath: ['コマース', '🛍️ 商品・販売', '📦 商品管理', '商品一覧'],
    });
    if (!ok) return;
    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // patch 0114: P1-4 サーバ Zod が confirm:true を要求（誤削除防止）
        body: JSON.stringify({ action: 'delete', productId: p.id, confirm: true }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '削除失敗');
      onToast('商品を削除しました', 'ok');
      setCursor(null);
      await fetchProducts({ reset: true });
    } catch (e) {
      onToast(e instanceof Error ? e.message : '削除失敗', 'err');
    }
  };

  const createForm = (
    <div>
      {/* 商品名 (必須) */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ ...labelStyle, fontWeight: 700, color: color.text }}>
          商品名 <span style={{ color: color.red }}>*必須</span>
        </label>
        <input
          style={inputStyle}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="例: BLACKBOX Ryzen 5 7500F + RTX 5060"
          maxLength={255}
        />
        <div style={{ fontSize: 10, color: color.textMuted, marginTop: 4 }}>
          お客様が最初に見る名前です。分かりやすく短めにしてください。
        </div>
      </div>

      {/* ジャンル (必須) */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ ...labelStyle, fontWeight: 700, color: color.text }}>
          商品ジャンル <span style={{ color: color.red }}>*必須</span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {CATEGORY_TAGS.map((cat) => {
            const active = form.categoryTag === cat.value;
            return (
              <button
                key={cat.value}
                type="button"
                onClick={() => setForm({ ...form, categoryTag: cat.value })}
                style={{
                  padding: '10px 12px',
                  background: active ? color.cyan : 'transparent',
                  color: active ? '#000' : color.text,
                  border: `1px solid ${active ? color.cyan : color.border}`,
                  borderRadius: radius.md,
                  cursor: 'pointer',
                  fontSize: font.sm,
                  fontWeight: active ? 700 : 500,
                  fontFamily: font.family,
                  textAlign: 'left',
                }}
              >
                <div>{cat.label}</div>
                <div style={{
                  fontSize: 10,
                  fontWeight: 400,
                  opacity: active ? 0.85 : 0.6,
                  marginTop: 2,
                }}>
                  {cat.hint}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 価格 (必須) + 在庫 + SKU */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div>
          <label style={{ ...labelStyle, fontWeight: 700, color: color.text }}>
            販売価格（円）<span style={{ color: color.red }}>*</span>
          </label>
          <input
            style={inputStyle}
            type="number"
            min={0}
            step={1}
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            placeholder="例: 189800"
          />
        </div>
        <div>
          <label style={labelStyle}>在庫数（任意）</label>
          <input
            style={inputStyle}
            type="number"
            min={0}
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
            placeholder="例: 10"
          />
        </div>
        <div>
          <label style={labelStyle}>商品コード/SKU（任意）</label>
          <input
            style={inputStyle}
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            placeholder="例: PC-BLACKBOX-001"
          />
        </div>
      </div>

      {/* 説明文 — patch 0107: 生 HTML → WYSIWYG */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle} htmlFor="admin-products-create-desc">商品説明（任意）</label>
        <RichTextEditor
          id="admin-products-create-desc"
          ariaLabel="新規商品の説明エディタ"
          value={form.descriptionHtml}
          onChange={(html) => setForm({ ...form, descriptionHtml: html })}
          minHeight={180}
          placeholder="例: 最新 Ryzen 5 7500F と RTX 5060 を搭載したゲーミングPC。フルHD高画質で人気ゲームを快適プレイ。"
        />
        <div style={{ fontSize: 10, color: color.textMuted, marginTop: 4 }}>
          そのまま商品ページに表示されます。後から編集もできます。「📄 プレビュー」で見た目を確認できます。
        </div>
      </div>

      {/* IPタグ (任意) — patch 0099: TagPicker 化 */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>IPコラボタグ（任意）</label>
        <TagPicker
          id="admin-products-create-iptag-picker"
          value={form.ipTag}
          onChange={(csv) => setForm({ ...form, ipTag: csv })}
          placeholder="タグを検索して追加（既存タグから選べます）"
        />
        <div style={{ fontSize: 10, color: color.textMuted, marginTop: 4 }}>
          どのIPコラボに紐づくかを指定します。該当しない商品なら空欄のままで OK です。複数指定も可。
        </div>
      </div>

      {/* 公開状態 */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ ...labelStyle, fontWeight: 700, color: color.text }}>公開状態</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { v: 'DRAFT', label: '📝 下書き (お客様には見えません)', safe: true },
            { v: 'ACTIVE', label: '🟢 公開 (今すぐストアに表示)', safe: false },
          ].map((opt) => {
            const active = form.status === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => setForm({ ...form, status: opt.v as 'DRAFT' | 'ACTIVE' })}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: active ? color.cyan : 'transparent',
                  color: active ? '#000' : color.text,
                  border: `1px solid ${active ? color.cyan : color.border}`,
                  borderRadius: radius.md,
                  cursor: 'pointer',
                  fontSize: font.sm,
                  fontWeight: active ? 700 : 500,
                  fontFamily: font.family,
                  textAlign: 'left',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: color.textMuted, marginTop: 6 }}>
          はじめは「下書き」をおすすめ。作成後「編集」から画像を追加して確認してから「公開」に切り替えましょう。
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleCreate} disabled={saving} style={{
          ...btnPrimary,
          opacity: saving ? 0.6 : 1,
          cursor: saving ? 'not-allowed' : 'pointer',
        }}>
          {saving ? '作成中...' : '＋ 商品を作る'}
        </button>
        <button
          onClick={() => setCreateOpen(false)}
          disabled={saving}
          style={btnOutline}
        >
          キャンセル
        </button>
      </div>
    </div>
  );

  return (
    <div>
      {/* KPI + CTA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <CompactKPI label="表示中の商品" value={String(total)} />
        </div>
        <button
          onClick={openCreate}
          style={{
            ...btnPrimary,
            fontSize: font.sm,
            fontWeight: 700,
            padding: '10px 18px',
          }}
        >
          ＋ 新しい商品を作る
        </button>
      </div>

      {/* 検索 + フィルタ */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 6, flex: 1, minWidth: 240 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder="🔍 商品名で探す (例: BLACKBOX)"
          />
          <button type="submit" style={btnOutline}>探す</button>
        </form>
        <div style={{ display: 'flex', gap: 4 }}>
          {([
            { v: 'ALL', l: 'すべて' },
            { v: 'ACTIVE', l: '公開中' },
            { v: 'DRAFT', l: '下書き' },
          ] as const).map((f) => (
            <button
              key={f.v}
              onClick={() => setStatusFilter(f.v)}
              style={tabStyle(statusFilter === f.v)}
            >
              {f.l}
            </button>
          ))}
        </div>
        {/* patch 0100: 部品 (Globo 旧プルダウン選択肢) を含めて表示するトグル */}
        <button
          type="button"
          onClick={() => setShowComponents((v) => !v)}
          aria-pressed={showComponents}
          style={tabStyle(showComponents)}
          title="プルダウンの選択肢として登録されている部品商品も一覧に表示します"
        >
          {showComponents ? '🧩 部品も表示中' : '🧩 部品を表示'}
        </button>
      </div>

      {/* patch 0100: 部品を隠した件数のお知らせバナー */}
      {/* patch 0101: 「🎛️ カスタマイズで編集」ボタンを追加。CEO の指摘
          「プルダウン項目の編集がどこなのかわからない」に対し、バナー右端から
          直接カスタマイズタブへ 1 クリックで遷移できるようにする。 */}
      {!showComponents && hiddenComponentCount > 0 && !loading && (
        <div
          role="status"
          style={{
            padding: '10px 14px',
            background: color.bg1,
            border: `1px solid ${color.border}`,
            borderLeft: `3px solid ${color.cyan}`,
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 12,
            color: color.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 16 }}>🧩</span>
          <span style={{ flex: 1, minWidth: 200 }}>
            <strong style={{ color: color.text }}>{hiddenComponentCount} 件</strong>
            のプルダウン用の部品商品 (SSD / ストレージ容量 / マザーボード 等) を非表示にしています。
            これらは「🎛️ カスタマイズ」タブから編集できます。
          </span>
          <button
            type="button"
            onClick={() => {
              setSearchParams({ tab: 'customization' });
              try {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              } catch { /* ignore */ }
            }}
            style={{ ...btnPrimary, fontSize: 11, padding: '6px 12px' }}
            aria-label="カスタマイズタブへ移動してプルダウンを編集する"
          >
            🎛️ カスタマイズで編集
          </button>
          <button
            type="button"
            onClick={() => setShowComponents(true)}
            style={{ ...btnOutline, fontSize: 11, padding: '6px 10px' }}
          >
            部品も表示する
          </button>
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div style={{ color: '#ff6b6b', fontSize: 14, padding: 16, background: '#3a1515', borderRadius: 8, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* 商品一覧 */}
      {loading && items.length === 0 ? (
        <AdminListSkeleton rows={8} />
      ) : items.length === 0 ? (
        <AdminEmptyCard
          icon="📦"
          title={searchQuery || statusFilter !== 'ALL' ? '条件に合う商品がありません' : 'まだ商品が登録されていません'}
          description={searchQuery || statusFilter !== 'ALL' ? '検索語句やフィルタを変えてお試しください。' : 'まずは最初の商品を作りましょう。画像は作成後に差し替えられます。'}
          action={<button onClick={openCreate} style={btnPrimary}>＋ 最初の商品を作る</button>}
        />
      ) : (
        <div style={{ background: color.bg0, border: `1px solid ${color.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {items.map((p) => (
            <div key={p.id} style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${color.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <div style={{
                width: 48, height: 48,
                background: p.imageUrl ? `url(${p.imageUrl}) center/cover` : color.bg1,
                borderRadius: 6, flexShrink: 0,
                border: `1px solid ${color.border}`,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: color.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.title}
                </div>
                <div style={{ fontSize: 11, color: color.textMuted, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    color: p.status === 'ACTIVE' ? color.green : color.textMuted,
                    fontWeight: 600,
                  }}>
                    ● {STATUS_LABEL[p.status] || p.status}
                  </span>
                  {p.productType && <span>ジャンル: {p.productType}</span>}
                  {p.totalInventory !== null && p.totalInventory !== undefined && (
                    <span>在庫: {p.totalInventory}</span>
                  )}
                  {p.tags && p.tags.length > 0 && (
                    <span style={{ color: color.cyan }}>
                      #{p.tags.slice(0, 3).join(' #')}
                      {p.tags.length > 3 ? ` +${p.tags.length - 3}` : ''}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: color.cyan, whiteSpace: 'nowrap', marginRight: 8 }}>
                ¥{Number(p.priceRange?.minVariantPrice?.amount || 0).toLocaleString('ja-JP')}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <a
                  href={`/admin/products/${encodeURIComponent(p.id)}`}
                  style={{
                    ...btnOutline,
                    display: 'inline-flex',
                    alignItems: 'center',
                    textDecoration: 'none',
                  }}
                >
                  編集
                </a>
                <button onClick={() => handleDelete(p)} style={btnDanger}>削除</button>
              </div>
            </div>
          ))}

          {/* もっと読み込む */}
          {hasNext && (
            <div style={{ padding: 12, textAlign: 'center', background: color.bg1 }}>
              <button
                onClick={() => fetchProducts()}
                disabled={loading}
                style={{
                  ...btnOutline,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? '読み込み中...' : 'さらに 20 件読み込む'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 新規作成モーダル */}
      {createOpen && (
        <Modal
          title="＋ 新しい商品を作る"
          onClose={() => !saving && setCreateOpen(false)}
          preview={
            <PreviewFrame device={previewDevice} onDeviceChange={setPreviewDevice}>
              <NewProductCardPreview form={form} />
            </PreviewFrame>
          }
        >
          {createForm}
        </Modal>
      )}

      <Dialog {...dialogProps} />
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
    // patch 0114: P1-4 サーバ Zod が confirm:true を要求（誤削除防止）
    const r = await cmsPost({ type: 'astromeda_pc_tier', action: 'delete', id, confirm: true });
    if (r.success) {
      onToast('ティア削除完了', 'ok');
      await fetchData();
    } else {
      onToast(r.error || '削除失敗', 'err');
    }
  };

  if (loading) return <AdminListSkeleton rows={5} />;

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
        <AdminEmptyCard
          icon="🎮"
          title="PCティアが未登録です"
          description="価格帯ごとのおすすめPC構成（GAMER/CREATOR/STREAMER等）を作成してください。"
          action={<button onClick={startCreate} style={btnPrimary}>＋ 新しいティアを作る</button>}
        />
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
    // patch 0114: P1-4 サーバ Zod が confirm:true を要求（誤削除防止）
    const r = await cmsPost({ type: 'astromeda_ugc_review', action: 'delete', id, confirm: true });
    if (r.success) {
      onToast('レビュー削除完了', 'ok');
      await fetchData();
    } else {
      onToast(r.error || '削除失敗', 'err');
    }
  };

  if (loading) return <AdminListSkeleton rows={5} />;

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
        <AdminEmptyCard
          icon="⭐"
          title="UGCレビューが未登録です"
          description="お客様の声を商品ページに表示しましょう。SNSや購入後アンケートから集めたレビューを登録できます。"
          action={<button onClick={startCreate} style={btnPrimary}>＋ 新しいレビューを登録</button>}
        />
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

  // patch 0087: useToast 統合プリミティブで variant 別 duration (error=6.5s)
  const { pushToast, Toast } = useToast();
  const showToast = useCallback(
    (msg: string, type: 'ok' | 'err') => pushToast(msg, type),
    [pushToast],
  );

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
      {tab === 'products' && <ProductList onToast={showToast} />}
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

      <Toast />
    </div>
  );
}
