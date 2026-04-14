/**
 * キーボードショートカット — 運動神経の反射弓
 *
 * NV-11: Admin ダッシュボード用キーボードショートカット
 *
 * 医学メタファー: 脊髄反射
 * 大脳皮質（意識的操作）を経由せず、脊髄レベルで即座に応答する。
 * 頻繁に使う操作を最短経路で実行可能にする。
 *
 * 設計:
 * - SSR安全（windowチェック付き）
 * - 重複登録防止
 * - コンポーネントアンマウント時に自動クリーンアップ
 * - Cmd/Ctrl 自動判定（Mac/Windows）
 */

export interface ShortcutConfig {
  /** キーの組み合わせ（例: 'ctrl+k', 'cmd+shift+p'） */
  key: string;
  /** 説明（a11y + ヘルプ画面用） */
  label: string;
  /** コールバック */
  handler: (e: KeyboardEvent) => void;
  /** input/textarea内でも発火するか（デフォルト: false） */
  allowInInput?: boolean;
  /** 有効/無効（デフォルト: true） */
  enabled?: boolean;
}

/** 登録済みショートカットの内部レジストリ */
const shortcuts = new Map<string, ShortcutConfig>();

/** グローバルリスナー登録済みフラグ */
let listenerInstalled = false;

/**
 * キー文字列を正規化（順序統一 + 小文字化）
 * 'ctrl+shift+k' と 'shift+ctrl+k' を同一として扱う
 */
function normalizeKey(key: string): string {
  const parts = key.toLowerCase().split('+').map((p) => p.trim());

  // Cmd → Ctrl 統一（Cross-platform）
  const modifiers: string[] = [];
  let mainKey = '';

  for (const part of parts) {
    if (['ctrl', 'cmd', 'meta', 'control'].includes(part)) {
      if (!modifiers.includes('mod')) modifiers.push('mod');
    } else if (part === 'shift') {
      if (!modifiers.includes('shift')) modifiers.push('shift');
    } else if (part === 'alt' || part === 'option') {
      if (!modifiers.includes('alt')) modifiers.push('alt');
    } else {
      mainKey = part;
    }
  }

  modifiers.sort();
  return [...modifiers, mainKey].join('+');
}

/**
 * KeyboardEvent から正規化キー文字列を生成
 */
function eventToKey(e: KeyboardEvent): string {
  const modifiers: string[] = [];
  if (e.ctrlKey || e.metaKey) modifiers.push('mod');
  if (e.shiftKey) modifiers.push('shift');
  if (e.altKey) modifiers.push('alt');
  modifiers.sort();

  const key = e.key.toLowerCase();
  return [...modifiers, key].join('+');
}

/**
 * グローバルキーダウンハンドラ
 */
function globalKeyHandler(e: KeyboardEvent): void {
  const normalizedEvent = eventToKey(e);

  const config = shortcuts.get(normalizedEvent);
  if (!config) return;
  if (config.enabled === false) return;

  // input/textarea内チェック
  if (!config.allowInInput) {
    const target = e.target as HTMLElement;
    const tagName = target.tagName?.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || target.isContentEditable) {
      return;
    }
  }

  e.preventDefault();
  e.stopPropagation();
  config.handler(e);
}

/**
 * ショートカットを登録
 * @returns クリーンアップ関数（useEffect内で使用）
 */
export function registerShortcut(config: ShortcutConfig): () => void {
  // SSR安全チェック
  if (typeof window === 'undefined') return () => {};

  const normalized = normalizeKey(config.key);
  shortcuts.set(normalized, {...config, key: normalized});

  // グローバルリスナーの遅延登録
  if (!listenerInstalled) {
    window.addEventListener('keydown', globalKeyHandler, {capture: true});
    listenerInstalled = true;
  }

  // クリーンアップ関数
  return () => {
    shortcuts.delete(normalized);
    if (shortcuts.size === 0 && listenerInstalled) {
      window.removeEventListener('keydown', globalKeyHandler, {capture: true});
      listenerInstalled = false;
    }
  };
}

/**
 * 全ショートカットの一覧を取得（ヘルプ画面用）
 */
export function getShortcutList(): {key: string; label: string; enabled: boolean}[] {
  return Array.from(shortcuts.values()).map((s) => ({
    key: s.key,
    label: s.label,
    enabled: s.enabled !== false,
  }));
}

/**
 * 全ショートカットをクリア（テスト用）
 */
export function clearShortcuts(): void {
  shortcuts.clear();
  if (typeof window !== 'undefined' && listenerInstalled) {
    window.removeEventListener('keydown', globalKeyHandler, {capture: true});
    listenerInstalled = false;
  }
}

/**
 * Admin ダッシュボードのデフォルトショートカット定義
 * 実際の登録はコンポーネント内で行う（handler参照が必要なため）
 */
export const DEFAULT_ADMIN_SHORTCUTS = {
  search: {key: 'ctrl+k', label: '検索を開く'},
  refresh: {key: 'ctrl+r', label: 'データ更新'},
  toggleSidebar: {key: 'ctrl+b', label: 'サイドバー開閉'},
  help: {key: 'shift+?', label: 'ショートカット一覧'},
  andon: {key: 'ctrl+shift+a', label: 'ANDON操作'},
  escape: {key: 'escape', label: 'モーダルを閉じる'},
} as const;
