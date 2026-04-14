# Astromeda EC 全修正プロンプト V3（Claude Code用）

> **絶対ルール（破ったら即やり直し）**:
> 1. ファイル編集は **Edit（部分修正）のみ**。**Write（全体上書き）は全面禁止**。過去に5回以上ファイルが切り詰められた。
> 2. Edit する前に必ず **Read でファイル全体を確認**。現在の行数・末尾を把握してから編集する。
> 3. 各ステップ完了後に `npm run build` でビルド確認。エラーがあれば修正してから次へ。
> 4. 1ステップずつ完了。中途半端に残して次に進まない。

---

## 修正1: 切り詰めファイルの復旧（最優先）

### 1-A: HeroSlider.tsx（211行で切り詰め）

**まず Read で現在の末尾を確認**。211行目付近が `border: 'none',` で途切れているはず。

以下をファイル末尾に**追加（append）**:
```typescript
                background: i === hi ? T.c : 'rgba(255,255,255,.3)',
                cursor: 'pointer',
                transition: 'all .3s',
              }}
              aria-label={`スライド ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

→ `npm run build` で確認

### 1-B: collections.$handle.tsx（283行で切り詰め）

**まず Read で現在の末尾を確認**。283行目が `<Image` で途切れているはず。

以下をファイル末尾に**追加（append）**:
```typescript
            data={product.featuredImage}
            alt={product.featuredImage?.altText || product.title}
            loading={loading}
            sizes="(min-width: 768px) 25vw, 50vw"
            style={{width: '100%', height: '100%', objectFit: 'cover'}}
          />
        </div>
      ) : (
        <div
          style={{
            aspectRatio: '4/3',
            background: `linear-gradient(135deg, ${al(accent, 0.1)}, transparent)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: T.t3,
            fontSize: 11,
          }}
        >
          No Image
        </div>
      )}
      <div style={{padding: '10px 0'}}>
        <h3
          style={{
            fontSize: 'clamp(10px, 1.2vw, 13px)',
            fontWeight: 700,
            color: T.tx,
            lineHeight: 1.4,
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}
        >
          {product.title}
        </h3>
        {hasSpec && (
          <div style={{display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4}}>
            {gpu && <span style={{fontSize: 8, background: al(T.c, 0.1), color: T.c, padding: '1px 5px', borderRadius: 3}}>{gpu}</span>}
            {cpu && <span style={{fontSize: 8, background: al(T.g, 0.1), color: T.g, padding: '1px 5px', borderRadius: 3}}>{cpu}</span>}
            {ram && <span style={{fontSize: 8, background: al('#a855f7', 0.1), color: '#a855f7', padding: '1px 5px', borderRadius: 3}}>{ram}</span>}
          </div>
        )}
        <div style={{marginTop: 6}}>
          <span
            style={{
              fontSize: 'clamp(12px, 1.4vw, 16px)',
              fontWeight: 900,
              color: T.c,
            }}
          >
            {product.priceRange.minVariantPrice.amount !== '0.0'
              ? `¥${Number(product.priceRange.minVariantPrice.amount).toLocaleString()}`
              : '価格はお問い合わせ'}
          </span>
        </div>
      </div>

      <style>{`
        .astro-product-card {
          background: ${T.bgC};
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid ${T.t1};
          transition: transform .2s, border-color .2s;
        }
        .astro-product-card:hover {
          transform: translateY(-3px);
          border-color: ${al(accent, 0.3)};
        }
      `}</style>
    </Link>
  );
}

const PRODUCT_ITEM_FRAGMENT = `#graphql
  fragment ProductItem on Product {
    id
    handle
    title
    tags
    featuredImage {
      id
      altText
      url
      width
      height
    }
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
    }
    variants(first: 1) {
      nodes {
        availableForSale
        selectedOptions {
          name
          value
        }
      }
    }
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
      products(
        first: $first,
        last: $last,
        before: $startCursor,
        after: $endCursor,
        sortKey: $sortKey,
        reverse: $reverse
      ) {
        nodes {
          ...ProductItem
        }
        pageInfo {
          hasPreviousPage
          hasNextPage
          endCursor
          startCursor
        }
      }
    }
  }
` as const;
```

→ `npm run build` で確認

---

## 修正2: 販売中止IPの削除 + バナーURL追加

### 2-A: `app/lib/astromeda-data.ts` から以下3つのIPを**完全削除**

削除対象（商品0件確認済み）:
- `blackdesert`（黒い砂漠）— コレクション商品0件
- `milpr`（ミリプロ）— コレクション商品0件
- `imas-ml`（アイマス ミリオンライブ）— コレクション不在・商品0件

COLLABS配列から該当の3行を削除する。

### 2-B: 未特定だった4IPのバナーURLを追加

以下4IPの `banner` フィールドを追加（現在は `banner` なし）:

| IP | id | 追加する banner 値 |
|---|---|---|
| ヒロアカ | heroaca | `CDN + '4_bcb98c4b-a189-4c51-8ee2-a359a7d472f1.png'` |
| サンリオ | sanrio | `CDN + '1780_1000px_c737ae38-2ee0-43ff-ad11-3771481ab08e.png'` |
| 呪術廻戦 | jujutsu | `CDN + '6_c8eeace5-f17f-481a-bcdb-2e0a7e7693a2.png'` |
| チェンソーマン | chainsawman | `CDN + '9_d1f84bb0-3955-4755-94f8-3c04cd27686f.png'` |

CDN定数は既にファイル内に定義済み: `const CDN = 'https://cdn.shopify.com/s/files/1/0741/0407/8628/files/';`

例（heroaca行の修正前）:
```
{ id: 'heroaca', ..., shop: 'heroaca-collaboration' },
```
修正後:
```
{ id: 'heroaca', ..., shop: 'heroaca-collaboration', banner: CDN + '4_bcb98c4b-a189-4c51-8ee2-a359a7d472f1.png' },
```

→ `npm run build` で確認

---

## 修正3: IPごと × 製品タイプ別フィルタリングUI

### 目的
ガジェット・グッズコレクションに26タイトルの製品が混在。ユーザーは「NARUTOのマウスパッドだけ見たい」等のニーズがある。

### 3-A: `app/routes/collections.$handle.tsx` にフィルタリングロジック追加

Collectionコンポーネント内に `useState` と `useMemo` を追加:

```typescript
import {useState, useMemo} from 'react';
```

IPマッチング定数（コンポーネント外に定義）:
```typescript
const IP_TAG_MAP: Record<string, string[]> = {
  'onepiece': ['ワンピース', 'ONE PIECE', 'バウンティラッシュ'],
  'naruto': ['ナルト', 'NARUTO'],
  'heroaca': ['ヒロアカ', 'ヒーローアカデミア'],
  'sf6': ['スト6', 'ストリートファイター', 'SF6'],
  'sanrio': ['サンリオ', 'キティ', 'シナモロール', 'マイメロ', 'クロミ', 'ポムポムプリン'],
  'sonic': ['ソニック', 'SONIC'],
  'jujutsu': ['呪術', 'jujutsu'],
  'chainsawman': ['チェンソーマン', 'chainsaw'],
  'bocchi': ['ぼざろ', 'ぼっち'],
  'hololive-en': ['ホロライブ', 'hololive', 'ホロEN'],
  'bleach-ros': ['BLEACH Rebirth'],
  'bleach-tybw': ['BLEACH 千年', 'BLEACH アニメ'],
  'geass': ['コードギアス', 'ギアス', 'ルルーシュ'],
  'tokyoghoul': ['東京喰種', '喰種'],
  'lovelive': ['ラブライブ', 'LoveLive'],
  'sao': ['SAO', 'ソードアート'],
  'yurucamp': ['ゆるキャン'],
  'pacmas': ['パックマス', 'パクマス'],
  'sumikko': ['すみっコ'],
  'rilakkuma': ['リラックマ'],
  'garupan': ['ガルパン', 'ガールズ＆パンツァー'],
  'nitowai': ['新兎わい', 'にとわい'],
  'palworld': ['パルワールド', 'Palworld'],
};

const PRODUCT_TYPE_KW: Record<string, string[]> = {
  'マウスパッド': ['マウスパッド'],
  'キーボード': ['キーボード'],
  'パネル': ['パネル', '着せ替え'],
  'PCケース': ['PCケース', 'ケースファン'],
  'アクスタ': ['アクリルスタンド', 'アクスタ', 'アクリル'],
  'グッズ': ['Tシャツ', 'パーカー', '缶バッジ', 'メタルカード'],
};

function detectIP(title: string, tags: string[]): string | null {
  const text = title + ' ' + tags.join(' ');
  for (const [id, kws] of Object.entries(IP_TAG_MAP)) {
    if (kws.some(kw => text.includes(kw))) return id;
  }
  return null;
}

function detectType(title: string): string | null {
  for (const [type, kws] of Object.entries(PRODUCT_TYPE_KW)) {
    if (kws.some(kw => title.includes(kw))) return type;
  }
  return null;
}
```

### 3-B: Collectionコンポーネント内でフィルタリング

```typescript
const [ipFilter, setIpFilter] = useState<string | null>(null);
const [typeFilter, setTypeFilter] = useState<string | null>(null);

const allProducts = collection.products.nodes;

const annotated = useMemo(() =>
  allProducts.map((p: any) => ({
    ...p,
    _ip: detectIP(p.title, p.tags || []),
    _type: detectType(p.title),
  })),
[allProducts]);

const availableIPs = useMemo(() => {
  const s = new Set(annotated.map((p: any) => p._ip).filter(Boolean));
  return [...s].sort((a, b) => {
    const ai = COLLABS.findIndex(c => c.id === a);
    const bi = COLLABS.findIndex(c => c.id === b);
    return ai - bi;
  });
}, [annotated]);

const availableTypes = useMemo(() => {
  const s = new Set(annotated.map((p: any) => p._type).filter(Boolean));
  return [...s];
}, [annotated]);

const filtered = useMemo(() =>
  annotated.filter((p: any) => {
    if (ipFilter && p._ip !== ipFilter) return false;
    if (typeFilter && p._type !== typeFilter) return false;
    return true;
  }),
[annotated, ipFilter, typeFilter]);
```

### 3-C: フィルターチップUI

ソートバー（`{/* Sort bar */}` の div）の**直後**に以下を追加:

```tsx
{/* Filter chips */}
{(availableIPs.length > 1 || availableTypes.length > 1) && (
  <div style={{
    padding: '8px clamp(16px, 4vw, 48px)',
    borderBottom: `1px solid ${T.t1}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  }}>
    {availableIPs.length > 1 && (
      <div style={{display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 4}}>
        <span style={{fontSize: 10, color: T.t4, flexShrink: 0}}>IP：</span>
        <button type="button" onClick={() => setIpFilter(null)} style={{
          fontSize: 10, fontWeight: !ipFilter ? 800 : 500,
          color: !ipFilter ? T.c : T.t5,
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
              fontSize: 10, fontWeight: on ? 800 : 500,
              color: on ? c.accent : T.t5,
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
          fontSize: 10, fontWeight: !typeFilter ? 800 : 500,
          color: !typeFilter ? T.g : T.t5,
          padding: '4px 10px', borderRadius: 16,
          border: `1px solid ${!typeFilter ? al(T.g, 0.4) : T.t1}`,
          background: !typeFilter ? al(T.g, 0.08) : 'transparent',
          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
        }}>すべて</button>
        {availableTypes.map((type) => {
          const on = typeFilter === type;
          return (
            <button type="button" key={type} onClick={() => setTypeFilter(on ? null : type)} style={{
              fontSize: 10, fontWeight: on ? 800 : 500,
              color: on ? T.g : T.t5,
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
        {filtered.length}件表示
        {ipFilter && ` / ${COLLABS.find(c => c.id === ipFilter)?.name ?? ipFilter}`}
        {typeFilter && ` / ${typeFilter}`}
      </div>
    )}
  </div>
)}
```

### 3-D: 製品グリッドをフィルター結果で表示

PaginatedResourceSection の箇所を、フィルターが適用されている場合は `filtered` リストで表示するように変更:

```tsx
{/* Products grid */}
<div style={{padding: 'clamp(20px, 3vw, 40px) clamp(16px, 4vw, 48px)'}}>
  {(ipFilter || typeFilter) ? (
    // フィルター適用時: クライアントサイドフィルタ済みリスト
    <div className="astro-products-grid">
      {filtered.map((product: any, index: number) => (
        <AstroProductItem
          key={product.id}
          product={product}
          accent={accent}
          loading={index < 8 ? 'eager' : undefined}
        />
      ))}
      {filtered.length === 0 && (
        <div style={{gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: T.t4}}>
          該当する商品がありません
        </div>
      )}
    </div>
  ) : (
    // フィルターなし: 通常のページネーション
    <PaginatedResourceSection<any>
      connection={collection.products}
      resourcesClassName="astro-products-grid"
    >
      {({node: product, index}: any) => (
        <AstroProductItem
          key={product.id}
          product={product}
          accent={accent}
          loading={index < 8 ? 'eager' : undefined}
        />
      )}
    </PaginatedResourceSection>
  )}
</div>
```

→ `npm run build` で確認

---

## 修正4: CLAUDE.md を更新

`CLAUDE.md` の以下を更新:

### 4-A: 「親コレクション未作成」リストから黒い砂漠・ミリプロ・アイマスMLを削除
これらは販売中止のため記載不要。

### 4-B: 「確認済みShopifyコレクションハンドル」テーブルに注記
> 販売中止・削除済み: 黒い砂漠、ミリプロ、アイマスミリオンライブ

### 4-C: IPコラボレーション数を更新
26タイトル → **23タイトル**（3件削除）

---

## 修正5: _index.tsx の IP_HANDLES 配列から削除済みIPを除去

`app/routes/_index.tsx` 内の `IP_HANDLES` 配列（または `IP_COLLECTIONS_BY_HANDLE_QUERY` ）から以下3つのハンドルを**削除**:

- `'imas-millionlive-collaboration'`
- `'milpr-pc'`
- `'black-desert-collaboration'`

→ `npm run build` で確認

---

## 最終チェックリスト

全修正完了後に **1つずつ** 確認:

1. [ ] `npm run build` エラーなし
2. [ ] `npx tsc --noEmit` 型エラーなし
3. [ ] HeroSlider.tsx — ファイルが正常に閉じている（最終行が `}` ）
4. [ ] collections.$handle.tsx — ファイルが正常に閉じている（最終行が `as const;` ）
5. [ ] astromeda-data.ts — COLLABS配列が23件（blackdesert, milpr, imas-ml が存在しない）
6. [ ] astromeda-data.ts — 全9 FEATURED IPに banner フィールドがある
7. [ ] コレクションページにIPフィルターチップが表示される（複数IPがある場合のみ）
8. [ ] コレクションページに製品タイプフィルターチップが表示される（複数タイプがある場合のみ）
9. [ ] `npm run dev` でローカル動作確認

---

## 禁止事項（厳守）

- **Write でファイル全体を上書きしない** → **必ず Edit で部分修正のみ**
- **Edit する前に Read しない** → 禁止。必ず先に Read。
- 画像をローカル保存しない
- 本番切り替えはしない
- 作業を中途半端に残して次に進まない
