import {Link} from 'react-router';
import {Image, Money, Pagination} from '@shopify/hydrogen';
import {urlWithTrackingParams, type RegularSearchReturn} from '~/lib/search';
import {T, al} from '~/lib/astromeda-data';

type SearchItems = RegularSearchReturn['result']['items'];
type PartialSearchResult<ItemType extends keyof SearchItems> = Pick<
  SearchItems,
  ItemType
> &
  Pick<RegularSearchReturn, 'term'>;

type SearchResultsProps = RegularSearchReturn & {
  children: (args: SearchItems & {term: string}) => React.ReactNode;
};

export function SearchResults({
  term,
  result,
  children,
}: Omit<SearchResultsProps, 'error' | 'type'>) {
  if (!result?.total) {
    return null;
  }

  return children({...result.items, term});
}

SearchResults.Articles = SearchResultsArticles;
SearchResults.Pages = SearchResultsPages;
SearchResults.Products = SearchResultsProducts;
SearchResults.Empty = SearchResultsEmpty;

/* ─── Section Header ─── */
function SectionHeader({title, count}: {title: string; count: number}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 16,
        paddingBottom: 10,
        borderBottom: `1px solid ${al(T.tx, 0.06)}`,
      }}
    >
      <h2
        style={{
          fontSize: 'clamp(15px, 2vw, 18px)',
          fontWeight: 800,
          letterSpacing: 1,
          margin: 0,
        }}
      >
        {title}
      </h2>
      <span
        style={{
          fontSize: 11,
          background: al(T.c, 0.12),
          color: T.c,
          padding: '2px 8px',
          borderRadius: 20,
          fontWeight: 700,
        }}
      >
        {count}
      </span>
    </div>
  );
}

/* ─── Products ─── */
function SearchResultsProducts({
  term,
  products,
}: PartialSearchResult<'products'>) {
  if (!products?.nodes.length) {
    return null;
  }

  return (
    <div style={{marginBottom: 40}}>
      <SectionHeader title="商品" count={products.nodes.length} />
      <Pagination connection={products}>
        {({nodes, isLoading, NextLink, PreviousLink}) => {
          return (
            <div>
              <div style={{textAlign: 'center', marginBottom: 16}}>
                <PreviousLink>
                  {isLoading ? (
                    '読み込み中...'
                  ) : (
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '8px 20px',
                        borderRadius: 8,
                        background: al(T.tx, 0.04),
                        border: `1px solid ${al(T.tx, 0.08)}`,
                        color: T.c,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ↑ 前の結果を表示
                    </span>
                  )}
                </PreviousLink>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(auto-fill, minmax(min(160px, 100%), 1fr))',
                  gap: 'clamp(10px, 2vw, 16px)',
                }}
              >
                {nodes.map((product) => {
                  const productUrl = urlWithTrackingParams({
                    baseUrl: `/products/${product.handle}`,
                    trackingParams: product.trackingParameters,
                    term,
                  });
                  const variant = product?.selectedOrFirstAvailableVariant;
                  const price = variant?.price;
                  const compareAtPrice = variant?.compareAtPrice;
                  const image = variant?.image;
                  const isOnSale =
                    compareAtPrice &&
                    price &&
                    Number(compareAtPrice.amount) > Number(price.amount);

                  return (
                    <Link
                      prefetch="intent"
                      to={productUrl}
                      key={product.id}
                      style={{
                        display: 'block',
                        textDecoration: 'none',
                        color: 'inherit',
                        background: al(T.tx, 0.02),
                        borderRadius: 12,
                        border: `1px solid ${al(T.tx, 0.06)}`,
                        overflow: 'hidden',
                        transition: 'border-color .2s, transform .2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = al(T.c, 0.3);
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = al(T.tx, 0.06);
                        e.currentTarget.style.transform = 'none';
                      }}
                    >
                      <div
                        style={{
                          position: 'relative',
                          aspectRatio: '1/1',
                          background: al(T.tx, 0.04),
                          overflow: 'hidden',
                        }}
                      >
                        {image ? (
                          <Image
                            data={image}
                            alt={product.title}
                            sizes="(min-width:768px) 200px, 45vw"
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
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: al(T.tx, 0.2),
                              fontSize: 11,
                            }}
                          >
                            No Image
                          </div>
                        )}
                        {isOnSale && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 6,
                              right: 6,
                              background: T.r,
                              color: T.tx,
                              fontSize: 10,
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: 4,
                              letterSpacing: 0.5,
                            }}
                          >
                            SALE
                          </div>
                        )}
                      </div>
                      <div style={{padding: 'clamp(8px, 1.5vw, 12px)'}}>
                        <p
                          style={{
                            fontSize: 'clamp(11px, 1.3vw, 13px)',
                            fontWeight: 600,
                            lineHeight: 1.35,
                            margin: 0,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {product.title}
                        </p>
                        <div
                          style={{
                            marginTop: 6,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            flexWrap: 'wrap',
                          }}
                        >
                          {price && (
                            <span
                              style={{
                                fontSize: 'clamp(12px, 1.4vw, 14px)',
                                fontWeight: 800,
                                color: isOnSale ? T.r : T.c,
                              }}
                            >
                              <Money data={price} />
                            </span>
                          )}
                          {isOnSale && compareAtPrice && (
                            <span
                              style={{
                                fontSize: 11,
                                color: al(T.tx, 0.35),
                                textDecoration: 'line-through',
                              }}
                            >
                              <Money data={compareAtPrice} />
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              <div style={{textAlign: 'center', marginTop: 20}}>
                <NextLink>
                  {isLoading ? (
                    '読み込み中...'
                  ) : (
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '10px 28px',
                        borderRadius: 8,
                        background: `linear-gradient(135deg, ${T.c}, ${T.cD})`,
                        color: T.bg,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      さらに表示 ↓
                    </span>
                  )}
                </NextLink>
              </div>
            </div>
          );
        }}
      </Pagination>
    </div>
  );
}

/* ─── Pages ─── */
function SearchResultsPages({term, pages}: PartialSearchResult<'pages'>) {
  if (!pages?.nodes.length) {
    return null;
  }

  return (
    <div style={{marginBottom: 32}}>
      <SectionHeader title="ページ" count={pages.nodes.length} />
      <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
        {pages.nodes.map((page) => {
          const pageUrl = urlWithTrackingParams({
            baseUrl: `/pages/${page.handle}`,
            trackingParams: page.trackingParameters,
            term,
          });
          return (
            <Link
              prefetch="intent"
              to={pageUrl}
              key={page.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 8,
                background: al(T.tx, 0.02),
                border: `1px solid ${al(T.tx, 0.06)}`,
                textDecoration: 'none',
                color: T.tx,
                fontSize: 13,
                fontWeight: 600,
                transition: 'border-color .2s',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderColor = al(T.c, 0.3))
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderColor = al(T.tx, 0.06))
              }
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path
                  d="M4 3h8l4 4v10a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z"
                  stroke={T.c}
                  strokeWidth="1.5"
                />
              </svg>
              {page.title}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Articles ─── */
function SearchResultsArticles({
  term,
  articles,
}: PartialSearchResult<'articles'>) {
  if (!articles?.nodes.length) {
    return null;
  }

  return (
    <div style={{marginBottom: 32}}>
      <SectionHeader title="記事" count={articles.nodes.length} />
      <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
        {articles.nodes.map((article) => {
          const articleUrl = urlWithTrackingParams({
            baseUrl: `/blogs/${article.handle}`,
            trackingParams: article.trackingParameters,
            term,
          });
          return (
            <Link
              prefetch="intent"
              to={articleUrl}
              key={article.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 8,
                background: al(T.tx, 0.02),
                border: `1px solid ${al(T.tx, 0.06)}`,
                textDecoration: 'none',
                color: T.tx,
                fontSize: 13,
                fontWeight: 600,
                transition: 'border-color .2s',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderColor = al(T.c, 0.3))
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderColor = al(T.tx, 0.06))
              }
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <rect
                  x="3"
                  y="3"
                  width="14"
                  height="14"
                  rx="2"
                  stroke={T.c}
                  strokeWidth="1.5"
                />
                <path
                  d="M6 7h8M6 10h8M6 13h4"
                  stroke={al(T.c, 0.5)}
                  strokeWidth="1.2"
                />
              </svg>
              {article.title}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Empty ─── */
function SearchResultsEmpty() {
  const suggestions = [
    'ゲーミングPC',
    'NARUTO',
    'ONE PIECE',
    'マウスパッド',
    'キーボード',
  ];

  return (
    <div style={{textAlign: 'center', padding: '48px 0'}}>
      <div style={{fontSize: 32, marginBottom: 12, opacity: 0.4}}>
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke={al(T.tx, 0.3)}
          strokeWidth="1.5"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </div>
      <p
        style={{
          color: al(T.tx, 0.5),
          fontSize: 14,
          marginBottom: 20,
        }}
      >
        検索結果が見つかりませんでした。別のキーワードをお試しください。
      </p>
      <div
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        {suggestions.map((s) => (
          <Link
            key={s}
            to={`/search?q=${encodeURIComponent(s)}`}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              background: al(T.c, 0.08),
              color: T.c,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              border: `1px solid ${al(T.c, 0.15)}`,
              transition: 'background .2s',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = al(T.c, 0.15))
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = al(T.c, 0.08))
            }
          >
            {s}
          </Link>
        ))}
      </div>
    </div>
  );
}
