import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import {T, al} from '~/lib/astromeda-data';

/* ─── Types ────────────────────────────────────────────────── */

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextValue {
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  /** Convenience: show "カートに追加しました" */
  cartSuccess: (productName?: string) => void;
  /** Convenience: show error toast */
  cartError: (message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback: noop if outside provider (SSR safety)
    return {
      addToast: () => {},
      cartSuccess: () => {},
      cartError: () => {},
    };
  }
  return ctx;
}

/* ─── Provider ─────────────────────────────────────────────── */

const MAX_TOASTS = 4;

export function ToastProvider({children}: {children: ReactNode}) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (message: string, type: ToastType = 'info', duration: number = 3500) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => {
        const next = [...prev, {id, message, type, duration}];
        // Keep only latest N
        return next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next;
      });
    },
    [],
  );

  const cartSuccess = useCallback(
    (productName?: string) => {
      const msg = productName
        ? `「${productName}」をカートに追加しました`
        : 'カートに追加しました';
      addToast(msg, 'success', 3000);
    },
    [addToast],
  );

  const cartError = useCallback(
    (message?: string) => {
      addToast(message || 'カートへの追加に失敗しました', 'error', 5000);
    },
    [addToast],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{addToast, cartSuccess, cartError}}>
      {children}
      {/* Portal-like: render at bottom of provider */}
      <div
        aria-live="assertive"
        aria-atomic="false"
        role="status"
        style={{
          position: 'fixed',
          bottom: 'clamp(16px, 3vw, 24px)',
          right: 'clamp(16px, 3vw, 24px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
          maxWidth: 'min(360px, calc(100vw - 32px))',
        }}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ─── Single Toast ─────────────────────────────────────────── */

const TYPE_STYLES: Record<ToastType, {accent: string; icon: string}> = {
  success: {accent: T.c, icon: '✓'},
  error: {accent: T.r, icon: '✕'},
  info: {accent: T.g, icon: 'ℹ'},
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Animate in on next frame
    const raf = requestAnimationFrame(() => setVisible(true));
    // Auto-dismiss
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 300);
    }, toast.duration);
    return () => {
      cancelAnimationFrame(raf);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.duration, onDismiss]);

  const {accent, icon} = TYPE_STYLES[toast.type];

  return (
    <div
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 16px',
        borderRadius: 12,
        background: 'rgba(10,10,20,.92)',
        backdropFilter: T.bl,
        WebkitBackdropFilter: T.bl,
        border: `1px solid ${al(accent, 0.25)}`,
        boxShadow: `0 4px 24px rgba(0,0,0,.5), 0 0 0 1px ${al(accent, 0.1)}`,
        transform: visible ? 'translateX(0)' : 'translateX(120%)',
        opacity: visible ? 1 : 0,
        transition: 'transform .3s cubic-bezier(.22,1,.36,1), opacity .3s ease',
        cursor: 'pointer',
        fontSize: 'clamp(11px, 1.4vw, 13px)',
        color: T.tx,
        lineHeight: 1.4,
      }}
      onClick={() => {
        setVisible(false);
        setTimeout(() => onDismiss(toast.id), 300);
      }}
      role="alert"
    >
      {/* Icon circle */}
      <span
        style={{
          flexShrink: 0,
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: al(accent, 0.15),
          color: accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 900,
        }}
      >
        {icon}
      </span>
      {/* Message */}
      <span style={{flex: 1}}>{toast.message}</span>
    </div>
  );
}
