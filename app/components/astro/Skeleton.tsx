import React from 'react';
import {T, al} from '~/lib/astromeda-data';

/**
 * Skeleton loading placeholder — shimmer animation using CSS keyframes.
 * Supports various shapes for product cards, text, images, etc.
 */

interface SkeletonProps {
  /** Width of the skeleton (CSS value) */
  width?: string;
  /** Height of the skeleton (CSS value) */
  height?: string;
  /** Border radius (CSS value) */
  radius?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
}

const Skeleton = React.memo(function Skeleton({
  width = '100%',
  height = '16px',
  radius = '8px',
  style,
}: SkeletonProps) {
  return (
    <>
      <div
        className="astro-skeleton"
        style={{
          width,
          height,
          borderRadius: radius,
          ...style,
        }}
      />
      <SkeletonStyles />
    </>
  );
});
Skeleton.displayName = 'Skeleton';

export {Skeleton};

/** Product card skeleton — image + title + price */
const ProductCardSkeleton = React.memo(function ProductCardSkeleton() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
      <Skeleton height="0" style={{paddingBottom: '100%'}} radius="12px" />
      <Skeleton width="70%" height="14px" />
      <Skeleton width="40%" height="14px" />
    </div>
  );
});
ProductCardSkeleton.displayName = 'ProductCardSkeleton';

export {ProductCardSkeleton};

/** Grid of product card skeletons */
const ProductGridSkeleton = React.memo(function ProductGridSkeleton({count = 4}: {count?: number}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 'clamp(12px, 2vw, 20px)',
        padding: 'clamp(12px, 2vw, 20px)',
      }}
    >
      {Array.from({length: count}, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
});
ProductGridSkeleton.displayName = 'ProductGridSkeleton';

export {ProductGridSkeleton};

/** Hero banner skeleton */
const HeroSkeleton = React.memo(function HeroSkeleton() {
  return (
    <div style={{padding: '12px 12px 0'}}>
      <Skeleton
        height="min(56.25vw, 240px)"
        radius="12px"
      />
    </div>
  );
});
HeroSkeleton.displayName = 'HeroSkeleton';

export {HeroSkeleton};

/** Single shared <style> tag — deduplication-safe since CSS is idempotent */
let stylesInjected = false;

function SkeletonStyles() {
  if (stylesInjected) return null;
  stylesInjected = true;

  return (
    <style dangerouslySetInnerHTML={{__html: `
      .astro-skeleton {
        background: linear-gradient(
          90deg,
          ${al(T.c, 0.04)} 0%,
          ${al(T.c, 0.08)} 40%,
          ${al(T.c, 0.04)} 80%
        );
        background-size: 200% 100%;
        animation: astro-shimmer 1.6s ease-in-out infinite;
      }
      @keyframes astro-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        .astro-skeleton {
          animation: none;
          background: ${al(T.c, 0.06)};
        }
      }
    `}} />
  );
}
