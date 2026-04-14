/**
 * ReviewStars.tsx — Reusable star rating display component
 * Task 8b-5: Review system
 *
 * Props:
 * - rating: number (0-5, supports half-stars)
 * - size: number (default 20)
 * - showCount: boolean
 * - count: number of reviews
 *
 * Used in ReviewForm and product pages
 */

import React, {useId} from 'react';
import {T, al} from '~/lib/astromeda-data';

interface ReviewStarsProps {
  rating: number;
  size?: number;
  showCount?: boolean;
  count?: number;
}

function ReviewStarsComponent({rating, size = 20, showCount = false, count}: ReviewStarsProps) {
  const validRating = Math.min(5, Math.max(0, rating));
  const stars = [];

  for (let i = 1; i <= 5; i++) {
    const starFill = Math.min(1, Math.max(0, validRating - (i - 1)));
    stars.push(
      <Star
        key={i}
        fill={starFill}
        size={size}
      />
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: size * 0.4,
      }}
      aria-label={`${validRating.toFixed(1)}点 / 5点${count ? `（${count}件のレビュー）` : ''}`}
    >
      <div
        style={{
          display: 'flex',
          gap: Math.max(2, size * 0.1),
        }}
      >
        {stars}
      </div>
      {showCount && count !== undefined && count > 0 && (
        <span
          style={{
            fontSize: Math.max(10, size * 0.6),
            color: T.t4,
            marginLeft: size * 0.2,
          }}
        >
          ({count})
        </span>
      )}
    </div>
  );
}

export const ReviewStars = React.memo(ReviewStarsComponent);
ReviewStars.displayName = 'ReviewStars';

/**
 * Single star with partial fill support
 * fill: 0 (empty), 0-1 (partial), 1 (full)
 */
const Star = React.memo(function Star({fill, size}: {fill: number; size: number}) {
  // M5-NEURAL-01 (2026-04-10): Math.random() による id 生成は SSR/CSR で
  // 値が異なり React hydration error #418 を引き起こす。React.useId() は
  // 同一ツリーで決定論的な ID を返すため、SSR と CSR で完全一致する。
  // （胎児の指紋は受精後 10 週で確定する。後から書き換えてはいけない。）
  const id = useId();
  const validFill = Math.min(1, Math.max(0, fill));

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{
        display: 'block',
        flexShrink: 0,
      }}
    >
      {validFill > 0 && validFill < 1 && (
        <defs>
          <linearGradient id={id}>
            <stop offset={`${validFill * 100}%`} stopColor={T.c} />
            <stop offset={`${validFill * 100}%`} stopColor={al(T.c, 0.2)} />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={
          validFill >= 1
            ? T.c
            : validFill > 0
              ? `url(#${id})`
              : al(T.c, 0.15)
        }
      />
    </svg>
  );
});
Star.displayName = 'Star';
