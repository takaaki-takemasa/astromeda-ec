/**
 * Breadcrumbs — 管理画面の現在位置パンくず
 *
 * patch 0048 (2026-04-19)  — Phase D: ナビ構造可視化
 *
 * Stripe/Apple/Linear いずれの管理画面も
 *   Home > Catalog > Products > Edit "Sirius 春モデル"
 * のパンくずがあり、深い階層に潜っても自分が今どこにいるかわかる。
 *
 * 現在の admin はタブ + サブタブ + Modal でしか位置を示しておらず、
 * Modal を開いた瞬間に「自分が今どのタブのどこを編集してるのか」が
 * 不明になる UX 事故が頻発する。
 *
 * このコンポーネントは GlobalBar 直下に表示する想定で、
 * tab/subTab 配列を渡すだけで自動的に path を組み立てる。
 *
 * Usage:
 *   <Breadcrumbs items={[
 *     {label: 'ホーム', onClick: () => setSection('home')},
 *     {label: 'コンテンツ', onClick: () => setSection('content')},
 *     {label: 'IPバナー'},
 *   ]} />
 */
import type {CSSProperties, ReactNode} from 'react';
import {Fragment} from 'react';
import {color, font, space} from '~/lib/design-tokens';

export interface BreadcrumbItem {
  label: ReactNode;
  /** クリック可能ならハンドラ。未指定なら現在地として強調 */
  onClick?: () => void;
  /** 別ページ遷移する場合の href */
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** style override */
  style?: CSSProperties;
}

const navStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[1],
  padding: `6px ${space[6]}px`,
  fontSize: font.xs,
  color: color.textMuted,
  background: color.bg0,
  borderBottom: `1px solid ${color.border}`,
  flexWrap: 'wrap',
  minHeight: 28,
};

const linkStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: color.textSecondary,
  cursor: 'pointer',
  padding: '2px 4px',
  fontSize: font.xs,
  fontFamily: 'inherit',
};

const currentStyle: CSSProperties = {
  color: color.text,
  fontWeight: font.semibold,
  padding: '2px 4px',
};

const sepStyle: CSSProperties = {
  color: color.textDim,
  margin: `0 ${space[1]}px`,
  fontSize: font.xs,
};

export function Breadcrumbs({items, style}: BreadcrumbsProps) {
  if (!items.length) return null;
  return (
    <nav aria-label="パンくず" style={{...navStyle, ...style}}>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        const interactive = !isLast && (item.onClick || item.href);
        return (
          <Fragment key={`${idx}-${typeof item.label === 'string' ? item.label : 'crumb'}`}>
            {interactive ? (
              item.href ? (
                <a href={item.href} style={linkStyle}>
                  {item.label}
                </a>
              ) : (
                <button type="button" onClick={item.onClick} style={linkStyle}>
                  {item.label}
                </button>
              )
            ) : (
              <span style={isLast ? currentStyle : linkStyle} aria-current={isLast ? 'page' : undefined}>
                {item.label}
              </span>
            )}
            {!isLast ? <span style={sepStyle} aria-hidden>›</span> : null}
          </Fragment>
        );
      })}
    </nav>
  );
}
