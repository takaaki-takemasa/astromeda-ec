/**
 * AdminOnboarding — 非エンジニア向け 出品ガイド
 *
 * patch 0059 (2026-04-19) 初版: 6ステップ navigation 実装
 * patch 0078 (2026-04-20) 刷新:
 *   - Button primitive (variant=primary/secondary/ghost) 導入
 *   - Progressive disclosure: 現在ステップのみ展開し完了ステップは折り畳む
 *     (Apple Wallet / Stripe Onboarding 流儀)
 *   - 完了時に次ステップへ自動スクロール
 *   - 6ステップ card の枠構造をシンプル化し視認性を Stripe/Apple 水準に
 *
 * CEO（非エンジニア）が最初にここを開けば、どのタブに行って何を編集すれば
 * いいかが順番に分かる。各ステップに admin 内タブへのワンクリック導線と
 * Shopify 管理画面への外部リンクを併設。進捗チェックは localStorage に保存。
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useSearchParams} from 'react-router';
import {color, font, radius, space, transition} from '~/lib/design-tokens';
import {Button} from '~/components/admin/Button';

/**
 * Button primitive と視覚的に完全一致する <a> スタイル。
 * Button は <button> 固定のため、外部リンクは <a> に同等スタイルを付けて描画する。
 * variant: 'secondary' | 'ghost' (外部リンクは primary は使わない)
 */
const linkButtonStyle = (variant: 'secondary' | 'ghost'): React.CSSProperties => {
  const v = variant === 'secondary'
    ? {bg: 'transparent', text: color.cyan, border: color.cyan, hoverBg: color.cyanDim}
    : {bg: 'transparent', text: color.textSecondary, border: 'transparent', hoverBg: 'rgba(255,255,255,.06)'};
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 34,
    padding: '0 16px',
    fontSize: font.sm,
    fontWeight: font.semibold,
    fontFamily: font.family,
    color: v.text,
    background: v.bg,
    border: v.border !== 'transparent' ? `1px solid ${v.border}` : 'none',
    borderRadius: radius.md,
    cursor: 'pointer',
    transition: `all ${transition.fast}`,
    whiteSpace: 'nowrap',
    textDecoration: 'none',
  };
};

const SHOPIFY_ADMIN_BASE = 'https://admin.shopify.com/store/production-mining-base';
const SITE_BASE = 'https://astromeda-ec-273085cdf98d80a57b73.o2.myshopify.dev';
const CHECKLIST_KEY = 'astromeda_admin_onboarding_checklist_v1';

// ── 型定義 ──
type LinkType = 'admin' | 'shopify' | 'site';
interface StepLink {
  label: string;
  type: LinkType;
  /** admin: ?tab=xxx 用の SubTab 値 / shopify: SHOPIFY_ADMIN_BASE 起点の path / site: SITE_BASE 起点の path */
  target: string;
  /** ページ編集タブの page_sub などの追加クエリ（admin 用） */
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

// ── 全工程ステップ定義 ──
const STEPS: Step[] = [
  {
    id: 'step1-collab',
    emoji: '①',
    title: '新しい IP コラボを開始する',
    summary: 'この管理画面の「コレクション」タブから、IP 用のコレクションを作成（Shopify 管理画面に行く必要なし）。',
    detail: [
      '1. この管理画面の「コレクション」タブを開く（下のボタン）。',
      '2. 右上の「＋ 新規コレクション」を押し、タイトルにコラボ名（例: "ワンピース"）を入力。',
      '3. ハンドル（URL）は空欄でも自動生成される。指定するなら半角英数で短く。例: one-piece-collaboration',
      '4. 「自動コレクション」のチェックをONにし、ルール = 「商品タグ」 「次と等しい」 「one-piece」 を設定（タグ名は任意）。AND/OR も切替可能。',
      '5. 画像欄にヒーローバナー画像（1920×600px 推奨）をアップロードまたは URL 入力。',
      '6. 保存。Shopify への反映は即時。',
    ],
    cautions: [
      'コレクションが空 = 商品0件のままだと、トップページにバナーが出ても押した先がスカスカになる。先に少なくとも 1 商品を新規作成してから次へ進む方が安全。',
      '管理画面で完結するため、Shopify 管理画面に切り替える必要はありません（CEO 指摘の二段階修正の解消）。',
    ],
    links: [
      {
        label: 'コレクションタブを開く',
        type: 'admin',
        target: 'collections',
        description: '＋新規コレクション から作成・編集・削除がこの画面内で完結',
      },
    ],
  },
  {
    id: 'step2-product',
    emoji: '②',
    title: '新製品（PC・グッズ）を登録する',
    summary: '管理画面の「商品管理」タブから新規商品を作成。タグでコラボ IP に自動所属させる。',
    detail: [
      '1. このサイトの「商品管理」タブを開く（下のボタン）。',
      '2. 右上の「＋ 新規商品」ボタンを押し、タイトル・本文・価格・SKU・タグを入力。',
      '3. タグには ステップ① で決めた IP タグ（例: one-piece）と「PC」「ガジェット」「グッズ」のいずれかを必ず入れる。タグが正しく入ると自動コレクションが拾う。',
      '4. ステータス = ACTIVE で保存。',
      '5. 保存後、商品詳細編集画面の「Variants」タブからバリエーション（メモリ違い等）の在庫数や価格をその場で編集できる。',
    ],
    cautions: [
      'PC 製品は「PC」または「ゲーミング」タグが必須（なければ商品ページのカスタマイズプルダウンが出ない）。',
      '画像は商品詳細画面でアップロード。Shopify CDN に保存される。ローカルファイルは禁止。',
    ],
    links: [
      {
        label: '商品管理タブを開く',
        type: 'admin',
        target: 'products',
        description: '＋新規商品 から登録、行クリックで Variants 編集',
      },
      {
        label: 'Shopify で商品を直接作る',
        type: 'shopify',
        target: '/products/new',
      },
    ],
  },
  {
    id: 'step3-link',
    emoji: '③',
    title: 'コラボ IP と商品を紐付ける（タグ付与の確認）',
    summary: 'タグが正しければ自動コレクションが拾う。管理画面の「コレクション」タブで件数を確認するだけ。',
    detail: [
      '1. ステップ② で付けたタグが、ステップ① のコレクション条件と一致しているか確認する。',
      '2. 管理画面「コレクション」タブを開き、対象コレクションの行で productsCount が期待通り増えていれば成功。',
      '3. もし増えていない場合は、「商品管理」タブで対象商品のタグを修正するか、「コレクション」タブで該当コレクションの編集モーダルを開いてルール条件（タグ名のスペル）を見直す。',
      '4. 大量に追加する場合は、「タグ一括編集」タブから複数商品にタグを同時付与できる。',
    ],
    cautions: [
      '「自動コレクション」のチェックを外すと自動拾いが効かなくなる。基本は「自動 + タグ条件」で運用する。',
    ],
    links: [
      {
        label: 'コレクションタブを開く',
        type: 'admin',
        target: 'collections',
        description: 'コレクション一覧と各コレクションの商品件数を確認',
      },
      {
        label: 'タグ一括編集タブを開く',
        type: 'admin',
        target: 'bulkTags',
        description: '複数商品に同じタグを一発付与／除去',
      },
      {
        label: '商品管理タブを開く',
        type: 'admin',
        target: 'products',
        description: '個別商品のタグを編集',
      },
    ],
  },
  {
    id: 'step4-banner',
    emoji: '④',
    title: 'トップページの IP コラボバナー一覧に追加する',
    summary: '管理画面「ページ編集」→「IPコラボ」サブタブで、新コレクションをトップページのコラボグリッドに登録する。',
    detail: [
      '1. 「ページ編集」タブを開き、左ペインで「IPコラボ」を選ぶ（下のボタンで直接遷移できる）。',
      '2. 「＋ 新規追加」を押し、表示名／ Shopify コレクションハンドル（ステップ①で控えたもの）／表示順／ ACTIVE フラグ を入力。',
      '3. 画像を指定しなくても、コレクションに登録した画像が自動で出る（フォールバック動作）。手動で別画像を指定したい場合のみ image_url を入れる。',
      '4. 保存して、右ペインのライブプレビューに反映されるのを確認。',
      '5. 同様に「ヒーローバナー」「カラーモデル」などのサブタブからも、必要に応じてトップ表示を編集できる。',
    ],
    cautions: [
      '表示順 (display_order) は小さい数字ほど左／上に出る。先頭固定したい IP は 0 〜 9 を、後ろは 90 以降を使うとゆとりが残る。',
      'is_active = false にすると即非表示になる。期間限定コラボの掲載終了に使える。',
    ],
    links: [
      {
        label: 'ページ編集 → IPコラボ',
        type: 'admin',
        target: 'pageEditor',
        extraQuery: {sub: 'ip_banners'},
      },
      {
        label: 'ページ編集 → ヒーローバナー',
        type: 'admin',
        target: 'pageEditor',
        extraQuery: {sub: 'hero_banners'},
      },
      {
        label: 'ページ編集 → ビジュアル編集（実画面プレビュー）',
        type: 'admin',
        target: 'pageEditor',
        extraQuery: {sub: 'visual_edit'},
      },
    ],
  },
  {
    id: 'step5-customization',
    emoji: '⑤',
    title: 'PC 商品のカスタマイズプルダウン（メモリ・SSD等）を整える',
    summary: 'PC のパーツ選択肢は「ページ編集」→「カスタマイズマトリックス」から CRUD する。',
    detail: [
      '1. 「ページ編集」タブ →「カスタマイズマトリックス」サブタブを開く。',
      '2. プルダウンの 1 行 = 1 オプション項目（例: メモリ、SSD、電源）。「＋ 新規追加」で追加できる。',
      '3. 各項目に「choices_json」で選択肢配列（value/label）を入れる。label に「+¥35,000」のように入れると、自動で追加金額がカートに反映される。',
      '4. 「applies_to_tags」に商品タグ（例: pc, gaming）を入れると、そのタグを持つ商品だけにこのプルダウンが出る。空欄なら全 PC 商品共通。',
      '5. 表示順 (display_order) で並び順を制御。',
      '6. 保存後、新製品の商品詳細ページを開き、「パーツカスタマイズ」セクションに正しい選択肢が出るか確認する。',
    ],
    cautions: [
      'Metaobject に 1 件も登録がない場合は、ハードコードされた標準オプション（メモリ／ SSD ×2 ／ HDD ／電源 …の 17 項目）が表示される。完全置き換えしたい場合は Metaobject 側で全項目を作る必要がある。',
      'カートに追加金額が反映されるのは label 内の「+¥xxx,xxx」表記をパースしているため。表記揺れ（¥ がない、半角と全角が混在）に注意。',
    ],
    links: [
      {
        label: 'ページ編集 → カスタマイズマトリックス',
        type: 'admin',
        target: 'pageEditor',
        extraQuery: {sub: 'customization_matrix'},
      },
    ],
  },
  {
    id: 'step6-verify',
    emoji: '⑥',
    title: '公開ページで実際に確認する（カート → チェックアウトまで）',
    summary: 'ECサイトを開いて、トップ → IP コラボ → 商品詳細 → カート追加 → チェックアウト遷移までを目視確認。',
    detail: [
      '1. 下のボタンで本番サイトのトップを開く。',
      '2. 新コラボのバナーがコラボグリッドに表示されているか確認。',
      '3. バナーをクリック → コレクションページに新製品が並んでいるか確認。',
      '4. 新製品をクリック → 商品詳細ページが正しく表示されるか、カスタマイズプルダウンが期待どおりに出るか確認。',
      '5. 「カートに追加」 → 右上のカートアイコンを開き、追加金額（カスタマイズ分）が合算されているか確認。',
      '6. 「チェックアウトへ進む」を押して、shop.mining-base.co.jp/checkouts/... に遷移すれば成功。決済まで完了する必要はない。',
    ],
    cautions: [
      '画像が出ない場合は、Shopify 側のコレクション画像未設定 or 商品画像未アップロードが原因。',
      'カスタマイズが出ない場合は、商品タグに pc/gaming が無いか、Metaobject の applies_to_tags 設定がずれている。',
    ],
    links: [
      {
        label: '本番サイト トップを開く',
        type: 'site',
        target: '/',
      },
      {
        label: '本番サイト 全コレクション一覧',
        type: 'site',
        target: '/collections',
      },
    ],
  },
];

// ── スタイル ──
const cardStyle: React.CSSProperties = {
  background: color.bg1,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  padding: space[6],
  marginBottom: space[5],
};

// ── Main Component ──
export default function AdminOnboarding() {
  const [, setSearchParams] = useSearchParams();
  const [done, setDone] = useState<Record<string, boolean>>({});
  /** 明示的に開いている step id (user が toggle したもの)。null なら自動挙動に任せる。 */
  const [openId, setOpenId] = useState<string | null>(null);
  /** ステップ DOM への ref — 完了時の scrollIntoView 用 */
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // localStorage から進捗ロード
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHECKLIST_KEY);
      if (raw) {
        setDone(JSON.parse(raw) as Record<string, boolean>);
      }
    } catch {
      /* ignore */
    }
  }, []);

  /** 自動開閉: 最初の未完了ステップを既定で開く (user が明示操作していれば尊重) */
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
        } catch {
          /* ignore */
        }
        return next;
      });
      // 完了にマークされた場合、次ステップへ自動スクロール (Apple Wallet 流)
      if (!done[id]) {
        const currentIdx = STEPS.findIndex((s) => s.id === id);
        const nextStep = STEPS.slice(currentIdx + 1).find((s) => !done[s.id]);
        if (nextStep) {
          setOpenId(nextStep.id);
          requestAnimationFrame(() => {
            stepRefs.current[nextStep.id]?.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });
          });
        }
      }
    },
    [done],
  );

  const toggleOpen = useCallback((id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  const goAdmin = useCallback(
    (target: string, extra?: Record<string, string>) => {
      const params: Record<string, string> = {tab: target};
      if (extra) Object.assign(params, extra);
      setSearchParams(params);
      try {
        window.scrollTo({top: 0, behavior: 'smooth'});
      } catch {
        /* ignore */
      }
    },
    [setSearchParams],
  );

  const completedCount = useMemo(
    () => STEPS.filter((s) => done[s.id]).length,
    [done],
  );

  return (
    <div style={{maxWidth: 1100, margin: '0 auto'}}>
      {/* イントロ */}
      <div style={{...cardStyle, background: color.bg2}}>
        <div style={{display: 'flex', alignItems: 'center', gap: space[3], marginBottom: space[2]}}>
          <div style={{fontSize: 28}} aria-hidden="true">🚀</div>
          <h2 style={{margin: 0, fontSize: 22, fontWeight: 800, color: color.text}}>
            出品ガイド — 新コラボから販売開始まで
          </h2>
        </div>
        <p style={{margin: `${space[1]} 0 ${space[4]}`, color: color.textMuted, fontSize: font.base, lineHeight: 1.7}}>
          このページは、エンジニアでない CEO が「新しい IP コラボを始めて、新製品を販売できる状態」にするまでの
          手順を、すべて順番に並べたものです。現在のステップが自動で開き、完了にチェックすると次のステップへ進みます
          （進捗はこのブラウザにのみ保存）。
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: space[4],
            padding: `${space[3]} ${space[4]}`,
            background: color.bg0,
            borderRadius: radius.md,
            border: `1px solid ${color.border}`,
          }}
          role="group"
          aria-label="出品ガイド進捗"
        >
          <div style={{fontSize: font.sm, fontWeight: font.bold, color: color.text}}>進捗</div>
          <div
            style={{
              flex: 1,
              height: 8,
              background: color.bg1,
              borderRadius: 4,
              overflow: 'hidden',
            }}
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
      </div>

      {/* ステップ一覧 (accordion) */}
      {STEPS.map((step) => {
        const isDone = !!done[step.id];
        const isOpen = currentOpenId === step.id;
        return (
          <div
            key={step.id}
            ref={(el) => {
              stepRefs.current[step.id] = el;
            }}
            style={{
              ...cardStyle,
              padding: 0,
              overflow: 'hidden',
              borderLeft: `4px solid ${isDone ? color.green : isOpen ? color.cyan : color.border}`,
              opacity: isDone && !isOpen ? 0.75 : 1,
            }}
          >
            {/* アコーディオンヘッダー (クリックで開閉) */}
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
                padding: `${space[4]} ${space[6]}`,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: font.family,
              }}
            >
              {/* 完了トグル — クリックはバブリングさせない */}
              <span
                role="checkbox"
                aria-checked={isDone}
                aria-label={isDone ? `${step.title} を未完了に戻す` : `${step.title} を完了にする`}
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDone(step.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleDone(step.id);
                  }
                }}
                style={{
                  flexShrink: 0,
                  width: 28,
                  height: 28,
                  borderRadius: radius.sm,
                  border: `2px solid ${isDone ? color.green : color.border}`,
                  background: isDone ? color.green : 'transparent',
                  color: '#000',
                  cursor: 'pointer',
                  fontSize: 18,
                  fontWeight: 900,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: font.family,
                  transition: 'all .15s',
                }}
              >
                {isDone ? '✓' : ''}
              </span>
              <div style={{flex: 1}}>
                <div
                  style={{
                    fontSize: font.xs,
                    fontWeight: font.bold,
                    color: isDone ? color.green : color.cyan,
                    letterSpacing: 2,
                    marginBottom: 4,
                  }}
                >
                  STEP {step.emoji}{isDone ? ' 完了' : isOpen ? ' 進行中' : ''}
                </div>
                <h3 style={{margin: 0, fontSize: font.md, fontWeight: 800, color: color.text}}>
                  {step.title}
                </h3>
                {!isOpen && (
                  <p style={{margin: `${space[1]} 0 0`, fontSize: font.sm, color: color.textMuted, lineHeight: 1.6}}>
                    {step.summary}
                  </p>
                )}
              </div>
              {/* chevron */}
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: 24,
                  height: 24,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: color.textMuted,
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform .2s',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </button>

            {/* アコーディオン本体 */}
            {isOpen && (
              <div
                id={`${step.id}-body`}
                style={{
                  padding: `0 ${space[6]} ${space[5]}`,
                  borderTop: `1px solid ${color.border}`,
                  marginTop: 0,
                }}
              >
                {/* 概要 (開いた時に正式表示) */}
                <p style={{margin: `${space[4]} 0`, fontSize: font.base, color: color.textSecondary, lineHeight: 1.7}}>
                  {step.summary}
                </p>

                {/* 手順詳細 */}
                <div style={{marginBottom: space[4]}}>
                  <div
                    style={{
                      fontSize: font.xs,
                      fontWeight: font.bold,
                      color: color.textMuted,
                      letterSpacing: 1,
                      marginBottom: space[2],
                    }}
                  >
                    手順
                  </div>
                  <ol
                    style={{
                      margin: 0,
                      paddingLeft: space[5],
                      fontSize: font.sm,
                      color: color.text,
                      lineHeight: 1.8,
                    }}
                  >
                    {step.detail.map((line, i) => (
                      <li key={i} style={{marginBottom: space[1]}}>
                        {line.replace(/^\d+\.\s*/, '')}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* 注意事項 */}
                {step.cautions && step.cautions.length > 0 && (
                  <div
                    style={{
                      marginBottom: space[4],
                      padding: `${space[3]} ${space[4]}`,
                      background: 'rgba(255, 200, 0, 0.06)',
                      border: '1px solid rgba(255, 200, 0, 0.2)',
                      borderRadius: radius.md,
                    }}
                  >
                    <div
                      style={{
                        fontSize: font.xs,
                        fontWeight: font.bold,
                        color: '#ffb84d',
                        letterSpacing: 1,
                        marginBottom: space[2],
                      }}
                    >
                      <span aria-hidden="true">⚠️ </span>注意
                    </div>
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: space[4],
                        fontSize: font.sm,
                        color: color.text,
                        lineHeight: 1.7,
                      }}
                    >
                      {step.cautions.map((c, i) => (
                        <li key={i} style={{marginBottom: space[1]}}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* リンクボタン群 */}
                <div
                  style={{
                    display: 'flex',
                    gap: space[2],
                    flexWrap: 'wrap',
                  }}
                >
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
                    const titleText = link.type === 'shopify'
                      ? 'Shopify 管理画面（別タブ）'
                      : '本番サイト（別タブ）';
                    const variant: 'ghost' | 'secondary' = link.type === 'shopify' ? 'ghost' : 'secondary';
                    return (
                      <a
                        key={i}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={titleText}
                        style={linkButtonStyle(variant)}
                        onMouseEnter={(e) => {
                          const hoverBg = variant === 'secondary' ? color.cyanDim : 'rgba(255,255,255,.06)';
                          (e.currentTarget as HTMLAnchorElement).style.background = hoverBg;
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
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

      {/* フッター */}
      <div
        style={{
          ...cardStyle,
          background: color.bg0,
          textAlign: 'center',
          padding: space[4],
        }}
      >
        <div style={{fontSize: font.sm, color: color.textMuted, lineHeight: 1.7}}>
          困ったら「<span aria-hidden="true">📍 </span>サイトマップ」サブタブで「どの画面にどの管理画面が対応しているか」を確認できます。
          <br />
          ビジュアル編集（実画面プレビューの上で直接編集）は「ページ編集」→「ビジュアル編集」サブタブから。
        </div>
      </div>
    </div>
  );
}
