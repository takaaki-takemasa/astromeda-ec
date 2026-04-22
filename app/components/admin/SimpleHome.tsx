/**
 * SimpleHome — 中学生・高校生でも使える「やりたいこと中心」のホーム画面
 *
 * 2026-04-22: CEO 指摘「全部バラバラで設計するのか。中学生、高校生にわかるような
 * 管理画面なのかもう一度あなたに問います」を受けた構造的修正の中核。
 *
 * 既存 22 タブを破壊せず、上に「業務語の 6 カード」を被せる。
 * 各カードは既存の admin タブへ deep link する（壊さずに UX を被せる）。
 *
 * 設計原則:
 * 1. 専門用語ゼロ（カスタマイズ → 「お客様が選べる選択肢」など）
 * 2. タスク中心（「商品を売る」「お店の見た目を変える」など業務語）
 * 3. 1 カード = 1 業務領域、各カード内で 3-5 個の具体アクション
 * 4. アクション = 1 クリックで目的のタブへ遷移
 * 5. 「上級者モード」カードから既存の 22 タブ全部に行ける
 *
 * 詳細監査: 市場調査/admin_中学生UX_根本監査_2026-04-22.md
 */

import { useNavigate } from 'react-router';
import { color, font, radius } from '~/lib/design-tokens';

interface ActionItem {
  /** 業務語のラベル（中学生でも理解できる） */
  label: string;
  /** クリック時に飛ばす admin tab パラメータ (?tab=xxx) */
  tab: string;
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

const CARDS: CardDef[] = [
  {
    emoji: '🛒',
    title: '商品を売る',
    description: '新しい商品を作ったり、価格やセールを変えたりします',
    accent: color.cyan,
    actions: [
      { label: '➕ 新しい商品を追加する', tab: 'products', hint: '商品名・写真・価格を入力して新商品を登録します' },
      { label: '✏️ 既存の商品を直す', tab: 'products', hint: '商品の説明や価格を編集します' },
      { label: '🎨 お客様が選べる選択肢を作る（色・キーボード配列など）', tab: 'customization', hint: 'プルダウンで選べるオプションの設定です' },
      { label: '📚 商品をジャンルでまとめる', tab: 'collections', hint: 'コレクション = 商品をジャンル別にまとめる箱' },
      { label: '🎟️ セール価格を決める', tab: 'discounts', hint: '割引コードや期間限定セールを設定します' },
      { label: '🏷️ たくさんの商品にラベルを一気に付ける', tab: 'bulkTags', hint: 'タグを一括で付けたり外したりできます' },
    ],
  },
  {
    emoji: '🎨',
    title: 'お店の見た目を変える',
    description: 'トップページの宣伝や説明ページを更新します',
    accent: '#FF6EC7',
    actions: [
      { label: '🏠 トップページの宣伝バナーを変える', tab: 'pageEditor', hint: 'お客様が最初に見るバナー画像とリンク先を設定' },
      { label: '📄 「会社情報」「保証」などの説明ページを直す', tab: 'pageEditor', hint: '保証ページや会社案内などの固定ページを編集' },
      { label: '📁 写真や動画を入れ替える', tab: 'files', hint: 'バナー画像や商品写真をまとめて管理します' },
      { label: '🧭 お客様向けの道案内（メニュー）を変える', tab: 'menus', hint: 'ヘッダー・フッターのメニュー項目を編集します' },
      { label: '🔀 お引っ越ししたページの転送を設定する', tab: 'redirects', hint: '古い URL から新しい URL に自動でジャンプさせます' },
      { label: '⚙️ お店の基本情報（屋号・連絡先）を変える', tab: 'siteConfig', hint: 'お店の名前や住所などの基本情報を編集' },
    ],
  },
  {
    emoji: '📊',
    title: '売上・お客様を見る',
    description: '今日の売上や、何が売れているかを確認します',
    accent: '#A0FF6E',
    actions: [
      { label: '📈 売上ダッシュボード', tab: 'summary', hint: '今日・今週・今月・今年の売上を確認' },
      { label: '🚀 出品ガイド（次にやることを案内）', tab: 'onboarding', hint: '商品を売り出すまでの手順をステップで表示' },
      { label: '🗺️ サイトマップ（お店の全体像）', tab: 'siteMap', hint: 'お店の全ページの一覧を確認' },
      { label: '📣 キャンペーンの効果を見る', tab: 'marketing', hint: 'マーケ施策の成果を一覧表示' },
      { label: '📊 詳しいデータ分析を見る', tab: 'analytics', hint: '上級者向けの詳細データ分析' },
    ],
  },
  {
    emoji: '🤖',
    title: 'AI スタッフに任せる',
    description: 'AI が商品紹介文を書いたり、お客様対応を補助します',
    accent: '#FFD700',
    actions: [
      { label: '👀 AI スタッフが今やっている事を見る', tab: 'agents', hint: 'AI エージェントの稼働状況' },
      { label: '⚙️ 自動化（パイプライン）の状況を見る', tab: 'pipelines', hint: 'AI が自動で動かしている業務フロー' },
    ],
  },
  {
    emoji: '🚨',
    title: '困ったときの緊急対応',
    description: '何かおかしい時はここから AI を止めたり相談できます',
    accent: '#FF6E6E',
    actions: [
      { label: '🛑 AI を全部止める（緊急停止）', tab: 'control', hint: '何かおかしい時は AI を一旦すべて止められます' },
      { label: '📋 エラーログを見る', tab: 'control', hint: 'システムが何を記録しているか確認' },
    ],
  },
  {
    emoji: '⚙️',
    title: '上級者モード',
    description: '細かい設定が必要な時はここから（22 タブ全部に入れます）',
    accent: '#9E9E9E',
    actions: [
      { label: '🔧 設定（バージョン・更新）', tab: 'update', hint: 'システム更新やバージョン情報' },
      { label: '🧬 データの設計図（CMS 定義）', tab: 'metaobjectDefs', hint: '上級者向け: Metaobject の項目を直接編集' },
      { label: '📝 記事・CMS（古いタブ）', tab: 'content', hint: '将来的にページ編集タブと統合予定' },
      { label: '🏠 ホームページ（古いタブ）', tab: 'homepage', hint: '将来的にページ編集タブと統合予定' },
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
          下のカードからやりたいことを選んでください。それぞれ 1〜2 クリックで目的の画面に行けます。
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: 16,
        }}
      >
        {CARDS.map((card) => (
          <SimpleCard key={card.title} card={card} onNavigateTab={onNavigateTab} />
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
        専門用語が出てきたら「上級者モード」のカードを開く必要は通常ありません。
      </footer>
    </div>
  );
}

// ── カード本体 ──

function SimpleCard({
  card,
  onNavigateTab,
}: {
  card: CardDef;
  onNavigateTab: (tab: string) => void;
}) {
  return (
    <section
      aria-label={card.title}
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
              onClick={() => onNavigateTab(action.tab)}
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
              {action.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default SimpleHome;
