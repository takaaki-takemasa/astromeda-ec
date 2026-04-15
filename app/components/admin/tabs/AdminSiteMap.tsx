/**
 * Admin Site Map — Sprint 3 M3
 *
 * ECサイトの全ページ構造を階層ツリーで表示し、各セクションから対応する管理画面タブへワンクリックで遷移できる。
 * CEOの「どこを変えればどこが変わるかが分からない」問題を解決する最重要ナビゲーション機能。
 */

import React, {useCallback, useEffect, useState} from 'react';
import {useSearchParams} from 'react-router';
import {T, al, COLLABS, FEATURED, PC_COLORS} from '~/lib/astromeda-data';

// ── 型定義 ──
interface SectionCounts {
  metaBanners: number;
  metaCollabs: number;
  metaColors: number;
  metaCategoryCards: number;
  metaProductShelves: number;
  metaAboutSections: number;
  metaFooterConfigs: number;
  metaCustomOptions: number;
}

interface NodeConfig {
  label: string;
  desc?: string;
  target: 'internal' | 'external' | 'disabled';
  tab?: string;
  sub?: string;
  url?: string;
  metaCount?: number | null;
  fallbackCount?: number | null;
  fallbackLabel?: string;
}

interface PageGroup {
  icon: string;
  title: string;
  path?: string;
  nodes: NodeConfig[];
}

// ── スタイル ──
const cardStyle: React.CSSProperties = {
  background: T.bgC,
  border: `1px solid ${al(T.tx, 0.08)}`,
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
};

export default function AdminSiteMap() {
  const [, setSearchParams] = useSearchParams();
  const [counts, setCounts] = useState<SectionCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    homepage: true,
    productDetail: false,
    content: false,
    marketing: false,
    common: false,
  });

  const loadCounts = useCallback(async () => {
    setLoading(true);
    const fetchJson = async <T,>(endpoint: string): Promise<T | null> => {
      try {
        const res = await fetch(endpoint, {credentials: 'include'});
        if (!res.ok) return null;
        return (await res.json()) as T;
      } catch {
        return null;
      }
    };
    const [
      homepageRes,
      colorRes,
      catRes,
      shelfRes,
      aboutRes,
      footerRes,
      customRes,
    ] = await Promise.all([
      fetchJson<{collabs?: unknown[]; banners?: unknown[]}>('/api/admin/homepage'),
      fetchJson<{colorModels?: unknown[]}>('/api/admin/color-models'),
      fetchJson<{categoryCards?: unknown[]}>('/api/admin/category-cards'),
      fetchJson<{productShelves?: unknown[]}>('/api/admin/product-shelves'),
      fetchJson<{aboutSections?: unknown[]}>('/api/admin/about-sections'),
      fetchJson<{footerConfigs?: unknown[]}>('/api/admin/footer-configs'),
      fetchJson<{options?: unknown[]}>('/api/admin/customization'),
    ]);
    setCounts({
      metaCollabs: homepageRes?.collabs?.length ?? 0,
      metaBanners: homepageRes?.banners?.length ?? 0,
      metaColors: colorRes?.colorModels?.length ?? 0,
      metaCategoryCards: catRes?.categoryCards?.length ?? 0,
      metaProductShelves: shelfRes?.productShelves?.length ?? 0,
      metaAboutSections: aboutRes?.aboutSections?.length ?? 0,
      metaFooterConfigs: footerRes?.footerConfigs?.length ?? 0,
      metaCustomOptions: customRes?.options?.length ?? 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const navigate = useCallback(
    (tab: string, sub?: string) => {
      const next: Record<string, string> = {tab};
      if (sub) next.sub = sub;
      setSearchParams(next);
    },
    [setSearchParams],
  );

  const toggleExpand = (key: string) => setExpanded((prev) => ({...prev, [key]: !prev[key]}));

  // ── ツリー構成（counts 取得後に評価される） ──
  const groups: PageGroup[] = [
    {
      icon: '🏠',
      title: 'ホームページ',
      path: '/',
      nodes: [
        {
          label: 'Heroスライダー',
          desc: 'トップのヒーローバナー(自動再生)',
          target: 'internal',
          tab: 'homepage',
          sub: 'banners',
          metaCount: counts?.metaBanners ?? null,
          fallbackCount: FEATURED.length,
          fallbackLabel: 'ハードコード',
        },
        {
          label: 'IPコラボグリッド',
          desc: 'アニメ/ゲームIPコラボ商品カード',
          target: 'internal',
          tab: 'homepage',
          sub: 'collabs',
          metaCount: counts?.metaCollabs ?? null,
          fallbackCount: COLLABS.length,
          fallbackLabel: 'ハードコード',
        },
        {
          label: 'PC 8色カラー',
          desc: 'PCShowcase カラーバリエーション',
          target: 'internal',
          tab: 'pageEditor',
          sub: 'color_models',
          metaCount: counts?.metaColors ?? null,
          fallbackCount: PC_COLORS.length,
          fallbackLabel: 'ハードコード',
        },
        {
          label: 'CATEGORYカード',
          desc: 'ゲーミングPC/ガジェット/グッズ',
          target: 'internal',
          tab: 'pageEditor',
          sub: 'category_cards',
          metaCount: counts?.metaCategoryCards ?? null,
          fallbackCount: 3,
          fallbackLabel: 'ハードコード',
        },
        {
          label: 'NEW ARRIVALS (商品棚)',
          desc: '特集商品シェルフ',
          target: 'internal',
          tab: 'pageEditor',
          sub: 'product_shelves',
          metaCount: counts?.metaProductShelves ?? null,
          fallbackCount: null,
          fallbackLabel: 'Storefront API (動的)',
        },
        {
          label: 'ASTROMEDAとは?',
          desc: 'ABOUTコンパクトバナー',
          target: 'internal',
          tab: 'pageEditor',
          sub: 'about_sections',
          metaCount: counts?.metaAboutSections ?? null,
          fallbackCount: 1,
          fallbackLabel: 'ハードコード',
        },
        {
          label: 'Footer',
          desc: '下部リンクセクション',
          target: 'internal',
          tab: 'pageEditor',
          sub: 'footer_configs',
          metaCount: counts?.metaFooterConfigs ?? null,
          fallbackCount: 13,
          fallbackLabel: 'ハードコード',
        },
      ],
    },
    {
      icon: '🛒',
      title: '商品詳細ページ',
      path: '/products/:handle',
      nodes: [
        {
          label: '商品情報',
          desc: 'タイトル/価格/バリアント/画像/公開',
          target: 'external',
          url: '/admin/products',
          metaCount: null,
          fallbackCount: null,
          fallbackLabel: 'Shopify Admin API 経由',
        },
        {
          label: 'カスタマイズプルダウン',
          desc: 'CPU/GPU/メモリ等の選択肢',
          target: 'internal',
          tab: 'customization',
          metaCount: counts?.metaCustomOptions ?? null,
          fallbackCount: null,
          fallbackLabel: '',
        },
        {
          label: '関連商品',
          desc: 'Sprint 4 で実装予定',
          target: 'disabled',
        },
      ],
    },
    {
      icon: '📝',
      title: 'コンテンツ',
      nodes: [
        {
          label: '記事コンテンツ',
          desc: 'ContentWriter Agent 出力',
          target: 'internal',
          tab: 'content',
          metaCount: null,
          fallbackCount: null,
          fallbackLabel: '',
        },
      ],
    },
    {
      icon: '🎯',
      title: 'マーケティング',
      nodes: [
        {
          label: 'キャンペーン',
          desc: '割引コード/期間限定セール',
          target: 'internal',
          tab: 'marketing',
          metaCount: null,
          fallbackCount: null,
          fallbackLabel: '',
        },
      ],
    },
    {
      icon: '🌐',
      title: '共通要素',
      nodes: [
        {
          label: 'フッター',
          desc: '全ページ下部に表示',
          target: 'internal',
          tab: 'pageEditor',
          sub: 'footer_configs',
          metaCount: counts?.metaFooterConfigs ?? null,
          fallbackCount: 13,
          fallbackLabel: 'ハードコード',
        },
        {
          label: 'ヘッダーナビ',
          desc: 'Shopify Admin で管理',
          target: 'disabled',
        },
      ],
    },
  ];

  const groupKey = (g: PageGroup) => g.title;

  return (
    <div style={{padding: 20, color: T.tx}}>
      <div style={{marginBottom: 20}}>
        <h2 style={{fontSize: 20, fontWeight: 900, margin: 0, color: T.tx}}>🗺️ サイトマップ</h2>
        <div style={{fontSize: 12, color: T.t4, marginTop: 6, lineHeight: 1.6}}>
          ECサイトの全ページ構成要素を一覧表示します。各セクションの「編集する →」を押すと対応する管理タブに遷移します。
        </div>
        {loading && (
          <div style={{fontSize: 11, color: T.c, marginTop: 6}}>データ件数を取得中...</div>
        )}
      </div>

      {groups.map((group) => {
        const key = groupKey(group);
        const isOpen = expanded[key] ?? false;
        return (
          <div key={key} style={cardStyle}>
            <button
              type="button"
              onClick={() => toggleExpand(key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                width: '100%',
                padding: 0,
                fontFamily: 'inherit',
              }}
            >
              <span style={{fontSize: 20}}>{group.icon}</span>
              <div style={{flex: 1, textAlign: 'left'}}>
                <div style={{fontSize: 15, fontWeight: 900, color: T.tx}}>{group.title}</div>
                {group.path && (
                  <div style={{fontSize: 10, color: T.t4, fontFamily: 'monospace'}}>{group.path}</div>
                )}
              </div>
              <span style={{color: T.t4, fontSize: 14}}>{isOpen ? '▾' : '▸'}</span>
            </button>

            {isOpen && (
              <div style={{marginTop: 14, display: 'grid', gap: 8}}>
                {group.nodes.map((node, idx) => (
                  <SectionNode key={idx} node={node} onNavigate={navigate} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Section Node 子コンポーネント ──

function SectionNode({
  node,
  onNavigate,
}: {
  node: NodeConfig;
  onNavigate: (tab: string, sub?: string) => void;
}) {
  const disabled = node.target === 'disabled';
  const external = node.target === 'external';

  const handleClick = () => {
    if (disabled) return;
    if (external && node.url) {
      window.location.href = node.url;
      return;
    }
    if (node.tab) onNavigate(node.tab, node.sub);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 14px',
        background: al(T.tx, 0.03),
        borderRadius: 8,
        border: `1px solid ${al(T.tx, 0.06)}`,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <div style={{flex: 1, minWidth: 0}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx, marginBottom: 2}}>
          {node.label}
          {disabled && <span style={{marginLeft: 8, fontSize: 10, color: T.t4}}>(Sprint 4 予定)</span>}
        </div>
        {node.desc && (
          <div style={{fontSize: 10, color: T.t5, marginBottom: 4}}>{node.desc}</div>
        )}
        <DataCountPreview node={node} />
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        style={{
          padding: '6px 14px',
          background: disabled ? 'transparent' : T.c,
          border: `1px solid ${disabled ? al(T.tx, 0.2) : T.c}`,
          borderRadius: 6,
          color: disabled ? T.t4 : T.bg,
          fontSize: 11,
          fontWeight: 800,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {disabled ? '未実装' : '編集する →'}
      </button>
    </div>
  );
}

function DataCountPreview({node}: {node: NodeConfig}) {
  if (node.target === 'disabled') return null;
  const parts: string[] = [];
  if (node.metaCount != null) {
    parts.push(`Metaobject ${node.metaCount}件`);
  }
  if (node.fallbackCount != null && node.fallbackCount > 0) {
    parts.push(`${node.fallbackLabel || 'フォールバック'} ${node.fallbackCount}件`);
  } else if (node.fallbackLabel) {
    parts.push(node.fallbackLabel);
  }
  if (parts.length === 0) return null;
  return (
    <div style={{fontSize: 10, color: T.c, fontFamily: 'monospace'}}>
      {parts.join(' / ')}
    </div>
  );
}
