/**
 * RoleBadge — 現在ログインしているロールを GlobalBar に表示するバッジ
 *
 * patch 0049 (2026-04-19)  — Phase E: RBAC 可視化
 *
 * Stripe/Apple/Linear いずれも管理画面の上部に「Owner / Admin / Editor」
 * のロール表示があり、画面に出ているボタンが押せるか押せないかの
 * 期待値を一発で与える。
 *
 * 現在の admin はセッション上に role があるのに UI にはどこにも出ていない。
 * RBAC で disable/hide しているボタンが「なぜ押せないか」を説明する手段が
 * 0 という状態。これを 1 単位の小バッジから始める。
 *
 * Props:
 *  - role: 'owner' | 'admin' | 'editor' | 'viewer'
 *  - email?: 表示してログインユーザを示唆
 */
import type {CSSProperties} from 'react';
import {color, font, radius, space} from '~/lib/design-tokens';

// patch 0165: vendor (他社デザイン会社等の限定ロール) を追加
export type RoleBadgeRole = 'owner' | 'admin' | 'editor' | 'vendor' | 'viewer';

interface RoleBadgeProps {
  role: RoleBadgeRole;
  email?: string;
}

const ROLE_LABELS: Record<RoleBadgeRole, string> = {
  owner: 'OWNER',
  admin: 'ADMIN',
  editor: 'EDITOR',
  vendor: '外注先',
  viewer: 'VIEWER',
};

const ROLE_COLOR: Record<RoleBadgeRole, {bg: string; fg: string}> = {
  owner: {bg: 'rgba(255,179,0,0.15)', fg: color.yellow},
  admin: {bg: 'rgba(0,240,255,0.12)', fg: color.cyan},
  editor: {bg: 'rgba(0,230,118,0.12)', fg: color.green},
  vendor: {bg: 'rgba(168,85,247,0.15)', fg: '#A855F7'},
  viewer: {bg: 'rgba(255,255,255,0.08)', fg: color.textMuted},
};

const ROLE_DESC: Record<RoleBadgeRole, string> = {
  owner: '全権限。RBAC で制限なし',
  admin: '商品/注文/コンテンツの編集まで可能',
  editor: 'コンテンツのみ編集可能',
  // patch 0165: vendor (他社デザイン会社等の限定ロール)
  vendor: 'ゲーミングPCタブ + コラボ以外の商品/コレクションのみ編集可能',
  viewer: '閲覧のみ',
};

const wrapStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[2],
  padding: '4px 10px',
  borderRadius: radius.full,
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${color.border}`,
  fontSize: font.xs,
  whiteSpace: 'nowrap',
};

const dotStyle = (c: string): CSSProperties => ({
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: c,
});

const roleStyle = (palette: {bg: string; fg: string}): CSSProperties => ({
  fontWeight: font.bold,
  color: palette.fg,
  background: palette.bg,
  padding: '1px 6px',
  borderRadius: radius.sm,
  letterSpacing: 0.4,
  fontSize: '10px',
});

const emailStyle: CSSProperties = {
  color: color.textMuted,
  fontSize: font.xs,
  maxWidth: 180,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

export function RoleBadge({role, email}: RoleBadgeProps) {
  const palette = ROLE_COLOR[role] ?? ROLE_COLOR.viewer;
  const label = ROLE_LABELS[role] ?? role.toUpperCase();
  const desc = ROLE_DESC[role] ?? '';

  return (
    <div style={wrapStyle} title={`${label} — ${desc}`}>
      <span style={dotStyle(palette.fg)} aria-hidden />
      <span style={roleStyle(palette)}>{label}</span>
      {email ? <span style={emailStyle}>{email}</span> : null}
    </div>
  );
}
