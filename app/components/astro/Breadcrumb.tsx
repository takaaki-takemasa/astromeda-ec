import {Link, useMatches} from 'react-router';
import {T, STORE_URL} from '~/lib/astromeda-data';

/**
 * Breadcrumb navigation with JSON-LD structured data.
 * Auto-generates crumbs from the current route, or accepts explicit items.
 */

interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface BreadcrumbProps {
  /** Explicit breadcrumb items. If omitted, auto-generates from route. */
  items?: BreadcrumbItem[];
}

/** Route-segment → Japanese label mapping */
const ROUTE_LABELS: Record<string, string> = {
  collections: 'コレクション',
  products: '商品',
  account: 'アカウント',
  orders: '注文履歴',
  addresses: '住所管理',
  profile: 'プロフィール',
  cart: 'カート',
  search: '検索',
  faq: 'よくある質問',
  guides: 'ガイド',
  wishlist: 'お気に入り',
  policies: 'ポリシー',
  'gift-cards': 'ギフトカード',
};

export function Breadcrumb({items}: BreadcrumbProps) {
  const matches = useMatches();

  // Build crumbs: explicit or auto-from-route
  const crumbs: BreadcrumbItem[] = items ?? buildCrumbsFromRoute(matches);

  if (crumbs.length <= 1) return null; // Don't show for homepage alone

  // JSON-LD BreadcrumbList structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.label,
      ...(crumb.to ? {item: `${STORE_URL}${crumb.to}`} : {}),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}
      />
      <nav
        aria-label="パンくずリスト"
        style={{
          padding: 'clamp(8px, 1.5vw, 12px) clamp(16px, 4vw, 48px)',
          fontSize: 'clamp(10px, 1.2vw, 12px)',
          color: T.t4,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={i} style={{display: 'flex', alignItems: 'center', gap: 6}}>
              {i > 0 && (
                <span style={{color: T.t3, fontSize: '0.85em'}} aria-hidden="true">
                  /
                </span>
              )}
              {isLast || !crumb.to ? (
                <span
                  style={{color: isLast ? T.tx : T.t4, fontWeight: isLast ? 600 : 400}}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  to={crumb.to}
                  style={{
                    color: T.t4,
                    textDecoration: 'none',
                    transition: 'color .2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = T.c)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = T.t4)}
                >
                  {crumb.label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>
    </>
  );
}

function buildCrumbsFromRoute(
  matches: ReturnType<typeof useMatches>,
): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [{label: 'ホーム', to: '/'}];

  // Get the last match with a pathname
  const lastMatch = matches[matches.length - 1];
  if (!lastMatch) return crumbs;

  const pathname = lastMatch.pathname;
  if (pathname === '/') return crumbs;

  const segments = pathname.split('/').filter(Boolean);
  let currentPath = '';

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    currentPath += `/${segment}`;
    const isLast = i === segments.length - 1;

    // Use known label or decode the segment
    const label =
      ROUTE_LABELS[segment] ||
      decodeURIComponent(segment)
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

    crumbs.push({
      label,
      to: isLast ? undefined : currentPath,
    });
  }

  return crumbs;
}
