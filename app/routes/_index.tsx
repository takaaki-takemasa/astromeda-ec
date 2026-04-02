import {useLoaderData} from 'react-router';
import type {Route} from './+types/_index';
import {Link} from 'react-router';
import {Image} from '@shopify/hydrogen';
import {Suspense} from 'react';
import {Await} from 'react-router';
import {T, al, fl, FEATURED, REMAINING, MARQUEE_ITEMS, UGC, PC_COLORS} from '~/lib/astromeda-data';
import {HeroSlider} from '~/components/astro/HeroSlider';
import {CollabGrid} from '~/components/astro/CollabGrid';
import {PCShowcase} from '~/components/astro/PCShowcase';
import type {RecommendedProductsQuery, RecommendedProductFragment} from 'storefrontapi.generated';

export const meta: Route.MetaFunction = () => {
  const title = 'Astromeda | アニメ×ゲーミングPC';
  const description =
    'ONE PIECE・NARUTO・ヒロアカなど人気IPコラボのゲーミングPC・周辺機器専門店。国内自社工場受注生産、全8色カラー、最長3年保証。';
  const url = 'https://shop.mining-base.co.jp/';
  const image = 'https://shop.mining-base.co.jp/cdn/shop/files/astromeda-ogp.jpg';

  return [
    {title},
    {name: 'description', content: description},
    // OGP
    {property: 'og:site_name', content: 'ASTROMEDA'},
    {property: 'og:type', content: 'website'},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {property: 'og:url', content: url},
    {property: 'og:image', content: image},
    // Twitter
    {name: 'twitter:card', content: 'summary_large_image'},
    {name: 'twitter:title', content: title},
    {name: 'twitter:description', content: description},
    {name: 'twitter:image', content: image},
    // JSON-LD
    {
      'script:ld+json': {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'ASTROMEDA',
        url,
        description,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${url}search?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
    },
  ];
};

export async function loader({context}: Route.LoaderArgs) {
  const recommendedProducts = context.storefront
    .query(RECOMMENDED_PRODUCTS_QUERY)
    .catch((error: Error) => {
      console.error(error);
      return null;
    });

  return {
    recommendedProducts,
    isShopLinked: Boolean(context.env.PUBLIC_STORE_DOMAIN),
  };
}

export default function Homepage() {
  const data = useLoaderData<typeof loader>();
  // Use a reasonable viewport width for server-side rendering
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;

  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        fontFamily: "'Outfit', 'Noto Sans JP', system-ui, sans-serif",
        color: T.tx,
      }}
    >
      {/* Marquee strip */}
      <div
        style={{
          background: al(T.c, 0.03),
          borderTop: `1px solid ${al(T.c, 0.06)}`,
          borderBottom: `1px solid ${al(T.c, 0.06)}`,
          overflow: 'hidden',
          padding: '9px 0',
        }}
      >
        <div
          className="mq"
          style={{
            display: 'flex',
            gap: 48,
            whiteSpace: 'nowrap',
            width: 'max-content',
          }}
        >
          {[0, 1].flatMap((r) =>
            MARQUEE_ITEMS.map((t, i) => (
              <span
                key={`${r}-${i}`}
                style={{
                  fontSize: 'clamp(9px, 1.2vw, 11px)',
                  color: al(T.c, 0.55),
                  fontWeight: 700,
                }}
              >
                {t}
              </span>
            )),
          )}
        </div>
      </div>

      {/* Hero Slider */}
      <HeroSlider vw={vw} />

      {/* Trust badges */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 'clamp(12px, 3vw, 32px)',
          padding: 'clamp(14px, 2vw, 18px) clamp(16px, 4vw, 48px)',
          background: al(T.c, 0.02),
          borderBottom: `1px solid ${T.t1}`,
          flexWrap: 'wrap',
        }}
      >
        {[
          {i: '🏭', l: '国内自社生産'},
          {i: '🎨', l: '全8色展開'},
          {i: '🚚', l: 'PC送料一律¥3,300'},
          {i: '🛡️', l: '最長3年保証'},
          {i: '⚡', l: '最短10営業日'},
        ].map((b) => (
          <div
            key={b.l}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 'clamp(9px, 1.2vw, 11px)',
              color: T.t5,
              fontWeight: 600,
            }}
          >
            <span>{b.i}</span>
            {b.l}
          </div>
        ))}
      </div>

      {/* PC Showcase */}
      <div style={{paddingTop: 'clamp(20px, 3vw, 32px)'}}>
        <PCShowcase vw={vw} />
      </div>

      {/* Category quick nav */}
      <div
        style={{
          padding: '0 clamp(16px, 4vw, 48px) clamp(20px, 3vw, 32px)',
        }}
      >
        <div
          style={{
            fontSize: 'clamp(10px, 1.2vw, 12px)',
            fontWeight: 800,
            color: T.t4,
            letterSpacing: 2,
            marginBottom: 12,
          }}
        >
          CATEGORY
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 10,
          }}
          className="astro-cat-grid"
        >
          {[
            {icon: '🖥', name: 'ゲーミングPC', to: '/collections/astromeda', pr: '¥199,980〜', ac: T.c},
            {icon: '⌨️', name: 'ガジェット', to: '/collections/gadget', pr: '¥4,980〜', ac: '#FF6B9D'},
            {icon: '🎁', name: 'グッズ', to: '/collections/goods', pr: '¥1,500〜', ac: T.g},
            {icon: '🛡️', name: '延長保証', to: '/collections/astromeda', pr: '¥9,900〜', ac: '#26C6DA'},
          ].map((c) => (
            <Link
              key={c.name}
              to={c.to}
              className="hl"
              style={{
                background: T.bgC,
                borderRadius: 16,
                border: `1px solid ${al(c.ac, 0.1)}`,
                padding: 'clamp(14px, 2vw, 22px) clamp(12px, 1.5vw, 20px)',
                cursor: 'pointer',
                textDecoration: 'none',
                display: 'block',
              }}
            >
              <div style={{fontSize: 'clamp(20px, 3vw, 30px)', marginBottom: 8}}>{c.icon}</div>
              <div
                style={{
                  fontSize: 'clamp(10px, 1.2vw, 12px)',
                  fontWeight: 800,
                  color: T.tx,
                }}
              >
                {c.name}
              </div>
              <div
                className="ph"
                style={{
                  fontSize: 'clamp(10px, 1.4vw, 14px)',
                  fontWeight: 900,
                  color: c.ac,
                  marginTop: 6,
                }}
              >
                {c.pr}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Collab Grid */}
      <CollabGrid vw={vw} />

      {/* Featured products from Shopify */}
      <Suspense fallback={null}>
        <Await resolve={data.recommendedProducts}>
          {(products) =>
            products && products.products.nodes.length > 0 ? (
              <section
                style={{
                  padding: '0 clamp(16px, 4vw, 48px) clamp(24px, 3vw, 40px)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 10,
                    marginBottom: 'clamp(14px, 2vw, 20px)',
                  }}
                >
                  <span
                    className="ph"
                    style={{
                      fontSize: 'clamp(14px, 1.8vw, 18px)',
                      fontWeight: 900,
                      color: T.tx,
                    }}
                  >
                    NEW ARRIVALS
                  </span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: 'clamp(10px, 1.5vw, 16px)',
                  }}
                >
                  {products.products.nodes.map((product: RecommendedProductFragment) => (
                    <Link
                      key={product.id}
                      to={`/products/${product.handle}`}
                      className="astro-product-card"
                      style={{textDecoration: 'none'}}
                    >
                      {product.featuredImage && (
                        <div style={{aspectRatio: '4/3', overflow: 'hidden'}}>
                          <Image
                            data={product.featuredImage}
                            sizes="(min-width: 768px) 25vw, 50vw"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              borderRadius: 0,
                            }}
                          />
                        </div>
                      )}
                      <div style={{padding: 'clamp(10px, 1.2vw, 14px)'}}>
                        <div
                          style={{
                            fontSize: 'clamp(10px, 1.2vw, 12px)',
                            fontWeight: 800,
                            color: T.tx,
                            lineHeight: 1.3,
                            marginBottom: 4,
                          }}
                        >
                          {product.title}
                        </div>
                        {product.priceRange?.minVariantPrice && (
                          <div
                            className="ph"
                            style={{
                              fontSize: 'clamp(13px, 1.6vw, 16px)',
                              color: T.c,
                              fontWeight: 900,
                            }}
                          >
                            ¥
                            {Number(
                              product.priceRange.minVariantPrice.amount,
                            ).toLocaleString('ja-JP')}
                            <span
                              style={{
                                fontSize: 10,
                                color: T.t4,
                                fontWeight: 500,
                              }}
                            >
                              〜
                            </span>
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null
          }
        </Await>
      </Suspense>

      {/* UGC Reviews */}
      <section
        style={{
          padding: '0 clamp(16px, 4vw, 48px) clamp(32px, 4vw, 48px)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            marginBottom: 'clamp(14px, 2vw, 20px)',
          }}
        >
          <span
            className="ph"
            style={{
              fontSize: 'clamp(14px, 1.8vw, 18px)',
              fontWeight: 900,
              color: T.tx,
            }}
          >
            REVIEWS
          </span>
          <span style={{fontSize: 'clamp(10px, 1.2vw, 12px)', color: T.t4}}>
            ユーザーレビュー
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 12,
            overflowX: 'auto',
            paddingBottom: 8,
          }}
          className="fps-scroll"
        >
          {UGC.map((u) => (
            <div
              key={u.id}
              style={{
                minWidth: 240,
                flexShrink: 0,
                background: T.bgC,
                borderRadius: 16,
                border: `1px solid ${al(u.c, 0.12)}`,
                padding: 'clamp(14px, 1.5vw, 18px)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, ${u.c}, ${al(u.c, 0.4)})`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 900,
                    color: '#000',
                    flexShrink: 0,
                  }}
                >
                  {u.u.slice(1, 2).toUpperCase()}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 'clamp(9px, 1.1vw, 11px)',
                      fontWeight: 700,
                      color: T.tx,
                    }}
                  >
                    {u.u}
                  </div>
                  <div style={{fontSize: 9, color: T.t4}}>{u.prod}</div>
                </div>
                <div style={{marginLeft: 'auto', fontSize: 8, color: T.t4}}>
                  {u.d}
                </div>
              </div>
              <div
                style={{
                  fontSize: 'clamp(9px, 1.1vw, 11px)',
                  color: T.t5,
                  lineHeight: 1.7,
                  marginBottom: 8,
                }}
              >
                {u.t}
              </div>
              <div style={{display: 'flex', gap: 2}}>
                {Array.from({length: 5}).map((_, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 10,
                      color: i < u.s ? '#FFB300' : T.t2,
                    }}
                  >
                    ★
                  </span>
                ))}
                <span
                  style={{fontSize: 9, color: T.t4, marginLeft: 4}}
                >
                  ♥ {u.likes}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const RECOMMENDED_PRODUCTS_QUERY = `#graphql
  fragment RecommendedProduct on Product {
    id
    title
    handle
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
    }
    featuredImage {
      id
      url
      altText
      width
      height
    }
  }
  query RecommendedProducts ($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    products(first: 8, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        ...RecommendedProduct
      }
    }
  }
` as const;
