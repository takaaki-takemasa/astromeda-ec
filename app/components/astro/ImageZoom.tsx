import {useState, useRef, useCallback} from 'react';
import {Image} from '@shopify/hydrogen';
import {T, al} from '~/lib/astromeda-data';

/**
 * Product image with hover zoom (desktop) and pinch-zoom support.
 * On mobile, tapping opens a full-screen lightbox.
 */

interface ImageZoomProps {
  image: {
    url: string;
    altText?: string | null;
    width?: number | null;
    height?: number | null;
    id?: string;
  };
  title: string;
}

export function ImageZoom({image, title}: ImageZoomProps) {
  const [showLightbox, setShowLightbox] = useState(false);
  const [zoomPos, setZoomPos] = useState({x: 50, y: 50});
  const [isZooming, setIsZooming] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPos({x, y});
  }, []);

  const imageUrl = `${image.url}${image.url.includes('?') ? '&' : '?'}width=1200&format=webp`;
  const zoomUrl = `${image.url}${image.url.includes('?') ? '&' : '?'}width=2400&format=webp`;

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          cursor: 'zoom-in',
          overflow: 'hidden',
          borderRadius: 20,
        }}
        onMouseEnter={() => setIsZooming(true)}
        onMouseLeave={() => setIsZooming(false)}
        onMouseMove={handleMouseMove}
        onClick={() => setShowLightbox(true)}
        role="button"
        tabIndex={0}
        aria-label={`${title}の画像を拡大`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setShowLightbox(true);
          }
        }}
      >
        <Image
          alt={image.altText || title}
          data={image}
          key={image.id}
          sizes="(min-width: 768px) 50vw, 100vw"
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            objectFit: 'contain',
            transition: 'transform .15s ease',
          }}
        />
        {/* Zoom overlay — desktop only via CSS class */}
        {isZooming && (
          <div
            className="astro-zoom-overlay"
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${zoomUrl})`,
              backgroundSize: '200%',
              backgroundPosition: `${zoomPos.x}% ${zoomPos.y}%`,
              backgroundRepeat: 'no-repeat',
              opacity: 1,
              pointerEvents: 'none',
            }}
          />
        )}
        {/* Hint badge */}
        <div
          className="astro-zoom-hint"
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            background: al(T.bg, 0.6),
            backdropFilter: 'blur(8px)',
            borderRadius: 8,
            padding: '4px 10px',
            fontSize: 10,
            color: al(T.tx, 0.6),
            pointerEvents: 'none',
            transition: 'opacity .2s',
            opacity: isZooming ? 0 : 0.8,
          }}
        >
          クリックで拡大
        </div>
      </div>

      {/* Lightbox */}
      {showLightbox && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            background: al(T.bg, 0.95),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
          }}
          onClick={() => setShowLightbox(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowLightbox(false);
          }}
          role="dialog"
          aria-label={`${title}の拡大画像`}
          aria-modal="true"
          tabIndex={-1}
        >
          <img
            src={zoomUrl}
            alt={image.altText || title}
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: 8,
            }}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowLightbox(false);
            }}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              background: al(T.tx, 0.1),
              border: 'none',
              borderRadius: '50%',
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: T.tx,
              fontSize: 20,
              fontWeight: 700,
            }}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        /* Desktop only: zoom overlay */
        .astro-zoom-overlay { display: none; }
        @media (min-width: 768px) {
          .astro-zoom-overlay { display: block; }
        }
        /* Mobile: hide zoom hint text, show "タップで拡大" */
        @media (max-width: 767px) {
          .astro-zoom-hint { display: none !important; }
        }
      `}} />
    </>
  );
}
