/**
 * CustomizationMatrixSection — patch 0056 Phase C 第2段で AdminPageEditor.tsx から切り出し
 *
 * Sprint 5 M2: 商品タグ × カスタマイズ option のマトリックス編集。
 * 行 = カスタマイズ option (astromeda_custom_option)、列 = 全商品から抽出した tag。
 * セルの ON/OFF で option.appliesToTags (CSV) を編集する。
 * 変更は 300ms debounce で /api/admin/customization POST action=update に自動保存される。
 *
 * - 行ヘッダ: 全ON/全OFF ショートカット
 * - 列ヘッダクリック: 列一括トグル（半数以上 ON なら全 OFF、逆なら全 ON）
 * - 空の appliesToTags = 全商品適用 (初回操作時は全タグを展開してから対象タグを外す)
 *
 * 元々 AdminPageEditor.tsx の L834-1160 にインライン定義されていた ~327行を独立ファイル化。
 * 振る舞いは移動前と完全同一。
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {T, al} from '~/lib/astromeda-data';
import {
  type SectionProps,
  cardStyle,
  labelStyle,
  inputStyle,
  btn,
  Spinner,
  apiGet,
  apiPost,
} from './shared';

// ══════════════════════════════════════════════════════════
// CustomizationMatrixSection — Sprint 5 M2
// 商品タグ × カスタマイズ option のマトリックス編集
// ══════════════════════════════════════════════════════════

interface MatrixOption {
  id: string;
  handle: string;
  name: string;
  category: string;
  choices: Array<{value: string; label: string}>;
  isRequired: boolean;
  sortOrder: number;
  appliesToTags: string; // CSV
}

export function CustomizationMatrixSection({pushToast, confirm: _confirm}: SectionProps) {
  const [options, setOptions] = useState<MatrixOption[]>([]);
  const [productTags, setProductTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // 初回ロード: 全商品 (ページネーションで最大 200 件まで) + カスタマイズ option
  const load = useCallback(async () => {
    setLoading(true);
    const optRes = await apiGet<{options: MatrixOption[]}>('/api/admin/customization');
    const allOptions = (optRes?.options || []).sort((a, b) => a.sortOrder - b.sortOrder);

    // 商品タグ収集: 50 件 × 最大 4 ページ = 200 件まで
    type ProductsPageResponse = {
      products: Array<{tags: string[]; cursor: string}>;
      pageInfo: {hasNextPage: boolean; endCursor: string | null};
    };
    const tagSet = new Set<string>();
    let cursor: string | undefined = undefined;
    for (let page = 0; page < 4; page++) {
      const url: string = cursor
        ? `/api/admin/products?limit=50&cursor=${encodeURIComponent(cursor)}`
        : '/api/admin/products?limit=50';
      const res: ProductsPageResponse | null = await apiGet<ProductsPageResponse>(url);
      if (!res) break;
      for (const p of res.products || []) {
        for (const t of p.tags || []) {
          if (t.trim()) tagSet.add(t.trim().toLowerCase());
        }
      }
      if (!res.pageInfo?.hasNextPage) break;
      cursor = res.pageInfo.endCursor || undefined;
      if (!cursor) break;
    }
    const sortedTags = Array.from(tagSet).sort();

    setOptions(allOptions);
    setProductTags(sortedTags);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // セル状態判定: option.appliesToTags (CSV) に tag が含まれるか
  // appliesToTags が空 = 全商品適用なので全セル ON として扱う
  const isChecked = useCallback((opt: MatrixOption, tag: string): boolean => {
    const tags = opt.appliesToTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (tags.length === 0) return true;
    return tags.includes(tag);
  }, []);

  // tag set を更新 + debounce 保存
  const updateOptionTags = useCallback(
    (optId: string, newTagsLower: Set<string>) => {
      const newCsv = Array.from(newTagsLower).sort().join(',');
      setOptions((prev) =>
        prev.map((o) => (o.id === optId ? {...o, appliesToTags: newCsv} : o)),
      );
      if (debounceRef.current[optId]) {
        clearTimeout(debounceRef.current[optId]);
      }
      debounceRef.current[optId] = setTimeout(async () => {
        setSavingMap((prev) => ({...prev, [optId]: true}));
        const res = await apiPost('/api/admin/customization', {
          action: 'update',
          metaobjectId: optId,
          appliesToTags: newCsv,
        });
        setSavingMap((prev) => {
          const next = {...prev};
          delete next[optId];
          return next;
        });
        if (!res.success) {
          pushToast(`保存失敗: ${res.error || 'unknown'}`, 'error');
        }
      }, 300);
    },
    [pushToast],
  );

  const toggleCell = (opt: MatrixOption, tag: string) => {
    const currentTags = new Set(
      opt.appliesToTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
    );
    // 空 = 全適用状態からの初回操作: 全タグを明示セットしたうえで対象タグを抜く
    if (currentTags.size === 0) {
      productTags.forEach((t) => currentTags.add(t));
    }
    if (currentTags.has(tag)) currentTags.delete(tag);
    else currentTags.add(tag);
    updateOptionTags(opt.id, currentTags);
  };

  const setAllForOption = (opt: MatrixOption, enable: boolean) => {
    const next = new Set<string>();
    if (enable) productTags.forEach((t) => next.add(t));
    updateOptionTags(opt.id, next);
  };

  const toggleColumn = (tag: string) => {
    // 全 option で当該 tag の状態を集計 → 半数以上が ON なら全 OFF、それ以外は全 ON
    const onCount = options.filter((o) => isChecked(o, tag)).length;
    const enable = onCount < options.length / 2;
    options.forEach((opt) => {
      const currentTags = new Set(
        opt.appliesToTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
      );
      if (currentTags.size === 0) {
        productTags.forEach((t) => currentTags.add(t));
      }
      if (enable) currentTags.add(tag);
      else currentTags.delete(tag);
      updateOptionTags(opt.id, currentTags);
    });
  };

  // フィルタリング
  const searchLower = search.trim().toLowerCase();
  const filteredOptions = searchLower
    ? options.filter(
        (o) => o.name.toLowerCase().includes(searchLower) || o.category.toLowerCase().includes(searchLower),
      )
    : options;
  const filteredTags = searchLower
    ? productTags.filter((t) => t.includes(searchLower))
    : productTags;

  if (loading) {
    return (
      <div style={cardStyle}>
        <div style={{textAlign: 'center', padding: 40}}>
          <Spinner />
          <div style={{fontSize: 11, color: T.t4, marginTop: 10}}>商品タグ + option を取得中...</div>
        </div>
      </div>
    );
  }

  if (options.length === 0 || productTags.length === 0) {
    return (
      <div style={cardStyle}>
        <div style={{textAlign: 'center', padding: 30, color: T.t4, fontSize: 12}}>
          {options.length === 0 && <div>カスタマイズ option が未登録です。</div>}
          {productTags.length === 0 && <div>商品タグが検出できません（全商品で tags 未設定の可能性）。</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap'}}>
        <div>
          <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>カスタマイズマトリックス</div>
          <div style={{fontSize: 10, color: T.t4, marginTop: 2}}>
            商品タグ {productTags.length} 種 × option {options.length} 件 = {productTags.length * options.length} セル
          </div>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="タグ・option名で絞り込み"
          style={{...inputStyle, maxWidth: 260}}
        />
      </div>

      <div style={{fontSize: 10, color: T.t4, marginBottom: 10}}>
        ※ チェック ON = その option がその商品タグに適用される。空行(全チェック)= 全商品適用。変更は 300ms debounce で自動保存。
      </div>

      <div style={{overflow: 'auto', maxHeight: '65vh', border: `1px solid ${al(T.tx, 0.08)}`, borderRadius: 6}}>
        <table style={{borderCollapse: 'separate', borderSpacing: 0, fontSize: 11}}>
          <thead>
            <tr>
              <th
                style={{
                  position: 'sticky',
                  top: 0,
                  left: 0,
                  zIndex: 3,
                  background: T.bgC,
                  padding: '8px 10px',
                  borderBottom: `1px solid ${al(T.tx, 0.1)}`,
                  borderRight: `1px solid ${al(T.tx, 0.1)}`,
                  textAlign: 'left',
                  color: T.t4,
                  fontSize: 10,
                  minWidth: 200,
                }}
              >
                option ＼ タグ
              </th>
              {filteredTags.map((tag) => (
                <th
                  key={tag}
                  onClick={() => toggleColumn(tag)}
                  title={`列一括トグル: ${tag}`}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    background: T.bgC,
                    padding: '8px 6px',
                    borderBottom: `1px solid ${al(T.tx, 0.1)}`,
                    color: T.t5,
                    fontSize: 9,
                    fontWeight: 700,
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    cursor: 'pointer',
                    minWidth: 28,
                    maxHeight: 100,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tag}
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
                      background: T.bg,
                      padding: '6px 10px',
                      borderBottom: `1px solid ${al(T.tx, 0.05)}`,
                      borderRight: `1px solid ${al(T.tx, 0.1)}`,
                      color: T.tx,
                      minWidth: 200,
                    }}
                  >
                    <div style={{display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                      <div style={{flex: 1, minWidth: 0}}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {opt.name}
                        </div>
                        <div style={{fontSize: 9, color: T.t4}}>{opt.category}</div>
                      </div>
                      <button type="button" onClick={() => setAllForOption(opt, true)} title="全タグ対象化" style={{...btn(), padding: '2px 6px', fontSize: 9}}>
                        全ON
                      </button>
                      <button type="button" onClick={() => setAllForOption(opt, false)} title="全タグ解除" style={{...btn(), padding: '2px 6px', fontSize: 9}}>
                        全OFF
                      </button>
                      {isSaving && <span style={{fontSize: 9, color: T.c}}>●</span>}
                    </div>
                  </td>
                  {filteredTags.map((tag) => {
                    const checked = isChecked(opt, tag);
                    return (
                      <td
                        key={tag}
                        style={{
                          textAlign: 'center',
                          padding: 0,
                          borderBottom: `1px solid ${al(T.tx, 0.05)}`,
                          background: checked ? al(T.c, 0.08) : 'transparent',
                          minWidth: 28,
                        }}
                      >
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCell(opt, tag)}
                            style={{accentColor: T.c, cursor: 'pointer'}}
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

      <div style={{fontSize: 10, color: T.t4, marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap'}}>
        <span>● 保存中</span>
        <span>行ヘッダ: 全ON/全OFF ショートカット</span>
        <span>列ヘッダクリック: 列一括トグル</span>
      </div>
    </div>
  );
}
