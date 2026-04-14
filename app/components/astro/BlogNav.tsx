import {Link} from 'react-router';
import {T, PAGE_WIDTH} from '~/lib/astromeda-data';

/**
 * BlogNav — Reusable navigation component for blog-related pages
 * Links to blogs, guides, reviews, and FAQ for cross-pollination & SEO
 * Dark theme with Astromeda T constants
 */
export function BlogNav() {
  const navItems = [
    {label: 'ブログ', href: '/blogs', icon: '📰'},
    {label: 'ガイド', href: '/guides', icon: '📖'},
    {label: 'レビュー', href: '/reviews', icon: '⭐'},
    {label: 'FAQ', href: '/faq', icon: '❓'},
  ];

  return (
    <nav
      style={{
        borderTop: `1px solid ${T.bd}`,
        backgroundColor: `rgba(0, 240, 255, 0.02)`,
        backdropFilter: T.bl,
        marginTop: '60px',
        paddingTop: '40px',
        paddingBottom: '40px',
      }}
    >
      <div style={PAGE_WIDTH}>
        <p
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: T.t5,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '20px',
            margin: '0 0 20px 0',
          }}
        >
          コンテンツナビゲーション
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '16px',
          }}
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              style={{
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div
                style={{
                  padding: '16px',
                  border: `1px solid ${T.bd}`,
                  borderRadius: '6px',
                  backgroundColor: T.bgE,
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
                onMouseEnter={(e) => {
                  const elem = e.currentTarget as HTMLElement;
                  elem.style.borderColor = T.c;
                  elem.style.backgroundColor = `rgba(0, 240, 255, 0.08)`;
                  elem.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  const elem = e.currentTarget as HTMLElement;
                  elem.style.borderColor = T.bd;
                  elem.style.backgroundColor = T.bgE;
                  elem.style.transform = 'translateY(0)';
                }}
              >
                <div style={{fontSize: '20px', marginBottom: '8px'}}>{item.icon}</div>
                <p style={{fontSize: '14px', fontWeight: 600, margin: 0, color: T.tx}}>
                  {item.label}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* SEO Helper Text */}
        <p
          style={{
            fontSize: '12px',
            color: T.t3,
            marginTop: '20px',
            marginBottom: 0,
          }}
        >
          ASTROMEDAの関連コンテンツをご覧ください。新製品情報、ゲーミングガイド、IPコラボレーション情報など、幅広いコンテンツをお届けします。
        </p>
      </div>
    </nav>
  );
}
