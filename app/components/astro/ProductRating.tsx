import {T, al} from '~/lib/astromeda-data';

/**
 * 商品レーティング表示コンポーネント
 *
 * Phase 1: メタフィールドから読み込んだ星評価を表示
 * Phase 2（将来）: Shopify Product Reviews / Judge.me API連携
 *
 * 使用メタフィールド（Shopify管理画面で設定）:
 * - product.metafields.custom.rating_value (数値: 1.0〜5.0)
 * - product.metafields.custom.rating_count (数値: レビュー件数)
 */

interface ProductRatingProps {
  /** Star rating (1.0 - 5.0) */
  value?: number | null;
  /** Number of reviews */
  count?: number | null;
  /** Size variant */
  size?: 'sm' | 'md';
}

export function ProductRating({value, count, size = 'md'}: ProductRatingProps) {
  if (!value || value <= 0) return null;

  const rating = Math.min(5, Math.max(0, value));
  const stars = [];
  const starSize = size === 'sm' ? 14 : 18;

  for (let i = 1; i <= 5; i++) {
    if (i <= Math.floor(rating)) {
      stars.push(<Star key={i} fill={1} size={starSize} />);
    } else if (i - rating < 1 && i - rating > 0) {
      stars.push(<Star key={i} fill={rating - Math.floor(rating)} size={starSize} />);
    } else {
      stars.push(<Star key={i} fill={0} size={starSize} />);
    }
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size === 'sm' ? 4 : 6,
      }}
      aria-label={`${rating.toFixed(1)}点 / 5点${count ? `（${count}件のレビュー）` : ''}`}
    >
      <div style={{display: 'flex', gap: 2}}>{stars}</div>
      <span
        style={{
          fontSize: size === 'sm' ? 11 : 13,
          fontWeight: 700,
          color: T.g,
        }}
      >
        {rating.toFixed(1)}
      </span>
      {count != null && count > 0 && (
        <span
          style={{
            fontSize: size === 'sm' ? 10 : 12,
            color: T.t4,
          }}
        >
          ({count})
        </span>
      )}
    </div>
  );
}

/** Single star with partial fill support */
function Star({fill, size}: {fill: number; size: number}) {
  const id = `star-pr-${fill.toFixed(2).replace('.', '-')}-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {fill > 0 && fill < 1 && (
        <defs>
          <linearGradient id={id}>
            <stop offset={`${fill * 100}%`} stopColor={T.g} />
            <stop offset={`${fill * 100}%`} stopColor={al(T.g, 0.2)} />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={
          fill >= 1
            ? T.g
            : fill > 0
            ? `url(#${id})`
            : al(T.g, 0.2)
        }
      />
    </svg>
  );
}

/**
 * 商品カード用のコンパクト星表示
 * グリッド内の各商品カードで使用
 */
export function ProductRatingCompact({
  value,
  count,
}: {
  value?: number | null;
  count?: number | null;
}) {
  return <ProductRating value={value} count={count} size="sm" />;
}
