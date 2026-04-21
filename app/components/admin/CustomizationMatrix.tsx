/**
 * CustomizationMatrix — カスタマイズオプション × 商品タグ マトリックス編集
 *
 * patch 0098 R1: orphan の `AdminPageEditor.CustomizationMatrixSection` を
 * AdminCustomization サブタブから触れる形に独立ファイル化した版。
 *
 * 機能:
 *   - 縦軸: カスタマイズオプション（astromeda_custom_option）
 *   - 横軸: Shopify 商品タグ（/api/admin/product-tags）
 *   - セル ON/OFF で option.appliesToTags CSV を自動編集
 *   - 300ms debounce で auto-save → Shopify 反映
 *   - 行「全ON / 全OFF」・列クリック一括トグル・検索フィルタ
 *
 * 意図: 大量の option と tag を一目で見て一気に結線できる "上級 UX"。
 *       単一フォームで編集する「一覧」タブと併存し、状況に応じて使い分ける。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { color } from '~/lib/design-tokens';

// ── 型 ──

interface MatrixOption {
  id: string;
  handle: string;
  name: string;
  category: string;
  appliesToTags: string; // CSV
  sortOrder: number;
  isRequired: boolean;
  options: Array<{ value: string; label: string }>;
}

interface TagInfo {
  name: string;
  productCount: number;
}

// ── ユーティリティ ──

function parseCsv(csv: string): string[] {
  if (!csv) return [];
  return csv.split(',').map((s) => s.trim()).filter(Boolean);
}

function toCsv(tags: Iterable<string>): string {
  return Array.from(tags).sort().join(',');
}

// ── スタイル ──

const cardStyle: React.CSSProperties = {
  background: color.bg0,
  border: `1px solid ${color.border}`,
  borderRadius: 12,
  padding: 16,
};

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  color: '#fff',
  background: color.bg1,
  border: `1px solid ${color.border}`,
  borderRadius: 6,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const pillBtnStyle: React.CSSProperties = {
  padding: '2px 8px',
  fontSize: 10,
  fontWeight: 700,
  color: color.textMuted,
  background: 'transparent',
  border: `1px solid ${color.border}`,
  borderRadius: 10,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

// ── 本体 ──

export default function CustomizationMatrix({
  onSaveError,
}: {
  onSaveError?: (msg: string) => void;
}) {
  const [options, setOptions] = useState<MatrixOption[]>([]);
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── 初回ロード: options + tags ──
  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [optRes, tagRes] = await Promise.all([
        fetch('/api/admin/customization').then((r) => r.json()),
        fetch('/api/admin/product-tags').then((r) => r.json()),
      ]);

      if (!optRes?.success) {
        throw new Error(optRes?.error || 'オプション取得失敗');
      }
      if (!tagRes?.success) {
        throw new Error(tagRes?.error || 'タグ取得失敗');
      }

      const opts: MatrixOption[] = (optRes.options || [])
        .slice()
        .sort((a: MatrixOption, b: MatrixOption) => a.sortOrder - b.sortOrder);

      const tagList: TagInfo[] = (tagRes.tags || [])
        .slice()
        .sort((a: TagInfo, b: TagInfo) => a.name.localeCompare(b.name, 'ja'));

      setOptions(opts);
      setTags(tagList);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '読み込み失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // ── セル判定: appliesToTags 空 = 全タグ ON ──
  const isChecked = useCallback((opt: MatrixOption, tag: string): boolean => {
    const applied = parseCsv(opt.appliesToTags);
    if (applied.length === 0) return true;
    return applied.includes(tag);
  }, []);

  // ── 保存（debounced） ──
  const saveTags = useCallback(
    (optId: string, newCsv: string) => {
      setOptions((prev) =>
        prev.map((o) => (o.id === optId ? { ...o, appliesToTags: newCsv } : o)),
      );
      if (debounceRef.current[optId]) clearTimeout(debounceRef.current[optId]);
      debounceRef.current[optId] = setTimeout(async () => {
        setSavingMap((prev) => ({ ...prev, [optId]: true }));
        try {
          const res = await fetch('/api/admin/customization', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'update',
              metaobjectId: optId,
              appliesToTags: newCsv,
            }),
          });
          const json = await res.json();
          if (!json.success) {
            onSaveError?.(`保存失敗: ${json.error || 'unknown'}`);
          }
        } catch (e) {
          onSaveError?.(e instanceof Error ? e.message : '通信エラー');
        } finally {
          setSavingMap((prev) => {
            const next = { ...prev };
            delete next[optId];
            return next;
          });
        }
      }, 300);
    },
    [onSaveError],
  );

  // ── 操作 ──
  const toggleCell = (opt: MatrixOption, tag: string) => {
    const set = new Set(parseCsv(opt.appliesToTags));
    // 空 CSV = 全タグ暗黙 ON → 明示化してから toggle
    if (set.size === 0) tags.forEach((t) => set.add(t.name));
    if (set.has(tag)) set.delete(tag);
    else set.add(tag);
    saveTags(opt.id, toCsv(set));
  };

  const setAllForOption = (opt: MatrixOption, enable: boolean) => {
    const next = new Set<string>();
    if (enable) tags.forEach((t) => next.add(t.name));
    saveTags(opt.id, toCsv(next));
  };

  const toggleColumn = (tag: string) => {
    // 過半数 ON なら全 OFF、そうでなければ全 ON
    const onCount = options.filter((o) => isChecked(o, tag)).length;
    const enable = onCount < options.length / 2;
    options.forEach((opt) => {
      const set = new Set(parseCsv(opt.appliesToTags));
      if (set.size === 0) tags.forEach((t) => set.add(t.name));
      if (enable) set.add(tag);
      else set.delete(tag);
      saveTags(opt.id, toCsv(set));
    });
  };

  // ── 検索フィルタ ──
  const q = search.trim().toLowerCase();
  const filteredOptions = q
    ? options.filter(
        (o) => o.name.toLowerCase().includes(q) || o.category.toLowerCase().includes(q),
      )
    : options;
  const filteredTags = q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags;

  // ── 状態分岐 ──
  if (loading) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 13, color: color.textMuted }}>マトリックスを読み込み中…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ ...cardStyle, padding: 20 }}>
        <div style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 10 }}>{loadError}</div>
        <button type="button" onClick={reload} style={pillBtnStyle}>
          再読み込み
        </button>
      </div>
    );
  }

  if (options.length === 0 || tags.length === 0) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: 30 }}>
        {options.length === 0 && (
          <div style={{ fontSize: 13, color: color.textMuted, marginBottom: 6 }}>
            カスタマイズオプションが未登録です。
          </div>
        )}
        {tags.length === 0 && (
          <div style={{ fontSize: 13, color: color.textMuted }}>
            商品タグが検出できません（全商品でタグ未設定の可能性）。
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      {/* ヘッダー */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>
            カスタマイズマトリックス
          </div>
          <div style={{ fontSize: 11, color: color.textMuted, marginTop: 2 }}>
            商品タグ {tags.length} 種 × オプション {options.length} 件 = 最大 {tags.length * options.length} セル
          </div>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="タグ・オプション名で絞り込み"
          style={{ ...inputStyle, maxWidth: 260 }}
          aria-label="タグ・オプション名で絞り込み"
        />
      </div>

      <div style={{ fontSize: 11, color: color.textMuted, marginBottom: 10, lineHeight: 1.6 }}>
        ✅ チェックあり = そのオプションが、その商品タグの付いた商品詳細ページに表示されます。
        <br />
        すべてチェックあり = そのオプションは全商品に表示されます。変更は自動保存されます（約 0.3 秒）。
      </div>

      {/* マトリックス本体 */}
      <div
        style={{
          overflow: 'auto',
          maxHeight: '65vh',
          border: `1px solid ${color.border}`,
          borderRadius: 6,
        }}
      >
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 11 }}>
          <thead>
            <tr>
              <th
                style={{
                  position: 'sticky',
                  top: 0,
                  left: 0,
                  zIndex: 3,
                  background: color.bg1,
                  padding: '8px 10px',
                  borderBottom: `1px solid ${color.border}`,
                  borderRight: `1px solid ${color.border}`,
                  textAlign: 'left',
                  color: color.textMuted,
                  fontSize: 10,
                  minWidth: 220,
                }}
              >
                オプション ＼ タグ
              </th>
              {filteredTags.map((tag) => (
                <th
                  key={tag.name}
                  onClick={() => toggleColumn(tag.name)}
                  title={`列一括トグル: ${tag.name}（${tag.productCount} 件）`}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    background: color.bg1,
                    padding: '8px 6px',
                    borderBottom: `1px solid ${color.border}`,
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    cursor: 'pointer',
                    minWidth: 30,
                    maxHeight: 120,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tag.name}
                  <span style={{ color: color.textMuted, fontWeight: 400 }}>
                    {' '}
                    ({tag.productCount})
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredOptions.map((opt) => {
              const isSaving = !!savingMap[opt.id];
              return (
                <tr key={opt.id}>
                  <td
                    style={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                      background: color.bg0,
                      padding: '8px 10px',
                      borderBottom: `1px solid ${color.border}`,
                      borderRight: `1px solid ${color.border}`,
                      color: '#fff',
                      minWidth: 220,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {opt.name}
                        </div>
                        <div style={{ fontSize: 9, color: color.textMuted }}>{opt.category}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAllForOption(opt, true)}
                        title="全タグを対象にする"
                        style={pillBtnStyle}
                      >
                        全ON
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllForOption(opt, false)}
                        title="全タグから外す"
                        style={pillBtnStyle}
                      >
                        全OFF
                      </button>
                      {isSaving && (
                        <span
                          style={{ fontSize: 10, color: color.cyan }}
                          aria-label="保存中"
                          title="保存中"
                        >
                          ●
                        </span>
                      )}
                    </div>
                  </td>
                  {filteredTags.map((tag) => {
                    const checked = isChecked(opt, tag.name);
                    return (
                      <td
                        key={tag.name}
                        style={{
                          textAlign: 'center',
                          padding: 0,
                          borderBottom: `1px solid ${color.border}`,
                          background: checked ? 'rgba(0,240,255,0.08)' : 'transparent',
                          minWidth: 30,
                        }}
                      >
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 30,
                            height: 30,
                            cursor: 'pointer',
                          }}
                          aria-label={`${opt.name} を ${tag.name} に ${checked ? '適用しない' : '適用する'}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCell(opt, tag.name)}
                            style={{ accentColor: color.cyan, cursor: 'pointer' }}
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 凡例 */}
      <div
        style={{
          fontSize: 10,
          color: color.textMuted,
          marginTop: 10,
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <span>● 保存中</span>
        <span>行ヘッダ: 全ON / 全OFF ショートカット</span>
        <span>列ヘッダクリック: そのタグを全オプションで一括トグル</span>
      </div>
    </div>
  );
}
