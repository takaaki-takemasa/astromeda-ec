# Astromeda EC 全修正プロンプト（Claude Code用）

> **重要**: このプロンプトの指示を上から順番に、1つずつ完了してから次に進むこと。
> 各ステップ完了後に `npm run build` でビルドエラーがないことを確認すること。
> ファイルを編集する際は、既存の内容を壊さないよう注意。特に _index.tsx は過去に何度も切り詰められているため、Write ではなく Edit で部分修正すること。

---

## 修正1: スライダーバナー画像の切れ問題を解決

### 原因
HeroSlider が Storefront API の `collection.image`（800×800 正方形サムネイル）を使用している。
横長コンテナ（16:10）に正方形画像を `objectFit: 'cover'` で表示 → 上下が大幅にクロップされる。

### 解決策
現行サイト（shop.mining-base.co.jp）のスライダーで使われている **1780×1000px 横長バナー画像** の CDN URL を `astromeda-data.ts` の各 COLLABS エントリに `banner` フィールドとして追加し、HeroSlider でそちらを優先使用する。

### 手順

#### Step 1-A: `app/lib/astromeda-data.ts` の CollabItem インターフェースに `banner` フィールド追加

```typescript
export interface CollabItem {
  id: string;
  name: string;
  tag: string;
  accent: string;
  pt: string;
  desc: string;
  cats: string;
  f: number;
  shop: string;
  count?: number;
  banner?: string;  // ← 追加: 横長バナー画像のCDNファイル名
}
```

#### Step 1-B: COLLABS 配列の各エントリに `banner` を追加

CDN ベース URL: `https://cdn.shopify.com/s/files/1/0741/0407/8628/files/`

以下のマッピングで banner フィールドを追加（ファイル名のみ。ベースURLはコンポーネント側で付与）:

```
onepiece:     banner: '11_5c383281-0813-4608-9396-6c156915b93e.png'
naruto:       banner: '5_fc05d49d-abef-4ad5-8b66-d5c174a0025d.png'
heroaca:      banner: ''  （※未特定 — 後述の手動確認が必要）
sf6:          banner: 'SF6_1780_1000px_84527899-b2db-4a36-8471-5a3a2bf1ccea.png'
sanrio:       banner: ''  （※未特定）
sonic:        banner: 'IP.png'
jujutsu:      banner: ''  （※未特定）
chainsawman:  banner: ''  （※未特定）
bocchi:       banner: '6_7c27dd74-209a-43f8-b549-6786e53bd181.png'
hololive-en:  banner: 'EN1780_1000px_1c3a3d13-2626-4280-85c9-0572642487e3.png'
bleach-ros:   banner: '10_cc3d47b1-ddd2-429b-b034-9c0b919892a2.png'
bleach-tybw:  banner: '546478857c81c1970a0e1248fa04e6a3.png'
geass:        banner: '789e11a92bc88a26b0c09fb53334f0c1.png'
tokyoghoul:   banner: '1780_1000px_d39b0d29-47c8-4e9c-bba4-f2bd655d6729.png'
lovelive:     banner: '5de897496c97a2ec3bda188d0b239e46.png'
sao:          banner: '18c6f6596e6bc38a8d73d01e94d89f84.png'
yurucamp:     banner: '1780_1000px_1a009c2a-f58c-419a-968d-ca353b371b08.png'
pacmas:       banner: '1780_1000px_4.png'
sumikko:      banner: '1780_1000pxV2.png'
rilakkuma:    banner: '1780_1000pxV3_1.png'
garupan:      banner: '1780_1000px02_1.png'
nitowai:      banner: 'slide.png'
palworld:     banner: 'dot1.png'
imas-ml:      banner: ''  （※未特定）
milpr:        banner: ''  （※未特定）
blackdesert:  banner: ''  （※未特定）
```

#### Step 1-C: `app/components/astro/HeroSlider.tsx` を修正

CDN_FILES_BASE 定数を追加:
```typescript
const CDN_FILES_BASE = 'https://cdn.shopify.com/s/files/1/0741/0407/8628/files/';
```

画像ソースの優先順位を変更（imgUrl の決定ロジック）:

```typescript
// 変更前:
const imgUrl = imageMap.get(feat.shop);

// 変更後:
const bannerUrl = feat.banner ? `${CDN_FILES_BASE}${feat.banner}` : null;
const collectionImgUrl = imageMap.get(feat.shop);
const imgUrl = bannerUrl || collectionImgUrl;
```

img タグの src も変更:
```typescript
// 変更前:
src={`${imgUrl}?width=1200&format=webp`}

// 変更後（bannerはpngなのでformat指定不要、widthのみ）:
src={`${imgUrl}${imgUrl.includes('?') ? '&' : '?'}width=1400`}
```

コンテナのアスペクト比を 16:9 に調整（1780:1000 ≒ 16:9）:
```typescript
// 変更前:
const containerH = sp ? `min(62.5vw, 260px)` : `min(62.5vw, 420px)`;

// 変更後（16:9 比率）:
const containerH = sp ? `min(56.25vw, 240px)` : `min(56.25vw, 500px)`;
```

---

## 修正2: _index.tsx の切り詰め復旧

### 原因
過去の Edit 操作で UGC セクションの途中（466行目の `font` ）でファイルが途切れている。
3つの GraphQL クエリ定数が欠落: `RECOMMENDED_PRODUCTS_QUERY`, `IP_COLLECTIONS_BY_HANDLE_QUERY`, `PC_COLOR_COLLECTIONS_QUERY`

### 手順
ファイル末尾（466行目以降）に以下を追加。**既存部分は一切変更しない**こと。

まず UGC セクションの残りを補完（466行目の `font` の続きから）:

```typescript
Weight: 700,
                      color: T.t5,
                    }}
                  >
                    {u.u}
                  </div>
                  <div style={{fontSize: 'clamp(8px, 1vw, 10px)', color: T.t3}}>
                    {u.d}
                  </div>
                </div>
              </div>
              <div style={{fontSize: 'clamp(9px, 1.1vw, 11px)', color: T.t5, lineHeight: 1.5}}>
                {u.t}
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10}}>
                <div style={{display: 'flex', gap: 2}}>
                  {[...Array(u.s)].map((_, si) => (
                    <span key={si} style={{color: T.g, fontSize: 12}}>★</span>
                  ))}
                </div>
                <span style={{fontSize: 'clamp(8px, 1vw, 10px)', color: T.t3}}>
                  ♡ {u.likes}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── GraphQL Queries ─────────────────────────────

const RECOMMENDED_PRODUCTS_QUERY = `#graphql
  fragment RecommendedProduct on Product {
    id
    title
    handle
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
    }
    featuredImage {
      id
      altText
      url
      width
      height
    }
  }
  query RecommendedProducts ($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    products(first: 12, sortKey: UPDATED_AT, reverse: true, query: "price:>0") {
      nodes {
        ...RecommendedProduct
      }
    }
  }
` as const;

// IP collections by handle (aliases)
const IP_HANDLES = [
  'one-piece-bountyrush-collaboration',
  'naruto-shippuden',
  'heroaca-collaboration',
  'streetfighter-collaboration',
  'sanrio-characters-collaboration',
  'sega-sonic-astromeda-collaboration',
  'jujutsukaisen-collaboration',
  'chainsawman-movie-reze',
  'bocchi-rocks-collaboration',
  'hololive-english-collaboration',
  'bleach-rebirth-of-souls-collaboration',
  'bleach-anime-astromeda-collaboration',
  'geass-collaboration',
  'tokyoghoul-collaboration',
  'lovelive-nijigasaki-collaboration',
  'swordart-online-collaboration',
  'yurucamp-collaboration',
  'pacmas-astromeda-collaboration',
  'sumikko',
  'girls-und-panzer-collaboration',
  'goods-rilakkuma',
  'pc-nitowai',
  'astromeda-palworld-collaboration-pc',
  'imas-millionlive-collaboration',
  'milpr-pc',
  'black-desert-collaboration',
];

function buildAliasName(handle: string): string {
  return handle.replace(/[^a-zA-Z0-9]/g, '_');
}

const IP_COLLECTIONS_BY_HANDLE_QUERY = `#graphql
${IP_HANDLES.map(
  (h) => `  ${buildAliasName(h)}: collectionByHandle(handle: "${h}") {
    id
    title
    handle
    image { id url altText width height }
  }`
).join('\n')}
` as const;

// PC Color collections
const PC_COLOR_HANDLES: Record<string, string> = {
  colorWhite: 'astromeda-white',
  colorBlack: 'astromeda-black',
  colorPink: 'astromeda-pink',
  colorPurple: 'astromeda-purple',
  colorBlue: 'astromeda-lightblue',
  colorRed: 'astromeda-red',
  colorGreen: 'astromeda-green',
  colorOrange: 'astromeda-orange',
};

const PC_COLOR_COLLECTIONS_QUERY = `#graphql
${Object.entries(PC_COLOR_HANDLES).map(
  ([alias, handle]) => `  ${alias}: collectionByHandle(handle: "${handle}") {
    id
    title
    handle
    image { id url altText width height }
  }`
).join('\n')}
` as const;
```

**重要**: `query: "price:>0"` を RECOMMENDED_PRODUCTS_QUERY に追加して ¥0 商品を除外すること。

---

## 修正3: ヘッダーナビゲーションタブ修正

### 原因
`app/components/Header.tsx` の `FALLBACK_HEADER_MENU`（178行目付近）が誤った英語メニュー項目になっている。

### 手順
`FALLBACK_HEADER_MENU` を以下に置き換え:

```typescript
const FALLBACK_HEADER_MENU = {
  id: 'gid://shopify/Menu/astromeda',
  items: [
    {
      id: 'home',
      resourceId: null,
      tags: [],
      title: 'ホーム',
      type: 'HTTP',
      url: '/',
      items: [],
    },
    {
      id: 'gaming-pc',
      resourceId: null,
      tags: [],
      title: 'ゲーミングPC',
      type: 'HTTP',
      url: '/collections/astromeda',
      items: [],
    },
    {
      id: 'gadgets',
      resourceId: null,
      tags: [],
      title: 'ガジェット',
      type: 'HTTP',
      url: '/collections/gadgets',
      items: [],
    },
    {
      id: 'goods',
      resourceId: null,
      tags: [],
      title: 'グッズ',
      type: 'HTTP',
      url: '/collections/goods',
      items: [],
    },
  ],
};
```

**注意**: Header.tsx の既存の FALLBACK_HEADER_MENU を確認すると、既にこの内容に修正済みの場合がある。
現在の内容と比較し、異なっていれば修正すること。

---

## 修正4: コレクションページの製品カード改善

### ファイル: `app/routes/collections.$handle.tsx`

#### 4-A: GraphQL に製品スペック情報を追加

`PRODUCT_ITEM_FRAGMENT` に以下を追加:
```graphql
tags
variants(first: 1) {
  nodes {
    selectedOptions {
      name
      value
    }
  }
}
```

#### 4-B: 製品カードにスペック表示を追加

`AstroProductItem` コンポーネントで、タイトルの下に GPU/CPU 等のスペックをタグから抽出して表示:

```typescript
// タグからスペック情報を抽出する関数
function extractSpecs(tags: string[]): {gpu?: string; cpu?: string; ram?: string} {
  const specs: {gpu?: string; cpu?: string; ram?: string} = {};
  for (const tag of tags) {
    const t = tag.toLowerCase();
    if (t.includes('rtx') || t.includes('gtx') || t.includes('rx ')) {
      specs.gpu = tag;
    } else if (t.includes('ryzen') || t.includes('core') || t.includes('i7') || t.includes('i9') || t.includes('i5')) {
      specs.cpu = tag;
    } else if (t.includes('gb') && (t.includes('mem') || t.includes('ram') || t.includes('ddr'))) {
      specs.ram = tag;
    }
  }
  return specs;
}
```

カード内にスペックバッジを表示:
```tsx
{product.tags && (() => {
  const specs = extractSpecs(product.tags);
  return (specs.gpu || specs.cpu) ? (
    <div style={{display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4}}>
      {specs.gpu && <span style={{fontSize: 9, background: 'rgba(0,240,255,.1)', color: '#00F0FF', padding: '2px 6px', borderRadius: 4}}>{specs.gpu}</span>}
      {specs.cpu && <span style={{fontSize: 9, background: 'rgba(255,179,0,.1)', color: '#FFB300', padding: '2px 6px', borderRadius: 4}}>{specs.cpu}</span>}
    </div>
  ) : null;
})()}
```

#### 4-C: フィルター・ソートUIを追加

コレクションページの上部に以下を追加:
- **ソート**: 価格順（安い/高い）、新着順
- **フィルター**: 製品タイプ（PC / ガジェット / グッズ）をタグベースでフィルタリング

ソートはURLパラメータ `?sort=price-asc` 等で実装し、GraphQL の `sortKey` と `reverse` を動的に変更。

```typescript
// loader 内でソートパラメータを処理
const url = new URL(request.url);
const sortParam = url.searchParams.get('sort') || 'newest';

let sortKey: 'CREATED' | 'PRICE' | 'BEST_SELLING' = 'CREATED';
let reverse = true;
switch (sortParam) {
  case 'price-asc': sortKey = 'PRICE'; reverse = false; break;
  case 'price-desc': sortKey = 'PRICE'; reverse = true; break;
  case 'best-selling': sortKey = 'BEST_SELLING'; reverse = false; break;
  default: sortKey = 'CREATED'; reverse = true;
}
```

---

## 修正5: フッター追加

### ファイル: `app/components/Footer.tsx`（既存ファイルを修正、または新規作成）

LEGAL データ（astromeda-data.ts）を使用して以下を含むフッターを作成:
- 会社情報（株式会社マイニングベース）
- 特定商取引法に基づく表記へのリンク
- プライバシーポリシーリンク
- 保証情報
- SNSリンク
- 著作権表示

スタイルは既存のダークテーマ（T.bg, T.tx 等）に合わせること。

---

## 確認チェックリスト

全修正完了後に以下を確認:

1. `npm run build` がエラーなく完了すること
2. `npm run dev` でローカル起動し、以下を目視確認:
   - [ ] トップページスライダーのバナー画像が切れていないこと（横長で全体表示）
   - [ ] ヘッダーに「ゲーミングPC」「ガジェット」「グッズ」タブがあること
   - [ ] NEW ARRIVALS に ¥0 商品が表示されないこと
   - [ ] コレクションページで製品スペックが見えること
   - [ ] フッターが表示されること

3. TypeScript型エラーがないこと: `npx tsc --noEmit`

---

## 禁止事項

- `_index.tsx` を Write で全体上書きしない（Edit で部分修正のみ）
- 画像をローカル保存しない（全て CDN URL を使用）
- 本番切り替えはしない（ステージングでの検証のみ）
- 作業を中途半端に残して次に進まない
