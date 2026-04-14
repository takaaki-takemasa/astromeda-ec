/**
 * ギフトカード購入ページ
 *
 * Shopifyのギフトカード商品をStorefront APIで取得し表示。
 * Shopify管理画面で「ギフトカード」商品を作成しておく必要あり。
 *
 * 商品タイプ: gift_card
 * 金額バリアント: ¥3,000 / ¥5,000 / ¥10,000 / ¥30,000 / ¥50,000
 */

import {useLoaderData, Link} from 'react-router';
import type {Route} from './+types/gift-cards';
import {Image, Money} from '@shopify/hydrogen';
import {T, STORE_URL} from '~/lib/astromeda-data';

export const meta: Route.MetaFunction = () => {
  const title = 'ギフトカード | ASTROMEDA ゲーミングPC';
  const description = 'ASTROMEDAギフトカード。ゲーミングPC好きな方へのプレゼントに。';
  const url = `${STORE_URL}/gift-cards`;
  return [
    {title},
    {name: 'description', content: description},
    {tagName: 'link' as const, rel: 'canonical', href: url},
    {property: 'og:url', content: url},
    {name: 'twitter:card', content: 'summary'},
    {name: 'twitter:title', content: title},
  ];
};

export async function loader({context}: Route.LoaderArgs) {
  const {storefront} = context;

  // ギフトカード商品を検索
  const {products} = await storefront.query(GIFT_CARDS_QUERY);

  return {
    products: products?.nodes || [],
  };
}

export default function GiftCards() {
  const {products} = useLoaderData<typeof loader>();

  return (
    <div
      style={{
        background: T.bg,
        minHeight: '100vh',
        fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif",
        color: T.tx,
      }}
    >
      {/* Header */}
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: 'clamp(32px, 4vw, 64px) clamp(16px, 4vw, 48px)',
        }}
      >
        <div style={{textAlign: 'center', marginBottom: 48}}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: T.c,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: 8,
            }}
          >
            Gift Card
          </span>
          <h1
            style={{
              fontSize: 'clamp(24px, 4vw, 36px)',
              fontWeight: 900,
              margin: '0 0 12px',
              letterSpacing: '0.02em',
            }}
          >
            ASTROMEDA ギフトカード
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,.6)',
              maxWidth: 500,
              margin: '0 auto',
              lineHeight: 1.6,
            }}
          >
            ゲーミングPC好きな方へのプレゼントに。
            お好きな金額のギフトカードを購入して、メールで送信できます。
          </p>
        </div>

        {products.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '64px 24px',
              background: 'rgba(255,255,255,.03)',
              borderRadius: 20,
              border: '1px solid rgba(255,255,255,.06)',
            }}
          >
            <p
              style={{
                fontSize: 16,
                color: 'rgba(255,255,255,.5)',
                marginBottom: 16,
              }}
            >
              ギフトカードは準備中です
            </p>
            <Link
              to="/"
              style={{
                color: T.c,
                fontSize: 14,
                textDecoration: 'underline',
              }}
            >
              トップページへ戻る
            </Link>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 24,
            }}
          >
            {products.map((product) => (
              <Link
                key={product.id}
                to={`/products/${product.handle}`}
                style={{textDecoration: 'none', color: '#fff'}}
              >
                <div
                  style={{
                    background: 'rgba(255,255,255,.03)',
                    borderRadius: 16,
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,.06)',
                    transition: 'border-color .2s, transform .2s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor =
                      'rgba(0, 240, 255, 0.19)';
                    (e.currentTarget as HTMLElement).style.transform =
                      'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor =
                      'rgba(255,255,255,.06)';
                    (e.currentTarget as HTMLElement).style.transform = 'none';
                  }}
                >
                  {/* Card Image */}
                  <div
                    style={{
                      height: 200,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {product.featuredImage ? (
                      <Image
                        data={product.featuredImage}
                        alt={product.title}
                        sizes="(min-width: 768px) 33vw, 100vw"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          background:
                            'linear-gradient(135deg, #00F0FF11, #7B68EE22, #FF00FF11)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 48,
                            fontWeight: 900,
                            color: T.c,
                            opacity: 0.3,
                          }}
                        >
                          GIFT
                        </span>
                      </div>
                    )}
                    {/* Badge */}
                    <span
                      style={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        background: T.c,
                        color: '#000',
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '4px 10px',
                        borderRadius: 6,
                        letterSpacing: '0.05em',
                      }}
                    >
                      GIFT CARD
                    </span>
                  </div>

                  {/* Info */}
                  <div style={{padding: '16px 20px'}}>
                    <h2
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        margin: '0 0 8px',
                      }}
                    >
                      {product.title}
                    </h2>
                    <p
                      style={{
                        fontSize: 12,
                        color: 'rgba(255,255,255,.5)',
                        margin: '0 0 12px',
                        lineHeight: 1.5,
                      }}
                    >
                      {product.description?.slice(0, 100) || 'メールで送れるデジタルギフトカード'}
                    </p>
                    {product.priceRange?.minVariantPrice && (
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: T.c,
                        }}
                      >
                        <Money data={product.priceRange.minVariantPrice} />
                        {product.priceRange.maxVariantPrice &&
                          product.priceRange.maxVariantPrice.amount !==
                            product.priceRange.minVariantPrice.amount && (
                            <span
                              style={{
                                fontSize: 12,
                                color: 'rgba(255,255,255,.4)',
                                fontWeight: 500,
                              }}
                            >
                              {' '}
                              〜{' '}
                              <Money
                                data={product.priceRange.maxVariantPrice}
                              />
                            </span>
                          )}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* How it works */}
        <div
          style={{
            marginTop: 64,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 24,
          }}
        >
          {[
            {
              step: '01',
              title: '金額を選ぶ',
              desc: 'お好きな金額のギフトカードを選択',
            },
            {
              step: '02',
              title: '購入する',
              desc: '通常の商品と同じくカートでお支払い',
            },
            {
              step: '03',
              title: 'メールで届く',
              desc: 'ギフトカードコードがメールで届きます',
            },
            {
              step: '04',
              title: '使う',
              desc: 'チェックアウト時にコードを入力して割引',
            },
          ].map((item) => (
            <div
              key={item.step}
              style={{
                textAlign: 'center',
                padding: 24,
              }}
            >
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 900,
                  color: T.c,
                  opacity: 0.3,
                  marginBottom: 8,
                }}
              >
                {item.step}
              </div>
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  margin: '0 0 4px',
                }}
              >
                {item.title}
              </h3>
              <p
                style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,.5)',
                  margin: 0,
                }}
              >
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const GIFT_CARDS_QUERY = `#graphql
  query GiftCards(
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    products(first: 10, query: "product_type:gift_card") {
      nodes {
        id
        title
        handle
        description
        productType
        featuredImage {
          id
          url
          altText
          width
          height
        }
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
          maxVariantPrice {
            amount
            currencyCode
          }
        }
      }
    }
  }
` as const;

export {RouteErrorBoundary as ErrorBoundary} from '~/components/astro/RouteErrorBoundary';
