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
import { GenericCrudSublist, extractField, type MetaobjectNode, type FieldDef } from '~/components/admin/GenericCrudSublist';
// patch 0073 (R2-3): canonical path unification — 非正規タブでの誘導バナー
import { CanonicalRedirectBanner } from '~/components/admin/ds/CanonicalRedirectBanner';
// patch 0074 (R1-2): Stripe/Apple 水準の Skeleton + CTA 付き EmptyState primitive
import { AdminListSkeleton } from '~/components/admin/ds/InlineListState';
import { TabHeaderHint } from '~/components/admin/ds/TabHeaderHint';

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
  { key: 'page_slug', label: 'URL 末尾', type: 'text', required: true, span: 1, placeholder: 'warranty' },
  { key: 'updated_label', label: '更新日ラベル', type: 'text', span: 1, placeholder: '2026年4月1日改定' },
  { key: 'meta_description', label: 'メタディスクリプション（SEO）', type: 'textarea', span: 2 },
  { key: 'body_html', label: '本文 HTML', type: 'textarea', span: 2 },
  { key: 'sections_json', label: 'セクション JSON（複数セクション用）', type: 'json', span: 2, placeholder: '[{"heading":"...","body_html":"..."}]' },
  { key: 'is_published', label: '公開', type: 'boolean', span: 2 },
];

// ══════════════════════════════════════
// ライブプレビュー レンダラー
// ══════════════════════════════════════

// JSON parse safe helper
function tryJson<T>(s: string | undefined | null, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

// ── 1. サイト設定 (ヘッダー＋フッターミニモック) ──
function SiteConfigPreview({ form }: { form: Record<string, string>; items: MetaobjectNode[] }) {
  const brand = form.brand_name || 'ASTROMEDA';
  const nav = tryJson<Array<{ label: string; href?: string }>>(form.nav_items_json, []);
  const footerSections = tryJson<Array<{ heading: string; links?: Array<{ label: string }> }>>(form.footer_sections_json, []);
  const social = tryJson<Array<{ platform: string; url?: string }>>(form.social_links_json, []);
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', color: '#fff', background: '#000', minHeight: 400 }}>
      {/* Header mock */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 2 }}>{brand}</div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
          {(nav.length > 0 ? nav : [{ label: 'コラボ' }, { label: 'ゲーミングPC' }, { label: 'グッズ' }]).slice(0, 5).map((n, i) => (
            <span key={i} style={{ opacity: 0.8 }}>{n.label}</span>
          ))}
        </div>
      </div>
      {/* Body placeholder */}
      <div style={{ padding: 32, textAlign: 'center', color: '#666', fontSize: 12 }}>— コンテンツエリア —</div>
      {/* Footer mock */}
      <div style={{ padding: '24px 20px', borderTop: '1px solid #222', background: '#0a0a0a' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 16, marginBottom: 16 }}>
          {(footerSections.length > 0 ? footerSections : [{ heading: 'SHOP', links: [{ label: 'ゲーミングPC' }, { label: 'グッズ' }] }, { heading: 'ABOUT', links: [{ label: '会社概要' }] }]).slice(0, 4).map((sec, i) => (
            <div key={i}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#00D4FF', marginBottom: 6 }}>{sec.heading}</div>
              {(sec.links ?? []).slice(0, 4).map((lnk, j) => (
                <div key={j} style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>{lnk.label}</div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
          {(social.length > 0 ? social : [{ platform: 'X' }, { platform: 'Instagram' }]).map((s, i) => (
            <span key={i} style={{ fontSize: 10, padding: '3px 8px', border: '1px solid #333', borderRadius: 4, color: '#888' }}>
              {s.platform}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 10, color: '#555', textAlign: 'center' }}>
          © {form.company_name || '株式会社マイニングベース'} · {form.contact_phone || ''} · {form.contact_email || ''}
        </div>
      </div>
    </div>
  );
}

// ── 2. 法務情報 (特商法/保証/プライバシーのセクション) ──
function LegalInfoPreview({ form }: { form: Record<string, string>; items: MetaobjectNode[] }) {
  const company = tryJson<Record<string, string>>(form.company_json, {});
  const tokusho = tryJson<Record<string, string>>(form.tokusho_json, {});
  const warranty = tryJson<Record<string, string>>(form.warranty_json, {});
  const section = (heading: string, data: Record<string, string>, emptyLabel: string) => (
    <div style={{ padding: 16, borderBottom: '1px solid #222' }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#00D4FF', marginBottom: 8 }}>{heading}</div>
      {Object.keys(data).length === 0 ? (
        <div style={{ fontSize: 11, color: '#666' }}>{emptyLabel}</div>
      ) : (
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
          <tbody>
            {Object.entries(data).slice(0, 8).map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: '4px 8px 4px 0', color: '#888', verticalAlign: 'top', width: '35%' }}>{k}</td>
                <td style={{ padding: '4px 0', color: '#ddd' }}>{String(v).slice(0, 80)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', color: '#fff', background: '#000', minHeight: 400 }}>
      <div style={{ padding: 20, borderBottom: '1px solid #333' }}>
        <div style={{ fontSize: 20, fontWeight: 900 }}>法務情報</div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>会社概要・特定商取引法・保証規定・プライバシー</div>
      </div>
      {section('会社概要', company, '未入力')}
      {section('特定商取引法に基づく表記', tokusho, '未入力')}
      {section('保証規定', warranty, '未入力')}
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#00D4FF', marginBottom: 8 }}>プライバシーポリシー</div>
        {form.privacy_text ? (
          <div style={{ fontSize: 11, color: '#ddd', lineHeight: 1.6 }}
               dangerouslySetInnerHTML={{ __html: form.privacy_text.slice(0, 1200) }} />
        ) : (
          <div style={{ fontSize: 11, color: '#666' }}>未入力</div>
        )}
      </div>
    </div>
  );
}

// ── 3. カテゴリカード (トップの CATEGORY グリッド) ──
function CategoryCardPreview({ form, items, editingId, isCreating }: { form: Record<string, string>; items: MetaobjectNode[]; editingId: string | null; isCreating: boolean }) {
  // 既存 items を一旦 flat Record に変換（legacy fields[] 配列形式にも対応）
  const flatItems: Record<string, string>[] = items.map((it) => {
    const flat: Record<string, string> = { _id: it.id };
    CATEGORY_CARD_FIELDS.forEach((fld) => { flat[fld.key] = extractField(it, fld.key); });
    // 編集中なら該当 id のフィールドを form で上書き（リアルタイム反映）
    if (it.id === editingId) Object.keys(form).forEach((k) => { flat[k] = form[k]; });
    return flat;
  });
  if (isCreating) flatItems.push({ _id: 'new', ...form });
  const cards = flatItems
    .filter((c) => c.is_active !== 'false')
    .sort((a, b) => Number(a.display_order || 99) - Number(b.display_order || 99))
    .slice(0, 8);
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#000', color: '#fff', padding: 20, minHeight: 400 }}>
      <div style={{ fontSize: 11, color: '#00D4FF', letterSpacing: 3, marginBottom: 4 }}>CATEGORY</div>
      <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 16 }}>ジャンルから探す</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {cards.length === 0 && (
          <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#666', textAlign: 'center', padding: 20 }}>
            カテゴリ未登録
          </div>
        )}
        {cards.map((c, i) => (
          <div
            key={c._id || `new-${i}`}
            style={{
              aspectRatio: '5 / 4',
              background: c.bg_color || `linear-gradient(135deg, ${c.accent_color || '#00D4FF'}22, #111)`,
              border: `1px solid ${c.accent_color || '#333'}`,
              borderRadius: 10,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              overflow: 'hidden',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>{c.name || '(名称未設定)'}</div>
              <div style={{ fontSize: 9, color: c.accent_color || '#00D4FF', marginTop: 2, letterSpacing: 2 }}>{c.subtitle || ''}</div>
            </div>
            <div style={{ fontSize: 10, color: '#fff', opacity: 0.85, fontWeight: 700 }}>{c.price_label || ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 4. 商品シェルフ (横並びモック) ──
function ProductShelfPreview({ form }: { form: Record<string, string>; items: MetaobjectNode[] }) {
  const productIds = tryJson<string[]>(form.product_ids_json, []);
  const limit = Number(form.limit || 8);
  const count = Math.min(productIds.length || limit || 4, 8);
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#000', color: '#fff', padding: 20, minHeight: 400 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>{form.title || '(シェルフ見出し未設定)'}</div>
        {form.subtitle && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{form.subtitle}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            style={{
              minWidth: 140,
              background: '#111',
              border: '1px solid #222',
              borderRadius: 8,
              padding: 10,
              flexShrink: 0,
            }}
          >
            <div style={{
              aspectRatio: '1 / 1',
              background: 'linear-gradient(135deg, #1a1a1a, #0a0a0a)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              color: '#555',
              marginBottom: 8,
            }}>
              {productIds[i] ? `#${i + 1}` : 'IMG'}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {productIds[i] ? productIds[i].split('/').pop()?.slice(0, 10) + '...' : 'PC モデル'}
            </div>
            <div style={{ fontSize: 10, color: '#00D4FF', marginTop: 4 }}>¥{(100000 + i * 10000).toLocaleString()}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: '#666', marginTop: 12 }}>
        並び順: {form.sort_key || '-'} · 表示件数: {form.limit || count} · 登録ID数: {productIds.length}
      </div>
    </div>
  );
}

// ── 5. ABOUTセクション (グラデーションカード) ──
function AboutSectionPreview({ form }: { form: Record<string, string>; items: MetaobjectNode[] }) {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#000', color: '#fff', padding: 20, minHeight: 400 }}>
      <div
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #001a33 0%, #000 60%, #1a0033 100%)',
          border: '1px solid #00D4FF33',
          padding: '32px 20px',
          minHeight: 260,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontSize: 11, color: '#00D4FF', letterSpacing: 3, marginBottom: 8 }}>ABOUT</div>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 12, lineHeight: 1.3 }}>
          {form.title || '(見出し未設定)'}
        </div>
        {form.body_html && (
          <div
            style={{ fontSize: 12, color: '#ddd', lineHeight: 1.7, marginBottom: 16 }}
            dangerouslySetInnerHTML={{ __html: form.body_html.slice(0, 800) }}
          />
        )}
        {form.link_url && (
          <div>
            <span style={{
              display: 'inline-block',
              padding: '8px 18px',
              background: '#00D4FF',
              color: '#000',
              fontSize: 12,
              fontWeight: 800,
              borderRadius: 6,
            }}>
              {form.link_label || '詳しく見る'} →
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 6. 固定ページ (ヘッダー + 本文 + セクション) ──
function StaticPagePreview({ form }: { form: Record<string, string>; items: MetaobjectNode[] }) {
  const sections = tryJson<Array<{ heading: string; body_html?: string }>>(form.sections_json, []);
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#000', color: '#fff', minHeight: 400 }}>
      {/* URL bar mock */}
      <div style={{ padding: '6px 12px', background: '#111', borderBottom: '1px solid #222', fontSize: 10, color: '#888', fontFamily: 'monospace' }}>
        🔒 shop.mining-base.co.jp/{form.page_slug || '(slug未設定)'}
      </div>
      {/* Page Header */}
      <div style={{ padding: '28px 20px 16px', borderBottom: '1px solid #222' }}>
        <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.3 }}>
          {form.title || '(ページタイトル未設定)'}
        </div>
        {form.updated_label && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>{form.updated_label}</div>
        )}
        {form.meta_description && (
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 8, fontStyle: 'italic' }}>
            {form.meta_description.slice(0, 160)}
          </div>
        )}
      </div>
      {/* Body */}
      {form.body_html && (
        <div style={{ padding: 20, borderBottom: sections.length ? '1px solid #222' : 'none' }}>
          <div
            style={{ fontSize: 12, color: '#ddd', lineHeight: 1.7 }}
            dangerouslySetInnerHTML={{ __html: form.body_html.slice(0, 2000) }}
          />
        </div>
      )}
      {/* Sections */}
      {sections.map((sec, i) => (
        <div key={i} style={{ padding: 20, borderBottom: '1px solid #222' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#00D4FF', marginBottom: 10 }}>{sec.heading}</div>
          {sec.body_html && (
            <div
              style={{ fontSize: 12, color: '#ddd', lineHeight: 1.7 }}
              dangerouslySetInnerHTML={{ __html: sec.body_html.slice(0, 1200) }}
            />
          )}
        </div>
      ))}
      {!form.body_html && sections.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#555', fontSize: 12 }}>
          本文未入力
        </div>
      )}
      {/* Publish badge */}
      <div style={{ padding: '12px 20px', background: '#0a0a0a', fontSize: 10, color: form.is_published === 'true' ? '#6bff7b' : '#ffb020' }}>
        {form.is_published === 'true' ? '● 公開中' : '● 下書き（公開サイトには表示されません）'}
      </div>
    </div>
  );
}

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
    {/* patch 0119 (Apple CEO ライフサイクル監査): 高校生向け 1 行説明 */}
    <TabHeaderHint
      title="お店の基本情報"
      description="屋号（ASTROMEDA）、運営会社、連絡先、特定商取引法に基づく表記など、お店の基礎情報を編集します。"
      relatedTabs={[{label: '記事・お知らせ', tab: 'content'}]}
    />
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

      {loading && <AdminListSkeleton rows={5} />}
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
          renderPreview={({ items, form }) => <SiteConfigPreview items={items} form={form} />}
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
          renderPreview={({ items, form }) => <LegalInfoPreview items={items} form={form} />}
        />
      )}

      {!loading && activeTab === 'category' && (
        <>
          <CanonicalRedirectBanner
            metaobjectType="astromeda_category_card"
            currentTab="siteConfig"
            note="カテゴリカードはトップページのレイアウトに直接影響するブロックです。配置やカラーを同時に確認したい場合は「ビジュアル編集」が便利です。"
          />
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
          renderPreview={({ items, form, editingId, isCreating }) => (
            <CategoryCardPreview items={items} form={form} editingId={editingId} isCreating={isCreating} />
          )}
        />
        </>
      )}

      {!loading && activeTab === 'shelf' && (
        <>
          <CanonicalRedirectBanner
            metaobjectType="astromeda_product_shelf"
            currentTab="siteConfig"
            note="商品シェルフもトップページ・コレクションページの横スクロール表示に直結します。配置プレビュー付きで編集したい場合は「ビジュアル編集」へ。"
          />
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
          renderPreview={({ items, form }) => <ProductShelfPreview items={items} form={form} />}
        />
        </>
      )}

      {!loading && activeTab === 'about' && (
        <>
          <CanonicalRedirectBanner
            metaobjectType="astromeda_about_section"
            currentTab="siteConfig"
            note="ABOUTセクションはトップページの下層ブロックです。写真や装飾を同時に確認したい場合は「ビジュアル編集」のほうが直感的です。"
          />
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
          renderPreview={({ items, form }) => <AboutSectionPreview items={items} form={form} />}
        />
        </>
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
          renderPreview={({ items, form }) => <StaticPagePreview items={items} form={form} />}
        />
      )}
    </div>
  );
}
