import {useLoaderData} from 'react-router';
import type {Route} from './+types/products.$handle';
import {
  getSelectedProductOptions,
  Analytics,
  useOptimisticVariant,
  getProductOptions,
  getAdjacentAndFirstAvailableVariants,
  useSelectedOptionInUrlParam,
  Image,
} from '@shopify/hydrogen';
import {ProductForm} from '~/components/ProductForm';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import {Link} from 'react-router';
import {useState} from 'react';
import {T, al, COLLABS} from '~/lib/astromeda-data';

export const meta: Route.MetaFunction = ({data}) => {
  const product = data?.product;
  const title = `ASTROMEDA | ${product?.title ?? ''}`;
  const description =
    product?.seo?.description ||
    product?.description ||
    `${product?.title ?? ''} - ASTROMEDAのゲーミングPC・周辺機器`;
  const url = `https://shop.mining-base.co.jp/products/${product?.handle ?? ''}`;
  const image =
    product?.images?.nodes?.[0]?.url ??
    product?.selectedOrFirstAvailableVariant?.image?.url ??
    '';
  const price =
    product?.selectedOrFirstAvailableVariant?.price?.amount ?? '0';
  const currency =
    product?.selectedOrFirstAvailableVariant?.price?.currencyCode ?? 'JPY';

  return [
    {title},
    {name: 'description', content: description},
    {property: 'og:type', content: 'product'},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {property: 'og:url', content: url},
    ...(image ? [{property: 'og:image', content: image}] : []),
    {name: 'twitter:card', content: 'summary_large_image'},
    {rel: 'canonical', href: url},
    // JSON-LD Product
    ...(product
      ? [
          {
            'script:ld+json': {
              '@context': 'https://schema.org',
              '@type': 'Product',
              name: product.title,
              description,
              url,
              ...(image ? {image: [image]} : {}),
              brand: {
                '@type': 'Brand',
                name: product.vendor || 'ASTROMEDA',
              },
              offers: {
                '@type': 'Offer',
                url,
                priceCurrency: currency,
                price,
                availability:
                  product.selectedOrFirstAvailableVariant?.availableForSale
                    ? 'https://schema.org/InStock'
                    : 'https://schema.org/OutOfStock',
                seller: {
                  '@type': 'Organization',
                  name: '株式会社マイニングベース',
                },
              },
            },
          },
        ]
      : []),
  ];
};

export async function loader(args: Route.LoaderArgs) {
  const deferredData = loadDeferredData(args);
  const criticalData = await loadCriticalData(args);
  return {...deferredData, ...criticalData};
}

async function loadCriticalData({context, params, request}: Route.LoaderArgs) {
  const {handle} = params;
  const {storefront} = context;
  if (!handle) throw new Error('Expected product handle to be defined');

  const [{product}] = await Promise.all([
    storefront.query(PRODUCT_QUERY, {
      variables: {handle, selectedOptions: getSelectedProductOptions(request)},
    }),
  ]);

  if (!product?.id) throw new Response(null, {status: 404});
  redirectIfHandleIsLocalized(request, {handle, data: product});
  return {product};
}

function loadDeferredData({context: _context, params: _params}: Route.LoaderArgs) {
  return {};
}

export default function Product() {
  const {product} = useLoaderData<typeof loader>();

  const selectedVariant = useOptimisticVariant(
    product.selectedOrFirstAvailableVariant,
    getAdjacentAndFirstAvailableVariants(product),
  );
  useSelectedOptionInUrlParam(selectedVariant.selectedOptions);
  const productOptions = getProductOptions({
    ...product,
    selectedOrFirstAvailableVariant: selectedVariant,
  });

  const [activeImg, setActiveImg] = useState(0);
  const images = (product.images?.nodes ?? []) as Array<{id?: string; url: string; altText?: string | null; width?: number | null; height?: number | null}>;
  const displayImages = images.length > 0 ? images : selectedVariant?.image ? [selectedVariant.image] : [];
  const currentImage = displayImages[activeImg] ?? selectedVariant?.image;

  const price = selectedVariant?.price;
  const compareAtPrice = selectedVariant?.compareAtPrice;

  const collabData = COLLABS.find(
    (c) => product.handle?.includes(c.shop) || product.vendor?.toLowerCase().includes(c.name.toLowerCase()),
  );
  const accent = collabData?.accent ?? T.c;

  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        color: T.tx,
        fontFamily: "'Outfit', 'Noto Sans JP', system-ui, sans-serif",
      }}
    >
      {/* Breadcrumb */}
      <div
        style={{
          padding: '12px clamp(16px, 4vw, 48px)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          color: T.t4,
          borderBottom: `1px solid ${T.t1}`,
          flexWrap: 'wrap',
        }}
      >
        <Link to="/" style={{color: T.t4, textDecoration: 'none'}}>HOME</Link>
        <span style={{color: T.t2}}>/</span>
        <Link to="/collections/astromeda" style={{color: T.t4, textDecoration: 'none'}}>PRODUCTS</Link>
        <span style={{color: T.t2}}>/</span>
        <span style={{color: T.t5}}>{product.title}</span>
      </div>

      {/* Product Layout */}
      <div className="product-page-layout">
        {/* Images */}
        <div className="product-page-images">
          <div className="product-main-image">
            {currentImage ? (
              <Image
                data={currentImage}
                sizes="(min-width: 768px) 50vw, 100vw"
                style={{width: '100%', height: '100%', objectFit: 'contain'}}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: `linear-gradient(160deg, ${al(accent, 0.15)}, ${T.bg})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: T.t3,
                  fontSize: 13,
                }}
              >
                No Image
              </div>
            )}
          </div>

          {displayImages.length > 1 && (
            <div className="product-thumbnails">
              {displayImages.map((img, i) => (
                <button
                  key={(img as {id?: string}).id ?? i}
                  onClick={() => setActiveImg(i)}
                  style={{
                    width: 64,
                    height: 64,
                    padding: 0,
                    border: `2px solid ${i === activeImg ? accent : al(T.t3, 0.3)}`,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: T.bgC,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <Image
                    data={img}
                    sizes="64px"
                    style={{width: '100%', height: '100%', objectFit: 'cover'}}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="product-page-info">
          {product.vendor && (
            <div style={{fontSize: 10, fontWeight: 700, color: accent, letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' as const}}>
              {product.vendor}
            </div>
          )}

          <h1 style={{fontSize: 'clamp(18px, 2.5vw, 28px)', fontWeight: 900, color: T.tx, lineHeight: 1.3, marginBottom: 16}}>
            {product.title}
          </h1>

          <div style={{display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24}}>
            {price && (
              <span className="ph" style={{fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 900, color: accent}}>
                ¥{Number(price.amount).toLocaleString('ja-JP')}
                <span style={{fontSize: 12, color: T.t4, fontWeight: 400}}> (税込)</span>
              </span>
            )}
            {compareAtPrice && (
              <span style={{fontSize: 14, color: T.t4, textDecoration: 'line-through'}}>
                ¥{Number(compareAtPrice.amount).toLocaleString('ja-JP')}
              </span>
            )}
          </div>

          <ProductForm productOptions={productOptions} selectedVariant={selectedVariant} />

          {/* Trust badges */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap' as const,
              gap: 8,
              margin: '24px 0',
              padding: '16px',
              background: al(T.c, 0.03),
              borderRadius: 12,
              border: `1px solid ${al(T.c, 0.06)}`,
            }}
          >
            {[
              {i: '🏭', l: '国内自社生産'},
              {i: '🚚', l: 'PC送料¥3,300'},
              {i: '🛡️', l: '最長3年保証'},
              {i: '⚡', l: '最短10営業日'},
            ].map((b) => (
              <div key={b.l} style={{display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.t5, fontWeight: 600}}>
                <span>{b.i}</span>{b.l}
              </div>
            ))}
          </div>

          {/* Description */}
          {product.descriptionHtml && (
            <div style={{borderTop: `1px solid ${T.t1}`, paddingTop: 20, marginTop: 8}}>
              <div style={{fontSize: 10, fontWeight: 700, color: T.t4, letterSpacing: 2, marginBottom: 12}}>
                商品説明
              </div>
              <div
                className="product-description"
                dangerouslySetInnerHTML={{__html: product.descriptionHtml}}
              />
            </div>
          )}
        </div>
      </div>

      <Analytics.ProductView
        data={{
          products: [{
            id: product.id,
            title: product.title,
            price: selectedVariant?.price.amount || '0',
            vendor: product.vendor,
            variantId: selectedVariant?.id || '',
            variantTitle: selectedVariant?.title || '',
            quantity: 1,
          }],
        }}
      />

      <style>{`
        .product-page-layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: clamp(24px, 4vw, 64px);
          padding: clamp(24px, 3vw, 48px) clamp(16px, 4vw, 64px);
          max-width: 1200px;
          margin: 0 auto;
        }
        @media (max-width: 768px) {
          .product-page-layout { grid-template-columns: 1fr; padding: 16px; }
        }
        .product-main-image {
          width: 100%;
          aspect-ratio: 1/1;
          background: #0D0D18;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .product-thumbnails {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          flex-wrap: wrap;
        }
        .product-page-info {
          display: flex;
          flex-direction: column;
        }
        .product-description {
          font-size: 13px;
          line-height: 1.8;
          color: #8888AA;
        }
        .product-description p { margin-bottom: 12px; }
        .product-description ul { padding-left: 18px; margin-bottom: 12px; }
        .product-description li { margin-bottom: 4px; }
      `}</style>
    </div>
  );
}

const PRODUCT_VARIANT_FRAGMENT = `#graphql
  fragment ProductVariant on ProductVariant {
    availableForSale
    compareAtPrice { amount currencyCode }
    id
    image { __typename id url altText width height }
    price { amount currencyCode }
    product { title handle }
    selectedOptions { name value }
    sku
    title
    unitPrice { amount currencyCode }
  }
` as const;

const PRODUCT_FRAGMENT = `#graphql
  fragment Product on Product {
    id
    title
    vendor
    handle
    descriptionHtml
    description
    encodedVariantExistence
    encodedVariantAvailability
    images(first: 10) {
      nodes { id url altText width height }
    }
    options {
      name
      optionValues {
        name
        firstSelectableVariant { ...ProductVariant }
        swatch {
          color
          image { previewImage { url } }
        }
      }
    }
    selectedOrFirstAvailableVariant(selectedOptions: $selectedOptions, ignoreUnknownOptions: true, caseInsensitiveMatch: true) {
      ...ProductVariant
    }
    adjacentVariants(selectedOptions: $selectedOptions) {
      ...ProductVariant
    }
    seo { description title }
  }
  ${PRODUCT_VARIANT_FRAGMENT}
` as const;

const PRODUCT_QUERY = `#graphql
  query Product(
    $country: CountryCode
    $handle: String!
    $language: LanguageCode
    $selectedOptions: [SelectedOptionInput!]!
  ) @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      ...Product
    }
  }
  ${PRODUCT_FRAGMENT}
` as const;
