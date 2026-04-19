/**
 * ConfirmDialog — 確認モーダル（Stripe 水準）
 *
 * patch 0044 (2026-04-19)  — Phase A 基盤整備
 *
 * `window.confirm()` は Stripe/Apple/Linear レベルの UX では許されない。
 * 現状 admin には `window.confirm()` が散在している（AdminContent:288、AdminMarketing:398 等）。
 * これを段階的に ConfirmDialog + useConfirmDialog に置換する。
 *
 * 特徴:
 *  - Stripe Dashboard 風の overlay + card レイアウト
 *  - 破壊的操作 (destructive=true) は赤ボタンで confirm
 *  - ESC / 背景クリックでキャンセル
 *  - Promise ベース: `const ok = await confirm({...})` の形で呼べる
 */
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { color, font, radius, space, shadow } from '~/lib/design-tokens';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 破壊的操作か（赤ボタン化） */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: space[4],
};

const cardStyle: CSSProperties = {
  background: color.bg1,
  borderRadius: radius.lg,
  boxShadow: shadow.lg,
  padding: `${space[5]}px ${space[6]}px`,
  maxWidth: 480,
  width: '100%',
  border: `1px solid ${color.border}`,
};

const titleStyle: CSSProperties = {
  fontSize: font.lg,
  fontWeight: font.bold,
  color: color.text,
  marginBottom: space[2],
};

const messageStyle: CSSProperties = {
  fontSize: font.sm,
  color: color.textSecondary,
  marginBottom: space[5],
  lineHeight: font.relaxed,
};

const buttonRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: space[2],
};

const baseButtonStyle: CSSProperties = {
  padding: '8px 16px',
  fontSize: font.sm,
  fontWeight: font.semibold,
  borderRadius: radius.md,
  border: 'none',
  cursor: 'pointer',
  outline: 'none',
  minWidth: 80,
};

const cancelButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  background: color.bg2,
  color: color.text,
  border: `1px solid ${color.border}`,
};

const confirmButtonStyle = (destructive?: boolean): CSSProperties => ({
  ...baseButtonStyle,
  background: destructive ? color.red : color.cyan,
  color: '#fff',
});

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'キャンセル',
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && document.activeElement === confirmRef.current) {
        onConfirm();
      }
    };
    window.addEventListener('keydown', handler);
    // focus confirm button after mount
    const t = setTimeout(() => confirmRef.current?.focus(), 50);
    return () => {
      window.removeEventListener('keydown', handler);
      clearTimeout(t);
    };
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div
      style={overlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div style={cardStyle}>
        <div id="confirm-dialog-title" style={titleStyle}>
          {title}
        </div>
        {message ? <div style={messageStyle}>{message}</div> : null}
        <div style={buttonRowStyle}>
          <button type="button" onClick={onCancel} style={cancelButtonStyle}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            style={confirmButtonStyle(destructive)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
