/**
 * CommandPalette — Cmd+K / Ctrl+K コマンドパレット
 * Stripe風ダークガラス、ファジー検索、キーボードナビゲーション対応
 */
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { color, font, radius, space, transition, zIndex } from '~/lib/design-tokens';
import type { SectionId } from './Sidebar';

// ── Types ──
type CommandCategory = 'navigation' | 'actions' | 'stats';

interface Command {
  id: string;
  label: string;
  category: CommandCategory;
  icon?: string;
  shortcut?: string;
  action?: () => void;
  onSelect?: (id: string) => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (sectionId: SectionId) => void;
}

// ── Commands データセット ──
const COMMANDS: Command[] = [
  // Navigation
  { id: 'nav-home', label: 'ホーム', category: 'navigation', icon: '🏠' },
  { id: 'nav-commerce', label: 'コマース', category: 'navigation', icon: '🛒' },
  { id: 'nav-ai', label: 'AI運用', category: 'navigation', icon: '🤖' },
  { id: 'nav-operations', label: 'オペレーション', category: 'navigation', icon: '⚙️' },
  { id: 'nav-settings', label: '設定', category: 'navigation', icon: '🔧' },

  // Actions
  { id: 'action-andon', label: 'Andonコード', category: 'actions', icon: '🔴' },
  { id: 'action-pipeline-stop', label: '全パイプライン停止', category: 'actions', icon: '⏹️' },
  { id: 'action-diagnostics', label: 'システム再診断', category: 'actions', icon: '🔍' },
  { id: 'action-export', label: 'データエクスポート', category: 'actions', icon: '📤' },

  // Quick Stats
  { id: 'stat-sales', label: '売上サマリー', category: 'stats', icon: '📊' },
  { id: 'stat-agents', label: 'Agent健全率', category: 'stats', icon: '💪' },
  { id: 'stat-pipeline', label: 'Pipeline稼働率', category: 'stats', icon: '📈' },
];

// ── ファジー検索（ケースインセンシティブ includes） ──
function fuzzySearch(query: string, commands: Command[]): Command[] {
  if (!query.trim()) return commands;

  const q = query.toLowerCase();
  return commands
    .map(cmd => {
      const labelMatch = cmd.label.toLowerCase().includes(q);
      if (!labelMatch) return null;

      // 前方一致でスコアを上げる
      const score = cmd.label.toLowerCase().startsWith(q) ? 100 : 50;
      return { cmd, score };
    })
    .filter((item): item is { cmd: Command; score: number } => item !== null)
    .sort((a, b) => b.score - a.score)
    .map(item => item.cmd);
}

// ── CommandPalette メインコンポーネント ──
export function CommandPalette({ isOpen, onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement>(null);

  // フィルタリング
  const filteredCommands = useMemo(() => fuzzySearch(query, COMMANDS), [query]);

  // リセット
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // キーボード操作
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands.length > 0) {
          handleSelectCommand(filteredCommands[selectedIndex]);
        }
      }
    },
    [filteredCommands, selectedIndex, onClose]
  );

  // コマンド選択処理
  const handleSelectCommand = useCallback(
    (cmd: Command) => {
      // Navigation
      if (cmd.id === 'nav-home') onNavigate('home');
      else if (cmd.id === 'nav-commerce') onNavigate('commerce');
      else if (cmd.id === 'nav-ai') onNavigate('ai');
      else if (cmd.id === 'nav-operations') onNavigate('operations');
      else if (cmd.id === 'nav-settings') onNavigate('settings');
      // Actions（Phase 2で実装予定 — 現在はdev-only通知）
      else if (cmd.id === 'action-andon' && process.env.NODE_ENV === 'development') console.log('Andonコード起動');
      else if (cmd.id === 'action-pipeline-stop' && process.env.NODE_ENV === 'development') console.log('全パイプライン停止');
      else if (cmd.id === 'action-diagnostics' && process.env.NODE_ENV === 'development') console.log('システム再診断');
      else if (cmd.id === 'action-export' && process.env.NODE_ENV === 'development') console.log('データエクスポート');
      // Stats（Phase 2で実装予定）
      else if (cmd.id === 'stat-sales' && process.env.NODE_ENV === 'development') console.log('売上サマリー表示');
      else if (cmd.id === 'stat-agents' && process.env.NODE_ENV === 'development') console.log('Agent健全率表示');
      else if (cmd.id === 'stat-pipeline' && process.env.NODE_ENV === 'development') console.log('Pipeline稼働率表示');

      // カスタムアクション
      if (cmd.action) {
        cmd.action();
      }

      onClose();
    },
    [onNavigate, onClose]
  );

  // 選択アイテムをスクロール表示
  useEffect(() => {
    if (selectedItemRef.current && listRef.current) {
      selectedItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // オーバーレイクリック判定
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="コマンドパレット"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: zIndex.cmdK,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '80px',
        background: `rgba(0,0,0,.7)`,
        backdropFilter: 'blur(4px)',
      }}
      onClick={handleBackdropClick}
    >
      {/* ダイアログパネル */}
      <div
        style={{
          width: '100%',
          maxWidth: '600px',
          marginLeft: '24px',
          marginRight: '24px',
          borderRadius: radius.lg,
          overflow: 'hidden',
          background: color.bg1,
          border: `1px solid ${color.border}`,
          boxShadow: '0 20px 60px rgba(0,0,0,.8)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '70vh',
        }}
      >
        {/* 検索入力 */}
        <div
          style={{
            padding: `${space[4]} ${space[6]}`,
            borderBottom: `1px solid ${color.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: space[3],
          }}
        >
          <span style={{ fontSize: '20px', opacity: 0.5 }}>⌘</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="コマンドを検索..."
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: color.text,
              fontSize: font.base,
              fontFamily: font.family,
              padding: 0,
            }}
          />
        </div>

        {/* コマンドリスト */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {filteredCommands.length === 0 ? (
            <div
              style={{
                padding: `${space[8]} ${space[6]}`,
                textAlign: 'center',
                color: color.textMuted,
                fontSize: font.sm,
              }}
            >
              コマンドが見つかりません
            </div>
          ) : (
            <CommandGroup
              commands={filteredCommands}
              selectedIndex={selectedIndex}
              onSelectCommand={handleSelectCommand}
              onSelectIndex={setSelectedIndex}
              selectedItemRef={selectedItemRef}
            />
          )}
        </div>

        {/* フッター */}
        <div
          style={{
            padding: `${space[3]} ${space[6]}`,
            borderTop: `1px solid ${color.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: space[4],
            fontSize: font.xs,
            color: color.textMuted,
          }}
        >
          <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
            <kbd style={{ padding: `0 ${space[1]}`, background: color.bg2, borderRadius: radius.sm }}>↑↓</kbd>
            <span>選択</span>
          </div>
          <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
            <kbd style={{ padding: `0 ${space[1]}`, background: color.bg2, borderRadius: radius.sm }}>⏎</kbd>
            <span>実行</span>
          </div>
          <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
            <kbd style={{ padding: `0 ${space[1]}`, background: color.bg2, borderRadius: radius.sm }}>Esc</kbd>
            <span>閉じる</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── カテゴリ別グループ表示 ──
interface CommandGroupProps {
  commands: Command[];
  selectedIndex: number;
  onSelectCommand: (cmd: Command) => void;
  onSelectIndex: (index: number) => void;
  selectedItemRef: React.Ref<HTMLButtonElement>;
}

function CommandGroup({ commands, selectedIndex, onSelectCommand, onSelectIndex, selectedItemRef }: CommandGroupProps) {
  // カテゴリ別に集約
  const grouped = useMemo(() => {
    const map = new Map<CommandCategory, Command[]>();
    commands.forEach(cmd => {
      if (!map.has(cmd.category)) {
        map.set(cmd.category, []);
      }
      map.get(cmd.category)!.push(cmd);
    });
    return Array.from(map.entries());
  }, [commands]);

  let currentIdx = 0;

  const categoryLabel: Record<CommandCategory, string> = {
    navigation: 'ナビゲーション',
    actions: 'アクション',
    stats: 'クイックスタッツ',
  };

  currentIdx = 0;

  return (
    <>
      {grouped.map(([category, cmds]) => (
        <div key={category} style={{ display: 'flex', flexDirection: 'column' }}>
          {/* カテゴリヘッダ */}
          <div
            style={{
              padding: `${space[4]} ${space[6]} ${space[2]} ${space[6]}`,
              fontSize: font.xs,
              fontWeight: font.semibold,
              color: color.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {categoryLabel[category]}
          </div>

          {/* コマンドボタン */}
          {cmds.map(cmd => {
            const isSelected = selectedIndex === currentIdx;
            const itemIndex = currentIdx++;

            return (
              <button
                key={cmd.id}
                ref={isSelected ? selectedItemRef : null}
                onClick={() => onSelectCommand(cmd)}
                style={{
                  width: '100%',
                  padding: `${space[4]} ${space[6]}`,
                  border: 'none',
                  background: isSelected ? color.cyanDim : 'transparent',
                  color: isSelected ? color.cyan : color.text,
                  fontSize: font.base,
                  fontFamily: font.family,
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: space[4],
                  transition: `all ${transition.fast}`,
                }}
                onMouseEnter={e => {
                  onSelectIndex(itemIndex);
                  e.currentTarget.style.background = isSelected ? color.cyanDim : color.bg2;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = isSelected ? color.cyanDim : 'transparent';
                }}
              >
                {/* アイコン */}
                {cmd.icon && (
                  <span style={{ fontSize: '20px', opacity: 0.7, flexShrink: 0 }}>
                    {cmd.icon}
                  </span>
                )}

                {/* ラベル & ショートカット */}
                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: isSelected ? font.semibold : font.regular }}>
                    {cmd.label}
                  </span>
                  {cmd.shortcut && (
                    <span
                      style={{
                        fontSize: font.xs,
                        color: color.textMuted,
                        fontFamily: font.mono,
                      }}
                    >
                      {cmd.shortcut}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

// ── CommandPaletteProvider（グローバルキーボードリスナー） ──
interface CommandPaletteProviderProps {
  children: ReactNode;
  onOpen?: () => void;
  onClose?: () => void;
}

export function CommandPaletteProvider({
  children,
  onOpen,
  onClose,
}: CommandPaletteProviderProps) {
  const [isOpen, setIsOpen] = useState(false);

  // グローバルキーボードリスナー（Cmd+K / Ctrl+K）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Mac: Cmd+K, Windows: Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
        if (!isOpen) {
          onOpen?.();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onOpen]);

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  return (
    <>
      {children}
      {/* CommandPaletteはページレベルで統合するため、ここでは children のみ */}
    </>
  );
}
