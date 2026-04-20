import React from 'react';

/**
 * Admin Skeleton primitive (patch 0071 R1-2)
 * Stripe Dashboard 方式: 何が来るかの形が事前に見える progressive disclosure。
 * Spinner の「ぐるぐる」は何が読み込まれているかが伝わらないため置換する。
 *
 * 使い方:
 *   <Suspense fallback={<TabLoadingSkeleton label="商品管理" />}>
 *     <AdminProducts />
 *   </Suspense>
 */

interface SkeletonBarProps {
  width?: string;
  height?: string;
  radius?: string;
  style?: React.CSSProperties;
}

const stylesId = 'admin-ds-skeleton-keyframes';

function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(stylesId)) return;
  const el = document.createElement('style');
  el.id = stylesId;
  el.textContent = `
    @keyframes adminShimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .admin-ds-skeleton {
      background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 40%, rgba(255,255,255,0.04) 80%);
      background-size: 200% 100%;
      animation: adminShimmer 1.6s ease-in-out infinite;
      border-radius: 8px;
    }
    @media (prefers-reduced-motion: reduce) {
      .admin-ds-skeleton { animation: none; background: rgba(255,255,255,0.06); }
    }
  `;
  document.head.appendChild(el);
}

export const SkeletonBar = React.memo(function SkeletonBar({
  width = '100%',
  height = '14px',
  radius = '8px',
  style,
}: SkeletonBarProps) {
  React.useEffect(() => {
    ensureStyles();
  }, []);
  return (
    <div
      className="admin-ds-skeleton"
      style={{width, height, borderRadius: radius, ...style}}
      aria-hidden="true"
    />
  );
});

/** タブ切替時の Suspense fallback。テーブル型 / カード型の両方に耐える汎用レイアウト */
export const TabLoadingSkeleton = React.memo(function TabLoadingSkeleton({label}: {label?: string}) {
  React.useEffect(() => {
    ensureStyles();
  }, []);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label ? `${label}を読み込み中` : '読み込み中'}
      style={{padding: '8px 0 24px', display: 'flex', flexDirection: 'column', gap: 16}}
    >
      {/* header */}
      <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
        <SkeletonBar width="220px" height="24px" />
        <SkeletonBar width="80px" height="24px" radius="999px" />
      </div>
      {/* filter / toolbar row */}
      <div style={{display: 'flex', gap: 8}}>
        <SkeletonBar width="180px" height="32px" />
        <SkeletonBar width="120px" height="32px" />
        <SkeletonBar width="120px" height="32px" />
      </div>
      {/* table rows */}
      <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
        {Array.from({length: 6}, (_, i) => (
          <div key={i} style={{display: 'flex', gap: 12, alignItems: 'center'}}>
            <SkeletonBar width="48px" height="48px" radius="12px" />
            <SkeletonBar width="40%" height="14px" />
            <SkeletonBar width="15%" height="14px" />
            <SkeletonBar width="10%" height="14px" />
            <SkeletonBar width="80px" height="28px" radius="8px" />
          </div>
        ))}
      </div>
      <span style={{position: 'absolute', left: -9999}}>読み込み中</span>
    </div>
  );
});
