/**
 * Admin Dashboard Mobile Optimization Utilities (P10: T092-T093)
 * Touch targets: min-height 48px, min-width 48px
 * Responsive grids: mobile 1-col, tablet 2-col, desktop 3+ col
 */

export const TOUCH_TARGET_SIZE = 48; // pixels (WAI-ARIA minimum)

/**
 * Responsive grid template columns based on viewport width
 * Mobile (< 640px): 1 column
 * Tablet (640-1024px): 2 columns
 * Desktop (> 1024px): 3+ columns
 */
export function getResponsiveGridColumns(): string {
  if (typeof window === 'undefined') return 'repeat(3, 1fr)'; // SSR default
  const width = window.innerWidth;
  if (width < 640) return '1fr';
  if (width < 1024) return 'repeat(2, 1fr)';
  return 'repeat(auto-fit, minmax(250px, 1fr))';
}

/**
 * Media query breakpoints for inline styles
 * Usage: wrap style objects with conditional media queries
 */
export const breakpoints = {
  mobile: 640,     // xs: < 640px
  tablet: 1024,    // md: 640px-1024px
  desktop: 1280,   // lg: >= 1024px
};

/**
 * Helper to create touch-friendly button styles
 */
export const touchButtonStyles = {
  minHeight: TOUCH_TARGET_SIZE,
  minWidth: TOUCH_TARGET_SIZE,
  padding: '10px 16px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
  transition: 'all 0.2s ease',
};

/**
 * Helper to create responsive grid layout
 * Mobile: 1 col, Tablet: 2 col, Desktop: 3+ col
 */
export function createResponsiveGrid(
  isMobile: boolean,
  isTablet: boolean
): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: 12,
    transition: 'grid-template-columns 0.3s ease',
  };
}

/**
 * Hamburger menu styles for mobile admin sidebar
 */
export const hamburgerStyles = {
  button: {
    minWidth: TOUCH_TARGET_SIZE,
    minHeight: TOUCH_TARGET_SIZE,
    padding: '8px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  bar: {
    height: '2px',
    width: '20px',
    margin: '4px 0',
    transition: 'all 0.3s ease',
  },
};

/**
 * Hook to detect viewport size (client-only)
 * Must be called from client component
 */
export function useViewportSize() {
  // This requires React client context
  // Use conditionally in components with 'use client'
  if (typeof window === 'undefined') {
    return {
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      width: 1024,
    };
  }

  // For client-side usage, components should use this pattern:
  // const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  // useEffect(() => { ... }, []);

  return {
    isMobile: window.innerWidth < breakpoints.mobile,
    isTablet: window.innerWidth >= breakpoints.mobile && window.innerWidth < breakpoints.desktop,
    isDesktop: window.innerWidth >= breakpoints.desktop,
    width: window.innerWidth,
  };
}
