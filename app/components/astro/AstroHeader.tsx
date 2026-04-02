import {useState} from 'react';
import {Link, useLocation} from 'react-router';
import {Suspense} from 'react';
import {Await} from 'react-router';
import {T, al, fl} from '~/lib/astromeda-data';
import type {CartApiQueryFragment} from 'storefrontapi.generated';

interface AstroHeaderProps {
  cart: Promise<CartApiQueryFragment | null>;
  isLoggedIn: Promise<boolean>;
}

const NAV_ITEMS = [
  {l: 'ホーム', to: '/'},
  {l: 'ゲーミングPC', to: '/collections/astromeda'},
  {l: 'コラボPC', to: '/collections/pc-collaboration'},
  {l: '全商品', to: '/collections/all'},
];

export function AstroHeader({cart, isLoggedIn}: AstroHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(6,6,12,.92)',
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
          {/* Search */}
          <Link
            to="/search"
            style={{
              color: T.t4,
              textDecoration: 'none',
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label="検索"
          >
            🔍
          </Link>

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
            🛒
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
                        color: '#000',
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
                  👤
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
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          style={{
            position: 'fixed',
            top: 60,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(6,6,12,.96)',
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
        </div>
      )}

      <style>{`
        @media (min-width: 768px) {
          .astro-desktop-nav { display: flex !important; }
          .astro-mobile-menu-toggle { display: none !important; }
        }
      `}</style>
    </>
  );
}
