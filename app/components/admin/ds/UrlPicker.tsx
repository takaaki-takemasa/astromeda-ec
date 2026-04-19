/**
 * UrlPicker — 非エンジニア向けリンク先選択UI
 *
 * patch 0042 (2026-04-19)
 *
 * バナーの「リンク先URL」欄を、テキスト手打ちから「種類選択 → 既存ページから選択」
 * 方式に置き換える共有コンポーネント。
 *
 * 種類:
 *   1. コレクション (Shopify)              → /collections/<handle>
 *   2. 商品 (Shopify、開発中)              → /products/<handle>
 *   3. 静的ページ (Astromeda CMS)          → /<slug>  e.g. /warranty
 *   4. ブログ記事 (Astromeda CMS)          → /blog/<slug>
 *   5. SEO記事 (Astromeda CMS)             → /seo/<slug>
 *   6. 内部ルート (固定)                   → / | /cart | /faq | /account ...
 *   7. 外部URL                             → https://...
 *
 * UI:
 *   - 種類のラジオボタン (絵文字付き、CEOが直感的に選べる)
 *   - 種類に応じた選択UI:
 *       コレクション/静的ページ/ブログ/SEO → 検索つきドロップダウン
 *       内部ルート → 固定リスト
 *       外部URL → テキスト入力
 *   - 選択後、結合済みURLを onChange に通知
 *   - "+ 新しいページを作る" ボタンで static_page を即座に作成可能
 */
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { color, font, radius, space } from '~/lib/design-tokens';

export type DestinationKind =
  | 'collection'
  | 'product'
  | 'static_page'
  | 'blog'
  | 'seo'
  | 'internal'
  | 'external';

export interface DestinationOption {
  /** 表示用ラベル e.g. "ONE PIECE バウンティラッシュ" */
  label: string;
  /** Shopify handle / CMS slug e.g. "one-piece-bountyrush-collaboration" */
  value: string;
  /** 補足表示 e.g. 「商品 30 件」 */
  hint?: string;
}

export interface DestinationCatalog {
  collections: DestinationOption[];
  static_pages: DestinationOption[];
  blogs: DestinationOption[];
  seos: DestinationOption[];
}

interface UrlPickerProps {
  /** 現在の URL 文字列 (e.g. "/collections/sale" "/blog/foo" "https://...") */
  value: string;
  onChange: (newUrl: string) => void;
  /** 任意フィールドかどうか */
  optional?: boolean;
  /** 「+ 新しいページを作る」モーダルを開く */
  onRequestCreatePage?: () => void;
  /** 事前ロード済み destinations (props で渡せる場合) */
  catalog?: DestinationCatalog;
  /** ラベル文字列 (default "リンク先") */
  label?: string;
}

const KINDS: { id: DestinationKind; emoji: string; jp: string; helper: string }[] = [
  { id: 'collection', emoji: '🛍️', jp: 'コレクション', helper: 'Shopify のコレクションページに飛ばす（例: 呪術廻戦コラボ）' },
  { id: 'static_page', emoji: '📄', jp: '固定ページ', helper: '保証・問合せ・特定商取引法など、自分で作ったページ' },
  { id: 'blog',       emoji: '📰', jp: 'ブログ記事',  helper: 'お知らせやコラム記事' },
  { id: 'seo',        emoji: '🔍', jp: 'SEO 記事',    helper: '検索流入を狙う長文 SEO 記事' },
  { id: 'internal',   emoji: '🏠', jp: 'サイト内',    helper: 'トップ・カート・FAQ・マイページ等の固定画面' },
  { id: 'external',   emoji: '🔗', jp: '外部 URL',    helper: 'LINE 公式・X (Twitter) など外部サイトへ' },
];

const INTERNAL_ROUTES: DestinationOption[] = [
  { label: 'トップページ',     value: '/',             hint: '/' },
  { label: 'ゲーミングPC',     value: '/gaming-pc',    hint: '/gaming-pc' },
  { label: 'カート',           value: '/cart',         hint: '/cart' },
  { label: 'マイページ',       value: '/account',      hint: '/account' },
  { label: 'よくある質問',     value: '/faq',          hint: '/faq' },
  { label: '保証・修理',       value: '/warranty',     hint: '/warranty' },
  { label: '問い合わせ',       value: '/contact',      hint: '/contact' },
  { label: '法人問い合わせ',   value: '/contact-houjin', hint: '/contact-houjin' },
  { label: 'こだわり',         value: '/commitment',   hint: '/commitment' },
  { label: 'リサイクル',       value: '/recycle',      hint: '/recycle' },
];

/**
 * 既存の URL から「種類」を逆算する
 */
export function detectKind(url: string): DestinationKind {
  if (!url) return 'collection';
  if (/^https?:\/\//i.test(url)) return 'external';
  if (/^\/collections\//.test(url)) return 'collection';
  if (/^\/products\//.test(url)) return 'product';
  if (/^\/blog\//.test(url)) return 'blog';
  if (/^\/seo\//.test(url)) return 'seo';
  if (INTERNAL_ROUTES.some(r => r.value === url)) return 'internal';
  // それ以外の /xxx は固定ページ扱い
  if (/^\//.test(url)) return 'static_page';
  return 'external';
}

/**
 * URL から種類別の slug 部分を抽出
 */
function extractSlug(url: string, kind: DestinationKind): string {
  if (!url) return '';
  switch (kind) {
    case 'collection': return url.replace(/^\/collections\//, '');
    case 'product':    return url.replace(/^\/products\//, '');
    case 'blog':       return url.replace(/^\/blog\//, '');
    case 'seo':        return url.replace(/^\/seo\//, '');
    case 'static_page':return url.replace(/^\//, '');
    case 'internal':   return url;
    case 'external':   return url;
  }
}

/**
 * 種類 + slug から URL を組み立てる
 */
function buildUrl(kind: DestinationKind, slug: string): string {
  if (!slug) return '';
  switch (kind) {
    case 'collection': return `/collections/${slug}`;
    case 'product':    return `/products/${slug}`;
    case 'blog':       return `/blog/${slug}`;
    case 'seo':        return `/seo/${slug}`;
    case 'static_page':return slug.startsWith('/') ? slug : `/${slug}`;
    case 'internal':   return slug;
    case 'external':   return slug;
  }
}

export function UrlPicker({
  value,
  onChange,
  optional,
  onRequestCreatePage,
  catalog: providedCatalog,
  label = 'リンク先',
}: UrlPickerProps) {
  const [kind, setKind] = useState<DestinationKind>(() => detectKind(value));
  const [slug, setSlug] = useState<string>(() => extractSlug(value, detectKind(value)));
  const [catalog, setCatalog] = useState<DestinationCatalog | null>(providedCatalog ?? null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // value プロップが外部から変わったら state を再同期
  useEffect(() => {
    const k = detectKind(value);
    setKind(k);
    setSlug(extractSlug(value, k));
  }, [value]);

  // catalog 自動ロード
  useEffect(() => {
    if (providedCatalog) return;
    if (catalog) return;
    let cancelled = false;
    setLoading(true);
    fetch('/api/admin/destinations', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: unknown) => {
        if (cancelled) return;
        if (data && typeof data === 'object' && 'catalog' in data) {
          setCatalog((data as { catalog: DestinationCatalog }).catalog);
        }
      })
      .catch(() => { /* fallback: empty catalog */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [providedCatalog, catalog]);

  // 種類変更時、URL を空に
  const switchKind = (next: DestinationKind) => {
    setKind(next);
    setSlug('');
    setSearch('');
    onChange('');
  };

  const updateSlug = (next: string) => {
    setSlug(next);
    onChange(buildUrl(kind, next));
  };

  // 種類別の選択肢
  const options: DestinationOption[] = useMemo(() => {
    if (!catalog) return [];
    switch (kind) {
      case 'collection': return catalog.collections;
      case 'static_page': return catalog.static_pages;
      case 'blog':       return catalog.blogs;
      case 'seo':        return catalog.seos;
      case 'internal':   return INTERNAL_ROUTES;
      default:           return [];
    }
  }, [catalog, kind]);

  // 検索フィルタ
  const filteredOptions = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter(o =>
      o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, search]);

  // 現在の slug に対応する option ラベル
  const currentLabel = useMemo(() => {
    const found = options.find(o => o.value === slug);
    return found ? found.label : null;
  }, [options, slug]);

  const wrapperStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: space[2],
  };

  const labelStyle: CSSProperties = {
    fontSize: font.xs,
    color: color.textSecondary,
    fontWeight: font.semibold,
  };

  return (
    <div style={wrapperStyle}>
      <label style={labelStyle}>
        {label}{optional ? ' (任意)' : ''}
      </label>

      {/* 種類選択 (タブ風) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[1] }}>
        {KINDS.map(k => (
          <button
            type="button"
            key={k.id}
            onClick={() => switchKind(k.id)}
            title={k.helper}
            style={{
              padding: '6px 10px',
              fontSize: font.xs,
              fontWeight: font.semibold,
              fontFamily: font.family,
              borderRadius: radius.md,
              border: `1px solid ${kind === k.id ? color.cyan : color.border}`,
              background: kind === k.id ? color.cyanDim : 'transparent',
              color: kind === k.id ? color.cyan : color.textSecondary,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>{k.emoji}</span>
            <span>{k.jp}</span>
          </button>
        ))}
      </div>

      {/* ヘルパー */}
      <div style={{ fontSize: font.xs, color: color.textMuted }}>
        {KINDS.find(k => k.id === kind)?.helper}
      </div>

      {/* 選択 UI */}
      {kind === 'external' || kind === 'product' ? (
        <input
          type="text"
          value={slug}
          onChange={(e) => updateSlug(e.target.value)}
          placeholder={kind === 'external' ? 'https://line.me/...' : '商品の URL ハンドル'}
          style={inputStyleFull}
        />
      ) : (
        <>
          {/* 検索 + ドロップダウン */}
          {options.length > 8 ? (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`${KINDS.find(k => k.id === kind)?.jp} を検索...`}
              style={inputStyleFull}
            />
          ) : null}
          <select
            value={slug}
            onChange={(e) => updateSlug(e.target.value)}
            style={inputStyleFull}
          >
            <option value="">
              {loading ? '読み込み中...' : `(${KINDS.find(k => k.id === kind)?.jp} を選択)`}
            </option>
            {filteredOptions.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}{opt.hint ? `  (${opt.hint})` : ''}
              </option>
            ))}
          </select>

          {/* 「+ 新しいページを作る」ボタン (static_page/blog/seo のみ)
              onRequestCreatePage が与えられていなければ、対応する admin タブを別ウィンドウで開く。
              CEO 向けに「ここで作って戻ってきたら自動で出てくるよ」のフローを担保する。*/}
          {(kind === 'static_page' || kind === 'blog' || kind === 'seo') ? (
            <button
              type="button"
              onClick={() => {
                if (onRequestCreatePage) {
                  onRequestCreatePage();
                  return;
                }
                // デフォルト: admin の対応タブを別ウィンドウで開く
                const target =
                  kind === 'static_page' ? '/admin?tab=siteConfig&sub=static_pages'
                  : kind === 'blog'       ? '/admin?tab=content&sub=articles'
                  : /* seo */                '/admin?tab=content&sub=seo';
                if (typeof window !== 'undefined') {
                  window.open(target, '_blank', 'noopener,noreferrer');
                }
              }}
              title="別ウィンドウで管理画面を開いて新しいページを作成。作成後にこのドロップダウンを再度開くと自動で表示されます。"
              style={{
                alignSelf: 'flex-start',
                padding: '4px 10px',
                fontSize: font.xs,
                fontWeight: font.semibold,
                color: color.cyan,
                background: 'transparent',
                border: `1px dashed ${color.cyan}`,
                borderRadius: radius.md,
                cursor: 'pointer',
                fontFamily: font.family,
              }}
            >
              ＋ 新しい{KINDS.find(k => k.id === kind)?.jp}を作る（別タブ）
            </button>
          ) : null}
        </>
      )}

      {/* 結果プレビュー */}
      {value ? (
        <div
          style={{
            marginTop: space[1],
            padding: '6px 10px',
            fontSize: font.xs,
            color: color.textSecondary,
            background: color.bg2,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md,
            fontFamily: font.mono,
            wordBreak: 'break-all',
          }}
        >
          → {value}
          {currentLabel ? <span style={{ color: color.textMuted, marginLeft: 8 }}>（{currentLabel}）</span> : null}
        </div>
      ) : null}
    </div>
  );
}

const inputStyleFull: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: font.sm,
  fontFamily: font.family,
  color: color.text,
  background: color.bg1,
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  outline: 'none',
  boxSizing: 'border-box',
};
