/**
 * ProductCategoryView — patch 0198 (2026-04-28)
 *
 * 旧「カスタマイズマトリックス」(タグ × option の 2D 表) を全面置換する
 * 「商品種類別」ビュー。CEO 指摘:
 *   「ゲーミングPCにのみつくのか、すべてのIPコラボについてしまうのか、不明」
 *   → このプルダウンが「どの商品種類に出るか」を 1 秒で見せる
 *
 * Layout:
 *   ┌─ ゲーミングPC (238件) ─────────────────┐
 *   │ メモリ容量 / ストレージ / CPUクーラー...│ ← 該当プルダウン一覧
 *   └────────────────────────────────────────┘
 *   ┌─ マウスパッド (45件) ──────────────────┐
 *   │ 素材 / サイズ                          │
 *   └────────────────────────────────────────┘
 *   ... 9 カテゴリカード
 *
 * ロジック:
 *   - 商品全件 (max 250) を `detectProductType` で 9 バケットに分類
 *   - 各バケットの商品 tags を集約し、その tag セットに当たるプルダウン (appliesToTags)
 *     を「このカテゴリに出る」として一覧表示
 *   - appliesToTags が空のプルダウンは全カテゴリで「全商品適用」表示
 *
 * 編集はモーダル経由。各プルダウンチップの「編集」をクリックすると
 * AdminCustomization の編集モーダルが開く (onEditOption コールバック経由)。
 */
import {useEffect, useMemo, useState} from 'react';
import {color, font, radius} from '~/lib/design-tokens';
import {AdminListSkeleton, AdminEmptyCard} from '~/components/admin/ds/InlineListState';
import {detectProductType} from '~/lib/collection-helpers';

// CustomizationEntry は AdminCustomization.tsx と互換 (export しないインライン型)
interface CustomizationEntry {
  id: string;
  handle: string;
  name: string;
  category: string;
  appliesToTags: string;
  isRequired: boolean;
  sortOrder: number;
}

interface Product {
  id: string;
  title: string;
  tags: string[];
}

interface ProductBucket {
  type: string; // detectProductType 戻り値、null は "その他"
  label: string;
  emoji: string;
  products: Product[];
  // バケット内商品が持つタグの集合
  tagSet: Set<string>;
}

// 表示順序: ゲーミングPC を最上に置く (CEO 頻度高)
const BUCKET_ORDER: Array<{type: string; label: string; emoji: string}> = [
  {type: 'ゲーミングPC', label: 'ゲーミングPC', emoji: '🖥️'},
  {type: 'マウスパッド', label: 'マウスパッド', emoji: '🖱️'},
  {type: 'キーボード', label: 'キーボード', emoji: '⌨️'},
  {type: 'PCケース', label: 'PCケース', emoji: '🗄️'},
  {type: 'パネル', label: 'PCパネル/着せ替え', emoji: '🎨'},
  {type: 'アクリルスタンド', label: 'アクリルスタンド', emoji: '🪧'},
  {type: 'アクリルキーホルダー', label: 'アクリルキーホルダー', emoji: '🔑'},
  {type: 'Tシャツ', label: 'Tシャツ', emoji: '👕'},
  {type: 'OTHER', label: 'その他', emoji: '📦'},
];

// プルダウンが「このバケットで表示されるか」判定
//   - appliesToTags が空 → 全商品適用なので必ず ON
//   - appliesToTags に含まれるタグが、バケット内商品の tagSet と1つでも重なれば ON
function isOptionInBucket(opt: CustomizationEntry, bucket: ProductBucket): boolean {
  const tags = opt.appliesToTags
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tags.length === 0) return true;
  for (const t of tags) {
    if (bucket.tagSet.has(t)) return true;
  }
  return false;
}

interface ProductCategoryViewProps {
  options: CustomizationEntry[];
  onEditOption: (id: string) => void;
}

export default function ProductCategoryView({options, onEditOption}: ProductCategoryViewProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 全商品 (最大 250 件) ロード
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const all: Product[] = [];
        let cursor: string | undefined = undefined;
        for (let page = 0; page < 5; page++) {
          const url = cursor
            ? `/api/admin/products?limit=50&cursor=${encodeURIComponent(cursor)}`
            : '/api/admin/products?limit=50';
          const res = await fetch(url);
          if (!res.ok) throw new Error(`商品取得失敗 (${res.status})`);
          const json = (await res.json()) as {
            products?: Array<{id: string; title: string; tags?: string[]}>;
            pageInfo?: {hasNextPage: boolean; endCursor: string | null};
          };
          for (const p of json.products || []) {
            all.push({id: p.id, title: p.title, tags: p.tags || []});
          }
          if (!json.pageInfo?.hasNextPage) break;
          cursor = json.pageInfo.endCursor || undefined;
          if (!cursor) break;
        }
        if (!cancelled) {
          setProducts(all);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '商品取得に失敗しました');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // バケット計算 (商品とプルダウンが揃ってからまとめて再計算)
  const buckets: ProductBucket[] = useMemo(() => {
    const map = new Map<string, ProductBucket>();
    for (const b of BUCKET_ORDER) {
      map.set(b.type, {type: b.type, label: b.label, emoji: b.emoji, products: [], tagSet: new Set()});
    }
    for (const p of products) {
      const type = detectProductType(p.title, p.tags) || 'OTHER';
      const bucket = map.get(type) || map.get('OTHER')!;
      bucket.products.push(p);
      for (const t of p.tags) {
        const norm = t.trim().toLowerCase();
        if (norm) bucket.tagSet.add(norm);
      }
    }
    return BUCKET_ORDER.map((b) => map.get(b.type)!).filter((b) => b.products.length > 0);
  }, [products]);

  if (loading) return <AdminListSkeleton rows={4} />;

  if (error) {
    return (
      <div
        style={{
          padding: 16,
          background: '#3a1515',
          color: '#ff6b6b',
          borderRadius: radius.md,
          fontSize: font.sm,
        }}
      >
        {error}
      </div>
    );
  }

  if (buckets.length === 0) {
    return (
      <AdminEmptyCard
        icon="📂"
        title="商品が見つかりません"
        description="まだ Shopify に商品が登録されていないため、カテゴリ別ビューが作れません。"
      />
    );
  }

  // 全商品適用 (appliesToTags 空) のプルダウンは別枠で表示
  const universalOptions = options.filter((o) => o.appliesToTags.trim() === '');

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
      {/* 全商品適用プルダウン (バケット別表示の前に強調表示) */}
      {universalOptions.length > 0 && (
        <div
          style={{
            padding: 14,
            background: `${color.cyan}11`,
            border: `1px solid ${color.cyan}55`,
            borderRadius: radius.lg,
          }}
        >
          <div style={{fontSize: 12, fontWeight: 700, color: color.cyan, marginBottom: 10}}>
            🌐 すべての商品に出るプルダウン ({universalOptions.length} 件)
          </div>
          <div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
            {universalOptions
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((opt) => (
                <PulldownChip
                  key={opt.id}
                  name={opt.name}
                  isUniversal
                  onEdit={() => onEditOption(opt.id)}
                />
              ))}
          </div>
        </div>
      )}

      {/* バケット別カード */}
      {buckets.map((bucket) => {
        const matched = options
          .filter((o) => o.appliesToTags.trim() !== '') // 全商品適用は universal 枠で表示済み
          .filter((o) => isOptionInBucket(o, bucket))
          .sort((a, b) => a.sortOrder - b.sortOrder);
        return (
          <div
            key={bucket.type}
            style={{
              padding: 14,
              background: color.bg1,
              border: `1px solid ${color.border}`,
              borderRadius: radius.lg,
            }}
          >
            <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10}}>
              <div style={{fontSize: 22}}>{bucket.emoji}</div>
              <div style={{flex: 1}}>
                <div style={{fontSize: 14, fontWeight: 800, color: color.text}}>{bucket.label}</div>
                <div style={{fontSize: 11, color: color.textMuted, marginTop: 2}}>
                  {bucket.products.length} 商品 / プルダウン {matched.length + universalOptions.length} 件
                  {universalOptions.length > 0 && (
                    <span style={{color: color.cyan, marginLeft: 6}}>
                      (うち全商品共通 {universalOptions.length} 件)
                    </span>
                  )}
                </div>
              </div>
            </div>
            {matched.length === 0 ? (
              <div
                style={{
                  fontSize: 11,
                  color: color.textMuted,
                  padding: '10px 12px',
                  background: color.bg0,
                  borderRadius: radius.md,
                  fontStyle: 'italic',
                }}
              >
                {universalOptions.length > 0
                  ? '↑ 上記の全商品共通プルダウンのみ表示されます'
                  : 'このカテゴリ専用プルダウンは未設定です'}
              </div>
            ) : (
              <div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
                {matched.map((opt) => (
                  <PulldownChip
                    key={opt.id}
                    name={opt.name}
                    isUniversal={false}
                    onEdit={() => onEditOption(opt.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div style={{fontSize: 10, color: color.textMuted, marginTop: 4, lineHeight: 1.6}}>
        💡 各プルダウンの 「編集」 を押すと、対象商品タグやプルダウン項目を変更できます。
        <br />
        💡 「🌐 すべての商品に出るプルダウン」は対象タグが未設定なので全カテゴリに表示されます。
        ゲーミングPC専用にするには、編集モーダルで対象タグを設定してください。
      </div>
    </div>
  );
}

// ── プルダウンチップ ──
interface PulldownChipProps {
  name: string;
  isUniversal: boolean;
  onEdit: () => void;
}

function PulldownChip({name, isUniversal, onEdit}: PulldownChipProps) {
  return (
    <button
      type="button"
      onClick={onEdit}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        background: isUniversal ? `${color.cyan}22` : color.bg0,
        color: color.text,
        border: `1px solid ${isUniversal ? color.cyan : color.border}`,
        borderRadius: 16,
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: font.family,
      }}
      title={`「${name}」を編集`}
    >
      {isUniversal && <span style={{fontSize: 10}}>🌐</span>}
      <span>{name}</span>
      <span style={{fontSize: 9, color: color.textMuted}}>編集 ▸</span>
    </button>
  );
}
