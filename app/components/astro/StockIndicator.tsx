import {T, al} from '~/lib/astromeda-data';

/**
 * 在庫ステータス表示コンポーネント
 *
 * Shopify Storefront APIのquantityAvailable（要: inventory_levels読み取り権限）
 * またはavailableForSaleフラグに基づいて表示。
 *
 * - 在庫あり（5個以上）: 緑ドット + "在庫あり"
 * - 残り僅か（1〜4個）: 黄ドット + "残りわずか（N点）"
 * - 在庫切れ: 赤ドット + "在庫切れ"
 */

interface StockIndicatorProps {
  /** Whether the product is available for sale */
  availableForSale: boolean;
  /** Quantity available (if exposed by API) */
  quantityAvailable?: number | null;
}

export function StockIndicator({
  availableForSale,
  quantityAvailable,
}: StockIndicatorProps) {
  let status: 'in-stock' | 'low-stock' | 'out-of-stock';
  let label: string;
  let dotColor: string;

  if (!availableForSale) {
    status = 'out-of-stock';
    label = '在庫切れ';
    dotColor = T.r;
  } else if (quantityAvailable != null && quantityAvailable <= 4) {
    status = 'low-stock';
    label = `残りわずか（${quantityAvailable}点）`;
    dotColor = T.g;
  } else {
    status = 'in-stock';
    label = '在庫あり';
    dotColor = '#34C759'; // Apple-style green
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 8,
        background: al(dotColor, 0.08),
        border: `1px solid ${al(dotColor, 0.15)}`,
      }}
      role="status"
      aria-label={label}
    >
      {/* Animated dot */}
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: dotColor,
          boxShadow: status === 'in-stock' ? `0 0 6px ${al(dotColor, 0.5)}` : 'none',
          flexShrink: 0,
        }}
        className={status === 'in-stock' ? 'stock-pulse' : undefined}
      />
      <span
        style={{
          fontSize: 'clamp(10px, 1.2vw, 12px)',
          fontWeight: 600,
          color: dotColor,
        }}
      >
        {label}
      </span>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes stock-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .stock-pulse {
          animation: stock-pulse 2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .stock-pulse { animation: none; }
        }
      `}} />
    </div>
  );
}
