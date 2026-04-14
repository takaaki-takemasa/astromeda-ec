import React, {useState, useRef, useEffect} from 'react';
import {Link, useLocation} from 'react-router';
import {Suspense} from 'react';
import {Await} from 'react-router';
import {T, al} from '~/lib/astromeda-data';
import {PredictiveSearch} from '~/components/astro/PredictiveSearch';
import type {CartApiQueryFragment} from 'storefrontapi.generated';

/**
 * ============================================================
 * SVGアイコンシステム（神経系接続 — 視覚信号の統一インターフェース）
 * ============================================================
 */
const IconSearch = React.memo(function IconSearch({size = 20, color = 'currentColor'}: {size?: number; color?: string}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
});
IconSearch.displayName = 'IconSearch';

const IconCart = React.memo(function IconCart({size = 20, color = 'currentColor'}: {size?: number; color?: string}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  );
});
IconCart.displayName = 'IconCart';

const IconUser = React.memo(function IconUser({size = 20, color = 'currentColor'}: {size?: number; color?: string}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
});
IconUser.displayName = 'IconUser';

const IconMenu = React.memo(function IconMenu({size = 20, color = 'currentColor'}: {size?: number; color?: string}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  );
});
IconMenu.displayName = 'IconMenu';

const IconX = React.memo(function IconX({size = 20, color = 'currentColor'}: {size?: number; color?: string}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
});
IconX.displayName = 'IconX';

interface AstroHeaderProps {
  cart: Promise<CartApiQueryFragment | null>;
  isLoggedIn: Promise<boolean>;
}

const NAV_ITEMS = [
  {l: 'ホーム', to: '/'},
  {l: 'ゲーミングPC', to: '/collections/astromeda'},
  {l: 'ガジェット', to: '/collections/gadgets'},
  {l: 'グッズ', to: '/collections/goods'},
];

function AstroHeaderComponent({cart, isLoggedIn}: AstroHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();

  // Close menus on navigation
  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  return (
    <>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: al(T.bg, 0.92),
          backdropFilter: 'blur(20px) saturate(1.5)',
          borderBottom: `1px solid ${T.bd}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 clamp(16px, 4vw, 48px)',
          height: 60,
        }}
      >
        {/* Logo */}
        <Link
          to="/"
          className="ph"
          style={{
            fontSize: 'clamp(12px, 2vw, 16px)',
            letterSpacing: 'clamp(3px, 1vw, 6px)',
            color: T.tx,
            textDecoration: 'none',
            marginRight: 'clamp(20px, 4vw, 48px)',
            flexShrink: 0,
          }}
        >
          ASTROMEDA
        </Link>

        {/* Desktop nav */}
        <nav
          style={{
            display: 'none',
            gap: 'clamp(14px, 2vw, 28px)',
          }}
          className="astro-desktop-nav"
        >
          {NAV_ITEMS.map((n) => {
            const isActive = location.pathname === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                style={{
                  fontSize: 'clamp(10px, 1.2vw, 12px)',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? T.c : T.t4,
                  textDecoration: 'none',
                  padding: '18px 0',
                  borderBottom: isActive ? `2px solid ${T.c}` : '2px solid transparent',
                  transition: 'color .2s',
                }}
              >
                {n.l}
              </Link>
            );
          })}
        </nav>

        {/* Right CTAs */}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 'clamp(8px, 1.5vw, 16px)',
          }}
        >
          {/* Search toggle */}
          <button
            type="button"
            onClick={() => setSearchOpen((o) => !o)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: searchOpen ? T.c : T.t4,
              display: 'flex',
              alignItems: 'center',
              padding: 4,
            }}
            aria-label="検索"
            aria-expanded={searchOpen}
          >
            <IconSearch size={20} />
          </button>

          {/* Cart */}
          <Link
            to="/cart"
            style={{
              color: T.t4,
              textDecoration: 'none',
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              position: 'relative',
            }}
            aria-label="カート"
          >
            <IconCart size={20} color={T.t4} />
            <Suspense fallback={null}>
              <Await resolve={cart}>
                {(cartData) => {
                  const count = cartData?.totalQuantity ?? 0;
                  if (count === 0) return null;
                  return (
                    <span
                      style={{
                        position: 'absolute',
                        top: -6,
                        right: -8,
                        background: T.c,
                        color: T.bg,
                        borderRadius: '50%',
                        width: 16,
                        height: 16,
                        fontSize: 9,
                        fontWeight: 900,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        animation: 'cartPop .3s ease-out',
                      }}
                    >
                      {count}
                    </span>
                  );
                }}
              </Await>
            </Suspense>
          </Link>

          {/* Account */}
          <Suspense fallback={null}>
            <Await resolve={isLoggedIn}>
              {(loggedIn) => (
                <Link
                  to={loggedIn ? '/account' : '/account/login'}
                  style={{
                    color: T.t4,
                    textDecoration: 'none',
                    fontSize: 18,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  aria-label="アカウント"
                >
                  <IconUser size={20} color={T.t4} />
                </Link>
              )}
            </Await>
          </Suspense>

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="astro-mobile-menu-toggle"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: T.tx,
              fontSize: 20,
              padding: 4,
            }}
            aria-label="メニュー"
          >
            {menuOpen ? <IconX size={20} color={T.tx} /> : <IconMenu size={20} color={T.tx} />}
          </button>
        </div>
      </header>

      {/* Predictive search dropdown */}
      {searchOpen && <PredictiveSearch onClose={() => setSearchOpen(false)} variant="overlay" />}

      {/* Mobile menu */}
      {menuOpen && (
        <div
          style={{
            position: 'fixed',
            top: 60,
            left: 0,
            right: 0,
            bottom: 0,
            background: al(T.bg, 0.96),
            backdropFilter: 'blur(20px)',
            zIndex: 99,
            display: 'flex',
            flexDirection: 'column',
            padding: '24px clamp(16px, 4vw, 48px)',
          }}
          onClick={() => setMenuOpen(false)}
        >
          {NAV_ITEMS.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: T.tx,
                textDecoration: 'none',
                padding: '16px 0',
                borderBottom: `1px solid ${T.t1}`,
              }}
            >
              {n.l}
            </Link>
          ))}
          <Link
            to="/search"
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: T.tx,
              textDecoration: 'none',
              padding: '16px 0',
              borderBottom: `1px solid ${T.t1}`,
            }}
          >
            検索
          </Link>
          <Link
            to="/admin"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: T.t3,
              textDecoration: 'none',
              padding: '20px 0 8px',
              marginTop: 'auto',
            }}
          >
            管理画面
          </Link>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @media (min-width: 768px) {
          .astro-desktop-nav { display: flex !important; }
          .astro-mobile-menu-toggle { display: none !important; }
        }
      `}} />
    </>
  );
}

export const AstroHeader = React.memo(AstroHeaderComponent);
AstroHeader.displayName = 'AstroHeader';
