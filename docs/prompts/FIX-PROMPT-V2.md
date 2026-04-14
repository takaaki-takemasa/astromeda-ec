# Astromeda EC 全修正プロンプト V2（Claude Code用）

> **最重要ルール**:
> 1. ファイルを編集するときは必ず **Edit（部分修正）** を使うこと。**Write（全体上書き）は禁止**。過去にWriteで何度もファイルが切り詰められている。
> 2. 各ステップ完了後に `npm run build` でビルドエラーがないことを確認。
> 3. 1つずつ完了してから次に進む。中途半端に残さない。

---

## 緊急修正A: 切り詰められたファイルの復旧

### 問題
Claude Code の過去のEdit/Write操作で2つのファイルが途中で途切れている:
- `app/components/astro/HeroSlider.tsx` — 211行で途切れ（ドットインジケーターの閉じ括弧が不完全）
- `app/routes/collections.$handle.tsx` — 283行で途切れ（AstroProductItemのImage部分が不完全）

### 修正手順

#### A-1: HeroSlider.tsx の復旧

ファイル末尾（211行目）の現在の内容を確認し、以下の不足部分を**追加**すること:

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

**確認**: ファイルが正常に閉じていること（`export function HeroSlider` のreturn文が完結している）。

#### A-2: collections.$handle.tsx の復旧

ファイル末尾（283行目 `<Image` ）の現在の内容を確認し、以下の不足部分を**追加**すること:

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

**ビルド確認**: `npm run build` でエラーがないこと。

---

## 修正B: IPごと × 製品タイプ別のクライアントサイドフィルタリング

### 設計思想
ガジェットやグッズのコレクションには26タイトル分の製品が混在している。ユーザーは「NARUTOのマウスパッドだけ見たい」「ぼっちのキーボードだけ見たい」というニーズがある。

Shopify Storefront APIのフィルタリングは限定的（タグフィルターは使えるが、UIとの連動が複雑）なので、**クライアントサイドフィルタリング**で実装する。

### タグ構造（Shopify実データから確認済み）
- IP識別タグ: `IP:ぼざろ`, `IP:ガルパン`, `IP:コードギアス`, `IP:パックマス` など一部は `IP:` プレフィックス。それ以外は IP名を直接タグ付け（`サンリオ`, `ヒロアカ`, `ワンピース`, `東京喰種`, `SAO`, `スト6`, `ホロライブEN` 等）
- 製品タイプタグ: `【マウスパッド】`, `【着せ替え】` 等のサフィックス。ただし不統一。
- 商品タイトルから製品タイプを判別するのが最も確実: `マウスパッド`, `キーボード`, `パネル`, `PCケース`, `アクリル`, `Tシャツ`, `パーカー` 等

### 実装: `app/routes/collections.$handle.tsx` に追加

#### B-1: IPマッチング用のマッピング定数を追加

```typescript
// IPタグマッチング（タグまたはタイトルに含まれるキーワード → COLLABS ID）
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
  'bleach-ros': ['BLEACH Rebirth', 'ブリーチROS'],
  'bleach-tybw': ['BLEACH 千年', 'ブリーチ千年', 'BLEACH アニメ'],
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
  'imas-ml': ['アイマス', 'ミリオンライブ'],
  'milpr': ['ミリプロ'],
  'blackdesert': ['黒い砂漠'],
};

// 製品タイプ判別（タイトルキーワード）
const PRODUCT_TYPE_KEYWORDS: Record<string, string[]> = {
  'PC': ['ゲーミングPC', 'GAMER', 'STREAMER', 'CREATOR', 'コラボレーションPC', 'コラボPC'],
  'マウスパッド': ['マウスパッド', 'mousepad'],
  'キーボード': ['キーボード', 'keyboard'],
  'パネル': ['パネル', '着せ替え'],
  'PCケース': ['PCケース', 'ケースファン'],
  'アクスタ': ['アクリルスタンド', 'アクスタ'],
  'その他グッズ': ['Tシャツ', 'パーカー', '缶バッジ', 'メタルカード'],
};

function detectIP(product: {title: string; tags: string[]}): string | null {
  const text = product.title + ' ' + product.tags.join(' ');
  for (const [id, keywords] of Object.entries(IP_TAG_MAP)) {
    if (keywords.some(kw => text.includes(kw))) return id;
  }
  return null;
}

function detectProductType(title: string): string | null {
  for (const [type, keywords] of Object.entries(PRODUCT_TYPE_KEYWORDS)) {
    if (keywords.some(kw => title.includes(kw))) return type;
  }
  return null;
}
```

#### B-2: フィルターUI（IPチップ＋製品タイプチップ）

コレクションページの ソートバーの下に 2段のフィルターチップを追加:

```tsx
{/* IP フィルター */}
<div style={{
  padding: '8px clamp(16px, 4vw, 48px)',
  borderBottom: `1px solid ${T.t1}`,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}}>
  {/* IP行 */}
  <div style={{display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 4}}>
    <span style={{fontSize: 10, color: T.t4, flexShrink: 0}}>IP：</span>
    <button
      onClick={() => setIpFilter(null)}
      style={{
        fontSize: 10, fontWeight: ipFilter === null ? 800 : 500,
        color: ipFilter === null ? T.c : T.t5,
        padding: '4px 10px', borderRadius: 16,
        border: `1px solid ${ipFilter === null ? al(T.c, 0.4) : T.t1}`,
        background: ipFilter === null ? al(T.c, 0.08) : 'transparent',
        cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      すべて
    </button>
    {availableIPs.map(ip => {
      const collab = COLLABS.find(c => c.id === ip);
      if (!collab) return null;
      return (
        <button
          key={ip}
          onClick={() => setIpFilter(ip === ipFilter ? null : ip)}
          style={{
            fontSize: 10, fontWeight: ipFilter === ip ? 800 : 500,
            color: ipFilter === ip ? collab.accent : T.t5,
            padding: '4px 10px', borderRadius: 16,
            border: `1px solid ${ipFilter === ip ? al(collab.accent, 0.4) : T.t1}`,
            background: ipFilter === ip ? al(collab.accent, 0.08) : 'transparent',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          {collab.name.length > 10 ? collab.name.slice(0, 10) + '…' : collab.name}
        </button>
      );
    })}
  </div>

  {/* 製品タイプ行 */}
  <div style={{display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 4}}>
    <span style={{fontSize: 10, color: T.t4, flexShrink: 0}}>種類：</span>
    <button
      onClick={() => setTypeFilter(null)}
      style={{
        fontSize: 10, fontWeight: typeFilter === null ? 800 : 500,
        color: typeFilter === null ? T.g : T.t5,
        padding: '4px 10px', borderRadius: 16,
        border: `1px solid ${typeFilter === null ? al(T.g, 0.4) : T.t1}`,
        background: typeFilter === null ? al(T.g, 0.08) : 'transparent',
        cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      すべて
    </button>
    {availableTypes.map(type => (
      <button
        key={type}
        onClick={() => setTypeFilter(type === typeFilter ? null : type)}
        style={{
          fontSize: 10, fontWeight: typeFilter === type ? 800 : 500,
          color: typeFilter === type ? T.g : T.t5,
          padding: '4px 10px', borderRadius: 16,
          border: `1px solid ${typeFilter === type ? al(T.g, 0.4) : T.t1}`,
          background: typeFilter === type ? al(T.g, 0.08) : 'transparent',
          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >
        {type}
      </button>
    ))}
  </div>
</div>
```

#### B-3: Collection コンポーネント内にフィルタリングロジック追加

```typescript
import {useState, useMemo} from 'react';

// Collection コンポーネント内:
const [ipFilter, setIpFilter] = useState<string | null>(null);
const [typeFilter, setTypeFilter] = useState<string | null>(null);

// 全製品にIP・タイプをアノテーション
const allProducts = collection.products.nodes;
const annotated = useMemo(() => {
  return allProducts.map(p => ({
    ...p,
    _ip: detectIP({title: p.title, tags: (p as any).tags || []}),
    _type: detectProductType(p.title),
  }));
}, [allProducts]);

// 利用可能なIP・タイプを抽出（製品が実際に存在するもののみ）
const availableIPs = useMemo(() => {
  const ipSet = new Set(annotated.map(p => p._ip).filter(Boolean) as string[]);
  return [...ipSet].sort((a, b) => {
    const ai = COLLABS.findIndex(c => c.id === a);
    const bi = COLLABS.findIndex(c => c.id === b);
    return ai - bi;
  });
}, [annotated]);

const availableTypes = useMemo(() => {
  const typeSet = new Set(annotated.map(p => p._type).filter(Boolean) as string[]);
  return [...typeSet];
}, [annotated]);

// フィルタリング適用
const filteredProducts = useMemo(() => {
  return annotated.filter(p => {
    if (ipFilter && p._ip !== ipFilter) return false;
    if (typeFilter && p._type !== typeFilter) return false;
    return true;
  });
}, [annotated, ipFilter, typeFilter]);
```

#### B-4: PaginatedResourceSection の代わりにフィルター済みリストを表示

**注意**: PaginatedResourceSection はサーバーサイドページネーションを使うため、クライアントサイドフィルタリングと共存が難しい。
ガジェット・グッズコレクション（数百件）は全製品をloaderで取得するのが理想だが、Storefront APIの制限（first: 250）があるため、以下のアプローチ:

1. **loaderで first: 250 で取得**（ガジェット343件は2回に分けるか、250件で十分カバー）
2. **フィルタリングはクライアントサイド**で実行
3. **ページネーションUIは不要**（フィルタリングで件数が大幅に減るため）

ただし、250件を超えるコレクションもあるため、**段階的に実装**:
- まず `first: 250` に増やす
- フィルターが適用されていない場合は「もっと見る」ボタンでカーソルベースのロードモア

```typescript
// loader内: pageBy を 250 に増やす
const paginationVariables = getPaginationVariables(request, {pageBy: 250});
```

#### B-5: フィルター結果件数の表示

```tsx
<div style={{
  padding: '8px clamp(16px, 4vw, 48px)',
  fontSize: 11,
  color: T.t4,
}}>
  {(ipFilter || typeFilter) && (
    <span>
      {filteredProducts.length}件
      {ipFilter && ` / ${COLLABS.find(c => c.id === ipFilter)?.name}`}
      {typeFilter && ` / ${typeFilter}`}
    </span>
  )}
</div>
```

---

## 修正C: ガジェットコレクションからPC製品を除外

### 問題
Smart Collection「ガジェット」のタイトルconditionに「PCケース」が含まれるため、PC本体（タイトルに「PC」を含む）もヒットする。

### 解決策（フロントエンド側）
クライアントサイドフィルタリングで、ガジェットコレクション表示時にPC本体を除外:

```typescript
// ガジェットコレクションの場合、PC本体を除外
const isGadgetCollection = collection.handle === 'gadgets';
const isGoodsCollection = collection.handle === 'goods';

const baseProducts = useMemo(() => {
  if (isGadgetCollection) {
    return annotated.filter(p => {
      // タイトルに特定のPC本体キーワードが含まれる場合は除外
      const t = p.title;
      const isPCProduct = /\[(GAMER|STREAMER|CREATOR|LITE)\]/.test(t) ||
        (t.includes('ゲーミングPC') && !t.includes('ケース') && !t.includes('マウスパッド'));
      return !isPCProduct;
    });
  }
  return annotated;
}, [annotated, isGadgetCollection]);
```

---

## 確認チェックリスト

全修正完了後に必ず確認:

1. `npm run build` がエラーなく完了
2. `npx tsc --noEmit` で型エラーなし
3. HeroSlider.tsx がファイルとして正常に閉じている（syntax error なし）
4. collections.$handle.tsx がファイルとして正常に閉じている（syntax error なし）
5. コレクションページでIPフィルターチップが表示される
6. コレクションページで製品タイプフィルターチップが表示される
7. フィルター選択時に製品リストが絞り込まれる

---

## 禁止事項（再掲・厳守）

- **Write でファイル全体を上書きしない** → 必ず Edit で部分修正
- 画像をローカル保存しない
- 本番切り替えはしない
- 作業を中途半端に残さない
- ファイルを編集する前に必ず Read で現在の内容を確認する
