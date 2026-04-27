/**
 * VisualEditSection — patch 0058 Phase C 第4段で独立ファイル化
 *
 * CEO 要望「現在のサイトUIを表示し、クリックしたところの修正画面に行けるようにして」
 * → live storefront を iframe で表示し、各セクションに色分け pill + 番号バッジを注入し、
 *    サイドバーの shortcut クリックで該当編集タブへジャンプする。
 *
 * 切り出し元: AdminPageEditor.tsx (2026-04-19, patch 0057 時点 L191-818)
 * 切り出し理由: ファイル 851 行 → 残存 280 行の pure orchestrator に整理。
 *
 * 関連 patch:
 *   - 0027: VisualEditSection 初版
 *   - 0028: CSP frame-ancestors を 'self' に緩めて iframe embed 復活
 *   - 0029: セクション色分けサイドバー
 *   - 0030: injectOverlays hydration race 対策（多段リトライ＋MutationObserver）
 *   - 0031: 正しい main#main-content を選択
 *   - 0032: smallest-first container sort
 *   - 0033: gaming-pc ページ切替セグメント
 *   - 0034: gpc-hero-wrap 認識
 *   - 0035: container walker を gpc-* 対応に拡張
 *   - 0039: Metaobject 編集タブ (gaming_hero / gaming_contact / ugc_reviews) を追加
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {T, al} from '~/lib/astromeda-data';
import {type PreviewDevice} from '~/components/admin/preview/PreviewFrame';
import {type SubTab, cardStyle, btn} from './shared';

// patch 0033: ページ別のビジュアル編集対応。CEO 要望:
// 「ゲーミングPCタブの中が一切修正することができない。トップページと同じように
//  視覚的に修正できるようにして」→ iframe URL とセクション定義をページ毎に切替える。
export type PageKey = 'home' | 'gaming-pc';

// ゲーミングPC LP には SubTab に無いセクションもあるので、section の key は
// SubTab を含むより広い文字列 literal union にする。highlight の data-astro-section
// キーに使うだけなので型はラフに string で OK。
export type SectionKey =
  | SubTab
  | 'feature'
  | 'ranking'
  | 'search_parts'
  | 'price_range'
  | 'contact'
  | 'news';

export interface SectionDef {
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
export const HOME_SECTIONS: SectionDef[] = [
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
export const GAMING_PC_SECTIONS: SectionDef[] = [
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

export const PAGE_DEFS: Record<PageKey, {label: string; icon: string; path: string; sections: SectionDef[]}> = {
  home: {label: 'トップページ', icon: '🏠', path: '/', sections: HOME_SECTIONS},
  'gaming-pc': {label: 'ゲーミングPC', icon: '🎮', path: '/collections/gaming-pc', sections: GAMING_PC_SECTIONS},
};

export interface VisualEditSectionProps {
  onNavigate: (tab: SubTab) => void;
  pushToast: (msg: string, type: 'success' | 'error') => void;
}

export function VisualEditSection({onNavigate, pushToast}: VisualEditSectionProps) {
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

      {/* patch 0163: 「新しいセクションを追加する方法がない」CEO 指摘への対処 —
          現在ページの全セクション (= サブタブ) を 1 か所に並べ、各セクションに
          「＋ 新しいバナー / カード を追加」CTA を置く。これで「セクション = サブタブ」
          というメンタルモデルを可視化する。新セクション枠そのものの追加は構造変更なので
          下部の info card で「開発チームへ依頼」と素直に説明する。 */}
      <div style={{
        marginBottom: 14,
        padding: 12,
        background: al(T.c, 0.05),
        border: `1px solid ${al(T.c, 0.25)}`,
        borderRadius: 8,
      }}>
        <div style={{fontSize: 12, fontWeight: 800, color: T.tx, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6}}>
          <span style={{fontSize: 14}}>＋</span>
          このページに新しいセクション項目を追加する ({sections.filter((s) => s.navTab).length} 種類)
        </div>
        <div style={{fontSize: 11, color: T.t4, marginBottom: 10, lineHeight: 1.5}}>
          下のボタンから、追加したいセクションの編集画面に移動できます。各画面で「＋ 新規追加」を押して項目を増やしてください。
        </div>
        <div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
          {sections.filter((s) => s.navTab).map((sec) => (
            <button
              key={sec.key}
              type="button"
              onClick={() => onNavigate(sec.navTab as SubTab)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 12px',
                background: T.bg,
                color: T.tx,
                border: `1.5px solid ${sec.color}`,
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = sec.color + '22'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = T.bg; }}
              title={`${sec.label} の編集画面へ移動`}
              aria-label={`${sec.label} に新しい項目を追加`}
            >
              <span style={{
                display: 'inline-block',
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: sec.color,
                color: '#0a0a0a',
                fontSize: 10,
                fontWeight: 900,
                lineHeight: '18px',
                textAlign: 'center',
              }}>{sec.num}</span>
              <span style={{fontSize: 14}}>{sec.icon}</span>
              <span>{sec.label}</span>
              <span style={{color: T.c, fontWeight: 800, marginLeft: 2}}>＋</span>
            </button>
          ))}
        </div>
        <div style={{
          marginTop: 10,
          padding: '8px 10px',
          background: al(T.tx, 0.04),
          borderRadius: 6,
          fontSize: 11,
          color: T.t5,
          lineHeight: 1.5,
        }}>
          <b style={{color: T.t4}}>※</b> 全く新しい種類のセクション枠 (例: イベントカウントダウン、新着情報バー) を追加したい場合は、現在の機能では対応できません。開発チームへ依頼してください。
        </div>
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
