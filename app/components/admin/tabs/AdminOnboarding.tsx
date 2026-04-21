/**
 * AdminOnboarding — ビジュアル・ダッシュボード（非エンジニア向け管理ホーム）
 *
 * patch 0092 (2026-04-21) 全面刷新:
 *   旧: 684 行の 6 ステップ出品ガイド（読まないと使えない）
 *   新: Stripe/Apple CEO 監査で P0 判定 (2/8) を受けて、数字カード＋クイックアクション
 *       ＋直近変更ログ＋本番サイト iframe プレビューの「3 秒で分かる」ダッシュボードへ置換。
 *       旧 6 ステップ本文は `<details>` で折り畳んで温存（初めてのオーナー向け）。
 *
 * 依存 API:
 *   GET /api/admin/cms?type=astromeda_ip_banner      → IPコラボ件数・公開件数
 *   GET /api/admin/cms?type=astromeda_hero_banner    → ヒーロー件数・公開件数
 *   GET /api/admin/cms?type=astromeda_marquee_item   → マーキー件数・公開件数
 *   GET /api/admin/products?limit=1                  → 商品総件数（patch 0094: productsCount.count を採用。Shopify ストア全体の実総数）
 *   GET /api/admin/audit-log?limit=5                 → 直近 5 件の変更ログ
 *
 * ダッシュボードで完結しない詳しい手順は、末尾の「📘 出品の順番を詳しく見る」
 * アコーディオンで展開できる（localStorage チェックリスト付き）。
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useSearchParams} from 'react-router';
import {color, font, radius, space, transition} from '~/lib/design-tokens';
import {Button} from '~/components/admin/Button';

const SHOPIFY_ADMIN_BASE = 'https://admin.shopify.com/store/production-mining-base';
const SITE_BASE = 'https://astromeda-ec-273085cdf98d80a57b73.o2.myshopify.dev';
const CHECKLIST_KEY = 'astromeda_admin_onboarding_checklist_v1';

// ══════════════════════════════════════════════════
// ① 数字カード — 今日のお店の状態
// ══════════════════════════════════════════════════

interface StatCardProps {
  emoji: string;
  label: string;
  value: number | string;
  sub?: string;
  accent?: string;
  loading?: boolean;
}

function StatCard({emoji, label, value, sub, accent, loading}: StatCardProps) {
  return (
    <div
      style={{
        background: color.bg1,
        border: `1px solid ${color.border}`,
        borderLeft: `4px solid ${accent ?? color.cyan}`,
        borderRadius: radius.lg,
        padding: `${space[4]} ${space[5]}`,
        minHeight: 96,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: space[1],
      }}
    >
      <div style={{display: 'flex', alignItems: 'baseline', gap: space[2]}}>
        <span style={{fontSize: 24}} aria-hidden="true">{emoji}</span>
        <span style={{fontSize: font.xs, color: color.textMuted, fontWeight: font.semibold, letterSpacing: 0.5}}>
          {label}
        </span>
      </div>
      <div style={{fontSize: 30, fontWeight: 800, color: color.text, lineHeight: 1.1, fontFamily: font.family}}>
        {loading ? '…' : value}
      </div>
      {sub && (
        <div style={{fontSize: font.xs, color: color.textMuted}}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════
// ② クイックアクションカード
// ══════════════════════════════════════════════════

interface QuickActionProps {
  emoji: string;
  title: string;
  detail: string;
  onClick: () => void;
  external?: boolean;
}

function QuickAction({emoji, title, detail, onClick, external}: QuickActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        background: color.bg1,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        padding: space[5],
        cursor: 'pointer',
        transition: `all ${transition.fast}`,
        fontFamily: font.family,
        color: color.text,
        display: 'flex',
        flexDirection: 'column',
        gap: space[2],
        minHeight: 108,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = color.bg2;
        e.currentTarget.style.borderColor = color.cyan;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = color.bg1;
        e.currentTarget.style.borderColor = color.border;
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: space[2]}}>
        <span style={{fontSize: 28}} aria-hidden="true">{emoji}</span>
        <div style={{fontSize: font.md, fontWeight: font.bold, color: color.text}}>
          {title}
          {external && <span style={{marginLeft: 6, fontSize: font.xs, color: color.textMuted}}>↗</span>}
        </div>
      </div>
      <div style={{fontSize: font.xs, color: color.textMuted, lineHeight: 1.5}}>
        {detail}
      </div>
    </button>
  );
}

// ══════════════════════════════════════════════════
// 旧 6 ステップガイド（折り畳み式で温存）
// ══════════════════════════════════════════════════

type LinkType = 'admin' | 'shopify' | 'site';
interface StepLink {
  label: string;
  type: LinkType;
  target: string;
  extraQuery?: Record<string, string>;
  description?: string;
}
interface Step {
  id: string;
  emoji: string;
  title: string;
  summary: string;
  detail: string[];
  links: StepLink[];
  cautions?: string[];
}

const STEPS: Step[] = [
  {
    id: 'step1-collab',
    emoji: '①',
    title: '新しい IP コラボを開始する',
    summary: '「コレクション」タブから IP 用のコレクションを作成（Shopify 管理画面に行く必要なし）。',
    detail: [
      '「コレクション」タブを開いて「＋ 新規コレクション」をクリック。',
      'タイトルにコラボ名（例: "ワンピース"）を入力。URL 末尾は空でも自動生成される。',
      '自動コレクションを ON にしてルール = 「商品タグ」 「次と等しい」 「one-piece」 を設定。',
      'ヒーローバナー画像（1920×600px 推奨）を追加して保存。',
    ],
    cautions: [
      'コレクションが空（商品0件）のままだとバナー遷移先がスカスカになるので、先に 1 商品だけでも用意しておくと安全。',
    ],
    links: [
      {label: 'コレクションタブを開く', type: 'admin', target: 'collections'},
    ],
  },
  {
    id: 'step2-product',
    emoji: '②',
    title: '新製品を登録する',
    summary: '「商品管理」タブで新規商品を作成し、IP タグ＋分類タグを付与。',
    detail: [
      '「商品管理」タブの「＋ 新規商品」を押す。',
      'タイトル・本文・価格・SKU・タグを入力。タグに IP 名と「PC」「ガジェット」「グッズ」のどれかを必ず入れる。',
      'ステータスを「🟢 公開」にして保存。',
      '商品詳細画面の「バリアント」タブで在庫数・価格調整が可能。',
    ],
    cautions: [
      'PC 製品は「PC」または「ゲーミング」タグが必須（無いとカスタマイズプルダウンが出ない）。',
    ],
    links: [
      {label: '商品管理タブを開く', type: 'admin', target: 'products'},
    ],
  },
  {
    id: 'step3-link',
    emoji: '③',
    title: 'IP と商品の紐付けを確認',
    summary: 'タグが合っていれば自動コレクションが商品を拾う。件数を見るだけで OK。',
    detail: [
      'ステップ① のコレクション条件とステップ② のタグがスペル一致しているか確認する。',
      '「コレクション」タブで対象コレクションの商品件数が増えていれば成功。',
      '複数商品に同じタグを一発付与したい時は「タグ一括編集」タブが便利。',
    ],
    links: [
      {label: 'タグ一括編集', type: 'admin', target: 'bulkTags'},
    ],
  },
  {
    id: 'step4-banner',
    emoji: '④',
    title: 'トップページのコラボ一覧に追加',
    summary: '「ページ編集 → IPコラボ」で新コレクションをトップのコラボグリッドに登録。',
    detail: [
      '「ページ編集」タブを開き、左ペインで「IPコラボ」を選ぶ。',
      '「＋ 新規追加」で、表示名／コレクション URL 末尾／表示順／「フロントに表示する」を入力。',
      '画像未指定でもコレクション画像が自動で出る（手動上書きも可）。',
      '保存後、右ペインのライブプレビューで確認。',
    ],
    cautions: [
      '表示順が小さいほど左／上に出る。先頭固定は 0〜9、後方は 90 以降。',
    ],
    links: [
      {label: 'ページ編集 → IPコラボ', type: 'admin', target: 'pageEditor', extraQuery: {sub: 'ip_banners'}},
      {label: 'ページ編集 → ヒーローバナー', type: 'admin', target: 'pageEditor', extraQuery: {sub: 'hero_banners'}},
    ],
  },
  {
    id: 'step5-customization',
    emoji: '⑤',
    title: 'PC カスタマイズのプルダウンを調整',
    summary: '「プルダウン管理」タブで、メモリ・SSD 等の選択肢を編集できる（全商品共通）。',
    detail: [
      '「プルダウン管理」タブを開く。プルダウンが無い場合は「＋新しいプルダウンを作る」から追加。',
      '選択肢の「ラベル」に「+¥35,000」のように追加金額を書けば、カート合計に自動反映。',
      '「対象タグ」に「PC」などを入れれば、そのタグを持つ商品にだけ表示される。',
    ],
    links: [
      {label: 'プルダウン管理', type: 'admin', target: 'customization'},
    ],
  },
  {
    id: 'step6-verify',
    emoji: '⑥',
    title: '公開ページで最終確認',
    summary: '本番サイトを開いて「バナー→コレクション→商品→カート→チェックアウト」の流れを目視。',
    detail: [
      '本番サイトのトップを開いてコラボバナーが表示されているか確認。',
      'バナーから商品詳細へ遷移し、プルダウン／価格／画像が正しいか確認。',
      'カートに追加して追加金額が合算されているか確認。',
      'チェックアウト画面に遷移すれば OK（決済まで完了する必要なし）。',
    ],
    links: [
      {label: '本番サイト トップ', type: 'site', target: '/'},
    ],
  },
];

// ══════════════════════════════════════════════════
// Main: AdminOnboarding (Dashboard)
// ══════════════════════════════════════════════════

interface CmsListResponse {
  success?: boolean;
  items?: Array<{id: string; fields?: Record<string, unknown>}>;
  total?: number;
}

interface ProductsListResponse {
  success?: boolean;
  products?: Array<unknown>;
  total?: number;
  /** patch 0094: Shopify 実総件数 (null=取得失敗時) */
  totalProducts?: number | null;
  pageInfo?: {hasNextPage: boolean};
}

interface AuditLogEntry {
  id?: string;
  timestamp?: number | string;
  action?: string;
  role?: string;
  resource?: string;
  success?: boolean;
  detail?: string;
}

interface AuditLogResponse {
  success?: boolean;
  entries?: AuditLogEntry[];
}

/** Shopify Metaobject の fields 形式（[{key,value}]）を plain object 化 */
function fieldsToObject(fieldsArr: unknown): Record<string, string> {
  if (!Array.isArray(fieldsArr)) return {};
  const out: Record<string, string> = {};
  for (const f of fieldsArr) {
    if (f && typeof f === 'object' && 'key' in f && 'value' in f) {
      const k = (f as {key: unknown}).key;
      const v = (f as {value: unknown}).value;
      if (typeof k === 'string') out[k] = typeof v === 'string' ? v : String(v ?? '');
    }
  }
  return out;
}

/** is_active=true を数える（フィールド名は display 層に応じて異なる揺れに耐える） */
function countActive(items: Array<{fields?: unknown}>): number {
  let n = 0;
  for (const it of items) {
    const f = fieldsToObject(it?.fields);
    const v = f.is_active ?? f.active ?? f.is_published ?? 'true';
    if (v === 'true' || v === '1') n++;
  }
  return n;
}

const SITE_PREVIEW_REFRESH_KEY = 'astromeda_admin_dashboard_preview_reloads';

export default function AdminOnboarding() {
  const [, setSearchParams] = useSearchParams();

  // 数字カード用ステート
  const [ipCount, setIpCount] = useState<{total: number; active: number} | null>(null);
  const [heroCount, setHeroCount] = useState<{total: number; active: number} | null>(null);
  const [marqueeCount, setMarqueeCount] = useState<{total: number; active: number} | null>(null);
  // patch 0094: count=実総件数 (Shopify productsCount)。hasMore は totalProducts null の fallback 用。
  const [productTotal, setProductTotal] = useState<{count: number; hasMore: boolean; isExact: boolean} | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[] | null>(null);

  // 折り畳みガイドの完了状態（従来のロジックを維持）
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // iframe リフレッシュトリガー
  const [previewKey, setPreviewKey] = useState(0);

  // localStorage から進捗ロード
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHECKLIST_KEY);
      if (raw) setDone(JSON.parse(raw) as Record<string, boolean>);
    } catch {/* ignore */}
  }, []);

  // 並列で全カード用データを取得
  const loadCounts = useCallback(async () => {
    const fetchJson = async <T,>(url: string): Promise<T | null> => {
      try {
        const r = await fetch(url);
        if (!r.ok) return null;
        return await r.json() as T;
      } catch {
        return null;
      }
    };

    // 4 API を並列で叩く
    const [ip, hero, marquee, prods, audit] = await Promise.all([
      fetchJson<CmsListResponse>('/api/admin/cms?type=astromeda_ip_banner'),
      fetchJson<CmsListResponse>('/api/admin/cms?type=astromeda_hero_banner'),
      fetchJson<CmsListResponse>('/api/admin/cms?type=astromeda_marquee_item'),
      // patch 0094: totalProducts だけあれば十分なので limit=1 で API 負荷最小化。
      fetchJson<ProductsListResponse>('/api/admin/products?limit=1'),
      fetchJson<AuditLogResponse>('/api/admin/audit-log?limit=5'),
    ]);

    const ipItems = (ip?.items ?? []) as Array<{fields?: unknown}>;
    const heroItems = (hero?.items ?? []) as Array<{fields?: unknown}>;
    const marqueeItems = (marquee?.items ?? []) as Array<{fields?: unknown}>;

    setIpCount({total: ipItems.length, active: countActive(ipItems)});
    setHeroCount({total: heroItems.length, active: countActive(heroItems)});
    setMarqueeCount({total: marqueeItems.length, active: countActive(marqueeItems)});

    // patch 0094: Shopify 実総件数 (productsCount) を優先し、ない場合のみ配列長にフォールバック。
    // これにより 50+ 頭打ちが解消され、500 件でも正しく 500 と表示される。
    const productsArr = prods?.products ?? [];
    const exactCount = typeof prods?.totalProducts === 'number' ? prods.totalProducts : null;
    const arrLen = Array.isArray(productsArr) ? productsArr.length : 0;
    setProductTotal({
      count: exactCount ?? arrLen,
      hasMore: exactCount == null && Boolean(prods?.pageInfo?.hasNextPage),
      isExact: exactCount != null,
    });

    setAuditEntries(audit?.entries ?? []);
  }, []);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  // ── Navigation helpers ──
  const goAdmin = useCallback(
    (target: string, extra?: Record<string, string>) => {
      const params: Record<string, string> = {tab: target};
      if (extra) Object.assign(params, extra);
      setSearchParams(params);
      try {
        window.scrollTo({top: 0, behavior: 'smooth'});
      } catch {/* ignore */}
    },
    [setSearchParams],
  );
  const openSite = useCallback((path: string = '/') => {
    window.open(`${SITE_BASE}${path}`, '_blank', 'noopener');
  }, []);
  const reloadPreview = useCallback(() => {
    setPreviewKey((k) => k + 1);
    try {
      const n = Number(window.sessionStorage.getItem(SITE_PREVIEW_REFRESH_KEY) ?? '0') + 1;
      window.sessionStorage.setItem(SITE_PREVIEW_REFRESH_KEY, String(n));
    } catch {/* ignore */}
  }, []);

  // ── 旧ガイド: 完了トグル + 次ステップ自動スクロール（既存ロジック踏襲） ──
  const currentOpenId = useMemo(() => {
    if (openId) return openId;
    const firstIncomplete = STEPS.find((s) => !done[s.id]);
    return firstIncomplete?.id ?? STEPS[STEPS.length - 1].id;
  }, [openId, done]);
  const toggleDone = useCallback(
    (id: string) => {
      setDone((prev) => {
        const next = {...prev, [id]: !prev[id]};
        try {
          window.localStorage.setItem(CHECKLIST_KEY, JSON.stringify(next));
        } catch {/* ignore */}
        return next;
      });
      if (!done[id]) {
        const currentIdx = STEPS.findIndex((s) => s.id === id);
        const nextStep = STEPS.slice(currentIdx + 1).find((s) => !done[s.id]);
        if (nextStep) {
          setOpenId(nextStep.id);
          requestAnimationFrame(() => {
            stepRefs.current[nextStep.id]?.scrollIntoView({behavior: 'smooth', block: 'center'});
          });
        }
      }
    },
    [done],
  );
  const toggleOpen = useCallback((id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);
  const completedCount = useMemo(() => STEPS.filter((s) => done[s.id]).length, [done]);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // ── レンダリング ──
  return (
    <div style={{maxWidth: 1280, margin: '0 auto'}}>
      {/* ヘッダー */}
      <div style={{marginBottom: space[5]}}>
        <div style={{display: 'flex', alignItems: 'center', gap: space[3], marginBottom: space[1]}}>
          <span style={{fontSize: 28}} aria-hidden="true">🚀</span>
          <h1 style={{margin: 0, fontSize: 24, fontWeight: 800, color: color.text, fontFamily: font.family}}>
            ダッシュボード
          </h1>
        </div>
        <p style={{margin: 0, fontSize: font.sm, color: color.textMuted}}>
          今日のお店の状態と、よく使う操作をここからまとめて。
        </p>
      </div>

      {/* ① 数字カード 4 枚 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: space[3],
          marginBottom: space[5],
        }}
      >
        <StatCard
          emoji="🎨"
          label="IPコラボ"
          value={ipCount ? `${ipCount.active} / ${ipCount.total}` : '—'}
          sub={ipCount ? '公開中 / 登録済み' : '読み込み中…'}
          accent={color.cyan}
          loading={ipCount === null}
        />
        <StatCard
          emoji="📦"
          label="商品"
          value={productTotal ? `${productTotal.count}${productTotal.hasMore ? '+' : ''}` : '—'}
          sub={
            productTotal?.isExact
              ? 'ストア全商品'
              : productTotal?.hasMore
                ? '他にもまだあります'
                : '表示可能な商品'
          }
          accent={color.green}
          loading={productTotal === null}
        />
        <StatCard
          emoji="🖼️"
          label="ヒーローバナー"
          value={heroCount ? `${heroCount.active} / ${heroCount.total}` : '—'}
          sub={heroCount ? '公開中 / 登録済み' : '読み込み中…'}
          accent="#facc15"
          loading={heroCount === null}
        />
        <StatCard
          emoji="🎞️"
          label="マーキー"
          value={marqueeCount ? `${marqueeCount.active} / ${marqueeCount.total}` : '—'}
          sub={marqueeCount ? '公開中 / 登録済み' : '読み込み中…'}
          accent="#a78bfa"
          loading={marqueeCount === null}
        />
      </div>

      {/* ② クイックアクション 4 個 */}
      <div style={{marginBottom: space[4]}}>
        <div
          style={{
            fontSize: font.xs,
            fontWeight: font.bold,
            color: color.textMuted,
            letterSpacing: 1,
            marginBottom: space[2],
            textTransform: 'uppercase',
          }}
        >
          よく使う操作
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: space[3],
          }}
        >
          <QuickAction
            emoji="🎨"
            title="IPコラボを追加"
            detail="新しいコラボバナーをトップページに出す"
            onClick={() => goAdmin('pageEditor', {sub: 'ip_banners'})}
          />
          <QuickAction
            emoji="📦"
            title="新しい商品を登録"
            detail="PC・ガジェット・グッズを追加する"
            onClick={() => goAdmin('products')}
          />
          <QuickAction
            emoji="🖼️"
            title="ヒーローバナーを編集"
            detail="トップ最上部の大きな画像を入れ替える"
            onClick={() => goAdmin('pageEditor', {sub: 'hero_banners'})}
          />
          <QuickAction
            emoji="👁️"
            title="サイトを開いて確認"
            detail="本番サイトを別タブで表示する"
            onClick={() => openSite('/')}
            external
          />
        </div>
      </div>

      {/* ③ 下段: 左=直近の変更 / 右=ライブプレビュー */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1fr) minmax(360px, 1.4fr)',
          gap: space[3],
          marginBottom: space[5],
        }}
      >
        {/* 直近の変更タイムライン */}
        <div
          style={{
            background: color.bg1,
            border: `1px solid ${color.border}`,
            borderRadius: radius.lg,
            padding: space[5],
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[3]}}>
            <h2 style={{margin: 0, fontSize: font.md, fontWeight: font.bold, color: color.text}}>
              <span aria-hidden="true">🕒</span> 直近の変更
            </h2>
            <button
              type="button"
              onClick={() => void loadCounts()}
              style={{
                fontSize: font.xs,
                padding: '4px 10px',
                background: 'transparent',
                color: color.textMuted,
                border: `1px solid ${color.border}`,
                borderRadius: radius.sm,
                cursor: 'pointer',
                fontFamily: font.family,
              }}
              aria-label="直近の変更を再読み込み"
            >
              更新
            </button>
          </div>
          {auditEntries === null && (
            <div style={{fontSize: font.sm, color: color.textMuted}}>読み込み中…</div>
          )}
          {auditEntries !== null && auditEntries.length === 0 && (
            <div style={{fontSize: font.sm, color: color.textMuted}}>
              まだ変更履歴がありません。
            </div>
          )}
          {auditEntries !== null && auditEntries.length > 0 && (
            <ul style={{listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: space[2]}}>
              {auditEntries.map((e, i) => {
                const ts = e.timestamp
                  ? new Date(typeof e.timestamp === 'number' ? e.timestamp : Date.parse(String(e.timestamp)))
                  : null;
                const tsLabel = ts
                  ? ts.toLocaleString('ja-JP', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'})
                  : '—';
                return (
                  <li
                    key={e.id ?? i}
                    style={{
                      padding: `${space[2]} ${space[3]}`,
                      background: color.bg0,
                      borderRadius: radius.sm,
                      borderLeft: `3px solid ${e.success === false ? color.red : color.cyan}`,
                    }}
                  >
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: space[2]}}>
                      <div style={{fontSize: font.sm, fontWeight: font.semibold, color: color.text}}>
                        {translateAuditAction(e.action)}
                      </div>
                      <div style={{fontSize: font.xs, color: color.textMuted, whiteSpace: 'nowrap'}}>
                        {tsLabel}
                      </div>
                    </div>
                    {e.resource && (
                      <div style={{fontSize: font.xs, color: color.textMuted, marginTop: 2, wordBreak: 'break-all'}}>
                        {shortenResource(e.resource)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ライブプレビュー iframe */}
        <div
          style={{
            background: color.bg1,
            border: `1px solid ${color.border}`,
            borderRadius: radius.lg,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 480,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: `${space[2]} ${space[4]}`,
              borderBottom: `1px solid ${color.border}`,
              background: color.bg0,
              gap: space[2],
            }}
          >
            <div style={{fontSize: font.sm, fontWeight: font.bold, color: color.text}}>
              <span aria-hidden="true">👁️</span> 本番サイト ライブプレビュー
            </div>
            <div style={{display: 'flex', gap: space[2]}}>
              <button
                type="button"
                onClick={reloadPreview}
                style={{
                  fontSize: font.xs,
                  padding: '4px 10px',
                  background: 'transparent',
                  color: color.textMuted,
                  border: `1px solid ${color.border}`,
                  borderRadius: radius.sm,
                  cursor: 'pointer',
                  fontFamily: font.family,
                }}
              >
                再読み込み
              </button>
              <button
                type="button"
                onClick={() => openSite('/')}
                style={{
                  fontSize: font.xs,
                  padding: '4px 10px',
                  background: 'transparent',
                  color: color.cyan,
                  border: `1px solid ${color.cyan}`,
                  borderRadius: radius.sm,
                  cursor: 'pointer',
                  fontFamily: font.family,
                }}
              >
                新しいタブで開く ↗
              </button>
            </div>
          </div>
          <iframe
            key={previewKey}
            ref={iframeRef}
            src={SITE_BASE}
            title="本番サイト ライブプレビュー"
            style={{flex: 1, width: '100%', border: 'none', background: '#000', minHeight: 420}}
            loading="lazy"
          />
        </div>
      </div>

      {/* ④ 旧 6 ステップ出品ガイド — 折り畳み */}
      <details
        style={{
          background: color.bg1,
          border: `1px solid ${color.border}`,
          borderRadius: radius.lg,
          padding: `${space[4]} ${space[5]}`,
        }}
      >
        <summary
          style={{
            cursor: 'pointer',
            fontSize: font.md,
            fontWeight: font.bold,
            color: color.text,
            listStyle: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: space[2],
            fontFamily: font.family,
          }}
        >
          <span>
            <span aria-hidden="true">📘</span> 出品の順番を詳しく見る（初めての方向け・6 ステップ）
          </span>
          <span style={{fontSize: font.xs, color: color.textMuted}}>
            {completedCount} / {STEPS.length} 完了
          </span>
        </summary>

        <div style={{marginTop: space[4]}}>
          <p style={{margin: `0 0 ${space[4]}`, color: color.textMuted, fontSize: font.sm, lineHeight: 1.7}}>
            新しい IP コラボを始めて販売可能にするまでの手順を順番に並べています。完了にチェックすると次のステップへ進みます（進捗はこのブラウザに保存）。
          </p>

          {/* 進捗バー */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: space[4],
              padding: `${space[3]} ${space[4]}`,
              background: color.bg0,
              borderRadius: radius.md,
              border: `1px solid ${color.border}`,
              marginBottom: space[4],
            }}
            role="group"
            aria-label="出品ガイド進捗"
          >
            <div style={{fontSize: font.sm, fontWeight: font.bold, color: color.text}}>進捗</div>
            <div
              style={{flex: 1, height: 8, background: color.bg1, borderRadius: 4, overflow: 'hidden'}}
              role="progressbar"
              aria-valuenow={completedCount}
              aria-valuemin={0}
              aria-valuemax={STEPS.length}
              aria-valuetext={`${STEPS.length} 中 ${completedCount} 完了`}
            >
              <div
                style={{
                  width: `${(completedCount / STEPS.length) * 100}%`,
                  height: '100%',
                  background: completedCount === STEPS.length ? color.green : color.cyan,
                  transition: 'width .3s',
                }}
              />
            </div>
            <div style={{fontSize: font.sm, fontWeight: font.bold, color: color.cyan, minWidth: 60, textAlign: 'right'}}>
              {completedCount} / {STEPS.length}
            </div>
          </div>

          {/* ステップカード */}
          {STEPS.map((step) => {
            const isDone = !!done[step.id];
            const isOpen = currentOpenId === step.id;
            return (
              <div
                key={step.id}
                ref={(el) => { stepRefs.current[step.id] = el; }}
                style={{
                  background: color.bg0,
                  border: `1px solid ${color.border}`,
                  borderRadius: radius.md,
                  marginBottom: space[3],
                  overflow: 'hidden',
                  borderLeft: `4px solid ${isDone ? color.green : isOpen ? color.cyan : color.border}`,
                  opacity: isDone && !isOpen ? 0.75 : 1,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleOpen(step.id)}
                  aria-expanded={isOpen}
                  aria-controls={`${step.id}-body`}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: space[3],
                    padding: `${space[3]} ${space[5]}`,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: font.family,
                  }}
                >
                  <span
                    role="checkbox"
                    aria-checked={isDone}
                    aria-label={isDone ? `${step.title} を未完了に戻す` : `${step.title} を完了にする`}
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); toggleDone(step.id); }}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault(); e.stopPropagation(); toggleDone(step.id);
                      }
                    }}
                    style={{
                      flexShrink: 0,
                      width: 24,
                      height: 24,
                      borderRadius: radius.sm,
                      border: `2px solid ${isDone ? color.green : color.border}`,
                      background: isDone ? color.green : 'transparent',
                      color: '#000',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 900,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isDone ? '✓' : ''}
                  </span>
                  <div style={{flex: 1}}>
                    <div style={{fontSize: font.xs, fontWeight: font.bold, color: isDone ? color.green : color.cyan, letterSpacing: 2, marginBottom: 2}}>
                      STEP {step.emoji}{isDone ? ' 完了' : ''}
                    </div>
                    <div style={{fontSize: font.sm, fontWeight: font.bold, color: color.text}}>
                      {step.title}
                    </div>
                    {!isOpen && (
                      <div style={{marginTop: 2, fontSize: font.xs, color: color.textMuted, lineHeight: 1.5}}>
                        {step.summary}
                      </div>
                    )}
                  </div>
                  <span
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      color: color.textMuted,
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform .2s',
                      display: 'inline-flex',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </button>
                {isOpen && (
                  <div
                    id={`${step.id}-body`}
                    style={{padding: `0 ${space[5]} ${space[4]}`, borderTop: `1px solid ${color.border}`}}
                  >
                    <p style={{margin: `${space[3]} 0`, fontSize: font.sm, color: color.textSecondary, lineHeight: 1.7}}>
                      {step.summary}
                    </p>
                    <ol style={{margin: 0, paddingLeft: space[5], fontSize: font.sm, color: color.text, lineHeight: 1.8}}>
                      {step.detail.map((line, i) => (
                        <li key={i} style={{marginBottom: 2}}>{line}</li>
                      ))}
                    </ol>
                    {step.cautions && step.cautions.length > 0 && (
                      <div
                        style={{
                          marginTop: space[3],
                          padding: `${space[2]} ${space[3]}`,
                          background: 'rgba(255, 200, 0, 0.06)',
                          border: '1px solid rgba(255, 200, 0, 0.2)',
                          borderRadius: radius.sm,
                          fontSize: font.xs,
                          color: color.text,
                          lineHeight: 1.7,
                        }}
                      >
                        <span style={{color: '#ffb84d', fontWeight: font.bold, marginRight: 4}}>⚠️ 注意</span>
                        {step.cautions.join(' / ')}
                      </div>
                    )}
                    <div style={{display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[3]}}>
                      {step.links.map((link, i) => {
                        if (link.type === 'admin') {
                          return (
                            <Button
                              key={i}
                              variant="primary"
                              size="md"
                              onClick={() => goAdmin(link.target, link.extraQuery)}
                              title={link.description}
                            >
                              → {link.label}
                            </Button>
                          );
                        }
                        const href = link.type === 'shopify'
                          ? `${SHOPIFY_ADMIN_BASE}${link.target}`
                          : `${SITE_BASE}${link.target}`;
                        return (
                          <a
                            key={i}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '8px 16px',
                              fontSize: font.sm,
                              fontWeight: font.semibold,
                              color: color.cyan,
                              background: 'transparent',
                              border: `1px solid ${color.cyan}`,
                              borderRadius: radius.md,
                              textDecoration: 'none',
                              fontFamily: font.family,
                            }}
                          >
                            ↗ {link.label}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}

// ══════════════════════════════════════════════════
// Helpers — 非エンジニアに読ませるラベル整形
// ══════════════════════════════════════════════════

function translateAuditAction(action: string | undefined): string {
  if (!action) return '変更';
  const map: Record<string, string> = {
    api_access: 'API アクセス',
    product_create: '商品を追加',
    product_update: '商品を更新',
    product_delete: '商品を削除',
    product_bulk_tag: '商品タグを一括編集',
    collection_create: 'コレクションを作成',
    collection_update: 'コレクションを更新',
    collection_delete: 'コレクションを削除',
    metaobject_create: 'CMS データを追加',
    metaobject_update: 'CMS データを更新',
    metaobject_delete: 'CMS データを削除',
    metaobject_definition_create: 'CMS データ定義を追加',
    metaobject_definition_update: 'CMS データ定義を更新',
    metaobject_definition_delete: 'CMS データ定義を削除',
    redirect_create: 'リダイレクトを追加',
    redirect_update: 'リダイレクトを更新',
    redirect_delete: 'リダイレクトを削除',
    file_delete: 'ファイルを削除',
    discount_create: '割引を作成',
    discount_update: '割引を更新',
    discount_delete: '割引を削除',
    menu_create: 'メニューを追加',
    menu_update: 'メニューを更新',
    menu_delete: 'メニューを削除',
    login_success: 'ログイン',
    login_failure: 'ログイン失敗',
    logout: 'ログアウト',
  };
  return map[action] ?? action.replace(/_/g, ' ');
}

function shortenResource(resource: string): string {
  // "api/admin/xxx?foo=bar" → "xxx"
  const cleaned = resource
    .replace(/^api\/admin\//, '')
    .replace(/^\/api\/admin\//, '')
    .split('?')[0];
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}…` : cleaned;
}
