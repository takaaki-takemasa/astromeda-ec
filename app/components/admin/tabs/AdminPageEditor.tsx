/**
 * Admin Page Editor — Sprint 2 Part 4-B
 *
 * Metaobject 5種 (color_model / category_card / product_shelf / about_section / footer_config)
 * を管理画面から完全編集できる統合タブ。
 *
 * セキュリティ: 既存 admin._index.tsx の authGuard 継承、各 API が RateLimit→AdminAuth→RBAC→CSRF→Zod。
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useSearchParams} from 'react-router';
import {T, al, COLLABS} from '~/lib/astromeda-data';
import PreviewFrame, {type PreviewDevice} from '~/components/admin/preview/PreviewFrame';
import {PCShowcase} from '~/components/astro/PCShowcase';
import {CollabGrid} from '~/components/astro/CollabGrid';
import {HeroSlider} from '~/components/astro/HeroSlider';
import {UrlPicker} from '~/components/admin/ds/UrlPicker';

// patch 0047 Phase C 第1段: 共有プリミティブを shared.tsx へ外出し。
// ここは import だけ残し、型/スタイル/ヘルパー/UI の実装は shared.tsx に集約した。
import {
  // 型
  type ColorModel,
  type CategoryCard,
  type ProductShelf,
  type AboutSection,
  type FooterConfig,
  type IpBanner,
  type HeroBanner,
  type SubTab,
  type Toast,
  type SectionProps,
  type SynthCollection,
  // スタイル
  cardStyle,
  labelStyle,
  inputStyle,
  btn,
  thStyle,
  tdStyle,
  // フック
  useToasts,
  useConfirmDialog,
  // UI
  ConfirmDialog,
  Spinner,
  ToastContainer,
  Modal,
  // API
  apiPost,
  apiGet,
  cmsCreate,
  cmsUpdate,
  cmsDelete,
  // 画像 fallback
  fetchCollectionImagesMap,
  synthesizeCollections,
} from './pageEditor/shared';
// patch 0047 Phase C 第1段: UgcReviewsSection は独立ファイルへ
import {UgcReviewsSection} from './pageEditor/UgcReviewsSection';
// patch 0049 Phase C 第2段: ColorModelsSection + ColorModelForm は独立ファイルへ
import {ColorModelsSection} from './pageEditor/ColorModelsSection';
// patch 0050 Phase C 第2段: CategoryCardsSection + CategoryCardForm は独立ファイルへ
import {CategoryCardsSection} from './pageEditor/CategoryCardsSection';
// patch 0051 Phase C 第2段: ProductShelvesSection + ProductShelfForm は独立ファイルへ
import {ProductShelvesSection} from './pageEditor/ProductShelvesSection';
// patch 0052 Phase C 第2段: AboutSectionsSection + AboutSectionForm は独立ファイルへ
import {AboutSectionsSection} from './pageEditor/AboutSectionsSection';
// patch 0053 Phase C 第2段: FooterConfigsSection + FooterConfigForm は独立ファイルへ
import {FooterConfigsSection} from './pageEditor/FooterConfigsSection';
// patch 0054 Phase C 第2段: IpBannersSection + IpBannerForm は独立ファイルへ
import {IpBannersSection} from './pageEditor/IpBannersSection';
// patch 0055 Phase C 第2段: HeroBannersSection + HeroBannerForm は独立ファイルへ
import {HeroBannersSection} from './pageEditor/HeroBannersSection';
// patch 0056 Phase C 第2段: CustomizationMatrixSection は独立ファイルへ
import {CustomizationMatrixSection} from './pageEditor/CustomizationMatrixSection';
// patch 0056 Phase C 第2段: Gaming 系 5 Section は独立ファイルへ
import {
  GamingFeatureCardsSection,
  GamingPartsCardsSection,
  GamingPriceRangesSection,
  GamingHeroSlidesSection,
  GamingContactSection,
} from './pageEditor/GamingSections';

// patch 0047 Phase C 第1段: 型/スタイル/ヘルパー/UI は ./pageEditor/shared.tsx へ集約済み。
// ここでは AdminPageEditor 本体と 14 Section の定義だけ残している。

// ══════════════════════════════════════════════════════════
// メインコンポーネント
// ══════════════════════════════════════════════════════════

const VALID_SUB_TABS: SubTab[] = ['visual', 'color_models', 'category_cards', 'product_shelves', 'about_sections', 'footer_configs', 'ip_banners', 'hero_banners', 'customization_matrix', 'gaming_feature_cards', 'gaming_parts_cards', 'gaming_price_ranges', 'gaming_hero', 'gaming_contact', 'ugc_reviews'];

export default function AdminPageEditor() {
  const [searchParams] = useSearchParams();
  const subParam = searchParams.get('sub');
  const initialSubTab: SubTab =
    subParam && (VALID_SUB_TABS as string[]).includes(subParam) ? (subParam as SubTab) : 'visual';
  const [subTab, setSubTab] = useState<SubTab>(initialSubTab);

  // URL の sub パラメータ変化に追従（Site Map からの遷移対応）
  useEffect(() => {
    if (subParam && (VALID_SUB_TABS as string[]).includes(subParam)) {
      setSubTab(subParam as SubTab);
    }
  }, [subParam]);

  const {toasts, push} = useToasts();
  const {state: confirmState, confirm, handleOk: confirmOk, handleCancel: confirmCancel} = useConfirmDialog();

  // patch 0027: CEO 要望「現在のサイトUIを表示し、クリックしたところの修正画面に行けるようにして」
  // → 先頭に「ビジュアル編集」タブを配置し、live site を iframe 表示＋各セクションへのショートカット。
  const tabs: Array<{key: SubTab; label: string}> = [
    {key: 'visual', label: '🖼 ビジュアル編集'},
    {key: 'ip_banners', label: 'IPコラボ'},
    {key: 'hero_banners', label: 'ヒーローバナー'},
    {key: 'color_models', label: 'カラーモデル'},
    {key: 'category_cards', label: 'カテゴリカード'},
    {key: 'product_shelves', label: '商品棚'},
    {key: 'about_sections', label: 'ABOUT'},
    {key: 'footer_configs', label: 'フッター'},
    {key: 'customization_matrix', label: 'カスタマイズマトリックス'},
    {key: 'gaming_hero', label: '🎮 ヒーロー (Gaming)'},
    {key: 'gaming_feature_cards', label: '🎮 特集カード (Gaming)'},
    {key: 'gaming_parts_cards', label: '🎮 パーツカード (Gaming)'},
    {key: 'gaming_price_ranges', label: '🎮 価格帯 (Gaming)'},
    {key: 'gaming_contact', label: '🎮 お問い合わせ (Gaming)'},
    {key: 'ugc_reviews', label: '⭐ レビュー (UGC)'},
  ];

  return (
    <div style={{padding: 20, color: T.tx}}>
      <div style={{marginBottom: 16}}>
        <h2 style={{fontSize: 18, fontWeight: 900, margin: 0, color: T.tx}}>ページ編集</h2>
        <div style={{fontSize: 11, color: T.t4, marginTop: 4}}>
          トップページ構成要素を Metaobject で編集します。管理画面の変更は保存後すぐ本番に反映されます。
        </div>
      </div>

      <div style={{display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${al(T.tx, 0.1)}`, flexWrap: 'wrap'}}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSubTab(t.key)}
            style={{
              padding: '10px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${subTab === t.key ? T.c : 'transparent'}`,
              color: subTab === t.key ? T.tx : T.t4,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'visual' && <VisualEditSection onNavigate={setSubTab} pushToast={push} />}
      {subTab === 'ip_banners' && <IpBannersSection pushToast={push} confirm={confirm} />}
      {subTab === 'hero_banners' && <HeroBannersSection pushToast={push} confirm={confirm} />}
      {subTab === 'color_models' && <ColorModelsSection pushToast={push} confirm={confirm} />}
      {subTab === 'category_cards' && <CategoryCardsSection pushToast={push} confirm={confirm} />}
      {subTab === 'product_shelves' && <ProductShelvesSection pushToast={push} confirm={confirm} />}
      {subTab === 'about_sections' && <AboutSectionsSection pushToast={push} confirm={confirm} />}
      {subTab === 'footer_configs' && <FooterConfigsSection pushToast={push} confirm={confirm} />}
      {subTab === 'customization_matrix' && <CustomizationMatrixSection pushToast={push} confirm={confirm} />}
      {subTab === 'gaming_feature_cards' && <GamingFeatureCardsSection pushToast={push} confirm={confirm} />}
      {subTab === 'gaming_parts_cards' && <GamingPartsCardsSection pushToast={push} confirm={confirm} />}
      {subTab === 'gaming_price_ranges' && <GamingPriceRangesSection pushToast={push} confirm={confirm} />}
      {subTab === 'gaming_hero' && <GamingHeroSlidesSection pushToast={push} confirm={confirm} />}
      {subTab === 'gaming_contact' && <GamingContactSection pushToast={push} confirm={confirm} />}
      {subTab === 'ugc_reviews' && <UgcReviewsSection pushToast={push} confirm={confirm} />}

      <ToastContainer toasts={toasts} />
      <ConfirmDialog open={confirmState.open} message={confirmState.message} onOk={confirmOk} onCancel={confirmCancel} />
      <style dangerouslySetInnerHTML={{__html: `@keyframes aped-spin { to { transform: rotate(360deg); } }`}} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// VisualEditSection — patch 0027
// CEO 要望「現在のサイトUIを表示し、クリックしたところの修正画面に行けるようにして」
// → live storefront を iframe で表示し、各セクションに編集ショートカットを配置。
// ══════════════════════════════════════════════════════════

// patch 0033: ページ別のビジュアル編集対応。CEO 要望:
// 「ゲーミングPCタブの中が一切修正することができない。トップページと同じように
//  視覚的に修正できるようにして」→ iframe URL とセクション定義をページ毎に切替える。
type PageKey = 'home' | 'gaming-pc';

// ゲーミングPC LP には SubTab に無いセクションもあるので、section の key は
// SubTab を含むより広い文字列 literal union にする。highlight の data-astro-section
// キーに使うだけなので型はラフに string で OK。
type SectionKey =
  | SubTab
  | 'feature'
  | 'ranking'
  | 'search_parts'
  | 'price_range'
  | 'contact'
  | 'news';

interface SectionDef {
  key: SectionKey;
  label: string;
  desc: string;
  icon: string;
  num: string;
  color: string;
  match: (text: string, el: Element) => boolean;
  // navTab が定義されている場合はクリックで該当サブタブにジャンプする。
  // 無い場合は info トーストで「どこで編集するか」を案内する。
  navTab?: SubTab;
  info?: string;
}

// patch 0029: 各セクションに固有色＋番号（WCAG AA コントラスト十分な飽和系で区別）。
const HOME_SECTIONS: SectionDef[] = [
  {
    key: 'hero_banners', label: 'ヒーローバナー', desc: 'トップのスライダー',
    icon: '🎬', num: '①', color: '#FF4D8D', navTab: 'hero_banners',
    match: (_, el) => el.classList?.contains('hero-slider-wrap') === true,
  },
  {
    key: 'color_models', label: 'PC カラー', desc: '8色モデル',
    icon: '🎨', num: '②', color: '#FFD84D', navTab: 'color_models',
    match: (t) => /全\s*8\s*色カラー|COLOR\s*EDITIONS/i.test(t),
  },
  {
    key: 'about_sections', label: 'ABOUT', desc: 'ブランド紹介セクション',
    icon: '📖', num: '③', color: '#B57CFF', navTab: 'about_sections',
    match: (t, el) => el.tagName === 'SECTION' && /^ABOUT\b|ASTROMEDAとは/i.test(t.trim()),
  },
  {
    key: 'category_cards', label: 'カテゴリ', desc: 'PC / ガジェット / グッズ',
    icon: '📁', num: '④', color: '#4DDB8A', navTab: 'category_cards',
    match: (t) => /^CATEGORY\b/.test(t.trim()),
  },
  {
    key: 'ip_banners', label: 'IPコラボ', desc: '26タイトル IP カード',
    icon: '🎌', num: '⑤', color: '#FF9A3C', navTab: 'ip_banners',
    match: (t) => /IP\s*COLLABS|タイトル[\s\S]{0,4}NEW/.test(t.slice(0, 50)),
  },
  {
    key: 'product_shelves', label: '商品棚', desc: '新着・人気棚',
    icon: '🛍', num: '⑥', color: '#4DB8FF', navTab: 'product_shelves',
    match: (t) => /NEW\s*ARRIVALS/i.test(t.slice(0, 40)),
  },
  {
    // patch 0039: UGC レビュー（星・コメント）を視覚編集から編集可能に
    key: 'ugc_reviews', label: 'レビュー', desc: 'ユーザー星・コメント',
    icon: '⭐', num: '⑦', color: '#F06292', navTab: 'ugc_reviews',
    // .ugc-card クラス or REVIEWS 見出しで検知
    match: (t, el) =>
      el.classList?.contains('ugc-card') === true ||
      /REVIEWS\b|ユーザーレビュー/.test(t.slice(0, 30)),
  },
  {
    key: 'footer_configs', label: 'フッター', desc: '法務情報・リンク',
    icon: '🦶', num: '⑧', color: '#FF6B6B', navTab: 'footer_configs',
    match: (_, el) => el.tagName === 'FOOTER',
  },
  {
    key: 'customization_matrix', label: 'カスタマイズ', desc: '商品タグ × オプション行列',
    icon: '⚙️', num: '⑨', color: '#C9C9C9', navTab: 'customization_matrix',
    match: () => false, // トップページには露出しない（商品詳細側の機能）
  },
];

// patch 0033: /collections/gaming-pc (GamingPCLanding コンポーネント) の
// 全7セクションを視覚化する。SectionTitle は <div>{ja}</div><div>{en}</div>
// パターンのため、text が「特集 FEATURE」「人気ランキング RANKING」等になる。
const GAMING_PC_SECTIONS: SectionDef[] = [
  {
    // patch 0039: gaming-pc 専用 Metaobject (astromeda_gaming_hero_slide) を編集する
    // gaming_hero タブへ誘導。トップの hero_banners とは別管理。
    key: 'gaming_hero', label: 'ヒーローバナー', desc: 'ゲーミングPC LP 上部のスライダー',
    icon: '🎬', num: '①', color: '#FF4D8D', navTab: 'gaming_hero',
    // patch 0034: GamingPCLanding は gpc-hero-wrap を使う
    match: (_, el) =>
      el.classList?.contains('gpc-hero-wrap') === true ||
      el.classList?.contains('hero-slider-wrap') === true,
  },
  {
    key: 'feature', label: '特集 FEATURE', desc: '特集カード 4 枚を Metaobject から編集',
    icon: '⭐', num: '②', color: '#FFD84D', navTab: 'gaming_feature_cards',
    match: (t) => /FEATURE\b|^特集\s|特集\nFEATURE/.test(t.slice(0, 30)),
  },
  {
    key: 'ranking', label: '人気ランキング', desc: 'Shopifyコレクション並び順で自動反映',
    icon: '🏆', num: '③', color: '#B57CFF',
    info: '人気ランキングは Shopify 管理画面「コレクション → gaming-pc → 並び順」で変更してください。画像や価格は各商品ページの編集に従います。',
    match: (t) => /RANKING\b|人気ランキング/.test(t.slice(0, 40)),
  },
  {
    key: 'search_parts', label: 'パーツで選ぶ', desc: 'CPU / GPU カードを Metaobject から編集',
    icon: '🧩', num: '④', color: '#4DDB8A', navTab: 'gaming_parts_cards',
    match: (t) => /SEARCH\b|パーツで選ぶ|CPUから選択|GPUから選択/.test(t.slice(0, 60)),
  },
  {
    key: 'price_range', label: '値段で選ぶ', desc: '価格帯リンクを Metaobject から編集',
    icon: '💴', num: '⑤', color: '#FF9A3C', navTab: 'gaming_price_ranges',
    match: (t) => /PRICE\s*RANGE|値段で選ぶ/.test(t.slice(0, 40)),
  },
  {
    // patch 0039: gaming_contact Metaobject 編集タブへ誘導
    key: 'gaming_contact', label: 'お問い合わせ', desc: '電話 / LINE 連絡先',
    icon: '📞', num: '⑥', color: '#4DB8FF', navTab: 'gaming_contact',
    match: (t) => /CONTACT\b|お問い合わせ/.test(t.slice(0, 30)),
  },
  {
    key: 'news', label: 'お知らせ', desc: 'ニュース / お知らせ一覧',
    icon: '📰', num: '⑦', color: '#C9C9C9',
    info: 'お知らせは現在 Shopify ブログ記事から自動取得されています。Shopify 管理画面「オンラインストア → ブログ記事」で新規作成・編集してください。',
    match: (t) => /INFORMATION\b|お知らせ/.test(t.slice(0, 30)),
  },
  {
    key: 'footer_configs', label: 'フッター', desc: '法務情報・リンク',
    icon: '🦶', num: '⑧', color: '#FF6B6B', navTab: 'footer_configs',
    match: (_, el) => el.tagName === 'FOOTER',
  },
];

const PAGE_DEFS: Record<PageKey, {label: string; icon: string; path: string; sections: SectionDef[]}> = {
  home: {label: 'トップページ', icon: '🏠', path: '/', sections: HOME_SECTIONS},
  'gaming-pc': {label: 'ゲーミングPC', icon: '🎮', path: '/collections/gaming-pc', sections: GAMING_PC_SECTIONS},
};

interface VisualEditSectionProps {
  onNavigate: (tab: SubTab) => void;
  pushToast: (msg: string, type: 'success' | 'error') => void;
}

function VisualEditSection({onNavigate, pushToast}: VisualEditSectionProps) {
  // iframe refresh key（保存後に再読み込みして最新反映を確認するため）
  const [iframeKey, setIframeKey] = useState(0);
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  // patch 0033: 表示するストアフロントページ（トップ / ゲーミングPC / ...）
  const [pageKey, setPageKey] = useState<PageKey>('home');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const pageDef = PAGE_DEFS[pageKey];
  const sections = pageDef.sections;

  const deviceWidth: Record<PreviewDevice, number | string> = {
    mobile: 375,
    tablet: 768,
    desktop: '100%',
  };

  // patch 0029 + 0030: iframe ロード時に contentDocument へ色付き番号オーバーレイを
  // 注入する。各セクションに floating pill ラベルを被せ、`data-astro-section`
  // 属性を付ける。hover 時は JS で該当要素に outline をかけて auto-scroll。
  //
  // patch 0030 (2026-04-19): React hydration が完了する前に injectOverlays が走ると
  // iframe.contentDocument.querySelector('main') の children が cart-main(h=0) しか無く
  // 7 セクション中 footer 以外検出失敗していた。idempotent 化＋MutationObserver＋
  // 多段リトライ (50ms / 250ms / 600ms / 1.2s / 2.5s / 4s / 6s) で hydration の
  // どのタイミングでも全セクションが拾えるようにする。
  const injectOverlays = useCallback(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    let doc: Document | null = null;
    try {
      doc = frame.contentDocument;
    } catch {
      return; // cross-origin — should never happen after patch 0028
    }
    if (!doc || doc.readyState !== 'complete') return;

    const styleId = 'astro-visual-edit-style';
    if (!doc.getElementById(styleId)) {
      const s = doc.createElement('style');
      s.id = styleId;
      s.textContent = `
        [data-astro-section] { position: relative !important; transition: outline 0.2s ease, box-shadow 0.2s ease; }
        [data-astro-section].astro-highlight { outline: 4px solid var(--astro-sec-color, #fff) !important; outline-offset: -2px; box-shadow: 0 0 0 8px rgba(255,255,255,0.06), 0 0 0 12px var(--astro-sec-color-a, rgba(255,77,141,0.3)) !important; }
        .astro-section-pill {
          position: absolute; top: 8px; left: 8px; z-index: 9999;
          padding: 5px 10px 5px 8px; border-radius: 20px;
          font: 700 12px/1 system-ui, sans-serif;
          color: #0a0a0a; pointer-events: none;
          box-shadow: 0 2px 8px rgba(0,0,0,0.35);
          display: inline-flex; align-items: center; gap: 6px;
          letter-spacing: 0.3px;
        }
        .astro-section-pill .num { font-size: 15px; }
      `;
      doc.head.appendChild(s);
    }

    // 候補コンテナ収集: main 直下 + その孫 + すべての section/footer/header。
    // hydration 途中だと main が cart-main しか持たないので、深掘りも併用する。
    //
    // patch 0031: Hydrogen は cart/predictive 用の空の <main> を 2 つ + 本体の
    // <main id="main-content"> を 3 個 DOM に出力する。`querySelector('main')` は
    // 先頭のカート空 main を返してしまうため、id="main-content" を最優先で取り、
    // なければ高さで判別する。
    const containerSet = new Set<Element>();
    const mainsAll = Array.from(doc.querySelectorAll('main'));
    const mainRoot =
      doc.getElementById('main-content') ||
      mainsAll.find((m) => (m as HTMLElement).offsetHeight > 200) ||
      mainsAll[0] ||
      null;
    if (mainRoot) {
      Array.from(mainRoot.children).forEach((c) => {
        containerSet.add(c);
        Array.from(c.children).forEach((gc) => containerSet.add(gc));
      });
      // セクション系タグも全部回収（hero-slider-wrap などの命名コンテナ含む）
      // patch 0035: GamingPCLanding 系の gpc-* も同様に深い階層から拾う。
      mainRoot
        .querySelectorAll(
          'section, header, [class*="hero-slider"], [class*="collab-grid"], [class*="pc-showcase"], [class*="gpc-hero"], [class*="gpc-feature"], [class*="gpc-ranking"], [class*="gpc-search"], [class*="gpc-price"], [class*="gpc-contact"], [class*="gpc-info"]',
        )
        .forEach((el) => containerSet.add(el));
    }
    const footer = doc.querySelector('footer');
    if (footer) containerSet.add(footer);

    // patch 0032: text match は「もっとも小さい合致コンテナ」を選ぶ。
    // これをやらないと bodyWrap (h=5141) が `全8色カラー` を含むテキストで
    // color_models に吸われてしまい、本物の `<section>`（h=531）が無視される。
    // また、明らかに大きすぎる（3500px 超）コンテナは text 照合対象から外す。
    const containers = Array.from(containerSet).sort(
      (a, b) => (a as HTMLElement).offsetHeight - (b as HTMLElement).offsetHeight,
    );

    // patch 0033: ページ切替時に前ページの pill/highlight が残らないよう、
    // 現在 sections に含まれない [data-astro-section] は剥がす。
    const currentKeys = new Set(sections.map((s) => s.key));
    doc.querySelectorAll('[data-astro-section]').forEach((el) => {
      const k = el.getAttribute('data-astro-section') || '';
      if (!currentKeys.has(k as SectionKey)) {
        el.removeAttribute('data-astro-section');
        el.querySelectorAll(':scope > .astro-section-pill').forEach((n) => n.remove());
      }
    });

    for (const sec of sections) {
      // 既にタグ付け済みならスキップ（idempotent: 多段リトライで重複しない）
      if (doc.querySelector(`[data-astro-section="${sec.key}"]`)) continue;

      for (const el of containers) {
        const htmlEl = el as HTMLElement;
        // ほぼ空っぽ／非表示の要素はスキップ（hydration 前の placeholder 対策）
        if (htmlEl.offsetHeight < 40) continue;

        const text = (htmlEl.innerText || '').trim();
        let matched = false;
        try {
          matched = sec.match(text, el);
        } catch {
          matched = false;
        }
        if (!matched) continue;

        htmlEl.setAttribute('data-astro-section', sec.key);
        htmlEl.style.setProperty('--astro-sec-color', sec.color);
        htmlEl.style.setProperty('--astro-sec-color-a', sec.color + '55');
        // 既存 pill 除去（hydration 中の重複防止）
        htmlEl.querySelectorAll(':scope > .astro-section-pill').forEach((n) => n.remove());

        const pill = doc!.createElement('span');
        pill.className = 'astro-section-pill';
        pill.setAttribute('data-astro-overlay', '1');
        pill.style.background = sec.color;
        pill.innerHTML = `<span class="num">${sec.num}</span><span>${sec.label}</span>`;

        const cs = frame.contentWindow?.getComputedStyle(htmlEl);
        if (cs && cs.position === 'static') htmlEl.style.position = 'relative';
        htmlEl.appendChild(pill);
        break;
      }
    }
  }, [sections]); // patch 0033: pageKey 変更で sections 参照が切り替わる

  // iframe が差し替わる度に overlay 再注入。
  // patch 0030: 単一 setTimeout では React hydration を取り逃すので、
  // 多段リトライ＋MutationObserver で hydration 中に発火する子要素追加を
  // ハンドリングし、最終的に全セクション pill が揃うまで自動で再試行する。
  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const tryInject = () => {
      if (cancelled) return;
      injectOverlays();
    };

    const onLoad = () => {
      // 多段リトライ — hydration がいつ終わっても拾える
      [50, 250, 600, 1200, 2500, 4000, 6000].forEach((d) =>
        timers.push(setTimeout(tryInject, d)),
      );
      // patch 0031: body 全体の subtree を観察する。複数 main 問題回避＋
      // footer/header の変化にも追従する。
      const doc = frame.contentDocument;
      if (!doc) return;
      const target = doc.body;
      if (target) {
        observer = new MutationObserver(() => {
          if (cancelled) return;
          tryInject();
        });
        observer.observe(target, {childList: true, subtree: true});
      }
    };

    frame.addEventListener('load', onLoad);
    // 既にロード済みなら即注入
    if (frame.contentDocument?.readyState === 'complete') onLoad();

    return () => {
      cancelled = true;
      observer?.disconnect();
      timers.forEach((t) => clearTimeout(t));
      frame.removeEventListener('load', onLoad);
    };
  }, [iframeKey, injectOverlays]);

  // patch 0033: pageKey が変わったら iframe を強制再ロード（src を切替えるため）。
  // iframeKey 増分で iframe の `key` prop が変わって React が再マウントする。
  useEffect(() => {
    setIframeKey((k) => k + 1);
  }, [pageKey]);

  // サイドバーボタン hover で iframe 内の該当セクションを scroll+highlight
  const highlightSection = useCallback((key: SectionKey) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.querySelectorAll('[data-astro-section].astro-highlight').forEach((n) =>
      n.classList.remove('astro-highlight'),
    );
    const target = doc.querySelector<HTMLElement>(`[data-astro-section="${key}"]`);
    if (!target) return;
    target.classList.add('astro-highlight');
    target.scrollIntoView({behavior: 'smooth', block: 'start'});
  }, []);

  const clearHighlight = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.querySelectorAll('[data-astro-section].astro-highlight').forEach((n) =>
      n.classList.remove('astro-highlight'),
    );
  }, []);

  return (
    <div style={cardStyle}>
      <div style={{marginBottom: 14}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx, marginBottom: 4}}>
          ビジュアル編集 — 現在のサイトUIを見ながら修正する場所へ移動
        </div>
        <div style={{fontSize: 11, color: T.t4, lineHeight: 1.6}}>
          <b style={{color: T.c}}>各セクションに色と番号が付いています。</b>
          右のボタンにマウスを合わせると左プレビューの同じ色の場所が光ります。クリックすると編集タブに切り替わります。
        </div>
      </div>

      {/* patch 0033: ページ切替セグメント — トップ / ゲーミングPC を切替えて iframe を再ロード */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 14,
          padding: 8,
          background: al(T.tx, 0.04),
          border: `1px solid ${al(T.tx, 0.1)}`,
          borderRadius: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <span style={{fontSize: 11, fontWeight: 800, color: T.t5, letterSpacing: 1, marginRight: 4}}>
          編集するページ
        </span>
        {(Object.keys(PAGE_DEFS) as PageKey[]).map((pk) => {
          const p = PAGE_DEFS[pk];
          const active = pageKey === pk;
          return (
            <button
              key={pk}
              type="button"
              onClick={() => setPageKey(pk)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                background: active ? T.c : 'transparent',
                color: active ? '#0a0a0a' : T.tx,
                border: `1px solid ${active ? T.c : al(T.tx, 0.2)}`,
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.15s, border-color 0.15s',
              }}
              title={p.path}
            >
              <span style={{fontSize: 14}}>{p.icon}</span>
              <span>{p.label}</span>
              <span style={{fontSize: 10, opacity: 0.7, fontWeight: 500, marginLeft: 4}}>{p.path}</span>
            </button>
          );
        })}
      </div>

      <div style={{display: 'flex', gap: 16, flexWrap: 'wrap'}}>
        {/* LEFT: live storefront iframe */}
        <div style={{flex: '1 1 640px', minWidth: 320}}>
          <div
            style={{
              display: 'flex',
              gap: 6,
              marginBottom: 8,
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={() => setIframeKey((k) => k + 1)}
              style={btn(true)}
              title="最新の保存内容で再読み込み"
            >
              🔄 再読込
            </button>
            <div style={{flex: 1}} />
            {(['mobile', 'tablet', 'desktop'] as PreviewDevice[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDevice(d)}
                style={{
                  ...btn(device === d),
                  padding: '6px 10px',
                  fontSize: 11,
                }}
              >
                {d === 'mobile' ? '📱' : d === 'tablet' ? '💻' : '🖥'} {d}
              </button>
            ))}
          </div>

          <div
            style={{
              border: `1px solid ${al(T.tx, 0.15)}`,
              borderRadius: 8,
              background: '#000',
              padding: 8,
              overflow: 'auto',
              height: 820,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <iframe
              ref={iframeRef}
              key={iframeKey}
              src={pageDef.path}
              title={`live storefront — ${pageDef.label}`}
              style={{
                width: deviceWidth[device],
                maxWidth: '100%',
                height: 800,
                border: 'none',
                borderRadius: 4,
                background: '#fff',
              }}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          </div>
          <div style={{fontSize: 10, color: T.t5, marginTop: 6}}>
            ※ このプレビューは本番サイトそのものです。URL: <code style={{color: T.c}}>{pageDef.path}</code>
          </div>
        </div>

        {/* RIGHT: section shortcuts — 色分け＋番号バッジ (patch 0029) */}
        <div style={{flex: '0 0 300px', minWidth: 280}}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: T.t5,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            このセクションを編集
          </div>
          <div style={{display: 'grid', gap: 8}}>
            {sections.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  if (s.navTab) {
                    onNavigate(s.navTab);
                  } else if (s.info) {
                    // patch 0033: 対応する管理画面タブが無いセクションは、編集方法を
                    // トーストで案内する（ハードコード/Shopifyブログ等）。
                    pushToast(s.info, 'error');
                  } else {
                    pushToast('このセクションはまだ管理画面から編集できません。', 'error');
                  }
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = al(s.color, 0.22);
                  e.currentTarget.style.borderColor = s.color;
                  e.currentTarget.style.transform = 'translateX(2px)';
                  highlightSection(s.key);
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = al(s.color, 0.08);
                  e.currentTarget.style.borderColor = al(s.color, 0.3);
                  e.currentTarget.style.transform = 'translateX(0)';
                  clearHighlight();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px 12px 8px',
                  background: al(s.color, 0.08),
                  border: `1px solid ${al(s.color, 0.3)}`,
                  borderLeft: `6px solid ${s.color}`,
                  borderRadius: 6,
                  color: T.tx,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  fontSize: 12,
                  transition: 'background 0.15s, border-color 0.15s, transform 0.15s',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    background: s.color,
                    color: '#0a0a0a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                  title={`${s.num} ${s.label}`}
                >
                  {s.num}
                </div>
                <div style={{fontSize: 18, lineHeight: 1}}>{s.icon}</div>
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{fontWeight: 800, fontSize: 12, color: T.tx, marginBottom: 2}}>
                    {s.label}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: T.t5,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {s.desc}
                  </div>
                </div>
                {/* patch 0033: navTab があれば → 矢印、info 専用なら ⓘ で「案内のみ」を示す */}
                <div style={{color: s.color, fontWeight: 900, fontSize: 14}} title={s.navTab ? `${s.navTab} タブへ` : '編集方法を表示'}>
                  {s.navTab ? '→' : 'ⓘ'}
                </div>
              </button>
            ))}
          </div>

          <div
            style={{
              marginTop: 20,
              padding: 12,
              background: al(T.g, 0.08),
              border: `1px solid ${al(T.g, 0.25)}`,
              borderRadius: 6,
              fontSize: 11,
              color: T.t4,
              lineHeight: 1.6,
            }}
          >
            💡 <b style={{color: T.g}}>使い方</b><br />
            1. 左プレビューを見て、直したい場所の色と番号を覚える<br />
            2. 右の同じ色のボタンにマウスを置くと場所が光って分かる<br />
            3. クリックすれば該当編集タブに切り替わる<br />
            4. 保存後「🔄 再読込」で反映を確認
          </div>
        </div>
      </div>
    </div>
  );
}

// patch 0049 Phase C 第2段: ColorModelsSection + ColorModelForm は
// ./pageEditor/ColorModelsSection.tsx へ切り出し済み。戻し方: Git 履歴の `cbd3f6c` 時点 L799-1156 を参照。

// patch 0050 Phase C 第2段: CategoryCardsSection + CategoryCardForm は
// ./pageEditor/CategoryCardsSection.tsx へ切り出し済み。戻し方: Git 履歴の `a6fc170` 時点 L798-1132 を参照。

// patch 0051 Phase C 第2段: ProductShelvesSection + ProductShelfForm は
// ./pageEditor/ProductShelvesSection.tsx へ切り出し済み。戻し方: Git 履歴の `01713e6` 時点 L803-1169 を参照。

// patch 0052 Phase C 第2段: AboutSectionsSection + AboutSectionForm は
// ./pageEditor/AboutSectionsSection.tsx へ切り出し済み。戻し方: Git 履歴の `3689a0e` 時点 L809-1147 を参照。

// patch 0053 Phase C 第2段: FooterConfigsSection + FooterConfigForm は
// ./pageEditor/FooterConfigsSection.tsx へ切り出し済み。戻し方: Git 履歴の `cfbce7e` 時点 L815-1188 を参照。

// patch 0054 Phase C 第2段: IpBannersSection + IpBannerForm は
// ./pageEditor/IpBannersSection.tsx へ切り出し済み。戻し方: Git 履歴の `fcca0d3` 時点 L825-1213 を参照。

// patch 0055 Phase C 第2段: HeroBannersSection + HeroBannerForm は
// ./pageEditor/HeroBannersSection.tsx へ切り出し済み。戻し方: Git 履歴の `f19e245` 時点 L828-1192 を参照。

// patch 0056 Phase C 第2段: CustomizationMatrixSection + MatrixOption は
// ./pageEditor/CustomizationMatrixSection.tsx へ切り出し済み。戻し方: Git 履歴の `d153c3d` 時点 L834-1160 を参照。

// patch 0056 Phase C 第2段: GamingCrudSection + GamingFeatureCardsSection + GamingPartsCardsSection
// + GamingPriceRangesSection + GamingHeroSlidesSection + GamingContactSection + GamingCmsItem + GamingSectionConfig + cmsList は
// ./pageEditor/GamingSections.tsx へ切り出し済み。戻し方: Git 履歴の `d153c3d` 時点 L1162-1647 を参照。


// ══════════════════════════════════════════════════════════
// patch 0039: ユーザーレビュー (astromeda_ugc_review)
// patch 0047 Phase C 第1段: ./pageEditor/UgcReviewsSection.tsx へ切り出し済み。
// インライン定義は丸ごと削除した。実体は import 文 (ファイル冒頭) 経由で提供される。
// 戻し方: Git 履歴の `0837815` 時点 L4179-4801 を参照。
// ══════════════════════════════════════════════════════════
