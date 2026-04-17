/**
 * Admin Modal — 2ペイン対応モーダル（共通コンポーネント）
 *
 * AdminPageEditor 内の Modal を切り出した共通版。
 * - preview prop を渡すと右ペインにライブプレビューを表示
 * - 1100px 以下で自動的に 1 カラムへ折り返し
 */

import React from 'react';
import {T, al} from '~/lib/astromeda-data';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  preview?: React.ReactNode;
  maxWidth?: number;
}

export function Modal({title, onClose, children, preview, maxWidth}: ModalProps) {
  const isTwoPane = !!preview;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: T.bg,
          border: `1px solid ${al(T.tx, 0.15)}`,
          borderRadius: 12,
          width: '100%',
          maxWidth: maxWidth ?? (isTwoPane ? 1400 : 640),
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 12px 32px rgba(0,0,0,.6)',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: `1px solid ${al(T.tx, 0.1)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{fontSize: 14, fontWeight: 900, color: T.tx}}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '4px 10px',
              background: 'transparent',
              border: `1px solid ${al(T.tx, 0.25)}`,
              borderRadius: 6,
              color: T.tx,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            aria-label="閉じる"
          >
            ×
          </button>
        </div>
        {isTwoPane ? (
          <div
            className="admin-modal-2pane"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(360px, 1fr) minmax(380px, 1.3fr)',
              flex: 1,
              minHeight: 0,
            }}
          >
            <div
              style={{
                padding: 20,
                overflow: 'auto',
                borderRight: `1px solid ${al(T.tx, 0.08)}`,
              }}
            >
              {children}
            </div>
            <div style={{padding: 16, background: al(T.tx, 0.02), overflow: 'auto'}}>
              {preview}
            </div>
          </div>
        ) : (
          <div style={{padding: 20, overflow: 'auto'}}>{children}</div>
        )}
      </div>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media (max-width: 1100px) {
          .admin-modal-2pane {
            grid-template-columns: 1fr !important;
          }
        }
      `,
        }}
      />
    </div>
  );
}

export default Modal;
