/**
 * CMS 初期シード API — POST /api/admin/cms-seed
 *
 * astromeda-data.ts のハードコード初期値を元に、
 * 13種の Metaobject インスタンスを一括作成する。
 *
 * 既存の handle はスキップ（冪等）。
 * 新規作成分は PUBLISHABLE capability がある型は ACTIVE で作成される。
 *
 * シード対象:
 *  - astromeda_ip_banner        × 23 （COLLABS 各タイトル。collection_handle + tagline + label）
 *  - astromeda_hero_banner      × 3  （NEW_ARRIVALS / COLLAB_SPOTLIGHT / PC_TIER）
 *  - astromeda_pc_color         × 8  （PC_COLORS 各色。hex/gradient/slug/image_url）
 *  - astromeda_pc_tier          × 3  （GAMER/STREAMER/CREATOR）
 *  - astromeda_ugc_review       × 5  （UGC 5件）
 *  - astromeda_marquee_item     × 7  （MARQUEE_ITEMS）
 *  - astromeda_category_card    × 4  （PC / ガジェット / グッズ / アクセサリ）
 *  - astromeda_about_section    × 1
 *  - astromeda_product_shelf    × 2  （新着 / 人気）
 *  - astromeda_legal_info       × 1  （LEGAL 4 JSON）
 *  - astromeda_site_config      × 1  （ブランド名/会社名/連絡先）
 *  - astromeda_static_page      × 7  （warranty / contact / contact-houjin / faq / commitment / recycle / yojimaru）
 *
 *  合計約 65 Metaobject（既存スキップ後は差分のみ）
 *
 * セキュリティ: RateLimit → CSRF → AdminAuth → RBAC (settings.edit) → AuditLog
 */

import { data } from 'react-router';
import type { Route } from './+types/api.admin.cms-seed';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '~/lib/rate-limiter';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';
import {
  COLLABS,
  PC_COLORS,
  PC_TIERS,
  UGC,
  MARQUEE_ITEMS,
  LEGAL,
  COMPANY_NAME,
  STORE_NAME,
  STORE_URL,
} from '~/lib/astromeda-data';

// ── Types ──
interface SeedField {
  key: string;
  value: string;
}

interface SeedRecord {
  handle: string;
  fields: SeedField[];
}

interface SeedSpec {
  type: string;
  records: SeedRecord[];
}

// ── スラッグ化ユーティリティ ──
const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

// ── シード仕様を構築 ──
function buildSeeds(): SeedSpec[] {
  const seeds: SeedSpec[] = [];

  // 1. astromeda_ip_banner × 23
  seeds.push({
    type: 'astromeda_ip_banner',
    records: COLLABS.map((c, idx) => ({
      handle: `ip-${c.id}`,
      fields: [
        { key: 'name', value: c.name },
        { key: 'collection_handle', value: c.shop },
        { key: 'tagline', value: c.desc.slice(0, 290) },
        { key: 'label', value: c.tag || '' },
        { key: 'display_order', value: String(idx + 1) },
        { key: 'is_active', value: c.f ? 'true' : 'true' },
        // image (file_reference) はスキップ — 管理画面で Shopify Files から設定。
        // 公開サイト側は collection_handle から Storefront API で画像を補完する。
      ],
    })),
  });

  // 2. astromeda_hero_banner × 3
  seeds.push({
    type: 'astromeda_hero_banner',
    records: [
      {
        handle: 'hero-new-arrivals',
        fields: [
          { key: 'title', value: '新着IPコラボPC登場' },
          { key: 'subtitle', value: '国内自社工場で組み立て。最短10営業日でお届け。' },
          // 注: Metaobject URL field は http/https scheme 必須 (commit 043b931 参照)。
          // STORE_URL 絶対URLで保存し、フロント側は toInternalPath (patch 0012) で
          // render 時に自ドメイン/旧ドメイン配下を内部パスに畳んで SPA 遷移させる。
          { key: 'link_url', value: `${STORE_URL}/collections/new-arrivals` },
          { key: 'cta_label', value: '新着を見る' },
          { key: 'display_order', value: '1' },
          { key: 'is_active', value: 'true' },
        ],
      },
      {
        handle: 'hero-collab-spotlight',
        fields: [
          { key: 'title', value: '26タイトルIPコラボPC' },
          { key: 'subtitle', value: 'ONE PIECE・NARUTO・呪術廻戦ほか、推しの世界観をそのままPCに。' },
          { key: 'link_url', value: `${STORE_URL}/collections/ip-collaborations` },
          { key: 'cta_label', value: 'コラボPCを見る' },
          { key: 'display_order', value: '2' },
          { key: 'is_active', value: 'true' },
        ],
      },
      {
        handle: 'hero-pc-tiers',
        fields: [
          { key: 'title', value: 'GAMER / STREAMER / CREATOR' },
          { key: 'subtitle', value: '用途別に選べる3ティア。¥199,980〜。' },
          { key: 'link_url', value: `${STORE_URL}/collections/astromeda` },
          { key: 'cta_label', value: '製品一覧へ' },
          { key: 'display_order', value: '3' },
          { key: 'is_active', value: 'true' },
        ],
      },
    ],
  });

  // 3. astromeda_pc_color × 8
  seeds.push({
    type: 'astromeda_pc_color',
    records: PC_COLORS.map((col, idx) => ({
      handle: `color-${col.slug}`,
      fields: [
        { key: 'name', value: col.n },
        { key: 'slug', value: col.slug },
        { key: 'hex_color', value: col.h },
        { key: 'gradient_color', value: col.g },
        { key: 'is_dark', value: col.d ? 'true' : 'false' },
        { key: 'collection_handle', value: col.slug }, // white / black / pink...
        { key: 'color_keywords', value: col.colorKw.join(',') },
        { key: 'image_url', value: col.img || '' },
        { key: 'display_order', value: String(idx + 1) },
        { key: 'is_active', value: 'true' },
      ],
    })),
  });

  // 4. astromeda_pc_tier × 3
  seeds.push({
    type: 'astromeda_pc_tier',
    records: PC_TIERS.map((t, idx) => ({
      handle: `tier-${t.tier.toLowerCase()}`,
      fields: [
        { key: 'tier_name', value: t.tier },
        { key: 'gpu_range', value: t.gpu },
        { key: 'cpu_range', value: t.cpu },
        { key: 'ram', value: t.ram },
        { key: 'base_price', value: String(t.price) },
        { key: 'is_popular', value: t.pop ? 'true' : 'false' },
        { key: 'display_order', value: String(idx + 1) },
      ],
    })),
  });

  // 5. astromeda_ugc_review × 5
  seeds.push({
    type: 'astromeda_ugc_review',
    records: UGC.map((u, idx) => ({
      handle: `review-${u.id}`,
      fields: [
        { key: 'username', value: u.u },
        { key: 'review_text', value: u.t },
        { key: 'accent_color', value: u.c },
        { key: 'rating', value: String(u.s) },
        { key: 'date_label', value: u.d },
        { key: 'likes', value: String(u.likes) },
        { key: 'product_name', value: u.prod },
        { key: 'display_order', value: String(idx + 1) },
        { key: 'is_active', value: 'true' },
      ],
    })),
  });

  // 6. astromeda_marquee_item × 7
  seeds.push({
    type: 'astromeda_marquee_item',
    records: MARQUEE_ITEMS.map((text, idx) => ({
      handle: `marquee-${idx + 1}`,
      fields: [
        { key: 'text', value: text },
        { key: 'display_order', value: String(idx + 1) },
        { key: 'is_active', value: 'true' },
      ],
    })),
  });

  // 7. astromeda_category_card × 4
  seeds.push({
    type: 'astromeda_category_card',
    records: [
      {
        handle: 'cat-gaming-pc',
        fields: [
          { key: 'name', value: 'ゲーミングPC' },
          { key: 'subtitle', value: 'GAMER / STREAMER / CREATOR' },
          { key: 'route', value: '/collections/astromeda' },
          { key: 'price_label', value: '¥199,980〜' },
          { key: 'accent_color', value: '#00F0FF' },
          { key: 'bg_color', value: '#0E0E18' },
          { key: 'display_order', value: '1' },
          { key: 'is_active', value: 'true' },
        ],
      },
      {
        handle: 'cat-gadgets',
        fields: [
          { key: 'name', value: 'ガジェット' },
          { key: 'subtitle', value: 'マウスパッド・キーボード・パネル' },
          { key: 'route', value: '/collections/gadgets' },
          { key: 'price_label', value: '¥3,300〜' },
          { key: 'accent_color', value: '#FFB300' },
          { key: 'bg_color', value: '#14110A' },
          { key: 'display_order', value: '2' },
          { key: 'is_active', value: 'true' },
        ],
      },
      {
        handle: 'cat-goods',
        fields: [
          { key: 'name', value: 'グッズ' },
          { key: 'subtitle', value: 'Tシャツ・アクスタ・缶バッジ' },
          { key: 'route', value: '/collections/goods' },
          { key: 'price_label', value: '¥990〜' },
          { key: 'accent_color', value: '#FF2D55' },
          { key: 'bg_color', value: '#14090D' },
          { key: 'display_order', value: '3' },
          { key: 'is_active', value: 'true' },
        ],
      },
      {
        handle: 'cat-ip-collabs',
        fields: [
          { key: 'name', value: 'IPコラボ' },
          { key: 'subtitle', value: '26タイトル展開中' },
          { key: 'route', value: '/collections/ip-collaborations' },
          { key: 'price_label', value: 'NEW' },
          { key: 'accent_color', value: '#B86FD8' },
          { key: 'bg_color', value: '#140C14' },
          { key: 'display_order', value: '4' },
          { key: 'is_active', value: 'true' },
        ],
      },
    ],
  });

  // 8. astromeda_about_section × 1
  seeds.push({
    type: 'astromeda_about_section',
    records: [
      {
        handle: 'about-main',
        fields: [
          { key: 'title', value: 'ASTROMEDAとは？' },
          {
            key: 'body_html',
            value:
              '<p>ASTROMEDAは、国内自社工場で1台ずつ組み立てる受注生産型ゲーミングPCブランド。' +
              '全8色のカラーバリエーション、26タイトルのIPコラボ、最長3年保証。' +
              '「推しの世界観」と「確かな品質」を両立させる、日本発のクラフトPC。</p>',
          },
          // 注: Metaobject URL field は http/https scheme 必須。絶対URLで保存し
          // frontend 側で toInternalPath 正規化 (patch 0012)。
          { key: 'link_url', value: `${STORE_URL}/pages/about` },
          { key: 'link_label', value: 'ブランドについて' },
          { key: 'display_order', value: '1' },
          { key: 'is_active', value: 'true' },
        ],
      },
    ],
  });

  // 9. astromeda_product_shelf × 2
  seeds.push({
    type: 'astromeda_product_shelf',
    records: [
      {
        handle: 'shelf-new-arrivals',
        fields: [
          { key: 'title', value: 'NEW ARRIVALS' },
          { key: 'subtitle', value: '新着PC・コラボモデル' },
          { key: 'product_ids_json', value: '[]' },
          { key: 'limit', value: '8' },
          { key: 'sort_key', value: 'newest' },
          { key: 'display_order', value: '1' },
          { key: 'is_active', value: 'true' },
        ],
      },
      {
        handle: 'shelf-best-sellers',
        fields: [
          { key: 'title', value: 'BEST SELLERS' },
          { key: 'subtitle', value: '人気のPC・ガジェット' },
          { key: 'product_ids_json', value: '[]' },
          { key: 'limit', value: '8' },
          { key: 'sort_key', value: 'best_selling' },
          { key: 'display_order', value: '2' },
          { key: 'is_active', value: 'true' },
        ],
      },
    ],
  });

  // 10. astromeda_legal_info × 1
  seeds.push({
    type: 'astromeda_legal_info',
    records: [
      {
        handle: 'legal-main',
        fields: [
          { key: 'company_json', value: JSON.stringify(LEGAL.company) },
          { key: 'tokusho_json', value: JSON.stringify(LEGAL.tokusho) },
          { key: 'warranty_json', value: JSON.stringify(LEGAL.warranty) },
          { key: 'privacy_text', value: LEGAL.privacy },
        ],
      },
    ],
  });

  // 11. astromeda_site_config × 1
  seeds.push({
    type: 'astromeda_site_config',
    records: [
      {
        handle: 'site-main',
        fields: [
          { key: 'brand_name', value: STORE_NAME },
          { key: 'company_name', value: COMPANY_NAME },
          { key: 'store_url', value: STORE_URL },
          {
            key: 'theme_json',
            value: JSON.stringify({
              primary: '#00F0FF',
              secondary: '#FFB300',
              danger: '#FF2D55',
              bg: '#06060C',
              text: '#FFFFFF',
            }),
          },
          {
            key: 'nav_items_json',
            value: JSON.stringify([
              { label: 'PC', href: '/collections/astromeda' },
              { label: 'ガジェット', href: '/collections/gadgets' },
              { label: 'グッズ', href: '/collections/goods' },
              { label: 'IPコラボ', href: '/collections/ip-collaborations' },
              { label: 'こだわり', href: '/commitment' },
              { label: 'FAQ', href: '/faq' },
            ]),
          },
          {
            key: 'footer_links_json',
            value: JSON.stringify([
              { label: '保証・修理', href: '/warranty' },
              { label: 'お問い合わせ', href: '/contact' },
              { label: '法人のお客様', href: '/contact-houjin' },
              { label: '特定商取引法表記', href: '/pages/tokusho' },
              { label: 'プライバシーポリシー', href: '/pages/privacy' },
            ]),
          },
          {
            key: 'footer_sections_json',
            value: JSON.stringify([
              {
                heading: 'SHOP',
                links: [
                  { label: 'ゲーミングPC', href: '/collections/astromeda' },
                  { label: 'ガジェット', href: '/collections/gadgets' },
                  { label: 'グッズ', href: '/collections/goods' },
                ],
              },
              {
                heading: 'SUPPORT',
                links: [
                  { label: '保証・修理', href: '/warranty' },
                  { label: 'FAQ', href: '/faq' },
                  { label: 'お問い合わせ', href: '/contact' },
                ],
              },
              {
                heading: 'COMPANY',
                links: [
                  { label: '会社概要', href: '/pages/company' },
                  { label: '法人のお客様', href: '/contact-houjin' },
                  { label: '特定商取引法', href: '/pages/tokusho' },
                ],
              },
            ]),
          },
          {
            key: 'social_links_json',
            value: JSON.stringify([
              { platform: 'twitter', url: 'https://twitter.com/astromeda_pc', label: 'X (Twitter)' },
              { platform: 'youtube', url: 'https://youtube.com/@astromeda', label: 'YouTube' },
              { platform: 'line', url: 'https://line.me/R/ti/p/@astromeda', label: 'LINE' },
            ]),
          },
          { key: 'contact_phone', value: LEGAL.tokusho.tel },
          { key: 'contact_email', value: LEGAL.tokusho.email },
        ],
      },
    ],
  });

  // 12. astromeda_static_page × 7
  seeds.push({
    type: 'astromeda_static_page',
    records: [
      {
        handle: 'page-warranty',
        fields: [
          { key: 'title', value: '保証・修理について' },
          { key: 'page_slug', value: 'warranty' },
          { key: 'meta_description', value: 'ASTROMEDAの標準1年・延長最大3年保証と修理サービスについて。' },
          {
            key: 'body_html',
            value:
              '<p>ASTROMEDA製品は<strong>標準1年のメーカー保証</strong>を付帯。' +
              '有償で最大2年の延長保証（合計最大3年）に加入いただけます。</p>',
          },
          {
            key: 'sections_json',
            value: JSON.stringify([
              { heading: '標準保証', body: 'メーカー1年保証。CPU/GPU含む全パーツの自然故障が対象。' },
              { heading: '延長保証', body: '2年延長 ¥9,900 / 3年延長 ¥14,800。' },
              { heading: '修理対応', body: '保証期間内は送料含め完全無料。工賃も無料。' },
              { heading: '対象外', body: '過失・物損（落下、水没、全損等）は対象外。' },
            ]),
          },
          { key: 'updated_label', value: '最終更新: 2026-04-17' },
          { key: 'is_published', value: 'true' },
        ],
      },
      {
        handle: 'page-contact',
        fields: [
          { key: 'title', value: 'お問い合わせ' },
          { key: 'page_slug', value: 'contact' },
          { key: 'meta_description', value: 'ASTROMEDA個人のお客様向けお問い合わせ窓口。' },
          {
            key: 'body_html',
            value:
              `<p>個人のお客様向けのお問い合わせは、メール・電話・LINEの3チャネルで承っております。</p>`,
          },
          {
            key: 'sections_json',
            value: JSON.stringify([
              { heading: 'メール', body: LEGAL.tokusho.email },
              { heading: '電話', body: `${LEGAL.tokusho.tel}（平日10:00〜18:00）` },
              { heading: 'LINE', body: '@astromeda（24h受付・返信平日）' },
            ]),
          },
          { key: 'updated_label', value: '最終更新: 2026-04-17' },
          { key: 'is_published', value: 'true' },
        ],
      },
      {
        handle: 'page-contact-houjin',
        fields: [
          { key: 'title', value: '法人のお客様' },
          { key: 'page_slug', value: 'contact-houjin' },
          { key: 'meta_description', value: 'ASTROMEDA法人向け導入・お見積もり窓口。' },
          {
            key: 'body_html',
            value:
              '<p>法人のお客様へは、導入実績・お見積もり・納期のご相談に個別対応いたします。</p>',
          },
          {
            key: 'sections_json',
            value: JSON.stringify([
              { heading: '法人窓口', body: 'business@mng-base.com' },
              { heading: 'サービス', body: '大口納品 / カスタム仕様 / 保守パック' },
              { heading: 'お見積もり', body: '仕様・台数・納期をご連絡ください。4営業日以内にお見積りします。' },
            ]),
          },
          { key: 'updated_label', value: '最終更新: 2026-04-17' },
          { key: 'is_published', value: 'true' },
        ],
      },
      {
        handle: 'page-faq',
        fields: [
          { key: 'title', value: 'よくあるご質問' },
          { key: 'page_slug', value: 'faq' },
          { key: 'meta_description', value: 'ASTROMEDAのよくあるご質問。納期・配送・保証・支払いなど。' },
          {
            key: 'body_html',
            value: '<p>ご購入前によくいただくご質問をまとめました。</p>',
          },
          {
            key: 'sections_json',
            value: JSON.stringify([
              { heading: '納期はどれくらい？', body: 'PCは注文後10〜15営業日前後。ガジェット・グッズは3〜5営業日。' },
              { heading: '送料は？', body: 'PCは全国一律 ¥3,300。ガジェット・グッズは別途表示。' },
              { heading: '支払方法は？', body: 'クレジットカード（一括/分割）、銀行振込。' },
              { heading: '保証期間は？', body: '標準1年、延長で最大3年。' },
              { heading: '初期不良対応は？', body: '到着後7日以内にご連絡ください。' },
            ]),
          },
          { key: 'updated_label', value: '最終更新: 2026-04-17' },
          { key: 'is_published', value: 'true' },
        ],
      },
      {
        handle: 'page-commitment',
        fields: [
          { key: 'title', value: 'ASTROMEDAのこだわり' },
          { key: 'page_slug', value: 'commitment' },
          { key: 'meta_description', value: 'ASTROMEDAのこだわり。国内自社工場での受注生産、ベンチマーク済みパーツ選定、24時間エージング、永年サポート。' },
          {
            key: 'body_html',
            value: '<p>長く愛されるゲーミングPCを。その想いから品質・デザイン・サポートのすべてに妥協しません。</p>',
          },
          {
            key: 'sections_json',
            value: JSON.stringify([
              { heading: '国内自社工場での受注生産', body: '日本国内の自社工場で1台ずつ組み立てます。熟練ビルダーが目視で仕上げ。' },
              { heading: 'ベンチマーク済みパーツ選定', body: '社内テストで性能・安定性・長期信頼性を確認したパーツのみを採用。' },
              { heading: '24時間エージングテスト', body: '出荷前に24時間の負荷テストを実施し、初期不良の芽を除去。' },
              { heading: 'IPコラボレーションの世界観', body: 'UV高精細印刷・着せ替えパネル・カラー8色展開で世界観を再現。' },
              { heading: '永年サポート', body: '保証期間後もメール・電話・LINEで永年無料サポート。' },
            ]),
          },
          { key: 'updated_label', value: '最終更新: 2026-04-18' },
          { key: 'is_published', value: 'true' },
        ],
      },
      {
        handle: 'page-recycle',
        fields: [
          { key: 'title', value: 'PCリサイクル・引取サービス' },
          { key: 'page_slug', value: 'recycle' },
          { key: 'meta_description', value: 'ASTROMEDAでは資源有効利用促進法に基づき、不要になったパソコンの回収・リサイクルを承っています。' },
          {
            key: 'body_html',
            value: '<p>ASTROMEDAでは資源有効利用促進法に基づき、不要になったパソコンの回収を承っています。</p>',
          },
          {
            key: 'sections_json',
            value: JSON.stringify([
              { heading: '対象機種', body: 'デスクトップ/ノート/ディスプレイ/一体型。メーカー・購入時期は問いません。' },
              { heading: '回収費用', body: 'PCリサイクルマーク付きは無料。マーク無しは所定のリサイクル料金。' },
              { heading: 'データ消去について', body: 'DoD 5220.22-M 準拠の物理消去サービス（有償）もご用意。消去証明書発行可。' },
              { heading: 'お申込みの流れ', body: 'STEP1: メールでご連絡 → STEP2: 見積もりと回収方法ご案内 → STEP3: 回収・データ消去実施。' },
              { heading: 'お問い合わせ窓口', body: 'メール: customersupport@mng-base.com / 電話: 03-6903-5371（平日10:00〜18:00）' },
            ]),
          },
          { key: 'updated_label', value: '最終更新: 2026-04-18' },
          { key: 'is_published', value: 'true' },
        ],
      },
      {
        handle: 'page-yojimaru',
        fields: [
          { key: 'title', value: 'よじまるPC' },
          { key: 'page_slug', value: 'yojimaru' },
          { key: 'meta_description', value: 'よじまるさんコラボレーションPC。ストリーマー監修のゲーミング環境をASTROMEDAのカラーバリエーションと共に。' },
          {
            key: 'body_html',
            value: '<p>ストリーマー「よじまる」さん監修のコラボレーションゲーミングPC。</p>',
          },
          {
            key: 'sections_json',
            value: JSON.stringify([
              { heading: 'コラボレーションについて', body: 'よじまるさん監修のスペック構成で配信・ゲームプレイ両面で快適にご利用いただけます。' },
              { heading: 'ラインナップ', body: '最新ラインナップはゲーミングPCコレクション内でご確認いただけます。' },
              { heading: 'お問い合わせ', body: 'メール: customersupport@mng-base.com / 電話: 03-6903-5371（平日10:00〜18:00）' },
            ]),
          },
          { key: 'updated_label', value: '最終更新: 2026-04-18' },
          { key: 'is_published', value: 'true' },
        ],
      },
    ],
  });

  return seeds;
}

// ── Action ──
export async function action({ request, context }: Route.ActionArgs) {
  const contextEnv = (context as unknown as { env: Env }).env || ({} as Env);

  // Origin/Referer CSRF検証
  const csrfError = await verifyCsrfForAdmin(request, contextEnv);
  if (csrfError) return csrfError;

  const limited = applyRateLimit(request, 'api.admin.cms-seed', RATE_LIMIT_PRESETS.admin);
  if (limited) return limited;

  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { verifyAdminAuth } = await import('~/lib/admin-auth');
    const auth = await verifyAdminAuth(request, contextEnv);
    if (!auth.authenticated) return auth.response;

    const sessionFromContext = (context as unknown as { session?: AppSession }).session;
    const session =
      sessionFromContext ??
      (await AppSession.init(request, [
        String((contextEnv as unknown as { SESSION_SECRET?: string }).SESSION_SECRET || ''),
      ]));

    const { requirePermission } = await import('~/lib/rbac');
    const role = requirePermission(session as AppSession, 'settings.edit');

    const { setAdminEnv, getAdminClient } = await import('../../agents/core/shopify-admin.js');
    setAdminEnv(contextEnv);
    const client = getAdminClient();

    // フィルタ: body で type を指定した場合、その type のみを対象にする
    let targetTypes: string[] | null = null;
    try {
      const body = await request.json();
      if (body && Array.isArray(body.types)) targetTypes = body.types as string[];
    } catch {
      // body 無しは全 type 対象
    }

    const seeds = buildSeeds().filter(
      (s) => !targetTypes || targetTypes.includes(s.type),
    );

    const summary: Record<
      string,
      { planned: number; created: number; skipped: number; errors: number }
    > = {};
    const errors: Array<{ type: string; handle: string; message: string }> = [];

    for (const spec of seeds) {
      const stat = { planned: spec.records.length, created: 0, skipped: 0, errors: 0 };
      summary[spec.type] = stat;

      // 既存 handle を取得してスキップ判定
      let existingHandles = new Set<string>();
      try {
        const existing = await client.getMetaobjects(spec.type, 250);
        existingHandles = new Set(existing.map((e) => e.handle));
      } catch (err) {
        // 定義が存在しない等 → 全件作成試行（失敗したらエラーに積む）
        errors.push({
          type: spec.type,
          handle: '(list)',
          message: `既存一覧取得失敗: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      for (const rec of spec.records) {
        if (existingHandles.has(rec.handle)) {
          stat.skipped += 1;
          continue;
        }
        try {
          await client.createMetaobject(spec.type, rec.handle, rec.fields, {
            status: 'ACTIVE',
          });
          stat.created += 1;
        } catch (err) {
          stat.errors += 1;
          errors.push({
            type: spec.type,
            handle: rec.handle,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    const totalCreated = Object.values(summary).reduce((s, x) => s + x.created, 0);
    const totalSkipped = Object.values(summary).reduce((s, x) => s + x.skipped, 0);
    const totalErrors = Object.values(summary).reduce((s, x) => s + x.errors, 0);

    auditLog({
      action: 'content_create',
      role,
      resource: 'api/admin/cms-seed',
      detail: `seed: +${totalCreated} created / ${totalSkipped} skipped / ${totalErrors} errors`,
      success: totalErrors === 0,
    });

    return data({
      success: totalErrors === 0,
      summary,
      totals: { created: totalCreated, skipped: totalSkipped, errors: totalErrors },
      errors: errors.slice(0, 50),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return data(
      { success: false, error: `CMS seed 失敗: ${msg}` },
      { status: 500 },
    );
  }
}

export async function loader() {
  return data({
    message: 'POST this endpoint to seed initial Metaobject instances from astromeda-data.ts',
    defaultTypes: [
      'astromeda_ip_banner',
      'astromeda_hero_banner',
      'astromeda_pc_color',
      'astromeda_pc_tier',
      'astromeda_ugc_review',
      'astromeda_marquee_item',
      'astromeda_category_card',
      'astromeda_about_section',
      'astromeda_product_shelf',
      'astromeda_legal_info',
      'astromeda_site_config',
      'astromeda_static_page',
    ],
    usage:
      'POST {} でデフォルト全12タイプ投入。POST { "types": ["astromeda_ip_banner"] } で特定タイプのみ。既存 handle はスキップされる（冪等）。',
  });
}
