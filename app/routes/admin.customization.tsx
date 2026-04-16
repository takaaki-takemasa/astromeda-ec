/**
 * カスタマイズ管理スタンドアロンページ — Sprint 7
 *
 * /admin/customization で直接アクセス可能。
 * astromeda_custom_option Metaobject の CRUD + 2ペイン編集 Modal。
 */

import {useState, useCallback, useEffect} from 'react';
import {Link} from 'react-router';
import {T, al, PAGE_WIDTH} from '~/lib/astromeda-data';
import {RouteErrorBoundary} from '~/components/astro/RouteErrorBoundary';

interface CustomOption {
  id: string;
  handle: string;
  name: string;
  category: string;
  choices: Array<{value: string; label: string}>;
  appliesToTags: string;
  isRequired: boolean;
  sortOrder: number;
}

const cardStyle: React.CSSProperties = {
  background: T.bgC,
  border: `1px solid ${al(T.tx, 0.08)}`,
  borderRadius: 10,
  padding: 20,
};
const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: T.t4,
  letterSpacing: 1,
  marginBottom: 6,
  display: 'block',
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: T.bg,
  border: `1px solid ${al(T.tx, 0.15)}`,
  borderRadius: 6,
  color: T.tx,
  fontSize: 13,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
const btnStyle = (primary = false, danger = false): React.CSSProperties => ({
  padding: '6px 14px',
  background: primary ? T.c : 'transparent',
  border: `1px solid ${primary ? T.c : danger ? al(T.r, 0.5) : al(T.tx, 0.25)}`,
  borderRadius: 6,
  color: primary ? T.bg : danger ? T.r : T.tx,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
});

async function apiPost(endpoint: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    });
    return (await res.json()) as {success: boolean; error?: string};
  } catch {
    return {success: false, error: 'Network error'};
  }
}

export default function AdminCustomization() {
  const [items, setItems] = useState<CustomOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CustomOption | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{msg: string; type: 'success' | 'error'} | null>(null);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({msg, type});
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/customization', {credentials: 'include'});
      const json = (await res.json()) as {success?: boolean; options?: CustomOption[]};
      setItems(json.options || []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (form: Partial<CustomOption> & {handle?: string}, isCreate: boolean) => {
    setSaving(true);
    const body: Record<string, unknown> = isCreate
      ? {
          action: 'create',
          handle: form.handle || '',
          name: form.name || '',
          choices: form.choices || [],
          category: form.category || 'general',
          appliesToTags: form.appliesToTags || '',
          isRequired: form.isRequired ?? false,
          sortOrder: form.sortOrder ?? 0,
        }
      : {
          action: 'update',
          metaobjectId: form.id,
          name: form.name,
          choices: form.choices,
          category: form.category,
          appliesToTags: form.appliesToTags,
          isRequired: form.isRequired,
          sortOrder: form.sortOrder,
        };
    const res = await apiPost('/api/admin/customization', body);
    setSaving(false);
    if (res.success) {
      showToast('保存しました', 'success');
      setEditing(null);
      setCreating(false);
      await load();
    } else {
      showToast(`失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('このオプションを削除しますか？')) return;
    const res = await apiPost('/api/admin/customization', {action: 'delete', metaobjectId: id});
    if (res.success) {
      showToast('削除しました', 'success');
      await load();
    } else {
      showToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const handleDuplicate = async (opt: CustomOption) => {
    setSaving(true);
    const res = await apiPost('/api/admin/customization', {
      action: 'create',
      handle: `${opt.handle}-copy-${Date.now()}`,
      name: `${opt.name} (コピー)`,
      choices: opt.choices,
      category: opt.category,
      appliesToTags: opt.appliesToTags,
      isRequired: opt.isRequired,
      sortOrder: opt.sortOrder + 1,
    });
    setSaving(false);
    if (res.success) {
      showToast('複製しました', 'success');
      await load();
    } else {
      showToast(`複製失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const modalOpen = creating || editing !== null;
  const initial: Partial<CustomOption> = creating ? {sortOrder: 0, isRequired: false, choices: [], category: 'general', appliesToTags: ''} : editing || {};

  return (
    <div style={{background: T.bg, minHeight: '100vh', color: T.tx, paddingBottom: 80}}>
      <div style={{...PAGE_WIDTH, padding: '24px 20px'}}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20}}>
          <div>
            <Link to="/admin" style={{color: T.t4, fontSize: 12, textDecoration: 'none'}}>← 管理画面</Link>
            <h1 style={{fontSize: 22, fontWeight: 900, margin: '4px 0 0'}}>カスタマイズオプション管理</h1>
            <div style={{fontSize: 11, color: T.t4, marginTop: 2}}>astromeda_custom_option · {items.length} 件</div>
          </div>
          <button type="button" onClick={() => setCreating(true)} style={btnStyle(true)}>＋ 新規追加</button>
        </div>

        <div style={cardStyle}>
          {loading ? (
            <div style={{textAlign: 'center', padding: 40, color: T.t4}}>読み込み中...</div>
          ) : items.length === 0 ? (
            <div style={{textAlign: 'center', padding: 30, color: T.t4, fontSize: 12}}>オプションが未登録です</div>
          ) : (
            <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 12}}>
              <thead>
                <tr style={{textAlign: 'left', color: T.t4, borderBottom: `1px solid ${al(T.tx, 0.1)}`}}>
                  <th style={{padding: 8}}>名前</th>
                  <th style={{padding: 8}}>カテゴリ</th>
                  <th style={{padding: 8}}>選択肢数</th>
                  <th style={{padding: 8}}>対象タグ</th>
                  <th style={{padding: 8}}>必須</th>
                  <th style={{padding: 8}}>順</th>
                  <th style={{padding: 8}}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((opt) => (
                  <tr key={opt.id} style={{borderBottom: `1px solid ${al(T.tx, 0.05)}`}}>
                    <td style={{padding: 8, fontWeight: 700}}>{opt.name}</td>
                    <td style={{padding: 8, color: T.t5}}>{opt.category}</td>
                    <td style={{padding: 8}}>{opt.choices.length}</td>
                    <td style={{padding: 8, color: T.t5, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                      {opt.appliesToTags || '(全商品)'}
                    </td>
                    <td style={{padding: 8}}>{opt.isRequired ? '✓' : '—'}</td>
                    <td style={{padding: 8}}>{opt.sortOrder}</td>
                    <td style={{padding: 8, textAlign: 'right', whiteSpace: 'nowrap'}}>
                      <button type="button" onClick={() => setEditing(opt)} style={{...btnStyle(), marginRight: 4}}>編集</button>
                      <button type="button" onClick={() => handleDuplicate(opt)} style={{...btnStyle(), marginRight: 4}} disabled={saving}>複製</button>
                      <button type="button" onClick={() => handleDelete(opt.id)} style={btnStyle(false, true)}>削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {modalOpen && (
          <CustomOptionForm
            initial={initial}
            isCreate={creating}
            saving={saving}
            onCancel={() => {
              setEditing(null);
              setCreating(false);
            }}
            onSubmit={(form) => handleSave(form, creating)}
          />
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          padding: '10px 16px',
          background: toast.type === 'success' ? al(T.c, 0.95) : al(T.r, 0.95),
          color: T.bg,
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 700,
          boxShadow: '0 4px 12px rgba(0,0,0,.4)',
          zIndex: 1000,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function CustomOptionForm({
  initial,
  isCreate,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: Partial<CustomOption>;
  isCreate: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (form: Partial<CustomOption> & {handle?: string}) => void;
}) {
  const [handle, setHandle] = useState(initial.handle || '');
  const [name, setName] = useState(initial.name || '');
  const [category, setCategory] = useState(initial.category || 'general');
  const [choices, setChoices] = useState<Array<{value: string; label: string}>>(initial.choices || []);
  const [appliesToTags, setAppliesToTags] = useState(initial.appliesToTags || '');
  const [isRequired, setIsRequired] = useState(initial.isRequired ?? false);
  const [sortOrder, setSortOrder] = useState(initial.sortOrder ?? 0);

  const addChoice = () => setChoices((prev) => [...prev, {value: '', label: ''}]);
  const removeChoice = (idx: number) => setChoices((prev) => prev.filter((_, i) => i !== idx));
  const updateChoice = (idx: number, key: 'value' | 'label', val: string) => {
    setChoices((prev) => prev.map((c, i) => (i === idx ? {...c, [key]: val} : c)));
  };
  const moveChoice = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= choices.length) return;
    setChoices((prev) => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          background: T.bg,
          border: `1px solid ${al(T.tx, 0.15)}`,
          borderRadius: 12,
          width: '100%',
          maxWidth: 700,
          maxHeight: '92vh',
          overflow: 'auto',
          boxShadow: '0 12px 32px rgba(0,0,0,.6)',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: `1px solid ${al(T.tx, 0.1)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{fontSize: 14, fontWeight: 900, color: T.tx}}>
            {isCreate ? 'オプション 新規追加' : 'オプション 編集'}
          </div>
          <button type="button" onClick={onCancel} style={{...btnStyle(), padding: '4px 10px'}}>×</button>
        </div>
        <div style={{padding: 20, display: 'grid', gap: 12}}>
          {isCreate && (
            <div>
              <label style={labelStyle}>Handle (一意識別子)</label>
              <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} style={inputStyle} placeholder="cpu-select" />
            </div>
          )}
          <div>
            <label style={labelStyle}>オプション名</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="CPU選択" />
          </div>
          <div>
            <label style={labelStyle}>カテゴリ</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
              <option value="general">general</option>
              <option value="cpu">cpu</option>
              <option value="gpu">gpu</option>
              <option value="memory">memory</option>
              <option value="storage">storage</option>
              <option value="os">os</option>
              <option value="cooling">cooling</option>
              <option value="power">power</option>
              <option value="case">case</option>
              <option value="peripheral">peripheral</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>選択肢 ({choices.length} 件)</label>
            <div style={{display: 'grid', gap: 6}}>
              {choices.map((c, i) => (
                <div key={i} style={{display: 'grid', gridTemplateColumns: '1fr 1fr auto auto auto', gap: 4, alignItems: 'center'}}>
                  <input type="text" value={c.value} onChange={(e) => updateChoice(i, 'value', e.target.value)} placeholder="値" style={inputStyle} />
                  <input type="text" value={c.label} onChange={(e) => updateChoice(i, 'label', e.target.value)} placeholder="表示ラベル" style={inputStyle} />
                  <button type="button" onClick={() => moveChoice(i, -1)} disabled={i === 0} style={{...btnStyle(), padding: '4px 8px'}}>↑</button>
                  <button type="button" onClick={() => moveChoice(i, 1)} disabled={i === choices.length - 1} style={{...btnStyle(), padding: '4px 8px'}}>↓</button>
                  <button type="button" onClick={() => removeChoice(i)} style={btnStyle(false, true)}>−</button>
                </div>
              ))}
              <button type="button" onClick={addChoice} style={{...btnStyle(), alignSelf: 'flex-start'}}>＋ 選択肢追加</button>
            </div>
          </div>
          <div>
            <label style={labelStyle}>対象商品タグ (カンマ区切り、空=全商品)</label>
            <input type="text" value={appliesToTags} onChange={(e) => setAppliesToTags(e.target.value)} style={inputStyle} placeholder="gamer,streamer" />
          </div>
          <div>
            <label style={labelStyle}>表示順</label>
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)} style={inputStyle} />
          </div>
          <div>
            <label style={{...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
              <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
              必須オプション
            </label>
          </div>
          <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6}}>
            <button type="button" onClick={onCancel} style={btnStyle()} disabled={saving}>キャンセル</button>
            <button
              type="button"
              onClick={() =>
                onSubmit({
                  id: initial.id,
                  handle,
                  name,
                  category,
                  choices: choices.filter((c) => c.value.trim() !== '' || c.label.trim() !== ''),
                  appliesToTags,
                  isRequired,
                  sortOrder,
                })
              }
              style={btnStyle(true)}
              disabled={saving}
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const ErrorBoundary = RouteErrorBoundary;
