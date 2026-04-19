/**
 * useFormState — 下書き自動保存つきフォーム状態 hook
 *
 * patch 0045 (2026-04-19)  — Phase A 基盤整備
 *
 * Stripe Dashboard / Linear / Notion のようなモダン CMS では
 * 入力した内容が画面遷移で消えない（ドラフト自動保存）のが標準。
 *
 * 現在の admin 各タブはフォーム state が純粋な useState のみで、
 *   ・タブ切替で消える
 *   ・ブラウザ誤クリックで消える
 *   ・エラー後の「戻る」操作で消える
 * という失敗が散見される。
 *
 * この hook は sessionStorage ベースでドラフトを保持し、
 * 同じ scopeKey で戻ってきたら最後の状態を復元する。
 *
 * 使用例:
 *   const {state, setState, reset, hasDraft} = useFormState('cms:hero_banner:create', {
 *     title: '',
 *     link_url: '',
 *   });
 *
 *   // フォーム送信成功後:
 *   await save();
 *   reset();
 *
 * 意図的に sessionStorage を使う（ブラウザ閉じたら消える）→
 * 長期保管したいなら Metaobject に draft として保存する流れに移行する。
 */
import {useCallback, useEffect, useRef, useState} from 'react';

interface UseFormStateOptions {
  /** sessionStorage のキー。タブ+操作種別+対象IDで unique に */
  scopeKey: string;
  /** 何ms間隔で sessionStorage に保存するか（デフォルト500ms） */
  debounceMs?: number;
  /** SSR safe にしたい場合、クライアントで hydrate するまで保存しない */
  ssrSafe?: boolean;
}

export function useFormState<T extends Record<string, unknown>>(
  defaultValues: T,
  optionsOrScopeKey: string | UseFormStateOptions,
) {
  const options: UseFormStateOptions =
    typeof optionsOrScopeKey === 'string'
      ? {scopeKey: optionsOrScopeKey}
      : optionsOrScopeKey;
  const {scopeKey, debounceMs = 500, ssrSafe = true} = options;

  const storageKey = `astromeda:admin:draft:${scopeKey}`;

  // hydration-safe initial state
  const [state, setStateRaw] = useState<T>(() => {
    if (ssrSafe && typeof window === 'undefined') return defaultValues;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) return defaultValues;
      const parsed = JSON.parse(raw);
      // defaultValues の shape と合体 (新 field 追加に耐える)
      return {...defaultValues, ...parsed};
    } catch {
      return defaultValues;
    }
  });
  const [hasDraft, setHasDraft] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初回 mount 時のみ「draft が既に存在するか」を検査
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      setHasDraft(Boolean(raw));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // state が変わるたびに debounce で書き込み
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(state));
        setHasDraft(true);
      } catch {
        /* sessionStorage 満杯などは黙殺 */
      }
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, storageKey, debounceMs]);

  const setState = useCallback((updater: T | ((prev: T) => T)) => {
    setStateRaw(updater);
  }, []);

  const reset = useCallback(() => {
    setStateRaw(defaultValues);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    }
    setHasDraft(false);
  }, [defaultValues, storageKey]);

  const discard = reset;

  return {state, setState, reset, discard, hasDraft, storageKey};
}

/**
 * 単純なヘルパー: 既存 useState パターンを壊さず draft 化したい場合に使う
 *
 *   const [form, setForm] = useState(DEFAULT);
 *   useDraftPersist('cms:hero_banner:create', form, setForm);
 */
export function useDraftPersist<T>(
  scopeKey: string,
  value: T,
  setValue: (next: T) => void,
  debounceMs = 500,
) {
  const storageKey = `astromeda:admin:draft:${scopeKey}`;
  const loaded = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初回 mount 時に sessionStorage → setValue
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (loaded.current) return;
    loaded.current = true;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setValue(parsed);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // value が変わるたびに書き込み
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!loaded.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        /* ignore */
      }
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [storageKey, value, debounceMs]);

  const clear = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    }
  }, [storageKey]);

  return {clear, storageKey};
}
