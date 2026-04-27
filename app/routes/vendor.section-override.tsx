/**
 * /vendor/section-override — ベンダー向けセクション HTML/CSS 上書き編集 (patch 0184 Phase 2)
 *
 * vendor は astromeda_section_override の gpc_* (ゲーミングPC) のみ編集可能。
 * 一覧 + 編集 Modal + iframe ライブプレビューの 3 セクション。
 *
 * セキュリティ:
 *  - server side: api.admin.cms に vendor 型ガード (gpc_* のみ許可) — patch 0184 Phase 2 で実装
 *  - HTML は cms-field-validator (patch 0112) + sanitize-html (storefront 描画時) の二重防御
 *  - vendor 以外 (admin/editor/viewer) はこのページに来ない (loader redirect)
 */
import { useState, useEffect, useCallback } from 'react';
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

// patch 0184 Phase 2: vendor が編集できる gpc_* セクション一覧
const GPC_SECTIONS = [
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

export default function VendorSectionOverride() {
  const { username } = useLoaderData<typeof loader>() as VendorOverrideLoaderData;
  const [overrides, setOverrides] = useState<SectionOverrideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null); // section_key being edited
  const [editForm, setEditForm] = useState({mode: 'default', custom_html: '', custom_css: '', is_active: 'true', notes: ''});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  const fetchOverrides = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/cms?type=astromeda_section_override', {credentials: 'include'});
      const j = await res.json();
      const items = (j.items || []).filter((it: SectionOverrideRow) =>
        it.handle.startsWith('gpc_'),
      );
      setOverrides(items);
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

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const existing = overrides.find((o) => o.handle === editing);
      const fields = [
        {key: 'section_key', value: editing},
        {key: 'mode', value: editForm.mode},
        {key: 'custom_html', value: editForm.custom_html},
        {key: 'custom_css', value: editForm.custom_css},
        {key: 'is_active', value: editForm.is_active},
        {key: 'notes', value: editForm.notes},
      ];
      const body = existing
        ? {type: 'astromeda_section_override', action: 'update', id: existing.id, fields}
        : {type: 'astromeda_section_override', action: 'create', handle: editing, fields};
      const res = await fetch('/api/admin/cms', {
        method: 'POST', credentials: 'include',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
      });
      const j = await res.json();
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

  return (
    <div style={{minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif'}}>
      <header style={{padding: '16px 24px', borderBottom: `1px solid ${C.border}`}}>
        <Link to="/vendor" style={{color: C.accent, textDecoration: 'none', fontSize: 14}}>← ベンダーホームに戻る</Link>
        <h1 style={{fontSize: 24, fontWeight: 900, marginTop: 8}}>🎨 ゲーミングPCページの見た目を変える</h1>
        <p style={{fontSize: 13, color: C.muted, marginTop: 4}}>
          {username} さん専用。9 セクション (既存 6 + 追加用 3) の HTML / CSS を上書きできます。保存すると右側のプレビューにリアルタイム反映されます。
        </p>
      </header>

      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, padding: '12px 20px',
          background: toast.startsWith('エラー') ? '#dc2626' : C.success,
          color: '#fff', borderRadius: 8, fontWeight: 700, zIndex: 1000,
        }}>{toast}</div>
      )}

      <div style={{display: 'grid', gridTemplateColumns: '420px 1fr', gap: 0, height: 'calc(100vh - 100px)'}}>
        {/* LEFT: list + edit modal */}
        <aside style={{borderRight: `1px solid ${C.border}`, overflowY: 'auto', padding: 16}}>
          <h2 style={{fontSize: 14, fontWeight: 800, color: C.muted, marginBottom: 12, letterSpacing: 1}}>セクション一覧</h2>
          {loading ? (
            <div style={{color: C.muted, fontSize: 13}}>読み込み中…</div>
          ) : (
            GPC_SECTIONS.map((sec) => {
              const existing = overrides.find((o) => o.handle === sec.key);
              const isOverridden = existing && existing.fields?.is_active === 'true' && existing.fields?.mode !== 'default';
              return (
                <div key={sec.key} style={{
                  padding: '12px 14px', marginBottom: 8,
                  background: editing === sec.key ? C.accent + '22' : C.panel,
                  border: `1px solid ${editing === sec.key ? C.accent : C.border}`,
                  borderRadius: 8, cursor: 'pointer',
                }} onClick={() => startEdit(sec.key)}>
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
                </div>
              );
            })
          )}
        </aside>

        {/* RIGHT: editor or preview */}
        <main style={{display: 'grid', gridTemplateRows: editing ? '1fr 320px' : '1fr', overflow: 'hidden'}}>
          <iframe
            key={iframeKey}
            src="/collections/gaming-pc"
            title="ライブプレビュー"
            style={{width: '100%', height: '100%', border: 0, background: '#fff'}}
          />
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
                    style={{width: '100%', height: 120, padding: 8, background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: 'monospace', fontSize: 12, resize: 'vertical'}}
                    placeholder="<section>...</section>" />
                </div>
                <div>
                  <label style={{display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4}}>CSS 上書き (両モード共通)</label>
                  <textarea value={editForm.custom_css} onChange={(e) => setEditForm({...editForm, custom_css: e.target.value})}
                    style={{width: '100%', height: 120, padding: 8, background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: 'monospace', fontSize: 12, resize: 'vertical'}}
                    placeholder=".my-class { color: red }" />
                </div>
              </div>
              <button onClick={handleSave} disabled={saving} style={{
                padding: '10px 24px', background: saving ? C.border : C.accent,
                color: '#fff', border: 'none', borderRadius: 8,
                fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              }}>{saving ? '保存中…' : '💾 保存してプレビュー反映'}</button>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
