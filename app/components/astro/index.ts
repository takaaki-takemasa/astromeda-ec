/**
 * components/astro/ バレルエクスポート — 皮膚組織の集約点
 *
 * B-021: components/ディレクトリのバレルファイル
 * Astromedaブランド固有のUIコンポーネントを一括 re-export
 * 使用例: import { HeroSlider, CollabGrid, PCShowcase } from '~/components/astro';
 */

// ━━━ レイアウト ━━━
export { AstroHeader } from './AstroHeader';
export { AstroFooter } from './AstroFooter';
export { Breadcrumb } from './Breadcrumb';
export { ResponsiveContainer } from './ResponsiveContainer';
export { Skeleton } from './Skeleton';

// ━━━ トップページ ━━━
export { HeroSlider } from './HeroSlider';
export { CollabGrid } from './CollabGrid';
export { PCShowcase } from './PCShowcase';

// ━━━ 商品 ━━━
export { ProductCustomization } from './ProductCustomization';
export { ProductRating } from './ProductRating';
export { ProductSpecHighlights } from './ProductSpecHighlights';
export { ReviewStars } from './ReviewStars';
export { ReviewForm } from './ReviewForm';
export { ImageZoom } from './ImageZoom';
export { SetupSlider } from './SetupSlider';
export { ShippingEstimate } from './ShippingEstimate';
export { StockIndicator } from './StockIndicator';
export { RelatedProducts } from './RelatedProducts';
export { RelatedGuides } from './RelatedGuides';

// ━━━ カート / 購入 ━━━
export { CartUpsell } from './CartUpsell';
export { CrossSell } from './CrossSell';
export { CartAbandonmentModal } from './CartAbandonmentModal';
export { BackInStockNotify } from './BackInStockNotify';

// ━━━ ユーザー機能 ━━━
export { WishlistButton } from './WishlistButton';
export { WishlistProvider } from './WishlistProvider';
export { RecentlyViewed } from './RecentlyViewed';
export { RecentlyViewedProvider } from './RecentlyViewedProvider';
export { NewsletterSignup } from './NewsletterSignup';
export { PredictiveSearch } from './PredictiveSearch';

// ━━━ ナビゲーション ━━━
export { BlogNav } from './BlogNav';

// ━━━ アナリティクス / 実験 ━━━
export { EcommerceAnalytics } from './EcommerceAnalytics';
export { ABTestWrapper } from './ABTestWrapper';
export { AIReferralBanner } from './AIReferralBanner';

// ━━━ エラーハンドリング ━━━
export { RouteErrorBoundary } from './RouteErrorBoundary';

// ━━━ トースト / 通知 ━━━
export { ToastProvider } from './ToastProvider';
