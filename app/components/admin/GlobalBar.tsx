/**
 * GlobalBar — 上部ステータスバー
 * Andonステータス + 検索 + 通知 + 時刻
 */
import { useState, useEffect } from 'react';
import { color, font, radius, transition, zIndex } from '~/lib/design-tokens';

interface GlobalBarProps {
  andonStatus: 'green' | 'yellow' | 'red';
  pendingApprovals: number;
  onAndonClick?: () => void;
  onSearchClick?: () => void;
  /** モバイル時のハンバーガーメニュー */
  isMobile?: boolean;
  onMenuClick?: () => void;
}

export function GlobalBar({ andonStatus, pendingApprovals, onAndonClick, onSearchClick, isMobile = false, onMenuClick }: GlobalBarProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const andonColors = {
    green: { bg: 'rgba(0,230,118,.1)', text: color.green, label: '正常稼働' },
    yellow: { bg: 'rgba(255,179,0,.1)', text: color.yellow, label: '注意' },
    red: { bg: 'rgba(255,45,85,.1)', text: color.red, label: '緊急' },
  };
  const a = andonColors[andonStatus];

  return (
    <header style={{
      height: '48px',
      background: color.bg0,
      borderBottom: `1px solid ${color.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      position: 'sticky',
      top: 0,
      zIndex: zIndex.header,
    }}>
      {/* 左: ハンバーガー（モバイル） + Andon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {isMobile && onMenuClick && (
        <button
          onClick={onMenuClick}
          aria-label="メニュー"
          style={{
            background: 'none', border: 'none', color: color.textMuted,
            cursor: 'pointer', padding: '6px', display: 'flex',
            borderRadius: radius.md,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
      )}
      <button
        onClick={onAndonClick}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '4px 12px', borderRadius: radius.full,
          background: a.bg, border: 'none',
          cursor: 'pointer', transition: `all ${transition.fast}`,
        }}
      >
        <span style={{
          width: '8px', height: '8px', borderRadius: '50%', background: a.text,
          animation: andonStatus !== 'green' ? 'pulse-dot 2s ease-in-out infinite' : undefined,
        }} />
        <span style={{ fontSize: font.xs, fontWeight: font.semibold, color: a.text }}>
          {a.label}
        </span>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes pulse-dot { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        `}} />
      </button>
      </div>

      {/* 中: 検索バー（デスクトップのみフル幅） */}
      <button
        onClick={onSearchClick}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 14px', borderRadius: radius.md,
          background: color.bg2, border: `1px solid ${color.border}`,
          color: color.textDim, fontSize: font.sm,
          cursor: 'pointer', minWidth: isMobile ? '40px' : '200px',
          transition: `all ${transition.fast}`,
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = color.borderHover; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = color.border; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        {!isMobile && '検索...'}
        {!isMobile && <kbd style={{
          marginLeft: 'auto',
          fontSize: '10px', color: color.textDim,
          padding: '1px 5px', borderRadius: '3px',
          background: 'rgba(255,255,255,.06)',
          border: `1px solid ${color.border}`,
          fontFamily: font.mono,
        }}>
          ⌘K
        </kbd>}
      </button>

      {/* 右: 通知 + 時刻 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* 承認待ち */}
        {pendingApprovals > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 10px', borderRadius: radius.full,
            background: color.yellowDim,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color.yellow} strokeWidth="2">
              <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span style={{ fontSize: font.xs, fontWeight: font.semibold, color: color.yellow }}>
              {pendingApprovals}件承認待ち
            </span>
          </div>
        )}

        {/* 時刻 */}
        <span style={{ fontSize: font.xs, color: color.textDim, fontFamily: font.mono }}>
          {now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </header>
  );
}
