import {useState, useCallback, useEffect, useRef} from 'react';
import {T, al} from '~/lib/astromeda-data';

export interface SetupImage {
  url: string;
  alt: string;
  width?: number;
  height?: number;
}

interface SetupSliderProps {
  images: SetupImage[];
  colorName: string;
  accentColor: string;
}

export function SetupSlider({images, colorName, accentColor}: SetupSliderProps) {
  const [current, setCurrent] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = images.length;

  const goTo = useCallback(
    (index: number) => {
      if (isTransitioning || total <= 1) return;
      setIsTransitioning(true);
      setCurrent(((index % total) + total) % total);
      setTimeout(() => setIsTransitioning(false), 400);
    },
    [isTransitioning, total],
  );

  const next = useCallback(() => goTo(current + 1), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1), [current, goTo]);

  // Reset autoplay on manual interaction
  const resetAutoPlay = useCallback(() => {
    if (autoPlayRef.current) clearInterval(autoPlayRef.current);
    autoPlayRef.current = setInterval(next, 5000);
  }, [next]);

  // Auto-play
  useEffect(() => {
    if (total <= 1) return;
    resetAutoPlay();
    return () => {
      if (autoPlayRef.current) clearInterval(autoPlayRef.current);
    };
  }, [resetAutoPlay, total]);

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) next();
      else prev();
      resetAutoPlay();
    }
  };

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        next();
        resetAutoPlay();
      }
      if (e.key === 'ArrowLeft') {
        prev();
        resetAutoPlay();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next, prev, resetAutoPlay]);

  if (total === 0) return null;

  return (
    <div style={{position: 'relative', width: '100%'}}>
      {/* Main image area */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16/9',
          overflow: 'hidden',
          borderRadius: 'clamp(8px, 1.2vw, 16px)',
          border: `1px solid ${al(accentColor, 0.15)}`,
          background: T.bg,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {images.map((img, i) => (
          <div
            key={img.url}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: i === current ? 1 : 0,
              transition: 'opacity 0.4s ease-in-out',
              zIndex: i === current ? 1 : 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src={`${img.url}${img.url.includes('?') ? '&' : '?'}width=1400`}
              alt={img.alt || `${colorName} セットアップ ${i + 1}`}
              loading={i === 0 ? 'eager' : 'lazy'}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>
        ))}

        {/* Counter badge */}
        <div
          style={{
            position: 'absolute',
            top: 'clamp(12px, 1.5vw, 20px)',
            right: 'clamp(12px, 1.5vw, 20px)',
            background: al(T.bg, 0.6),
            backdropFilter: 'blur(8px)',
            borderRadius: 20,
            padding: '4px 12px',
            fontSize: 'clamp(10px, 1.1vw, 13px)',
            fontWeight: 600,
            color: T.tx,
            zIndex: 5,
          }}
        >
          {current + 1} / {total}
        </div>

        {/* Left / Right arrows */}
        {total > 1 && (
          <>
            <button
              onClick={() => {
                prev();
                resetAutoPlay();
              }}
              aria-label="前の画像"
              style={{
                position: 'absolute',
                left: 'clamp(8px, 1vw, 16px)',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 5,
                width: 'clamp(36px, 4vw, 48px)',
                height: 'clamp(36px, 4vw, 48px)',
                borderRadius: '50%',
                border: `1px solid ${al(accentColor, 0.3)}`,
                background: al(T.bg, 0.5),
                backdropFilter: 'blur(8px)',
                color: T.tx,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 'clamp(16px, 2vw, 22px)',
                transition: 'background .2s, border-color .2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = al(accentColor, 0.3);
                e.currentTarget.style.borderColor = al(accentColor, 0.6);
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = al(T.bg, 0.5);
                e.currentTarget.style.borderColor = al(accentColor, 0.3);
              }}
            >
              ‹
            </button>
            <button
              onClick={() => {
                next();
                resetAutoPlay();
              }}
              aria-label="次の画像"
              style={{
                position: 'absolute',
                right: 'clamp(8px, 1vw, 16px)',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 5,
                width: 'clamp(36px, 4vw, 48px)',
                height: 'clamp(36px, 4vw, 48px)',
                borderRadius: '50%',
                border: `1px solid ${al(accentColor, 0.3)}`,
                background: al(T.bg, 0.5),
                backdropFilter: 'blur(8px)',
                color: T.tx,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 'clamp(16px, 2vw, 22px)',
                transition: 'background .2s, border-color .2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = al(accentColor, 0.3);
                e.currentTarget.style.borderColor = al(accentColor, 0.6);
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = al(T.bg, 0.5);
                e.currentTarget.style.borderColor = al(accentColor, 0.3);
              }}
            >
              ›
            </button>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {total > 1 && (
        <div
          style={{
            display: 'flex',
            gap: 'clamp(6px, 0.8vw, 10px)',
            marginTop: 'clamp(12px, 1.5vw, 18px)',
            overflowX: 'auto',
            paddingBottom: 4,
          }}
        >
          {images.map((img, i) => (
            <button
              key={img.url}
              onClick={() => {
                goTo(i);
                resetAutoPlay();
              }}
              type="button"
              aria-label={`サムネイル ${i + 1} を表示`}
              style={{
                flexShrink: 0,
                width: 'clamp(60px, 8vw, 100px)',
                aspectRatio: '16/10',
                borderRadius: 'clamp(4px, 0.6vw, 8px)',
                overflow: 'hidden',
                border:
                  i === current
                    ? `2px solid ${accentColor}`
                    : `1px solid ${T.t2}`,
                opacity: i === current ? 1 : 0.5,
                cursor: 'pointer',
                padding: 0,
                background: 'none',
                transition: 'opacity .2s, border-color .2s',
              }}
            >
              <img
                src={`${img.url}${img.url.includes('?') ? '&' : '?'}width=200`}
                alt={`サムネイル ${i + 1}`}
                loading="lazy"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
