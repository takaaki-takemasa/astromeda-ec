# CRO Tracking Integration Examples

実装例を示すドキュメント。これらを参考に、各ページ/コンポーネントにイベント追跡を統合します。

---

## 1. ルートレイアウト初期化

### app/root.tsx

```typescript
import { useEffect } from 'react';
import { AIReferralBanner } from '~/components/astro/AIReferralBanner';
import { trackAIReferralIfExists } from '~/lib/ai-referrer-tracker';

export default function Root() {
  useEffect(() => {
    // ページロード時にAI referralを検出・追跡
    trackAIReferralIfExists();
  }, []);

  return (
    <html>
      <head>
        {/* GA4タグはここにロード */}
      </head>
      <body>
        {/* AIReferralBannerをトップに配置 */}
        <AIReferralBanner />
        
        {/* その他のレイアウト */}
      </body>
    </html>
  );
}
```

---

## 2. ホームページ（HeroSlider）

### app/routes/_index.tsx & HeroSlider.tsx

```typescript
// HeroSlider.tsx
import { useEffect } from 'react';
import { trackViewPromotion, trackSelectPromotion } from '~/lib/ga4-events';

export function HeroSlider() {
  const [currentSlide, setCurrentSlide] = useState(0);

  // スライダー表示時（各スライド = プロモ）
  useEffect(() => {
    trackViewPromotion({
      promotion_id: `hero-slide-${currentSlide}`,
      promotion_name: 'Spring Campaign 2026',
      creative_name: `Hero Slide ${currentSlide + 1}`,
      creative_slot: 'homepage-hero',
      location_id: 'top',
    });
  }, [currentSlide]);

  function handleSlideClick() {
    // スライド→外部ページへのクリック
    trackSelectPromotion({
      promotion_id: `hero-slide-${currentSlide}`,
      promotion_name: 'Spring Campaign 2026',
      creative_name: `Hero Slide ${currentSlide + 1}`,
      creative_slot: 'homepage-hero',
    });

    // リンク遷移処理
    window.location.href = '/collections/spring-2026';
  }

  return (
    <div onClick={handleSlideClick}>
      {/* Slider content */}
    </div>
  );
}
```

---

## 3. 商品詳細ページ

### app/routes/products.$handle.tsx

```typescript
import { useEffect, useState } from 'react';
import { useLoaderData, useNavigate } from 'react-router';
import {
  trackViewItem,
  trackAddToCart,
  trackShare,
} from '~/lib/ga4-events';

export default function ProductPage() {
  const { product } = useLoaderData();
  const [quantity, setQuantity] = useState(1);

  // 商品ページロード時
  useEffect(() => {
    trackViewItem({
      id: product.id,
      title: product.title,
      vendor: product.vendor || 'ASTROMEDA',
      productType: product.productType,
      variantPrice: product.selectedVariant?.price?.amount,
      variantTitle: product.selectedVariant?.title,
      currency: 'JPY',
    });
  }, [product.id]);

  // 「カートに入れる」ボタン
  async function handleAddToCart() {
    trackAddToCart({
      id: product.id,
      title: product.title,
      price: product.selectedVariant?.price?.amount,
      quantity,
      variant: product.selectedVariant?.title,
      currency: 'JPY',
    });

    // 実装: Shopify Cart API呼び出し
    const response = await fetch('/api/cart', {
      method: 'POST',
      body: JSON.stringify({
        variantId: product.selectedVariant?.id,
        quantity,
      }),
    });

    if (response.ok) {
      // トーストメッセージ表示など
      showNotification('カートに追加しました');
    }
  }

  // 「シェア」ボタン（Twitter/Facebook/LINE）
  async function handleShare(platform: 'twitter' | 'facebook' | 'line') {
    trackShare({
      content_type: 'product',
      item_id: product.id,
      method: platform,
    });

    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(`${product.title} - ASTROMEDA`);

    const shareUrls = {
      twitter: `https://x.com/intent/tweet?url=${url}&text=${text}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      line: `https://line.me/R/msg/text/?${text}%0A${url}`,
    };

    window.open(shareUrls[platform], '_blank', 'width=600,height=400');
  }

  return (
    <div>
      <h1>{product.title}</h1>
      <p>¥{product.selectedVariant?.price?.amount}</p>

      <div>
        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(parseInt(e.target.value))}
        />
      </div>

      <button onClick={handleAddToCart} style={{ background: '#00F0FF' }}>
        カートに入れる
      </button>

      <div style={{ marginTop: 20 }}>
        <button onClick={() => handleShare('twitter')}>X でシェア</button>
        <button onClick={() => handleShare('facebook')}>Facebook でシェア</button>
        <button onClick={() => handleShare('line')}>LINE で共有</button>
      </div>
    </div>
  );
}
```

---

## 4. コレクション/カテゴリページ

### app/routes/collections.$handle.tsx

```typescript
import { useEffect, useState } from 'react';
import { useLoaderData, Link } from 'react-router';
import { trackViewItemList, trackSelectItem } from '~/lib/ga4-events';

export default function CollectionPage() {
  const { collection } = useLoaderData();

  // コレクション表示時
  useEffect(() => {
    trackViewItemList(
      collection.title, // e.g. "IPコラボレーション", "ガジェット"
      collection.products.map((p) => ({
        id: p.id,
        title: p.title,
        price: p.priceRange?.minVariantPrice?.amount,
        vendor: p.vendor || 'ASTROMEDA',
      }))
    );
  }, [collection.id]);

  // 商品グリッドをクリック時
  function handleProductClick(product, index) {
    trackSelectItem(
      collection.title,
      {
        id: product.id,
        title: product.title,
        price: product.priceRange?.minVariantPrice?.amount,
        index, // グリッド内の位置（GA4ファネル分析用）
      }
    );

    // ナビゲート（フレームワークにより異なる）
    // navigate(`/products/${product.handle}`);
  }

  return (
    <div>
      <h1>{collection.title}</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
        {collection.products.map((product, index) => (
          <div
            key={product.id}
            onClick={() => handleProductClick(product, index)}
            style={{ cursor: 'pointer' }}
          >
            <img src={product.image?.url} alt={product.title} />
            <h3>{product.title}</h3>
            <p>¥{product.priceRange?.minVariantPrice?.amount}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 5. 検索結果ページ

### app/routes/search.tsx

```typescript
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { trackSearch, trackViewItemList } from '~/lib/ga4-events';

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const searchTerm = searchParams.get('q') || '';
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (!searchTerm) return;

    // 1. 検索クエリを記録
    trackSearch(searchTerm);

    // 2. 検索結果を取得
    fetchSearchResults(searchTerm).then((products) => {
      setResults(products);

      // 3. 検索結果一覧を記録（ファネル分析用）
      trackViewItemList(
        `Search: ${searchTerm}`,
        products.map((p) => ({
          id: p.id,
          title: p.title,
          price: p.price,
          vendor: p.vendor,
        }))
      );
    });
  }, [searchTerm]);

  return (
    <div>
      <h1>検索結果: "{searchTerm}"</h1>
      <p>{results.length} 件見つかりました</p>

      <div>
        {results.map((product) => (
          <div key={product.id}>
            <h3>{product.title}</h3>
            <p>¥{product.price}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 6. カートページ

### app/routes/cart.tsx

```typescript
import { useEffect } from 'react';
import { useLoaderData } from 'react-router';
import { trackViewCart, trackRemoveFromCart } from '~/lib/ga4-events';

export default function CartPage() {
  const { cart } = useLoaderData();

  // カートページロード時
  useEffect(() => {
    trackViewCart({
      totalAmount: cart.cost?.subtotalAmount?.amount,
      currency: 'JPY',
      items: cart.lines?.map((line) => ({
        id: line.merchandise?.product?.id,
        title: line.merchandise?.product?.title,
        price: line.merchandise?.price?.amount,
        quantity: line.quantity,
      })) || [],
    });
  }, [cart.id]);

  // 「削除」ボタン
  async function handleRemoveFromCart(lineId) {
    const item = cart.lines.find((l) => l.id === lineId);

    trackRemoveFromCart({
      id: item.merchandise.product.id,
      title: item.merchandise.product.title,
      price: item.merchandise.price?.amount,
      quantity: item.quantity,
    });

    // 実装: Shopify Cart API
    const response = await fetch('/api/cart', {
      method: 'DELETE',
      body: JSON.stringify({ lineId }),
    });

    if (response.ok) {
      showNotification('削除しました');
      // カートを再読み込み
    }
  }

  return (
    <div>
      <h1>ショッピングカート</h1>

      {cart.lines?.map((line) => (
        <div key={line.id} style={{ border: '1px solid #ccc', padding: 10, marginBottom: 10 }}>
          <h3>{line.merchandise.product.title}</h3>
          <p>数量: {line.quantity}</p>
          <p>¥{(parseFloat(line.merchandise.price?.amount) * line.quantity).toLocaleString('ja-JP')}</p>
          <button onClick={() => handleRemoveFromCart(line.id)}>削除</button>
        </div>
      ))}

      <div style={{ fontSize: 20, fontWeight: 'bold', marginTop: 20 }}>
        合計: ¥{cart.cost?.subtotalAmount?.amount}
      </div>

      <button onClick={handleCheckout} style={{ background: '#00F0FF', marginTop: 20 }}>
        チェックアウトに進む
      </button>
    </div>
  );
}
```

---

## 7. チェックアウトページ

### app/routes/checkout.tsx

```typescript
import { useEffect } from 'react';
import { trackBeginCheckout } from '~/lib/ga4-events';

export default function CheckoutPage() {
  const { cart } = useLoaderData();

  // 「チェックアウト」ボタンをクリック時
  function handleBeginCheckout() {
    // チェックアウト開始を記録（ファネル分析用）
    trackBeginCheckout({
      totalAmount: cart.cost?.subtotalAmount?.amount,
      currency: 'JPY',
      lines: cart.lines?.map((line) => ({
        id: line.merchandise?.product?.id,
        title: line.merchandise?.product?.title,
        price: line.merchandise?.price?.amount,
        quantity: line.quantity,
      })) || [],
    });

    // Shopifyのチェックアウトページにリダイレクト
    // あるいはストライプ/PayPalのチェックアウトフローへ
    window.location.href = cart.checkoutUrl;
  }

  return (
    <div>
      <h1>チェックアウト</h1>
      {/* 配送先、支払い方法などのフォーム */}
      <button onClick={handleBeginCheckout} style={{ background: '#FFB300', padding: '12px 24px' }}>
        購入を確定する
      </button>
    </div>
  );
}
```

---

## 8. サンクスページ（⭐ 最重要）

### app/routes/thank-you.$orderId.tsx

```typescript
import { useEffect } from 'react';
import { useLoaderData } from 'react-router';
import { trackPurchase, setUserId } from '~/lib/ga4-events';

/**
 * サンクスページ — 購入完了イベントを記録
 * これがないとROI計算が不可能なので、絶対に実装すること！
 */
export default function ThankYouPage() {
  const { order, customer } = useLoaderData();

  useEffect(() => {
    // 購入完了イベント送信（最重要）
    trackPurchase({
      orderId: order.id,
      totalAmount: order.totalPrice?.amount,
      tax: order.totalTax?.amount,
      shipping: order.shippingLine?.price?.amount,
      currency: 'JPY',
      coupon: order.discountCode || undefined,
      items: order.lineItems.map((item) => ({
        id: item.id,
        title: item.title,
        price: item.price?.amount,
        quantity: item.quantity,
        variant: item.variant?.title,
        category: item.product?.productType,
      })),
    });

    // 顧客IDを記録（リピート購入分析用）
    if (customer?.id) {
      const customerId = customer.id.replace('gid://shopify/Customer/', '');
      setUserId(customerId);
    }
  }, [order.id]);

  return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <h1 style={{ color: '#00F0FF' }}>ご注文ありがとうございます！</h1>

      <div style={{ background: 'rgba(0,240,255,0.1)', padding: 20, marginTop: 20, borderRadius: 8 }}>
        <p style={{ fontSize: 18 }}>注文番号: <strong>{order.name}</strong></p>
        <p>お支払い金額: <strong>¥{order.totalPrice?.amount}</strong></p>
        <p>配送先: {order.shippingAddress?.address1}</p>
      </div>

      <div style={{ marginTop: 30 }}>
        <p>ご注文の確認メールを送付いたしました。</p>
        <p>10営業日以内に発送予定です。</p>
        <a href="/" style={{ color: '#00F0FF' }}>トップページに戻る</a>
      </div>
    </div>
  );
}
```

---

## 9. ニュースレター登録

### app/components/astro/NewsletterSignup.tsx

```typescript
import { useState } from 'react';
import { useFetcher } from 'react-router';
import { trackGenerateLead } from '~/lib/ga4-events';
import { T, al } from '~/lib/astromeda-data';

export function NewsletterSignup() {
  const fetcher = useFetcher();
  const [email, setEmail] = useState('');

  const isSubmitting = fetcher.state === 'submitting';
  const isSuccess = fetcher.data?.success === true;

  async function handleSubmit(e) {
    e.preventDefault();

    // ニュースレター登録をGA4に記録
    trackGenerateLead({
      lead_type: 'newsletter',
      value: 0, // オプション: リード評価額
    });

    // フォーム送信
    const formData = new FormData();
    formData.append('email', email);
    fetcher.submit(formData, { method: 'post', action: '/api/newsletter' });
  }

  return (
    <div style={{ background: T.bgC, padding: 20, borderRadius: 8 }}>
      <h3 style={{ color: T.tx, margin: '0 0 8px' }}>最新情報を受け取る</h3>
      <p style={{ color: T.t5, margin: '0 0 12px', fontSize: 12 }}>
        新作IP、セール、入荷情報をいち早くお届けします。
      </p>

      {isSuccess ? (
        <p style={{ color: T.c, margin: 0 }}>✓ 登録ありがとうございます！</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="メールアドレス"
            required
            style={{
              flex: 1,
              padding: '10px 14px',
              background: T.bd,
              border: `1px solid ${T.bd}`,
              borderRadius: 6,
              color: T.tx,
              fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: '10px 16px',
              background: isSubmitting ? al(T.c, 0.3) : `linear-gradient(135deg, ${T.c}, ${T.cD})`,
              color: T.bg,
              border: 'none',
              borderRadius: 6,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontWeight: 700,
            }}
          >
            {isSubmitting ? '送信中...' : '登録'}
          </button>
        </form>
      )}
    </div>
  );
}
```

---

## 10. IPコラボ グリッド

### app/components/astro/CollabGrid.tsx

```typescript
import { useEffect } from 'react';
import { trackViewPromotion, trackSelectPromotion } from '~/lib/ga4-events';
import { COLLABS } from '~/lib/astromeda-data';

export function CollabGrid() {
  // グリッド表示時（各IPがプロモーション）
  useEffect(() => {
    COLLABS.forEach((collab, index) => {
      trackViewPromotion({
        promotion_id: `collab-${collab.id}`,
        promotion_name: 'IP Collaboration Grid',
        creative_name: collab.name,
        creative_slot: `collab-grid-item-${index}`,
        location_id: 'homepage-collabs',
      });
    });
  }, []);

  // IP collabをクリック時
  function handleCollabClick(collab, index) {
    trackSelectPromotion({
      promotion_id: `collab-${collab.id}`,
      promotion_name: 'IP Collaboration Grid',
      creative_name: collab.name,
      creative_slot: `collab-grid-item-${index}`,
    });

    // コレクションページへナビゲート
    window.location.href = `/collections/${collab.shop}`;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
      {COLLABS.map((collab, index) => (
        <div
          key={collab.id}
          onClick={() => handleCollabClick(collab, index)}
          style={{ cursor: 'pointer', textAlign: 'center' }}
        >
          <h3>{collab.name}</h3>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>{collab.tag}</p>
        </div>
      ))}
    </div>
  );
}
```

---

## ご確認ください

- [ ] 各コンポーネントで該当イベント関数をインポート
- [ ] イベント追跡が適切なタイミングで呼び出されている
- [ ] ブラウザコンソール（`NODE_ENV=development`）でログが出ている
- [ ] ステージング環境で実テスト（実クリック、実カート追加など）
- [ ] GA4管理画面でイベントが記録されている
- [ ] 本番環境にデプロイ前にもう一度確認

---

## トラブルシューティング

### イベントが送信されない

1. GA4 measurement ID が設定されているか：
   ```bash
   echo $PUBLIC_GA_MEASUREMENT_ID
   ```

2. ブラウザコンソールで gtag が定義されているか：
   ```javascript
   typeof window.gtag // 'function' なら OK
   ```

3. development mode のコンソールを確認：
   ```javascript
   [GA4] Event sent: view_item {...}
   ```

### AIReferralBanner が表示されない

1. referrer を確認：
   ```javascript
   document.referrer // AI URLが含まれているか？
   ```

2. sessionStorage を確認：
   ```javascript
   sessionStorage.getItem('astromeda_ai_referral_tracked')
   ```

3. バナーを強制表示（デバッグ用）：
   ```javascript
   sessionStorage.removeItem('astromeda_ai_referral_tracked');
   sessionStorage.removeItem('astromeda_ai_banner_dismissed');
   location.reload();
   ```

