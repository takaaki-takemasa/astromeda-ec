import React, {useState, useRef, useEffect, useCallback, useMemo} from 'react';
import {Link, useNavigate, useFetcher} from 'react-router';
import {T, al, yen} from '~/lib/astromeda-data';
import type {PredictiveSearchReturn} from '~/lib/search';

/**
 * ============================================================
 * PredictiveSearch コンポーネント
 * Shopify Storefront API の predictiveSearch クエリを使用
 * リアルタイム検索サジェスト（商品・コレクション・記事）
 * ============================================================
 */

interface PredictiveSearchProps {
  onClose?: () => void;
  variant?: 'inline' | 'overlay'; // inline: header dropdown, overlay: full-screen
}

// SVG Icons
const IconSearch = React.memo(function IconSearch({size = 20, color = 'currentColor'}: {size?: number; color?: string}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
});
IconSearch.displayName = 'IconSearch';

const IconX = React.memo(function IconX({size = 20, color = 'currentColor'}: {size?: number; color?: string}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
});
IconX.displayName = 'IconX';

const LoadingSpinner = React.memo(function LoadingSpinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.c} strokeWidth="2" style={{animation: 'spin 1s linear infinite'}}>
      <circle cx="12" cy="12" r="10" opacity="0.3" />
      <path d="M12 2a10 10 0 0 1 0 20" strokeLinecap="round" />
      <style dangerouslySetInnerHTML={{__html: `@keyframes spin { to { transform: rotate(360deg); } }`}} />
    </svg>
  );
});
LoadingSpinner.displayName = 'LoadingSpinner';

function PredictiveSearchComponent({onClose, variant = 'inline'}: PredictiveSearchProps) {
  const fetcher = useFetcher<PredictiveSearchReturn>({key: 'predictive-search'});
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose?.();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on click outside (only for overlay variant)
  useEffect(() => {
    if (variant !== 'overlay') return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose?.();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, variant]);

  // Debounced search fetcher
  const fetchResults = useCallback(
    (value: string) => {
      setQuery(value);
      setHighlightedIndex(null);

      // Clear previous timer
      if (debounceTimer) clearTimeout(debounceTimer);

      // Set new timer (300ms debounce)
      if (value.length >= 2) {
        const timer = setTimeout(() => {
          fetcher.submit(
            {q: value, limit: '10'},
            {method: 'GET', action: '/api.predictive-search'}
          );
        }, 300);
        setDebounceTimer(timer);
      } else {
        fetcher.submit({}, {method: 'GET', action: '/api.predictive-search'});
      }
    },
    [fetcher, debounceTimer]
  );

  // 予防医学: debounceTimerのクリーンアップ（アンマウント時のメモリリーク防止）
  useEffect(() => {
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [debounceTimer]);

  // Handle Enter key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const allResults = getResultsList();

      if (e.key === 'Enter') {
        if (highlightedIndex !== null && allResults[highlightedIndex]) {
          const item = allResults[highlightedIndex];
          navigateToResult(item);
        } else if (query) {
          navigate(`/search?q=${encodeURIComponent(query)}`);
          onClose?.();
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev === null ? 0 : Math.min(prev + 1, allResults.length - 1)
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev === null ? allResults.length - 1 : Math.max(prev - 1, 0)
        );
      }
    },
    [highlightedIndex, query, navigate, onClose]
  );

  const results = fetcher.data?.result;
  const products = results?.items?.products ?? [];
  const collections = results?.items?.collections ?? [];
  const articles = results?.items?.articles ?? [];

  // Flatten results with type info for keyboard navigation
  type ProductItem = (typeof products)[number];
  type CollectionItem = (typeof collections)[number];
  type ArticleItem = (typeof articles)[number];
  const getResultsList = useCallback(() => {
    return [
      ...products.slice(0, 4).map((p: ProductItem) => ({type: 'product' as const, data: p})),
      ...collections.slice(0, 3).map((c: CollectionItem) => ({type: 'collection' as const, data: c})),
      ...articles.slice(0, 2).map((a: ArticleItem) => ({type: 'article' as const, data: a})),
    ];
  }, [products, collections, articles]);

  const navigateToResult = useCallback(
    (item: ReturnType<typeof getResultsList>[0]) => {
      if (item.type === 'product') {
        navigate(`/products/${item.data.handle}`);
      } else if (item.type === 'collection') {
        navigate(`/collections/${item.data.handle}`);
      } else if (item.type === 'article') {
        navigate(`/blogs/${item.data.blog.handle}/${item.data.handle}`);
      }
      onClose?.();
    },
    [navigate, onClose]
  );

  const goToAllResults = useCallback(() => {
    if (query) {
      navigate(`/search?q=${encodeURIComponent(query)}`);
      onClose?.();
    }
  }, [query, navigate, onClose]);

  const hasResults = products.length > 0 || collections.length > 0 || articles.length > 0;
  const isLoading = fetcher.state === 'loading';
  const allResults = getResultsList();

  // Container styles
  const containerStyle: React.CSSProperties =
    variant === 'overlay'
      ? {
          position: 'fixed',
          top: 60,
          left: 0,
          right: 0,
          zIndex: 98,
          background: al(T.bg, 0.96),
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${T.bd}`,
          padding: 'clamp(12px, 2vw, 20px) clamp(16px, 4vw, 48px)',
          maxHeight: 'calc(100vh - 80px)',
          overflowY: 'auto',
        }
      : {
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 8,
          zIndex: 1000,
          background: T.bg,
          border: `1px solid ${T.bd}`,
          borderRadius: 12,
          padding: 12,
          maxHeight: 'calc(100vh - 200px)',
          overflowY: 'auto',
          boxShadow: '0 20px 40px rgba(0, 240, 255, 0.1)',
        };

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      role="search"
      aria-label="商品検索"
    >
      {/* Search Input */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: T.bgC,
          border: `1px solid ${al(T.c, 0.2)}`,
          borderRadius: 12,
          padding: '10px 16px',
          marginBottom: hasResults || isLoading ? 16 : 0,
        }}
      >
        <IconSearch size={18} color={T.t4} />
        <input
          ref={inputRef}
          type="search"
          placeholder="商品を検索..."
          value={query}
          onChange={(e) => fetchResults(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: T.tx,
            fontSize: 'clamp(13px, 1.5vw, 15px)',
            fontFamily: "'Outfit','Noto Sans JP',system-ui,sans-serif",
          }}
          aria-label="商品検索入力"
        />
        {query && (
          <button
            type="button"
            aria-label="検索をクリア"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
              setHighlightedIndex(null);
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: T.t4,
              padding: 2,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <IconX size={16} />
          </button>
        )}
      </div>

      {/* Loading State */}
      {isLoading && query.length >= 2 && (
        <div style={{display: 'flex', alignItems: 'center', gap: 8, color: T.t4, fontSize: 12, padding: '8px 0'}}>
          <LoadingSpinner />
          検索中...
        </div>
      )}

      {/* Results */}
      {!isLoading && hasResults && (
        <div>
          {/* Products */}
          {products.length > 0 && (
            <div style={{marginBottom: 16}}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: T.t4,
                  marginBottom: 8,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                商品 ({products.length})
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                {products.slice(0, 4).map((product: ProductItem, idx: number) => {
                  const isHighlighted = highlightedIndex !== null && allResults[highlightedIndex]?.type === 'product' && allResults[highlightedIndex]?.data.id === product.id;
                  return (
                    <button
                      key={product.id}
                      onClick={() => {
                        navigate(`/products/${product.handle}`);
                        onClose?.();
                      }}
                      onMouseEnter={() => {
                        setHighlightedIndex(
                          allResults.findIndex(
                            (r) => r.type === 'product' && r.data.id === product.id
                          )
                        );
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: isHighlighted ? al(T.c, 0.1) : 'transparent',
                        border: `1px solid ${isHighlighted ? al(T.c, 0.3) : 'transparent'}`,
                        cursor: 'pointer',
                        textAlign: 'left',
                        color: T.tx,
                        transition: 'background .15s, border-color .15s',
                      }}
                      aria-current={isHighlighted ? 'true' : undefined}
                    >
                      {product.selectedOrFirstAvailableVariant?.image?.url && (
                        <img
                          src={`${product.selectedOrFirstAvailableVariant.image.url}?width=80&height=80&crop=center`}
                          alt={product.title || 'ASTROMEDA商品'}
                          width={40}
                          height={40}
                          style={{
                            borderRadius: 6,
                            objectFit: 'cover',
                            flexShrink: 0,
                          }}
                          loading="lazy"
                        />
                      )}
                      <div style={{flex: 1, minWidth: 0}}>
                        <div
                          style={{
                            fontSize: 'clamp(11px, 1.3vw, 13px)',
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {product.title}
                        </div>
                        {product.selectedOrFirstAvailableVariant?.price && (
                          <div style={{fontSize: 11, color: T.c, fontWeight: 700}}>
                            {yen(Number(product.selectedOrFirstAvailableVariant.price.amount))}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Collections */}
          {collections.length > 0 && (
            <div style={{marginBottom: 16}}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: T.t4,
                  marginBottom: 8,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                コレクション ({collections.length})
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                {collections.slice(0, 3).map((col: CollectionItem) => {
                  const isHighlighted = highlightedIndex !== null && allResults[highlightedIndex]?.type === 'collection' && allResults[highlightedIndex]?.data.id === col.id;
                  return (
                    <button
                      key={col.id}
                      onClick={() => {
                        navigate(`/collections/${col.handle}`);
                        onClose?.();
                      }}
                      onMouseEnter={() => {
                        setHighlightedIndex(
                          allResults.findIndex(
                            (r) => r.type === 'collection' && r.data.id === col.id
                          )
                        );
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: isHighlighted ? al(T.c, 0.1) : 'transparent',
                        border: `1px solid ${isHighlighted ? al(T.c, 0.3) : 'transparent'}`,
                        textDecoration: 'none',
                        color: T.tx,
                        fontSize: 'clamp(11px, 1.3vw, 13px)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'background .15s, border-color .15s',
                        textAlign: 'left',
                      }}
                      aria-current={isHighlighted ? 'true' : undefined}
                    >
                      {col.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Articles */}
          {articles.length > 0 && (
            <div style={{marginBottom: 16}}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: T.t4,
                  marginBottom: 8,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                記事 ({articles.length})
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                {articles.slice(0, 2).map((article: ArticleItem) => {
                  const isHighlighted = highlightedIndex !== null && allResults[highlightedIndex]?.type === 'article' && allResults[highlightedIndex]?.data.id === article.id;
                  return (
                    <button
                      key={article.id}
                      onClick={() => {
                        navigate(`/blogs/${article.blog.handle}/${article.handle}`);
                        onClose?.();
                      }}
                      onMouseEnter={() => {
                        setHighlightedIndex(
                          allResults.findIndex(
                            (r) => r.type === 'article' && r.data.id === article.id
                          )
                        );
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: isHighlighted ? al(T.c, 0.1) : 'transparent',
                        border: `1px solid ${isHighlighted ? al(T.c, 0.3) : 'transparent'}`,
                        color: T.tx,
                        fontSize: 'clamp(11px, 1.3vw, 13px)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'background .15s, border-color .15s',
                        textAlign: 'left',
                      }}
                      aria-current={isHighlighted ? 'true' : undefined}
                    >
                      {article.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* View all results */}
          <div style={{textAlign: 'center', marginTop: 12}}>
            <button
              type="button"
              onClick={goToAllResults}
              style={{
                background: al(T.c, 0.1),
                border: `1px solid ${al(T.c, 0.2)}`,
                borderRadius: 8,
                color: T.c,
                fontSize: 12,
                fontWeight: 700,
                padding: '8px 20px',
                cursor: 'pointer',
                transition: 'background .2s, border-color .2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = al(T.c, 0.15);
                e.currentTarget.style.borderColor = al(T.c, 0.4);
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = al(T.c, 0.1);
                e.currentTarget.style.borderColor = al(T.c, 0.2);
              }}
            >
              「{query}」のすべての結果を見る
            </button>
          </div>
        </div>
      )}

      {/* No results */}
      {!isLoading && query.length >= 2 && !hasResults && fetcher.data && (
        <div style={{color: T.t4, fontSize: 12, padding: '8px 0', textAlign: 'center'}}>
          「{query}」に一致する結果が見つかりませんでした
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !hasResults && !query && variant === 'inline' && (
        <div style={{color: T.t4, fontSize: 12, padding: '8px 0', textAlign: 'center'}}>
          商品、コレクション、記事を検索できます
        </div>
      )}
    </div>
  );
}

export const PredictiveSearch = React.memo(PredictiveSearchComponent);
PredictiveSearch.displayName = 'PredictiveSearch';
