import React from 'react';
import {useRecentlyViewed} from './RecentlyViewedProvider';
import {Link} from 'react-router';
import {T, al} from '~/lib/astromeda-data';

interface RecentlyViewedProps {
  currentHandle?: string; // exclude current product
}

export function RecentlyViewed({currentHandle}: RecentlyViewedProps) {
  const {getRecentlyViewed} = useRecentlyViewed();
  const recentItems = getRecentlyViewed();

  // Filter out current product
  const visibleItems = currentHandle
    ? recentItems.filter((item) => item.handle !== currentHandle)
    : recentItems;

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: 48,
        paddingTop: 48,
        borderTop: `1px solid ${T.bd}`,
      }}
    >
      {/* Title */}
      <h2
        style={{
          fontSize: 'clamp(16px, 2.5vw, 20px)',
          fontWeight: 900,
          color: T.c,
          marginBottom: 24,
          letterSpacing: 2,
        }}
      >
        最近チェックした商品
      </h2>

      {/* Horizontal Scroll Container */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          overflowX: 'auto',
          paddingBottom: 12,
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        className="recently-viewed-scroll"
      >
        <style dangerouslySetInnerHTML={{__html: `
          .recently-viewed-scroll::-webkit-scrollbar {
            display: none;
          }
        `}} />

        {visibleItems.map((item) => (
          <Link
            key={item.handle}
            to={`/products/${item.handle}`}
            prefetch="intent"
            style={{
              flex: '0 0 min(200px, 100%)',
              textDecoration: 'none',
              color: 'inherit',
              minWidth: 180,
            }}
          >
            <div
              style={{
                background: T.bgC,
                borderRadius: 12,
                border: `1px solid ${T.bd}`,
                overflow: 'hidden',
                transition: 'all 0.3s ease',
                cursor: 'pointer',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.background = al(T.c, 0.05);
                el.style.borderColor = al(T.c, 0.2);
                el.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.background = T.bgC;
                el.style.borderColor = T.bd;
                el.style.transform = 'translateY(0)';
              }}
            >
              {/* Product Image or Placeholder */}
              <div
                style={{
                  aspectRatio: '1/1',
                  background: item.imageUrl
                    ? `url(${item.imageUrl}) center/cover no-repeat`
                    : `linear-gradient(135deg, ${al(T.c, 0.1)}, rgba(255,179,0,0.05))`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  color: T.t3,
                  flex: 1,
                }}
              >
                {!item.imageUrl && item.handle}
              </div>

              {/* Title & Price */}
              <div
                style={{
                  padding: '12px',
                  borderTop: `1px solid ${al(T.tx, 0.04)}`,
                }}
              >
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: al(T.tx, 0.8),
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    margin: 0,
                  }}
                >
                  {item.title || item.handle}
                </p>
                {item.price && (
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: T.c,
                      margin: '4px 0 0 0',
                    }}
                  >
                    {item.price}
                  </p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
