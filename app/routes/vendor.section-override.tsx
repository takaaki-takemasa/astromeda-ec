/**
 * /vendor/section-override — ベンダー向けセクション HTML/CSS 上書き編集 (patch 0184 Phase 2)
 *
 * vendor は astromeda_section_override の gpc_* (ゲーミングPC) のみ編集可能。
 * 一覧 + 編集 Modal + iframe ライブプレビューの 3 セクション。
 *
 * patch 0185 (2026-04-27): セクション並び替え (drag & drop + 上下ボタン) + 編集中
 *   textarea 変更時の iframe 自動リロード (1.5s debounce) でリアルタイムプレビューを実現。
 *
 * セキュリティ:
 *  - server side: api.admin.cms に vendor 型ガード (gpc_* のみ許可) — patch 0184 Phase 2 で実装
 *  - HTML は cms-field-validator (patch 0112) + sanitize-html (storefront 描画時) の二重防御
 *  - vendor 以外 (admin/editor/viewer) はこのページに来ない (loader redirect)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { redirect, Link, useLoaderData } from 'react-router';
import type { Route } from './+types/vendor.section-override';
import { AppSession } from '~/lib/session';

interface SectionOverrideRow {
  id: string;
  handle: string;
  fields: Record<string, string>;
  updatedAt?: string;
}

interface VendorOverrideLoaderData {
  username: string;
}

export async function loader({ context, request }: Route.LoaderArgs) {
  try {
    const env = context.env as Env;
    if (!env.SESSION_SECRET) return redirect('/admin/login');
    const sharedSession = (context as unknown as {session?: AppSession}).session;
    const session = sharedSession ?? await AppSession.init(request, [env.SESSION_SECRET]);
    if (session.get('isAdmin') !== true) return redirect('/admin/login?next=/vendor/section-override');
    const role = session.get('role') as string | undefined;
    if (role !== 'vendor' && role !== 'owner') return redirect('/admin');
    return { username: (session.get('username') as string) ?? 'vendor' };
  } catch {
    return redirect('/admin/login');
  }
}

export const meta = () => [
  { title: 'ASTROMEDA | ベンダー — 見た目を変える' },
  { name: 'robots', content: 'noindex, nofollow' },
];

const C = {
  bg: '#0a0e1a', panel: '#11172a', border: '#1f2940', text: '#e8ecf3',
  muted: '#8a96b3', accent: '#3498DB', success: '#10b981', warn: '#f59e0b',
};

// patch 0184 Phase 2: vendor が編集できる gpc_* セクション一覧 (デフォルト順)
const GPC_DEFAULT_SECTIONS = [
  {key: 'gpc_hero', label: 'ヒーロー (一番上のスライダー)'},
  {key: 'gpc_feature_cards', label: '特集カード'},
  {key: 'gpc_ranking', label: '人気ランキング'},
  {key: 'gpc_parts_cards', label: 'パーツで選ぶ'},
  {key: 'gpc_price_ranges', label: '値段で選ぶ'},
  {key: 'gpc_contact', label: 'お問い合わせ'},
  {key: 'gpc_extra_1', label: '追加セクション 1 (空)'},
  {key: 'gpc_extra_2', label: '追加セクション 2 (空)'},
  {key: 'gpc_extra_3', label: '追加セクション 3 (空)'},
];

const MODES = [
  {value: 'default', label: '元のデザインのまま'},
  {value: 'custom_css', label: 'CSS だけ上書き'},
  {value: 'custom_html', label: 'HTML を完全に置き換え'},
];

type SortableSection = {key: string; label: string; displayOrder: number};

export default function VendorSectionOverride() {
  const { username } = useLoaderData<typeof loader>() as VendorOverrideLoaderData;
  const [overrides, setOverrides] = useState<SectionOverrideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null); // section_key being edited
  const [editForm, setEditForm] = useState({mode: 'default', custom_html: '', custom_css: '', is_active: 'true', notes: ''});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  // patch 0185: 並び順を保持する local state (drag-drop / 上下ボタンで更新)
  const [sortedSections, setSortedSections] = useState<SortableSection[]>([]);
  const [orderDirty, setOrderDirty] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // patch 0185: textarea 編集 → 1.5s debounce で iframe 自動 reload (ライブプレビュー)
  const [livePreview, setLivePreview] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchOverrides = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/cms?type=astromeda_section_override', {credentials: 'include'});
      const j = await res.json() as {success?: boolean; error?: string; items?: SectionOverrideRow[]};
      const items = (j.items || []).filter((it: SectionOverrideRow) =>
        it.handle.startsWith('gpc_'),
      );
      setOverrides(items);
      // patch 0185: display_order を見て sortedSections を初期化
      const merged: SortableSection[] = GPC_DEFAULT_SECTIONS.map((sec, i) => {
        const ov = items.find((o: SectionOverrideRow) => o.handle === sec.key);
        const orderRaw = ov?.fields?.display_order || '';
        const order = /^-?\d+$/.test(orderRaw) ? parseInt(orderRaw, 10) : 0;
        // order > 0 → 並び替え済 / 0 → デフォルト位置 (i*10 を仮振り)
        return {...sec, displayOrder: order > 0 ? order : (i + 1) * 10};
      });
      merged.sort((a, b) => a.displayOrder - b.displayOrder);
      setSortedSections(merged);
      setOrderDirty(false);
    } catch (e) {
      console.error('fetch overrides failed', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchOverrides(); }, [fetchOverrides]);

  const startEdit = (sectionKey: string) => {
    const existing = overrides.find((o) => o.handle === sectionKey);
    setEditForm({
      mode: existing?.fields?.mode || 'default',
      custom_html: existing?.fields?.custom_html || '',
      custom_css: existing?.fields?.custom_css || '',
      is_active: existing?.fields?.is_active || 'true',
      notes: existing?.fields?.notes || '',
    });
    setEditing(sectionKey);
  };

  // patch 0185: 編集中の textarea 等が変わったら 1.5s 後に iframe を auto reload
  useEffect(() => {
    if (!livePreview || !editing) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setIframeKey((k) => k + 1);
    }, 1500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [editForm.custom_html, editForm.custom_css, editForm.mode, editForm.is_active, livePreview, editing]);

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const existing = overrides.find((o) => o.handle === editing);
      // patch 0185: 既存の display_order を保持 (順番タブで触らない限り変えない)
      const currentOrderRaw = existing?.fields?.display_order || '';
      const currentOrder = /^-?\d+$/.test(currentOrderRaw) ? parseInt(currentOrderRaw, 10) : 0;
      const fields = [
        {key: 'section_key', value: editing},
        {key: 'mode', value: editForm.mode},
        {key: 'custom_html', value: editForm.custom_html},
        {key: 'custom_css', value: editForm.custom_css},
        {key: 'is_active', value: editForm.is_active},
        {key: 'notes', value: editForm.notes},
        {key: 'display_order', value: String(currentOrder)},
      ];
      const body = existing
        ? {type: 'astromeda_section_override', action: 'update', id: existing.id, fields}
        : {type: 'astromeda_section_override', action: 'create', handle: editing, fields};
      const res = await fetch('/api/admin/cms', {
        method: 'POST', credentials: 'include',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
      });
      const j = await res.json() as {success?: boolean; error?: string; items?: SectionOverrideRow[]};
      if (j.success) {
        setToast('保存しました');
        setEditing(null);
        await fetchOverrides();
        setIframeKey((k) => k + 1); // reload iframe to show the change
      } else {
        setToast(`エラー: ${j.error || '保存に失敗'}`);
      }
    } catch (e) {
      setToast(`エラー: ${(e as Error).message}`);
    }
    setSaving(false);
    setTimeout(() => setToast(null), 4000);
  };

  // patch 0185: 並び順保存 — sortedSections の各セクションを 10/20/30/... で振り直して個別 update
  const handleSaveOrder = async () => {
    setSavingOrder(true);
    try {
      let okCount = 0;
      let failCount = 0;
      for (let i = 0; i < sortedSections.length; i++) {
        const sec = sortedSections[i];
        const newOrder = (i + 1) * 10;
        const existing = overrides.find((o) => o.handle === sec.key);
        const baseFields = [
          {key: 'section_key', value: sec.key},
          {key: 'mode', value: existing?.fields?.mode || 'default'},
          {key: 'custom_html', value: existing?.fields?.custom_html || ''},
          {key: 'custom_css', value: existing?.fields?.custom_css || ''},
          // 並びだけ変える時に「元のデザイン」を上書きしないよう、is_active は既存値を尊重
          {key: 'is_active', value: existing?.fields?.is_active || 'false'},
          {key: 'notes', value: existing?.fields?.notes || ''},
          {key: 'display_order', value: String(newOrder)},
        ];
        const body = existing
          ? {type: 'astromeda_section_override', action: 'update', id: existing.id, fields: baseFields}
          : {type: 'astromeda_section_override', action: 'create', handle: sec.key, fields: baseFields};
        try {
          const res = await fetch('/api/admin/cms', {
            method: 'POST', credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body),
          });
          const j = await res.json() as {success?: boolean; error?: string; items?: SectionOverrideRow[]};
          if (j.success) okCount++; else failCount++;
        } catch { failCount++; }
      }
      setToast(failCount === 0 ? `並び順を保存しました (${okCount} 件)` : `保存: 成功 ${okCount} / 失敗 ${failCount}`);
      await fetchOverrides();
      setIframeKey((k) => k + 1);
    } catch (e) {
      setToast(`エラー: ${(e as Error).message}`);
    }
    setSavingOrder(false);
    setTimeout(() => setToast(null), 4500);
  };

  const moveSection = (idx: number, delta: number) => {
    const next = [...sortedSections];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    // 並びを反映 — displayOrder は保存時に振り直すので index*10 でローカルだけ更新
    setSortedSections(next.map((s, i) => ({...s, displayOrder: (i + 1) * 10})));
    setOrderDirty(true);
  };

  return (
    <div style={{minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif'}}>
      <header style={{padding: '16px 24px', borderBottom: `1px solid ${C.border}`}}>
        <Link to="/vendor" style={{color: C.accent, textDecoration: 'none', fontSize: 14}}>← ベンダーホームに戻る</Link>
        <h1 style={{fontSize: 24, fontWeight: 900, marginTop: 8}}>🎨 ゲーミングPCページの見た目を変える</h1>
        <p style={{fontSize: 13, color: C.muted, marginTop: 4}}>
          {username} さん専用。9 セクション (既存 6 + 追加用 3) の HTML / CSS / 並び順を変えられます。
          編集中は 1.5 秒後に右側のプレビューが自動更新します。
        </p>
      </header>

      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, padding: '12px 20px',
          background: toast.startsWith('エラー') ? '#dc2626' : C.success,
          color: '#fff', borderRadius: 8, fontWeight: 700, zIndex: 1000,
        }}>{toast}</div>
      )}

      <div style={{display: 'grid', gridTemplateColumns: '460px 1fr', gap: 0, height: 'calc(100vh - 100px)'}}>
        {/* LEFT: list + edit modal */}
        <aside style={{borderRight: `1px solid ${C.border}`, overflowY: 'auto', padding: 16}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
            <h2 style={{fontSize: 14, fontWeight: 800, color: C.muted, letterSpacing: 1, margin: 0}}>セクション一覧 (上から順に表示されます)</h2>
            {orderDirty && (
              <button
                onClick={handleSaveOrder}
                disabled={savingOrder}
                style={{
                  padding: '6px 12px', background: savingOrder ? C.border : C.warn,
                  color: savingOrder ? C.muted : '#000', border: 'none', borderRadius: 6,
                  fontSize: 12, fontWeight: 800, cursor: savingOrder ? 'not-allowed' : 'pointer',
                }}
              >{savingOrder ? '保存中…' : '💾 並び順を保存'}</button>
            )}
          </div>
          {loading ? (
            <div style={{color: C.muted, fontSize: 13}}>読み込み中…</div>
          ) : (
            sortedSections.map((sec, idx) => {
              const existing = overrides.find((o) => o.handle === sec.key);
              const isOverridden = existing && existing.fields?.is_active === 'true' && existing.fields?.mode !== 'default';
              const isDragging = dragIndex === idx;
              return (
                <div
                  key={sec.key}
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(idx);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(idx));
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromIdx = dragIndex;
                    if (fromIdx === null || fromIdx === idx) return;
                    const next = [...sortedSections];
                    const [moved] = next.splice(fromIdx, 1);
                    next.splice(idx, 0, moved);
                    setSortedSections(next.map((s, i) => ({...s, displayOrder: (i + 1) * 10})));
                    setOrderDirty(true);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  style={{
                    padding: '12px 14px', marginBottom: 8,
                    background: editing === sec.key ? C.accent + '22' : C.panel,
                    border: `1px solid ${editing === sec.key ? C.accent : C.border}`,
                    borderRadius: 8,
                    opacity: isDragging ? 0.4 : 1,
                    cursor: 'grab',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                >
                  {/* drag handle */}
                  <span
                    aria-label="ドラッグして並び替え"
                    style={{
                      flexShrink: 0, fontSize: 18, color: C.muted, lineHeight: 1, userSelect: 'none',
                      padding: '0 4px', cursor: 'grab',
                    }}
                  >⋮⋮</span>

                  {/* main click target = open editor */}
                  <button
                    onClick={() => startEdit(sec.key)}
                    style={{
                      flex: 1, background: 'transparent', border: 'none', textAlign: 'left',
                      color: C.text, cursor: 'pointer', padding: 0,
                    }}
                  >
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <span style={{fontSize: 14, fontWeight: 700}}>{sec.label}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        background: isOverridden ? C.warn : C.border,
                        color: isOverridden ? '#000' : C.muted,
                      }}>{isOverridden ? '上書き中' : 'デフォルト'}</span>
                    </div>
                    <div style={{fontSize: 11, color: C.muted, marginTop: 4}}>
                      <code style={{background: C.bg, padding: '1px 5px', borderRadius: 3}}>{sec.key}</code>
                    </div>
                  </button>

                  {/* up/down arrow buttons (drag-drop が難しい人用代替) */}
                  <div style={{display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0}}>
                    <button
                      onClick={() => moveSection(idx, -1)}
                      disabled={idx === 0}
                      aria-label="上に移動"
                      style={{
                        width: 26, height: 22, padding: 0,
                        background: idx === 0 ? C.bg : C.border,
                        color: idx === 0 ? C.border : C.text,
                        border: `1px solid ${C.border}`, borderRadius: 4,
                        fontSize: 11, cursor: idx === 0 ? 'not-allowed' : 'pointer',
                      }}
                    >▲</button>
                    <button
                      onClick={() => moveSection(idx, 1)}
                      disabled={idx === sortedSections.length - 1}
                      aria-label="下に移動"
                      style={{
                        width: 26, height: 22, padding: 0,
                        background: idx === sortedSections.length - 1 ? C.bg : C.border,
                        color: idx === sortedSections.length - 1 ? C.border : C.text,
                        border: `1px solid ${C.border}`, borderRadius: 4,
                        fontSize: 11, cursor: idx === sortedSections.length - 1 ? 'not-allowed' : 'pointer',
                      }}
                    >▼</button>
                  </div>
                </div>
              );
            })
          )}
          {/* hint */}
          <div style={{marginTop: 12, padding: '10px 12px', background: C.bg, border: `1px dashed ${C.border}`, borderRadius: 6, fontSize: 11, color: C.muted, lineHeight: 1.5}}>
            💡 ドラッグ&ドロップ または ▲▼ ボタンで上下を入れ替え。<br/>
            「💾 並び順を保存」を押すと右のプレビューに反映されます。
          </div>
        </aside>

        {/* RIGHT: editor or preview */}
        <main style={{display: 'grid', gridTemplateRows: editing ? '1fr 360px' : '1fr', overflow: 'hidden'}}>
          <div style={{position: 'relative', overflow: 'hidden'}}>
            <iframe
              key={iframeKey}
              src="/collections/gaming-pc"
              title="ライブプレビュー"
              style={{width: '100%', height: '100%', border: 0, background: '#fff'}}
            />
            {/* live preview toggle pill */}
            {editing && (
              <label style={{
                position: 'absolute', top: 10, right: 10,
                background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '6px 12px',
                borderRadius: 999, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={livePreview}
                  onChange={(e) => setLivePreview(e.target.checked)}
                  style={{margin: 0}}
                />
                ライブプレビュー (1.5秒後)
              </label>
            )}
          </div>
          {editing && (
            <section style={{padding: 16, background: C.panel, borderTop: `1px solid ${C.border}`, overflowY: 'auto'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
                <h3 style={{fontSize: 14, fontWeight: 800}}>編集中: <code style={{color: C.accent}}>{editing}</code></h3>
                <button onClick={() => setEditing(null)} style={{padding: '4px 10px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', fontSize: 12}}>閉じる</button>
              </div>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12}}>
                <div>
                  <label style={{display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4}}>モード</label>
                  <select value={editForm.mode} onChange={(e) => setEditForm({...editForm, mode: e.target.value})}
                    style={{width: '100%', padding: 6, background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13}}>
                    {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4}}>有効</label>
                  <select value={editForm.is_active} onChange={(e) => setEditForm({...editForm, is_active: e.target.value})}
                    style={{width: '100%', padding: 6, background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13}}>
                    <option value="true">表示する</option>
                    <option value="false">表示しない (元のデザイン)</option>
                  </select>
                </div>
              </div>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12}}>
                <div>
                  <label style={{display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4}}>HTML 上書き (mode=custom_html 時)</label>
                  <textarea value={editForm.custom_html} onChange={(e) => setEditForm({...editForm, custom_html: e.target.value})}
                    style={{width: '100%', height: 140, padding: 8, background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: 'monospace', fontSize: 12, resize: 'vertical'}}
                    placeholder="<section>...</section>" />
                </div>
                <div>
                  <label style={{display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4}}>CSS 上書き (両モード共通)</label>
                  <textarea value={editForm.custom_css} onChange={(e) => setEditForm({...editForm, custom_css: e.target.value})}
                    style={{width: '100%', height: 140, padding: 8, background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: 'monospace', fontSize: 12, resize: 'vertical'}}
                    placeholder=".my-class { color: red }" />
                </div>
              </div>
              <button onClick={handleSave} disabled={saving} style={{
                padding: '10px 24px', background: saving ? C.border : C.accent,
                color: '#fff', border: 'none', borderRadius: 8,
                fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              }}>{saving ? '保存中…' : '💾 保存して確定 (永続)'}</button>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
