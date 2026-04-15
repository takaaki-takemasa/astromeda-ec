/**
 * PreviewFrame — Sprint 4 M5 Part A
 *
 * 管理画面 2ペイン Modal の右側で使用するライブプレビューコンテナ。
 * デバイス幅切替 + 親ペインへの自動スケール縮小。
 */

import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {T, al} from '~/lib/astromeda-data';

export type PreviewDevice = 'mobile' | 'tablet' | 'desktop';

export const DEVICE_WIDTHS: Record<PreviewDevice, number> = {
  mobile: 375,
  tablet: 768,
  desktop: 1200,
};

const DEVICE_LABELS: Record<PreviewDevice, {label: string; icon: string}> = {
  mobile: {label: 'Mobile', icon: '📱'},
  tablet: {label: 'Tablet', icon: '📱'},
  desktop: {label: 'Desktop', icon: '🖥️'},
};

interface PreviewFrameProps {
  children: React.ReactNode;
  device: PreviewDevice;
  onDeviceChange: (d: PreviewDevice) => void;
}

export default function PreviewFrame({children, device, onDeviceChange}: PreviewFrameProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [outerHeight, setOuterHeight] = useState<number>(400);

  useLayoutEffect(() => {
    const update = () => {
      if (!outerRef.current || !innerRef.current) return;
      const availableWidth = outerRef.current.clientWidth;
      if (availableWidth <= 0) return;
      const targetWidth = DEVICE_WIDTHS[device];
      const s = Math.min(1, availableWidth / targetWidth);
      setScale(s);
      // inner の natural height を測定してスケール後の外側高さを設定
      const naturalHeight = innerRef.current.scrollHeight;
      setOuterHeight(Math.max(200, naturalHeight * s));
    };
    // マウント直後 + layout 完了後に 2 回測定(コンテンツ変化に追従)
    update();
    const raf = requestAnimationFrame(update);

    // ResizeObserver で親幅変化とコンテンツサイズ変化を監視
    const ro = new ResizeObserver(update);
    if (outerRef.current) ro.observe(outerRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [device, children]);

  // デバイス切替時はスクロール位置リセット
  useEffect(() => {
    if (outerRef.current) outerRef.current.scrollTop = 0;
  }, [device]);

  const devices: PreviewDevice[] = ['mobile', 'tablet', 'desktop'];

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 8, height: '100%', minHeight: 0}}>
      {/* Device Switcher */}
      <div style={{display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
        <div style={{display: 'flex', gap: 2, background: al(T.tx, 0.05), borderRadius: 6, padding: 2}}>
          {devices.map((d) => {
            const active = d === device;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onDeviceChange(d)}
                style={{
                  padding: '5px 12px',
                  background: active ? T.c : 'transparent',
                  border: 'none',
                  borderRadius: 5,
                  color: active ? T.bg : T.t4,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>{DEVICE_LABELS[d].icon}</span>
                <span>{DEVICE_LABELS[d].label}</span>
              </button>
            );
          })}
        </div>
        <div style={{fontSize: 10, color: T.t4, fontFamily: 'monospace'}}>
          {DEVICE_WIDTHS[device]}px × {scale.toFixed(2)}
        </div>
      </div>

      {/* Scaled Preview Container */}
      <div
        ref={outerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: outerHeight,
          maxHeight: '70vh',
          overflow: 'auto',
          background: '#000',
          border: `1px solid ${al(T.tx, 0.12)}`,
          borderRadius: 8,
        }}
      >
        <div
          ref={innerRef}
          style={{
            width: DEVICE_WIDTHS[device],
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            background: T.bg,
          }}
        >
          {children}
        </div>
      </div>

      <div style={{fontSize: 10, color: T.t4, textAlign: 'center'}}>
        ライブプレビュー — フォーム変更が即時反映されます
      </div>
    </div>
  );
}
