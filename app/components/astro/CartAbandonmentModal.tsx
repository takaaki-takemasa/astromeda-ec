import React, {useEffect, useState} from 'react';
import {Link} from 'react-router';
import {T} from '~/lib/astromeda-data';

/**
 * CartAbandonmentModal
 *
 * Displays a modal when user attempts to leave the site with items in cart.
 * - Triggers on document mouseleave toward top (desktop exit intent)
 * - Only shows if cart has items
 * - Shows once per session (sessionStorage flag)
 * - Shows after 10 seconds on site (prevents immediate popup)
 * - Animated entrance with backdrop blur
 */

interface CartAbandonmentModalProps {
  cartHasItems: boolean;
}

export function CartAbandonmentModal({cartHasItems}: CartAbandonmentModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Wait 10 seconds before enabling the modal
    const readyTimer = setTimeout(() => {
      setIsReady(true);
    }, 10000);

    return () => clearTimeout(readyTimer);
  }, []);

  useEffect(() => {
    if (!isReady || !cartHasItems || isOpen) {
      return;
    }

    const handleMouseLeave = (e: MouseEvent) => {
      // Check if mouse is leaving toward top of document (exit intent)
      if (e.clientY <= 0) {
        // Check sessionStorage flag to show only once per session
        const alreadyShown = sessionStorage.getItem('astro_cart_modal_shown');
        if (!alreadyShown) {
          setIsOpen(true);
          sessionStorage.setItem('astro_cart_modal_shown', 'true');
        }
      }
    };

    document.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [isReady, cartHasItems, isOpen]);

  const handleClose = () => {
    setIsOpen(false);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Backdrop Overlay */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: T.bl,
          zIndex: 9998,
          animation: 'astro-fade-in 0.3s ease-out',
        }}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: T.bg,
          border: `1px solid ${T.bd}`,
          borderRadius: '12px',
          padding: '40px',
          maxWidth: '460px',
          width: '90%',
          zIndex: 9999,
          boxShadow: '0 20px 60px rgba(0, 240, 255, 0.1)',
          animation: 'astro-scale-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: T.tx,
            fontSize: '24px',
            cursor: 'pointer',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.2s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = T.c)}
          onMouseLeave={(e) => (e.currentTarget.style.color = T.tx)}
          aria-label="閉じる"
        >
          ✕
        </button>

        {/* Title */}
        <h2
          style={{
            margin: '0 0 16px 0',
            fontSize: '24px',
            fontWeight: 900,
            color: T.c,
            fontFamily: "'Orbitron', 'Outfit', sans-serif",
            letterSpacing: '0.05em',
          }}
        >
          お忘れではありませんか？
        </h2>

        {/* Message */}
        <p
          style={{
            margin: '0 0 32px 0',
            fontSize: '15px',
            lineHeight: 1.6,
            color: T.t5,
            fontFamily: "'Outfit', 'Noto Sans JP', sans-serif",
          }}
        >
          カートに商品が入っています。今なら送料無料でお届けします。
        </p>

        {/* Button Group */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            flexDirection: 'column',
          }}
        >
          {/* Primary Button: Back to Cart */}
          <Link
            to="/cart"
            onClick={handleClose}
            style={{
              display: 'block',
              padding: '14px 24px',
              backgroundColor: T.c,
              color: T.bg,
              textAlign: 'center',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 700,
              textDecoration: 'none',
              transition: 'all 0.2s ease',
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'Outfit', 'Noto Sans JP', sans-serif",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = T.cD;
              e.currentTarget.style.boxShadow = `0 0 20px ${T.c}40`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = T.c;
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            カートに戻る
          </Link>

          {/* Secondary Button: Later */}
          <button
            onClick={handleClose}
            style={{
              padding: '14px 24px',
              backgroundColor: 'transparent',
              color: T.tx,
              border: `1px solid ${T.bd}`,
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontFamily: "'Outfit', 'Noto Sans JP', sans-serif",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = T.c;
              e.currentTarget.style.color = T.c;
              e.currentTarget.style.backgroundColor = `${T.c}08`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = T.bd;
              e.currentTarget.style.color = T.tx;
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            後で見る
          </button>
        </div>
      </div>

      {/* Keyframe animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes astro-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes astro-scale-in {
          from {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
      `}} />
    </>
  );
}
