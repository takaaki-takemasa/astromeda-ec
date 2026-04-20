/**
 * Toast — admin 全タブ共通の通知プリミティブ
 *
 * patch 0087 (2026-04-21) R2-P2-2:
 * admin 11 タブで同じ Toast コンポーネント + setToast state + setTimeout 3000ms が
 * コピペ乱立していた（AdminContent/AdminMarketing/AdminBulkTags/AdminCustomization/
 * AdminMenus/AdminFiles/AdminMetaobjectDefinitions/AdminCollections/AdminProducts/
 * AdminRedirects/AdminDiscounts）。これを単一プリミティブに統合し、
 * 中学生基準の「エラーを読み切る時間」を保証するため、variant 別に duration を分ける：
 *
 *   success (既定) : 3000ms — 肯定フィードバックなので短く
 *   info           : 3500ms — 情報提示
 *   warning        : 5500ms — 要注意
 *   error          : 6500ms — エラー文言を読み切る時間が必要
 *
 * 後方互換: 旧 type 'ok' | 'err' は 'success' | 'error' に自動マップされる。
 *
 * 使用例:
 *   const {toast, pushToast, Toast} = useToast();
 *   const save = async () => {
 *     const ok = await apiSave();
 *     if (ok) pushToast('保存しました', 'success');
 *     else pushToast('保存に失敗しました。通信状態をご確認ください。', 'error');
 *   };
 *   return (<>
 *     <button onClick={save}>保存</button>
 *     {toast && <Toast />}
 *   </>);
 *
 * a11y:
 *   - success/info: role='status' + aria-live='polite'（能動割り込みを避ける）
 *   - error/warning: role='alert' + aria-live='assertive'（即時読み上げ）
 *   - 手動で閉じる「×」ボタン（aria-label 付き）
 */
import {useCallback, useEffect, useRef, useState} from 'react';
import {color, font, radius, space} from '~/lib/design-tokens';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

/** 後方互換用。旧タブは 'ok' / 'err' を使っているので自動マップする。 */
export type ToastVariantInput = ToastVariant | 'ok' | 'err';

/**
 * patch 0088 (2026-04-21) R2-P2-3:
 * Toast に任意のアクションボタンを 1 個追加できる。主用途は「元に戻す (Undo)」。
 * onClick は同期/非同期どちらでも可。押下すると Toast は即 dismiss される。
 */
export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface ToastState {
  id: number;
  msg: string;
  variant: ToastVariant;
  /** 任意: variant 既定値を上書きしたいときだけ指定 */
  durationMs?: number;
  /** patch 0088: 任意のアクションボタン（「元に戻す」など） */
  action?: ToastAction;
}

/** variant 別のデフォルト自動消失時間（ms） */
export const TOAST_DURATION: Record<ToastVariant, number> = {
  success: 3000,
  info: 3500,
  warning: 5500,
  error: 6500,
};

function normalizeVariant(v: ToastVariantInput): ToastVariant {
  if (v === 'ok') return 'success';
  if (v === 'err') return 'error';
  return v;
}

/**
 * useToast — admin 全タブ共通のトースト状態フック
 *
 * 返り値:
 *   toast       : 現在表示中のトースト (null なら非表示)
 *   pushToast   : 通知を出す。variant に応じて自動で dismiss タイマーを設定
 *   dismiss     : 手動で閉じる
 *   Toast       : 描画用プリミティブ。<Toast /> で呼び出すだけで OK
 */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, []);

  const pushToast = useCallback(
    (
      msg: string,
      variantInput: ToastVariantInput = 'success',
      opts?: {durationMs?: number; action?: ToastAction},
    ) => {
      const variant = normalizeVariant(variantInput);
      clearTimer();
      const id = ++idRef.current;
      setToast({id, msg, variant, durationMs: opts?.durationMs, action: opts?.action});
      const duration = opts?.durationMs ?? TOAST_DURATION[variant];
      timerRef.current = setTimeout(() => {
        setToast((cur) => (cur && cur.id === id ? null : cur));
        timerRef.current = null;
      }, duration);
    },
    [],
  );

  // マウントアンマウントで timer を掃除
  useEffect(() => {
    return () => clearTimer();
  }, []);

  // 描画用: 呼び出し側は <Toast /> と書くだけで OK
  const ToastElement = () =>
    toast ? <ToastView toast={toast} onDismiss={dismiss} /> : null;

  return {toast, pushToast, dismiss, Toast: ToastElement};
}

// ══════════════════════════════════════════════════════════
// 描画プリミティブ (内部用)
// ══════════════════════════════════════════════════════════

interface ToastViewProps {
  toast: ToastState;
  onDismiss: () => void;
}

function ToastView({toast, onDismiss}: ToastViewProps) {
  const isErr = toast.variant === 'error';
  const isWarn = toast.variant === 'warning';
  const isInfo = toast.variant === 'info';

  const bg = isErr
    ? color.red
    : isWarn
      ? color.yellow
      : isInfo
        ? color.cyan
        : color.green; // success
  const textColor = isErr ? '#fff' : '#000';
  const role = isErr || isWarn ? 'alert' : 'status';
  const live = isErr || isWarn ? 'assertive' : 'polite';
  const variantLabel: Record<ToastVariant, string> = {
    success: '✓ 完了',
    error: '⚠ エラー',
    warning: '⚠ 注意',
    info: 'ℹ お知らせ',
  };

  return (
    <div
      role={role}
      aria-live={live}
      aria-atomic="true"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        padding: `${space[3]} ${space[5]}`,
        borderRadius: radius.md,
        background: bg,
        color: textColor,
        zIndex: 10000,
        boxShadow: '0 4px 20px rgba(0,0,0,.5)',
        fontSize: font.sm,
        fontWeight: font.semibold,
        display: 'flex',
        alignItems: 'flex-start',
        gap: space[3],
        maxWidth: 420,
        minWidth: 240,
        lineHeight: 1.45,
      }}
    >
      <span
        aria-hidden="true"
        style={{fontSize: font.xs, fontWeight: font.bold, opacity: 0.85, marginTop: 1, whiteSpace: 'nowrap'}}
      >
        {variantLabel[toast.variant]}
      </span>
      <span style={{flex: 1}}>{toast.msg}</span>
      {/* patch 0088: 任意のアクションボタン（例: 「元に戻す」） */}
      {toast.action && (
        <button
          type="button"
          onClick={async () => {
            const {onClick} = toast.action!;
            // 先に dismiss してから実行（ユーザーに即座のフィードバック）
            onDismiss();
            try {
              await onClick();
            } catch {
              // アクション側でエラー通知する想定。ここでは握りつぶす。
            }
          }}
          aria-label={toast.action.label}
          style={{
            background: 'rgba(0,0,0,.25)',
            border: `1px solid ${textColor === '#fff' ? 'rgba(255,255,255,.4)' : 'rgba(0,0,0,.25)'}`,
            color: textColor,
            cursor: 'pointer',
            padding: '4px 10px',
            fontSize: font.xs,
            fontWeight: font.bold,
            borderRadius: radius.sm,
            lineHeight: 1.2,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="通知を閉じる"
        style={{
          background: 'transparent',
          border: 'none',
          color: textColor,
          cursor: 'pointer',
          padding: 0,
          fontSize: font.md,
          lineHeight: 1,
          opacity: 0.7,
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

/**
 * ToastLegacy — 旧 <Toast msg={msg} type={type} /> 互換プリミティブ
 *
 * 既存タブの段階的移行用。内部的には新しい ToastView を呼び出すが、
 * duration 制御は呼び出し側の setTimeout 任せ（旧挙動そのまま）。
 * 新規コードでは useToast() を直接使うこと。
 */
export function Toast({
  msg,
  type,
}: {
  msg: string;
  type: ToastVariantInput;
}) {
  const variant = normalizeVariant(type);
  const dummy: ToastState = {id: 0, msg, variant};
  // onDismiss は no-op（旧タブは外部 setTimeout で管理）
  return <ToastView toast={dummy} onDismiss={() => {}} />;
}

export default Toast;
