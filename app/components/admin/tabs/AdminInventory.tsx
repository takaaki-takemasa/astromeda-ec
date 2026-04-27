/**
 * AdminInventory — 在庫管理タブ (patch 0160)
 *
 * 双方向同期:
 *  - 起動時に Shopify から最新の在庫数を取得
 *  - 在庫数を直接編集 → Shopify に即反映
 *  - 「最新を取り直す」ボタンで Shopify 側の手動変更も即取得
 *  - 一括選択 → 一括 +N / -N
 *  - 低在庫 (<= 5) を赤色ハイライト
 */
import {useEffect, useState, useCallback, useMemo} from 'react';
import {color, radius, space} from '~/lib/design-tokens';
import {useToast} from '~/components/admin/ds/Toast';
import {AdminListSkeleton, AdminEmptyCard} from '~/components/admin/ds/InlineListState';
import {TabHeaderHint} from '~/components/admin/ds/TabHeaderHint';

interface InventoryLevel {
  inventoryLevelId: string;
  locationId: string;
  locationName: string;
  available: number;
  incoming: number;
  committed: number;
  onHand: number;
}

interface InventoryItem {
  variantId: string;
  variantTitle: string;
  sku: string | null;
  price: string;
  updatedAt: string;
  product: {
    id: string;
    title: string;
    handle: string;
    featuredImage: {url: string; altText: string | null} | null;
    status: string;
  };
  inventoryItemId: string | null;
  tracked: boolean;
  levels: InventoryLevel[];
  totalAvailable: number;
}

interface LocationInfo {
  id: string;
  name: string;
  isActive: boolean;
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

const LOW_STOCK_THRESHOLD = 5;

const cardStyle: React.CSSProperties = {
  background: color.bg1,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  padding: space[4],
  marginBottom: space[3],
};

const inputStyle: React.CSSProperties = {
  width: 80,
  padding: '6px 8px',
  background: color.bg0,
  border: `1px solid ${color.border}`,
  borderRadius: 4,
  color: color.text,
  fontSize: 13,
  fontFamily: 'inherit',
  textAlign: 'right',
};

function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const meta = document.querySelector<HTMLMetaElement>('meta[name="_csrf"]');
  return meta?.content || '';
}

async function api(method: 'GET' | 'POST', body?: Record<string, unknown>, url = '/api/admin/inventory') {
  const init: RequestInit = {method, credentials: 'include', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken()}};
  // patch 0169-fu: CSRF は X-CSRF-Token header のみ。body に _csrf を入れると Zod .strict() が
  // unknown key として reject し「リクエストの形式が不正です」エラーになる。
  if (body && method === 'POST') init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  return res.json().catch(() => ({success: false, error: `HTTP ${res.status}`})) as Promise<{success: boolean; [k: string]: unknown}>;
}

export default function AdminInventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'low' | 'out'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set()); // variantId
  const [editing, setEditing] = useState<Record<string, number>>({}); // variantId -> draft quantity
  const [pageInfo, setPageInfo] = useState<PageInfo>({hasNextPage: false, endCursor: null});
  const [busy, setBusy] = useState(false);
  const {pushToast, Toast} = useToast();

  const refresh = useCallback(async (query?: string, cursor?: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('limit', '50');
    if (query) params.set('query', query);
    if (cursor) params.set('cursor', cursor);
    try {
      const res = await api('GET', undefined, `/api/admin/inventory?${params.toString()}`);
      if (res.success) {
        setItems(res.items as InventoryItem[]);
        setLocations(res.locations as LocationInfo[]);
        setPageInfo(res.pageInfo as PageInfo);
        setEditing({});
      } else {
        pushToast(`在庫取得に失敗: ${String(res.error || '')}`, 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (filterMode === 'low') list = list.filter((i) => i.totalAvailable > 0 && i.totalAvailable <= LOW_STOCK_THRESHOLD);
    if (filterMode === 'out') list = list.filter((i) => i.totalAvailable <= 0);
    return list;
  }, [items, filterMode]);

  const toggleSelect = (variantId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filteredItems.length) setSelected(new Set());
    else setSelected(new Set(filteredItems.map((i) => i.variantId)));
  };

  const handleSetSingle = async (item: InventoryItem, level: InventoryLevel) => {
    const editKey = `${item.variantId}@${level.locationId}`;
    const newQty = editing[editKey];
    if (newQty === undefined || newQty === level.available) return;
    if (!item.inventoryItemId) {
      pushToast('在庫追跡が無効な商品です', 'error');
      return;
    }
    setBusy(true);
    const res = await api('POST', {
      action: 'set',
      inventoryItemId: item.inventoryItemId,
      locationId: level.locationId,
      quantity: newQty,
    });
    setBusy(false);
    if (res.success) {
      pushToast(`${item.product.title} を ${newQty} 個に更新`, 'success');
      void refresh(searchQuery);
    } else {
      pushToast(`更新失敗: ${String(res.error || '')}`, 'error');
    }
  };

  const handleBulkAdjust = async (delta: number) => {
    if (selected.size === 0) return;
    if (!confirm(`選択した ${selected.size} 件の在庫を ${delta > 0 ? '+' : ''}${delta} 個 ${delta > 0 ? '増やします' : '減らします'}。よろしいですか?`)) return;
    setBusy(true);
    // 各 variant の最初のロケーションに対して adjust を発行
    const changes: Array<{inventoryItemId: string; locationId: string; delta: number}> = [];
    selected.forEach((variantId) => {
      const item = items.find((i) => i.variantId === variantId);
      if (!item || !item.inventoryItemId) return;
      const lvl = item.levels[0];
      if (!lvl) return;
      changes.push({inventoryItemId: item.inventoryItemId, locationId: lvl.locationId, delta});
    });
    if (changes.length === 0) {
      pushToast('変更可能な商品がありません', 'error');
      setBusy(false);
      return;
    }
    const res = await api('POST', {action: 'bulk_adjust', changes});
    setBusy(false);
    if (res.success) {
      pushToast(`${changes.length} 件の在庫を ${delta > 0 ? '+' : ''}${delta} 個 調整しました`, 'success');
      setSelected(new Set());
      void refresh(searchQuery);
    } else {
      pushToast(`一括調整失敗: ${String(res.error || '')}`, 'error');
    }
  };

  const stockColor = (available: number): string => {
    if (available <= 0) return '#FF2D55';
    if (available <= LOW_STOCK_THRESHOLD) return '#FF9500';
    return '#00E676';
  };

  return (
    <div style={{padding: space[4]}}>
      <TabHeaderHint
        title="📦 在庫管理"
        description="商品の在庫数を確認・編集します。Shopify 側の在庫と双方向で同期します。低在庫 (5 個以下) は黄色、在庫切れは赤色で表示します。"
      />
      <Toast />

      {/* ツールバー */}
      <div style={cardStyle}>
        <div style={{display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', marginBottom: space[2]}}>
          <input
            type="search"
            placeholder="商品名・SKU で検索"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && refresh(searchQuery)}
            style={{
              flex: 1,
              minWidth: 200,
              padding: '8px 12px',
              background: color.bg0,
              border: `1px solid ${color.border}`,
              borderRadius: 6,
              color: color.text,
              fontSize: 13,
            }}
          />
          <button onClick={() => refresh(searchQuery)} disabled={busy || loading} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#000',
            background: '#00F0FF', border: 'none', borderRadius: 6, cursor: 'pointer',
          }}>🔄 検索/最新を取得</button>
        </div>

        <div style={{display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap'}}>
          <span style={{fontSize: 11, color: color.textMuted}}>表示:</span>
          {(['all', 'low', 'out'] as const).map((m) => (
            <button key={m} onClick={() => setFilterMode(m)} style={{
              padding: '4px 12px', fontSize: 11, fontWeight: 600,
              color: filterMode === m ? '#000' : color.textMuted,
              background: filterMode === m ? '#00F0FF' : 'transparent',
              border: `1px solid ${filterMode === m ? '#00F0FF' : color.border}`,
              borderRadius: 4, cursor: 'pointer',
            }}>
              {m === 'all' ? '全て' : m === 'low' ? `低在庫 (≤${LOW_STOCK_THRESHOLD})` : '在庫切れ'}
            </button>
          ))}
          <span style={{flex: 1}} />
          {selected.size > 0 && (
            <>
              <span style={{fontSize: 11, color: color.cyan, fontWeight: 700}}>{selected.size} 件選択中</span>
              <button onClick={() => handleBulkAdjust(+10)} disabled={busy} style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#00E676',
                background: 'transparent', border: '1px solid #00E67666', borderRadius: 4, cursor: 'pointer',
              }}>＋10 個</button>
              <button onClick={() => handleBulkAdjust(-1)} disabled={busy} style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#FF9500',
                background: 'transparent', border: '1px solid #FF950066', borderRadius: 4, cursor: 'pointer',
              }}>－1 個</button>
            </>
          )}
        </div>
      </div>

      {/* リスト */}
      {loading ? (
        <AdminListSkeleton rows={5} />
      ) : filteredItems.length === 0 ? (
        <AdminEmptyCard title="在庫データがありません" description="検索条件を変えるか、Shopify に商品を登録してください。" />
      ) : (
        <div style={cardStyle}>
          <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 12}}>
            <thead>
              <tr style={{textAlign: 'left', borderBottom: `1px solid ${color.border}`}}>
                <th style={{padding: '8px 6px', width: 30}}>
                  <input type="checkbox"
                    checked={selected.size === filteredItems.length && filteredItems.length > 0}
                    onChange={selectAll}
                    aria-label="全選択" />
                </th>
                <th style={{padding: '8px 6px', fontWeight: 700, color: color.textMuted}}>商品</th>
                <th style={{padding: '8px 6px', fontWeight: 700, color: color.textMuted}}>SKU</th>
                <th style={{padding: '8px 6px', fontWeight: 700, color: color.textMuted}}>場所</th>
                <th style={{padding: '8px 6px', fontWeight: 700, color: color.textMuted, textAlign: 'right'}}>在庫数</th>
                <th style={{padding: '8px 6px', fontWeight: 700, color: color.textMuted, textAlign: 'right'}}>編集</th>
                <th style={{padding: '8px 6px', fontWeight: 700, color: color.textMuted}}>更新</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.flatMap((item) => {
                const isOnly1Level = item.levels.length <= 1;
                if (item.levels.length === 0) {
                  return [(
                    <tr key={item.variantId} style={{borderBottom: `1px solid ${color.border}`}}>
                      <td style={{padding: '10px 6px'}}>
                        <input type="checkbox" checked={selected.has(item.variantId)}
                          onChange={() => toggleSelect(item.variantId)} aria-label={`${item.product.title} を選択`} />
                      </td>
                      <td colSpan={6} style={{padding: '10px 6px', color: color.textMuted, fontStyle: 'italic'}}>
                        {item.product.title} ({item.variantTitle}) - 在庫追跡が無効
                      </td>
                    </tr>
                  )];
                }
                return item.levels.map((level, idx) => {
                  const editKey = `${item.variantId}@${level.locationId}`;
                  const draftQty = editing[editKey];
                  const isModified = draftQty !== undefined && draftQty !== level.available;
                  return (
                    <tr key={`${item.variantId}-${level.locationId}`} style={{borderBottom: `1px solid ${color.border}`, opacity: item.product.status === 'ARCHIVED' ? 0.5 : 1}}>
                      {idx === 0 ? (
                        <>
                          <td rowSpan={item.levels.length} style={{padding: '10px 6px', verticalAlign: 'top'}}>
                            <input type="checkbox" checked={selected.has(item.variantId)}
                              onChange={() => toggleSelect(item.variantId)} aria-label={`${item.product.title} を選択`} />
                          </td>
                          <td rowSpan={item.levels.length} style={{padding: '10px 6px', verticalAlign: 'top'}}>
                            <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                              {item.product.featuredImage?.url && (
                                <img src={item.product.featuredImage.url} alt="" width={36} height={36}
                                  style={{borderRadius: 4, objectFit: 'cover', flexShrink: 0}} />
                              )}
                              <div>
                                <div style={{color: color.text, fontWeight: 600}}>{item.product.title}</div>
                                {item.variantTitle && item.variantTitle !== 'Default Title' && (
                                  <div style={{color: color.textMuted, fontSize: 10}}>{item.variantTitle}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td rowSpan={item.levels.length} style={{padding: '10px 6px', verticalAlign: 'top', fontFamily: 'monospace', color: color.textMuted}}>
                            {item.sku || '-'}
                          </td>
                        </>
                      ) : null}
                      <td style={{padding: '10px 6px', color: color.textMuted}}>{level.locationName}</td>
                      <td style={{padding: '10px 6px', textAlign: 'right'}}>
                        <span style={{
                          color: stockColor(level.available),
                          fontWeight: 700,
                          fontSize: 14,
                        }}>
                          {level.available}
                        </span>
                        {level.incoming > 0 && (
                          <span style={{color: color.textMuted, fontSize: 10, marginLeft: 4}}>(+{level.incoming} 入荷予定)</span>
                        )}
                      </td>
                      <td style={{padding: '10px 6px', textAlign: 'right'}}>
                        <input
                          type="number"
                          min={0}
                          value={draftQty !== undefined ? draftQty : level.available}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            setEditing((p) => ({...p, [editKey]: Number.isFinite(v) ? v : 0}));
                          }}
                          style={inputStyle}
                          aria-label={`${item.product.title} の在庫数`}
                        />
                        {isModified && (
                          <button onClick={() => handleSetSingle(item, level)} disabled={busy} style={{
                            padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#000',
                            background: '#00E676', border: 'none', borderRadius: 4, cursor: 'pointer', marginLeft: 4,
                          }}>保存</button>
                        )}
                      </td>
                      {idx === 0 ? (
                        <td rowSpan={item.levels.length} style={{padding: '10px 6px', verticalAlign: 'top', color: color.textMuted, fontSize: 10}}>
                          {new Date(item.updatedAt).toLocaleString('ja-JP', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'})}
                        </td>
                      ) : null}
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ページング */}
      {pageInfo.hasNextPage && pageInfo.endCursor && (
        <div style={{textAlign: 'center', marginTop: space[3]}}>
          <button onClick={() => refresh(searchQuery, pageInfo.endCursor || undefined)} disabled={busy || loading} style={{
            padding: '8px 24px', fontSize: 12, fontWeight: 600, color: color.text,
            background: 'transparent', border: `1px solid ${color.border}`, borderRadius: 6, cursor: 'pointer',
          }}>次の 50 件を読み込む →</button>
        </div>
      )}

      {/* 凡例 */}
      <div style={{fontSize: 10, color: color.textMuted, marginTop: space[3], textAlign: 'center'}}>
        🟢 十分 (≥6) ・ 🟡 低在庫 (1-5) ・ 🔴 在庫切れ (0)
        ・ 編集 → 保存ボタンで Shopify に即反映 ・ Shopify 側の変更は「最新を取得」で取り直し
      </div>

      {/* 拠点情報 */}
      {locations.length > 1 && (
        <div style={{...cardStyle, marginTop: space[3], fontSize: 11}}>
          <strong style={{color: color.text}}>📍 在庫拠点 ({locations.length})</strong>
          <div style={{marginTop: 4, color: color.textMuted}}>
            {locations.map((l) => l.name).join(' / ')}
          </div>
        </div>
      )}
    </div>
  );
}
