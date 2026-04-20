/**
 * AdminDiscounts Tab — 割引コード CRUD (patch 0069)
 *
 * CEO 指摘「Shopify admin を開かせず管理画面で完結させたい」P5。
 * Shopify Discount Code Basic を admin から一覧・作成・削除できるタブ。
 *
 * 効果器: キャンペーン配信（心臓→末梢へホルモンを流すホルモン分泌器）
 *
 * MVP スコープ:
 *  - 割引コード Basic のみ対応（Code 入力で適用）
 *  - 種別: percentage(%OFF) or fixed_amount(¥OFF)
 *  - 一覧 / 新規作成 / 削除（編集は MVP 外）
 *  - 全顧客対象 / 全商品対象（CustomerGets All）固定
 *
 * 未対応（将来 patch 0070+）:
 *  - Code App / Bxgy / Automatic Basic / Automatic Bxgy
 *  - 顧客セグメント / 商品/コレクション限定 / 1注文上限
 *
 * 必要 Shopify scope: read_discounts, write_discounts
 */

import {useState, useEffect, useCallback, useMemo} from 'react';
import {color, font, radius, space} from '~/lib/design-tokens';
import {Modal} from '~/components/admin/Modal';
import {useConfirmDialog} from '~/hooks/useConfirmDialog';
import {AdminListSkeleton} from '~/components/admin/ds/InlineListState';

// ━━━ Types ━━━

interface DiscountItem {
  id: string;
  title: string;
  code: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  usageLimit: number | null;
  asyncUsageCount: number;
  kind: 'percentage' | 'fixed_amount' | 'unknown';
  percentage: number | null;
  fixedAmount: number | null;
  appliesToAllCustomers: boolean;
  summary: string;
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

type Kind = 'percentage' | 'fixed_amount';

interface FormState {
  title: string;
  code: string;
  kind: Kind;
  /** 0〜100 (UI %) — API へは /100 して 0〜1 で送る */
  percentage: number;
  fixedAmount: number;
  /** datetime-local の値（YYYY-MM-DDTHH:mm） */
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  appliesOncePerCustomer: boolean;
}

function defaultStartsAt(): string {
  // 今日の 00:00（datetime-local 形式）
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T00:00`;
}

function emptyForm(): FormState {
  return {
    title: '',
    code: '',
    kind: 'percentage',
    percentage: 10,
    fixedAmount: 1000,
    startsAt: defaultStartsAt(),
    endsAt: '',
    usageLimit: '',
    appliesOncePerCustomer: false,
  };
}

// ━━━ Styles ━━━

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: color.bg0,
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  color: color.text,
  fontSize: font.sm,
  fontFamily: font.family,
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: font.xs,
  color: color.textMuted,
  display: 'block',
  marginBottom: '4px',
  fontWeight: 500,
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 20px',
  background: color.cyan,
  color: '#000',
  border: 'none',
  borderRadius: radius.md,
  fontSize: font.sm,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: font.family,
};

const btnOutline: React.CSSProperties = {
  padding: '8px 20px',
  background: 'transparent',
  color: color.textMuted,
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  fontSize: font.sm,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: font.family,
};

const btnDanger: React.CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  color: color.red,
  border: `1px solid ${color.red}`,
  borderRadius: radius.sm,
  fontSize: font.xs,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: font.family,
};

// ━━━ Status / Kind ラベル ━━━

function statusLabel(s: string): {label: string; bg: string; fg: string} {
  switch (s) {
    case 'ACTIVE':
      return {label: '有効', bg: 'rgba(0,255,160,.12)', fg: '#00d68f'};
    case 'SCHEDULED':
      return {label: '予定', bg: 'rgba(0,200,255,.12)', fg: color.cyan};
    case 'EXPIRED':
      return {label: '終了', bg: 'rgba(160,160,160,.12)', fg: color.textMuted};
    default:
      return {label: s, bg: 'rgba(160,160,160,.12)', fg: color.textMuted};
  }
}

function kindBadge(k: DiscountItem['kind'], pct: number | null, amt: number | null): string {
  if (k === 'percentage' && pct !== null) return `${Math.round(pct * 100)}% OFF`;
  if (k === 'fixed_amount' && amt !== null) return `¥${amt.toLocaleString()} OFF`;
  return '—';
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${dd} ${hh}:${mm}`;
}

// ━━━ API helpers ━━━

async function apiList(
  cursor: string | null,
): Promise<{items: DiscountItem[]; pageInfo: PageInfo}> {
  const params = new URLSearchParams({limit: '50'});
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`/api/admin/discounts?${params.toString()}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'API error');
  return {
    items: json.discounts ?? [],
    pageInfo: json.pageInfo ?? {hasNextPage: false, endCursor: null},
  };
}

async function apiAction(
  body: Record<string, unknown>,
): Promise<{
  success: boolean;
  error?: string;
  details?: string[];
  id?: string;
  code?: string;
  title?: string;
  notFound?: boolean;
}> {
  const res = await fetch('/api/admin/discounts', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  return res.json();
}

// ━━━ Toast ━━━

function Toast({msg, type}: {msg: string; type: 'ok' | 'err'}) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        padding: '10px 20px',
        borderRadius: radius.md,
        fontSize: font.sm,
        fontWeight: 600,
        color: type === 'ok' ? '#000' : '#fff',
        background: type === 'ok' ? color.cyan : color.red,
        zIndex: 200,
        boxShadow: '0 4px 20px rgba(0,0,0,.5)',
      }}
    >
      {msg}
    </div>
  );
}

// ━━━ Helper: datetime-local → ISO 8601 ━━━

function localDateTimeToIso(local: string): string {
  // datetime-local の値は "YYYY-MM-DDTHH:mm" でローカルタイム扱い。
  // new Date(local) はローカル解釈→ ISO（UTC）に変換。
  if (!local) return '';
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

// ━━━ Main Component ━━━

export default function AdminDiscounts() {
  const [list, setList] = useState<DiscountItem[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo>({hasNextPage: false, endCursor: null});
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([null]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{msg: string; type: 'ok' | 'err'} | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const {confirm: confirmDialog, dialogProps, ConfirmDialog: Dialog} = useConfirmDialog();

  const showToast = useCallback((msg: string, type: 'ok' | 'err') => {
    setToast({msg, type});
    setTimeout(() => setToast(null), 3500);
  }, []);

  const currentCursor = cursorHistory[cursorHistory.length - 1];

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {items, pageInfo: pi} = await apiList(currentCursor);
      setList(items);
      setPageInfo(pi);
    } catch (e) {
      setError(e instanceof Error ? e.message : '取得失敗');
    } finally {
      setLoading(false);
    }
  }, [currentCursor]);

  useEffect(() => {
    reload();
  }, [reload]);

  const nextPage = useCallback(() => {
    if (!pageInfo.hasNextPage || !pageInfo.endCursor) return;
    setCursorHistory((h) => [...h, pageInfo.endCursor]);
  }, [pageInfo]);

  const prevPage = useCallback(() => {
    setCursorHistory((h) => (h.length <= 1 ? h : h.slice(0, -1)));
  }, []);

  const openNew = useCallback(() => {
    setForm(emptyForm());
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setForm(emptyForm());
  }, []);

  const handleSave = useCallback(async () => {
    const title = form.title.trim();
    const code = form.code.trim().toUpperCase();
    if (!title) {
      showToast('タイトルは必須です', 'err');
      return;
    }
    if (!code) {
      showToast('割引コードは必須です', 'err');
      return;
    }
    if (!/^[A-Z0-9_\-]+$/.test(code)) {
      showToast('割引コードは英数字・アンダースコア・ハイフンのみ', 'err');
      return;
    }
    if (code.length > 40) {
      showToast('割引コードは 40 文字以内', 'err');
      return;
    }
    if (!form.startsAt) {
      showToast('開始日時は必須です', 'err');
      return;
    }
    const startsAtIso = localDateTimeToIso(form.startsAt);
    if (!startsAtIso) {
      showToast('開始日時の形式が不正です', 'err');
      return;
    }
    let endsAtIso: string | null = null;
    if (form.endsAt) {
      endsAtIso = localDateTimeToIso(form.endsAt);
      if (!endsAtIso) {
        showToast('終了日時の形式が不正です', 'err');
        return;
      }
      if (new Date(endsAtIso).getTime() <= new Date(startsAtIso).getTime()) {
        showToast('終了日時は開始日時より後に設定してください', 'err');
        return;
      }
    }
    const usageLimit = form.usageLimit.trim() ? Number(form.usageLimit) : null;
    if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit <= 0)) {
      showToast('使用回数上限は正の整数で入力してください', 'err');
      return;
    }

    let payload: Record<string, unknown>;
    if (form.kind === 'percentage') {
      const pct = Number(form.percentage);
      if (!(pct > 0 && pct <= 100)) {
        showToast('割引率は 1〜100% の範囲で入力してください', 'err');
        return;
      }
      payload = {
        action: 'create',
        title,
        code,
        kind: 'percentage',
        percentage: pct / 100,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        usageLimit,
        appliesOncePerCustomer: form.appliesOncePerCustomer,
      };
    } else {
      const amt = Number(form.fixedAmount);
      if (!(amt > 0)) {
        showToast('割引額は 0 より大きい数値で入力してください', 'err');
        return;
      }
      payload = {
        action: 'create',
        title,
        code,
        kind: 'fixed_amount',
        fixedAmount: amt,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        usageLimit,
        appliesOncePerCustomer: form.appliesOncePerCustomer,
      };
    }

    setSaving(true);
    const res = await apiAction(payload);
    setSaving(false);
    if (res.success) {
      showToast(`割引コード「${res.code ?? code}」を作成しました`, 'ok');
      closeModal();
      // 新規作成後は先頭ページへ
      setCursorHistory([null]);
      reload();
    } else {
      const detail = res.details?.join(', ');
      showToast(`作成失敗: ${res.error ?? 'unknown'}${detail ? ` (${detail})` : ''}`, 'err');
    }
  }, [form, showToast, closeModal, reload]);

  const handleDelete = useCallback(
    async (d: DiscountItem) => {
      const used = d.asyncUsageCount > 0;
      const ok = await confirmDialog({
        title: '割引コードを削除しますか？',
        message: used
          ? `「${d.code}」(${d.title}) は ${d.asyncUsageCount} 回使用されています。削除すると履歴は残りますが、今後この割引コードは使えなくなります。`
          : `「${d.code}」(${d.title}) を削除します。この操作は取り消せません。`,
        confirmLabel: '削除する',
        destructive: true,
        contextPath: ['コマース', '🛍️ 商品・販売', '🎟️ 割引コード'],
      });
      if (!ok) return;
      const res = await apiAction({action: 'delete', id: d.id, confirm: true});
      if (res.success) {
        showToast(res.notFound ? 'すでに存在しませんでした（idempotent）' : '削除しました', 'ok');
        reload();
      } else {
        showToast(`削除失敗: ${res.error ?? 'unknown'}`, 'err');
      }
    },
    [confirmDialog, showToast, reload],
  );

  const pageCount = cursorHistory.length;
  const rows = useMemo(() => list, [list]);

  // ━━━ Render ━━━
  return (
    <div style={{padding: space[4], color: color.text, fontFamily: font.family}}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: space[4],
          flexWrap: 'wrap',
          gap: space[2],
        }}
      >
        <div>
          <h1 style={{fontSize: font.xl, fontWeight: 700, margin: 0}}>🎟️ 割引コード</h1>
          <p
            style={{
              fontSize: font.sm,
              color: color.textMuted,
              marginTop: '6px',
              maxWidth: 720,
            }}
          >
            割引コード（チェックアウト時にお客様が入力するコード）を管理します。例:
            <code style={{margin: '0 4px', color: color.cyan}}>SPRING10</code>
            で 10% OFF、
            <code style={{margin: '0 4px', color: color.cyan}}>WELCOME1000</code>
            で ¥1,000 OFF など。Shopify
            管理画面の「ストア → 割引」と同期します。
          </p>
        </div>
        <button type="button" style={btnPrimary} onClick={openNew}>
          ＋ 新規割引コード
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: space[3],
            background: 'rgba(255,80,80,0.1)',
            border: `1px solid ${color.red}`,
            borderRadius: radius.md,
            color: color.red,
            marginBottom: space[3],
          }}
        >
          エラー: {error}
        </div>
      )}

      {/* List table */}
      <div
        style={{
          background: color.bg1,
          border: `1px solid ${color.border}`,
          borderRadius: radius.lg,
          overflow: 'hidden',
        }}
      >
        <table style={{width: '100%', borderCollapse: 'collapse', fontSize: font.sm}}>
          <thead>
            <tr style={{background: color.bg0, borderBottom: `1px solid ${color.border}`}}>
              <th
                style={{
                  textAlign: 'left',
                  padding: '10px 14px',
                  fontSize: font.xs,
                  color: color.textMuted,
                  fontWeight: 600,
                  width: 160,
                }}
              >
                コード
              </th>
              <th
                style={{
                  textAlign: 'left',
                  padding: '10px 14px',
                  fontSize: font.xs,
                  color: color.textMuted,
                  fontWeight: 600,
                }}
              >
                タイトル
              </th>
              <th
                style={{
                  textAlign: 'left',
                  padding: '10px 14px',
                  fontSize: font.xs,
                  color: color.textMuted,
                  fontWeight: 600,
                  width: 110,
                }}
              >
                割引
              </th>
              <th
                style={{
                  textAlign: 'left',
                  padding: '10px 14px',
                  fontSize: font.xs,
                  color: color.textMuted,
                  fontWeight: 600,
                  width: 80,
                }}
              >
                状態
              </th>
              <th
                style={{
                  textAlign: 'left',
                  padding: '10px 14px',
                  fontSize: font.xs,
                  color: color.textMuted,
                  fontWeight: 600,
                  width: 110,
                }}
              >
                利用
              </th>
              <th
                style={{
                  textAlign: 'left',
                  padding: '10px 14px',
                  fontSize: font.xs,
                  color: color.textMuted,
                  fontWeight: 600,
                  width: 200,
                }}
              >
                期間
              </th>
              <th
                style={{
                  textAlign: 'right',
                  padding: '10px 14px',
                  fontSize: font.xs,
                  color: color.textMuted,
                  fontWeight: 600,
                  width: 90,
                }}
              >
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} style={{padding: 0}}>
                  <AdminListSkeleton rows={5} />
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{padding: 0}}>
                  <div
                    style={{
                      padding: `${space[6]}px ${space[4]}px`,
                      textAlign: 'center',
                      background: color.bg1,
                      border: `1px dashed ${color.border}`,
                      borderRadius: radius.md,
                      margin: space[3],
                    }}
                  >
                    <div style={{fontSize: 32, marginBottom: space[2]}}>🎟️</div>
                    <div style={{fontSize: font.md, fontWeight: 700, color: color.text, marginBottom: space[1]}}>
                      割引コードはまだありません
                    </div>
                    <div style={{fontSize: font.sm, color: color.textMuted}}>
                      期間限定セールやキャンペーン配信用の割引コードを作成すると、ここに一覧表示されます。右上の「＋ 新規割引コード」から作成できます。
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((d) => {
                const st = statusLabel(d.status);
                return (
                  <tr key={d.id} style={{borderBottom: `1px solid ${color.border}`}}>
                    <td
                      style={{
                        padding: '10px 14px',
                        fontFamily: font.mono,
                        fontSize: font.sm,
                        color: color.cyan,
                        fontWeight: 700,
                      }}
                    >
                      {d.code}
                    </td>
                    <td
                      style={{
                        padding: '10px 14px',
                        color: color.text,
                        maxWidth: 320,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={d.title}
                    >
                      {d.title}
                    </td>
                    <td style={{padding: '10px 14px', color: color.text, fontWeight: 600}}>
                      {kindBadge(d.kind, d.percentage, d.fixedAmount)}
                    </td>
                    <td style={{padding: '10px 14px'}}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: radius.sm,
                          fontSize: font.xs,
                          fontWeight: 600,
                          background: st.bg,
                          color: st.fg,
                        }}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td style={{padding: '10px 14px', color: color.textMuted, fontSize: font.xs}}>
                      {d.asyncUsageCount}
                      {d.usageLimit !== null ? ` / ${d.usageLimit}` : ' / ∞'}
                    </td>
                    <td style={{padding: '10px 14px', color: color.textMuted, fontSize: font.xs}}>
                      {formatDate(d.startsAt)}
                      <br />〜 {d.endsAt ? formatDate(d.endsAt) : '無期限'}
                    </td>
                    <td style={{padding: '10px 14px', textAlign: 'right'}}>
                      <button type="button" style={btnDanger} onClick={() => handleDelete(d)}>
                        削除
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space[3],
          marginTop: space[3],
        }}
      >
        <button type="button" style={btnOutline} disabled={pageCount <= 1} onClick={prevPage} aria-label="前のページ">
          ← 前へ
        </button>
        <span style={{fontSize: font.sm, color: color.textMuted}}>{pageCount} ページ目</span>
        <button type="button" style={btnOutline} disabled={!pageInfo.hasNextPage} onClick={nextPage} aria-label="次のページ">
          次へ →
        </button>
      </div>

      {/* New Modal */}
      {modalOpen && (
        <Modal onClose={closeModal} title="新規割引コードを作成">
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: space[3],
              minWidth: 520,
              maxWidth: 600,
            }}
          >
            {/* Title */}
            <div>
              <label htmlFor="discount-title" style={labelStyle}>
                タイトル（管理用）*
              </label>
              <input
                id="discount-title"
                type="text"
                placeholder="例: 春のキャンペーン 10% OFF"
                value={form.title}
                onChange={(e) => setForm((f) => ({...f, title: e.target.value}))}
                style={inputStyle}
                maxLength={255}
              />
              <p style={{fontSize: font.xs, color: color.textMuted, marginTop: '4px'}}>
                Shopify 管理画面で表示される識別名です。お客様には見えません。
              </p>
            </div>

            {/* Code */}
            <div>
              <label htmlFor="discount-code" style={labelStyle}>
                割引コード（お客様が入力する文字列）*
              </label>
              <input
                id="discount-code"
                type="text"
                placeholder="SPRING10"
                value={form.code}
                onChange={(e) => setForm((f) => ({...f, code: e.target.value.toUpperCase()}))}
                style={{...inputStyle, fontFamily: font.mono, letterSpacing: '0.05em'}}
                maxLength={40}
              />
              <p style={{fontSize: font.xs, color: color.textMuted, marginTop: '4px'}}>
                英数字・アンダースコア・ハイフンのみ（最大 40 文字）。大文字推奨。
              </p>
            </div>

            {/* Kind */}
            <div>
              <span style={labelStyle}>割引の種類 *</span>
              <div style={{display: 'flex', gap: space[2], marginTop: '4px'}}>
                <label
                  style={{
                    flex: 1,
                    padding: space[3],
                    border: `1px solid ${form.kind === 'percentage' ? color.cyan : color.border}`,
                    background: form.kind === 'percentage' ? 'rgba(0,200,255,0.08)' : color.bg0,
                    borderRadius: radius.md,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: space[2],
                    fontSize: font.sm,
                  }}
                >
                  <input
                    type="radio"
                    name="discount-kind"
                    value="percentage"
                    checked={form.kind === 'percentage'}
                    onChange={() => setForm((f) => ({...f, kind: 'percentage'}))}
                  />
                  <span>
                    <strong style={{color: color.text}}>％ OFF</strong>
                    <br />
                    <span style={{fontSize: font.xs, color: color.textMuted}}>
                      合計から %値 を割引
                    </span>
                  </span>
                </label>
                <label
                  style={{
                    flex: 1,
                    padding: space[3],
                    border: `1px solid ${form.kind === 'fixed_amount' ? color.cyan : color.border}`,
                    background: form.kind === 'fixed_amount' ? 'rgba(0,200,255,0.08)' : color.bg0,
                    borderRadius: radius.md,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: space[2],
                    fontSize: font.sm,
                  }}
                >
                  <input
                    type="radio"
                    name="discount-kind"
                    value="fixed_amount"
                    checked={form.kind === 'fixed_amount'}
                    onChange={() => setForm((f) => ({...f, kind: 'fixed_amount'}))}
                  />
                  <span>
                    <strong style={{color: color.text}}>¥ OFF</strong>
                    <br />
                    <span style={{fontSize: font.xs, color: color.textMuted}}>
                      合計から固定金額を割引
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {/* Value */}
            {form.kind === 'percentage' ? (
              <div>
                <label htmlFor="discount-percentage" style={labelStyle}>
                  割引率（％）*
                </label>
                <div style={{display: 'flex', alignItems: 'center', gap: space[2]}}>
                  <input
                    id="discount-percentage"
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={form.percentage}
                    onChange={(e) =>
                      setForm((f) => ({...f, percentage: Number(e.target.value)}))
                    }
                    style={{...inputStyle, maxWidth: 120}}
                  />
                  <span style={{color: color.textMuted, fontSize: font.sm}}>％ OFF</span>
                </div>
                <p style={{fontSize: font.xs, color: color.textMuted, marginTop: '4px'}}>
                  1〜100 の整数で入力。例: 10 で 10% OFF、20 で 20% OFF。
                </p>
              </div>
            ) : (
              <div>
                <label htmlFor="discount-amount" style={labelStyle}>
                  割引額（円）*
                </label>
                <div style={{display: 'flex', alignItems: 'center', gap: space[2]}}>
                  <span style={{color: color.textMuted, fontSize: font.sm}}>¥</span>
                  <input
                    id="discount-amount"
                    type="number"
                    min={1}
                    step={100}
                    value={form.fixedAmount}
                    onChange={(e) =>
                      setForm((f) => ({...f, fixedAmount: Number(e.target.value)}))
                    }
                    style={{...inputStyle, maxWidth: 200}}
                  />
                  <span style={{color: color.textMuted, fontSize: font.sm}}>OFF</span>
                </div>
                <p style={{fontSize: font.xs, color: color.textMuted, marginTop: '4px'}}>
                  カート合計から差し引かれる金額です。例: 1000 で ¥1,000 OFF。
                </p>
              </div>
            )}

            {/* Schedule */}
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3]}}>
              <div>
                <label htmlFor="discount-startsAt" style={labelStyle}>
                  開始日時 *
                </label>
                <input
                  id="discount-startsAt"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({...f, startsAt: e.target.value}))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label htmlFor="discount-endsAt" style={labelStyle}>
                  終了日時（空欄で無期限）
                </label>
                <input
                  id="discount-endsAt"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm((f) => ({...f, endsAt: e.target.value}))}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Usage limit */}
            <div>
              <label htmlFor="discount-usageLimit" style={labelStyle}>
                使用回数の上限（空欄で無制限）
              </label>
              <input
                id="discount-usageLimit"
                type="number"
                min={1}
                step={1}
                placeholder="例: 100"
                value={form.usageLimit}
                onChange={(e) => setForm((f) => ({...f, usageLimit: e.target.value}))}
                style={{...inputStyle, maxWidth: 200}}
              />
              <p style={{fontSize: font.xs, color: color.textMuted, marginTop: '4px'}}>
                このコードが使える回数の総上限。例: 100 を入れると、100 回使われたら自動で無効化。
              </p>
            </div>

            {/* Once per customer */}
            <div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: space[2],
                  fontSize: font.sm,
                  color: color.text,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={form.appliesOncePerCustomer}
                  onChange={(e) =>
                    setForm((f) => ({...f, appliesOncePerCustomer: e.target.checked}))
                  }
                />
                <span>1顧客につき1回のみ使用可能にする</span>
              </label>
              <p
                style={{
                  fontSize: font.xs,
                  color: color.textMuted,
                  marginTop: '4px',
                  marginLeft: 24,
                }}
              >
                チェックを入れると、ログイン済み顧客は同じコードを 2 回以上使えなくなります。
              </p>
            </div>

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: space[2],
                marginTop: space[2],
                paddingTop: space[3],
                borderTop: `1px solid ${color.border}`,
              }}
            >
              <button type="button" style={btnOutline} onClick={closeModal} disabled={saving}>
                キャンセル
              </button>
              <button type="button" style={btnPrimary} onClick={handleSave} disabled={saving}>
                {saving ? '作成中...' : '作成'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm dialog */}
      <Dialog {...dialogProps} />

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}
