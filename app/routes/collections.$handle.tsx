import {useMemo, useEffect, Suspense} from 'react';
import {useLoaderData, useSearchParams, Await} from 'react-router';
import type {Route} from './+types/collections.$handle';
import {Analytics} from '@shopify/hydrogen';
import {PaginatedResourceSection} from '~/components/PaginatedResourceSection';
import {Link} from 'react-router';
import {T, al, COLLABS, STORE_URL} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {RelatedGuides} from '~/components/astro/RelatedGuides';
import {GamingPCLanding} from '~/components/astro/GamingPCLanding';
import {trackViewItemList} from '~/lib/ga4-ecommerce';
import {
  detectIP,
  detectProductType,
  detectMousepadMaterial,
  extractHardwareSpec,
  loadCriticalData,
  loadDeferredData,
  PRODUCT_TYPE_KW,
  HANDLE_TO_IP,
  PC_PATTERN,
  PC_GAMING_PATTERN,
} from '~/lib/collection-helpers';
import {isPulldownComponent} from '~/lib/pulldown-classifier';
import {AstroProductItem, type CollectionProduct} from '~/components/collection/AstroProductItem';

export const meta: Route.MetaFunction = ({data}) => {
  const title = data?.collection?.title ?? '';
  const description = data?.collection?.description
    ? data.collection.description.slice(0, 155)
    : `${title}の商品一覧 | ASTROMEDA ゲーミングPC`;
  const image = data?.collection?.image?.url;
  const handle = data?.collection?.handle ?? '';
  const canonicalUrl = handle ? `${STORE_URL}/collections/${handle}` : '';
  return [
    {title: `${title} | ASTROMEDA ゲーミングPC`},
    {name: 'description', content: description},
    // 9-17: canonical link + og:url 追加（SEO重複コンテンツ防止）
    ...(canonicalUrl ? [{tagName: 'link' as const, rel: 'canonical', href: canonicalUrl}] : []),
    {property: 'og:title', content: `${title} | ASTROMEDA`},
    {property: 'og:description', content: description},
    {property: 'og:type', content: 'website'},
    ...(canonicalUrl ? [{property: 'og:url', content: canonicalUrl}] : []),
    ...(image ? [{property: 'og:image', content: image}] : []),
    {name: 'twitter:card', content: 'summary_large_image'},
    {name: 'twitter:title', content: `${title} | ASTROMEDA`},
    {name: 'twitter:description', content: description},
    ...(image ? [{name: 'twitter:image', content: image}] : []),
  ];
};

export async function loader(args: Route.LoaderArgs) {
  const deferredData = loadDeferredData(args);
  const criticalData = await loadCriticalData(args);
  return {...deferredData, ...criticalData};
}


// D-11/D-12: CPU/GPUフィルタ追加
type AnnotatedProduct = CollectionProduct & {_ip: string | null; _type: string | null; _material: string | null; _cpu: string | null; _gpu: string | null};

export default function Collection() {
  const {collection, sortParam, recommendedCollections, isGamingLanding, gamingLandingData} = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const collabData = COLLABS.find((c) => c.shop === collection.handle);
  const accent = collabData?.accent ?? T.c;

  // フィルターはURL検索パラメータで管理（JS hydration不要でLink遷移で動作）
  const typeFilter = searchParams.get('type') || null;
  const ipFilter = searchParams.get('ip') || null;
  const materialFilter = searchParams.get('material') || null;
  const cpuFilter = searchParams.get('cpu') || null;     // D-11
  const gpuFilter = searchParams.get('gpu') || null;     // D-12
  const priceFilter = searchParams.get('price') || null; // D-13

  // GA4 view_item_list イベント（社会ネットワーク層 — コレクション閲覧の記録）
  useEffect(() => {
    if (collection.products?.nodes?.length) {
      trackViewItemList(
        collection.title,
        collection.products.nodes.slice(0, 20).map((p: CollectionProduct) => ({
          id: p.id,
          title: p.title,
          price: p.selectedOrFirstAvailableVariant?.price?.amount,
          vendor: p.vendor,
        })),
      );
    }
  }, [collection.handle]);

  const isGadgetCollection = collection.handle === 'gadgets';
  const isAstromedaCollection = collection.handle === 'astromeda' || collection.handle === 'gaming-pc';

  const allProducts = collection.products.nodes;

  const annotated: AnnotatedProduct[] = useMemo(() => {
    return (allProducts as CollectionProduct[]).map((p) => {
      const title: string = p.title;
      const tags = p.tags ?? [];
      // 製品種類の検出 — PC / ガジェット系 / グッズ系すべて統一的に検出
      // patch 0102: タグ後退判定を有効化 (#パックマス系 42件など title にキーワードが無い PC を救う)
      let type = detectProductType(title, tags);
      if (!type) {
        // 種類未分類の場合、PC判定
        if (PC_PATTERN.test(title) || PC_GAMING_PATTERN.test(title)) {
          type = 'ゲーミングPC';
        }
      }
      return {
        ...p,
        _ip: detectIP(title, tags),
        _type: type,
        _material: detectMousepadMaterial(title, parseFloat(p.priceRange?.minVariantPrice?.amount ?? '0')),
        // patch 0014: タグに CPU:/GPU: が無い場合はタイトルから抽出
        _cpu: extractHardwareSpec(title, tags, 'CPU'),
        _gpu: extractHardwareSpec(title, tags, 'GPU'),
      };
    });
  }, [allProducts]);

  const isGoodsCollection = collection.handle === 'goods';

  // このコレクションの期待IP（IPコレクションの場合のみ設定）
  const expectedIP = HANDLE_TO_IP[collection.handle] ?? null;

  // 内部パーツ・仮登録商品を除外 + ガジェット・グッズコレクションではPC本体を除外
  // + IPコレクションでは別IPの商品を除外（Storefront API公開設定の差異対策）
  const baseProducts = useMemo(() => {
    // patch 0103: canonical isPulldownComponent ヘルパーで「プルダウン項目」を最優先除外。
    // CEO 指示「プルダウン項目を製品 UI に出さない」への対応。
    // PARTS_KW regex は title ベースの旧来補助フィルタとして残置（pulldown 以外の OPTION 行）
    const PARTS_KW = /Wireless LAN|Wi-Fi|Bluetooth|SSD|HDD|NVMe|DDR[45]|^RAM |^CPU |^GPU |OPTION|PCIe|M\.2|USB Hub|Fan |Power Supply|PSU|Cooler|AIO/i;
    const cleaned = annotated.filter((p) => {
      const t: string = p.title;
      // patch 0103: canonical プルダウン項目除外 (tag/heuristic 統合判定)
      if (isPulldownComponent({title: t, tags: p.tags ?? [], productType: (p as {productType?: string}).productType})) return false;
      if (/【OPTION\s*\d*\s*】/.test(t) || t.includes('【OPTION')) return false;
      const minPrice = parseFloat(p.priceRange?.minVariantPrice?.amount ?? '0');
      if (minPrice === 0) return false;
      if (PARTS_KW.test(t)) return false;
      // patch 0103: 在庫切れ商品も storefront から除外 (CEO 指示「在庫停止商品は含めない」)
      // Storefront API は variants(first:1) で availableForSale を返すのでそれをチェック
      const variantNodes = (p as {variants?: {nodes?: Array<{availableForSale?: boolean}>}}).variants?.nodes;
      if (variantNodes && variantNodes.length > 0 && variantNodes.every((v) => v.availableForSale === false)) {
        return false;
      }
      return true;
    });

    if (isGadgetCollection || isGoodsCollection) {
      return cleaned.filter((p) => {
        const t: string = p.title;
        const isPC = /[【\[](GAMER|STREAMER|CREATOR)[】\]]/.test(t) ||
          (t.includes('コラボレーションPC') && !t.includes('ケース')) ||
          (t.includes('コラボPC') && !t.includes('ケース')) ||
          (t.includes('ゲーミングPC') && !t.includes('ケース') && !t.includes('マウスパッド') && !t.includes('キーボード'));
        return !isPC;
      });
    }

    // IPコレクション: 別IPの商品が混入している場合に除外
    if (expectedIP) {
      return cleaned.filter((p) => {
        // IP検出できない商品はそのまま表示（汎用品の可能性）
        if (!p._ip) return true;
        // 検出されたIPがこのコレクションのIPと一致するか
        return p._ip === expectedIP;
      });
    }

    return cleaned;
  }, [annotated, isGadgetCollection, isGoodsCollection, expectedIP]);

  const availableIPs = useMemo(() => {
    const ipSet = new Set(baseProducts.map((p) => p._ip).filter(Boolean) as string[]);
    return [...ipSet].sort((a, b) => {
      const ai = COLLABS.findIndex((c) => c.id === a);
      const bi = COLLABS.findIndex((c) => c.id === b);
      return ai - bi;
    });
  }, [baseProducts]);

  const availableTypes = useMemo(() => {
    const typeSet = new Set(baseProducts.map((p) => p._type).filter(Boolean) as string[]);
    // ガジェット/グッズコレクションでは、ページネーションで一部タイプが欠落する場合に備え
    // 期待されるタイプを常に含める
    if (isGadgetCollection) {
      ['マウスパッド', 'キーボード', 'パネル', 'PCケース'].forEach((t) => typeSet.add(t));
    }
    if (isGoodsCollection) {
      ['アクリルスタンド', 'アクリルキーホルダー', 'Tシャツ', 'パーカー', '缶バッジ', 'メタルカード', 'トートバッグ', 'モバイルバッテリー'].forEach((t) => typeSet.add(t));
    }
    // ガジェットコレクションではゲーミングPCを除外
    if (isGadgetCollection) {
      typeSet.delete('ゲーミングPC');
    }
    // 固定順序で返す（PRODUCT_TYPE_KWの定義順）
    const order = Object.keys(PRODUCT_TYPE_KW);
    return order.filter((t) => typeSet.has(t));
  }, [baseProducts, isGadgetCollection, isGoodsCollection]);

  // マウスパッド素材フィルタ用：マウスパッドが絞り込まれている時 or ガジェットコレクションでマウスパッドがある時
  const availableMaterials = useMemo(() => {
    const pool = typeFilter === 'マウスパッド'
      ? baseProducts.filter((p) => p._type === 'マウスパッド')
      : baseProducts.filter((p) => p._material);
    const matSet = new Set(pool.map((p) => p._material).filter(Boolean) as string[]);
    // 固定順序: ラバー → ポロンライク → ガラス
    const order = ['ラバー', 'ポロンライク', 'ガラス'];
    return order.filter((m) => matSet.has(m));
  }, [baseProducts, typeFilter]);

  // D-11: CPU別フィルタ（PCコレクション・全商品コレクション用）
  const availableCPUs = useMemo(() => {
    const cpuSet = new Set(baseProducts.map((p) => p._cpu).filter(Boolean) as string[]);
    return [...cpuSet].sort();
  }, [baseProducts]);

  // D-12: GPU別フィルタ（PCコレクション・全商品コレクション用）
  const availableGPUs = useMemo(() => {
    const gpuSet = new Set(baseProducts.map((p) => p._gpu).filter(Boolean) as string[]);
    return [...gpuSet].sort();
  }, [baseProducts]);

  const filteredProducts = useMemo(() => {
    return baseProducts.filter((p) => {
      if (ipFilter && p._ip !== ipFilter) return false;
      if (typeFilter && p._type !== typeFilter) return false;
      if (materialFilter && p._material !== materialFilter) return false;
      if (cpuFilter && p._cpu !== cpuFilter) return false;
      if (gpuFilter && p._gpu !== gpuFilter) return false;
      // D-13: 価格帯フィルタ
      if (priceFilter) {
        const price = parseFloat(p.priceRange?.minVariantPrice?.amount ?? '0');
        const [minStr, maxStr] = priceFilter.split('-');
        const min = parseInt(minStr) || 0;
        const max = maxStr ? parseInt(maxStr) : Infinity;
        if (price < min || price > max) return false;
      }
      return true;
    });
  }, [baseProducts, ipFilter, typeFilter, materialFilter, cpuFilter, gpuFilter, priceFilter]);

  const sortOptions = [
    {label: '新着順', value: 'newest'},
    {label: 'おすすめ', value: 'default'},
    {label: '価格が安い', value: 'price-asc'},
    {label: '価格が高い', value: 'price-desc'},
  ];

  // URL生成ヘルパー: 現在のパラメータを保持しつつ指定キーを変更
  const makeFilterUrl = (key: string, value: string | null, resetKeys?: string[]) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    // 追加でリセットするキー（例: type変更時にmaterialをリセット）
    if (resetKeys) {
      for (const k of resetKeys) params.delete(k);
    }
    params.delete('cursor');
    params.delete('direction');
    return `/collections/${collection.handle}?${params.toString()}`;
  };

  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        color: T.tx,
        fontFamily: "'Outfit', 'Noto Sans JP', system-ui, sans-serif",
      }}
    >
      {/* パンくずリスト削除 — ナビゲーションで十分 */}

      {/* Collection header */}
      <div
        style={{
          padding: 'clamp(24px, 3vw, 48px) clamp(16px, 4vw, 48px)',
          paddingTop: 0,
          background: `linear-gradient(160deg, ${al(accent, 0.08)}, transparent 60%)`,
          borderBottom: `1px solid ${al(accent, 0.12)}`,
        }}
      >
        {collabData?.tag && (
          <div
            style={{
              display: 'inline-block',
              fontSize: 9,
              fontWeight: 900,
              padding: '3px 10px',
              borderRadius: 6,
              background: collabData.tag === 'NEW' ? T.r : '#FF9500',
              color: T.tx,
              letterSpacing: 2,
              marginBottom: 12,
            }}
          >
            {collabData.tag}
          </div>
        )}
        <h1
          className="ph"
          style={{
            fontSize: 'clamp(18px, 3vw, 32px)',
            fontWeight: 900,
            color: T.tx,
            marginBottom: 8,
          }}
        >
          {collection.title}
        </h1>
        {collection.description && (
          <p style={{fontSize: 'clamp(11px, 1.3vw, 14px)', color: T.t5, lineHeight: 1.7, maxWidth: 600}}>
            {collection.description}
          </p>
        )}

        {/* C4: Citability Statement — AI引用用1文サマリー */}
        <p
          style={{
            fontSize: 'clamp(11px, 1.2vw, 13px)',
            color: T.t5,
            lineHeight: 1.7,
            maxWidth: 640,
            marginTop: 8,
            fontStyle: 'italic',
            opacity: 0.7,
          }}
        >
          {collabData
            ? `ASTROMEDA × ${collection.title}コラボレーション — 公式ライセンスのゲーミングPC・ガジェット・グッズを取り揃え。国内自社工場で組立、全8色カスタマイズ対応。`
            : `ASTROMEDA ${collection.title} — 日本発のゲーミングPCブランドASTROMEDAの公式オンラインストア。25タイトル以上のIPコラボ、RTX 5000シリーズ+DDR5標準搭載。`
          }
        </p>
      </div>

      {/* ゲーミングPC Landing セクション */}
      {isGamingLanding && (
        <GamingPCLanding
          rankingProducts={gamingLandingData?.rankingProducts ?? []}
          newsItems={gamingLandingData?.newsItems ?? []}
          featureCards={gamingLandingData?.featureCards ?? []}
          cpuCards={gamingLandingData?.cpuCards ?? []}
          gpuCards={gamingLandingData?.gpuCards ?? []}
          priceRanges={gamingLandingData?.priceRanges ?? []}
          gamingHeroSlides={gamingLandingData?.gamingHeroSlides ?? []}
          contactInfo={gamingLandingData?.contactInfo ?? undefined}
        />
      )}

      {/* Filter & Sort bar — ボタン形式: 製品群 → 素材 → IP → 並べ替え */}
      <div style={{
        padding: '14px clamp(16px, 4vw, 48px) 10px',
        borderBottom: `1px solid ${T.t1}`,
        display: 'flex', flexDirection: 'column' as const, gap: 10,
      }}>
        {/* 1. 製品種類ボタン — ゲーミングPCコレクションでは種類が1つなので非表示 */}
        {availableTypes.length > 0 && !isAstromedaCollection && (
          <div style={{display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap'}}>
            <span style={{fontSize: 10, color: T.t4, fontWeight: 700, letterSpacing: 1, marginRight: 2}}>種類</span>
            <Link
              to={makeFilterUrl('type', null, ['material'])}
              preventScrollReset
              style={{
                fontSize: 11, fontWeight: !typeFilter ? 700 : 500,
                padding: '5px 14px', borderRadius: 20,
                border: `1px solid ${!typeFilter ? al(T.g, 0.5) : T.t1}`,
                background: !typeFilter ? al(T.g, 0.12) : 'transparent',
                color: !typeFilter ? T.g : T.t5,
                cursor: 'pointer', transition: 'all .15s ease',
                textDecoration: 'none',
              }}
            >
              すべて
            </Link>
            {availableTypes.map((type) => (
              <Link
                key={type}
                to={makeFilterUrl('type', typeFilter === type ? null : type, ['material'])}
                preventScrollReset
                style={{
                  fontSize: 11, fontWeight: typeFilter === type ? 700 : 500,
                  padding: '5px 14px', borderRadius: 20,
                  border: `1px solid ${typeFilter === type ? al(T.g, 0.5) : T.t1}`,
                  background: typeFilter === type ? al(T.g, 0.12) : 'transparent',
                  color: typeFilter === type ? T.g : T.t5,
                  cursor: 'pointer', transition: 'all .15s ease',
                  textDecoration: 'none',
                }}
              >
                {type}
              </Link>
            ))}
          </div>
        )}
        {/* マウスパッド素材ボタン */}
        {typeFilter === 'マウスパッド' && availableMaterials.length > 1 && (
          <div style={{display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap'}}>
            <span style={{fontSize: 10, color: T.t4, fontWeight: 700, letterSpacing: 1, marginRight: 2}}>素材</span>
            <Link
              to={makeFilterUrl('material', null)}
              preventScrollReset
              style={{
                fontSize: 11, fontWeight: !materialFilter ? 700 : 500,
                padding: '5px 14px', borderRadius: 20,
                border: `1px solid ${!materialFilter ? al('#26C6DA', 0.5) : T.t1}`,
                background: !materialFilter ? al('#26C6DA', 0.12) : 'transparent',
                color: !materialFilter ? '#26C6DA' : T.t5,
                cursor: 'pointer', transition: 'all .15s ease',
                textDecoration: 'none',
              }}
            >
              すべて
            </Link>
            {availableMaterials.map((mat) => (
              <Link
                key={mat}
                to={makeFilterUrl('material', materialFilter === mat ? null : mat)}
                preventScrollReset
                style={{
                  fontSize: 11, fontWeight: materialFilter === mat ? 700 : 500,
                  padding: '5px 14px', borderRadius: 20,
                  border: `1px solid ${materialFilter === mat ? al('#26C6DA', 0.5) : T.t1}`,
                  background: materialFilter === mat ? al('#26C6DA', 0.12) : 'transparent',
                  color: materialFilter === mat ? '#26C6DA' : T.t5,
                  cursor: 'pointer', transition: 'all .15s ease',
                  textDecoration: 'none',
                }}
              >
                {mat}
              </Link>
            ))}
          </div>
        )}
        {/* 2. IPプルダウン */}
        {availableIPs.length > 1 && (
          <div style={{display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap'}}>
            <select
              value={ipFilter ?? ''}
              onChange={(e) => { window.location.href = makeFilterUrl('ip', e.target.value || null); }}
              style={{
                fontSize: 12, color: ipFilter ? T.c : T.t5,
                padding: '7px 28px 7px 12px', borderRadius: 8,
                border: `1px solid ${ipFilter ? al(T.c, 0.4) : T.t1}`,
                background: ipFilter ? al(T.c, 0.08) : T.bgC,
                cursor: 'pointer',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 10px center',
              }}
            >
              <option value="" style={{background: T.bg, color: T.t5}}>IP：すべて</option>
              {availableIPs.map((ip) => {
                const c = COLLABS.find(x => x.id === ip);
                if (!c) return null;
                return <option key={ip} value={ip} style={{background: T.bg, color: T.t5}}>{c.name}</option>;
              })}
            </select>
          </div>
        )}
        {/* D-11: CPUフィルタ（PC商品が含まれるコレクションのみ） */}
        {availableCPUs.length > 1 && (
          <div style={{display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap'}}>
            <select
              value={cpuFilter ?? ''}
              onChange={(e) => { window.location.href = makeFilterUrl('cpu', e.target.value || null); }}
              aria-label="CPU で絞り込み"
              style={{
                fontSize: 12, color: cpuFilter ? '#10b981' : T.t5,
                padding: '7px 28px 7px 12px', borderRadius: 8,
                border: `1px solid ${cpuFilter ? al('#10b981', 0.4) : T.t1}`,
                background: cpuFilter ? al('#10b981', 0.08) : T.bgC,
                cursor: 'pointer', appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
              }}
            >
              <option value="" style={{background: T.bg, color: T.t5}}>CPU：すべて</option>
              {availableCPUs.map((cpu) => (
                <option key={cpu} value={cpu} style={{background: T.bg, color: T.t5}}>{cpu}</option>
              ))}
            </select>
          </div>
        )}
        {/* D-12: GPUフィルタ */}
        {availableGPUs.length > 1 && (
          <div style={{display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap'}}>
            <select
              value={gpuFilter ?? ''}
              onChange={(e) => { window.location.href = makeFilterUrl('gpu', e.target.value || null); }}
              aria-label="GPU で絞り込み"
              style={{
                fontSize: 12, color: gpuFilter ? T.c : T.t5,
                padding: '7px 28px 7px 12px', borderRadius: 8,
                border: `1px solid ${gpuFilter ? al(T.c, 0.4) : T.t1}`,
                background: gpuFilter ? al(T.c, 0.08) : T.bgC,
                cursor: 'pointer', appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
              }}
            >
              <option value="" style={{background: T.bg, color: T.t5}}>GPU：すべて</option>
              {availableGPUs.map((gpu) => (
                <option key={gpu} value={gpu} style={{background: T.bg, color: T.t5}}>{gpu}</option>
              ))}
            </select>
          </div>
        )}
        {/* D-13: 価格帯フィルタ（PC商品があるコレクションのみ） */}
        {(availableCPUs.length > 0 || availableGPUs.length > 0) && (
          <div style={{display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap'}}>
            <span style={{fontSize: 10, color: T.t4, fontWeight: 700, letterSpacing: 1, marginRight: 2}}>価格帯</span>
            {[
              {label: 'すべて', value: null},
              {label: '〜20万', value: '0-200000'},
              {label: '20〜30万', value: '200000-300000'},
              {label: '30〜40万', value: '300000-400000'},
              {label: '40万〜', value: '400000'},
            ].map((opt) => (
              <Link
                key={opt.label}
                to={makeFilterUrl('price', priceFilter === opt.value ? null : opt.value)}
                preventScrollReset
                style={{
                  fontSize: 11, fontWeight: priceFilter === opt.value ? 700 : 500,
                  padding: '5px 14px', borderRadius: 20,
                  border: `1px solid ${priceFilter === opt.value ? al('#f59e0b', 0.5) : T.t1}`,
                  background: priceFilter === opt.value ? al('#f59e0b', 0.12) : 'transparent',
                  color: priceFilter === opt.value ? '#f59e0b' : T.t5,
                  cursor: 'pointer', transition: 'all .15s ease',
                  textDecoration: 'none',
                }}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        )}
        {/* 3. 並べ替えボタン & 件数 */}
        <div style={{display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap'}}>
          <span style={{fontSize: 10, color: T.t4, fontWeight: 700, letterSpacing: 1, marginRight: 2}}>並替</span>
          {sortOptions.map((opt) => (
            <Link
              key={opt.value}
              to={makeFilterUrl('sort', opt.value)}
              preventScrollReset
              style={{
                fontSize: 11, fontWeight: sortParam === opt.value ? 700 : 500,
                padding: '5px 14px', borderRadius: 20,
                border: `1px solid ${sortParam === opt.value ? al(T.c, 0.5) : T.t1}`,
                background: sortParam === opt.value ? al(T.c, 0.12) : 'transparent',
                color: sortParam === opt.value ? T.c : T.t5,
                cursor: 'pointer', transition: 'all .15s ease',
                textDecoration: 'none',
              }}
            >
              {opt.label}
            </Link>
          ))}
          {/* フィルタ結果件数 */}
          {/* patch 0016: cpu/gpu/material/price 単独でも件数表示 */}
          {(ipFilter || typeFilter || cpuFilter || gpuFilter || materialFilter || priceFilter) && (
            <span style={{fontSize: 11, color: T.t4, marginLeft: 4}}>
              {filteredProducts.length}件
            </span>
          )}
        </div>
      </div>

      {/* Products grid */}
      <div style={{padding: 'clamp(20px, 3vw, 40px) clamp(16px, 4vw, 48px)'}}>
        {/* patch 0016: cpu/gpu/material/price 単独でも filteredProducts grid を使う
            （以前は ip/type 以外のフィルタが無視され PaginatedResourceSection の
             生データが描画されていた） */}
        {(ipFilter || typeFilter || cpuFilter || gpuFilter || materialFilter || priceFilter) ? (
          <div className="astro-products-grid">
            {filteredProducts.map((product, index: number) => (
              <AstroProductItem key={product.id} product={product} accent={accent} loading={index < 8 ? 'eager' : undefined} />
            ))}
            {filteredProducts.length === 0 && (
              <div style={{gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: T.t4}}>該当する商品がありません</div>
            )}
          </div>
        ) : (
          <PaginatedResourceSection connection={collection.products} resourcesClassName="astro-products-grid">
            {({node: product, index}: {node: CollectionProduct; index: number}) => {
              // 内部パーツ・仮登録商品を非表示
              const title: string = product.title ?? '';
              // patch 0103: canonical プルダウン項目除外 (tag/heuristic 統合判定)
              if (isPulldownComponent({title, tags: product.tags ?? [], productType: (product as {productType?: string}).productType})) return null;
              if (/【OPTION\s*\d*\s*】/.test(title) || title.includes('【OPTION')) return null;
              const minPrice = parseFloat(product.priceRange?.minVariantPrice?.amount ?? '0');
              if (minPrice === 0) return null;
              const PARTS_KW_INLINE = /Wireless LAN|Wi-Fi|Bluetooth|SSD|HDD|NVMe|DDR[45]|^RAM |^CPU |^GPU |OPTION|PCIe|M\.2|USB Hub|Fan |Power Supply|PSU|Cooler|AIO/i;
              if (PARTS_KW_INLINE.test(title)) return null;
              // patch 0103: 在庫切れ商品も storefront grid から除外
              const variantNodes = (product as {variants?: {nodes?: Array<{availableForSale?: boolean}>}}).variants?.nodes;
              if (variantNodes && variantNodes.length > 0 && variantNodes.every((v) => v.availableForSale === false)) return null;
              // IPコレクション: 別IPの商品が混入していたら非表示
              if (expectedIP) {
                const detectedIP = detectIP(title, product.tags ?? []);
                if (detectedIP && detectedIP !== expectedIP) return null;
              }
              return <AstroProductItem key={product.id} product={product} accent={accent} loading={index < 8 ? 'eager' : undefined} />;
            }}
          </PaginatedResourceSection>
        )}
      </div>

      <Analytics.CollectionView data={{collection: {id: collection.id, handle: collection.handle}}} />

      {/* BreadcrumbList JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            'itemListElement': [
              {
                '@type': 'ListItem',
                'position': 1,
                'name': 'ホーム',
                'item': STORE_URL,
              },
              {
                '@type': 'ListItem',
                'position': 2,
                'name': 'コレクション',
                'item': `${STORE_URL}/collections`,
              },
              {
                '@type': 'ListItem',
                'position': 3,
                'name': collection.title,
                'item': `${STORE_URL}/collections/${collection.handle}`,
              },
            ],
          }),
        }}
      />

      {/* CollectionPage Schema.org (#64-65 IPコラボLP最適化) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            'name': collection.title,
            'description': collection.description || `${collection.title}の商品一覧 | ASTROMEDA`,
            'url': `${STORE_URL}/collections/${collection.handle}`,
            ...(collabData ? {
              'about': {
                '@type': 'Brand',
                'name': collabData.name,
              },
            } : {}),
            'isPartOf': {
              '@type': 'WebSite',
              'name': 'ASTROMEDA',
              'url': STORE_URL,
            },
          }),
        }}
      />

      {/* C5: ItemList JSON-LD — コレクション内商品をリスト構造化 */}
      {collection.products?.nodes?.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              'name': collection.title,
              'numberOfItems': collection.products.nodes.length,
              'itemListElement': collection.products.nodes.slice(0, 20).map((p: CollectionProduct, i: number) => ({
                '@type': 'ListItem',
                'position': i + 1,
                'url': `${STORE_URL}/products/${p.handle}`,
                'name': p.title,
                ...(p.selectedOrFirstAvailableVariant?.price?.amount ? {
                  'item': {
                    '@type': 'Product',
                    'name': p.title,
                    'url': `${STORE_URL}/products/${p.handle}`,
                    ...(p.selectedOrFirstAvailableVariant?.image?.url ? {'image': p.selectedOrFirstAvailableVariant.image.url} : {}),
                    'offers': {
                      '@type': 'Offer',
                      'price': p.selectedOrFirstAvailableVariant.price.amount,
                      'priceCurrency': p.selectedOrFirstAvailableVariant.price.currencyCode || 'JPY',
                      'availability': p.selectedOrFirstAvailableVariant?.availableForSale ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
                    },
                  },
                } : {}),
              })),
            }),
          }}
        />
      )}

      {/* IPコラボ説明セクション — IPコレクションのみ表示 (#64-65) */}
      {collabData && (
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '32px clamp(16px, 4vw, 48px)',
            borderTop: `1px solid ${al(accent, 0.1)}`,
          }}
        >
          <div
            style={{
              background: al(accent, 0.03),
              borderRadius: 16,
              padding: 'clamp(20px, 3vw, 32px)',
              border: `1px solid ${al(accent, 0.08)}`,
            }}
          >
            <h2
              style={{
                fontSize: 'clamp(14px, 2vw, 18px)',
                fontWeight: 900,
                color: accent,
                marginBottom: 12,
              }}
            >
              {collabData.name} × ASTROMEDA コラボレーション
            </h2>
            <p
              style={{
                fontSize: 'clamp(11px, 1.3vw, 13px)',
                color: 'rgba(255,255,255,.6)',
                lineHeight: 1.8,
                margin: '0 0 16px',
              }}
            >
              人気IP「{collabData.name}」とASTROMEDAの特別コラボレーション。
              キャラクターをモチーフにしたデザインのゲーミングPC、周辺機器、グッズを展開。
              国内自社工場で一台ずつ丁寧に製造しています。
            </p>
            <div style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
              {collabData.cats?.split(',').map((cat: string) => (
                <span
                  key={cat}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 6,
                    background: al(accent, 0.1),
                    color: accent,
                  }}
                >
                  {cat}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* C1: コレクション詳細説明文 + C2: 購入ガイド + C3: FAQ（全コレクション動的生成） */}
      {(() => {
        const productCount = collection.products?.nodes?.length ?? 0;
        const ipName = collabData?.name ?? collection.title;
        const isIP = !!collabData;
        const isGaming = collection.handle === 'astromeda' || collection.handle === 'gaming-pc';
        const isGadgets = collection.handle === 'gadgets';
        const isGoods = collection.handle === 'goods';
        const catsStr = collabData?.cats ?? '';
        const hasPC = catsStr.includes('pc');
        const hasPad = catsStr.includes('pad');
        const hasPanel = catsStr.includes('panel');

        // C1: 説明文（300-500文字想定）
        const descText = isIP
          ? `「${ipName}」× ASTROMEDAの公式ライセンスコラボレーション。${hasPC ? `最新NVIDIA GeForce RTX 5000シリーズGPU搭載のゲーミングPCを${ipName}デザインでお届け。GAMER・STREAMER・CREATORの3ティアからお選びいただけます。` : ''}${hasPad ? 'オリジナルデザインのゲーミングマウスパッド、' : ''}${hasPanel ? '着せ替えパネル、' : ''}${catsStr.includes('kb') ? 'ゲーミングキーボード、' : ''}${catsStr.includes('acrylic') ? 'アクリルスタンド、' : ''}${catsStr.includes('tshirt') ? 'Tシャツ' : ''}など多彩なラインナップ。すべて国内自社工場で品質管理のもと製造・出荷しています。`
          : isGaming
          ? 'ASTROMEDAのゲーミングPC全モデル一覧。NVIDIA GeForce RTX 5000シリーズ＋DDR5メモリ標準搭載。199,980円のGAMERモデルから、配信者向けSTREAMER、クリエイター向けCREATORまで、用途に合わせた最適な1台を。全8色のイルミネーションカスタマイズにも対応しています。'
          : isGadgets
          ? 'ASTROMEDAのゲーミングガジェットコレクション。25タイトル以上の人気IPコラボのマウスパッド、キーボード、PCケース、着せ替えパネルを取り揃え。ゲーミングPCとトータルコーディネートで、デスク周りをお気に入りのキャラクターで統一できます。'
          : isGoods
          ? 'ASTROMEDAの公式IPコラボグッズ。アクリルスタンド、Tシャツ、パーカー、缶バッジ、メタルカードなど、ファン必携のアイテムが揃います。25タイトル以上のアニメ・ゲームとの公式ライセンスコラボレーション。'
          : `${collection.title}の商品一覧。日本発ゲーミングPCブランドASTROMEDAの公式オンラインストアで取り扱い中。`;

        // C2: 購入ガイド
        const guideItems = isIP && hasPC
          ? [
              {icon: '🎮', title: 'ティアを選ぶ', desc: 'GAMER(¥199,980〜)・STREAMER(¥405,440〜)・CREATOR(¥455,840〜)の3段階'},
              {icon: '🎨', title: 'カラーを選ぶ', desc: '8色のイルミネーションカラーから好みの色をカスタマイズ'},
              {icon: '📦', title: '注文・配送', desc: '国内自社工場から直送。送料無料・初期不良サポート付き'},
            ]
          : isGaming
          ? [
              {icon: '🎮', title: '用途で選ぶ', desc: 'FPSゲーム→GAMER、配信→STREAMER、動画編集→CREATOR'},
              {icon: '💰', title: '予算で選ぶ', desc: '20万円台〜40万円台まで。全モデルRTX 5000+DDR5標準'},
              {icon: '🎨', title: 'カラーを選ぶ', desc: '8色から選べるイルミネーションカスタマイズ'},
            ]
          : null;

        // C3: FAQ
        const faqItems = isIP
          ? [
              {q: `${ipName}コラボPCのスペックは？`, a: `NVIDIA GeForce RTX 5000シリーズGPU＋DDR5メモリ標準搭載。GAMER・STREAMER・CREATORの3ティアからお選びいただけます。`},
              {q: `${ipName}コラボ商品は公式ライセンスですか？`, a: `はい。すべてIPホルダーの正式許諾を得た公式ライセンス商品です。`},
              {q: '送料はかかりますか？', a: 'ゲーミングPCは送料無料でお届けします。ガジェット・グッズの送料は商品ページをご確認ください。'},
              {q: '保証やサポートはありますか？', a: '国内自社工場で組立・品質検査を行っており、初期不良対応・修理サポートが付いています。'},
              {q: '他のIPコラボとの違いは？', a: `${ipName}コラボは専用デザインのPC本体・周辺機器・グッズを一式で展開。デスク周りをトータルコーディネートできます。`},
            ]
          : isGaming
          ? [
              {q: 'ASTROMEDAのゲーミングPCはどこで買えますか？', a: 'この公式オンラインストアで直接購入できます。国内自社工場から直送、送料無料です。'},
              {q: 'どのティアを選べばいいですか？', a: 'FPSゲームを快適にプレイしたい方はGAMER、配信もしたい方はSTREAMER、動画編集もする方はCREATORがおすすめです。'},
              {q: '他社のゲーミングPCとの違いは？', a: '25タイトル以上のIPコラボデザイン、8色カスタマイズ、国内自社工場生産がASTROMEDAの強みです。'},
            ]
          : [
              {q: `${collection.title}にはどんな商品がありますか？`, a: `現在${productCount}件の商品を取り扱っています。詳しくは上の商品一覧をご覧ください。`},
              {q: '送料はかかりますか？', a: 'ゲーミングPCは送料無料です。ガジェット・グッズの送料は商品ページをご確認ください。'},
            ];

        return (
          <div style={{maxWidth: 1200, margin: '0 auto', padding: '0 clamp(16px, 4vw, 48px) clamp(32px, 4vw, 48px)'}}>
            {/* C1: コレクション説明文 */}
            <section style={{marginBottom: 32}}>
              <div style={{fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,.35)', letterSpacing: 2, marginBottom: 12}}>
                {isIP ? 'ABOUT THIS COLLABORATION' : 'ABOUT THIS COLLECTION'}
              </div>
              <p style={{fontSize: 'clamp(12px, 1.3vw, 14px)', color: 'rgba(255,255,255,.6)', lineHeight: 1.8, margin: 0}}>
                {descText}
              </p>
            </section>

            {/* C2: 購入ガイド */}
            {guideItems && (
              <section style={{marginBottom: 32}}>
                <div style={{fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,.35)', letterSpacing: 2, marginBottom: 12}}>
                  HOW TO ORDER
                </div>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12}}>
                  {guideItems.map((item, i) => (
                    <div key={i} style={{background: al(accent, 0.04), border: `1px solid ${al(accent, 0.08)}`, borderRadius: 10, padding: 16}}>
                      <div style={{fontSize: 20, marginBottom: 6}}>{item.icon}</div>
                      <div style={{fontSize: 'clamp(12px, 1.3vw, 14px)', fontWeight: 700, color: T.tx, marginBottom: 4}}>
                        {`${i + 1}. ${item.title}`}
                      </div>
                      <div style={{fontSize: 'clamp(10px, 1.1vw, 12px)', color: 'rgba(255,255,255,.5)', lineHeight: 1.6}}>
                        {item.desc}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* C3: コレクション別FAQ */}
            <section style={{marginBottom: 16}}>
              <div style={{fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,.35)', letterSpacing: 2, marginBottom: 12}}>
                FAQ
              </div>
              <div style={{borderTop: '1px solid rgba(255,255,255,.06)'}}>
                {faqItems.map((faq, i) => (
                  <details key={i} style={{borderBottom: '1px solid rgba(255,255,255,.06)', padding: '12px 0'}}>
                    <summary style={{fontSize: 'clamp(11px, 1.2vw, 13px)', color: 'rgba(255,255,255,.7)', fontWeight: 600, cursor: 'pointer', listStyle: 'none'}}>
                      Q: {faq.q}
                    </summary>
                    <p style={{fontSize: 'clamp(11px, 1.1vw, 12px)', color: 'rgba(255,255,255,.5)', lineHeight: 1.7, margin: '8px 0 0 0', paddingLeft: 16}}>
                      A: {faq.a}
                    </p>
                  </details>
                ))}
              </div>
            </section>

            {/* C3+F1: FAQPage JSON-LD for collections */}
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                  '@context': 'https://schema.org',
                  '@type': 'FAQPage',
                  'mainEntity': faqItems.map(f => ({
                    '@type': 'Question',
                    'name': f.q,
                    'acceptedAnswer': {'@type': 'Answer', 'text': f.a},
                  })),
                }),
              }}
            />
          </div>
        );
      })()}

      {/* Recommended Collections — Deferred loaded */}
      {recommendedCollections && (
        <Suspense fallback={<div style={{padding: '24px', color: T.tx}}>推奨コレクションを読み込み中...</div>}>
          <Await
            resolve={recommendedCollections}
            errorElement={<div style={{padding: '24px', color: T.tx}}>推奨コレクションの読み込みに失敗しました</div>}
          >
            {(collections) =>
              collections && collections.length > 0 ? (
                <div
                  style={{
                    padding: 'clamp(24px, 3vw, 48px) clamp(16px, 4vw, 48px)',
                    borderTop: `1px solid ${al(accent, 0.12)}`,
                  }}
                >
                  <h2
                    style={{
                      fontSize: 'clamp(16px, 2vw, 24px)',
                      fontWeight: 700,
                      color: T.tx,
                      marginBottom: 16,
                    }}
                  >
                    他のコレクションを見る
                  </h2>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 'clamp(12px, 2vw, 16px)',
                    }}
                  >
                    {collections.map((coll) => (
                      <Link
                        key={coll.handle}
                        to={`/collections/${coll.handle}`}
                        style={{
                          textDecoration: 'none',
                          borderRadius: 8,
                          overflow: 'hidden',
                          background: al(accent, 0.05),
                          border: `1px solid ${al(accent, 0.15)}`,
                          transition: 'all 0.2s ease',
                          cursor: 'pointer',
                        }}
                        className="astro-rec-coll-link"
                      >
                        {coll.image?.url && (
                          <img
                            src={coll.image.url}
                            alt={coll.title}
                            style={{
                              width: '100%',
                              height: 160,
                              objectFit: 'cover',
                              display: 'block',
                            }}
                          />
                        )}
                        <div style={{padding: 12}}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: T.tx,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {coll.title}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null
            }
          </Await>
        </Suspense>
      )}

      {/* RelatedGuides — Context-aware guide recommendations */}
      {(() => {
        // Map collection handle to guide context
        // PCコレクション、IPコレクション → gaming, streaming, creativeなど
        // 例: streaming関連コレクション、gadgets → gaming/general
        const contextMap: Record<string, 'gaming' | 'streaming' | 'creative' | 'general'> = {
          'astromeda': 'gaming',
          'gadgets': 'gaming',
          'goods': 'general',
        };
        const context = contextMap[collection.handle] ?? 'general';
        return <RelatedGuides context={context} />;
      })()}

      <style dangerouslySetInnerHTML={{__html: `
        .astro-products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: clamp(10px, 1.5vw, 16px); }
      `}} />
    </div>
  );
}


export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}