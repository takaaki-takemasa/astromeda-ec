# Astromeda EC 修正プロンプト V4（Claude Code用）

> ## ⚠️ 最重要: ファイル切り詰め問題の根本対策
>
> **過去6回以上、_index.tsx と collections.$handle.tsx が Edit/Write 操作で途中切断されている。**
> 今回のデプロイでもまた発生した（_index.tsx: 466行で切れ、collections.$handle.tsx: 237行で切れ）。
>
> **根本対策（必ず従うこと）**:
> 1. **Write は絶対に使わない。全ての編集は Edit のみ。**
> 2. **Edit で長いコードブロックを追加する場合、500行以上の置換は行わない。複数の小さなEditに分割する。**
> 3. **Edit の前に必ず Read でファイル全体を確認し、行数を把握する。**
> 4. **Edit の後に必ず Read でファイル末尾を確認し、切り詰められていないか確認する。**
> 5. **各ファイル修正後に `npm run build` で確認。**

---

## 問題1: _index.tsx の GraphQL クエリ3本が欠落

### 現状
ファイルは466行で途切れている（UGCセクションの `font` で途切れ）。
以下の3つのGraphQLクエリ定数が**完全に欠落**している:
- `RECOMMENDED_PRODUCTS_QUERY`
- `IP_COLLECTIONS_BY_HANDLE_QUERY`
- `PC_COLOR_COLLECTIONS_QUERY`

### 影響
- **PCShowcase（カラー別製品イメージ）が表示されない**: `PC_COLOR_COLLECTIONS_QUERY` が未定義 → runtime error → catch → 空オブジェクト → `PCShowcase` が `return null`
- **NEW ARRIVALS が表示されない**: `RECOMMENDED_PRODUCTS_QUERY` が未定義
- **IPコレクション画像が取得できない**: `IP_COLLECTIONS_BY_HANDLE_QUERY` が未定義

### 修正手順

**Step 1**: Read で _index.tsx の末尾を確認（466行付近で `font` が途切れているはず）

**Step 2**: 466行目の `font` から始まるUGCセクションの残りを補完し、その後にGraphQLクエリを追加する。

以下のコードを、466行目の途切れた箇所から**ファイル末尾に追加**する。
Edit の old_string は現在の最終行（`font` を含む行）を使い、new_string でその行の続き＋残り全体を記述する:

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

      {/* CSS animations */}
      <style>{`
        @keyframes mq { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .mq { animation: mq 30s linear infinite; }
        .hl { transition: transform .2s, border-color .2s; }
        .hl:hover { transform: translateY(-3px); border-color: rgba(0,240,255,.2); }
        .fps-scroll::-webkit-scrollbar { display: none; }
        .fps-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        @media (min-width:768px) { .astro-cat-grid { grid-template-columns: repeat(4, 1fr) !important; } }
      `}</style>
    </div>
  );
}
```

**Step 3（別のEdit操作）**: 上記の閉じ括弧 `}` の後に、以下の3つのGraphQLクエリを追加する:

```typescript
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
];

function buildAliasName(handle: string): string {
  return handle.replace(/[^a-zA-Z0-9]/g, '_');
}

const IP_COLLECTIONS_BY_HANDLE_QUERY = `#graphql
  query IPCollections {
${IP_HANDLES.map(
  (h) => `    ${buildAliasName(h)}: collectionByHandle(handle: "${h}") {
      id
      title
      handle
      image { id url altText width height }
    }`
).join('\n')}
  }
` as const;

const PC_COLOR_COLLECTIONS_QUERY = `#graphql
  query PCColorCollections {
    colorWhite: collectionByHandle(handle: "astromeda-white") {
      id title handle image { id url altText width height }
    }
    colorBlack: collectionByHandle(handle: "astromeda-black") {
      id title handle image { id url altText width height }
    }
    colorPink: collectionByHandle(handle: "astromeda-pink") {
      id title handle image { id url altText width height }
    }
    colorPurple: collectionByHandle(handle: "astromeda-purple") {
      id title handle image { id url altText width height }
    }
    colorBlue: collectionByHandle(handle: "astromeda-lightblue") {
      id title handle image { id url altText width height }
    }
    colorRed: collectionByHandle(handle: "astromeda-red") {
      id title handle image { id url altText width height }
    }
    colorGreen: collectionByHandle(handle: "astromeda-green") {
      id title handle image { id url altText width height }
    }
    colorOrange: collectionByHandle(handle: "astromeda-orange") {
      id title handle image { id url altText width height }
    }
  }
` as const;
```

**Step 4**: Read で _index.tsx を確認。末尾が `as const;` で終わっていること。

**Step 5**: `npm run build` で確認。

---

## 問題2: collections.$handle.tsx が237行で切り詰め

### 現状
`<h1 className="` で途切れ。以下が全て欠落:
- コレクションヘッダーの残り
- ソートバー
- IPフィルター + 製品タイプフィルターUI
- 製品グリッド
- AstroProductItem コンポーネント
- GraphQLクエリ (PRODUCT_ITEM_FRAGMENT, COLLECTION_QUERY)

### 修正手順

**ファイルが大きすぎるため、全体をWriteで再作成するのではなく、237行目以降を追加する。**

**Step 1**: Read で collections.$handle.tsx の末尾を確認（237行目が `<h1 className="` で途切れ）

**Step 2**: 237行目の `<h1 className="` を以下で置換する（Edit で old_string = `        <h1\n          className="` → new_string = 以下の全コード）

完全なコードは長いため、**3回のEdit操作に分割**して追加すること:

**Edit 2a**: h1タグ〜ソートバー〜フィルターUI（約80行）
**Edit 2b**: 製品グリッド〜AstroProductItem（約80行）
**Edit 2c**: GraphQLクエリ（約60行）

各Editの後に Read で末尾を確認し、切れていないことを検証する。

### Edit 2a: h1 〜 フィルターUI

```typescript
        <h1
          className="ph"
          style={{
            fontSize: 'clamp(18px, 3vw, 32px)',
            fontWeight: 900,
            color: T.tx,
            marginBottom: 8,
          }}
        >
          {collection.title}
        </h1>
        {collection.description && (
          <p style={{fontSize: 'clamp(11px, 1.3vw, 14px)', color: T.t5, lineHeight: 1.7, maxWidth: 600}}>
            {collection.description}
          </p>
        )}
      </div>

      {/* Sort bar */}
      <div style={{
        padding: '12px clamp(16px, 4vw, 48px)',
        borderBottom: `1px solid ${T.t1}`,
        display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto',
      }}>
        <span style={{fontSize: 10, color: T.t4, flexShrink: 0}}>並び順：</span>
        {sortOptions.map((opt) => {
          const isActive = sortParam === opt.value;
          return (
            <Link key={opt.value || 'default'} to={makeSortUrl(opt.value)} style={{
              fontSize: 11, fontWeight: isActive ? 800 : 500,
              color: isActive ? T.c : T.t5, textDecoration: 'none',
              padding: '5px 12px', borderRadius: 20,
              border: `1px solid ${isActive ? al(T.c, 0.4) : T.t1}`,
              background: isActive ? al(T.c, 0.08) : 'transparent',
              whiteSpace: 'nowrap', flexShrink: 0, transition: 'all .2s',
            }}>
              {opt.label}
            </Link>
          );
        })}
      </div>

      {/* IP & Type filter chips */}
      {(availableIPs.length > 1 || availableTypes.length > 1) && (
        <div style={{padding: '8px clamp(16px, 4vw, 48px)', borderBottom: `1px solid ${T.t1}`, display: 'flex', flexDirection: 'column', gap: 8}}>
          {availableIPs.length > 1 && (
            <div style={{display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 4}}>
              <span style={{fontSize: 10, color: T.t4, flexShrink: 0}}>IP：</span>
              <button type="button" onClick={() => setIpFilter(null)} style={{
                fontSize: 10, fontWeight: !ipFilter ? 800 : 500, color: !ipFilter ? T.c : T.t5,
                padding: '4px 10px', borderRadius: 16,
                border: `1px solid ${!ipFilter ? al(T.c, 0.4) : T.t1}`,
                background: !ipFilter ? al(T.c, 0.08) : 'transparent',
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}>すべて</button>
              {availableIPs.map((ip) => {
                const c = COLLABS.find(x => x.id === ip);
                if (!c) return null;
                const on = ipFilter === ip;
                return (
                  <button type="button" key={ip} onClick={() => setIpFilter(on ? null : ip)} style={{
                    fontSize: 10, fontWeight: on ? 800 : 500, color: on ? c.accent : T.t5,
                    padding: '4px 10px', borderRadius: 16,
                    border: `1px solid ${on ? al(c.accent, 0.4) : T.t1}`,
                    background: on ? al(c.accent, 0.08) : 'transparent',
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>{c.name.length > 10 ? c.name.slice(0, 10) + '…' : c.name}</button>
                );
              })}
            </div>
          )}
          {availableTypes.length > 1 && (
            <div style={{display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 4}}>
              <span style={{fontSize: 10, color: T.t4, flexShrink: 0}}>種類：</span>
              <button type="button" onClick={() => setTypeFilter(null)} style={{
                fontSize: 10, fontWeight: !typeFilter ? 800 : 500, color: !typeFilter ? T.g : T.t5,
                padding: '4px 10px', borderRadius: 16,
                border: `1px solid ${!typeFilter ? al(T.g, 0.4) : T.t1}`,
                background: !typeFilter ? al(T.g, 0.08) : 'transparent',
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}>すべて</button>
              {availableTypes.map((type) => {
                const on = typeFilter === type;
                return (
                  <button type="button" key={type} onClick={() => setTypeFilter(on ? null : type)} style={{
                    fontSize: 10, fontWeight: on ? 800 : 500, color: on ? T.g : T.t5,
                    padding: '4px 10px', borderRadius: 16,
                    border: `1px solid ${on ? al(T.g, 0.4) : T.t1}`,
                    background: on ? al(T.g, 0.08) : 'transparent',
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>{type}</button>
                );
              })}
            </div>
          )}
          {(ipFilter || typeFilter) && (
            <div style={{fontSize: 11, color: T.t4}}>
              {filteredProducts.length}件表示
              {ipFilter && ` / ${COLLABS.find(c => c.id === ipFilter)?.name ?? ipFilter}`}
              {typeFilter && ` / ${typeFilter}`}
            </div>
          )}
        </div>
      )}
```

### Edit 2b: 製品グリッド + AstroProductItem

```typescript
      {/* Products grid */}
      <div style={{padding: 'clamp(20px, 3vw, 40px) clamp(16px, 4vw, 48px)'}}>
        {(ipFilter || typeFilter) ? (
          <div className="astro-products-grid">
            {filteredProducts.map((product: any, index: number) => (
              <AstroProductItem key={product.id} product={product} accent={accent} loading={index < 8 ? 'eager' : undefined} />
            ))}
            {filteredProducts.length === 0 && (
              <div style={{gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: T.t4}}>該当する商品がありません</div>
            )}
          </div>
        ) : (
          <PaginatedResourceSection connection={collection.products} resourcesClassName="astro-products-grid">
            {({node: product, index}: any) => (
              <AstroProductItem key={product.id} product={product} accent={accent} loading={index < 8 ? 'eager' : undefined} />
            )}
          </PaginatedResourceSection>
        )}
      </div>

      <Analytics.CollectionView data={{collection: {id: collection.id, handle: collection.handle}}} />
      <style>{`
        .astro-products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: clamp(10px, 1.5vw, 16px); }
      `}</style>
    </div>
  );
}

function extractSpec(tags: string[], prefix: string): string | null {
  const tag = tags.find((t) => t.startsWith(prefix + ':'));
  return tag ? tag.slice(prefix.length + 1) : null;
}

function AstroProductItem({product, accent, loading}: {product: any; accent: string; loading?: 'eager' | 'lazy'}) {
  const tags: string[] = product.tags ?? [];
  const firstVariant = product.variants?.nodes?.[0];
  const available = firstVariant?.availableForSale !== false;
  const gpu = extractSpec(tags, 'GPU');
  const cpu = extractSpec(tags, 'CPU');
  const ram = extractSpec(tags, 'RAM');
  const hasSpec = gpu || cpu || ram;

  return (
    <Link to={`/products/${product.handle}`} className="astro-product-card" style={{textDecoration: 'none', position: 'relative'}}>
      {!available && (
        <div style={{position: 'absolute', top: 8, left: 8, zIndex: 2, fontSize: 9, fontWeight: 900, padding: '3px 8px', borderRadius: 4, background: 'rgba(0,0,0,.7)', color: '#aaa', letterSpacing: 1}}>在庫なし</div>
      )}
      {product.featuredImage ? (
        <div style={{aspectRatio: '4/3', overflow: 'hidden', background: al(accent, 0.05)}}>
          <Image data={product.featuredImage} alt={product.featuredImage?.altText || product.title} loading={loading} sizes="(min-width: 768px) 25vw, 50vw" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        </div>
      ) : (
        <div style={{aspectRatio: '4/3', background: `linear-gradient(135deg, ${al(accent, 0.1)}, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.t3, fontSize: 11}}>No Image</div>
      )}
      <div style={{padding: '10px 0'}}>
        <h3 style={{fontSize: 'clamp(10px, 1.2vw, 13px)', fontWeight: 700, color: T.tx, lineHeight: 1.4, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden'}}>{product.title}</h3>
        {hasSpec && (
          <div style={{display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4}}>
            {gpu && <span style={{fontSize: 8, background: al(T.c, 0.1), color: T.c, padding: '1px 5px', borderRadius: 3}}>{gpu}</span>}
            {cpu && <span style={{fontSize: 8, background: al(T.g, 0.1), color: T.g, padding: '1px 5px', borderRadius: 3}}>{cpu}</span>}
            {ram && <span style={{fontSize: 8, background: al('#a855f7', 0.1), color: '#a855f7', padding: '1px 5px', borderRadius: 3}}>{ram}</span>}
          </div>
        )}
        <div style={{marginTop: 6}}>
          <span style={{fontSize: 'clamp(12px, 1.4vw, 16px)', fontWeight: 900, color: T.c}}>
            {product.priceRange.minVariantPrice.amount !== '0.0' ? `¥${Number(product.priceRange.minVariantPrice.amount).toLocaleString()}` : '価格はお問い合わせ'}
          </span>
        </div>
      </div>
      <style>{`
        .astro-product-card { background: ${T.bgC}; border-radius: 10px; overflow: hidden; border: 1px solid ${T.t1}; transition: transform .2s, border-color .2s; }
        .astro-product-card:hover { transform: translateY(-3px); border-color: ${al(accent, 0.3)}; }
      `}</style>
    </Link>
  );
}
```

### Edit 2c: GraphQL クエリ

```typescript
const PRODUCT_ITEM_FRAGMENT = `#graphql
  fragment ProductItem on Product {
    id
    handle
    title
    tags
    featuredImage { id altText url width height }
    priceRange { minVariantPrice { amount currencyCode } }
    variants(first: 1) { nodes { availableForSale selectedOptions { name value } } }
  }
` as const;

const COLLECTION_QUERY = `#graphql
  ${PRODUCT_ITEM_FRAGMENT}
  query Collection(
    $handle: String!
    $country: CountryCode
    $language: LanguageCode
    $first: Int
    $last: Int
    $startCursor: String
    $endCursor: String
    $sortKey: ProductCollectionSortKeys
    $reverse: Boolean
  ) @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      products(first: $first, last: $last, before: $startCursor, after: $endCursor, sortKey: $sortKey, reverse: $reverse) {
        nodes { ...ProductItem }
        pageInfo { hasPreviousPage hasNextPage endCursor startCursor }
      }
    }
  }
` as const;
```

→ **各Edit後に Read で末尾確認** + `npm run build`

---

## 確認チェックリスト

1. [ ] _index.tsx — 末尾が `as const;` で終わっている（3つのGraphQLクエリ全て存在）
2. [ ] collections.$handle.tsx — 末尾が `as const;` で終わっている（COLLECTION_QUERY存在）
3. [ ] `npm run build` エラーなし
4. [ ] `npx tsc --noEmit` 型エラーなし

---

## 禁止事項（7回目の切り詰めを防ぐために）

- **❌ Write は絶対に使わない**
- **❌ 1回のEditで200行以上の置換をしない**（分割する）
- **❌ Edit前にReadをしないまま編集しない**
- **❌ Edit後にReadで末尾確認をしない**
- **✅ 毎回のEdit後に `wc -l ファイル名` で行数を確認する**
