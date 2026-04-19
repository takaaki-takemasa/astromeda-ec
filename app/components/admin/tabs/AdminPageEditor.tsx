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


// ══════════════════════════════════════════════════════════
// AboutSectionsSection
// ══════════════════════════════════════════════════════════

function AboutSectionsSection({pushToast, confirm}: SectionProps) {
  const [items, setItems] = useState<AboutSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AboutSection | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<{aboutSections: AboutSection[]}>('/api/admin/about-sections');
    setItems(res?.aboutSections || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (form: Partial<AboutSection> & {handle?: string}, isCreate: boolean) => {
    setSaving(true);
    const body: Record<string, unknown> = isCreate
      ? {
          action: 'create',
          handle: form.handle || '',
          title: form.title || '',
          bodyHtml: form.bodyHtml || '',
          linkUrl: form.linkUrl || '',
          linkLabel: form.linkLabel || '',
          isActive: form.isActive ?? true,
          image: form.image || undefined,
        }
      : {
          action: 'update',
          metaobjectId: form.id,
          title: form.title,
          bodyHtml: form.bodyHtml,
          linkUrl: form.linkUrl,
          linkLabel: form.linkLabel,
          isActive: form.isActive,
          image: form.image || undefined,
        };
    const res = await apiPost('/api/admin/about-sections', body);
    setSaving(false);
    if (res.success) {
      pushToast('保存しました', 'success');
      setEditing(null);
      setCreating(false);
      await load();
    } else {
      pushToast(`失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm('このエントリを削除しますか？'))) return;
    const res = await apiPost('/api/admin/about-sections', {action: 'delete', metaobjectId: id});
    if (res.success) {
      pushToast('削除しました', 'success');
      await load();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const modalOpen = creating || editing !== null;
  const initial: Partial<AboutSection> = creating ? {isActive: true} : editing || {};

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>ABOUT セクション ({items.length})</div>
        <button type="button" onClick={() => setCreating(true)} style={btn(true)}>＋ 新規追加</button>
      </div>
      {loading ? (
        <div style={{textAlign: 'center', padding: 40}}><Spinner /></div>
      ) : items.length === 0 ? (
        <div style={{color: T.t4, fontSize: 12, textAlign: 'center', padding: 30}}>エントリがありません</div>
      ) : (
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <thead>
            <tr>
              <th style={thStyle}>タイトル</th>
              <th style={thStyle}>本文 (抜粋)</th>
              <th style={thStyle}>リンクラベル</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td style={tdStyle}>{c.title}</td>
                <td style={{...tdStyle, color: T.t5, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                  {c.bodyHtml.replace(/<[^>]*>/g, '').slice(0, 60)}
                </td>
                <td style={tdStyle}>{c.linkLabel}</td>
                <td style={tdStyle}>{c.isActive ? '✓' : '—'}</td>
                <td style={{...tdStyle, textAlign: 'right'}}>
                  <button type="button" onClick={() => setEditing(c)} style={{...btn(), marginRight: 6}}>編集</button>
                  <button type="button" onClick={() => handleDelete(c.id)} style={btn(false, true)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalOpen && (
        <AboutSectionForm
          initial={initial}
          isCreate={creating}
          saving={saving}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSubmit={(form) => handleSave(form, creating)}
        />
      )}
    </div>
  );
}

function AboutSectionForm({
  initial,
  isCreate,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: Partial<AboutSection>;
  isCreate: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (form: Partial<AboutSection> & {handle?: string}) => void;
}) {
  const [handle, setHandle] = useState(initial.handle || '');
  const [title, setTitle] = useState(initial.title || '');
  const [bodyHtml, setBodyHtml] = useState(initial.bodyHtml || '');
  const [image, setImage] = useState(initial.image || '');
  const [linkUrl, setLinkUrl] = useState(initial.linkUrl || '');
  const [linkLabel, setLinkLabel] = useState(initial.linkLabel || '');
  const [isActive, setIsActive] = useState(initial.isActive ?? true);
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  // Live preview — 2カラム ABOUT セクション(左 image / 右 title+bodyHtml+CTA)
  const safeBodyHtml = bodyHtml.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  const previewPane = (
    <PreviewFrame device={device} onDeviceChange={setDevice}>
      <div style={{padding: 32, opacity: isActive ? 1 : 0.5}}>
        <div
          className="aped-about-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: device === 'mobile' ? '1fr' : '1fr 1fr',
            gap: 28,
            alignItems: 'center',
            background: `linear-gradient(135deg, #0a0e1a 0%, #0f1a2e 50%, #162040 100%)`,
            border: `1px solid ${al(T.c, 0.15)}`,
            borderRadius: 16,
            padding: 32,
          }}
        >
          {/* 左: Image */}
          <div
            style={{
              aspectRatio: '4/3',
              borderRadius: 12,
              overflow: 'hidden',
              position: 'relative',
              background: image
                ? T.bg
                : `linear-gradient(160deg, ${al(T.c, 0.18)}, ${al(T.tx, 0.02)} 70%)`,
              border: `1px solid ${al(T.tx, 0.08)}`,
            }}
          >
            {image && /^https?:\/\//.test(image) ? (
              <img
                src={image}
                alt={title || ''}
                style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block'}}
              />
            ) : (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: T.t4,
                  fontSize: 11,
                }}
              >
                {image ? `(GID: ${image.slice(0, 30)}...)` : '(画像未設定)'}
              </div>
            )}
          </div>

          {/* 右: Content */}
          <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: T.c,
                letterSpacing: 4,
                opacity: 0.8,
              }}
            >
              ABOUT
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 900,
                color: '#fff',
                lineHeight: 1.3,
                margin: 0,
              }}
            >
              {title || '(タイトル未入力)'}
            </div>
            {safeBodyHtml ? (
              <div
                style={{
                  fontSize: 13,
                  color: T.t5,
                  lineHeight: 1.7,
                }}
                dangerouslySetInnerHTML={{__html: safeBodyHtml}}
              />
            ) : (
              <div style={{fontSize: 12, color: T.t4, fontStyle: 'italic'}}>
                (本文未入力)
              </div>
            )}
            {(linkLabel || linkUrl) && (
              <div style={{marginTop: 8}}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '10px 20px',
                    background: al(T.c, 0.12),
                    border: `1px solid ${al(T.c, 0.4)}`,
                    borderRadius: 8,
                    color: T.c,
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: 1,
                  }}
                >
                  {linkLabel || '(ラベル未入力)'}
                </span>
                {linkUrl && (
                  <div style={{fontSize: 9, color: T.t4, marginTop: 4, fontFamily: 'monospace'}}>
                    → {linkUrl}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{fontSize: 9, color: T.t4, textAlign: 'center', marginTop: 14}}>
          ※ 2カラム layout preview (mobile = 縦積み)
        </div>
      </div>
    </PreviewFrame>
  );

  return (
    <Modal
      title={isCreate ? 'ABOUT セクション 新規追加' : 'ABOUT セクション 編集'}
      onClose={onCancel}
      preview={previewPane}
    >
      <div style={{display: 'grid', gap: 12}}>
        {isCreate && (
          <div>
            <label style={labelStyle}>Handle</label>
            <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} style={inputStyle} />
          </div>
        )}
        <div>
          <label style={labelStyle}>タイトル</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>本文 HTML</label>
          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            rows={6}
            style={{...inputStyle, fontFamily: 'monospace'}}
          />
          <div style={{fontSize: 10, color: T.t4, marginTop: 4}}>
            &lt;script&gt;タグは使用不可。その他 HTML タグは許可。
          </div>
        </div>
        <div>
          <label style={labelStyle}>image (Shopify file GID、optional)</label>
          <input type="text" value={image} onChange={(e) => setImage(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <UrlPicker
            label="リンク URL"
            optional
            value={linkUrl}
            onChange={(next) => setLinkUrl(next)}
          />
        </div>
        <div>
          <label style={labelStyle}>リンクラベル</label>
          <input type="text" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} style={inputStyle} placeholder="詳しく見る →" />
        </div>
        <div>
          <label style={{...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            有効
          </label>
        </div>
        <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
          <button type="button" onClick={onCancel} style={btn()} disabled={saving}>キャンセル</button>
          <button
            type="button"
            onClick={() => onSubmit({id: initial.id, handle, title, bodyHtml, image, linkUrl, linkLabel, isActive})}
            style={btn(true)}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════
// FooterConfigsSection
// ══════════════════════════════════════════════════════════

function FooterConfigsSection({pushToast, confirm}: SectionProps) {
  const [items, setItems] = useState<FooterConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FooterConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<{footerConfigs: FooterConfig[]}>('/api/admin/footer-configs');
    setItems(res?.footerConfigs || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (form: Partial<FooterConfig> & {handle?: string}, isCreate: boolean) => {
    setSaving(true);
    const body: Record<string, unknown> = isCreate
      ? {
          action: 'create',
          handle: form.handle || '',
          sectionTitle: form.sectionTitle || '',
          links: form.links || [],
          sortOrder: form.sortOrder ?? 0,
          isActive: form.isActive ?? true,
        }
      : {
          action: 'update',
          metaobjectId: form.id,
          sectionTitle: form.sectionTitle,
          links: form.links,
          sortOrder: form.sortOrder,
          isActive: form.isActive,
        };
    const res = await apiPost('/api/admin/footer-configs', body);
    setSaving(false);
    if (res.success) {
      pushToast('保存しました', 'success');
      setEditing(null);
      setCreating(false);
      await load();
    } else {
      pushToast(`失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm('このエントリを削除しますか？'))) return;
    const res = await apiPost('/api/admin/footer-configs', {action: 'delete', metaobjectId: id});
    if (res.success) {
      pushToast('削除しました', 'success');
      await load();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const modalOpen = creating || editing !== null;
  const initial: Partial<FooterConfig> = creating ? {sortOrder: 0, isActive: true, links: []} : editing || {};

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>フッター設定 ({items.length})</div>
        <button type="button" onClick={() => setCreating(true)} style={btn(true)}>＋ 新規追加</button>
      </div>
      <div style={{fontSize: 10, color: T.t4, marginBottom: 10}}>
        ※ 全エントリが完全 (section_title + links ≥1) になった時点でフロント Footer が Metaobject 表示に切替わります。不完全な間は既存の 13 リンク固定表示。
      </div>
      {loading ? (
        <div style={{textAlign: 'center', padding: 40}}><Spinner /></div>
      ) : items.length === 0 ? (
        <div style={{color: T.t4, fontSize: 12, textAlign: 'center', padding: 30}}>エントリがありません</div>
      ) : (
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <thead>
            <tr>
              <th style={thStyle}>セクション名</th>
              <th style={thStyle}>リンク数</th>
              <th style={thStyle}>順</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td style={tdStyle}>{c.sectionTitle}</td>
                <td style={tdStyle}>{c.links.length}</td>
                <td style={tdStyle}>{c.sortOrder}</td>
                <td style={tdStyle}>{c.isActive ? '✓' : '—'}</td>
                <td style={{...tdStyle, textAlign: 'right'}}>
                  <button type="button" onClick={() => setEditing(c)} style={{...btn(), marginRight: 6}}>編集</button>
                  <button type="button" onClick={() => handleDelete(c.id)} style={btn(false, true)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalOpen && (
        <FooterConfigForm
          initial={initial}
          isCreate={creating}
          saving={saving}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSubmit={(form) => handleSave(form, creating)}
        />
      )}
    </div>
  );
}

function FooterConfigForm({
  initial,
  isCreate,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: Partial<FooterConfig>;
  isCreate: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (form: Partial<FooterConfig> & {handle?: string}) => void;
}) {
  const [handle, setHandle] = useState(initial.handle || '');
  const [sectionTitle, setSectionTitle] = useState(initial.sectionTitle || '');
  const [links, setLinks] = useState<Array<{label: string; url: string}>>(initial.links || []);
  const [sortOrder, setSortOrder] = useState(initial.sortOrder ?? 0);
  const [isActive, setIsActive] = useState(initial.isActive ?? true);
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  const updateLink = (idx: number, key: 'label' | 'url', value: string) => {
    setLinks((prev) => prev.map((x, i) => (i === idx ? {...x, [key]: value} : x)));
  };
  const addLink = () => setLinks((prev) => [...prev, {label: '', url: ''}]);
  const removeLink = (idx: number) => setLinks((prev) => prev.filter((_, i) => i !== idx));
  const moveLink = (idx: number, dir: -1 | 1) => {
    setLinks((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  // Live preview — AstroFooter.tsx multi-column mode を再現
  // 1 FooterConfig エントリ = 1 カラム。編集中カラム + 3 プレースホルダーで 4カラムグリッド
  const previewLinks = links.filter((l) => l.label.trim() !== '');
  const isMobile = device === 'mobile';
  const previewPane = (
    <PreviewFrame device={device} onDeviceChange={setDevice}>
      <footer
        style={{
          borderTop: `1px solid ${al(T.c, 0.2)}`,
          background: '#000',
          opacity: isActive ? 1 : 0.5,
        }}
      >
        <section style={{padding: '36px 28px 20px'}}>
          {/* Brand */}
          <div style={{marginBottom: 28}}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 900,
                color: T.tx,
                letterSpacing: 4,
                marginBottom: 8,
              }}
            >
              ASTROMEDA
            </div>
            <div style={{fontSize: 11, color: T.t4, maxWidth: 500, lineHeight: 1.6}}>
              株式会社マイニングベースが手掛けるゲーミングPCブランド。
            </div>
          </div>

          {/* 4-column grid (編集中カラム + 3 placeholder) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)',
              gap: 20,
              marginBottom: 28,
            }}
          >
            {/* 編集中カラム */}
            <div>
              <div
                style={{
                  fontWeight: 800,
                  color: T.tx,
                  fontSize: 12,
                  letterSpacing: 1,
                  marginBottom: 10,
                  paddingBottom: 6,
                  borderBottom: `1px solid ${al(T.c, 0.3)}`,
                }}
              >
                {sectionTitle || '(セクション名未入力)'}
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                {previewLinks.length === 0 ? (
                  <div style={{fontSize: 10, color: T.t4, fontStyle: 'italic'}}>(リンク未設定)</div>
                ) : (
                  previewLinks.map((lk, i) => (
                    <div
                      key={`link-${i}-${lk.label}`}
                      style={{
                        color: T.t4,
                        textDecoration: 'underline',
                        fontSize: 11,
                        cursor: 'default',
                        display: 'block',
                        lineHeight: 1.4,
                      }}
                    >
                      {lk.label}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* placeholder columns (non-mobile のみ) */}
            {!isMobile &&
              [0, 1, 2].map((i) => (
                <div key={`ph${i}`}>
                  <div
                    style={{
                      fontWeight: 800,
                      color: al(T.tx, 0.25),
                      fontSize: 12,
                      letterSpacing: 1,
                      marginBottom: 10,
                      paddingBottom: 6,
                      borderBottom: `1px dashed ${al(T.tx, 0.1)}`,
                    }}
                  >
                    (他のカラム)
                  </div>
                  <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                    {[0, 1, 2].map((j) => (
                      <div
                        key={j}
                        style={{
                          height: 8,
                          background: al(T.tx, 0.05),
                          borderRadius: 2,
                          width: `${60 + j * 10}%`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </div>

          {/* Copyright + SNS (固定) */}
          <div
            style={{
              borderTop: `1px solid ${al(T.tx, 0.1)}`,
              paddingTop: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{fontSize: 10, color: T.t3}}>
              © 2026 Mining Base Co., Ltd. ALL RIGHTS RESERVED.
            </div>
            <div style={{display: 'flex', gap: 10, fontSize: 10, color: T.t4}}>
              <span>X</span>
              <span>LINE</span>
              <span>Instagram</span>
            </div>
          </div>
        </section>
      </footer>
      <div style={{fontSize: 9, color: T.t4, textAlign: 'center', marginTop: 8, padding: '0 8px'}}>
        ※ 1 エントリ = 1 カラム。他カラムは別 FooterConfig エントリとして管理
      </div>
    </PreviewFrame>
  );

  return (
    <Modal title={isCreate ? 'フッター 新規追加' : 'フッター 編集'} onClose={onCancel} preview={previewPane}>
      <div style={{display: 'grid', gap: 12}}>
        {isCreate && (
          <div>
            <label style={labelStyle}>Handle</label>
            <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} style={inputStyle} />
          </div>
        )}
        <div>
          <label style={labelStyle}>セクション名</label>
          <input type="text" value={sectionTitle} onChange={(e) => setSectionTitle(e.target.value)} style={inputStyle} placeholder="ポリシー" />
        </div>
        <div>
          <label style={labelStyle}>リンク一覧 ({links.length} 件)</label>
          <div style={{display: 'grid', gap: 6}}>
            {links.map((lk, i) => (
              <div key={i} style={{display: 'grid', gridTemplateColumns: '1fr 2fr auto auto auto', gap: 4, alignItems: 'center'}}>
                <input
                  type="text"
                  value={lk.label}
                  onChange={(e) => updateLink(i, 'label', e.target.value)}
                  placeholder="利用規約"
                  style={inputStyle}
                />
                <input
                  type="text"
                  value={lk.url}
                  onChange={(e) => updateLink(i, 'url', e.target.value)}
                  placeholder="/policies/terms"
                  style={inputStyle}
                />
                <button type="button" onClick={() => moveLink(i, -1)} disabled={i === 0} style={{...btn(), padding: '4px 8px'}}>↑</button>
                <button type="button" onClick={() => moveLink(i, 1)} disabled={i === links.length - 1} style={{...btn(), padding: '4px 8px'}}>↓</button>
                <button type="button" onClick={() => removeLink(i)} style={btn(false, true)}>−</button>
              </div>
            ))}
            <button type="button" onClick={addLink} style={{...btn(), alignSelf: 'flex-start'}}>＋ リンク追加</button>
          </div>
        </div>
        <div>
          <label style={labelStyle}>表示順</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)} style={inputStyle} />
        </div>
        <div>
          <label style={{...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            有効
          </label>
        </div>
        <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
          <button type="button" onClick={onCancel} style={btn()} disabled={saving}>キャンセル</button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                id: initial.id,
                handle,
                sectionTitle,
                links: links.filter((l) => l.label.trim() !== '' && l.url.trim() !== ''),
                sortOrder,
                isActive,
              })
            }
            style={btn(true)}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════
// IpBannersSection (astromeda_ip_banner) — Sprint 4 Part C
// ══════════════════════════════════════════════════════════

function IpBannersSection({pushToast, confirm}: SectionProps) {
  const [items, setItems] = useState<IpBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<IpBanner | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  // patch 0006: Shopify コレクション画像マップ (handle -> CDN URL)
  const [collabImages, setCollabImages] = useState<Record<string, string>>({});
  // patch 0037: 一括登録（COLLABS 26 件 → astromeda_ip_banner Metaobject）中フラグ
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<{collabs: IpBanner[]}>('/api/admin/homepage');
    setItems(res?.collabs || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // patch 0006: items 変化時 + マウント時に Shopify collection 画像を一括取得
  useEffect(() => {
    const handles: string[] = [];
    for (const it of items) if (it.shopHandle) handles.push(it.shopHandle);
    for (const c of COLLABS) if (c.shop) handles.push(c.shop);
    let cancelled = false;
    fetchCollectionImagesMap(handles).then((map) => {
      if (!cancelled) setCollabImages(map);
    });
    return () => {
      cancelled = true;
    };
  }, [items.map((i) => i.shopHandle).join('|')]);

  const synthCols = useMemo(() => synthesizeCollections(collabImages), [collabImages]);

  const handleSave = async (form: Partial<IpBanner> & {handle?: string}, isCreate: boolean) => {
    setSaving(true);
    const body: Record<string, unknown> = isCreate
      ? {
          action: 'create_collab',
          handle: form.handle || '',
          name: form.name || '',
          shopHandle: form.shopHandle || '',
          featured: form.featured ?? true,
          sortOrder: form.sortOrder ?? 0,
          image: form.image || undefined,
          tagline: form.tagline || undefined,
          label: form.label || undefined,
        }
      : {
          action: 'update_collab',
          metaobjectId: form.id,
          name: form.name,
          shopHandle: form.shopHandle,
          featured: form.featured,
          sortOrder: form.sortOrder,
          image: form.image || undefined,
          tagline: form.tagline || undefined,
          label: form.label || undefined,
        };
    const res = await apiPost('/api/admin/homepage', body);
    setSaving(false);
    if (res.success) {
      pushToast('保存しました', 'success');
      setEditing(null);
      setCreating(false);
      await load();
    } else {
      pushToast(`失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm('このエントリを削除しますか？'))) return;
    const res = await apiPost('/api/admin/homepage', {action: 'delete_collab', metaobjectId: id});
    if (res.success) {
      pushToast('削除しました', 'success');
      await load();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const modalOpen = creating || editing !== null;
  const initial: Partial<IpBanner> = creating ? {sortOrder: 0, featured: true} : editing || {};

  // patch 0037: astromeda_ip_banner Metaobject が空の時、
  // フロントが使っている COLLABS 26 件フォールバックをそのまま admin に表示し、
  // 「一括登録」で Metaobject 化できるようにする。
  const handleSeedCollabs = async () => {
    if (!(await confirm('COLLABS 26件を Metaobject に一括登録しますか？（既存エントリには影響しません）'))) return;
    setSeeding(true);
    try {
      const res = await fetch('/api/admin/cms-seed', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({types: ['astromeda_ip_banner']}),
      });
      const json = (await res.json().catch(() => ({}))) as {success?: boolean; error?: string};
      if (res.ok && json.success) {
        pushToast('COLLABS を Metaobject に登録しました', 'success');
        await load();
      } else {
        pushToast(`一括登録失敗: ${json.error || res.status}`, 'error');
      }
    } catch (e) {
      pushToast(`一括登録失敗: ${(e as Error).message}`, 'error');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>IPコラボバナー ({items.length})</div>
        <button type="button" onClick={() => setCreating(true)} style={btn(true)}>＋ 新規追加</button>
      </div>
      {loading ? (
        <div style={{textAlign: 'center', padding: 40}}><Spinner /></div>
      ) : items.length === 0 ? (
        <div>
          <div style={{
            background: al(T.c, 0.08),
            border: `1px solid ${al(T.c, 0.4)}`,
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
          }}>
            <div style={{flex: 1, minWidth: 240}}>
              <div style={{fontSize: 12, fontWeight: 800, color: T.tx, marginBottom: 4}}>
                Metaobject は空です — フロントは COLLABS 26件フォールバックで表示中
              </div>
              <div style={{fontSize: 11, color: T.t4, lineHeight: 1.5}}>
                下に表示されているのが現在フロントで使われているフォールバック画像です。
                「一括登録」ボタンを押すと、26件を編集可能な Metaobject として登録できます。
              </div>
            </div>
            <button
              type="button"
              onClick={handleSeedCollabs}
              disabled={seeding}
              style={{...btn(true), opacity: seeding ? 0.6 : 1}}
            >
              {seeding ? '登録中…' : '📦 COLLABS 26件を一括登録'}
            </button>
          </div>
          <table style={{width: '100%', borderCollapse: 'collapse'}}>
            <thead>
              <tr>
                <th style={thStyle}>現在の画像（フォールバック）</th>
                <th style={thStyle}>IP名</th>
                <th style={thStyle}>コレクション</th>
                <th style={thStyle}>ラベル</th>
                <th style={thStyle}>順</th>
                <th style={thStyle}>状態</th>
              </tr>
            </thead>
            <tbody>
              {COLLABS.map((c, idx) => {
                const img = c.shop ? collabImages[c.shop] : null;
                return (
                  <tr key={`fallback-${c.shop || idx}`}>
                    <td style={{...tdStyle, width: 84}}>
                      {img ? (
                        <img
                          src={img}
                          alt={c.name}
                          style={{width: 72, height: 48, objectFit: 'cover', borderRadius: 4, border: `1px solid ${al(T.tx, 0.15)}`}}
                        />
                      ) : (
                        <div
                          style={{
                            width: 72, height: 48, borderRadius: 4,
                            background: `linear-gradient(135deg, ${T.c}, ${T.s})`,
                            color: T.bg, fontSize: 9, display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            textAlign: 'center', lineHeight: 1.1, padding: 4,
                          }}
                        >
                          画像{'\n'}未取得
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>{c.name}</td>
                    <td style={{...tdStyle, color: T.t5, fontFamily: 'monospace', fontSize: 11}}>{c.shop || '—'}</td>
                    <td style={tdStyle}>{c.tag || '—'}</td>
                    <td style={tdStyle}>{idx + 1}</td>
                    <td style={{...tdStyle, color: T.t5, fontSize: 11}}>フォールバック</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <thead>
            <tr>
              {/* patch 0026: CEO 要望「同線にもどこかわかるように現在の画像を入れてください」
                  — 各行が storefront のどの IP コラボカードを制御するか一目で分かるように
                  現在の表示画像のサムネを先頭列に置く。Metaobject に image 未設定なら
                  shopHandle から解決した Shopify コレクション画像で代用する。*/}
              <th style={thStyle}>現在の画像</th>
              <th style={thStyle}>IP名</th>
              <th style={thStyle}>コレクション</th>
              <th style={thStyle}>ラベル</th>
              <th style={thStyle}>順</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const storedImg = (c.image || '').trim();
              const usableStored = storedImg && /^https?:\/\//i.test(storedImg) ? storedImg : null;
              const fallbackImg = c.shopHandle ? collabImages[c.shopHandle] : null;
              const thumb = usableStored || fallbackImg || null;
              return (
                <tr key={c.id}>
                  <td style={{...tdStyle, width: 84}}>
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={c.name || c.shopHandle || 'preview'}
                        style={{width: 72, height: 48, objectFit: 'cover', borderRadius: 4, border: `1px solid ${al(T.tx, 0.15)}`}}
                      />
                    ) : (
                      <div
                        style={{
                          width: 72, height: 48, borderRadius: 4,
                          background: `linear-gradient(135deg, ${T.c}, ${T.s})`,
                          color: T.bg, fontSize: 9, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          textAlign: 'center', lineHeight: 1.1, padding: 4,
                        }}
                      >
                        画像{'\n'}未設定
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>{c.name}</td>
                  <td style={{...tdStyle, color: T.t5, fontFamily: 'monospace', fontSize: 11}}>{c.shopHandle}</td>
                  <td style={tdStyle}>{c.label || '—'}</td>
                  <td style={tdStyle}>{c.sortOrder}</td>
                  <td style={tdStyle}>{c.featured ? '✓' : '—'}</td>
                  <td style={{...tdStyle, textAlign: 'right'}}>
                    <button type="button" onClick={() => setEditing(c)} style={{...btn(), marginRight: 6}}>編集</button>
                    <button type="button" onClick={() => handleDelete(c.id)} style={btn(false, true)}>削除</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {modalOpen && (
        <IpBannerForm
          initial={initial}
          isCreate={creating}
          saving={saving}
          collections={synthCols}
          collabImages={collabImages}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSubmit={(form) => handleSave(form, creating)}
        />
      )}
    </div>
  );
}

function IpBannerForm({
  initial,
  isCreate,
  saving,
  collections,
  collabImages,
  onCancel,
  onSubmit,
}: {
  initial: Partial<IpBanner>;
  isCreate: boolean;
  saving: boolean;
  collections: SynthCollection[];
  collabImages: Record<string, string>;
  onCancel: () => void;
  onSubmit: (form: Partial<IpBanner> & {handle?: string}) => void;
}) {
  const [handle, setHandle] = useState(initial.handle || '');
  const [name, setName] = useState(initial.name || '');
  const [shopHandle, setShopHandle] = useState(initial.shopHandle || '');
  const [image, setImage] = useState(initial.image || '');
  const [tagline, setTagline] = useState(initial.tagline || '');
  const [label, setLabel] = useState(initial.label || '');
  const [sortOrder, setSortOrder] = useState(initial.sortOrder ?? 0);
  const [featured, setFeatured] = useState(initial.featured ?? true);
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  // patch 0006: Live preview — Shopify collection 画像フォールバックを image URL に組込
  // 画像フィールドが空なら shopHandle から公開コレクション画像を引き当てる
  const resolvedImage = image || (shopHandle ? collabImages[shopHandle] || null : null);
  const previewMeta = [
    {
      id: initial.id || 'preview',
      handle: handle || 'preview',
      name: name || '(未入力)',
      shopHandle: shopHandle || 'preview',
      image: resolvedImage,
      tagline: tagline || null,
      label: label || null,
      sortOrder,
      featured: true,
    },
  ];

  const previewPane = (
    <PreviewFrame device={device} onDeviceChange={setDevice}>
      <CollabGrid collections={collections} metaCollabs={previewMeta} />
    </PreviewFrame>
  );

  return (
    <Modal
      title={isCreate ? 'IPコラボ 新規追加' : 'IPコラボ 編集'}
      onClose={onCancel}
      preview={previewPane}
    >
      <div style={{display: 'grid', gap: 12}}>
        {isCreate && (
          <div>
            <label style={labelStyle}>Handle</label>
            <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} style={inputStyle} placeholder="onepiece-collab" />
          </div>
        )}
        <div>
          <label style={labelStyle}>IP名</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="ONE PIECE" />
        </div>
        <div>
          <label style={labelStyle}>Shopifyコレクションハンドル</label>
          <input type="text" value={shopHandle} onChange={(e) => setShopHandle(e.target.value)} style={inputStyle} placeholder="onepiece" />
        </div>
        <div>
          <label style={labelStyle}>画像 (URL または Shopify file GID)</label>
          <input type="text" value={image} onChange={(e) => setImage(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>タグライン（任意）</label>
          <input type="text" value={tagline} onChange={(e) => setTagline(e.target.value)} style={inputStyle} placeholder="15カテゴリ" />
        </div>
        <div>
          <label style={labelStyle}>ラベル（NEW / HOT / COLLAB など）</label>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle} placeholder="HOT" />
        </div>
        <div>
          <label style={labelStyle}>表示順</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)} style={inputStyle} />
        </div>
        <div>
          <label style={{...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
            有効（フロント表示）
          </label>
        </div>
        <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
          <button type="button" onClick={onCancel} style={btn()} disabled={saving}>キャンセル</button>
          <button
            type="button"
            onClick={() => onSubmit({id: initial.id, handle, name, shopHandle, image, tagline, label, sortOrder, featured})}
            style={btn(true)}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════
// HeroBannersSection (astromeda_hero_banner) — Sprint 4 Part C
// ══════════════════════════════════════════════════════════

function HeroBannersSection({pushToast, confirm}: SectionProps) {
  const [items, setItems] = useState<HeroBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<HeroBanner | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  // patch 0006: Shopify コレクション画像マップ (handle -> CDN URL)
  const [heroImages, setHeroImages] = useState<Record<string, string>>({});
  // patch 0027: FEATURED 自動投入ボタンの処理中フラグ
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<{banners: HeroBanner[]}>('/api/admin/homepage');
    setItems(res?.banners || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // patch 0027: CEO 指摘「なんで現在のバナーがないのか」 → FEATURED 初期値を Metaobject に自動投入。
  // /api/admin/cms-seed は冪等なので既存 handle はスキップされる（再実行しても安全）。
  const handleSeedFromFeatured = useCallback(async () => {
    const ok = await confirm(
      'FEATURED の初期ヒーローバナー 3件を自動投入します。既存のエントリはそのまま残ります。実行しますか？',
    );
    if (!ok) return;
    setSeeding(true);
    const res = await apiPost('/api/admin/cms-seed', {
      types: ['astromeda_hero_banner'],
    });
    setSeeding(false);
    if (res.success) {
      const totals = (res as {totals?: {created?: number; skipped?: number}}).totals || {};
      const created = totals.created ?? 0;
      const skipped = totals.skipped ?? 0;
      pushToast(`投入完了: 新規 ${created} 件 / スキップ ${skipped} 件`, 'success');
      await load();
    } else {
      pushToast(`投入失敗: ${res.error || 'unknown'}`, 'error');
    }
  }, [confirm, pushToast, load]);

  // patch 0006: items 変化時 + マウント時に Shopify collection 画像を一括取得
  // HeroSlider は MetaBanner.handle をコレクション handle として imageMap を引く
  useEffect(() => {
    const handles: string[] = [];
    for (const it of items) if (it.handle) handles.push(it.handle);
    for (const c of COLLABS) if (c.shop) handles.push(c.shop);
    let cancelled = false;
    fetchCollectionImagesMap(handles).then((map) => {
      if (!cancelled) setHeroImages(map);
    });
    return () => {
      cancelled = true;
    };
  }, [items.map((i) => i.handle).join('|')]);

  const synthCols = useMemo(() => synthesizeCollections(heroImages), [heroImages]);

  const handleSave = async (form: Partial<HeroBanner> & {handle?: string}, isCreate: boolean) => {
    setSaving(true);
    const body: Record<string, unknown> = isCreate
      ? {
          action: 'create_banner',
          handle: form.handle || '',
          title: form.title || '',
          subtitle: form.subtitle || undefined,
          image: form.image || undefined,
          linkUrl: form.linkUrl || undefined,
          ctaLabel: form.ctaLabel || undefined,
          sortOrder: form.sortOrder ?? 0,
          active: form.active ?? true,
          startAt: form.startAt || undefined,
          endAt: form.endAt || undefined,
        }
      : {
          action: 'update_banner',
          metaobjectId: form.id,
          title: form.title,
          subtitle: form.subtitle || undefined,
          image: form.image || undefined,
          linkUrl: form.linkUrl || undefined,
          ctaLabel: form.ctaLabel || undefined,
          sortOrder: form.sortOrder,
          active: form.active,
          startAt: form.startAt || undefined,
          endAt: form.endAt || undefined,
        };
    const res = await apiPost('/api/admin/homepage', body);
    setSaving(false);
    if (res.success) {
      pushToast('保存しました', 'success');
      setEditing(null);
      setCreating(false);
      await load();
    } else {
      pushToast(`失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm('このエントリを削除しますか？'))) return;
    const res = await apiPost('/api/admin/homepage', {action: 'delete_banner', metaobjectId: id});
    if (res.success) {
      pushToast('削除しました', 'success');
      await load();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const modalOpen = creating || editing !== null;
  const initial: Partial<HeroBanner> = creating ? {sortOrder: 0, active: true} : editing || {};

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap'}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>ヒーローバナー ({items.length})</div>
        <div style={{display: 'flex', gap: 6}}>
          {/* patch 0027: items が空 or 少ない時に初期データ投入ショートカット */}
          {items.length < 3 && (
            <button
              type="button"
              onClick={() => void handleSeedFromFeatured()}
              style={{
                ...btn(false),
                background: al(T.g, 0.12),
                border: `1px solid ${al(T.g, 0.4)}`,
                color: T.g,
              }}
              disabled={seeding}
              title="FEATURED 初期バナー 3件を一括投入（既存はスキップ）"
            >
              {seeding ? '投入中...' : '⬇ FEATURED から自動投入'}
            </button>
          )}
          <button type="button" onClick={() => setCreating(true)} style={btn(true)}>＋ 新規追加</button>
        </div>
      </div>
      {loading ? (
        <div style={{textAlign: 'center', padding: 40}}><Spinner /></div>
      ) : items.length === 0 ? (
        <div style={{color: T.t4, fontSize: 12, textAlign: 'center', padding: 30}}>
          エントリがありません。<br />
          <span style={{color: T.t5, fontSize: 11}}>
            上の <b style={{color: T.g}}>「⬇ FEATURED から自動投入」</b> ボタンでデフォルトの 3 バナー（新着/IPコラボ/ティア）を一括作成できます。
          </span>
        </div>
      ) : (
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <thead>
            <tr>
              {/* patch 0026: CEO 要望「現在の画像を入れてください」— ヒーロー配信先のコレクション画像を先頭列に。*/}
              <th style={thStyle}>現在の画像</th>
              <th style={thStyle}>タイトル</th>
              <th style={thStyle}>CTA</th>
              <th style={thStyle}>期間</th>
              <th style={thStyle}>順</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const storedImg = (c.image || '').trim();
              const usableStored = storedImg && /^https?:\/\//i.test(storedImg) ? storedImg : null;
              const fallbackImg = c.handle ? heroImages[c.handle] : null;
              const thumb = usableStored || fallbackImg || null;
              return (
                <tr key={c.id}>
                  <td style={{...tdStyle, width: 84}}>
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={c.title || c.handle || 'preview'}
                        style={{width: 72, height: 48, objectFit: 'cover', borderRadius: 4, border: `1px solid ${al(T.tx, 0.15)}`}}
                      />
                    ) : (
                      <div
                        style={{
                          width: 72, height: 48, borderRadius: 4,
                          background: `linear-gradient(135deg, ${T.c}, ${T.s})`,
                          color: T.bg, fontSize: 9, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          textAlign: 'center', lineHeight: 1.1, padding: 4,
                        }}
                      >
                        画像{'\n'}未設定
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>{c.title}</td>
                  <td style={{...tdStyle, color: T.t5}}>{c.ctaLabel || '—'}</td>
                  <td style={{...tdStyle, color: T.t5, fontSize: 10, fontFamily: 'monospace'}}>
                    {c.startAt || '∞'} 〜 {c.endAt || '∞'}
                  </td>
                  <td style={tdStyle}>{c.sortOrder}</td>
                  <td style={tdStyle}>{c.active ? '✓' : '—'}</td>
                  <td style={{...tdStyle, textAlign: 'right'}}>
                    <button type="button" onClick={() => setEditing(c)} style={{...btn(), marginRight: 6}}>編集</button>
                    <button type="button" onClick={() => handleDelete(c.id)} style={btn(false, true)}>削除</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {modalOpen && (
        <HeroBannerForm
          initial={initial}
          isCreate={creating}
          saving={saving}
          collections={synthCols}
          heroImages={heroImages}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSubmit={(form) => handleSave(form, creating)}
        />
      )}
    </div>
  );
}

function HeroBannerForm({
  initial,
  isCreate,
  saving,
  collections,
  heroImages,
  onCancel,
  onSubmit,
}: {
  initial: Partial<HeroBanner>;
  isCreate: boolean;
  saving: boolean;
  collections: SynthCollection[];
  heroImages: Record<string, string>;
  onCancel: () => void;
  onSubmit: (form: Partial<HeroBanner> & {handle?: string}) => void;
}) {
  const [handle, setHandle] = useState(initial.handle || '');
  const [title, setTitle] = useState(initial.title || '');
  const [subtitle, setSubtitle] = useState(initial.subtitle || '');
  const [image, setImage] = useState(initial.image || '');
  const [linkUrl, setLinkUrl] = useState(initial.linkUrl || '');
  const [ctaLabel, setCtaLabel] = useState(initial.ctaLabel || '');
  const [sortOrder, setSortOrder] = useState(initial.sortOrder ?? 0);
  const [active, setActive] = useState(initial.active ?? true);
  const [startAt, setStartAt] = useState(initial.startAt || '');
  const [endAt, setEndAt] = useState(initial.endAt || '');
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  // patch 0006: Live preview — Shopify collection 画像フォールバック
  // 画像フィールドが空なら handle から公開コレクション画像を引き当てる
  const resolvedImage = image || (handle ? heroImages[handle] || null : null);
  const previewMeta = [
    {
      id: initial.id || 'preview',
      handle: handle || 'preview',
      title: title || '(タイトル未入力)',
      subtitle: subtitle || null,
      image: resolvedImage,
      linkUrl: linkUrl || null,
      ctaLabel: ctaLabel || null,
      sortOrder,
      isActive: true,
      startAt: null, // preview では期間フィルタ無効化
      endAt: null,
    },
  ];

  const previewPane = (
    <PreviewFrame device={device} onDeviceChange={setDevice}>
      <HeroSlider collections={collections} metaBanners={previewMeta} />
    </PreviewFrame>
  );

  return (
    <Modal
      title={isCreate ? 'ヒーローバナー 新規追加' : 'ヒーローバナー 編集'}
      onClose={onCancel}
      preview={previewPane}
    >
      <div style={{display: 'grid', gap: 12}}>
        {isCreate && (
          <div>
            <label style={labelStyle}>Handle</label>
            <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} style={inputStyle} placeholder="spring-sale-banner" />
          </div>
        )}
        <div>
          <label style={labelStyle}>タイトル</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>サブタイトル（任意）</label>
          <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>画像 (URL または Shopify file GID)</label>
          <input type="text" value={image} onChange={(e) => setImage(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>リンク URL</label>
          <input type="text" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} style={inputStyle} placeholder="/collections/sale" />
        </div>
        <div>
          <label style={labelStyle}>CTA ラベル</label>
          <input type="text" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} style={inputStyle} placeholder="今すぐ見る →" />
        </div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
          <div>
            <label style={labelStyle}>開始日時（ISO）</label>
            <input type="text" value={startAt} onChange={(e) => setStartAt(e.target.value)} style={inputStyle} placeholder="2026-01-01T00:00:00Z" />
          </div>
          <div>
            <label style={labelStyle}>終了日時（ISO）</label>
            <input type="text" value={endAt} onChange={(e) => setEndAt(e.target.value)} style={inputStyle} placeholder="2026-12-31T23:59:59Z" />
          </div>
        </div>
        <div>
          <label style={labelStyle}>表示順</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)} style={inputStyle} />
        </div>
        <div>
          <label style={{...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            有効（フロント表示）
          </label>
        </div>
        <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
          <button type="button" onClick={onCancel} style={btn()} disabled={saving}>キャンセル</button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                id: initial.id,
                handle,
                title,
                subtitle,
                image,
                linkUrl,
                ctaLabel,
                sortOrder,
                active,
                startAt,
                endAt,
              })
            }
            style={btn(true)}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════
// CustomizationMatrixSection — Sprint 5 M2
// 商品タグ × カスタマイズ option のマトリックス編集
// ══════════════════════════════════════════════════════════

interface MatrixOption {
  id: string;
  handle: string;
  name: string;
  category: string;
  choices: Array<{value: string; label: string}>;
  isRequired: boolean;
  sortOrder: number;
  appliesToTags: string; // CSV
}

function CustomizationMatrixSection({pushToast, confirm: _confirm}: SectionProps) {
  const [options, setOptions] = useState<MatrixOption[]>([]);
  const [productTags, setProductTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // 初回ロード: 全商品 (ページネーションで最大 200 件まで) + カスタマイズ option
  const load = useCallback(async () => {
    setLoading(true);
    const optRes = await apiGet<{options: MatrixOption[]}>('/api/admin/customization');
    const allOptions = (optRes?.options || []).sort((a, b) => a.sortOrder - b.sortOrder);

    // 商品タグ収集: 50 件 × 最大 4 ページ = 200 件まで
    type ProductsPageResponse = {
      products: Array<{tags: string[]; cursor: string}>;
      pageInfo: {hasNextPage: boolean; endCursor: string | null};
    };
    const tagSet = new Set<string>();
    let cursor: string | undefined = undefined;
    for (let page = 0; page < 4; page++) {
      const url: string = cursor
        ? `/api/admin/products?limit=50&cursor=${encodeURIComponent(cursor)}`
        : '/api/admin/products?limit=50';
      const res: ProductsPageResponse | null = await apiGet<ProductsPageResponse>(url);
      if (!res) break;
      for (const p of res.products || []) {
        for (const t of p.tags || []) {
          if (t.trim()) tagSet.add(t.trim().toLowerCase());
        }
      }
      if (!res.pageInfo?.hasNextPage) break;
      cursor = res.pageInfo.endCursor || undefined;
      if (!cursor) break;
    }
    const sortedTags = Array.from(tagSet).sort();

    setOptions(allOptions);
    setProductTags(sortedTags);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // セル状態判定: option.appliesToTags (CSV) に tag が含まれるか
  // appliesToTags が空 = 全商品適用なので全セル ON として扱う
  const isChecked = useCallback((opt: MatrixOption, tag: string): boolean => {
    const tags = opt.appliesToTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (tags.length === 0) return true;
    return tags.includes(tag);
  }, []);

  // tag set を更新 + debounce 保存
  const updateOptionTags = useCallback(
    (optId: string, newTagsLower: Set<string>) => {
      const newCsv = Array.from(newTagsLower).sort().join(',');
      setOptions((prev) =>
        prev.map((o) => (o.id === optId ? {...o, appliesToTags: newCsv} : o)),
      );
      if (debounceRef.current[optId]) {
        clearTimeout(debounceRef.current[optId]);
      }
      debounceRef.current[optId] = setTimeout(async () => {
        setSavingMap((prev) => ({...prev, [optId]: true}));
        const res = await apiPost('/api/admin/customization', {
          action: 'update',
          metaobjectId: optId,
          appliesToTags: newCsv,
        });
        setSavingMap((prev) => {
          const next = {...prev};
          delete next[optId];
          return next;
        });
        if (!res.success) {
          pushToast(`保存失敗: ${res.error || 'unknown'}`, 'error');
        }
      }, 300);
    },
    [pushToast],
  );

  const toggleCell = (opt: MatrixOption, tag: string) => {
    const currentTags = new Set(
      opt.appliesToTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
    );
    // 空 = 全適用状態からの初回操作: 全タグを明示セットしたうえで対象タグを抜く
    if (currentTags.size === 0) {
      productTags.forEach((t) => currentTags.add(t));
    }
    if (currentTags.has(tag)) currentTags.delete(tag);
    else currentTags.add(tag);
    updateOptionTags(opt.id, currentTags);
  };

  const setAllForOption = (opt: MatrixOption, enable: boolean) => {
    const next = new Set<string>();
    if (enable) productTags.forEach((t) => next.add(t));
    updateOptionTags(opt.id, next);
  };

  const toggleColumn = (tag: string) => {
    // 全 option で当該 tag の状態を集計 → 半数以上が ON なら全 OFF、それ以外は全 ON
    const onCount = options.filter((o) => isChecked(o, tag)).length;
    const enable = onCount < options.length / 2;
    options.forEach((opt) => {
      const currentTags = new Set(
        opt.appliesToTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
      );
      if (currentTags.size === 0) {
        productTags.forEach((t) => currentTags.add(t));
      }
      if (enable) currentTags.add(tag);
      else currentTags.delete(tag);
      updateOptionTags(opt.id, currentTags);
    });
  };

  // フィルタリング
  const searchLower = search.trim().toLowerCase();
  const filteredOptions = searchLower
    ? options.filter(
        (o) => o.name.toLowerCase().includes(searchLower) || o.category.toLowerCase().includes(searchLower),
      )
    : options;
  const filteredTags = searchLower
    ? productTags.filter((t) => t.includes(searchLower))
    : productTags;

  if (loading) {
    return (
      <div style={cardStyle}>
        <div style={{textAlign: 'center', padding: 40}}>
          <Spinner />
          <div style={{fontSize: 11, color: T.t4, marginTop: 10}}>商品タグ + option を取得中...</div>
        </div>
      </div>
    );
  }

  if (options.length === 0 || productTags.length === 0) {
    return (
      <div style={cardStyle}>
        <div style={{textAlign: 'center', padding: 30, color: T.t4, fontSize: 12}}>
          {options.length === 0 && <div>カスタマイズ option が未登録です。</div>}
          {productTags.length === 0 && <div>商品タグが検出できません（全商品で tags 未設定の可能性）。</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap'}}>
        <div>
          <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>カスタマイズマトリックス</div>
          <div style={{fontSize: 10, color: T.t4, marginTop: 2}}>
            商品タグ {productTags.length} 種 × option {options.length} 件 = {productTags.length * options.length} セル
          </div>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="タグ・option名で絞り込み"
          style={{...inputStyle, maxWidth: 260}}
        />
      </div>

      <div style={{fontSize: 10, color: T.t4, marginBottom: 10}}>
        ※ チェック ON = その option がその商品タグに適用される。空行(全チェック)= 全商品適用。変更は 300ms debounce で自動保存。
      </div>

      <div style={{overflow: 'auto', maxHeight: '65vh', border: `1px solid ${al(T.tx, 0.08)}`, borderRadius: 6}}>
        <table style={{borderCollapse: 'separate', borderSpacing: 0, fontSize: 11}}>
          <thead>
            <tr>
              <th
                style={{
                  position: 'sticky',
                  top: 0,
                  left: 0,
                  zIndex: 3,
                  background: T.bgC,
                  padding: '8px 10px',
                  borderBottom: `1px solid ${al(T.tx, 0.1)}`,
                  borderRight: `1px solid ${al(T.tx, 0.1)}`,
                  textAlign: 'left',
                  color: T.t4,
                  fontSize: 10,
                  minWidth: 200,
                }}
              >
                option ＼ タグ
              </th>
              {filteredTags.map((tag) => (
                <th
                  key={tag}
                  onClick={() => toggleColumn(tag)}
                  title={`列一括トグル: ${tag}`}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    background: T.bgC,
                    padding: '8px 6px',
                    borderBottom: `1px solid ${al(T.tx, 0.1)}`,
                    color: T.t5,
                    fontSize: 9,
                    fontWeight: 700,
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    cursor: 'pointer',
                    minWidth: 28,
                    maxHeight: 100,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tag}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredOptions.map((opt) => {
              const isSaving = !!savingMap[opt.id];
              return (
                <tr key={opt.id}>
                  <td
                    style={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                      background: T.bg,
                      padding: '6px 10px',
                      borderBottom: `1px solid ${al(T.tx, 0.05)}`,
                      borderRight: `1px solid ${al(T.tx, 0.1)}`,
                      color: T.tx,
                      minWidth: 200,
                    }}
                  >
                    <div style={{display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                      <div style={{flex: 1, minWidth: 0}}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {opt.name}
                        </div>
                        <div style={{fontSize: 9, color: T.t4}}>{opt.category}</div>
                      </div>
                      <button type="button" onClick={() => setAllForOption(opt, true)} title="全タグ対象化" style={{...btn(), padding: '2px 6px', fontSize: 9}}>
                        全ON
                      </button>
                      <button type="button" onClick={() => setAllForOption(opt, false)} title="全タグ解除" style={{...btn(), padding: '2px 6px', fontSize: 9}}>
                        全OFF
                      </button>
                      {isSaving && <span style={{fontSize: 9, color: T.c}}>●</span>}
                    </div>
                  </td>
                  {filteredTags.map((tag) => {
                    const checked = isChecked(opt, tag);
                    return (
                      <td
                        key={tag}
                        style={{
                          textAlign: 'center',
                          padding: 0,
                          borderBottom: `1px solid ${al(T.tx, 0.05)}`,
                          background: checked ? al(T.c, 0.08) : 'transparent',
                          minWidth: 28,
                        }}
                      >
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCell(opt, tag)}
                            style={{accentColor: T.c, cursor: 'pointer'}}
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{fontSize: 10, color: T.t4, marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap'}}>
        <span>● 保存中</span>
        <span>行ヘッダ: 全ON/全OFF ショートカット</span>
        <span>列ヘッダクリック: 列一括トグル</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// patch 0038: GamingPCLanding 6セクションを Metaobject 化
// - GamingFeatureCardsSection  (astromeda_gaming_feature_card)  特集カード
// - GamingPartsCardsSection    (astromeda_gaming_parts_card)    CPU/GPU カード
// - GamingPriceRangesSection   (astromeda_gaming_price_range)   価格帯リンク
// すべて /api/admin/cms?type=... を介した汎用 CRUD UI。
// フォールバック: Metaobject が空ならコード内ハードコードが表示される（GamingPCLanding 側）。
// ══════════════════════════════════════════════════════════

type GamingCmsItem = {
  id: string;
  handle: string;
  label?: string;
  // patch 0039: gaming_hero_slide は alt_text、contact は phone_number 等の専用フィールドを持つ
  alt_text?: string;
  image_url?: string;
  link_url?: string;
  category?: string;
  display_order?: string;
  is_active?: string;
  phone_number?: string;
  phone_hours?: string;
  line_url?: string;
  line_label?: string;
  line_hours?: string;
};

// patch 0047 Phase C 第1段: cmsCreate/cmsUpdate/cmsDelete は ./pageEditor/shared から import 済み。
// cmsList は GamingCmsItem 型に特化した helper なのでここに残す。
async function cmsList(type: string): Promise<GamingCmsItem[]> {
  const res = await apiGet<{success: boolean; items?: GamingCmsItem[]}>(`/api/admin/cms?type=${type}`);
  return (res?.items || []) as GamingCmsItem[];
}

interface GamingSectionConfig {
  type: string;
  title: string;
  description: string;
  /** CPU / GPU 等のカテゴリプルダウンを出すか */
  withCategory?: boolean;
  /** 画像URLフィールドを出すか */
  withImage?: boolean;
  categoryOptions?: Array<{value: string; label: string}>;
  /** patch 0039: ラベルフィールドの Metaobject キー名を上書き（gaming_hero_slide では 'alt_text'） */
  labelFieldKey?: string;
  /** patch 0039: ラベル UI 表示名（例: 代替テキスト） */
  labelFieldName?: string;
}

function GamingCrudSection({
  config,
  pushToast,
  confirm,
}: {config: GamingSectionConfig} & SectionProps) {
  const [items, setItems] = useState<GamingCmsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<GamingCmsItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  // フォーム state
  const [fHandle, setFHandle] = useState('');
  const [fLabel, setFLabel] = useState('');
  const [fImageUrl, setFImageUrl] = useState('');
  const [fLinkUrl, setFLinkUrl] = useState('');
  const [fCategory, setFCategory] = useState(config.categoryOptions?.[0]?.value || '');
  const [fDisplayOrder, setFDisplayOrder] = useState(0);
  const [fIsActive, setFIsActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await cmsList(config.type);
    // display_order 昇順でソート
    list.sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));
    setItems(list);
    setLoading(false);
  }, [config.type]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setCreating(true);
    setEditing(null);
    setFHandle('');
    setFLabel('');
    setFImageUrl('');
    setFLinkUrl('');
    setFCategory(config.categoryOptions?.[0]?.value || '');
    setFDisplayOrder(items.length + 1);
    setFIsActive(true);
  };

  const openEdit = (item: GamingCmsItem) => {
    setEditing(item);
    setCreating(false);
    setFHandle(item.handle || '');
    // patch 0039: labelFieldKey が 'alt_text' ならそれを読み込む
    const labelKey = config.labelFieldKey || 'label';
    setFLabel(((item as Record<string, string | undefined>)[labelKey]) || '');
    setFImageUrl(item.image_url || '');
    setFLinkUrl(item.link_url || '');
    setFCategory(item.category || config.categoryOptions?.[0]?.value || '');
    setFDisplayOrder(Number(item.display_order || 0));
    setFIsActive(item.is_active !== 'false');
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!fLabel.trim()) {
      pushToast(`${config.labelFieldName || 'ラベル'}は必須です`, 'error');
      return;
    }
    setSaving(true);
    // patch 0039: labelFieldKey で metaobject field key を切替（gaming_hero_slide では 'alt_text'）
    const labelKey = config.labelFieldKey || 'label';
    const fields: Array<{key: string; value: string}> = [
      {key: labelKey, value: fLabel},
      {key: 'link_url', value: fLinkUrl},
      {key: 'display_order', value: String(fDisplayOrder)},
      {key: 'is_active', value: fIsActive ? 'true' : 'false'},
    ];
    if (config.withImage) {
      fields.push({key: 'image_url', value: fImageUrl});
    }
    if (config.withCategory) {
      fields.push({key: 'category', value: fCategory});
    }
    const res = creating
      ? await cmsCreate(config.type, fHandle || `${config.type.replace('astromeda_', '')}-${Date.now()}`, fields)
      : await cmsUpdate(config.type, editing!.id, fields);
    setSaving(false);
    if (res.success) {
      pushToast(creating ? '作成しました' : '更新しました', 'success');
      closeModal();
      await load();
    } else {
      pushToast(`保存失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const handleDelete = async (item: GamingCmsItem) => {
    const labelKey = config.labelFieldKey || 'label';
    const labelVal = (item as Record<string, string | undefined>)[labelKey] || item.handle;
    if (!(await confirm(`「${labelVal}」を削除しますか？`))) return;
    const res = await cmsDelete(config.type, item.id);
    if (res.success) {
      pushToast('削除しました', 'success');
      await load();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const modalOpen = creating || editing !== null;

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
        <div>
          <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>{config.title} ({items.length})</div>
          <div style={{fontSize: 10, color: T.t4, marginTop: 3}}>{config.description}</div>
        </div>
        <button type="button" onClick={openCreate} style={btn(true)}>＋ 新規追加</button>
      </div>
      {items.length === 0 && !loading && (
        <div style={{
          background: al(T.c, 0.08),
          border: `1px solid ${al(T.c, 0.3)}`,
          borderRadius: 8,
          padding: 14,
          fontSize: 12,
          color: T.tx,
          marginBottom: 14,
          lineHeight: 1.6,
        }}>
          <div style={{fontWeight: 800, marginBottom: 4}}>📦 Metaobject は空です — フロントはコード内ハードコード値を表示中</div>
          <div style={{color: T.t4, fontSize: 11}}>
            新規追加するとこのセクションが Metaobject から読み込まれるようになります。1件でも追加すると、フロントのハードコード値は完全に置き換わります。
          </div>
        </div>
      )}
      {loading ? (
        <div style={{textAlign: 'center', padding: 30}}><Spinner /></div>
      ) : items.length === 0 ? (
        <div style={{color: T.t4, fontSize: 12, textAlign: 'center', padding: 20}}>エントリがありません</div>
      ) : (
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <thead>
            <tr>
              {config.withImage && <th style={thStyle}>画像</th>}
              <th style={thStyle}>{config.labelFieldName || 'ラベル'}</th>
              {config.withCategory && <th style={thStyle}>カテゴリ</th>}
              <th style={thStyle}>リンク</th>
              <th style={thStyle}>順</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                {config.withImage && (
                  <td style={{...tdStyle, width: 72}}>
                    {item.image_url && /^https?:\/\//.test(item.image_url) ? (
                      <img src={item.image_url} alt={item.label || item.alt_text || ''} style={{width: 64, height: 40, objectFit: 'contain', borderRadius: 4, background: '#000'}} />
                    ) : (
                      <div style={{width: 64, height: 40, borderRadius: 4, background: al(T.tx, 0.05), fontSize: 9, color: T.t4, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>未設定</div>
                    )}
                  </td>
                )}
                <td style={tdStyle}>{(item as Record<string, string | undefined>)[config.labelFieldKey || 'label'] || <span style={{color: T.t4}}>(未入力)</span>}</td>
                {config.withCategory && <td style={tdStyle}>{item.category || '—'}</td>}
                <td style={{...tdStyle, color: T.t5, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{item.link_url || '—'}</td>
                <td style={tdStyle}>{item.display_order || 0}</td>
                <td style={tdStyle}>{item.is_active !== 'false' ? '✓' : '—'}</td>
                <td style={{...tdStyle, textAlign: 'right'}}>
                  <button type="button" onClick={() => openEdit(item)} style={{...btn(), marginRight: 6}}>編集</button>
                  <button type="button" onClick={() => handleDelete(item)} style={btn(false, true)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalOpen && (
        <Modal title={creating ? `${config.title} 新規追加` : `${config.title} 編集`} onClose={closeModal}>
          <div style={{display: 'grid', gap: 12}}>
            {creating && (
              <div>
                <label style={labelStyle}>Handle（省略時は自動生成）</label>
                <input type="text" value={fHandle} onChange={(e) => setFHandle(e.target.value)} style={inputStyle} placeholder={`${config.type.replace('astromeda_', '')}-xxx`} />
              </div>
            )}
            <div>
              <label style={labelStyle}>{config.labelFieldName || 'ラベル'} *</label>
              <input type="text" value={fLabel} onChange={(e) => setFLabel(e.target.value)} style={inputStyle} />
            </div>
            {config.withImage && (
              <div>
                <label style={labelStyle}>画像 URL（ロゴ・アイコン画像）</label>
                <input type="text" value={fImageUrl} onChange={(e) => setFImageUrl(e.target.value)} style={inputStyle} placeholder="https://..." />
                <div style={{fontSize: 10, color: T.t4, marginTop: 4}}>
                  ※ Shopify にアップロード済みの画像 URL を貼ってください。/images/... などの相対パスも可。
                </div>
              </div>
            )}
            {config.withCategory && config.categoryOptions && (
              <div>
                <label style={labelStyle}>カテゴリ</label>
                <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} style={inputStyle}>
                  {config.categoryOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <UrlPicker
                label="リンク先"
                optional
                value={fLinkUrl}
                onChange={(next) => setFLinkUrl(next)}
              />
            </div>
            <div>
              <label style={labelStyle}>表示順</label>
              <input type="number" value={fDisplayOrder} onChange={(e) => setFDisplayOrder(parseInt(e.target.value, 10) || 0)} style={inputStyle} />
            </div>
            <div>
              <label style={{...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
                <input type="checkbox" checked={fIsActive} onChange={(e) => setFIsActive(e.target.checked)} />
                有効
              </label>
            </div>
            <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
              <button type="button" onClick={closeModal} style={btn()} disabled={saving}>キャンセル</button>
              <button type="button" onClick={handleSave} style={btn(true)} disabled={saving}>
                {saving ? '保存中…' : creating ? '作成' : '保存'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function GamingFeatureCardsSection(props: SectionProps) {
  return (
    <GamingCrudSection
      {...props}
      config={{
        type: 'astromeda_gaming_feature_card',
        title: '🎮 ゲーミングPC 特集カード',
        description: 'ゲーミングPC ランディング「FEATURE / 特集」セクションのカード（売上ランキング/NEW/RTX5090/AMD 等）。',
        withImage: true,
      }}
    />
  );
}

function GamingPartsCardsSection(props: SectionProps) {
  return (
    <GamingCrudSection
      {...props}
      config={{
        type: 'astromeda_gaming_parts_card',
        title: '🎮 ゲーミングPC パーツカード (CPU / GPU)',
        description: '「パーツで選ぶ」セクションの CPU / GPU カード。category で cpu / gpu を指定してください。',
        withImage: true,
        withCategory: true,
        categoryOptions: [
          {value: 'cpu', label: 'CPU'},
          {value: 'gpu', label: 'GPU'},
        ],
      }}
    />
  );
}

function GamingPriceRangesSection(props: SectionProps) {
  return (
    <GamingCrudSection
      {...props}
      config={{
        type: 'astromeda_gaming_price_range',
        title: '🎮 ゲーミングPC 価格帯リンク',
        description: '「値段で選ぶ」セクションの価格帯リンク（例: 200,001〜250,000円 → /collections/gaming-pc?price=200001-250000）。',
      }}
    />
  );
}

// ══════════════════════════════════════════════════════════
// patch 0039: ゲーミングPC ヒーロースライド (astromeda_gaming_hero_slide)
// ラベルフィールドは alt_text（代替テキスト）
// ══════════════════════════════════════════════════════════
function GamingHeroSlidesSection(props: SectionProps) {
  return (
    <GamingCrudSection
      {...props}
      config={{
        type: 'astromeda_gaming_hero_slide',
        title: '🎮 ゲーミングPC ヒーロースライド',
        description: 'ゲーミングPC LP 上部のスライダー画像。トップページとは別管理。',
        withImage: true,
        labelFieldKey: 'alt_text',
        labelFieldName: '代替テキスト (alt)',
      }}
    />
  );
}

// ══════════════════════════════════════════════════════════
// patch 0039: ゲーミングPC お問い合わせ (astromeda_gaming_contact)
// 単一エントリ編集（handle=default を自動使用）
// ══════════════════════════════════════════════════════════
function GamingContactSection({pushToast, confirm}: SectionProps) {
  const [item, setItem] = useState<GamingCmsItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fPhoneNumber, setFPhoneNumber] = useState('');
  const [fPhoneHours, setFPhoneHours] = useState('');
  const [fLineUrl, setFLineUrl] = useState('');
  const [fLineLabel, setFLineLabel] = useState('');
  const [fLineHours, setFLineHours] = useState('');
  const [fIsActive, setFIsActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await cmsList('astromeda_gaming_contact');
    const first = list[0] || null;
    setItem(first);
    setFPhoneNumber(first?.phone_number || '');
    setFPhoneHours(first?.phone_hours || '');
    setFLineUrl(first?.line_url || '');
    setFLineLabel(first?.line_label || '');
    setFLineHours(first?.line_hours || '');
    setFIsActive(first ? first.is_active !== 'false' : true);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    const fields: Array<{key: string; value: string}> = [
      {key: 'phone_number', value: fPhoneNumber},
      {key: 'phone_hours', value: fPhoneHours},
      {key: 'line_url', value: fLineUrl},
      {key: 'line_label', value: fLineLabel},
      {key: 'line_hours', value: fLineHours},
      {key: 'is_active', value: fIsActive ? 'true' : 'false'},
    ];
    const res = item
      ? await cmsUpdate('astromeda_gaming_contact', item.id, fields)
      : await cmsCreate('astromeda_gaming_contact', 'default', fields);
    setSaving(false);
    if (res.success) {
      pushToast(item ? '更新しました' : '作成しました', 'success');
      await load();
    } else {
      pushToast(`保存失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    if (!(await confirm('お問い合わせ情報を削除しますか？削除するとフロントはハードコードのフォールバックに戻ります'))) return;
    const res = await cmsDelete('astromeda_gaming_contact', item.id);
    if (res.success) {
      pushToast('削除しました', 'success');
      await load();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  if (loading) return <div style={{textAlign: 'center', padding: 30}}><Spinner /></div>;

  return (
    <div style={cardStyle}>
      <div style={{marginBottom: 14}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>📞 ゲーミングPC お問い合わせ {item ? '(設定中)' : '(未設定 — フォールバック表示中)'}</div>
        <div style={{fontSize: 10, color: T.t4, marginTop: 3}}>ゲーミングPC LP「CONTACT」セクションの電話・LINE 連絡先。1件のみ設定。</div>
      </div>
      {!item && (
        <div style={{
          background: al(T.c, 0.08),
          border: `1px solid ${al(T.c, 0.3)}`,
          borderRadius: 8,
          padding: 14,
          fontSize: 12,
          color: T.tx,
          marginBottom: 14,
          lineHeight: 1.6,
        }}>
          <div style={{fontWeight: 800, marginBottom: 4}}>📦 Metaobject は空 — フロントはハードコード値（03-6903-5371 / lin.ee/v43hEUKX）を表示中</div>
          <div style={{color: T.t4, fontSize: 11}}>下記を入力して保存すると、フロントが Metaobject から読み込まれるようになります。</div>
        </div>
      )}
      <div style={{display: 'grid', gap: 14}}>
        <div>
          <label style={labelStyle}>電話番号（表示用テキスト）</label>
          <input type="text" value={fPhoneNumber} onChange={(e) => setFPhoneNumber(e.target.value)} style={inputStyle} placeholder="03-6903-5371" />
          <div style={{fontSize: 10, color: T.t4, marginTop: 4}}>※ tel: リンクは自動生成されます（数字とハイフン以外は除去）</div>
        </div>
        <div>
          <label style={labelStyle}>電話 営業時間</label>
          <input type="text" value={fPhoneHours} onChange={(e) => setFPhoneHours(e.target.value)} style={inputStyle} placeholder="営業時間：午前9時〜午後6時" />
        </div>
        <div>
          <label style={labelStyle}>LINE URL</label>
          <input type="text" value={fLineUrl} onChange={(e) => setFLineUrl(e.target.value)} style={inputStyle} placeholder="https://lin.ee/v43hEUKX" />
        </div>
        <div>
          <label style={labelStyle}>LINE ボタンラベル</label>
          <input type="text" value={fLineLabel} onChange={(e) => setFLineLabel(e.target.value)} style={inputStyle} placeholder="公式LINEを友達追加" />
        </div>
        <div>
          <label style={labelStyle}>LINE 営業時間</label>
          <input type="text" value={fLineHours} onChange={(e) => setFLineHours(e.target.value)} style={inputStyle} placeholder="営業時間：午前9時〜午後6時" />
        </div>
        <div>
          <label style={{...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
            <input type="checkbox" checked={fIsActive} onChange={(e) => setFIsActive(e.target.checked)} />
            有効
          </label>
        </div>
        <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
          {item && <button type="button" onClick={handleDelete} style={btn(false, true)}>削除</button>}
          <button type="button" onClick={handleSave} style={btn(true)} disabled={saving}>
            {saving ? '保存中…' : item ? '更新' : '作成'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// patch 0039: ユーザーレビュー (astromeda_ugc_review)
// patch 0047 Phase C 第1段: ./pageEditor/UgcReviewsSection.tsx へ切り出し済み。
// インライン定義は丸ごと削除した。実体は import 文 (ファイル冒頭) 経由で提供される。
// 戻し方: Git 履歴の `0837815` 時点 L4179-4801 を参照。
// ══════════════════════════════════════════════════════════
