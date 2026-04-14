import React, {createContext, useContext, useState, useCallback, useEffect} from 'react';

const STORAGE_KEY = 'astromeda_recently_viewed';
const MAX_RECENTLY_VIEWED = 10;

interface RecentlyViewedItem {
  handle: string;
  title?: string;
  imageUrl?: string;
  price?: string;
  viewedAt: number;
}

interface RecentlyViewedContextType {
  recentlyViewed: RecentlyViewedItem[];
  addViewed: (item: RecentlyViewedItem | string) => void;
  getRecentlyViewed: () => RecentlyViewedItem[];
  clearRecentlyViewed: () => void;
}

const RecentlyViewedContext = createContext<RecentlyViewedContextType | undefined>(
  undefined
);

/**
 * localStorageから安全に読み込み（SSR対応）
 * 循環系 — 最近見た商品の記憶を維持
 */
function loadFromStorage(): RecentlyViewedItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      // v1互換: string[]からの移行対応
      return parsed.map((item: unknown) => {
        if (typeof item === 'string') {
          return {handle: item, viewedAt: 0};
        }
        if (typeof item === 'object' && item !== null && 'handle' in item) {
          return item as RecentlyViewedItem;
        }
        return {handle: '', viewedAt: 0};
      });
    }
    return [];
  } catch {
    return [];
  }
}

function saveToStorage(items: RecentlyViewedItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage full or unavailable — silent fail
  }
}

export function RecentlyViewedProvider({children}: {children: React.ReactNode}) {
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // クライアントサイドでlocalStorageから復元
  useEffect(() => {
    const stored = loadFromStorage();
    if (stored.length > 0) {
      setRecentlyViewed(stored);
    }
    setHydrated(true);
  }, []);

  // 変更をlocalStorageに同期（初回ハイドレーション後のみ）
  useEffect(() => {
    if (hydrated) {
      saveToStorage(recentlyViewed);
    }
  }, [recentlyViewed, hydrated]);

  const addViewed = useCallback((input: RecentlyViewedItem | string) => {
    if (!input) return; // Null/undefined guard

    const item: RecentlyViewedItem =
      typeof input === 'string'
        ? {handle: input, viewedAt: Date.now()}
        : {...input, viewedAt: Date.now()};

    setRecentlyViewed((prev) => {
      // 重複除去
      const filtered = prev.filter((h) => h.handle !== item.handle);
      // 先頭に追加
      const updated = [item, ...filtered];
      // 上限まで
      return updated.slice(0, MAX_RECENTLY_VIEWED);
    });
  }, []);

  const getRecentlyViewed = useCallback((): RecentlyViewedItem[] => {
    return recentlyViewed;
  }, [recentlyViewed]);

  const clearRecentlyViewed = useCallback(() => {
    setRecentlyViewed([]);
  }, []);

  const value: RecentlyViewedContextType = {
    recentlyViewed,
    addViewed,
    getRecentlyViewed,
    clearRecentlyViewed,
  };

  return (
    <RecentlyViewedContext.Provider value={value}>
      {children}
    </RecentlyViewedContext.Provider>
  );
}

export function useRecentlyViewed(): RecentlyViewedContextType {
  const context = useContext(RecentlyViewedContext);
  if (!context) {
    throw new Error('useRecentlyViewed must be used within RecentlyViewedProvider');
  }
  return context;
}
