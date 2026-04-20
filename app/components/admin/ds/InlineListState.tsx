/**
 * InlineListState primitive (patch 0074 / R1-2 polish)
 *
 * Admin の CRUD リストで頻出する 3 状態 (loading / empty / data) を 1 つに畳む。
 * Stripe Dashboard / Linear は「Spinner ぐるぐる」を禁じ、代わりにテーブル型 Skeleton と
 * CTA 付き EmptyState を使う。この primitive は:
 *
 * - loading=true → テーブル型 Skeleton (SkeletonRows)
 * - loading=false && items.length === 0 → EmptyState (icon + title + desc + CTA)
 * - それ以外 → children をそのまま描画
 *
 * 非エンジニアは「何も表示されない＝壊れた」と感じる。Skeleton は「形が見える」ことで
 * 作業中と認識でき、EmptyState は「次に何をすればいいか」が一目でわかる。
 *
 * 使い方:
 *   <InlineListState
 *     loading={loading}
 *     count={items.length}
 *     emptyIcon="📝"
 *     emptyTitle="記事はまだありません"
 *     emptyDescription="最初の記事を作成してみましょう。"
 *     emptyAction={<button onClick={() => openCreateModal()}>＋新しい記事を作る</button>}
 *   >
 *     <table>...</table>
 *   </InlineListState>
 */
import type {CSSProperties, ReactNode} from 'react';
import {SkeletonBar} from '~/components/admin/ds/Skeleton';
import {color, font, radius, space} from '~/lib/design-tokens';

export interface InlineListStateProps {
  /** データ取得中かどうか */
  loading: boolean;
  /** データ件数 (空状態判定用) */
  count: number;
  /** 空状態のアイコン (絵文字 or ReactNode)。省略可 */
  emptyIcon?: ReactNode;
  /** 空状態のタイトル (例: "記事はまだありません") */
  emptyTitle: string;
  /** 空状態の説明文 */
  emptyDescription?: string;
  /** 空状態の CTA (例: 「＋新規追加」ボタン)。省略可 */
  emptyAction?: ReactNode;
  /** Skeleton 行数 (既定 5) */
  skeletonRows?: number;
  /** data 表示時に描画する子要素 */
  children: ReactNode;
}

export function InlineListState({
  loading,
  count,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  skeletonRows = 5,
  children,
}: InlineListStateProps) {
  if (loading) {
    return <SkeletonRows rows={skeletonRows} />;
  }
  if (count === 0) {
    return (
      <EmptyCard
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }
  return <>{children}</>;
}

/**
 * AdminListSkeleton — テーブル型 Skeleton を単独で使う用の export。
 * 既存コードが `if (loading) return <div>読み込み中...</div>;` を使っている箇所を
 * `<AdminListSkeleton rows={5} />` に差し替える最小侵襲リファクタに使う。
 */
export function AdminListSkeleton({rows = 5}: {rows?: number}) {
  return <SkeletonRows rows={rows} />;
}

/**
 * AdminEmptyCard — CTA 付き空状態を単独で使う用の export。
 * 既存の「まだ〜ありません」プレーンテキストを置換する。
 */
export function AdminEmptyCard(props: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return <EmptyCard {...props} />;
}

/**
 * SkeletonRows — テーブル型 Skeleton の内部実装
 * 各行は「サムネ枠 + タイトル + メタ + 操作ボタン枠」の 4 カラム風。
 */
function SkeletonRows({rows}: {rows: number}) {
  const rowStyle: CSSProperties = {
    display: 'flex',
    gap: space[3],
    alignItems: 'center',
    padding: `${space[3]} 0`,
    borderBottom: `1px solid ${color.border}`,
  };
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="読み込み中"
      data-inline-list-state="loading"
      style={{padding: `${space[2]} 0`}}
    >
      {Array.from({length: rows}).map((_, i) => (
        <div key={i} style={rowStyle}>
          <SkeletonBar width="40px" height="40px" radius="8px" />
          <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: space[2]}}>
            <SkeletonBar width="35%" height="14px" />
            <SkeletonBar width="55%" height="12px" />
          </div>
          <SkeletonBar width="60px" height="24px" radius="6px" />
          <SkeletonBar width="70px" height="28px" radius="6px" />
        </div>
      ))}
      {/* SR 用テキスト (視覚的には非表示) */}
      <span style={{position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden'}}>
        読み込み中です。少々お待ちください。
      </span>
    </div>
  );
}

/**
 * EmptyCard — CTA 付き空状態。EmptyState.tsx の汎用版より
 * - 丸みと薄背景のカード
 * - アイコン大きめ
 * - action は primary button 前提の余白設計
 */
function EmptyCard({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: `${space[6]} ${space[4]}`,
    background: 'rgba(255,255,255,0.02)',
    border: `1px dashed ${color.border}`,
    borderRadius: radius.lg,
    minHeight: '180px',
  };
  const iconStyle: CSSProperties = {
    fontSize: '36px',
    lineHeight: 1,
    marginBottom: space[3],
    opacity: 0.8,
  };
  const titleStyle: CSSProperties = {
    margin: 0,
    fontSize: font.base,
    fontWeight: font.semibold,
    color: color.text,
  };
  const descStyle: CSSProperties = {
    margin: `${space[2]} 0 0`,
    fontSize: font.sm,
    color: color.textMuted,
    maxWidth: '420px',
    lineHeight: 1.6,
  };
  const actionStyle: CSSProperties = {
    marginTop: space[4],
  };
  return (
    <div role="status" aria-live="polite" data-inline-list-state="empty" style={cardStyle}>
      {icon ? <div aria-hidden="true" style={iconStyle}>{icon}</div> : null}
      <h4 style={titleStyle}>{title}</h4>
      {description ? <p style={descStyle}>{description}</p> : null}
      {action ? <div style={actionStyle}>{action}</div> : null}
    </div>
  );
}
