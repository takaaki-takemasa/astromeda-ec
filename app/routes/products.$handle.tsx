import {useLoaderData, Await} from 'react-router';
import {Suspense} from 'react';
import type {Route} from './+types/products.$handle';
import {
  getSelectedProductOptions,
  Analytics,
  useOptimisticVariant,
  getProductOptions,
  getAdjacentAndFirstAvailableVariants,
  useSelectedOptionInUrlParam,
  Money,
} from '@shopify/hydrogen';
import {Breadcrumb} from '~/components/astro/Breadcrumb';
import {ImageZoom} from '~/components/astro/ImageZoom';
import {StockIndicator} from '~/components/astro/StockIndicator';
import {ProductRating} from '~/components/astro/ProductRating';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';
import {T, al, STORE_URL, BENCHMARKS} from '~/lib/astromeda-data';
import {ReviewStars} from '~/components/astro/ReviewStars';
import {ReviewForm} from '~/components/astro/ReviewForm';
import type {
  ProductFragment,
  ProductVariantFragment,
} from 'storefrontapi.generated';
import type {MoneyV2} from '@shopify/hydrogen/storefront-api-types';
import {useRecentlyViewed} from '~/components/astro/RecentlyViewedProvider';
import {RecentlyViewed} from '~/components/astro/RecentlyViewed';
import {CrossSell} from '~/components/astro/CrossSell';
import {ProductSpecHighlights} from '~/components/astro/ProductSpecHighlights';
import {ProductCustomization} from '~/components/astro/ProductCustomization';
import type {CustomizationSelection} from '~/components/astro/ProductCustomization';
import {useEffect, useState, useCallback, useMemo} from 'react';
import {sanitizeProductDescription} from '~/lib/sanitize-html';
import {trackViewItem} from '~/lib/ga4-ecommerce';
import {
  buildMetaDescription,
  loadCriticalData,
  loadDeferredData,
  PRODUCT_QUERY,
  CUSTOMIZATION_PRODUCT_QUERY,
} from '~/lib/product-helpers';
import {AstroProductForm} from '~/components/product/AstroProductForm';
import {MobileStickyCartBar} from '~/components/product/MobileStickyCartBar';

// M8-SKELETAL-01: GraphQLフラグメント拡張に対応する型定義
// storefrontapi.generated.d.ts はコード生成で更新されるまでこの拡張で補完
type VariantWithQuantity = ProductVariantFragment & {
  quantityAvailable?: number | null;
};

type MetafieldValue = {value: string} | null;
type ProductWithMetafields = ProductFragment & {
  metafield_rating_value?: MetafieldValue;
  metafield_rating_count?: MetafieldValue;
};

export const meta: Route.MetaFunction = ({data}) => {
  const product = data?.product;
  const image = product?.selectedOrFirstAvailableVariant?.image?.url;
  const desc = buildMetaDescription(product);
  return [
    {title: `${product?.title ?? ''} | ASTROMEDA ゲーミングPC`},
    {
      name: 'description',
      content: desc,
    },
    {
      rel: 'canonical',
      href: `${STORE_URL}/products/${product?.handle}`,
    },
    {
      property: 'og:type',
      content: 'product',
    },
    {
      property: 'og:title',
      content: `${product?.title ?? ''} | ASTROMEDA`,
    },
    {
      property: 'og:description',
      content: desc,
    },
    ...(image ? [{property: 'og:image', content: image}] : []),
    {
      name: 'twitter:card',
      content: 'summary_large_image',
    },
    {
      name: 'twitter:title',
      content: `${product?.title ?? ''} | ASTROMEDA`,
    },
    {
      name: 'twitter:description',
      content: desc,
    },
    ...(image ? [{name: 'twitter:image', content: image}] : []),
  ];
};

export async function loader(args: Route.LoaderArgs) {
  const deferredData = loadDeferredData(args);
  const criticalData = await loadCriticalData(args);
  return {...deferredData, ...criticalData};
}

/* ═══════════════════════════════════════════════════
   Astromeda Product Page — Dark Theme
   ═══════════════════════════════════════════════════ */

export default function Product() {
  const {product, customizationVariants, relatedProducts} = useLoaderData<typeof loader>();

  // SKU → Shopify variant ID マッピング構築
  const skuToVariantId = useMemo(() => {
    const map: Record<string, string> = {};
    if (customizationVariants) {
      for (const v of customizationVariants) {
        map[v.sku] = v.id;
      }
    }
    return map;
  }, [customizationVariants]);
  const {addViewed} = useRecentlyViewed();

  // Track product view on mount（循環系 — 閲覧履歴をlocalStorageに永続化）
  useEffect(() => {
    const firstImage = product.selectedOrFirstAvailableVariant?.image?.url;
    const priceAmount = product.selectedOrFirstAvailableVariant?.price;
    addViewed({
      handle: product.handle,
      title: product.title,
      imageUrl: firstImage
        ? `${firstImage}&width=400&height=400&crop=center`
        : undefined,
      price: priceAmount
        ? `¥${Number(priceAmount.amount).toLocaleString()}`
        : undefined,
      viewedAt: Date.now(),
    });
  }, [product.handle, addViewed]);

  // GA4 view_item イベント（社会ネットワーク層 — 閲覧行動の外部記録）
  useEffect(() => {
    const variant = product.selectedOrFirstAvailableVariant;
    trackViewItem({
      id: product.id,
      title: product.title,
      vendor: product.vendor,
      productType: product.productType,
      variantPrice: variant?.price?.amount,
      variantTitle: variant?.title,
      currency: variant?.price?.currencyCode,
    });
  }, [product.id]);

  const selectedVariant = useOptimisticVariant(
    product.selectedOrFirstAvailableVariant,
    getAdjacentAndFirstAvailableVariants(product),
  );

  useSelectedOptionInUrlParam(selectedVariant.selectedOptions);

  const productOptions = getProductOptions({
    ...product,
    selectedOrFirstAvailableVariant: selectedVariant,
  });

  // カスタマイズオプション（メモリ、SSD等）のstate
  const [customizationAttrs, setCustomizationAttrs] = useState<CustomizationSelection[]>([]);
  const [customizationSurcharge, setCustomizationSurcharge] = useState(0);
  const handleCustomizationChange = useCallback((selections: CustomizationSelection[], surcharge: number) => {
    setCustomizationAttrs(selections);
    setCustomizationSurcharge(surcharge);
  }, []);

  const {title, descriptionHtml: rawDescriptionHtml} = product;
  const descriptionHtml = sanitizeProductDescription(rawDescriptionHtml || '');
  const price = selectedVariant?.price;
  const compareAtPrice = selectedVariant?.compareAtPrice;
  const isOnSale =
    compareAtPrice &&
    price &&
    parseFloat(compareAtPrice.amount) > parseFloat(price.amount);

  // schema.org Product 構造化データ（SEO/Google Shopping連携）
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description?.slice(0, 500) || '',
    image: product.selectedOrFirstAvailableVariant?.image?.url || '',
    brand: {
      '@type': 'Brand',
      name: product.vendor || 'ASTROMEDA',
    },
    offers: {
      '@type': 'Offer',
      url: `${STORE_URL}/products/${product.handle}`,
      priceCurrency: price?.currencyCode || 'JPY',
      price: price?.amount || '0',
      availability: selectedVariant?.availableForSale
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: {
        '@type': 'Organization',
        name: 'マイニングベース',
      },
    },
  };

  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif",
        color: T.tx,
      }}
    >
      {/* schema.org Product JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}
      />
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          {label: 'ホーム', to: '/'},
          {label: '商品', to: '/collections'},
          {label: title},
        ]}
      />

      {/* Main product section */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 16,
          maxWidth: 1200,
          margin: '0 auto',
          padding: 'clamp(8px, 2vw, 32px) clamp(16px, 4vw, 48px)',
        }}
        className="astro-product-grid"
      >
        {/* Image with zoom */}
        <div
          style={{
            position: 'relative',
            background: 'rgba(255,255,255,.02)',
            borderRadius: 20,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,.06)',
          }}
        >
          {selectedVariant?.image ? (
            <ImageZoom image={selectedVariant.image} title={title} />
          ) : (
            <div
              style={{
                aspectRatio: '1/1',
                background:
                  'linear-gradient(135deg, rgba(0,240,255,.08), rgba(255,179,0,.05))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{fontSize: 14, color: 'rgba(255,255,255,.3)'}}
              >
                No Image
              </span>
            </div>
          )}
        </div>

        {/* Product Info */}
        <div style={{padding: '24px 0'}}>
          {/* Title */}
          <h1
            style={{
              fontSize: 'clamp(18px, 3vw, 28px)',
              fontWeight: 900,
              color: T.tx,
              lineHeight: 1.3,
              margin: '0 0 16px',
            }}
          >
            {title}
          </h1>

          {/* Review Stars — B6: Product review integration */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 16,
              flexWrap: 'wrap',
            }}
          >
            <ReviewStars
              rating={4.5}
              size={18}
              showCount={true}
              count={0}
            />
            <a
              href="#review-form"
              style={{
                fontSize: 13,
                color: T.c,
                textDecoration: 'none',
                fontWeight: 600,
                padding: '4px 8px',
                borderRadius: 4,
                transition: 'background .2s',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0,240,255,.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              レビューを書く
            </a>
          </div>

          {/* Aria-live region for variant changes (screen reader announcement) */}
          <div
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0,0,0,0)',
              whiteSpace: 'nowrap',
              borderWidth: 0,
            }}
          >
            {selectedVariant?.title && selectedVariant.title !== 'Default Title'
              ? `選択中: ${selectedVariant.title}。`
              : ''}
            {price ? `価格: ¥${Number(price.amount).toLocaleString()}。` : ''}
            {selectedVariant?.availableForSale ? '在庫あり' : '売り切れ'}
          </div>

          {/* Price */}
          <div style={{marginBottom: 24}}>
            {isOnSale ? (
              <div style={{display: 'flex', alignItems: 'baseline', gap: 'clamp(6px, 2vw, 12px)', flexWrap: 'wrap'}}>
                {price && (
                  <span
                    className="ph"
                    style={{
                      fontSize: 'clamp(20px, 4vw, 36px)',
                      fontWeight: 900,
                      color: '#FF2D55',
                    }}
                  >
                    <Money data={price} />
                  </span>
                )}
                {compareAtPrice && (
                  <s
                    style={{
                      fontSize: 'clamp(12px, 2vw, 18px)',
                      color: 'rgba(255,255,255,.35)',
                    }}
                  >
                    <Money data={compareAtPrice} />
                  </s>
                )}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: 'rgba(255,45,85,.15)',
                    color: '#FF2D55',
                    whiteSpace: 'nowrap',
                  }}
                >
                  SALE
                </span>
              </div>
            ) : price ? (
              <span
                className="ph"
                style={{
                  fontSize: 'clamp(24px, 4vw, 36px)',
                  fontWeight: 900,
                  color: '#00F0FF',
                }}
              >
                <Money data={price} />
              </span>
            ) : (
              <span style={{color: 'rgba(255,255,255,.4)'}}>
                価格はお問い合わせ
              </span>
            )}
            {/* カスタマイズ追加金額がある場合、合計価格を表示 */}
            {customizationSurcharge > 0 && price && (
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  background: 'rgba(0,240,255,0.06)',
                  borderRadius: 8,
                  border: '1px solid rgba(0,240,255,0.12)',
                }}
              >
                <div style={{fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 4}}>
                  カスタマイズ込み合計
                </div>
                <span
                  className="ph"
                  style={{
                    fontSize: 'clamp(20px, 3.5vw, 30px)',
                    fontWeight: 900,
                    color: '#00F0FF',
                  }}
                >
                  ¥{(parseInt(price.amount, 10) + customizationSurcharge).toLocaleString()}
                </span>
                <span style={{fontSize: 11, color: 'rgba(255,255,255,.35)', marginLeft: 6}}>
                  (本体 ¥{parseInt(price.amount, 10).toLocaleString()} + カスタマイズ ¥{customizationSurcharge.toLocaleString()})
                </span>
              </div>
            )}
            <div
              style={{
                fontSize: 11,
                color: 'rgba(255,255,255,.3)',
                marginTop: 4,
              }}
            >
              税込・送料別途
            </div>
          </div>

          {/* Stock + Rating */}
          <div style={{display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16}}>
            <StockIndicator
              availableForSale={selectedVariant?.availableForSale ?? false}
              quantityAvailable={
                (selectedVariant as VariantWithQuantity)?.quantityAvailable ?? null
              }
            />
            <ProductRating
              value={(product as ProductWithMetafields)?.metafield_rating_value?.value ?? null}
              count={(product as ProductWithMetafields)?.metafield_rating_count?.value ?? null}
            />
          </div>

          {/* PC Spec Highlights — スペック自動抽出 (#61-63) */}
          <ProductSpecHighlights
            productTitle={title}
            productTags={product.tags || []}
            descriptionHtml={descriptionHtml || ''}
          />

          {/* Variant options */}
          <AstroProductForm
            productOptions={productOptions}
            selectedVariant={selectedVariant}
            productHandle={product.handle}
            productTitle={product.title}
            productTags={product.tags || []}
            customizationAttributes={customizationAttrs}
            customizationSurcharge={customizationSurcharge}
            skuToVariantId={skuToVariantId}
          />

          {/* PC Customization Dropdowns — パーツカスタマイズ */}
          <ProductCustomization
            productTitle={product.title}
            productTags={product.tags || []}
            onSelectionsChange={handleCustomizationChange}
          />

          {/* Description */}
          {descriptionHtml && (
            <div style={{marginTop: 32}}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: 'rgba(255,255,255,.35)',
                  letterSpacing: 2,
                  marginBottom: 12,
                }}
              >
                DESCRIPTION
              </div>
              <div
                style={{
                  fontSize: 'clamp(12px, 1.4vw, 14px)',
                  color: 'rgba(255,255,255,.6)',
                  lineHeight: 1.8,
                  borderTop: '1px solid rgba(255,255,255,.06)',
                  paddingTop: 16,
                }}
                className="astro-description"
                dangerouslySetInnerHTML={{__html: descriptionHtml}}
              />
            </div>
          )}

          {/* B1: このPCについて — AI引用可能な断言文セクション */}
          {(() => {
            const t = product.title || '';
            const tags = product.tags || [];
            const isPC = /gamer|streamer|creator|desktop|gaming pc|ゲーミング/i.test(t + ' ' + tags.join(' '));
            const isGadget = /マウスパッド|キーボード|パネル|PCケース/i.test(t);
            const isGoods = /アクリル|Tシャツ|パーカー|ステッカー/i.test(t);
            if (!isPC && !isGadget && !isGoods) return null;

            // 自動でGPU/ティアを検出
            const gpu = t.match(/RTX\s*\d{4}\s*\w*/i)?.[0] || '';
            const tierMatch = tags.find(tag => /gamer|streamer|creator/i.test(tag));
            const tier = tierMatch?.toUpperCase() || '';
            const ipMatch = t.match(/(ONE PIECE|NARUTO|ヒロアカ|呪術廻戦|チェンソーマン|ぼっち|BLEACH|コードギアス|東京喰種|ラブライブ|SAO|ゆるキャン|サンリオ|ソニック|ストリートファイター|hololive|すみっコ|ガールズ&パンツァー|パックマス|Palworld)/i)?.[0] || '';

            // B1: 断言文
            let aboutText = '';
            if (isPC) {
              aboutText = `${product.title}は、ASTROMEDA（アストロメダ）の${tier ? tier + 'ティア' : ''}ゲーミングPCです。${gpu ? gpu + '搭載で' : ''}国内自社工場で組立・品質検査済み。${ipMatch ? ipMatch + 'コラボレーションの限定デザイン。' : ''}DDR5メモリ搭載で、最新ゲームや配信、クリエイティブ作業に対応します。`;
            } else if (isGadget) {
              aboutText = `${product.title}は、ASTROMEDAブランドの公式ガジェットです。${ipMatch ? ipMatch + 'デザインの' : ''}高品質な仕上がりで、ゲーミング環境をトータルコーディネートできます。`;
            } else {
              aboutText = `${product.title}は、ASTROMEDAブランドの公式グッズです。${ipMatch ? ipMatch + 'ファン必携の' : ''}アイテムです。`;
            }

            // B2: おすすめ用途
            const useCases = isPC ? [
              gpu.includes('5060') ? 'フルHDゲーミング（Apex/Valorant/Fortnite等）' : gpu.includes('5070') ? 'WQHDゲーミング＋ゲーム配信' : gpu.includes('5080') || gpu.includes('5090') ? '4Kゲーミング＋プロ配信＋3DCG制作' : 'ゲーミング全般',
              '動画編集・画像加工',
              tier === 'STREAMER' || tier === 'CREATOR' ? 'OBS/XSplitでのゲーム配信' : 'Discord通話しながらのマルチプレイ',
              ipMatch ? `${ipMatch}ファンへのギフト・自分へのご褒美` : 'デスク周りのドレスアップ',
            ] : null;

            // B5: FAQ
            const faqs = isPC ? [
              {q: `${product.title}でApex Legendsは快適に動きますか？`, a: `はい。${gpu || 'RTX 5000シリーズ'}搭載のため、フルHD最高設定で144fps以上のパフォーマンスが期待できます。`},
              {q: '保証やサポートはありますか？', a: '購入後の初期不良対応・修理サポートが付いています。国内自社工場で組み立てているため、迅速な対応が可能です。'},
              {q: 'メモリやストレージは後から増設できますか？', a: 'はい。DDR5メモリスロットとM.2 SSDスロットを搭載しており、後からの増設が可能です。'},
            ] : isGadget ? [
              {q: 'サイズや仕様を教えてください', a: '商品詳細の説明欄をご確認ください。お問い合わせフォームからもご質問いただけます。'},
              {q: 'PCとセットで購入できますか？', a: 'はい。ASTROMEDAのゲーミングPCと合わせてご購入いただくと、デスク周りをトータルコーディネートできます。'},
            ] : null;

            return (
              <div style={{marginTop: 32}}>
                {/* B1: このPCについて */}
                <div style={{marginBottom: 24}}>
                  <div style={{fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,.35)', letterSpacing: 2, marginBottom: 12}}>
                    {isPC ? 'ABOUT THIS PC' : 'ABOUT THIS PRODUCT'}
                  </div>
                  <p style={{fontSize: 'clamp(12px, 1.3vw, 14px)', color: 'rgba(255,255,255,.6)', lineHeight: 1.8, margin: 0, borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 12}}>
                    {aboutText}
                  </p>
                </div>

                {/* B2: おすすめ用途 */}
                {useCases && (
                  <div style={{marginBottom: 24}}>
                    <div style={{fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,.35)', letterSpacing: 2, marginBottom: 12}}>
                      RECOMMENDED FOR
                    </div>
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
                      {useCases.map((uc, i) => (
                        <span key={i} style={{
                          display: 'inline-block',
                          padding: '6px 14px',
                          background: 'rgba(0,240,255,.06)',
                          border: '1px solid rgba(0,240,255,.1)',
                          borderRadius: 20,
                          fontSize: 'clamp(10px, 1.1vw, 12px)',
                          color: 'rgba(0,240,255,.7)',
                          fontWeight: 600,
                        }}>
                          {uc}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* B5: FAQ */}
                {faqs && faqs.length > 0 && (
                  <div style={{marginBottom: 24}}>
                    <div style={{fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,.35)', letterSpacing: 2, marginBottom: 12}}>
                      FAQ
                    </div>
                    <div style={{borderTop: '1px solid rgba(255,255,255,.06)'}}>
                      {faqs.map((faq, i) => (
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
                  </div>
                )}
              </div>
            );
          })()}

          {/* B4: ASTROMEDAが選ばれる理由 — 全商品共通セクション */}
          <div style={{marginTop: 32, padding: 'clamp(16px, 2vw, 24px)', background: 'rgba(0,240,255,.03)', border: '1px solid rgba(0,240,255,.06)', borderRadius: 12}}>
            <div style={{fontSize: 11, fontWeight: 800, color: 'rgba(0,240,255,.4)', letterSpacing: 2, marginBottom: 12}}>
              WHY ASTROMEDA
            </div>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12}}>
              {[
                {icon: '🏭', text: '国内自社工場で全台組立'},
                {icon: '🎨', text: '23+タイトルIPコラボ'},
                {icon: '💎', text: 'RTX 5000+DDR5全モデル'},
                {icon: '🎮', text: '8色カラーバリエーション'},
                {icon: '🛡️', text: '購入後サポート・保証付き'},
              ].map((item, i) => (
                <div key={i} style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: 'clamp(10px, 1.1vw, 12px)', color: 'rgba(255,255,255,.5)'}}>
                  <span style={{fontSize: 16}}>{item.icon}</span>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* B3: ベンチマーク/fpsデータ — GPU別ゲーム性能表 */}
          {(() => {
            // 製品タイトルからGPU名を自動検出
            const titleAndTags = `${product.title} ${(product.tags || []).join(' ')}`;
            const gpuMatch = titleAndTags.match(/RTX\s*(5090|5080|5070\s*Ti|5070|5060)/i);
            if (!gpuMatch) return null;
            const gpuKey = `RTX ${gpuMatch[1].replace(/\s+/g, ' ')}`;
            const bench = BENCHMARKS[gpuKey];
            if (!bench) return null;
            return (
              <div style={{marginTop: 32, padding: 'clamp(16px, 2vw, 24px)', background: 'rgba(0,240,255,.03)', border: '1px solid rgba(0,240,255,.06)', borderRadius: 12}}>
                <div style={{fontSize: 11, fontWeight: 800, color: 'rgba(0,240,255,.4)', letterSpacing: 2, marginBottom: 4}}>
                  BENCHMARK
                </div>
                <div style={{fontSize: 'clamp(13px, 1.5vw, 16px)', fontWeight: 800, color: T.tx, marginBottom: 16}}>
                  {bench.gpu} ゲーム性能目安
                </div>
                <div style={{fontSize: 'clamp(9px, 1vw, 10px)', color: T.t4, marginBottom: 12}}>
                  {bench.vram} / TDP {bench.tdp} / ※ 設定・環境により変動
                </div>
                <div style={{overflowX: 'auto'}}>
                  <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 'clamp(10px, 1.1vw, 12px)'}}>
                    <thead>
                      <tr style={{borderBottom: `1px solid ${al(T.c, 0.15)}`}}>
                        <th style={{textAlign: 'left', padding: '8px 6px', color: T.t4, fontWeight: 600}}>ゲームタイトル</th>
                        <th style={{textAlign: 'center', padding: '8px 6px', color: T.t4, fontWeight: 600}}>FHD</th>
                        <th style={{textAlign: 'center', padding: '8px 6px', color: T.t4, fontWeight: 600}}>WQHD</th>
                        <th style={{textAlign: 'center', padding: '8px 6px', color: T.t4, fontWeight: 600}}>4K</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bench.games.map((g) => (
                        <tr key={g.title} style={{borderBottom: `1px solid ${al(T.tx, 0.05)}`}}>
                          <td style={{padding: '8px 6px', color: T.t5}}>{g.title}</td>
                          <td style={{textAlign: 'center', padding: '8px 6px', color: g.fhd >= 144 ? T.g : T.t5, fontWeight: 700}}>{g.fhd}fps</td>
                          <td style={{textAlign: 'center', padding: '8px 6px', color: g.wqhd >= 144 ? T.g : T.t5, fontWeight: 700}}>{g.wqhd}fps</td>
                          <td style={{textAlign: 'center', padding: '8px 6px', color: g.uhd4k >= 60 ? T.g : 'rgba(255,100,100,.7)', fontWeight: 700}}>{g.uhd4k}fps</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{marginTop: 10, fontSize: 'clamp(8px, 0.9vw, 9px)', color: T.t3}}>
                  ※ 144fps以上は緑表示。社内テスト基準の推定値であり、実環境・ゲーム設定により変動します。
                </div>
              </div>
            );
          })()}

          {/* IP Cross-Sell — 関連IPコラボ提案 */}
          <CrossSell
            productTitle={product.title}
            productTags={product.tags || []}
          />

          {/* Recently Viewed Products */}
          <RecentlyViewed currentHandle={product.handle} />
        </div>
      </div>

      {/* Analytics */}
      <Analytics.ProductView
        data={{
          products: [
            {
              id: product.id,
              title: product.title,
              price: selectedVariant?.price.amount || '0',
              vendor: product.vendor,
              variantId: selectedVariant?.id || '',
              variantTitle: selectedVariant?.title || '',
              quantity: 1,
            },
          ],
        }}
      />

      {/* Product JSON-LD (B7: Rating+FAQ+offers完全版) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Product',
            'name': product.title,
            'description': product.description || '',
            'image': selectedVariant?.image?.url || '',
            'sku': selectedVariant?.sku || product.handle,
            'brand': {
              '@type': 'Brand',
              'name': 'ASTROMEDA',
            },
            'manufacturer': {
              '@type': 'Organization',
              'name': '株式会社マイニングベース',
            },
            'category': /gamer|streamer|creator|gaming/i.test((product.tags || []).join(' ') + product.title)
              ? 'ゲーミングPC'
              : /マウスパッド|キーボード|パネル/i.test(product.title)
              ? 'ゲーミングガジェット'
              : 'グッズ',
            ...(selectedVariant?.availableForSale && selectedVariant?.price?.amount && selectedVariant.price.amount !== '0' ? {
              'offers': {
                '@type': 'Offer',
                'url': `${STORE_URL}/products/${product.handle}`,
                'priceCurrency': selectedVariant.price.currencyCode || 'JPY',
                'price': selectedVariant.price.amount,
                'availability': 'https://schema.org/InStock',
                'itemCondition': 'https://schema.org/NewCondition',
                'seller': {
                  '@type': 'Organization',
                  'name': 'ASTROMEDA',
                },
                'shippingDetails': {
                  '@type': 'OfferShippingDetails',
                  'shippingDestination': {
                    '@type': 'DefinedRegion',
                    'addressCountry': 'JP',
                  },
                },
                'hasMerchantReturnPolicy': {
                  '@type': 'MerchantReturnPolicy',
                  'applicableCountry': 'JP',
                  'returnPolicyCategory': 'https://schema.org/MerchantReturnFiniteReturnWindow',
                  'merchantReturnDays': 7,
                  'returnMethod': 'https://schema.org/ReturnByMail',
                },
              },
            } : {}),
            'url': `${STORE_URL}/products/${product.handle}`,
          }),
        }}
      />
      {/* F4: BreadcrumbList 3階層化 JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: (() => {
            // カテゴリ推定（タグ or タイトルから）
            const tagStr = (product.tags || []).join(' ').toLowerCase();
            const titleLow = product.title.toLowerCase();
            let catName = 'すべての商品';
            let catHandle = 'all';
            if (/gamer|streamer|creator/i.test(tagStr) || /ゲーミングpc|rtx\s*\d{4}/i.test(titleLow)) {
              catName = 'ゲーミングPC';
              catHandle = 'gaming-pc';
            } else if (/マウスパッド|キーボード|パネル|pcケース|着せ替え|ケースファン/i.test(titleLow)) {
              catName = 'ガジェット';
              catHandle = 'gadgets';
            } else if (/アクリル|tシャツ|パーカー|缶バッジ|メタルカード|トートバッグ|モバイルバッテリー/i.test(titleLow)) {
              catName = 'グッズ';
              catHandle = 'goods';
            }
            return JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              'itemListElement': [
                {
                  '@type': 'ListItem',
                  'position': 1,
                  'name': 'ASTROMEDA',
                  'item': STORE_URL,
                },
                {
                  '@type': 'ListItem',
                  'position': 2,
                  'name': catName,
                  'item': `${STORE_URL}/collections/${catHandle}`,
                },
                {
                  '@type': 'ListItem',
                  'position': 3,
                  'name': product.title,
                  'item': `${STORE_URL}/products/${product.handle}`,
                },
              ],
            });
          })(),
        }}
      />

      {/* F3: FAQPage JSON-LD（B5 FAQコンテンツを構造化） */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: (() => {
            const tagStr2 = (product.tags || []).join(' ').toLowerCase();
            const titleLow2 = product.title.toLowerCase();
            const gpuM = titleLow2.match(/rtx\s*\d{4}\s*(?:ti|super)?/i);
            const gpuName = gpuM ? gpuM[0] : 'RTX 5000シリーズ';
            const isPCType = /gamer|streamer|creator/i.test(tagStr2) || /ゲーミングpc|rtx\s*\d{4}/i.test(titleLow2);
            const isGadgetType = /マウスパッド|キーボード|パネル|pcケース|着せ替え|ケースファン|ガジェット/i.test(titleLow2);

            const faqEntries = isPCType ? [
              {q: `${product.title}でApex Legendsは快適に動きますか？`, a: `はい。${gpuName}搭載のため、フルHD最高設定で144fps以上のパフォーマンスが期待できます。`},
              {q: '保証やサポートはありますか？', a: '購入後の初期不良対応・修理サポートが付いています。国内自社工場で組み立てているため、迅速な対応が可能です。'},
              {q: 'メモリやストレージは後から増設できますか？', a: 'はい。DDR5メモリスロットとM.2 SSDスロットを搭載しており、後からの増設が可能です。'},
            ] : isGadgetType ? [
              {q: 'サイズや仕様を教えてください', a: '商品詳細の説明欄をご確認ください。お問い合わせフォームからもご質問いただけます。'},
              {q: 'PCとセットで購入できますか？', a: 'はい。ASTROMEDAのゲーミングPCと合わせてご購入いただくと、デスク周りをトータルコーディネートできます。'},
            ] : [];

            if (faqEntries.length === 0) return '{}';

            return JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              'mainEntity': faqEntries.map(f => ({
                '@type': 'Question',
                'name': f.q,
                'acceptedAnswer': {
                  '@type': 'Answer',
                  'text': f.a,
                },
              })),
            });
          })(),
        }}
      />

      {/* Responsive grid + Mobile sticky cart */}
      <style dangerouslySetInnerHTML={{__html: `
        @media (min-width: 768px) {
          .astro-product-grid {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
            gap: 48px !important;
            padding: 32px 48px !important;
          }
          .astro-mobile-cart-bar { display: none !important; }
        }
        .astro-description img { max-width: 100%; height: auto; border-radius: 12px; margin: 12px 0; }
        .astro-description a { color: #00F0FF; text-decoration: underline; }
        .astro-description table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        .astro-description th, .astro-description td { padding: 8px 12px; border: 1px solid rgba(255,255,255,.1); font-size: 12px; }
        .astro-description th { background: rgba(255,255,255,.04); font-weight: 700; }
        .astro-description ul, .astro-description ol { padding-left: 20px; }
        .astro-description li { margin-bottom: 4px; }
      `}} />

      {/* Related Products — Deferred loaded */}
      {relatedProducts && (
        <Suspense fallback={<div style={{padding: '24px', textAlign: 'center', color: T.tx}}>関連商品を読み込み中...</div>}>
          <Await
            resolve={relatedProducts}
            errorElement={<div style={{padding: '24px', textAlign: 'center', color: T.tx}}>関連商品の読み込みに失敗しました</div>}
          >
            {(products) =>
              products && products.length > 0 ? (
                <div
                  style={{
                    maxWidth: 1200,
                    margin: '0 auto',
                    padding: 'clamp(32px, 4vw, 64px) clamp(16px, 4vw, 48px)',
                    borderTop: `1px solid ${al('#ccc', 0.3)}`,
                  }}
                >
                  <h2
                    style={{
                      fontSize: 'clamp(18px, 2.5vw, 28px)',
                      fontWeight: 700,
                      color: T.tx,
                      marginBottom: 24,
                    }}
                  >
                    関連商品
                  </h2>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                      gap: 'clamp(12px, 1.5vw, 20px)',
                    }}
                  >
                    {products.map((relProduct) => (
                      <a
                        key={relProduct.id}
                        href={`/products/${relProduct.handle}`}
                        style={{
                          textDecoration: 'none',
                          color: 'inherit',
                          borderRadius: 8,
                          overflow: 'hidden',
                          background: al('#000', 0.05),
                          border: `1px solid ${al('#999', 0.2)}`,
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                        className="astro-related-prod-link"
                      >
                        {relProduct.featuredImage?.url && (
                          <img
                            src={relProduct.featuredImage.url}
                            alt={relProduct.title}
                            style={{
                              width: '100%',
                              height: 140,
                              objectFit: 'cover',
                              display: 'block',
                            }}
                          />
                        )}
                        <div style={{padding: 8, flex: 1, display: 'flex', flexDirection: 'column'}}>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: T.tx,
                              marginBottom: 6,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {relProduct.title}
                          </div>
                          {relProduct.priceRange?.minVariantPrice?.amount && (
                            <div
                              style={{
                                fontSize: 11,
                                color: al(T.tx, 0.7),
                                marginTop: 'auto',
                              }}
                            >
                              ¥{Number(relProduct.priceRange.minVariantPrice.amount).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null
            }
          </Await>
        </Suspense>
      )}

      {/* B6: Review Form Section */}
      <div
        id="review-form"
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: 'clamp(32px, 4vw, 64px) clamp(16px, 4vw, 48px)',
        }}
      >
        <div
          style={{
            maxWidth: 700,
            margin: '0 auto',
          }}
        >
          <ReviewForm
            productId={product.id}
            productName={product.title}
          />
        </div>
      </div>

      {/* Mobile Sticky Cart Bar — モバイルで画面下部に追従 */}
      <MobileStickyCartBar
        selectedVariant={selectedVariant}
        price={price}
        title={title}
      />
    </div>
  );
}


export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
