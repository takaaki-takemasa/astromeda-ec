/**
 * Sidebar — 左サイドバーナビゲーション
 * Stripe風: アイコン+ラベル、5セクション、折りたたみ対応
 * レスポンシブ: モバイルではスライドアウトドロワー
 */
import { color, font, radius, transition, space, zIndex } from '~/lib/design-tokens';

export type SectionId = 'home' | 'commerce' | 'ai' | 'operations' | 'settings';

interface NavItem {
  id: SectionId;
  label: string;
  icon: string;   // SVG path data
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home',       label: 'ホーム',       icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { id: 'commerce',   label: 'コマース',     icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z' },
  { id: 'ai',         label: 'AI運用',       icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { id: 'operations', label: 'オペレーション', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'settings',   label: '設定',         icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4' },
];

interface SidebarProps {
  active: SectionId;
  onNavigate: (id: SectionId) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  badges?: Partial<Record<SectionId, number>>;
  /** モバイルドロワーモード */
  isMobile?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({
  active, onNavigate, collapsed = false, onToggleCollapse,
  badges = {}, isMobile = false, mobileOpen = false, onMobileClose,
}: SidebarProps) {
  // モバイルではドロワー幅固定200px、デスクトップでは折りたたみ対応
  const width = isMobile ? '240px' : (collapsed ? '56px' : '200px');

  const handleNavClick = (id: SectionId) => {
    onNavigate(id);
    // モバイルではナビ選択後に自動で閉じる
    if (isMobile && onMobileClose) {
      onMobileClose();
    }
  };

  const sidebar = (
    <nav style={{
      width,
      minWidth: width,
      height: '100vh',
      background: color.bg0,
      borderRight: `1px solid ${color.border}`,
      display: 'flex',
      flexDirection: 'column',
      transition: isMobile ? `transform ${transition.normal}` : `width ${transition.normal}`,
      position: isMobile ? 'fixed' as const : 'sticky' as const,
      top: 0,
      left: 0,
      zIndex: isMobile ? zIndex.modal : zIndex.sidebar,
      overflow: 'hidden',
      transform: isMobile ? (mobileOpen ? 'translateX(0)' : 'translateX(-100%)') : undefined,
    }}>
      {/* ロゴ */}
      <div style={{
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        padding: collapsed && !isMobile ? '0 16px' : '0 20px',
        borderBottom: `1px solid ${color.border}`,
        gap: '10px',
        flexShrink: 0,
      }}>
        <div style={{
          width: '24px', height: '24px', borderRadius: '6px',
          background: `linear-gradient(135deg, ${color.cyan}, #0080FF)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: 800, color: '#000', flexShrink: 0,
        }}>
          A
        </div>
        {(!collapsed || isMobile) && (
          <span style={{ fontSize: font.sm, fontWeight: font.bold, color: color.text, whiteSpace: 'nowrap', flex: 1 }}>
            ASTROMEDA
          </span>
        )}
        {/* モバイル: 閉じるボタン */}
        {isMobile && onMobileClose && (
          <button
            type="button"
            onClick={onMobileClose}
            aria-label="メニューを閉じる"
            title="閉じる"
            style={{
              background: 'none', border: 'none', color: color.textMuted,
              cursor: 'pointer', padding: '4px', display: 'flex',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* ナビアイテム */}
      <div style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {NAV_ITEMS.map(item => {
          const isActive = active === item.id;
          const badge = badges[item.id];
          const showLabel = !collapsed || isMobile;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              title={!showLabel ? item.label : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: !showLabel ? '10px 14px' : '10px 12px',
                borderRadius: radius.md,
                border: 'none',
                background: isActive ? color.cyanDim : 'transparent',
                color: isActive ? color.cyan : color.textMuted,
                fontSize: font.sm,
                fontWeight: isActive ? font.semibold : font.regular,
                fontFamily: font.family,
                cursor: 'pointer',
                transition: `all ${transition.fast}`,
                textAlign: 'left',
                width: '100%',
                position: 'relative',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = color.bg2; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d={item.icon} />
              </svg>
              {showLabel && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
              {badge && badge > 0 && (
                <span style={{
                  position: !showLabel ? 'absolute' : 'relative',
                  top: !showLabel ? '4px' : undefined,
                  right: !showLabel ? '4px' : undefined,
                  marginLeft: !showLabel ? 0 : 'auto',
                  fontSize: '10px', fontWeight: font.bold,
                  color: '#fff', background: color.red,
                  padding: '1px 5px', borderRadius: radius.full,
                  minWidth: '16px', textAlign: 'center',
                  lineHeight: '14px',
                }}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 折りたたみトグル（デスクトップのみ） */}
      {!isMobile && onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'サイドバーを展開' : 'サイドバーを折りたたむ'}
          aria-expanded={!collapsed}
          style={{
            margin: '8px',
            padding: '8px',
            borderRadius: radius.md,
            border: 'none',
            background: 'transparent',
            color: color.textDim,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: `all ${transition.fast}`,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = color.textMuted; }}
          onMouseLeave={e => { e.currentTarget.style.color = color.textDim; }}
          title={collapsed ? '展開' : '折りたたみ'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
            style={{ transform: collapsed ? 'rotate(180deg)' : undefined, transition: `transform ${transition.normal}` }}>
            <path d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
          </svg>
        </button>
      )}
    </nav>
  );

  // モバイル: バックドロップ + サイドバー
  if (isMobile) {
    return (
      <>
        {/* バックドロップ */}
        {mobileOpen && (
          <div
            onClick={onMobileClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,.5)',
              backdropFilter: 'blur(2px)',
              zIndex: zIndex.modal - 1,
              transition: `opacity ${transition.fast}`,
            }}
          />
        )}
        {sidebar}
      </>
    );
  }

  return sidebar;
}
