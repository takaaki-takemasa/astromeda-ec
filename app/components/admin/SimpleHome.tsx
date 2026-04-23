/**
 * SimpleHome — 高校生でも運営できる「ライフサイクル順」のホーム画面
 *
 * 2026-04-22 patch 0119: Apple CEO 視点での順序修正。
 *   CEO 指令「ユーザーが来てくれたところから発送完了まで高校生まで
 *   すべて簡潔にわかるようになっているのか」を受けた構造修正。
 *
 *   patch 0118 で 6 カード化したが順序が業務ライフサイクルに沿って
 *   いなかった（売上を AI/緊急 の前に置く等）。
 *   patch 0119 で 7 カードに拡張し、自然な業務フロー順に並び替え：
 *     1. 今日やる事を見る（朝のエントリ）
 *     2. 商品を準備する（商品準備）
 *     3. お客さまを呼び込む（集客・宣伝）
 *     4. 注文を受ける・発送する（受注・出荷）★新設
 *     5. お店の見た目と説明を整える（接客）
 *     6. 売上を分析・改善する（経営）
 *     7. AI・困った時・上級者（運用補助）
 *
 *   注文・発送カードは現状 admin に独立タブが無いため、Shopify Admin
 *   の Orders/Fulfillment への外部リンク（externalUrl）を提供する。
 *   高校生が「お客さまから注文が入ったらどこで処理するか」を迷わず
 *   到達できるようにする。
 *
 * 詳細監査: 市場調査/admin_apple_ceo_lifecycle_audit_2026-04-22.md
 *
 * 設計原則（patch 0118 から継承）:
 * 1. 専門用語ゼロ
 * 2. ライフサイクルに沿ったタスク中心
 * 3. 1 カード = 1 業務フェーズ、各カード内 3-6 個の具体アクション
 * 4. アクション = 1 クリックで目的タブ or 外部 Shopify ページへ遷移
 * 5. 「上級者モード」カードから既存 22 タブ全部に行ける（エスケープハッチ）
 */

import { color, font, radius } from '~/lib/design-tokens';

interface ActionItem {
  /** 業務語のラベル（中学生でも理解できる） */
  label: string;
  /** クリック時に飛ばす admin tab パラメータ (?tab=xxx)。externalUrl があれば無視 */
  tab?: string;
  /** 外部リンク（Shopify Admin など）。指定されたら新規タブで開く */
  externalUrl?: string;
  /** クリック時にさらにサブタブやセクションを設定したいとき */
  extraQuery?: Record<string, string>;
  /** ホバー時のヒント */
  hint?: string;
}

interface CardDef {
  emoji: string;
  title: string;
  description: string;
  actions: ActionItem[];
  /** カードの上部色アクセント */
  accent: string;
}

// Shopify Admin の本番ストア URL（受注・出荷タブの欠落を補う外部リンク）
const SHOPIFY_ADMIN_BASE = 'https://admin.shopify.com/store/production-mining-base';

const CARDS: CardDef[] = [
  // ── 1. 今日やる事を見る（朝のエントリ）──
  {
    emoji: '🚀',
    title: '今日やる事を見る',
    description: 'ログインしたらまずここ。今日の売上と次にやる事を確認します',
    accent: color.cyan,
    actions: [
      { label: '🚀 出品ガイド（次にやる事を案内）', tab: 'onboarding', hint: '商品を売り出すまでの手順をステップで表示' },
      { label: '📈 売上ダッシュボード', tab: 'summary', hint: '今日・今週・今月・今年の売上を一覧表示' },
      { label: '🗺️ サイトマップ（お店の全体像）', tab: 'siteMap', hint: 'お店の全ページの一覧を確認' },
    ],
  },

  // ── 2. 商品を準備する（商品準備フェーズ）──
  {
    emoji: '🛍️',
    title: '商品を準備する',
    description: 'お客さまに売る商品を作ります。色・サイズなどのプルダウンもここで設定',
    accent: '#FFD700',
    actions: [
      { label: '➕ 新しい商品を追加する', tab: 'products', hint: '商品名・写真・価格を入力して新商品を登録します' },
      { label: '✏️ 既存の商品を直す', tab: 'products', hint: '商品の説明や価格を編集します' },
      { label: '🎨 色・キーボード配列などプルダウンを作る', tab: 'customization', hint: 'プルダウンで選べるプルダウンの設定です' },
      { label: '📚 商品をジャンルでまとめる', tab: 'collections', hint: 'コレクション = 商品をジャンル別にまとめる箱' },
      { label: '🏷️ たくさんの商品にラベルを一気に付ける', tab: 'bulkTags', hint: 'タグを一括で付けたり外したりできます' },
    ],
  },

  // ── 3. お客さまを呼び込む（集客・宣伝フェーズ）──
  {
    emoji: '📣',
    title: 'お客さまを呼び込む',
    description: 'バナー・SNS・セールでお客さまをお店に呼び込みます',
    accent: '#FF6EC7',
    actions: [
      { label: '🏠 トップページの宣伝バナーを変える', tab: 'pageEditor', hint: 'お客様が最初に見るバナー画像とリンク先を設定' },
      { label: '🎟️ セール価格を決める', tab: 'discounts', hint: '割引コードや期間限定セールを設定します' },
      { label: '📣 キャンペーンを作る', tab: 'marketing', hint: 'マーケ施策の作成と効果測定' },
      { label: '📁 写真や動画を入れ替える', tab: 'files', hint: 'バナー画像や商品写真をまとめて管理します' },
      { label: '🧭 お客様向けの道案内（メニュー）を変える', tab: 'menus', hint: 'ヘッダー・フッターのメニュー項目を編集します' },
      { label: '🔀 お引っ越ししたページの転送を設定', tab: 'redirects', hint: '古い URL から新しい URL に自動でジャンプさせます' },
    ],
  },

  // ── 4. 注文を受ける・発送する（受注・出荷フェーズ）★patch 0119 で新設 ──
  {
    emoji: '📦',
    title: '注文を受ける・発送する',
    description: 'お客さまから注文が入ったらここから配送までを管理（Shopify を開きます）',
    accent: '#7FFF00',
    actions: [
      {
        label: '📋 注文一覧を見る（Shopify を開く）',
        externalUrl: `${SHOPIFY_ADMIN_BASE}/orders`,
        hint: '入った注文の一覧を Shopify で確認します（新規タブで開きます）',
      },
      {
        label: '🚚 配送・発送する（Shopify を開く）',
        externalUrl: `${SHOPIFY_ADMIN_BASE}/orders?fulfillment_status=unfulfilled`,
        hint: '未発送の注文を Shopify で処理します（新規タブで開きます）',
      },
      {
        label: '🙋 お客さま情報を見る（Shopify を開く）',
        externalUrl: `${SHOPIFY_ADMIN_BASE}/customers`,
        hint: '購入してくださったお客さまの一覧を Shopify で確認します',
      },
      {
        label: '📊 在庫を確認する（Shopify を開く）',
        externalUrl: `${SHOPIFY_ADMIN_BASE}/products/inventory`,
        hint: '商品の在庫数を Shopify で確認・調整します',
      },
    ],
  },

  // ── 5. お店の見た目と説明を整える（接客フェーズ）──
  {
    emoji: '🎨',
    title: 'お店の見た目と説明を整える',
    description: 'トップページや「会社情報」「保証」などの説明ページを直します',
    accent: '#FF8C00',
    actions: [
      { label: '✏️ お店の見た目を変える（ページ編集）', tab: 'pageEditor', hint: 'トップページや特集ページの編集' },
      { label: '📄 説明ページを直す（保証・会社案内 など）', tab: 'content', hint: '保証ページや会社案内などの固定ページを編集' },
      { label: '⚙️ お店の基本情報（屋号・連絡先）を変える', tab: 'siteConfig', hint: 'お店の名前や住所などの基本情報を編集' },
    ],
  },

  // ── 6. 売上を分析・改善する（経営フェーズ）──
  {
    emoji: '📊',
    title: '売上を分析・改善する',
    description: '売上・お客さまのデータを見て、次の打ち手を考えます',
    accent: '#A0FF6E',
    actions: [
      { label: '📈 詳しいデータ分析を見る', tab: 'analytics', hint: '上級者向けの詳細データ分析' },
      { label: '📣 キャンペーンの効果を確認', tab: 'marketing', hint: 'マーケ施策の成果を一覧表示' },
      { label: '🗺️ サイトマップ（お店の全体像）', tab: 'siteMap', hint: 'お店の全ページの一覧を確認' },
    ],
  },

  // ── 7. AI・困った時・上級者（運用補助）──
  {
    emoji: '🛠️',
    title: 'AI・困った時・上級者',
    description: 'AI スタッフの状態確認、緊急停止、データの設計図など（普段は触りません）',
    accent: '#9E9E9E',
    actions: [
      { label: '🤖 AI スタッフが今やっている事を見る', tab: 'agents', hint: 'AI エージェントの稼働状況' },
      { label: '⚙️ 自動化（パイプライン）の状況を見る', tab: 'pipelines', hint: 'AI が自動で動かしている業務フロー' },
      { label: '🚨 AI を全部止める（緊急停止）', tab: 'control', hint: '何かおかしい時は AI を一旦すべて止められます' },
      { label: '🧬 データの設計図（CMS 定義）', tab: 'metaobjectDefs', hint: '上級者向け: Metaobject の項目を直接編集' },
      { label: '🔧 バージョン・更新（上級者）', tab: 'update', hint: 'システム更新やバージョン情報' },
    ],
  },
];

interface SimpleHomeProps {
  /** 親 admin._index.tsx の handleTabChange を渡す */
  onNavigateTab: (tab: string) => void;
}

export function SimpleHome({ onNavigateTab }: SimpleHomeProps) {
  return (
    <div style={{ padding: 0 }}>
      <header style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: color.text,
            margin: '0 0 8px 0',
            fontFamily: font.family,
          }}
        >
          こんにちは。今日は何をしますか？
        </h1>
        <p
          style={{
            fontSize: 14,
            color: color.textMuted,
            margin: 0,
            fontFamily: font.family,
          }}
        >
          下のカードは「お店の 1 日の流れ」の順に並んでいます。
          上から順に見ていけば、お客さまを呼び込んで→注文を受けて→発送するまでが分かります。
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: 16,
        }}
      >
        {CARDS.map((card, idx) => (
          <SimpleCard
            key={card.title}
            card={card}
            stepNumber={idx + 1}
            onNavigateTab={onNavigateTab}
          />
        ))}
      </div>

      <footer
        style={{
          marginTop: 32,
          padding: 16,
          background: color.bg1,
          borderRadius: radius.md,
          border: `1px solid ${color.border}`,
          fontSize: 12,
          color: color.textMuted,
          lineHeight: 1.6,
          fontFamily: font.family,
        }}
      >
        💡 <strong>使い方のコツ</strong>: 左のサイドバーからも全機能に入れます。
        どこにいるか分からなくなったら、画面上部の「ホーム」をクリックすればここに戻ってきます。
        「📦 注文を受ける・発送する」のリンクは Shopify の管理画面を新しいタブで開きます。
      </footer>
    </div>
  );
}

// ── カード本体 ──

function SimpleCard({
  card,
  stepNumber,
  onNavigateTab,
}: {
  card: CardDef;
  stepNumber: number;
  onNavigateTab: (tab: string) => void;
}) {
  const handleClick = (action: ActionItem) => {
    if (action.externalUrl) {
      window.open(action.externalUrl, '_blank', 'noopener,noreferrer');
    } else if (action.tab) {
      onNavigateTab(action.tab);
    }
  };

  return (
    <section
      aria-label={`ステップ ${stepNumber}: ${card.title}`}
      style={{
        background: color.bg1,
        border: `1px solid ${color.border}`,
        borderTop: `3px solid ${card.accent}`,
        borderRadius: radius.lg,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: card.accent,
            marginBottom: 4,
            fontFamily: font.family,
            letterSpacing: '0.05em',
          }}
        >
          ステップ {stepNumber}
        </div>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: color.text,
            margin: '0 0 4px 0',
            fontFamily: font.family,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 22 }}>
            {card.emoji}
          </span>
          {card.title}
        </h2>
        <p
          style={{
            fontSize: 12,
            color: color.textMuted,
            margin: 0,
            fontFamily: font.family,
          }}
        >
          {card.description}
        </p>
      </div>

      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {card.actions.map((action) => (
          <li key={action.label}>
            <button
              type="button"
              onClick={() => handleClick(action)}
              title={action.hint}
              aria-label={action.label}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                background: 'transparent',
                border: `1px solid transparent`,
                borderRadius: radius.md,
                color: color.text,
                fontSize: 13,
                fontFamily: font.family,
                cursor: 'pointer',
                transition: 'all .15s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = color.bg2;
                e.currentTarget.style.borderColor = card.accent;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'transparent';
              }}
            >
              <span>{action.label}</span>
              {action.externalUrl && (
                <span
                  aria-hidden="true"
                  style={{ fontSize: 11, color: color.textMuted, flexShrink: 0 }}
                >
                  ↗
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default SimpleHome;
