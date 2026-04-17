/**
 * AdminSiteConfig Tab — サイト全体設定・ブロックCMS
 *
 * P0: 法務情報 (legal_info) — 特商法/保証/プライバシー
 * P1: カテゴリカード / 商品シェルフ / ABOUTセクション
 * P2: サイト設定 (site_config) — ブランド情報/SNS/テーマ
 * P3: 固定ページ (static_page) — warranty/faq/commitment/contact 等
 *
 * 全て /api/admin/cms 統一エンドポイント経由で Metaobject CRUD。
 * 下書き/公開 capability 対応済み。
 */

import { useState, useEffect, useCallback } from 'react';
import { color } from '~/lib/design-tokens';
import { CompactKPI } from '~/components/admin/CompactKPI';
import { GenericCrudSublist, type MetaobjectNode, type FieldDef } from '~/components/admin/GenericCrudSublist';

type SubTab =
  | 'site_config'
  | 'legal'
  | 'category'
  | 'shelf'
  | 'about'
  | 'static_page';

// ── CMS GET wrapper ──
async function cmsGet(type: string): Promise<MetaobjectNode[]> {
  const res = await fetch(`/api/admin/cms?type=${type}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const json = await res.json();
  return json.items ?? [];
}

// ══════════════════════════════════════
// フィールド定義
// ══════════════════════════════════════

const SITE_CONFIG_FIELDS: FieldDef[] = [
  { key: 'brand_name', label: 'ブランド名', type: 'text', span: 1, placeholder: 'ASTROMEDA' },
  { key: 'company_name', label: '運営会社名', type: 'text', span: 1, placeholder: '株式会社マイニングベース' },
  { key: 'store_url', label: 'ストアURL', type: 'url', span: 2, placeholder: 'https://shop.mining-base.co.jp' },
  { key: 'contact_phone', label: '電話番号', type: 'text', span: 1, placeholder: '03-6903-5371' },
  { key: 'contact_email', label: 'メールアドレス', type: 'text', span: 1, placeholder: 'contact@mng-base.com' },
  { key: 'theme_json', label: 'テーマ設定 JSON（色・フォント等）', type: 'json', span: 2, placeholder: '{ "primary": "#00D4FF", "bg": "#000" }' },
  { key: 'nav_items_json', label: 'ナビゲーション JSON', type: 'json', span: 2, placeholder: '[{"label":"コラボ","href":"/collabs"}]' },
  { key: 'footer_sections_json', label: 'フッターセクション JSON', type: 'json', span: 2 },
  { key: 'footer_links_json', label: 'フッターリンク JSON', type: 'json', span: 2 },
  { key: 'social_links_json', label: 'SNSリンク JSON', type: 'json', span: 2, placeholder: '[{"platform":"X","url":"..."}]' },
];

const LEGAL_INFO_FIELDS: FieldDef[] = [
  { key: 'company_json', label: '会社情報 JSON（会社概要 /about-company）', type: 'json', span: 2, placeholder: '{ "address": "...", "capital": "...", "founded": "..." }' },
  { key: 'tokusho_json', label: '特定商取引法 JSON（/tokusho）', type: 'json', span: 2, placeholder: '{ "seller": "...", "address": "...", "payment": "..." }' },
  { key: 'warranty_json', label: '保証規定 JSON', type: 'json', span: 2 },
  { key: 'privacy_text', label: 'プライバシーポリシー本文 HTML', type: 'textarea', span: 2 },
];

const CATEGORY_CARD_FIELDS: FieldDef[] = [
  { key: 'name', label: 'カテゴリ名', type: 'text', required: true, span: 1, placeholder: 'ゲーミングPC' },
  { key: 'subtitle', label: 'サブタイトル', type: 'text', span: 1, placeholder: 'Gaming PC' },
  { key: 'route', label: '遷移先URL', type: 'text', span: 2, placeholder: '/collections/gaming-pc' },
  { key: 'price_label', label: '価格ラベル', type: 'text', span: 1, placeholder: '¥99,800〜' },
  { key: 'accent_color', label: 'アクセントカラー', type: 'text', span: 1, placeholder: '#00D4FF' },
  { key: 'bg_color', label: '背景カラー', type: 'text', span: 2, placeholder: 'linear-gradient(...)' },
  { key: 'display_order', label: '並び順', type: 'number', span: 1 },
  { key: 'is_active', label: '表示', type: 'boolean', span: 1 },
];

const PRODUCT_SHELF_FIELDS: FieldDef[] = [
  { key: 'title', label: 'シェルフ見出し', type: 'text', required: true, span: 1, placeholder: '人気のゲーミングPC' },
  { key: 'subtitle', label: 'サブタイトル', type: 'text', span: 1 },
  { key: 'product_ids_json', label: '商品ID JSON配列', type: 'json', span: 2, placeholder: '["gid://shopify/Product/...", "..."]' },
  { key: 'limit', label: '表示件数', type: 'number', span: 1, placeholder: '8' },
  { key: 'sort_key', label: '並び順キー', type: 'text', span: 1, placeholder: 'best-selling' },
  { key: 'display_order', label: '並び順', type: 'number', span: 1 },
  { key: 'is_active', label: '表示', type: 'boolean', span: 1 },
];

const ABOUT_SECTION_FIELDS: FieldDef[] = [
  { key: 'title', label: '見出し', type: 'text', required: true, span: 2, placeholder: 'ASTROMEDAについて' },
  { key: 'body_html', label: '本文 HTML', type: 'textarea', span: 2 },
  { key: 'link_url', label: 'リンクURL', type: 'text', span: 1, placeholder: '/about' },
  { key: 'link_label', label: 'リンクラベル', type: 'text', span: 1, placeholder: '詳しく見る' },
  { key: 'display_order', label: '並び順', type: 'number', span: 1 },
  { key: 'is_active', label: '表示', type: 'boolean', span: 1 },
];

const STATIC_PAGE_FIELDS: FieldDef[] = [
  { key: 'title', label: 'ページタイトル', type: 'text', required: true, span: 2, placeholder: '保証・修理について' },
  { key: 'page_slug', label: 'URLスラッグ', type: 'text', required: true, span: 1, placeholder: 'warranty' },
  { key: 'updated_label', label: '更新日ラベル', type: 'text', span: 1, placeholder: '2026年4月1日改定' },
  { key: 'meta_description', label: 'メタディスクリプション（SEO）', type: 'textarea', span: 2 },
  { key: 'body_html', label: '本文 HTML', type: 'textarea', span: 2 },
  { key: 'sections_json', label: 'セクション JSON（複数セクション用）', type: 'json', span: 2, placeholder: '[{"heading":"...","body_html":"..."}]' },
  { key: 'is_published', label: '公開', type: 'boolean', span: 2 },
];

// ══════════════════════════════════════
// Main Component
// ══════════════════════════════════════
export default function AdminSiteConfig() {
  const [activeTab, setActiveTab] = useState<SubTab>('site_config');
  const [siteConfigs, setSiteConfigs] = useState<MetaobjectNode[]>([]);
  const [legal, setLegal] = useState<MetaobjectNode[]>([]);
  const [categories, setCategories] = useState<MetaobjectNode[]>([]);
  const [shelves, setShelves] = useState<MetaobjectNode[]>([]);
  const [abouts, setAbouts] = useState<MetaobjectNode[]>([]);
  const [staticPages, setStaticPages] = useState<MetaobjectNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [a, b, c, d, e, f] = await Promise.all([
        cmsGet('astromeda_site_config'),
        cmsGet('astromeda_legal_info'),
        cmsGet('astromeda_category_card'),
        cmsGet('astromeda_product_shelf'),
        cmsGet('astromeda_about_section'),
        cmsGet('astromeda_static_page'),
      ]);
      setSiteConfigs(a);
      setLegal(b);
      setCategories(c);
      setShelves(d);
      setAbouts(e);
      setStaticPages(f);
    } catch {
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const showMsg = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(null), 3000);
  };

  const tabs: { key: SubTab; label: string; count: number }[] = [
    { key: 'site_config', label: 'サイト設定', count: siteConfigs.length },
    { key: 'legal', label: '法務情報', count: legal.length },
    { key: 'category', label: 'カテゴリ', count: categories.length },
    { key: 'shelf', label: '商品シェルフ', count: shelves.length },
    { key: 'about', label: 'ABOUT', count: abouts.length },
    { key: 'static_page', label: '固定ページ', count: staticPages.length },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: color.text, margin: '0 0 16px' }}>
        サイト設定・ブロックCMS
      </h2>
      <div style={{ fontSize: 12, color: color.textMuted, marginBottom: 16 }}>
        ECサイト全体で使われる設定値・テキストブロックをここから編集できます。
        全て「下書き保存 → 公開」の2段階で、お客様に見える前に確認できます。
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12, marginBottom: 20 }}>
        <CompactKPI label="サイト設定" value={String(siteConfigs.length)} />
        <CompactKPI label="法務情報" value={String(legal.length)} />
        <CompactKPI label="カテゴリ" value={String(categories.length)} />
        <CompactKPI label="シェルフ" value={String(shelves.length)} />
        <CompactKPI label="ABOUT" value={String(abouts.length)} />
        <CompactKPI label="固定ページ" value={String(staticPages.length)} />
      </div>

      {msg && (
        <div style={{
          background: msg.includes('失敗') || msg.includes('エラー') ? '#3a1515' : '#153a1a',
          border: `1px solid ${msg.includes('失敗') || msg.includes('エラー') ? '#6b2020' : '#206b2a'}`,
          borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13,
          color: msg.includes('失敗') || msg.includes('エラー') ? '#ff6b6b' : '#6bff7b',
        }}>
          {msg}
        </div>
      )}

      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${color.border}`, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: activeTab === t.key ? 700 : 400,
              color: activeTab === t.key ? color.cyan : color.textMuted,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === t.key ? `2px solid ${color.cyan}` : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {loading && <div style={{ color: color.textMuted, fontSize: 14 }}>読み込み中...</div>}
      {error && <div style={{ color: '#ff6b6b', fontSize: 14, marginBottom: 16 }}>{error}</div>}

      {!loading && activeTab === 'site_config' && (
        <GenericCrudSublist
          items={siteConfigs}
          onRefresh={fetchAll}
          onMsg={showMsg}
          type="astromeda_site_config"
          title="サイト設定"
          unitLabel="サイト設定"
          handlePrefix="site-config"
          fields={SITE_CONFIG_FIELDS}
          orderKey="brand_name"
          allowDelete={false}
          emptyMessage="サイト設定未登録。「＋ サイト設定を追加」から初期値を登録してください（通常1件のみ運用）"
          footerHint="サイト設定はストアフロント全体で参照されます。変更は公開と同時に全ページに反映されます。"
          summary={(fields) => ({
            primary: fields.brand_name || '(ブランド名 未設定)',
            secondary: `${fields.company_name || ''} ${fields.store_url ? ' · ' + fields.store_url : ''}`,
          })}
        />
      )}

      {!loading && activeTab === 'legal' && (
        <GenericCrudSublist
          items={legal}
          onRefresh={fetchAll}
          onMsg={showMsg}
          type="astromeda_legal_info"
          title="法務情報"
          unitLabel="法務情報"
          handlePrefix="legal"
          fields={LEGAL_INFO_FIELDS}
          orderKey="company_json"
          allowDelete={false}
          emptyMessage="法務情報未登録。会社概要・特定商取引法・保証規定・プライバシーを1件で管理します"
          footerHint="法務情報は /about-company, /tokusho, /warranty, /privacy 等のページで参照されます。JSONは正しい形式で入力してください。"
          summary={(fields) => ({
            primary: fields.company_json ? '法務情報 (登録済)' : '法務情報 (未入力)',
            secondary: [
              fields.tokusho_json ? '特商法✓' : '特商法✗',
              fields.warranty_json ? '保証✓' : '保証✗',
              fields.privacy_text ? 'プライバシー✓' : 'プライバシー✗',
            ].join(' · '),
          })}
        />
      )}

      {!loading && activeTab === 'category' && (
        <GenericCrudSublist
          items={categories}
          onRefresh={fetchAll}
          onMsg={showMsg}
          type="astromeda_category_card"
          title="カテゴリカード"
          unitLabel="カテゴリ"
          handlePrefix="category"
          fields={CATEGORY_CARD_FIELDS}
          emptyMessage="カテゴリカード未登録。トップページのカテゴリブロックに表示されます"
          footerHint="カテゴリカードはトップページの「CATEGORY」セクションに並びます。並び順は小さい数字から順に表示。"
          summary={(fields) => ({
            primary: fields.name,
            secondary: `${fields.subtitle || ''} ${fields.route ? '→ ' + fields.route : ''}`,
            tag: fields.price_label || undefined,
          })}
        />
      )}

      {!loading && activeTab === 'shelf' && (
        <GenericCrudSublist
          items={shelves}
          onRefresh={fetchAll}
          onMsg={showMsg}
          type="astromeda_product_shelf"
          title="商品シェルフ"
          unitLabel="シェルフ"
          handlePrefix="shelf"
          fields={PRODUCT_SHELF_FIELDS}
          emptyMessage="商品シェルフ未登録。トップページやコレクションページの商品横並び表示に使います"
          footerHint="商品シェルフは「人気のゲーミングPC」「新着商品」等の横スクロール表示に使われます。商品IDはShopify Admin API からコピー。"
          summary={(fields) => ({
            primary: fields.title,
            secondary: fields.subtitle || `並び順: ${fields.sort_key || '-'} / 件数: ${fields.limit || '-'}`,
          })}
        />
      )}

      {!loading && activeTab === 'about' && (
        <GenericCrudSublist
          items={abouts}
          onRefresh={fetchAll}
          onMsg={showMsg}
          type="astromeda_about_section"
          title="ABOUTセクション"
          unitLabel="ABOUT"
          handlePrefix="about"
          fields={ABOUT_SECTION_FIELDS}
          emptyMessage="ABOUTセクション未登録。ブランドストーリー/企業理念/受賞歴などをブロック単位で管理"
          footerHint="ABOUTセクションはトップページまたは /about ページに並べて表示されます。本文はHTMLで装飾可能。"
          summary={(fields) => ({
            primary: fields.title,
            secondary: fields.link_url ? `→ ${fields.link_url}` : '',
          })}
        />
      )}

      {!loading && activeTab === 'static_page' && (
        <GenericCrudSublist
          items={staticPages}
          onRefresh={fetchAll}
          onMsg={showMsg}
          type="astromeda_static_page"
          title="固定ページ"
          unitLabel="固定ページ"
          handlePrefix="page"
          fields={STATIC_PAGE_FIELDS}
          orderKey="page_slug"
          emptyMessage="固定ページ未登録。warranty / faq / commitment / contact / recycle 等のページ本文をここで管理"
          footerHint="固定ページは /{page_slug} のURLで公開されます（例: page_slug=warranty → /warranty）。HTMLを直接編集できます。"
          summary={(fields) => ({
            primary: fields.title,
            secondary: `/${fields.page_slug || '(未設定)'} ${fields.updated_label ? ' · ' + fields.updated_label : ''}`,
            tag: fields.is_published === 'true' ? '公開中' : '未公開',
          })}
        />
      )}
    </div>
  );
}
