# CRO Tracking Features — 統合ガイド

このガイドでは、新しく追加された2つのCRO（Conversion Rate Optimization）追跡機能を説明します。

## 概要

### 8b-1: GA4 Event Design & Implementation
**ファイル:** `app/lib/ga4-events.ts`

新規イベント（プロモーション、ソーシャルシェア、リード生成など）を含む包括的なGA4イベント追跡ユーティリティ。既存の`ga4-ecommerce.ts`の機能を拡張・統合したものです。

**新規イベント:**
- `view_promotion` — バナー/プロモーション表示
- `select_promotion` — バナー/プロモーション クリック
- `share` — ソーシャル共有
- `generate_lead` — リード生成（ニュースレター登録など）

### 8b-3: AI Citation Tracking
**ファイル:** `app/lib/ai-referrer-tracker.ts`

ChatGPT、Claude、Gemini、Perplexityなどの生成AI検索エンジンからのアクセスを検出・追跡。新しい売上チャネルの分析が可能。

**対応AI:**
- ChatGPT / SearchGPT
- Claude
- Gemini
- Perplexity
- Grok
- Microsoft Copilot
- You.com
- Phind

---

## 統合方法

### 1. ルートレイアウトでAI referral追跡を初期化

**ファイル:** `app/routes/_index.tsx` または `app/root.tsx`

```typescript
import { trackAIReferralIfExists } from '~/lib/ai-referrer-tracker';

export function Root() {
  useEffect(() => {
    // ページロード時にAI referralを自動検出・追跡
    trackAIReferralIfExists();
  }, []);

  return (
    <>
      {/* AIReferralBannerはここに配置 */}
      <AIReferralBanner />
      {/* その他コンテンツ */}
    </>
  );
}
```

### 2. AIReferralBannerをレイアウトに追加

**ファイル:** `app/routes/_layout.tsx` または `app/root.tsx`

```typescript
import { AIReferralBanner } from '~/components/astro/AIReferralBanner';

export default function Layout() {
  return (
    <div>
      <AIReferralBanner />
      {/* その他レイアウト */}
    </div>
  );
}
```

### 3. イベント追跡を各コンポーネントに統合

#### プロモーション表示時
```typescript
import { trackViewPromotion } from '~/lib/ga4-events';

export function HeroSlider() {
  useEffect(() => {
    trackViewPromotion({
      promotion_name: 'Spring Campaign 2026',
      creative_name: 'Hero Banner',
      creative_slot: 'homepage-hero',
      location_id: 'top',
    });
  }, []);
  
  return (/* ... */);
}
```

#### プロモーション/バナークリック時
```typescript
import { trackSelectPromotion } from '~/lib/ga4-events';

function handlePromoBannerClick() {
  trackSelectPromotion({
    promotion_name: 'Spring Campaign 2026',
    creative_name: 'Hero Banner',
    creative_slot: 'homepage-hero',
  });
  navigate('/collections/spring-2026');
}
```

#### ソーシャルシェア時
```typescript
import { trackShare } from '~/lib/ga4-events';

async function handleShare(platform: string) {
  trackShare({
    content_type: 'product',
    item_id: productId,
    method: platform, // 'twitter', 'facebook', 'line', etc.
  });
  
  // シェア処理...
}
```

#### ニュースレター登録時
```typescript
import { trackGenerateLead } from '~/lib/ga4-events';

async function handleNewsletterSignup(email: string) {
  trackGenerateLead({
    value: 0, // オプション: リード価値
    lead_type: 'newsletter',
  });
  
  // 登録処理...
}
```

### 4. 既存GA4イベントの統合

既存の `trackAddToCart`, `trackPurchase` などは引き続き使用可能です：

```typescript
import {
  trackViewItem,
  trackAddToCart,
  trackPurchase,
  trackSearch,
} from '~/lib/ga4-events';
```

---

## イベント リファレンス

### Ecommerce イベント

| 関数 | 説明 | 用途 |
|---|---|---|
| `trackViewItem()` | 商品詳細ページ表示 | 商品ページ |
| `trackViewItemList()` | コレクション/リスト表示 | カテゴリ、検索結果 |
| `trackSelectItem()` | リストから商品選択 | グリッド/リストクリック |
| `trackViewCart()` | カート表示 | カートページ |
| `trackAddToCart()` | カート追加 | 「カートに入れる」ボタン |
| `trackRemoveFromCart()` | カート削除 | カート削除ボタン |
| `trackBeginCheckout()` | チェックアウト開始 | 「購入へ進む」ボタン |
| `trackPurchase()` | 購入完了 | サンクスページ ⭐ 最重要 |
| `trackSearch()` | サイト内検索 | 検索フォーム送信 |

### プロモーション イベント

| 関数 | 説明 |
|---|---|
| `trackViewPromotion()` | バナー/プロモ表示（インプレッション） |
| `trackSelectPromotion()` | バナー/プロモクリック |

**パラメータ:**
```typescript
{
  promotion_id?: string;    // プロモID（オプション）
  promotion_name: string;   // プロモ名（必須）
  creative_name?: string;   // 広告創作名
  creative_slot?: string;   // 配置場所 ('hero', 'sidebar', etc.)
  location_id?: string;     // 位置ID
}
```

### Engagement イベント

| 関数 | 説明 |
|---|---|
| `trackShare()` | ソーシャルメディア共有 |
| `trackGenerateLead()` | リード生成（ニュースレター登録など） |

### ユーティリティ

| 関数 | 説明 |
|---|---|
| `trackCustomEvent()` | カスタムイベント送信 |
| `isAnalyticsEnabled()` | GA4が有効か確認 |
| `setUserProperty()` | ユーザー属性設定 |
| `setUserId()` | ユーザーID設定（サインイン時） |

---

## AI Referral Tracker API

### 自動追跡（推奨）

```typescript
import { trackAIReferralIfExists } from '~/lib/ai-referrer-tracker';

// ページロード時に自動実行
useEffect(() => {
  trackAIReferralIfExists();
}, []);
```

### 手動追跡

```typescript
import {
  detectAIReferral,
  trackAIReferral,
  getAIReferralInfo,
  getAISourceDisplayName,
} from '~/lib/ai-referrer-tracker';

// 検出のみ
const referral = detectAIReferral();
if (referral) {
  console.log(`AI source: ${referral.source}`);
  console.log(`Landing: ${referral.landingPage}`);
  
  // 手動で追跡
  trackAIReferral(referral);
}

// セッション中に既に追跡済みか確認
if (isAIReferralAlreadyTracked()) {
  console.log('Already tracked');
}

// 表示名を取得
const displayName = getAISourceDisplayName('claude'); // "Claude"
```

### SessionStorage キー

- `astromeda_ai_referral_tracked` — AI referral追跡済みフラグ
- `astromeda_ai_banner_dismissed` — バナー非表示フラグ

---

## GA4 カスタムイベント仕様

AI referral追跡時に、以下のカスタムイベント `ai_citation` が送信されます：

**イベントパラメータ:**
```javascript
{
  ai_source: 'claude',           // AI source ID
  landing_page: '/products/...',  // ランディングページ
  timestamp: 1712600000000,       // Unix timestamp
}
```

GA4管理画面で `ai_citation` イベントを登録してレポートを有効化してください。

---

## SSR安全性

全関数は`typeof window === 'undefined'`をチェックしており、サーバーサイドレンダリング環境でも安全です：

```typescript
// サーバー側では何もしない
if (typeof window === 'undefined') return;

// クライアント側のみ実行
window.gtag('event', ...);
```

---

## デバッグモード

`NODE_ENV=development` の場合、コンソールにイベント情報が出力されます：

```
[GA4] Event sent: view_item {item_id: '123', item_name: 'Product', ...}
[AI Referrer] Tracked: claude /products/pc-gaming
```

---

## チェックリスト

統合完了の確認リスト：

- [ ] `ga4-events.ts` をインポート可能か確認
- [ ] `ai-referrer-tracker.ts` をインポート可能か確認
- [ ] `AIReferralBanner.tsx` をレイアウトに配置
- [ ] `trackAIReferralIfExists()` をページロード時に呼び出し
- [ ] 各コンポーネントでイベント追跡を実装
- [ ] GA4管理画面で `ai_citation` カスタムイベントを登録
- [ ] ステージングで動作確認（ブラウザコンソール で `[GA4]` ログ）
- [ ] 本番デプロイ前に `NODE_ENV=production` でテスト

---

## トラブルシューティング

### イベントが送信されない

1. GA4 measurement ID が設定されているか確認：
   ```bash
   echo $PUBLIC_GA_MEASUREMENT_ID
   ```

2. `window.gtag` が定義されているか確認（ブラウザコンソール）：
   ```javascript
   typeof window.gtag  // 'function' でなければNG
   ```

3. GA4タグスクリプトがロードされているか確認（network tab）

### AIReferralBanner が表示されない

1. referrer が正しく設定されているか確認（開発者ツール）：
   ```javascript
   document.referrer
   ```

2. sessionStorage を確認：
   ```javascript
   sessionStorage.getItem('astromeda_ai_referral_tracked')
   sessionStorage.getItem('astromeda_ai_banner_dismissed')
   ```

3. コンソールエラーを確認

---

## 参考資料

- GA4 Events: https://developers.google.com/analytics/devguides/collection/ga4/events
- Enhanced Ecommerce: https://support.google.com/analytics/answer/9268042
- AI Search Patterns: Astromeda AI Referral Tracker docs

