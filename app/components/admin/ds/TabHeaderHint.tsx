/**
 * TabHeaderHint — 各 admin タブの先頭に置く「このタブで何ができるか」1 行説明
 *
 * 2026-04-22: CEO 指摘「中学生、高校生にわかるような管理画面なのか」を受けた
 * 「このタブで何ができるか」を業務語で 1 行で示す統一プリミティブ。
 *
 * patch 0120 (2026-04-23): CEO 指摘「タブ内の戻る画面がない」「遷移先からの戻り方
 * がわからない」を受けて relatedTabs を React Router <Link> 化。
 * onNavigateTab prop を一切渡さなくても `/admin?tab=<name>` への soft navigation
 * で自動遷移する（22 タブ全てにプロップ配線をする手間を省きながら相互ジャンプ機能を実現）。
 *
 * 各 admin タブは内部用語（CMS 定義 / リダイレクト / カスタマイズ など）を
 * タブ名に持つが、開いた瞬間に「これは○○するための場所」と業務語で説明する。
 *
 * ## 使い方
 * ```tsx
 * import { TabHeaderHint } from '~/components/admin/ds/TabHeaderHint';
 *
 * export default function AdminCustomization() {
 *   return (
 *     <>
 *       <TabHeaderHint
 *         title="お客様が選べるプルダウン"
 *         description="商品ページに表示される「色を選ぶ」「キーボード配列を選ぶ」などの
 *           プルダウンを作るタブです。"
 *         relatedTabs={[
 *           {label: '商品管理', tab: 'products'},
 *           {label: 'タグ一括編集', tab: 'bulkTags'},
 *         ]}
 *       />
 *       {/_ 既存 UI _/}
 *     </>
 *   );
 * }
 * ```
 */

import { Link } from 'react-router';
import { color, font, radius } from '~/lib/design-tokens';

interface RelatedTab {
  label: string;
  tab: string;
}

interface TabHeaderHintProps {
  /** 業務語のタイトル（タブ名の専門用語を翻訳した版） */
  title: string;
  /** このタブで何ができるかの 1-2 行説明 */
  description: string;
  /** 関連するタブへの導線 */
  relatedTabs?: RelatedTab[];
  /**
   * 親 admin の handleTabChange (互換用)。
   * patch 0120 以降は省略可。指定しなければ Link で `/admin?tab=<name>` に soft nav。
   * 既存 SimpleHome 等の特殊な遷移ロジックが必要な呼び出し元のために残す。
   */
  onNavigateTab?: (tab: string) => void;
}

export function TabHeaderHint({
  title,
  description,
  relatedTabs,
  onNavigateTab,
}: TabHeaderHintProps) {
  return (
    <aside
      role="region"
      aria-label={`${title} の説明`}
      style={{
        marginBottom: 16,
        padding: '12px 16px',
        background: color.bg1,
        border: `1px solid ${color.border}`,
        borderLeft: `3px solid ${color.cyan}`,
        borderRadius: radius.md,
        fontFamily: font.family,
      }}
    >
      {/* patch 0131 (2026-04-23): CEO 指摘「H1/H2 が無い」を受け h2 化。
          スクリーンリーダー読み上げと Apple/Stripe 水準の文書構造のため。
          既存スタイル (13px/600) は維持して見た目は変えない。 */}
      <h2
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 600,
          color: color.text,
          marginBottom: 4,
          lineHeight: 1.3,
          fontFamily: font.family,
        }}
      >
        💡 {title}
      </h2>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: color.textMuted,
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
      {relatedTabs && relatedTabs.length > 0 && (
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            fontSize: 11,
            color: color.textMuted,
            alignItems: 'center',
          }}
        >
          <span>関連タブ →</span>
          {relatedTabs.map((rt) => {
            const baseStyle: React.CSSProperties = {
              display: 'inline-block',
              padding: '3px 10px',
              background: 'transparent',
              border: `1px solid ${color.border}`,
              borderRadius: radius.sm,
              color: color.cyan,
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: font.family,
              textDecoration: 'none',
              lineHeight: 1.4,
            };
            // 互換用 onNavigateTab が渡された場合は button + handler でそれを優先
            if (onNavigateTab) {
              return (
                <button
                  key={rt.tab}
                  type="button"
                  onClick={() => onNavigateTab(rt.tab)}
                  style={baseStyle}
                  aria-label={`${rt.label} タブを開く`}
                >
                  {rt.label}
                </button>
              );
            }
            // patch 0120: prop なしでも自動でタブ遷移できる
            return (
              <Link
                key={rt.tab}
                to={`/admin?tab=${encodeURIComponent(rt.tab)}`}
                style={baseStyle}
                aria-label={`${rt.label} タブを開く`}
              >
                {rt.label}
              </Link>
            );
          })}
        </div>
      )}
    </aside>
  );
}

export default TabHeaderHint;
