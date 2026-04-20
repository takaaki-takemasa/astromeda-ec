/**
 * CanonicalRedirectBanner (patch 0073 / R2-3)
 *
 * 同じ Metaobject を複数の admin タブで CRUD できてしまう重複状態を解消するため、
 * 非 canonical なタブの先頭に「正規の場所はこちらです」案内バナーを表示する。
 *
 * 非エンジニアの CEO が「どこで編集するのが正しいか」を迷わないように、
 * canonical タブへのジャンプ CTA を含める。機能自体は残したまま UX 上の
 * 交通整理だけ行うため、破壊的変更ではない。
 *
 * Usage:
 *   <CanonicalRedirectBanner
 *     metaobjectType="astromeda_hero_banner"
 *     currentTab="content"
 *     onJumpToCanonical={() => window.location.href = '/admin?tab=pageEditor'}
 *   />
 */
import type {CSSProperties} from 'react';
import {color, font, radius, space} from '~/lib/design-tokens';
import type {CanonicalTab} from '~/lib/canonical-paths';
import {getCanonicalOwnership} from '~/lib/canonical-paths';

export interface CanonicalRedirectBannerProps {
  /** どの Metaobject type を扱っているか */
  metaobjectType: string;
  /** 現在表示中のタブ */
  currentTab: CanonicalTab;
  /** 正規タブへジャンプするハンドラ（未指定なら自動でアンカー化） */
  onJumpToCanonical?: () => void;
  /** 追加の説明文（例: 「ここでも編集できますが正規はビジュアル編集です」） */
  note?: string;
}

export function CanonicalRedirectBanner({
  metaobjectType,
  currentTab,
  onJumpToCanonical,
  note,
}: CanonicalRedirectBannerProps) {
  const ownership = getCanonicalOwnership(metaobjectType);
  // canonical ownership が未登録 or 現在タブが既に canonical なら非表示
  if (!ownership || ownership.canonical === currentTab) {
    return null;
  }

  const wrapperStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: space[3],
    padding: `${space[3]} ${space[4]}`,
    background: 'rgba(0, 122, 255, 0.08)',
    border: `1px solid rgba(0, 122, 255, 0.25)`,
    borderRadius: radius.md,
    marginBottom: space[4],
    fontSize: font.sm,
    color: color.text,
    lineHeight: 1.5,
  };

  const iconStyle: CSSProperties = {
    fontSize: '20px',
    flexShrink: 0,
  };

  const textStyle: CSSProperties = {
    flex: 1,
  };

  const buttonStyle: CSSProperties = {
    flexShrink: 0,
    padding: `${space[2]} ${space[4]}`,
    background: color.cyan,
    color: '#000',
    border: 'none',
    borderRadius: radius.md,
    fontSize: font.sm,
    fontWeight: font.semibold,
    fontFamily: 'inherit',
    cursor: 'pointer',
  };

  const href = onJumpToCanonical ? undefined : `/admin?tab=${ownership.canonical}`;

  return (
    <div
      style={wrapperStyle}
      role="status"
      aria-live="polite"
      data-canonical-redirect-banner=""
    >
      <span aria-hidden="true" style={iconStyle}>📍</span>
      <div style={textStyle}>
        <strong>正規の編集場所は「{ownership.canonicalLabel}」です。</strong>
        {note ? <span style={{marginLeft: space[2], color: color.textSecondary}}>{note}</span> : null}
        {!note ? (
          <span style={{marginLeft: space[2], color: color.textSecondary}}>
            ここでも編集できますが、ビジュアルで確認しながら編集したい場合は正規の場所がおすすめです。
          </span>
        ) : null}
      </div>
      {onJumpToCanonical ? (
        <button type="button" onClick={onJumpToCanonical} style={buttonStyle} aria-label={`${ownership.canonicalLabel} へ移動`}>
          正規の場所へ →
        </button>
      ) : (
        <a
          href={href}
          style={{...buttonStyle, textDecoration: 'none', display: 'inline-block'}}
          aria-label={`${ownership.canonicalLabel} へ移動`}
        >
          正規の場所へ →
        </a>
      )}
    </div>
  );
}
