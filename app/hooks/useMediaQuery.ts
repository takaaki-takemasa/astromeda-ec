/**
 * useMediaQuery — レスポンシブ対応フック（神経系：環境感覚器）
 * 画面幅に応じてUIを適応させるためのカスタムフック
 */
import { useState, useEffect } from 'react';

/**
 * メディアクエリにマッチしているかを返す
 * SSR安全: サーバーサイドでは常に false を返す
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/**
 * よく使うブレークポイントのショートカット
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}

export function useIsTablet(): boolean {
  return useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
}

export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}
