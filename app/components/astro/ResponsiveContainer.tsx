/**
 * ResponsiveContainer — レスポンシブ対応コンテナ
 *
 * 医学メタファー: 環境適応能力（体温調節、瞳孔調整）
 * デバイスの画面幅に応じてレイアウトを自動調整する。
 * モバイル→タブレット→デスクトップの3段階適応。
 *
 * ブレークポイント:
 * - mobile: < 640px (スマートフォン)
 * - tablet: 640px - 1024px (タブレット)
 * - desktop: > 1024px (デスクトップ)
 */

import type { CSSProperties, ReactNode } from 'react';

interface ResponsiveContainerProps {
  children: ReactNode;
  /** 最大幅 (デフォルト: 1400px) */
  maxWidth?: number;
  /** 左右パディング (デフォルト: clamp適用) */
  padding?: string;
  /** 追加スタイル */
  style?: CSSProperties;
  /** HTML要素 (デフォルト: div) */
  as?: 'div' | 'section' | 'main' | 'article';
  /** className */
  className?: string;
}

export function ResponsiveContainer({
  children,
  maxWidth = 1400,
  padding,
  style,
  as: Tag = 'div',
  className,
}: ResponsiveContainerProps) {
  return (
    <Tag
      className={className}
      style={{
        width: '100%',
        maxWidth: `${maxWidth}px`,
        marginLeft: 'auto',
        marginRight: 'auto',
        paddingLeft: padding ?? 'clamp(12px, 3vw, 48px)',
        paddingRight: padding ?? 'clamp(12px, 3vw, 48px)',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

/**
 * ResponsiveGrid — レスポンシブグリッドレイアウト
 *
 * auto-fitとminmaxを使って自動的にカラム数を調整。
 * CSSメディアクエリ不要でレスポンシブに対応。
 */
interface ResponsiveGridProps {
  children: ReactNode;
  /** 最小カラム幅 (デフォルト: 280px) */
  minColumnWidth?: number;
  /** カラム間ギャップ (デフォルト: clamp適用) */
  gap?: string;
  /** 追加スタイル */
  style?: CSSProperties;
  className?: string;
}

export function ResponsiveGrid({
  children,
  minColumnWidth = 280,
  gap,
  style,
  className,
}: ResponsiveGridProps) {
  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${minColumnWidth}px, 100%), 1fr))`,
        gap: gap ?? 'clamp(8px, 2vw, 24px)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * レスポンシブユーティリティCSS変数の定義
 * app.cssに追加するための定数
 */
export const RESPONSIVE_CSS_VARS = `
/* Astromeda Responsive System (P13) */
:root {
  --astro-container-max: 1400px;
  --astro-gutter: clamp(12px, 3vw, 48px);
  --astro-gap-sm: clamp(4px, 1vw, 8px);
  --astro-gap-md: clamp(8px, 2vw, 16px);
  --astro-gap-lg: clamp(16px, 3vw, 32px);
  --astro-font-xs: clamp(10px, 1.2vw, 12px);
  --astro-font-sm: clamp(12px, 1.4vw, 14px);
  --astro-font-md: clamp(14px, 1.8vw, 18px);
  --astro-font-lg: clamp(18px, 2.5vw, 28px);
  --astro-font-xl: clamp(24px, 4vw, 48px);
  --astro-font-hero: clamp(32px, 6vw, 72px);
}
`;
