/**
 * GA4 & AI Tracking — Quick Reference
 *
 * このファイルはドキュメントではなく、実装例としてのクイックリファレンスです。
 * 実際の実装時にコピーペーストして利用してください。
 */

// ============================================================
// 1. IMPORTS — 必要なインポート
// ============================================================

import {
  trackViewItem,
  trackViewItemList,
  trackSelectItem,
  trackAddToCart,
  trackRemoveFromCart,
  trackViewCart,
  trackBeginCheckout,
  trackPurchase,
  trackSearch,
  trackViewPromotion,
  trackSelectPromotion,
  trackShare,
  trackGenerateLead,
  trackCustomEvent,
  isAnalyticsEnabled,
  setUserProperty,
  setUserId,
} from '~/lib/ga4-events';

import {
  trackAIReferralIfExists,
  detectAIReferral,
  trackAIReferral,
  getAISourceDisplayName,
  isAIReferralAlreadyTracked,
} from '~/lib/ai-referrer-tracker';

import {AIReferralBanner} from '~/components/astro/AIReferralBanner';

// ============================================================
// 2. ROOT LAYOUT — ルートレイアウトでの初期化
// ============================================================

/*
// app/root.tsx または app/routes/_layout.tsx

import { useEffect } from 'react';

export default function Root() {
  useEffect(() => {
    // AI referral を自動検出・追跡
    trackAIReferralIfExists();
  }, []);

  return (
    <html>
      <body>
        <AIReferralBanner />
        {/* その他のコンテンツ */}
      </body>
    </html>
  );
}
*/

// ============================================================
// 3. PRODUCT PAGE — 商品詳細ページ
// ============================================================

/*
// app/routes/products.$handle.tsx

import { useEffect } from 'react';
import { trackViewItem, trackShare, trackAddToCart } from '~/lib/ga4-events';

export default function ProductPage({ product }) {
  // 商品ページ表示時
  useEffect(() => {
    trackViewItem({
      id: product.id,
      title: product.title,
      vendor: product.vendor,
      productType: product.productType,
      variantPrice: product.selectedVariant?.price?.amount,
      variantTitle: product.selectedVariant?.title,
      currency: 'JPY',
    });
  }, [product.id]);

  // 「カートに入れる」ボタンクリック時
  function handleAddToCart(quantity: number) {
    trackAddToCart({
      id: product.id,
      title: product.title,
      price: product.selectedVariant?.price?.amount,
      quantity,
      variant: product.selectedVariant?.title,
      currency: 'JPY',
    });
    // カート追加処理...
  }

  // 「シェア」ボタンクリック時
  function handleShare(platform: string) {
    trackShare({
      content_type: 'product',
      item_id: product.id,
      method: platform, // 'twitter', 'facebook', 'line'
    });
    // 実際のシェア処理...
  }

  return (
    <div>
      {/* Product details */}
      <button onClick={() => handleAddToCart(1)}>カートに入れる</button>
      <button onClick={() => handleShare('twitter')}>X でシェア</button>
    </div>
  );
}
*/

// ============================================================
// 4. COLLECTION PAGE — コレクション/カテゴリページ
// ============================================================

/*
// app/routes/collections.$handle.tsx

import { useEffect } from 'react';
import { trackViewItemList, trackSelectItem } from '~/lib/ga4-events';

export default function CollectionPage({ collection }) {
  // コレクション表示時
  useEffect(() => {
    trackViewItemList(
      collection.title,
      collection.products.map(p => ({
        id: p.id,
        title: p.title,
        price: p.priceRange?.minVariantPrice?.amount,
        vendor: p.vendor,
      }))
    );
  }, [collection.id]);

  // 商品クリック時
  function handleProductClick(product, index: number) {
    trackSelectItem(
      collection.title,
      {
        id: product.id,
        title: product.title,
        price: product.priceRange?.minVariantPrice?.amount,
        index,
      }
    );
    // ナビゲート処理...
  }

  return (
    <div>
      {collection.products.map((product, i) => (
        <div key={product.id} onClick={() => handleProductClick(product, i)}>
          {product.title}
        </div>
      ))}
    </div>
  );
}
*/

// ============================================================
// 5. SEARCH PAGE — 検索結果ページ
// ============================================================

/*
// app/routes/search.tsx

import { useEffect } from 'react';
import { trackSearch, trackViewItemList } from '~/lib/ga4-events';

export default function SearchPage() {
  const searchTerm = new URLSearchParams(window.location.search).get('q') || '';
  const results = useSearch(searchTerm);

  useEffect(() => {
    if (searchTerm) {
      trackSearch(searchTerm);
      trackViewItemList(
        `Search: ${searchTerm}`,
        results.products.map(p => ({
          id: p.id,
          title: p.title,
          price: p.price,
          vendor: p.vendor,
        }))
      );
    }
  }, [searchTerm]);

  return (
    <div>
      {/* Search results */}
    </div>
  );
}
*/

// ============================================================
// 6. HERO SLIDER — ホームページバナー
// ============================================================

/*
// app/components/astro/HeroSlider.tsx

import { useEffect } from 'react';
import { trackViewPromotion, trackSelectPromotion } from '~/lib/ga4-events';

export function HeroSlider() {
  useEffect(() => {
    // バナー表示（インプレッション）
    trackViewPromotion({
      promotion_name: 'Spring Campaign 2026',
      creative_name: 'Hero Slider',
      creative_slot: 'homepage-hero',
    });
  }, []);

  function handleSlideClick(slideIndex: number) {
    // バナークリック
    trackSelectPromotion({
      promotion_name: 'Spring Campaign 2026',
      creative_name: `Hero Slide ${slideIndex + 1}`,
      creative_slot: 'homepage-hero',
    });
    // ナビゲート処理...
  }

  return (
    <div>
      {/* Slider content */}
    </div>
  );
}
*/

// ============================================================
// 7. NEWSLETTER SIGNUP — ニュースレター登録
// ============================================================

/*
// app/components/astro/NewsletterSignup.tsx

import { trackGenerateLead } from '~/lib/ga4-events';

export function NewsletterSignup() {
  async function handleSubmit(email: string) {
    trackGenerateLead({
      lead_type: 'newsletter',
      value: 0, // Optional: lead value in JPY
    });

    // 登録処理...
    await fetch('/api/newsletter', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  return (
    <form onSubmit={(e) => handleSubmit(e.target.email.value)}>
      {/* Newsletter form */}
    </form>
  );
}
*/

// ============================================================
// 8. CART PAGE — カートページ
// ============================================================

/*
// app/routes/cart.tsx

import { useEffect } from 'react';
import { trackViewCart } from '~/lib/ga4-events';

export default function CartPage({ cart }) {
  useEffect(() => {
    trackViewCart({
      totalAmount: cart.totalAmount,
      currency: 'JPY',
      items: cart.lines.map(line => ({
        id: line.merchandise.product.id,
        title: line.merchandise.product.title,
        price: line.merchandise.price?.amount,
        quantity: line.quantity,
      })),
    });
  }, [cart.id]);

  return (
    <div>
      {/* Cart items */}
    </div>
  );
}
*/

// ============================================================
// 9. CHECKOUT PAGE — チェックアウトページ
// ============================================================

/*
// app/routes/checkout.tsx

import { trackBeginCheckout } from '~/lib/ga4-events';

export default function CheckoutPage({ cart }) {
  function handleCheckoutClick() {
    trackBeginCheckout({
      totalAmount: cart.totalAmount,
      currency: 'JPY',
      lines: cart.lines.map(line => ({
        id: line.merchandise.product.id,
        title: line.merchandise.product.title,
        price: line.merchandise.price?.amount,
        quantity: line.quantity,
      })),
    });

    // チェックアウトフロー開始...
  }

  return (
    <div>
      <button onClick={handleCheckoutClick}>チェックアウトに進む</button>
    </div>
  );
}
*/

// ============================================================
// 10. THANK YOU PAGE — サンクスページ（最重要）
// ============================================================

/*
// app/routes/thank-you.$orderId.tsx

import { useEffect } from 'react';
import { trackPurchase, setUserId } from '~/lib/ga4-events';

export default function ThankYouPage({ order, customer }) {
  useEffect(() => {
    // 購入完了イベント（最重要 — ROI計測の命）
    trackPurchase({
      orderId: order.id,
      totalAmount: order.totalPrice?.amount,
      tax: order.totalTax?.amount,
      shipping: order.shippingLine?.price?.amount,
      currency: 'JPY',
      coupon: order.discountCode || undefined,
      items: order.lineItems.map(item => ({
        id: item.id,
        title: item.title,
        price: item.price?.amount,
        quantity: item.quantity,
        variant: item.variant?.title,
        category: item.product?.productType,
      })),
    });

    // 顧客ID設定（リピート分析用）
    if (customer?.id) {
      setUserId(customer.id.replace('gid://shopify/Customer/', ''));
    }
  }, [order.id]);

  return (
    <div>
      <h1>注文ありがとうございます</h1>
      <p>Order #{order.name}</p>
    </div>
  );
}
*/

// ============================================================
// 11. AI REFERRAL CHECK — デバッグ用
// ============================================================

/*
// ブラウザコンソール実行

// 1. AI referralが検出されたか確認
const referral = detectAIReferral();
process.env.NODE_ENV === 'development' && console.log('AI Referral:', referral);

// 2. セッション中にすでに追跡されているか確認
process.env.NODE_ENV === 'development' && console.log('Already tracked:', isAIReferralAlreadyTracked());

// 3. SessionStorageの状態確認
process.env.NODE_ENV === 'development' && console.log({
  aiReferralTracked: sessionStorage.getItem('astromeda_ai_referral_tracked'),
  bannerDismissed: sessionStorage.getItem('astromeda_ai_banner_dismissed'),
});

// 4. GA4がロードされているか確認
process.env.NODE_ENV === 'development' && console.log('GA4 available:', typeof window.gtag === 'function');

// 5. GA4イベントログを見る（Vite dev mode の場合）
window.localStorage.setItem('debug', '*');
*/

// ============================================================
// 12. CUSTOM EVENT — カスタムイベント例
// ============================================================

/*
import { trackCustomEvent } from '~/lib/ga4-events';

// 任意のカスタムイベント送信
trackCustomEvent('custom_action', {
  action_type: 'video_play',
  video_id: 'promo_2026',
  video_title: 'Astromeda Spring Showcase',
});
*/

// ============================================================
// SUMMARY — まとめ
// ============================================================

/*
✓ 基本的なecommerce追跡: trackViewItem, trackAddToCart, trackPurchase
✓ ファネル分析: trackViewCart, trackBeginCheckout
✓ プロモーション: trackViewPromotion, trackSelectPromotion
✓ エンゲージメント: trackShare, trackGenerateLead, trackSearch
✓ AI referral: trackAIReferralIfExists() + AIReferralBanner
✓ デバッグ: NODE_ENV=development でコンソールログ表示

チェックリスト:
□ 商品ページに trackViewItem を実装
□ コレクションページに trackViewItemList を実装
□ 「カートに入れる」に trackAddToCart を実装
□ カートページに trackViewCart を実装
□ チェックアウトに trackBeginCheckout を実装
□ サンクスページに trackPurchase を実装 ⭐ 最重要
□ ホームページに AIReferralBanner を配置
□ ページロード時に trackAIReferralIfExists() を呼び出し
□ GA4管理画面で ai_citation イベントを登録
*/
