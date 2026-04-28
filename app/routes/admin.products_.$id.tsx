/**
 * Admin Product Detail Editor — Sprint 1 Part 3
 *
 * 単一商品の完全編集画面: 基本情報 / バリアント / 画像 / 公開
 * 全操作は /api/admin/products へ POST（既存セキュリティスタック使用）
 */

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useFetcher, useLoaderData, Link} from 'react-router';
import type {Route} from './+types/admin.products.$id';
import {T, al, PAGE_WIDTH} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import PreviewFrame, {type PreviewDevice} from '~/components/admin/preview/PreviewFrame';
// patch 0082 (R0-P0-4): status enum を中学生向け日本語に統一
import {productStatusLabel, productStatusColor} from '~/lib/admin-utils';
// patch 0099: タグ入力を TagPicker に統一（既存タグを autocomplete 選択）
import TagPicker from '~/components/admin/TagPicker';
// patch 0135 Phase B: タグ効果リアルタイムプレビュー
import {TagEffectCard} from '~/components/admin/ds/TagEffectCard';
// patch 0136 P0: 一括 vs 個別の使い分けガイド
import {TagWorkflowGuide} from '~/components/admin/ds/TagWorkflowGuide';
// patch 0142 P0: 「タグとは何か」の定義カード
import {TagDefinitionCard} from '~/components/admin/ds/TagDefinitionCard';
// patch 0107 (CEO P0-α): 商品説明の生 HTML 編集を、中学生でも触れる
// WYSIWYG + プレビュー + 上級者向け HTML の 3 モード切替に置換
import RichTextEditor from '~/components/admin/ds/RichTextEditor';
// patch 0110 (CEO P0): プルダウン項目選択の canonical 仕様＋全候補プール
import {
  STANDARD_OPTIONS,
  KEYBOARD_OPTIONS,
  PULLDOWN_TAG_PREFIX,
  PULLDOWN_NONE_TAG,
  extractPulldownNamesFromTags,
  hasPulldownNoneTag,
} from '~/components/astro/ProductCustomization';

// ── 型定義 ──
interface ProductDetail {
  id: string;
  title: string;
  handle: string;
  status: string;
  descriptionHtml: string;
  productType: string;
  vendor: string;
  tags: string[];
  publishedAt: string | null;
  variants: Array<{
    id: string;
    title: string;
    price: string;
    compareAtPrice: string | null;
    sku: string;
    barcode: string | null;
    inventoryQuantity: number;
    inventoryItem: {id: string; tracked: boolean};
    selectedOptions: Array<{name: string; value: string}>;
  }>;
  images: Array<{
    id: string;
    alt: string | null;
    url: string;
    width?: number;
    height?: number;
  }>;
}

type BasicInfo = {
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tagsCsv: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
};

// ── Loader ──
export async function loader({params, request, context}: Route.LoaderArgs) {
  const {verifyAdminAuth} = await import('~/lib/admin-auth');
  const contextEnv = (context as unknown as {env: Env}).env || ({} as Env);
  const auth = await verifyAdminAuth(request, contextEnv);
  if (!auth.authenticated) return auth.response;

  const {AppSession} = await import('~/lib/session');
  const {requirePermission} = await import('~/lib/rbac');
  const session = await AppSession.init(request, [
    String((contextEnv as unknown as {SESSION_SECRET?: string}).SESSION_SECRET || ''),
  ]);
  requirePermission(session, 'products.view');

  const rawId = params.id || '';
  const productGid = rawId.startsWith('gid://shopify/Product/')
    ? rawId
    : `gid://shopify/Product/${rawId}`;

  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(productGid)) {
    throw new Response('Invalid product id', {status: 400});
  }

  const {setAdminEnv, getAdminClient} = await import('../../agents/core/shopify-admin.js');
  setAdminEnv(contextEnv as unknown as Record<string, string | undefined>);
  const client = getAdminClient();
  const detail = await client.getProductDetail(productGid);
  if (!detail) {
    throw new Response('Product not found', {status: 404});
  }
  return {product: detail as ProductDetail};
}

// ── Component ──
export default function AdminProductDetail() {
  const {product} = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{success?: boolean; error?: string}>();

  const [tab, setTab] = useState<'basic' | 'variants' | 'images' | 'publish'>('basic');
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');

  // ── フォーム状態 ──
  const initialBasic: BasicInfo = useMemo(() => ({
    title: product.title,
    descriptionHtml: product.descriptionHtml || '',
    vendor: product.vendor || '',
    productType: product.productType || '',
    tagsCsv: (product.tags || []).join(', '),
    status: (product.status?.toUpperCase() || 'DRAFT') as BasicInfo['status'],
  }), [product]);

  const [basic, setBasic] = useState<BasicInfo>(initialBasic);
  const [variants, setVariants] = useState(product.variants);
  const [images, setImages] = useState(product.images);

  // patch 0120 (CEO P0 2026-04-23): 基本情報タブに「販売価格（代表）」を追加。
  // CEO 指摘「商品の価格をいれるところがない」への対処。
  // 多くの商品はバリアント1つ＝価格1つの単純構成のため、基本タブから直接編集
  // できないと「価格をどこで入れるのか分からない」状態が発生していた。
  // - variants[0] の price を「代表価格」として basic タブに露出する。
  // - 複数バリアントがある場合は範囲を表示しつつ「種類タブで個別編集」と案内。
  // - 保存ボタン押下時に variant_update も併発させる（差分があるときのみ）。
  const initialPrimaryPrice = useMemo(() => {
    return product.variants[0]?.price ?? '';
  }, [product.variants]);
  const [primaryPrice, setPrimaryPrice] = useState<string>(initialPrimaryPrice);
  const isPrimaryPriceDirty = primaryPrice !== initialPrimaryPrice;
  const isMultiVariant = product.variants.length > 1;
  const priceRangeText = useMemo(() => {
    const nums = product.variants
      .map((v) => parseFloat(v.price))
      .filter((n) => Number.isFinite(n));
    if (nums.length === 0) return '価格未設定';
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    if (min === max) return `¥${Math.round(min).toLocaleString('ja-JP')}`;
    return `¥${Math.round(min).toLocaleString('ja-JP')} 〜 ¥${Math.round(max).toLocaleString('ja-JP')}`;
  }, [product.variants]);

  // ── patch 0110 (CEO P0): プルダウン項目選択 ──
  // 商品 tag 内の `pulldown:<name>` / `pulldown:none` を見て手動指定状態を組み立てる。
  // チェックボックス UI で更新したら basic.tagsCsv に sync して保存ボタンで Shopify 反映。
  type PulldownMode = 'auto' | 'manual' | 'none';
  const parseCsvTags = useCallback((csv: string): string[] =>
    csv.split(',').map((t) => t.trim()).filter(Boolean),
  []);
  const currentTags = useMemo(() => parseCsvTags(basic.tagsCsv), [basic.tagsCsv, parseCsvTags]);
  /**
   * patch 0110 follow-up: pulldownMode は「UI 状態」として local state で持つ。
   * - tags から「派生」させると、手動モードでチェックを 0 にした瞬間に
   *   pulldown:* タグが消えて pulldownMode が 'auto' に bounce してしまい、
   *   ユーザーは手動モードのチェックボックス UI に到達できない。
   * - 初回マウント時のみ tags から推定し、以後は segmented control の
   *   onClick で setPulldownMode + writePulldownTags を独立に呼ぶ。
   */
  const initialPulldownMode: PulldownMode = useMemo(() => {
    if (hasPulldownNoneTag(currentTags)) return 'none';
    if (extractPulldownNamesFromTags(currentTags).length > 0) return 'manual';
    return 'auto';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pulldownMode, setPulldownMode] = useState<PulldownMode>(initialPulldownMode);
  const selectedPulldownNames = useMemo(
    () => new Set(extractPulldownNamesFromTags(currentTags)),
    [currentTags],
  );
  /**
   * 全プルダウン候補プール。STANDARD_OPTIONS (PC 17項目) + KEYBOARD_OPTIONS (1項目) をカテゴリ分け。
   * 将来 Metaobject 由来 customOption が増えた場合は loader で取得して push できるよう設計。
   */
  const pulldownCatalog = useMemo(() => {
    return {
      pc: STANDARD_OPTIONS.map((o) => o.name),
      keyboard: KEYBOARD_OPTIONS.map((o) => o.name),
    };
  }, []);
  /**
   * basic.tagsCsv の中の `pulldown:*` 系を一旦すべて取り除き、新しい構成で置き換える。
   * mode='auto'  → pulldown:* タグを全消去
   * mode='none'  → pulldown:none のみ
   * mode='manual'→ 渡された names 配列ぶん pulldown:<name> を付与
   */
  const writePulldownTags = useCallback((mode: PulldownMode, names?: string[]) => {
    setBasic((prev) => {
      const tags = parseCsvTags(prev.tagsCsv).filter(
        (t) => t !== PULLDOWN_NONE_TAG && !t.startsWith(PULLDOWN_TAG_PREFIX),
      );
      if (mode === 'none') {
        tags.push(PULLDOWN_NONE_TAG);
      } else if (mode === 'manual' && names && names.length > 0) {
        for (const n of names) tags.push(`${PULLDOWN_TAG_PREFIX}${n}`);
      }
      return {...prev, tagsCsv: tags.join(', ')};
    });
  }, [parseCsvTags]);
  const togglePulldownName = useCallback((name: string) => {
    setBasic((prev) => {
      const tags = parseCsvTags(prev.tagsCsv);
      const noneFiltered = tags.filter((t) => t !== PULLDOWN_NONE_TAG);
      const tagForName = `${PULLDOWN_TAG_PREFIX}${name}`;
      const isOn = noneFiltered.includes(tagForName);
      const next = isOn
        ? noneFiltered.filter((t) => t !== tagForName)
        : [...noneFiltered, tagForName];
      return {...prev, tagsCsv: next.join(', ')};
    });
  }, [parseCsvTags]);
  const setPulldownAllInCategory = useCallback((category: 'pc' | 'keyboard', enable: boolean) => {
    setBasic((prev) => {
      const tags = parseCsvTags(prev.tagsCsv).filter((t) => t !== PULLDOWN_NONE_TAG);
      const targetNames = pulldownCatalog[category];
      const targetTags = new Set(targetNames.map((n) => `${PULLDOWN_TAG_PREFIX}${n}`));
      const stripped = tags.filter((t) => !targetTags.has(t));
      const next = enable ? [...stripped, ...Array.from(targetTags)] : stripped;
      return {...prev, tagsCsv: next.join(', ')};
    });
  }, [parseCsvTags, pulldownCatalog]);

  // ── Toasts ──
  type Toast = {id: number; message: string; type: 'success' | 'error'};
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);
  const pushToast = useCallback((message: string, type: Toast['type']) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, {id, message, type}]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  // ── Fetcher 完了時のトースト ──
  const lastFetchState = useRef(fetcher.state);
  useEffect(() => {
    if (lastFetchState.current !== 'idle' && fetcher.state === 'idle' && fetcher.data) {
      if (fetcher.data.success) pushToast('保存しました', 'success');
      else if (fetcher.data.error) pushToast(`失敗: ${fetcher.data.error}`, 'error');
    }
    lastFetchState.current = fetcher.state;
  }, [fetcher.state, fetcher.data, pushToast]);

  // ── Dirty 判定 + beforeunload ──
  // patch 0120: 代表価格 (primaryPrice) の変更も dirty として扱う。
  const isDirty = useMemo(() => {
    return (
      JSON.stringify(basic) !== JSON.stringify(initialBasic) ||
      isPrimaryPriceDirty
    );
  }, [basic, initialBasic, isPrimaryPriceDirty]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // ── API 呼び出しヘルパー ──
  const submit = useCallback((body: Record<string, unknown>) => {
    fetcher.submit(body, {
      method: 'post',
      action: '/api/admin/products',
      encType: 'application/json',
    });
  }, [fetcher]);

  // ── 保存アクション ──
  // patch 0111 (P0-1, 全保存パターン監査 2026-04-22): タグ差分送信
  // 旧: tags: basic.tagsCsv.split() で全置換 → 別タブで付けた pulldown:* タグが消失
  // 新: initial vs current を diff して tagsAdd / tagsRemove に分割。
  //      productUpdate からは tags フィールドを除外し、tagsAdd/tagsRemove mutation を別経路で発火。
  //      Shopify は他タグを preserve するので「タイトルだけ修正」しても manual pulldown が生き残る。
  const saveBasic = () => {
    const initialTags = parseCsvTags(initialBasic.tagsCsv);
    const currentTagsForDiff = parseCsvTags(basic.tagsCsv);
    const initialSet = new Set(initialTags);
    const currentSet = new Set(currentTagsForDiff);
    const tagsAdd = currentTagsForDiff.filter((t) => !initialSet.has(t));
    const tagsRemove = initialTags.filter((t) => !currentSet.has(t));
    submit({
      action: 'update',
      productId: product.id,
      product: {
        title: basic.title,
        descriptionHtml: basic.descriptionHtml,
        vendor: basic.vendor,
        productType: basic.productType,
        // tags はここに含めない (patch 0111)
        status: basic.status,
      },
      tagsAdd,
      tagsRemove,
    });
    // patch 0120: 代表価格が変わっていたら variant_update も別 submit で続発。
    // バリアント側が単一なら基本タブの保存だけで価格反映が完結する。
    // 複数バリアントの場合も「種類タブ」の variants[0] と表記が同期する。
    if (isPrimaryPriceDirty && variants[0]) {
      const trimmed = primaryPrice.trim();
      if (/^\d+(\.\d{1,2})?$/.test(trimmed)) {
        submit({
          action: 'variant_update',
          productId: product.id,
          variantId: variants[0].id,
          fields: {price: trimmed},
        });
        // 楽観的に種類タブの表示も同期
        setVariants((prev) =>
          prev.map((v, i) => (i === 0 ? {...v, price: trimmed} : v)),
        );
      } else {
        pushToast('販売価格は数字で入れてください（例: 189800）', 'error');
      }
    }
  };

  const saveVariant = (idx: number) => {
    const v = variants[idx];
    submit({
      action: 'variant_update',
      productId: product.id,
      variantId: v.id,
      fields: {
        price: v.price,
        compareAtPrice: v.compareAtPrice || undefined,
        sku: v.sku || undefined,
        barcode: v.barcode || undefined,
      },
    });
  };

  // patch 0090 (R3): window.prompt('Location ID (gid://...)') を admin 水準のインライン Modal に置換。
  // CEO が技術 ID を目にしない設計：Shopify admin の拠点管理からコピペすべき値であることを明記し、
  // 視認性の高い入力フォームで確定/キャンセルを選べるようにする。
  const [invAdjust, setInvAdjust] = useState<{
    idx: number;
    delta: number;
    locationId: string;
  } | null>(null);
  const openInventoryAdjust = (idx: number, delta: number) => {
    const v = variants[idx];
    if (!v.inventoryItem?.id) {
      pushToast('在庫情報が取得できませんでした。時間を置いてやり直してください。', 'error');
      return;
    }
    setInvAdjust({idx, delta, locationId: ''});
  };
  const confirmInventoryAdjust = () => {
    if (!invAdjust) return;
    const locationId = invAdjust.locationId.trim();
    if (!locationId) {
      pushToast('在庫拠点の識別子を入力してください。', 'error');
      return;
    }
    const v = variants[invAdjust.idx];
    if (!v.inventoryItem?.id) return;
    submit({
      action: 'inventory_adjust',
      inventoryItemId: v.inventoryItem.id,
      locationId,
      delta: invAdjust.delta,
    });
    // 楽観的更新
    setVariants((prev) =>
      prev.map((x, i) =>
        i === invAdjust.idx ? {...x, inventoryQuantity: x.inventoryQuantity + invAdjust.delta} : x,
      ),
    );
    setInvAdjust(null);
  };

  // ── 画像管理 ──
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newImageAlt, setNewImageAlt] = useState('');
  const uploadImage = () => {
    if (!newImageUrl.trim()) {
      pushToast('画像URLを入力してください', 'error');
      return;
    }
    submit({
      action: 'image_upload',
      productId: product.id,
      src: newImageUrl.trim(),
      altText: newImageAlt.trim() || undefined,
    });
    setNewImageUrl('');
    setNewImageAlt('');
  };
  // Sprint 6 Gap 4: inline confirm dialog (window.confirm → Modal UI 置換)
  const [confirmImageId, setConfirmImageId] = useState<string | null>(null);
  const deleteImage = (imgId: string) => {
    setConfirmImageId(imgId);
  };
  const confirmDeleteImage = () => {
    const imgId = confirmImageId;
    if (!imgId) return;
    submit({action: 'image_delete', productId: product.id, imageId: imgId});
    setImages((prev) => prev.filter((i) => i.id !== imgId));
    setConfirmImageId(null);
  };
  const moveImage = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[idx], next[target]] = [next[target], next[idx]];
    setImages(next);
  };
  const saveImageOrder = () => {
    submit({
      action: 'image_reorder',
      productId: product.id,
      imageIds: images.map((i) => i.id),
    });
  };

  // ── 公開制御 (Sprint 6 Gap 5: Publication picker) ──
  const [availablePublications, setAvailablePublications] = useState<Array<{id: string; name: string}>>([]);
  const [selectedPublicationIds, setSelectedPublicationIds] = useState<Set<string>>(new Set());
  const [publicationIdsText, setPublicationIdsText] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/publications', {credentials: 'include'});
        if (!res.ok) return;
        const json = (await res.json()) as {success?: boolean; publications?: Array<{id: string; name: string}>};
        if (json.success && Array.isArray(json.publications)) {
          setAvailablePublications(json.publications);
        }
      } catch {
        // silent fallback — manual text input still works
      }
    })();
  }, []);
  const togglePublication = (id: string) => {
    setSelectedPublicationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const parsePublicationIds = (): string[] => {
    if (selectedPublicationIds.size > 0) return Array.from(selectedPublicationIds);
    return publicationIdsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => /^gid:\/\/shopify\/Publication\/\d+$/.test(s));
  };
  const publishTo = (act: 'publish' | 'unpublish') => {
    const ids = parsePublicationIds();
    if (ids.length === 0) {
      pushToast('有効な publicationId を入力してください', 'error');
      return;
    }
    submit({action: act, productId: product.id, publicationIds: ids});
  };

  const saving = fetcher.state !== 'idle';

  // ── スタイル ──
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
  };
  const btnStyle = (primary = false): React.CSSProperties => ({
    padding: '8px 16px',
    background: primary ? T.c : 'transparent',
    border: `1px solid ${primary ? T.c : al(T.tx, 0.25)}`,
    borderRadius: 6,
    color: primary ? T.bg : T.tx,
    fontSize: 12,
    fontWeight: 700,
    cursor: saving ? 'wait' : 'pointer',
    opacity: saving ? 0.6 : 1,
  });

  return (
    <div style={{background: T.bg, minHeight: '100vh', color: T.tx, paddingBottom: 80}}>
      <div style={{...PAGE_WIDTH, padding: '24px 20px'}}>
        {/* patch 0120 (CEO P0 2026-04-23): 戻るボタンを「タブ内に戻る」明示・ボタンスタイルに昇格。
            旧: /admin/products （独立ルート）への text link → admin タブ context が消える
            新: /admin?tab=products （admin タブ内 soft nav）へ button-style Link
            CEO 指摘「タブ内の戻る画面がない」「遷移先からの戻り方がわからない」への対処。 */}
        <div style={{marginBottom: 14}}>
          <Link
            to="/admin?tab=products"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              background: al(T.tx, 0.06),
              border: `1px solid ${al(T.tx, 0.18)}`,
              borderRadius: 8,
              color: T.tx,
              fontSize: 12,
              fontWeight: 700,
              textDecoration: 'none',
            }}
            aria-label="商品管理タブに戻る"
          >
            <span aria-hidden="true">←</span>
            <span>商品管理タブに戻る</span>
          </Link>
        </div>
        {/* Header */}
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap'}}>
          <div>
            <h1 style={{fontSize: 22, fontWeight: 900, margin: '4px 0 0', color: T.tx}}>
              {product.title}
            </h1>
            <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap'}}>
              {/* patch 0082 (R0-P0-4): 生 ENUM → カラーバッジ */}
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  background: productStatusColor(product.status).bg,
                  color: productStatusColor(product.status).fg,
                  letterSpacing: 0.3,
                }}
                aria-label={`商品ステータス: ${productStatusLabel(product.status)}`}
              >
                ● {productStatusLabel(product.status)}
              </span>
              <span style={{fontSize: 11, color: T.t4}}>
                {product.handle} · 種類 {variants.length}件 · 画像 {images.length}枚
              </span>
            </div>
          </div>
          {saving && (
            <div style={{display: 'flex', alignItems: 'center', gap: 8, color: T.c, fontSize: 12}}>
              <Spinner /> 保存中...
            </div>
          )}
        </div>

        {/* patch 0100: プルダウン部品 (Globo 旧データ) のお知らせ。
            tags 空 + productType 空 = カスタマイズプルダウンとして使われている部品商品。
            中学生が誤って「商品」として編集しないようにガイドする。 */}
        {(basic.tagsCsv.trim() === '' && basic.productType.trim() === '') && (
          <div
            role="note"
            style={{
              padding: '12px 14px',
              background: al(T.c, 0.07),
              border: `1px solid ${al(T.c, 0.3)}`,
              borderLeft: `3px solid ${T.c}`,
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 12,
              color: T.tx,
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <span style={{fontSize: 18, lineHeight: 1}}>🧩</span>
            <div style={{flex: 1, lineHeight: 1.55}}>
              <strong style={{display: 'block', marginBottom: 4, fontSize: 13}}>
                これはプルダウンのプルダウンとして使われている部品商品です
              </strong>
              <span style={{color: T.t4}}>
                お客様には「商品」として見えず、商品ページのプルダウン (例: SSD容量 / マザーボード) のプルダウンとして読み込まれます。
                価格・表題・在庫をまとめて管理したいときは
                <Link
                  to="/admin?tab=customization"
                  style={{color: T.c, textDecoration: 'underline', marginLeft: 4, marginRight: 4}}
                >
                  🎛️ カスタマイズタブ
                </Link>
                から編集するのをおすすめします。
              </span>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${al(T.tx, 0.1)}`}}>
          {(['basic', 'variants', 'images', 'publish'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={{
                padding: '10px 18px',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${tab === key ? T.c : 'transparent'}`,
                color: tab === key ? T.tx : T.t4,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {key === 'basic' ? '基本情報' : key === 'variants' ? '種類（色・サイズ）' : key === 'images' ? '画像' : '公開'}
            </button>
          ))}
        </div>

        {/* ── 2-pane Layout: left=form / right=live preview ── */}
        <div
          className="admin-prod-2pane"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(400px, 1fr) minmax(400px, 1.1fr)',
            gap: 20,
            alignItems: 'start',
          }}
        >
          <div style={{minWidth: 0}}>
        {/* ── Basic Info Tab ── */}
        {tab === 'basic' && (
          <div style={cardStyle}>
            <div style={{display: 'grid', gap: 14}}>
              <div>
                <label style={labelStyle}>タイトル</label>
                <input
                  type="text"
                  value={basic.title}
                  onChange={(e) => setBasic({...basic, title: e.target.value})}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="prod-description-editor">商品説明</label>
                {/* patch 0107: 生 HTML textarea → かんたん編集 / プレビュー / HTML の 3 モード切替 */}
                <RichTextEditor
                  id="prod-description-editor"
                  ariaLabel="商品説明エディタ"
                  value={basic.descriptionHtml}
                  onChange={(html) => setBasic({...basic, descriptionHtml: html})}
                  minHeight={260}
                  placeholder="商品の特長を書きましょう。「✏️ かんたん編集」のままでも、見出しや箇条書き・リンクを上のボタンから挿入できます。"
                />
                <div style={{marginTop: 6, fontSize: 11, color: '#999', lineHeight: 1.5}}>
                  💡 「📄 プレビュー」タブで実際の見た目を確認できます。
                  どうしても HTML を直接書きたい場合は「{`{} HTML`}」タブに切り替えてください。
                </div>
              </div>
              {/* patch 0109 (CEO P0): ベンダー → ブランド名（メーカー）／商品タイプ → 商品ジャンル
                  + datalist で代表ジャンル候補を提示。中学生にもわかる自然日本語に統一。 */}
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
                <div>
                  <label style={labelStyle} htmlFor="prod-vendor-input">ブランド名（メーカー）</label>
                  <input
                    id="prod-vendor-input"
                    type="text"
                    value={basic.vendor}
                    onChange={(e) => setBasic({...basic, vendor: e.target.value})}
                    placeholder="例: Astromeda"
                    style={inputStyle}
                  />
                  <div style={{marginTop: 6, fontSize: 11, color: '#999', lineHeight: 1.5}}>
                    💡 通常は「Astromeda」のままで OK。商品ページに小さく表示されます。
                  </div>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="prod-type-input">商品ジャンル</label>
                  <input
                    id="prod-type-input"
                    list="prod-type-suggestions"
                    type="text"
                    value={basic.productType}
                    onChange={(e) => setBasic({...basic, productType: e.target.value})}
                    placeholder="例: ゲーミングPC"
                    style={inputStyle}
                  />
                  <datalist id="prod-type-suggestions">
                    <option value="ゲーミングPC" />
                    <option value="ビジネスPC" />
                    <option value="キーボード" />
                    <option value="マウス" />
                    <option value="マウスパッド" />
                    <option value="PCケース" />
                    <option value="ヘッドセット" />
                    <option value="モニター" />
                    <option value="アクリルスタンド" />
                    <option value="Tシャツ" />
                    <option value="グッズ" />
                    <option value="着せ替えパネル" />
                  </datalist>
                  <div style={{marginTop: 6, fontSize: 11, color: '#999', lineHeight: 1.5}}>
                    💡 商品の大ざっぱな分類。入力欄をクリックすると候補が出ます。検索や並び替えに使われます。
                  </div>
                </div>
              </div>
              <div>
                {/* patch 0142 P0: 「タグとは何か」の定義カード */}
                <TagDefinitionCard />
                {/* patch 0136 P0: 「個別 vs 一括」使い分けガイド (個別ハイライト) */}
                <TagWorkflowGuide highlight="individual" />
                <label style={labelStyle}>タグ</label>
                <TagPicker
                  id="product-tags-picker"
                  value={basic.tagsCsv}
                  onChange={(csv) => setBasic({...basic, tagsCsv: csv})}
                  placeholder="既存タグを検索 / 新しいタグ名を入力 → Enter で追加"
                  excludePulldown
                />
                <div style={{marginTop: 6, fontSize: 11, color: '#999', lineHeight: 1.5}}>
                  💡 既存のタグは候補から選べます。新しいタグは入力後 Enter で追加できます。
                </div>
                {/* patch 0135 Phase B: 各タグの効果リアルタイムプレビュー (compact chip)
                    patch 0191-fu (2026-04-28): pulldown 系タグは下の専用セクションに分離
                    するため、ここでは表示しない (CEO 指示「他タグと混ざらないように表示」) */}
                {basic.tagsCsv && basic.tagsCsv.trim() && (
                  <div style={{marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6}}>
                    {basic.tagsCsv
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .filter((tag) => !tag.startsWith('pulldown') && tag !== 'pulldown-component' && tag !== 'globo-product-options')
                      .map((tag) => (
                        <TagEffectCard key={tag} tag={tag} size="compact" />
                      ))}
                  </div>
                )}

                {/* patch 0191-fu (2026-04-28): プルダウンタグ専用セクション
                    CEO 指示「製品プルダウンタグも個別製品出品画面上でほかのタグと
                    混ざらないように表示してください」への対応。
                    pulldown-component / globo-product-options / pulldown:* で始まるタグを
                    通常タグから切り離して別カードで表示。下の「カスタマイズ：プルダウン構成」
                    セクションへの導線も明示。 */}
                {(() => {
                  const allTags = (basic.tagsCsv || '').split(',').map((t) => t.trim()).filter(Boolean);
                  const pulldownTags = allTags.filter((t) =>
                    t.startsWith('pulldown') || t === 'pulldown-component' || t === 'globo-product-options',
                  );
                  if (pulldownTags.length === 0) return null;
                  return (
                    <div
                      style={{
                        marginTop: 14,
                        padding: 12,
                        background: 'rgba(255,159,67,0.06)',
                        border: '1px solid rgba(255,159,67,0.3)',
                        borderRadius: 8,
                      }}
                    >
                      <div style={{fontSize: 12, fontWeight: 800, color: '#ff9f43', marginBottom: 8}}>
                        🧩 プルダウン部品 (この商品の選択肢として接続中)
                      </div>
                      <div style={{display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8}}>
                        {pulldownTags.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              display: 'inline-block',
                              padding: '4px 10px',
                              background: 'rgba(255,159,67,0.15)',
                              border: '1px solid rgba(255,159,67,0.4)',
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#ffb066',
                            }}
                          >
                            🧩 {tag}
                          </span>
                        ))}
                      </div>
                      <div style={{fontSize: 11, color: '#999', lineHeight: 1.5}}>
                        💡 これらは下の「カスタマイズ：プルダウン構成」で設定された自動付与タグです。通常タグとは別管理されており、ここでは編集できません。
                      </div>
                    </div>
                  );
                })()}
              </div>
              {/* patch 0109 (CEO P0): 生 ENUM (ACTIVE/DRAFT/ARCHIVED) → 自然日本語 + 絵文字 + ヒント */}
              <div>
                <label style={labelStyle} htmlFor="prod-status-select">公開ステータス</label>
                <select
                  id="prod-status-select"
                  value={basic.status}
                  onChange={(e) => setBasic({...basic, status: e.target.value as BasicInfo['status']})}
                  style={inputStyle}
                >
                  <option value="ACTIVE">🟢 公開中（お客様に見えます）</option>
                  <option value="DRAFT">📝 下書き（お客様には見えません）</option>
                  <option value="ARCHIVED">🗄️ アーカイブ（販売停止・履歴のみ）</option>
                </select>
                <div style={{marginTop: 6, fontSize: 11, color: '#999', lineHeight: 1.5}}>
                  💡 「下書き」で保存すれば、お客様には見えません。準備が整ったら「公開中」に変えましょう。
                </div>
              </div>

              {/* patch 0120 (CEO P0 2026-04-23): 販売価格を基本タブから直接編集可能に。
                  CEO 指摘「商品の価格をいれるところがない」への構造的対処。
                  - 単一バリアント商品: そのまま代表価格を編集して保存ボタンで Shopify に反映
                  - 複数バリアント商品: 範囲表示 + 「種類タブで個別に編集」の導線案内
                  入力値は数字のみ（半角・小数2桁まで）。保存時に正規表現でガード。 */}
              <div>
                <label style={labelStyle} htmlFor="prod-primary-price-input">
                  販売価格（税込・円）
                </label>
                {!isMultiVariant ? (
                  <>
                    <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                      <span
                        aria-hidden="true"
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: T.t4,
                          minWidth: 16,
                          textAlign: 'right',
                        }}
                      >
                        ¥
                      </span>
                      <input
                        id="prod-primary-price-input"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={primaryPrice}
                        onChange={(e) => setPrimaryPrice(e.target.value)}
                        placeholder="例: 189800"
                        aria-describedby="prod-primary-price-hint"
                        style={{...inputStyle, fontFamily: 'inherit'}}
                      />
                      {isPrimaryPriceDirty && (
                        <span
                          style={{
                            fontSize: 11,
                            color: T.c,
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          ● 未保存
                        </span>
                      )}
                    </div>
                    <div
                      id="prod-primary-price-hint"
                      style={{marginTop: 6, fontSize: 11, color: '#999', lineHeight: 1.5}}
                    >
                      💡 半角数字で入力します（例: 189800 → ¥189,800）。
                      保存ボタンを押すと Shopify の商品ページにそのまま反映されます。
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      padding: '12px 14px',
                      background: al(T.tx, 0.04),
                      border: `1px solid ${al(T.tx, 0.14)}`,
                      borderRadius: 8,
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: T.tx,
                    }}
                  >
                    <div style={{fontWeight: 700, marginBottom: 4}}>
                      現在の価格：{priceRangeText}（{product.variants.length} 種類）
                    </div>
                    <div style={{fontSize: 11, color: T.t4}}>
                      💡 この商品はバリアント（種類）が複数あります。
                      各バリアントの価格は上のタブから「🧬 種類（バリアント）」を開いて個別に編集してください。
                    </div>
                  </div>
                )}
              </div>

              {/* patch 0110 (CEO P0): プルダウン項目を「商品編集ページから直接プルダウン選択できる」UI。
                  patch 0109 の「ルール説明カード」を CEO 訂正で実選択 UI に置換。
                  - 自動 / 手動 / 表示しない の 3 モードを segmented control で切替
                  - 手動モードでは PC 17項目 + キーボード 1項目を多段チェックボックスで個別 ON/OFF
                  - 結果は basic.tagsCsv に `pulldown:<name>` / `pulldown:none` として書き込まれ、
                    保存ボタンで Shopify 反映 → ProductCustomization.pickOptionSet が tag を見て描画切替 */}
              <div
                style={{
                  marginTop: 4,
                  padding: '16px 18px',
                  background: al(T.tx, 0.04),
                  border: `1px solid ${al(T.tx, 0.14)}`,
                  borderLeft: `3px solid ${T.c}`,
                  borderRadius: 8,
                }}
              >
                <div style={{display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4}}>
                  <span style={{fontSize: 18, lineHeight: 1}} aria-hidden="true">🎛️</span>
                  <strong style={{fontSize: 13, color: T.tx}}>この商品に表示するプルダウン</strong>
                </div>
                <div style={{fontSize: 11, color: T.t4, marginLeft: 28, marginBottom: 12, lineHeight: 1.6}}>
                  💡 「手動で選ぶ」を選ぶと、CPU・SSD・キー配列など、表示したい項目を直接 ON/OFF できます。
                  保存後、商品ページのプルダウンに即反映されます。
                </div>

                {/* 3モード segmented control（プルダウン UI そのもの） */}
                <div
                  role="radiogroup"
                  aria-label="プルダウン表示モード"
                  style={{
                    display: 'inline-flex',
                    background: al(T.tx, 0.06),
                    border: `1px solid ${al(T.tx, 0.16)}`,
                    borderRadius: 8,
                    padding: 3,
                    marginBottom: 12,
                    marginLeft: 28,
                  }}
                >
                  {([
                    {key: 'auto' as const, label: '🤖 自動（おまかせ）', hint: '商品名から自動判定'},
                    {key: 'manual' as const, label: '✋ 手動で選ぶ', hint: '下のチェックで個別指定'},
                    {key: 'none' as const, label: '🚫 表示しない', hint: 'プルダウンを非表示'},
                  ]).map((opt) => {
                    const active = pulldownMode === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        title={opt.hint}
                        onClick={() => {
                          setPulldownMode(opt.key);
                          writePulldownTags(opt.key);
                        }}
                        style={{
                          padding: '6px 14px',
                          fontSize: 12,
                          fontWeight: active ? 700 : 500,
                          color: active ? T.bg : T.tx,
                          background: active ? T.c : 'transparent',
                          border: 'none',
                          borderRadius: 6,
                          cursor: 'pointer',
                          transition: 'background 0.15s, color 0.15s',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {pulldownMode === 'auto' && (
                  <div style={{marginLeft: 28, fontSize: 12, color: T.t4, lineHeight: 1.7}}>
                    🤖 <strong style={{color: T.tx}}>自動判定中</strong>: 商品名にキーワードがあればプルダウンが自動表示されます。
                    <ul style={{margin: '4px 0 0', paddingLeft: 20}}>
                      <li>商品名に「PC / ゲーミング / Ryzen / RTX」など → CPU・SSD など 17 項目を表示</li>
                      <li>商品名に「キーボード」 → キー配列 1 項目を表示</li>
                      <li>マウスパッド・グッズ等 → プルダウンなし</li>
                    </ul>
                  </div>
                )}

                {pulldownMode === 'none' && (
                  <div style={{marginLeft: 28, fontSize: 12, color: T.t4, lineHeight: 1.7}}>
                    🚫 <strong style={{color: T.tx}}>プルダウンを完全に非表示</strong>にします。
                    商品ページにはバリエーション（種類タブ）のみが表示されます。
                  </div>
                )}

                {pulldownMode === 'manual' && (
                  <div style={{marginLeft: 28}}>
                    {/* PC本体カテゴリ */}
                    <div style={{marginBottom: 14}}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6}}>
                        <strong style={{fontSize: 12, color: T.tx}}>
                          🖥️ ゲーミングPC本体（{pulldownCatalog.pc.length}項目）
                        </strong>
                        <div style={{display: 'flex', gap: 6}}>
                          <button
                            type="button"
                            onClick={() => setPulldownAllInCategory('pc', true)}
                            style={{fontSize: 10, padding: '3px 8px', border: `1px solid ${al(T.tx, 0.2)}`, borderRadius: 4, background: 'transparent', color: T.tx, cursor: 'pointer'}}
                          >
                            ✓ 全部選ぶ
                          </button>
                          <button
                            type="button"
                            onClick={() => setPulldownAllInCategory('pc', false)}
                            style={{fontSize: 10, padding: '3px 8px', border: `1px solid ${al(T.tx, 0.2)}`, borderRadius: 4, background: 'transparent', color: T.t4, cursor: 'pointer'}}
                          >
                            × 全部外す
                          </button>
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                          gap: 6,
                          padding: 10,
                          background: al(T.tx, 0.03),
                          border: `1px solid ${al(T.tx, 0.1)}`,
                          borderRadius: 6,
                        }}
                      >
                        {pulldownCatalog.pc.map((name) => {
                          const isOn = selectedPulldownNames.has(name);
                          return (
                            <label
                              key={name}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                fontSize: 12,
                                color: isOn ? T.tx : T.t4,
                                cursor: 'pointer',
                                padding: '4px 6px',
                                borderRadius: 4,
                                background: isOn ? al(T.c, 0.08) : 'transparent',
                                transition: 'background 0.1s, color 0.1s',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isOn}
                                onChange={() => togglePulldownName(name)}
                                aria-label={`${name} を表示する`}
                                style={{cursor: 'pointer'}}
                              />
                              <span>{name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* キーボードカテゴリ */}
                    <div style={{marginBottom: 6}}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6}}>
                        <strong style={{fontSize: 12, color: T.tx}}>
                          ⌨️ キーボード（{pulldownCatalog.keyboard.length}項目）
                        </strong>
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                          gap: 6,
                          padding: 10,
                          background: al(T.tx, 0.03),
                          border: `1px solid ${al(T.tx, 0.1)}`,
                          borderRadius: 6,
                        }}
                      >
                        {pulldownCatalog.keyboard.map((name) => {
                          const isOn = selectedPulldownNames.has(name);
                          return (
                            <label
                              key={name}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                fontSize: 12,
                                color: isOn ? T.tx : T.t4,
                                cursor: 'pointer',
                                padding: '4px 6px',
                                borderRadius: 4,
                                background: isOn ? al(T.c, 0.08) : 'transparent',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isOn}
                                onChange={() => togglePulldownName(name)}
                                aria-label={`${name} を表示する`}
                                style={{cursor: 'pointer'}}
                              />
                              <span>{name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* 件数バッジ */}
                    <div style={{marginTop: 10, fontSize: 11, color: T.t4}}>
                      📊 現在 <strong style={{color: T.tx}}>{selectedPulldownNames.size}</strong> 個のプルダウンを表示する設定です。
                      {selectedPulldownNames.size === 0 && (
                        <span style={{color: T.r, marginLeft: 6}}>
                          （0 個だと「自動」と同じ扱いになります。表示しないなら 🚫 を選んでください）
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* カスタマイズタブへの導線（中身編集はここではなくタブで） */}
                <div style={{marginTop: 12, marginLeft: 28, fontSize: 11, color: T.t4}}>
                  プルダウンの中身（例: CPU の値段や追加候補）を編集するときは
                  <Link
                    to="/admin?tab=customization"
                    style={{
                      color: T.c,
                      textDecoration: 'underline',
                      marginLeft: 4,
                      marginRight: 4,
                      fontWeight: 700,
                    }}
                  >
                    🎛️ カスタマイズタブ
                  </Link>
                  から編集できます。
                </div>
              </div>
              <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8}}>
                {isDirty && <span style={{fontSize: 11, color: T.r, alignSelf: 'center'}}>● 未保存</span>}
                <button
                  type="button"
                  disabled={saving || !isDirty}
                  onClick={saveBasic}
                  style={btnStyle(true)}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Variants Tab ── */}
        {tab === 'variants' && (
          <div style={cardStyle}>
            <div style={{overflowX: 'auto'}}>
              <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 12}}>
                <thead>
                  {/* patch 0082 (R0-P0-4): 英語ヘッダーを中学生向け日本語に統一 */}
                  <tr style={{textAlign: 'left', color: T.t4, borderBottom: `1px solid ${al(T.tx, 0.1)}`}}>
                    <th scope="col" style={{padding: 8}}>種類の名前</th>
                    <th scope="col" style={{padding: 8}}>販売価格</th>
                    <th scope="col" style={{padding: 8}} title="定価（割引前価格）を入力すると、商品ページで「元値ǃ→ 現在値」が表示される">定価（比較）</th>
                    <th scope="col" style={{padding: 8}} title="管理用の商品コード。社内で在庫と出荷を管理するための識別番号">SKU</th>
                    <th scope="col" style={{padding: 8}} title="バーコード（JANコード等）。小売連携用。未使用なら空で OK">バーコード</th>
                    <th scope="col" style={{padding: 8}}>在庫数</th>
                    <th scope="col" style={{padding: 8}}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v, i) => (
                    <tr key={v.id} style={{borderBottom: `1px solid ${al(T.tx, 0.05)}`}}>
                      <td style={{padding: 8, color: T.tx}}>{v.title}</td>
                      <td style={{padding: 8}}>
                        <input
                          type="text"
                          value={v.price}
                          onChange={(e) => setVariants((prev) => prev.map((x, j) => j === i ? {...x, price: e.target.value} : x))}
                          style={{...inputStyle, width: 90, padding: '4px 8px'}}
                        />
                      </td>
                      <td style={{padding: 8}}>
                        <input
                          type="text"
                          value={v.compareAtPrice || ''}
                          onChange={(e) => setVariants((prev) => prev.map((x, j) => j === i ? {...x, compareAtPrice: e.target.value} : x))}
                          style={{...inputStyle, width: 90, padding: '4px 8px'}}
                        />
                      </td>
                      <td style={{padding: 8}}>
                        <input
                          type="text"
                          value={v.sku || ''}
                          onChange={(e) => setVariants((prev) => prev.map((x, j) => j === i ? {...x, sku: e.target.value} : x))}
                          style={{...inputStyle, width: 120, padding: '4px 8px'}}
                        />
                      </td>
                      <td style={{padding: 8}}>
                        <input
                          type="text"
                          value={v.barcode || ''}
                          onChange={(e) => setVariants((prev) => prev.map((x, j) => j === i ? {...x, barcode: e.target.value} : x))}
                          style={{...inputStyle, width: 120, padding: '4px 8px'}}
                        />
                      </td>
                      <td style={{padding: 8, color: T.tx}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: 4}}>
                          <button type="button" onClick={() => openInventoryAdjust(i, -1)} style={{...btnStyle(), padding: '2px 8px'}} aria-label="在庫を1つ減らす">-</button>
                          <span style={{minWidth: 36, textAlign: 'center'}}>{v.inventoryQuantity}</span>
                          <button type="button" onClick={() => openInventoryAdjust(i, 1)} style={{...btnStyle(), padding: '2px 8px'}} aria-label="在庫を1つ増やす">+</button>
                        </div>
                      </td>
                      <td style={{padding: 8}}>
                        <button type="button" onClick={() => saveVariant(i)} style={btnStyle(true)} disabled={saving}>保存</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Images Tab ── */}
        {tab === 'images' && (
          <div style={{display: 'grid', gap: 16}}>
            <div style={cardStyle}>
              <div style={labelStyle}>画像追加 (URL指定)</div>
              <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'end'}}>
                <input
                  type="url"
                  placeholder="https://..."
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  style={inputStyle}
                />
                <input
                  type="text"
                  placeholder="alt text"
                  value={newImageAlt}
                  onChange={(e) => setNewImageAlt(e.target.value)}
                  style={inputStyle}
                />
                <button type="button" onClick={uploadImage} disabled={saving} style={btnStyle(true)}>追加</button>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12}}>
                <div style={labelStyle}>画像一覧 / 並び替え</div>
                <button type="button" onClick={saveImageOrder} disabled={saving || images.length < 2} style={btnStyle(true)}>並び順を保存</button>
              </div>
              <div style={{display: 'grid', gap: 10}}>
                {images.length === 0 && (
                  <div style={{color: T.t4, fontSize: 12, padding: 20, textAlign: 'center'}}>画像がありません</div>
                )}
                {images.map((img, i) => (
                  <div key={img.id} style={{display: 'flex', alignItems: 'center', gap: 12, padding: 8, background: T.bg, borderRadius: 6}}>
                    <img src={img.url} alt={img.alt || ''} width={60} height={60} style={{objectFit: 'cover', borderRadius: 4, background: al(T.tx, 0.05)}} />
                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{fontSize: 11, color: T.tx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{img.alt || '(no alt)'}</div>
                      <div style={{fontSize: 10, color: T.t4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{img.id}</div>
                    </div>
                    <button type="button" onClick={() => moveImage(i, -1)} disabled={i === 0} style={btnStyle()}>↑</button>
                    <button type="button" onClick={() => moveImage(i, 1)} disabled={i === images.length - 1} style={btnStyle()}>↓</button>
                    <button type="button" onClick={() => deleteImage(img.id)} disabled={saving} style={{...btnStyle(), color: T.r, borderColor: al(T.r, 0.5)}}>削除</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Publish Tab ── */}
        {tab === 'publish' && (
          <div style={cardStyle}>
            <div style={{display: 'grid', gap: 14}}>
              {availablePublications.length > 0 && (
                <div>
                  <div style={labelStyle}>公開チャネル選択</div>
                  <div style={{display: 'grid', gap: 6, padding: 12, background: T.bg, border: `1px solid ${al(T.tx, 0.15)}`, borderRadius: 6}}>
                    {availablePublications.map((pub) => {
                      const checked = selectedPublicationIds.has(pub.id);
                      return (
                        <label
                          key={pub.id}
                          style={{display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 12, color: T.tx}}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePublication(pub.id)}
                            style={{accentColor: T.c}}
                          />
                          <span>{pub.name}</span>
                          <span style={{fontSize: 10, color: T.t4, fontFamily: 'monospace', marginLeft: 'auto'}}>{pub.id}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div style={{fontSize: 10, color: T.t4, marginTop: 6}}>
                    {selectedPublicationIds.size > 0
                      ? `${selectedPublicationIds.size} 個のチャネルを選択中`
                      : 'チェックで選択。未選択の場合は下の手動入力にフォールバック'}
                  </div>
                </div>
              )}
              <div>
                <div style={labelStyle}>
                  手動入力（フォールバック: 1行1つ、gid://shopify/Publication/...）
                </div>
                <textarea
                  value={publicationIdsText}
                  onChange={(e) => setPublicationIdsText(e.target.value)}
                  placeholder="gid://shopify/Publication/123456789"
                  rows={4}
                  style={{...inputStyle, fontFamily: 'monospace'}}
                />
                <div style={{fontSize: 11, color: T.t4, marginTop: 6}}>
                  現在の公開状態: {product.publishedAt ? `公開中 (${new Date(product.publishedAt).toLocaleString('ja-JP')})` : '未公開'}
                </div>
              </div>
              <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
                <button type="button" onClick={() => publishTo('unpublish')} disabled={saving} style={btnStyle()}>非公開にする</button>
                <button type="button" onClick={() => publishTo('publish')} disabled={saving} style={btnStyle(true)}>公開する</button>
              </div>
            </div>
          </div>
        )}
          </div>
          {/* ── Live Preview Pane ── */}
          <div style={{minWidth: 0, position: 'sticky', top: 20}}>
            <PreviewFrame device={previewDevice} onDeviceChange={setPreviewDevice}>
              <ProductLivePreview basic={basic} variants={variants} images={images} />
            </PreviewFrame>
          </div>
        </div>
      </div>

      {/* Confirm Image Delete Modal — Sprint 6 Gap 4 */}
      {confirmImageId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmImageId(null);
          }}
        >
          <div
            style={{
              background: T.bg,
              border: `1px solid ${al(T.tx, 0.2)}`,
              borderRadius: 10,
              padding: 24,
              maxWidth: 400,
              width: '100%',
              boxShadow: '0 12px 32px rgba(0,0,0,.7)',
            }}
          >
            <div style={{fontSize: 14, fontWeight: 800, color: T.tx, marginBottom: 16}}>
              この画像を削除しますか？
            </div>
            <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
              <button type="button" onClick={() => setConfirmImageId(null)} style={{padding: '8px 16px', background: 'transparent', border: `1px solid ${al(T.tx, 0.25)}`, borderRadius: 6, color: T.tx, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'}}>
                キャンセル
              </button>
              <button type="button" onClick={confirmDeleteImage} style={{padding: '8px 16px', background: T.r, border: `1px solid ${T.r}`, borderRadius: 6, color: T.tx, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'}}>
                削除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* patch 0090 (R3): 在庫調整モーダル — window.prompt('Location ID (gid://...)') を置換。
          CEO が技術 ID を直接入力する必要はなくなる。Shopify admin の「設定 → 拠点」からコピーした値を貼る。 */}
      {invAdjust !== null && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setInvAdjust(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="inv-adjust-title"
            style={{
              background: T.bg,
              border: `1px solid ${al(T.tx, 0.2)}`,
              borderRadius: 10,
              padding: 24,
              maxWidth: 520,
              width: '100%',
              boxShadow: '0 12px 32px rgba(0,0,0,.7)',
            }}
          >
            <div id="inv-adjust-title" style={{fontSize: 14, fontWeight: 800, color: T.tx, marginBottom: 12}}>
              在庫を{invAdjust.delta > 0 ? '1つ増やす' : '1つ減らす'}
            </div>
            <div style={{fontSize: 12, color: al(T.tx, 0.75), lineHeight: 1.7, marginBottom: 14}}>
              どの拠点の在庫を動かすかを教えてください。<br />
              Shopify 管理画面の「設定 → 拠点」ページで、対象拠点の識別子をコピーして貼り付けてください。
            </div>
            <label style={{display: 'block', fontSize: 12, fontWeight: 600, color: T.tx, marginBottom: 6}}>
              在庫拠点の識別子
            </label>
            <input
              type="text"
              value={invAdjust.locationId}
              onChange={(e) => setInvAdjust((prev) => (prev ? {...prev, locationId: e.target.value} : prev))}
              placeholder="例: gid://shopify/Location/12345"
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px',
                background: al(T.tx, 0.05),
                border: `1px solid ${al(T.tx, 0.25)}`,
                borderRadius: 6,
                color: T.tx,
                fontSize: 12,
                fontFamily: 'monospace',
                marginBottom: 16,
              }}
              aria-label="在庫拠点の識別子（Shopify Location ID）"
            />
            <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
              <button
                type="button"
                onClick={() => setInvAdjust(null)}
                style={{padding: '8px 16px', background: 'transparent', border: `1px solid ${al(T.tx, 0.25)}`, borderRadius: 6, color: T.tx, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'}}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={confirmInventoryAdjust}
                style={{padding: '8px 16px', background: T.c, border: `1px solid ${T.c}`, borderRadius: 6, color: T.bg, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'}}
              >
                この拠点で反映する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Container */}
      <div style={{position: 'fixed', bottom: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 1000}}>
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

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin { to { transform: rotate(360deg); } }
        .spr { width: 14px; height: 14px; border: 2px solid ${al(T.c, 0.3)}; border-top-color: ${T.c}; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @media (max-width: 1400px) {
          .admin-prod-2pane {
            grid-template-columns: 1fr !important;
          }
          .admin-prod-2pane > div:last-child {
            position: static !important;
          }
        }
      `}} />
    </div>
  );
}

function Spinner() {
  return <div className="spr" />;
}

// ══════════════════════════════════════════════════════════
// ProductLivePreview — Sprint 4 Part D
// 商品詳細ページ風のライブプレビュー(左: 画像 / 右: 商品情報)
// ══════════════════════════════════════════════════════════

type BasicForForm = {
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tagsCsv: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
};

interface ProductLivePreviewProps {
  basic: BasicForForm;
  variants: Array<{id: string; title: string; price: string; compareAtPrice: string | null; inventoryQuantity: number}>;
  images: Array<{id: string; url: string; alt: string | null}>;
}

function ProductLivePreview({basic, variants, images}: ProductLivePreviewProps) {
  // 最低価格バリアント
  const minPrice = useMemo(() => {
    if (variants.length === 0) return null;
    const prices = variants
      .map((v) => parseFloat(v.price))
      .filter((p) => !Number.isNaN(p));
    if (prices.length === 0) return null;
    return Math.min(...prices);
  }, [variants]);

  // 在庫合計
  const totalStock = useMemo(
    () => variants.reduce((s, v) => s + (Number.isFinite(v.inventoryQuantity) ? v.inventoryQuantity : 0), 0),
    [variants],
  );
  const inStock = totalStock > 0;

  // script タグ strip
  const safeDescription = (basic.descriptionHtml || '').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');

  const mainImage = images[0];
  const thumbnails = images.slice(0, 6);
  const isDraft = basic.status === 'DRAFT';
  const isArchived = basic.status === 'ARCHIVED';

  return (
    <div style={{background: T.bg, color: T.tx, padding: 24, fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif"}}>
      <div
        className="product-live-preview-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 32,
        }}
      >
        {/* 左: 画像 */}
        <div>
          <div
            style={{
              position: 'relative',
              aspectRatio: '1/1',
              borderRadius: 16,
              overflow: 'hidden',
              background: 'rgba(255,255,255,.02)',
              border: '1px solid rgba(255,255,255,.06)',
            }}
          >
            {mainImage?.url ? (
              <img
                src={mainImage.url}
                alt={mainImage.alt || basic.title}
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
                  fontSize: 12,
                  background: 'linear-gradient(135deg, rgba(0,240,255,.08), rgba(255,179,0,.05))',
                }}
              >
                No Image
              </div>
            )}
            {(isDraft || isArchived) && (
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  padding: '4px 10px',
                  background: isDraft ? al(T.t4, 0.9) : al(T.r, 0.9),
                  color: T.bg,
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: 1,
                  borderRadius: 4,
                }}
              >
                {isDraft ? '下書き' : 'アーカイブ'}
              </div>
            )}
          </div>
          {thumbnails.length > 1 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: 6,
                marginTop: 10,
              }}
            >
              {thumbnails.map((img, i) => (
                <div
                  key={img.id + i}
                  style={{
                    aspectRatio: '1/1',
                    borderRadius: 6,
                    overflow: 'hidden',
                    border: `1px solid ${i === 0 ? T.c : al(T.tx, 0.1)}`,
                    background: al(T.tx, 0.02),
                  }}
                >
                  {img.url && (
                    <img
                      src={img.url}
                      alt=""
                      style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block'}}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右: 商品情報 */}
        <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
          {basic.vendor && (
            <div style={{fontSize: 10, color: T.c, letterSpacing: 3, fontWeight: 800}}>
              {basic.vendor.toUpperCase()}
            </div>
          )}
          <h1 style={{fontSize: 24, fontWeight: 900, color: T.tx, lineHeight: 1.3, margin: 0}}>
            {basic.title || '(タイトル未入力)'}
          </h1>
          {basic.productType && (
            <div style={{fontSize: 11, color: T.t4}}>
              {basic.productType}
            </div>
          )}
          <div style={{display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4}}>
            <span style={{fontSize: 26, fontWeight: 900, color: T.c}}>
              {minPrice != null ? `¥${Math.round(minPrice).toLocaleString('ja-JP')}` : '¥—'}
            </span>
            {variants.length > 1 && <span style={{fontSize: 11, color: T.t4}}>〜</span>}
            <span style={{fontSize: 10, color: T.t4}}>(税込)</span>
          </div>
          <div style={{fontSize: 11, color: inStock ? '#6bff7b' : T.r, fontWeight: 700}}>
            {inStock ? `◎ 在庫あり (${totalStock})` : '✕ 売り切れ'}
          </div>
          {safeDescription ? (
            <div
              style={{
                fontSize: 12,
                color: T.t5,
                lineHeight: 1.7,
                marginTop: 8,
                maxHeight: 180,
                overflow: 'auto',
                padding: 10,
                background: al(T.tx, 0.02),
                borderRadius: 6,
                border: `1px solid ${al(T.tx, 0.05)}`,
              }}
              dangerouslySetInnerHTML={{__html: safeDescription}}
            />
          ) : (
            <div style={{fontSize: 11, color: T.t4, fontStyle: 'italic', marginTop: 8}}>
              (説明文未入力)
            </div>
          )}
          <button
            type="button"
            disabled
            style={{
              marginTop: 12,
              padding: '14px 24px',
              background: isDraft || !inStock ? al(T.tx, 0.1) : T.c,
              border: 'none',
              borderRadius: 8,
              color: isDraft || !inStock ? T.t4 : T.bg,
              fontSize: 13,
              fontWeight: 900,
              letterSpacing: 1,
              cursor: 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            {isDraft ? '下書き — 購入不可' : !inStock ? '売り切れ' : 'カートに追加'}
          </button>
          {basic.tagsCsv && (
            <div style={{display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8}}>
              {basic.tagsCsv
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
                .slice(0, 8)
                .map((tag, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 9,
                      padding: '2px 8px',
                      background: al(T.c, 0.12),
                      border: `1px solid ${al(T.c, 0.3)}`,
                      borderRadius: 4,
                      color: T.c,
                    }}
                  >
                    {tag}
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @media (max-width: 600px) {
          .product-live-preview-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}} />
    </div>
  );
}

export const ErrorBoundary = RouteErrorBoundary;
