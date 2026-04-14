import React, {createContext, useContext, useState, useCallback, useEffect} from 'react';

const STORAGE_KEY = 'astromeda_wishlist';
const MAX_WISHLIST = 200;

interface WishlistContextType {
  wishlist: Set<string>;
  addToWishlist: (handle: string) => void;
  removeFromWishlist: (handle: string) => void;
  isInWishlist: (handle: string) => boolean;
  getWishlistItems: () => string[];
  clearWishlist: () => void;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

/**
 * localStorageから安全に読み込み（SSR対応）
 * 循環系（血液=データ）が途切れないよう永続化
 */
function loadFromStorage(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return new Set(parsed as string[]);
    return new Set();
  } catch {
    return new Set();
  }
}

function saveToStorage(items: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(items)));
  } catch {
    // localStorage full or unavailable — silent fail
  }
}

export function WishlistProvider({children}: {children: React.ReactNode}) {
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  // クライアントサイドでlocalStorageから復元（SSRハイドレーション後）
  useEffect(() => {
    const stored = loadFromStorage();
    if (stored.size > 0) {
      setWishlist(stored);
    }
    setHydrated(true);
  }, []);

  // 変更をlocalStorageに同期（初回ハイドレーション後のみ）
  useEffect(() => {
    if (hydrated) {
      saveToStorage(wishlist);
    }
  }, [wishlist, hydrated]);

  const addToWishlist = useCallback((handle: string) => {
    setWishlist((prev) => {
      // Don't add if already at max capacity
      if (prev.size >= MAX_WISHLIST && !prev.has(handle)) {
        return prev; // Return unchanged, silently reject
      }
      const newSet = new Set(prev);
      newSet.add(handle);
      return newSet;
    });
  }, []);

  const removeFromWishlist = useCallback((handle: string) => {
    setWishlist((prev) => {
      const newSet = new Set(prev);
      newSet.delete(handle);
      return newSet;
    });
  }, []);

  const isInWishlist = useCallback(
    (handle: string): boolean => {
      return wishlist.has(handle);
    },
    [wishlist]
  );

  const getWishlistItems = useCallback((): string[] => {
    return Array.from(wishlist);
  }, [wishlist]);

  const clearWishlist = useCallback(() => {
    setWishlist(new Set());
  }, []);

  const value: WishlistContextType = {
    wishlist,
    addToWishlist,
    removeFromWishlist,
    isInWishlist,
    getWishlistItems,
    clearWishlist,
  };

  return (
    <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
  );
}

export function useWishlist(): WishlistContextType {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used within WishlistProvider');
  }
  return context;
}
