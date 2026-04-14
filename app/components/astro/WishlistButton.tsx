import React, {useState} from 'react';
import {T, al} from '~/lib/astromeda-data';
import {useWishlist} from './WishlistProvider';

interface WishlistButtonProps {
  productHandle: string;
  size?: 'small' | 'medium' | 'large';
}

export function WishlistButton({
  productHandle,
  size = 'medium',
}: WishlistButtonProps) {
  const {isInWishlist, addToWishlist, removeFromWishlist} = useWishlist();
  const inWishlist = isInWishlist(productHandle);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);

    if (inWishlist) {
      removeFromWishlist(productHandle);
    } else {
      addToWishlist(productHandle);
    }
  };

  const sizeMap = {
    small: 24,
    medium: 32,
    large: 40,
  };

  const size_px = sizeMap[size];

  return (
    <button
      onClick={handleClick}
      type="button"
      aria-label={inWishlist ? 'ウィッシュリストから削除' : 'ウィッシュリストに追加'}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        transform: isAnimating ? 'scale(1.3)' : 'scale(1)',
      }}
    >
      <svg
        width={size_px}
        height={size_px}
        viewBox="0 0 24 24"
        fill={inWishlist ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          color: inWishlist ? T.r : al(T.tx, 0.6),
          transition: 'color 0.3s ease, filter 0.3s ease',
          filter: inWishlist ? `drop-shadow(0 0 8px ${al(T.r, 0.4)})` : 'none',
        }}
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
      </svg>
    </button>
  );
}
