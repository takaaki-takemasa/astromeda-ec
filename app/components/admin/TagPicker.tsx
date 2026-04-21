/**
 * TagPicker — Shopify 商品タグ選択プリミティブ
 *
 * patch 0098 R0 の中核。素の `<input type="text">` に Shopify タグ名を暗記して
 * 書かせていた UX を、autocomplete 付き multi-select chip UI に置換する。
 *
 * 入出力は CSV 文字列（例: `"gaming-pc, custom-build"`）で
 * 既存 API contract（astromeda_custom_option.applies_to_tags）と互換。
 *
 * 機能:
 *   - /api/admin/product-tags から Shopify 実タグを列挙（初回マウント時）
 *   - 入力欄でインクリメンタル検索→候補ドロップダウン
 *   - キーボード操作: ↑↓ 選択 / Enter 追加 / Backspace 最後のチップ削除
 *   - 未知タグは IME 確定後 Enter で追加可能（新しいタグを定義する余地）
 *   - 選択中タグの推定総商品件数を親に通知（onAffectedCountChange）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { color } from '~/lib/design-tokens';

export interface TagPickerTag {
  name: string;
  productCount: number;
}

interface TagPickerProps {
  /** CSV 文字列 (例: "gaming-pc, custom-build") */
  value: string;
  /** CSV 文字列で返す（空文字 = 全商品適用を意味する既存セマンティクス） */
  onChange: (csv: string) => void;
  /** 選択中タグの商品数合算を通知（親で「N 個の商品に表示」表示用） */
  onAffectedCountChange?: (count: number) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

// ── ユーティリティ ──

function parseCsv(csv: string): string[] {
  if (!csv) return [];
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function toCsv(tags: string[]): string {
  return tags.join(', ');
}

// ── スタイル ──

const containerStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
};

const inputBoxStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  alignItems: 'center',
  padding: '8px 10px',
  minHeight: 42,
  background: color.bg0,
  border: `1px solid ${color.border}`,
  borderRadius: 8,
  cursor: 'text',
  boxSizing: 'border-box',
};

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 600,
  color: '#000',
  background: color.cyan,
  borderRadius: 14,
  lineHeight: 1,
};

const chipCloseStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#000',
  cursor: 'pointer',
  padding: 0,
  fontSize: 14,
  lineHeight: 1,
  fontWeight: 700,
};

const unknownChipStyle: React.CSSProperties = {
  ...chipStyle,
  background: '#ffb020',
  color: '#1a1a1a',
};

const inlineInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 120,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: '#fff',
  fontSize: 13,
  fontFamily: 'inherit',
  padding: '2px 0',
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  marginTop: 4,
  background: color.bg1,
  border: `1px solid ${color.border}`,
  borderRadius: 8,
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  maxHeight: 260,
  overflowY: 'auto',
  zIndex: 200,
};

const optionRowStyle = (active: boolean): React.CSSProperties => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 12px',
  fontSize: 13,
  color: active ? '#000' : '#fff',
  background: active ? color.cyan : 'transparent',
  cursor: 'pointer',
  userSelect: 'none',
});

// ── コンポーネント本体 ──

export default function TagPicker({
  value,
  onChange,
  onAffectedCountChange,
  placeholder = 'タグを検索して追加…',
  disabled = false,
  id,
}: TagPickerProps) {
  const [allTags, setAllTags] = useState<TagPickerTag[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => parseCsv(value), [value]);

  // ── タグ一覧ロード ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/product-tags');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!alive) return;
        if (json.success) {
          setAllTags(json.tags || []);
          setLoaded(true);
        } else {
          setLoadError(json.error || 'タグ一覧を取得できませんでした');
        }
      } catch (e) {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : 'タグ一覧を取得できませんでした');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ── 選択中タグの商品数推計を親へ通知 ──
  // (sum ではなく union 近似: 同一商品が複数タグを持つ場合は重複カウントになる)
  useEffect(() => {
    if (!onAffectedCountChange) return;
    if (selected.length === 0) {
      // 空 CSV = 全商品適用 semantics。親は "全商品" と表記可能
      onAffectedCountChange(-1);
      return;
    }
    const tagMap = new Map(allTags.map((t) => [t.name, t.productCount]));
    const estimated = selected.reduce((sum, name) => sum + (tagMap.get(name) || 0), 0);
    onAffectedCountChange(estimated);
  }, [selected, allTags, onAffectedCountChange]);

  // ── 候補フィルタ ──
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const selectedSet = new Set(selected);
    const filtered = allTags.filter((t) => {
      if (selectedSet.has(t.name)) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q);
    });
    // Shopify 未登録タグも手動で足せるように、完全一致候補が無ければ末尾に仮想候補を追加
    if (q && !filtered.some((t) => t.name.toLowerCase() === q) && !selectedSet.has(q)) {
      filtered.push({ name: query.trim(), productCount: 0 });
    }
    return filtered.slice(0, 50);
  }, [query, allTags, selected]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  // ── 外側クリックで閉じる ──
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // ── タグ追加・削除 ──
  const addTag = useCallback(
    (name: string) => {
      const clean = name.trim();
      if (!clean) return;
      if (selected.includes(clean)) return;
      onChange(toCsv([...selected, clean]));
      setQuery('');
      inputRef.current?.focus();
    },
    [selected, onChange],
  );

  const removeTag = useCallback(
    (name: string) => {
      onChange(toCsv(selected.filter((t) => t !== name)));
    },
    [selected, onChange],
  );

  // ── キーボード操作 ──
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && query === '' && selected.length > 0) {
      removeTag(selected[selected.length - 1]);
      return;
    }
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, candidates.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = candidates[activeIndex];
      if (picked) addTag(picked.name);
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === ',') {
      // カンマでも確定できるように（既存 CSV 入力 UX の継承）
      e.preventDefault();
      if (query.trim()) addTag(query.trim());
    }
  };

  // ── 既知 / 未知タグ判定 ──
  const knownSet = useMemo(() => new Set(allTags.map((t) => t.name)), [allTags]);

  return (
    <div ref={containerRef} style={containerStyle}>
      <div
        style={{
          ...inputBoxStyle,
          borderColor: open ? color.cyan : color.border,
          opacity: disabled ? 0.5 : 1,
        }}
        onClick={() => {
          if (disabled) return;
          inputRef.current?.focus();
          setOpen(true);
        }}
      >
        {selected.map((tag) => {
          const known = knownSet.has(tag);
          return (
            <span key={tag} style={known ? chipStyle : unknownChipStyle} title={known ? '' : 'Shopify に未登録のタグです'}>
              {!known && <span aria-hidden>⚠️</span>}
              {tag}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag);
                }}
                style={chipCloseStyle}
                aria-label={`${tag} を削除`}
                disabled={disabled}
              >
                ×
              </button>
            </span>
          );
        })}

        <input
          ref={inputRef}
          id={id}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={selected.length === 0 ? placeholder : ''}
          disabled={disabled}
          style={inlineInputStyle}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={id ? `${id}-listbox` : undefined}
          role="combobox"
        />
      </div>

      {open && !disabled && (
        <div style={dropdownStyle} role="listbox" id={id ? `${id}-listbox` : undefined}>
          {!loaded && !loadError && (
            <div style={{ padding: '12px 14px', fontSize: 12, color: color.textMuted }}>タグ一覧を読み込み中…</div>
          )}
          {loadError && (
            <div style={{ padding: '12px 14px', fontSize: 12, color: '#ff6b6b' }}>
              タグ取得に失敗: {loadError}
            </div>
          )}
          {loaded && candidates.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: 12, color: color.textMuted }}>
              候補はありません
            </div>
          )}
          {loaded &&
            candidates.map((t, i) => {
              const isNew = !knownSet.has(t.name);
              const active = i === activeIndex;
              return (
                <div
                  key={t.name}
                  style={optionRowStyle(active)}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault(); // blur 抑止
                    addTag(t.name);
                  }}
                  role="option"
                  aria-selected={active}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isNew ? (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#ffb020', color: '#1a1a1a', fontWeight: 700 }}>新規</span>
                    ) : null}
                    <span>{t.name}</span>
                  </span>
                  <span style={{ fontSize: 11, color: active ? '#000' : color.textMuted }}>
                    {isNew ? '未登録' : `${t.productCount} 件`}
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
