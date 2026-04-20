/**
 * AdminOnboarding — 非エンジニア向け 出品ガイド (patch 0059)
 *
 * 「新IPコラボを開始する → 新製品を販売できる状態にする」までの
 * 全工程を、ステップ単位の navigation として可視化する。
 *
 * CEO（非エンジニア）が最初にここを開けば、どのタブに行って何を編集すれば
 * いいかが順番に分かる。各ステップに admin 内タブへのワンクリック導線と
 * Shopify 管理画面への外部リンクを併設。
 *
 * 進捗チェックは localStorage に保存（個人作業用メモ）。
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useSearchParams} from 'react-router';
import {color, font} from '~/lib/design-tokens';

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
      '4. 大量に追加する場合は、商品管理タブの一覧から複数選択してタグを一括付与する運用が早い（準備中の一括編集機能で対応予定）。',
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
        label: '商品管理タブを開く',
        type: 'admin',
        target: 'products',
        description: 'タグを確認・編集',
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
  borderRadius: 12,
  padding: 24,
  marginBottom: 20,
};

const buttonPrimary: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  background: color.cyan,
  color: '#000',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: font.family,
  textDecoration: 'none',
};

const buttonSecondary: React.CSSProperties = {
  ...buttonPrimary,
  background: 'transparent',
  color: color.cyan,
  border: `1px solid ${color.cyan}`,
};

const buttonExternal: React.CSSProperties = {
  ...buttonSecondary,
  color: color.textMuted,
  border: `1px solid ${color.border}`,
};

// ── Main Component ──
export default function AdminOnboarding() {
  const [, setSearchParams] = useSearchParams();
  const [done, setDone] = useState<Record<string, boolean>>({});

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

  const toggle = useCallback((id: string) => {
    setDone((prev) => {
      const next = {...prev, [id]: !prev[id]};
      try {
        window.localStorage.setItem(CHECKLIST_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const goAdmin = useCallback(
    (target: string, extra?: Record<string, string>) => {
      const params: Record<string, string> = {tab: target};
      if (extra) Object.assign(params, extra);
      setSearchParams(params);
      // 上にスクロール
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
        <div style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8}}>
          <div style={{fontSize: 28}}>🚀</div>
          <h2 style={{margin: 0, fontSize: 22, fontWeight: 800, color: color.text}}>
            出品ガイド — 新コラボから販売開始まで
          </h2>
        </div>
        <p style={{margin: '4px 0 16px', color: color.textMuted, fontSize: 14, lineHeight: 1.7}}>
          このページは、エンジニアでない CEO が「新しい IP コラボを始めて、新製品を販売できる状態」にするまでの
          手順を、すべて順番に並べたものです。各ステップのボタンを押すと、必要な編集画面に直接ジャンプできます。
          完了したらチェックを入れて、進捗を可視化できます（このブラウザにのみ保存）。
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '12px 16px',
            background: color.bg0,
            borderRadius: 8,
            border: `1px solid ${color.border}`,
          }}
        >
          <div style={{fontSize: 13, fontWeight: 700, color: color.text}}>進捗</div>
          <div
            style={{
              flex: 1,
              height: 8,
              background: color.bg1,
              borderRadius: 4,
              overflow: 'hidden',
            }}
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
          <div style={{fontSize: 13, fontWeight: 700, color: color.cyan, minWidth: 60, textAlign: 'right'}}>
            {completedCount} / {STEPS.length}
          </div>
        </div>
      </div>

      {/* ステップ一覧 */}
      {STEPS.map((step) => {
        const isDone = !!done[step.id];
        return (
          <div
            key={step.id}
            style={{
              ...cardStyle,
              borderLeft: `4px solid ${isDone ? color.green : color.cyan}`,
              opacity: isDone ? 0.7 : 1,
            }}
          >
            {/* タイトル + チェックボックス */}
            <div style={{display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12}}>
              <button
                onClick={() => toggle(step.id)}
                aria-label={isDone ? `${step.title} を未完了に戻す` : `${step.title} を完了にする`}
                style={{
                  flexShrink: 0,
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: `2px solid ${isDone ? color.green : color.border}`,
                  background: isDone ? color.green : 'transparent',
                  color: '#000',
                  cursor: 'pointer',
                  fontSize: 18,
                  fontWeight: 900,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: font.family,
                }}
              >
                {isDone ? '✓' : ''}
              </button>
              <div style={{flex: 1}}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: color.cyan,
                    letterSpacing: 2,
                    marginBottom: 4,
                  }}
                >
                  STEP {step.emoji}
                </div>
                <h3 style={{margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: color.text}}>
                  {step.title}
                </h3>
                <p style={{margin: 0, fontSize: 14, color: color.textMuted, lineHeight: 1.6}}>
                  {step.summary}
                </p>
              </div>
            </div>

            {/* 手順詳細 */}
            <div style={{marginLeft: 40, marginBottom: 12}}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: color.textMuted,
                  letterSpacing: 1,
                  marginBottom: 8,
                }}
              >
                手順
              </div>
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 20,
                  fontSize: 13,
                  color: color.text,
                  lineHeight: 1.8,
                }}
              >
                {step.detail.map((line, i) => (
                  <li key={i} style={{marginBottom: 4}}>
                    {line.replace(/^\d+\.\s*/, '')}
                  </li>
                ))}
              </ol>
            </div>

            {/* 注意事項 */}
            {step.cautions && step.cautions.length > 0 && (
              <div
                style={{
                  marginLeft: 40,
                  marginBottom: 12,
                  padding: '10px 14px',
                  background: 'rgba(255, 200, 0, 0.06)',
                  border: '1px solid rgba(255, 200, 0, 0.2)',
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: '#ffb84d',
                    letterSpacing: 1,
                    marginBottom: 6,
                  }}
                >
                  ⚠️ 注意
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 16,
                    fontSize: 12,
                    color: color.text,
                    lineHeight: 1.7,
                  }}
                >
                  {step.cautions.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* リンクボタン群 */}
            <div
              style={{
                marginLeft: 40,
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              {step.links.map((link, i) => {
                if (link.type === 'admin') {
                  return (
                    <button
                      key={i}
                      onClick={() => goAdmin(link.target, link.extraQuery)}
                      style={buttonPrimary}
                      title={link.description}
                    >
                      → {link.label}
                    </button>
                  );
                }
                if (link.type === 'shopify') {
                  return (
                    <a
                      key={i}
                      href={`${SHOPIFY_ADMIN_BASE}${link.target}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={buttonExternal}
                      title="Shopify 管理画面（別タブ）"
                    >
                      ↗ {link.label}
                    </a>
                  );
                }
                return (
                  <a
                    key={i}
                    href={`${SITE_BASE}${link.target}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={buttonSecondary}
                    title="本番サイト（別タブ）"
                  >
                    ↗ {link.label}
                  </a>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* フッター */}
      <div
        style={{
          ...cardStyle,
          background: color.bg0,
          textAlign: 'center',
          padding: 16,
        }}
      >
        <div style={{fontSize: 13, color: color.textMuted, lineHeight: 1.7}}>
          困ったら「📍 サイトマップ」サブタブで「どの画面にどの管理画面が対応しているか」を確認できます。
          <br />
          ビジュアル編集（実画面プレビューの上で直接編集）は「ページ編集」→「ビジュアル編集」サブタブから。
        </div>
      </div>
    </div>
  );
}
