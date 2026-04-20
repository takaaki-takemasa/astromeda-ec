/**
 * useConfirmDialog — Promise ベースの確認モーダル hook
 *
 * patch 0044 (2026-04-19)  — Phase A 基盤整備
 *
 * 使用例:
 *   const {confirm, dialogProps} = useConfirmDialog();
 *
 *   async function handleDelete() {
 *     const ok = await confirm({
 *       title: '本当に削除しますか？',
 *       message: 'この操作は取り消せません。',
 *       destructive: true,
 *       confirmLabel: '削除する',
 *     });
 *     if (!ok) return;
 *     // delete ...
 *   }
 *
 *   return (
 *     <>
 *       {...your UI}
 *       <ConfirmDialog {...dialogProps} />
 *     </>
 *   );
 *
 * 1 モジュール内で既存の window.confirm(...) 呼び出しを
 *   const ok = await confirm({...}); if (!ok) return;
 * に置換するだけで Stripe 水準の確認 UX に置き換わる。
 */
import {useCallback, useRef, useState} from 'react';
import {ConfirmDialog} from '~/components/admin/ds/ConfirmDialog';
import type {ConfirmDialogProps} from '~/components/admin/ds/ConfirmDialog';

type ConfirmOptions = Omit<ConfirmDialogProps, 'open' | 'onConfirm' | 'onCancel'>;

interface PendingState {
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

export function useConfirmDialog() {
  const [pending, setPending] = useState<PendingState | null>(null);
  const pendingRef = useRef<PendingState | null>(null);
  pendingRef.current = pending;

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setPending({options, resolve});
    });
  }, []);

  const handleConfirm = useCallback(() => {
    pendingRef.current?.resolve(true);
    setPending(null);
  }, []);

  const handleCancel = useCallback(() => {
    pendingRef.current?.resolve(false);
    setPending(null);
  }, []);

  const dialogProps: ConfirmDialogProps = {
    open: pending !== null,
    title: pending?.options.title ?? '',
    message: pending?.options.message,
    confirmLabel: pending?.options.confirmLabel,
    cancelLabel: pending?.options.cancelLabel,
    destructive: pending?.options.destructive,
    contextPath: pending?.options.contextPath,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  };

  return {confirm, dialogProps, ConfirmDialog};
}
