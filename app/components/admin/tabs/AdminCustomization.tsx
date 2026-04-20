/**
 * AdminCustomization Tab — 商品プルダウン管理（CRUD）
 *
 * メタオブジェクト `astromeda_custom_option` 経由で、商品詳細ページの
 * カスタマイズプルダウン（CPU / GPU / メモリ / 配列など）を
 * 管理画面だけで CRUD 操作できるようにした。
 *
 * patch 0080 (2026-04-20) R0-P0-2:
 * - 「＋ 新しいプルダウンを作る」CTA 追加（旧 UI は定義初期化ボタンのみで、
 *   非エンジニアは選択肢を増やす手段がなかった）
 * - 新規/編集モーダル: 中学生が迷わず埋められる日本語フォーム +
 *   選択肢エディタ（行追加・行削除・上下並び替え）
 * - 削除は ConfirmDialog（contextPath breadcrumbs 付き）
 * - Skeleton / EmptyCard primitive は patch 0074-0075 を継続使用
 *
 * API: /api/admin/customization  (GET / POST create|update|delete)
 */

import { useState, useEffect, useCallback } from 'react';
import { color, font, radius, space } from '~/lib/design-tokens';
import { Modal } from '~/components/admin/Modal';
import { AdminListSkeleton, AdminEmptyCard } from '~/components/admin/ds/InlineListState';
import { ToggleSwitch } from '~/components/admin/ds/ToggleSwitch';
import { useConfirmDialog } from '~/hooks/useConfirmDialog';

// ── Types ──
interface Choice {
  value: string;
  label: string;
}

interface CustomizationEntry {
  id: string;
  handle: string;
  name: string;
  category: string;
  choices: Choice[];
  appliesToTags: string;
  isRequired: boolean;
  sortOrder: number;
}

interface EditForm {
  id: string | null; // null = 新規作成
  handle: string;
  name: string;
  category: string;
  choices: Choice[];
  appliesToTags: string;
  isRequired: boolean;
  sortOrder: number;
}

const EMPTY_FORM: EditForm = {
  id: null,
  handle: '',
  name: '',
  category: 'general',
  choices: [{ value: '', label: '' }],
  appliesToTags: '',
  isRequired: false,
  sortOrder: 0,
};

const CATEGORY_OPTIONS = [
  { value: 'general', label: '🔧 汎用（カテゴリ未指定）' },
  { value: 'cpu', label: '🖥️ CPU（PC向け）' },
  { value: 'gpu', label: '🎮 GPU（PC向け）' },
  { value: 'memory', label: '🧠 メモリ（PC向け）' },
  { value: 'storage', label: '💾 ストレージ（PC向け）' },
  { value: 'cooling', label: '❄️ 冷却（PC向け）' },
  { value: 'psu', label: '⚡ 電源（PC向け）' },
  { value: 'case', label: '🗄️ ケース（PC向け）' },
  { value: 'keyboard', label: '⌨️ キーボード配列（ガジェット）' },
  { value: 'material', label: '🧵 素材（グッズ向け）' },
  { value: 'character', label: '🎭 キャラクター（グッズ向け）' },
  { value: 'color', label: '🎨 カラー' },
  { value: 'size', label: '📏 サイズ' },
];

// ── Styles ──
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: color.bg0,
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  color: color.text,
  fontSize: font.sm,
  fontFamily: font.family,
  boxSizing: 'border-box' as const,
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
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: font.family,
};

const btnOutline: React.CSSProperties = {
  padding: '6px 14px',
  background: 'transparent',
  color: color.cyan,
  border: `1px solid rgba(0,240,255,.3)`,
  borderRadius: radius.md,
  fontSize: font.xs,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: font.family,
};

const btnDanger: React.CSSProperties = {
  padding: '6px 12px',
  background: color.red,
  color: '#fff',
  border: 'none',
  borderRadius: radius.md,
  fontSize: font.xs,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: font.family,
};

const btnGhost: React.CSSProperties = {
  padding: '4px 10px',
  background: 'transparent',
  color: color.textMuted,
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: font.family,
};

// ── Toast ──
function Toast({ msg, type }: { msg: string; type: 'ok' | 'err' }) {
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

// ══════════════════════════════════
// Main Component
// ══════════════════════════════════
export default function AdminCustomization() {
  const [entries, setEntries] = useState<CustomizationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [initStatus, setInitStatus] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // 編集モーダル
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { confirm: confirmDialog, dialogProps, ConfirmDialog: Dialog } = useConfirmDialog();

  const showToast = useCallback((msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/customization');
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      if (json.success) {
        setEntries(json.options);
        setError(null);
      } else {
        setError(json.error || '取得に失敗しました');
      }
    } catch {
      setError('カスタマイズデータの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleInitDefinition = async () => {
    setInitStatus('初期化中...');
    try {
      // 既存コード互換: init_definition は metaobject-setup 側で処理
      const res = await fetch('/api/admin/metaobject-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setup' }),
      });
      const json = await res.json();
      if (res.ok && (json.success ?? true)) {
        setInitStatus('メタオブジェクト定義を作成しました');
        fetchData();
      } else {
        setInitStatus(`エラー: ${json.error || '初期化失敗'}`);
      }
    } catch {
      setInitStatus('初期化に失敗しました');
    }
  };

  // ── Form helpers ──
  const openCreate = () => {
    setForm({ ...EMPTY_FORM, choices: [{ value: '', label: '' }] });
    setEditOpen(true);
  };

  const openEdit = (entry: CustomizationEntry) => {
    setForm({
      id: entry.id,
      handle: entry.handle,
      name: entry.name,
      category: entry.category || 'general',
      choices: entry.choices.length > 0 ? entry.choices : [{ value: '', label: '' }],
      appliesToTags: entry.appliesToTags || '',
      isRequired: entry.isRequired,
      sortOrder: entry.sortOrder,
    });
    setEditOpen(true);
  };

  const updateChoice = (i: number, patch: Partial<Choice>) => {
    const next = form.choices.slice();
    next[i] = { ...next[i], ...patch };
    setForm({ ...form, choices: next });
  };

  const addChoice = () => {
    setForm({ ...form, choices: [...form.choices, { value: '', label: '' }] });
  };

  const removeChoice = (i: number) => {
    if (form.choices.length <= 1) return;
    setForm({ ...form, choices: form.choices.filter((_, idx) => idx !== i) });
  };

  const moveChoice = (i: number, dir: -1 | 1) => {
    const next = form.choices.slice();
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setForm({ ...form, choices: next });
  };

  // ── Submit ──
  const handleSubmit = async () => {
    // 中学生向け validation
    if (!form.name.trim()) {
      showToast('プルダウン名を入れてください (例: メモリ容量)', 'err');
      return;
    }
    if (!form.id && !form.handle.trim()) {
      showToast('識別子を入れてください (例: memory)', 'err');
      return;
    }
    if (!form.id && !/^[a-z0-9][a-z0-9_-]*$/.test(form.handle.trim())) {
      showToast('識別子は半角英数字と - _ のみです', 'err');
      return;
    }
    const cleanChoices = form.choices
      .map((c) => ({ value: c.value.trim(), label: c.label.trim() }))
      .filter((c) => c.label);
    if (cleanChoices.length === 0) {
      showToast('選択肢を少なくとも 1 件入れてください', 'err');
      return;
    }
    // value 未入力は label を流用
    for (const c of cleanChoices) {
      if (!c.value) c.value = c.label;
    }

    setSaving(true);
    try {
      const isCreate = form.id === null;
      const body: Record<string, unknown> = isCreate
        ? {
            action: 'create',
            handle: form.handle.trim(),
            name: form.name.trim(),
            category: form.category,
            choices: cleanChoices,
            appliesToTags: form.appliesToTags.trim(),
            isRequired: form.isRequired,
            sortOrder: form.sortOrder,
          }
        : {
            action: 'update',
            metaobjectId: form.id,
            name: form.name.trim(),
            category: form.category,
            choices: cleanChoices,
            appliesToTags: form.appliesToTags.trim(),
            isRequired: form.isRequired,
            sortOrder: form.sortOrder,
          };

      const res = await fetch('/api/admin/customization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        const detail = Array.isArray(json.details) ? json.details.join(' / ') : (json.error || '保存失敗');
        throw new Error(detail);
      }
      showToast(isCreate ? 'プルダウンを作成しました' : 'プルダウンを更新しました', 'ok');
      setEditOpen(false);
      setForm(EMPTY_FORM);
      await fetchData();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失敗', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry: CustomizationEntry) => {
    const ok = await confirmDialog({
      title: `「${entry.name}」を削除しますか？`,
      message: 'このプルダウンを商品詳細から削除します。既存商品で参照している場合は表示されなくなります。',
      confirmLabel: '削除する',
      destructive: true,
      contextPath: ['コマース', '🛍️ 商品・販売', '🎛️ プルダウン管理'],
    });
    if (!ok) return;
    try {
      const res = await fetch('/api/admin/customization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', metaobjectId: entry.id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '削除失敗');
      showToast('プルダウンを削除しました', 'ok');
      await fetchData();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '削除失敗', 'err');
    }
  };

  // ── Render: 編集フォーム ──
  const editForm = (
    <div>
      {/* プルダウン名 */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ ...labelStyle, fontWeight: 700, color: color.text }}>
          プルダウン名 <span style={{ color: color.red }}>*必須</span>
        </label>
        <input
          style={inputStyle}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="例: メモリ容量 / キーボード配列 / アクリルスタンド種類"
          maxLength={255}
        />
        <div style={{ fontSize: 10, color: color.textMuted, marginTop: 4 }}>
          商品ページでお客様が選ぶときに表示される名前です。
        </div>
      </div>

      {/* 識別子 (作成時のみ) */}
      {form.id === null && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ ...labelStyle, fontWeight: 700, color: color.text }}>
            識別子 <span style={{ color: color.red }}>*必須</span>
          </label>
          <input
            style={inputStyle}
            value={form.handle}
            onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase() })}
            placeholder="例: memory / keyboard-layout / acrylic-stand-character"
            maxLength={100}
          />
          <div style={{ fontSize: 10, color: color.textMuted, marginTop: 4 }}>
            半角英数字と - _ のみ。作成後は変更できません。
          </div>
        </div>
      )}

      {/* カテゴリ + 表示順 */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>カテゴリ</label>
          <select
            style={inputStyle}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>表示順（小さいほど上）</label>
          <input
            style={inputStyle}
            type="number"
            min={0}
            max={999}
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })}
          />
        </div>
      </div>

      {/* 対象タグ + 必須トグル */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>適用する商品タグ（任意・カンマ区切り）</label>
          <input
            style={inputStyle}
            value={form.appliesToTags}
            onChange={(e) => setForm({ ...form, appliesToTags: e.target.value })}
            placeholder="例: PC, ガジェット / 空欄で全商品"
            maxLength={500}
          />
        </div>
        <div>
          <ToggleSwitch
            checked={form.isRequired}
            onChange={(next) => setForm({ ...form, isRequired: next })}
            label="必須入力にする"
            hint="オンにすると、お客様はこのプルダウンを必ず選ばないとカートに入れられません。"
          />
        </div>
      </div>

      {/* 選択肢エディタ */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ ...labelStyle, fontWeight: 700, color: color.text }}>
          選択肢 <span style={{ color: color.red }}>*必須</span>
        </label>
        <div style={{ fontSize: 10, color: color.textMuted, marginBottom: 8 }}>
          お客様が選ぶ項目を並べてください。ラベル = 画面に見える文字、識別子 = 内部で使う ID (空欄なら自動)。
        </div>
        <div style={{ background: color.bg0, border: `1px solid ${color.border}`, borderRadius: radius.md, padding: 8 }}>
          {form.choices.map((c, i) => (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr auto',
              gap: 6,
              marginBottom: 6,
            }}>
              <input
                style={{ ...inputStyle, padding: '6px 10px' }}
                value={c.label}
                onChange={(e) => updateChoice(i, { label: e.target.value })}
                placeholder={`ラベル (例: 16GB / US配列 / ルフィ)`}
              />
              <input
                style={{ ...inputStyle, padding: '6px 10px', fontFamily: 'monospace', fontSize: 12 }}
                value={c.value}
                onChange={(e) => updateChoice(i, { value: e.target.value })}
                placeholder={`識別子 (任意・例: 16gb)`}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" onClick={() => moveChoice(i, -1)} style={btnGhost} aria-label={`${i + 1}行目を上へ`} disabled={i === 0}>↑</button>
                <button type="button" onClick={() => moveChoice(i, 1)} style={btnGhost} aria-label={`${i + 1}行目を下へ`} disabled={i === form.choices.length - 1}>↓</button>
                <button
                  type="button"
                  onClick={() => removeChoice(i)}
                  style={{ ...btnGhost, color: color.red, borderColor: color.red }}
                  aria-label={`${i + 1}行目を削除`}
                  disabled={form.choices.length <= 1}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addChoice}
            style={{
              ...btnOutline,
              width: '100%',
              marginTop: 4,
              padding: '8px 12px',
            }}
          >
            ＋ 選択肢を追加
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{
            ...btnPrimary,
            opacity: saving ? 0.6 : 1,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? '保存中...' : (form.id ? '更新する' : '＋ プルダウンを作る')}
        </button>
        <button
          onClick={() => setEditOpen(false)}
          disabled={saving}
          style={btnOutline}
        >
          キャンセル
        </button>
      </div>
    </div>
  );

  // ── Render: プレビュー（右ペイン） ──
  const preview = (
    <div style={{ padding: 16 }}>
      <div style={{
        fontSize: 11,
        color: color.textMuted,
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: `1px solid ${color.border}`,
      }}>
        商品詳細ページでの見え方プレビュー
      </div>
      <div style={{
        background: color.bg0,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        padding: 18,
        maxWidth: 360,
      }}>
        <div style={{
          fontSize: 13,
          fontWeight: 700,
          color: color.text,
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          {form.name || '(プルダウン名)'}
          {form.isRequired && (
            <span style={{
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 3,
              background: `${color.red}33`,
              color: color.red,
              fontWeight: 700,
            }}>
              必須
            </span>
          )}
        </div>
        <select
          style={{
            ...inputStyle,
            fontSize: 13,
            padding: '10px 12px',
          }}
          defaultValue=""
        >
          <option value="" disabled>選んでください</option>
          {form.choices.filter((c) => c.label.trim()).map((c, i) => (
            <option key={i} value={c.value || c.label}>{c.label}</option>
          ))}
        </select>
        <div style={{ fontSize: 11, color: color.textMuted, marginTop: 8 }}>
          カテゴリ: <code style={{ color: color.cyan }}>{form.category}</code>
          {form.appliesToTags && (
            <div style={{ marginTop: 4 }}>
              対象タグ: <span style={{ color: color.cyan }}>{form.appliesToTags}</span>
            </div>
          )}
        </div>
      </div>
      <div style={{
        marginTop: 14,
        padding: 10,
        background: color.bg1,
        border: `1px dashed ${color.border}`,
        borderRadius: 6,
        fontSize: 10,
        color: color.textMuted,
        lineHeight: 1.6,
      }}>
        💡 お客様が選んだ内容はカートの「属性」に自動で付与されます。
        追加料金を紐づける場合は別途 Shopify Cart Transform を設定してください。
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: color.text, margin: 0 }}>
          🎛️ プルダウン管理
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleInitDefinition}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 500,
              color: color.textMuted,
              background: 'transparent',
              border: `1px solid ${color.border}`,
              borderRadius: radius.md,
              cursor: 'pointer',
              fontFamily: font.family,
            }}
            title="メタオブジェクト定義が未作成の場合のみ使用"
          >
            定義を初期化
          </button>
          <button
            onClick={openCreate}
            style={{
              ...btnPrimary,
              fontSize: font.sm,
              fontWeight: 700,
              padding: '10px 18px',
            }}
          >
            ＋ 新しいプルダウンを作る
          </button>
        </div>
      </div>

      <div style={{
        fontSize: 12,
        color: color.textMuted,
        background: color.bg1,
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        padding: '10px 14px',
        marginBottom: 16,
        lineHeight: 1.6,
      }}>
        📝 商品詳細ページの「CPU」「メモリ」「キーボード配列」などの選択肢を管理します。
        作ったプルダウンは「対象商品タグ」に合致する商品だけに表示されます。
      </div>

      {initStatus && (
        <div style={{
          background: initStatus.includes('エラー') ? '#3a1515' : '#153a1a',
          border: `1px solid ${initStatus.includes('エラー') ? '#6b2020' : '#206b2a'}`,
          borderRadius: radius.md,
          padding: '10px 14px',
          marginBottom: 16,
          fontSize: 13,
          color: initStatus.includes('エラー') ? '#ff6b6b' : '#6bff7b',
        }}>
          {initStatus}
        </div>
      )}

      {loading && <AdminListSkeleton rows={5} />}

      {error && (
        <div style={{ color: '#ff6b6b', fontSize: font.sm, padding: space[4], background: '#3a1515', borderRadius: radius.md, marginBottom: 16 }}>
          {error}
          <div style={{ marginTop: 8, fontSize: font.xs, color: color.textMuted }}>
            メタオブジェクト定義が未作成の場合は「定義を初期化」ボタンを押してください。
          </div>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <AdminEmptyCard
          icon="🎛️"
          title="プルダウンがまだ登録されていません"
          description='「＋ 新しいプルダウンを作る」から最初のプルダウンを作りましょう。例: メモリ容量 (16GB / 32GB / 64GB)、キーボード配列 (US / JIS)。'
          action={
            <button onClick={openCreate} style={btnPrimary}>
              ＋ 最初のプルダウンを作る
            </button>
          }
        />
      )}

      {!loading && entries.length > 0 && (
        <div style={{ background: color.bg0, border: `1px solid ${color.border}`, borderRadius: radius.lg, overflow: 'hidden' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '60px 1.4fr 1fr 80px 90px 180px',
            gap: 10,
            padding: '10px 14px',
            fontSize: 10,
            fontWeight: 700,
            color: color.textMuted,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            borderBottom: `1px solid ${color.border}`,
            background: color.bg1,
          }}>
            <div>順序</div>
            <div>プルダウン名</div>
            <div>カテゴリ</div>
            <div>選択肢</div>
            <div>必須</div>
            <div>アクション</div>
          </div>

          {entries.map((entry) => (
            <div key={entry.id} style={{ borderBottom: `1px solid ${color.border}` }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '60px 1.4fr 1fr 80px 90px 180px',
                gap: 10,
                padding: '12px 14px',
                alignItems: 'center',
              }}>
                <div style={{ fontSize: font.sm, color: color.textMuted }}>{entry.sortOrder}</div>
                <div>
                  <div style={{ fontSize: font.sm, fontWeight: 600, color: color.text }}>{entry.name}</div>
                  <div style={{ fontSize: 10, color: color.textMuted, marginTop: 2, fontFamily: 'monospace' }}>
                    {entry.handle}
                  </div>
                </div>
                <div style={{ fontSize: font.xs, color: color.text }}>
                  {CATEGORY_OPTIONS.find((c) => c.value === entry.category)?.label || entry.category}
                </div>
                <div style={{ fontSize: font.sm, color: color.cyan, fontWeight: 600 }}>
                  {entry.choices.length}件
                </div>
                <div style={{ fontSize: font.xs, color: entry.isRequired ? color.red : color.textMuted, fontWeight: entry.isRequired ? 700 : 400 }}>
                  {entry.isRequired ? '✅ 必須' : '任意'}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    style={btnGhost}
                    aria-label={`${entry.name} の選択肢を${expandedId === entry.id ? '閉じる' : '開く'}`}
                  >
                    {expandedId === entry.id ? '閉じる' : '詳細'}
                  </button>
                  <button
                    onClick={() => openEdit(entry)}
                    style={btnOutline}
                    aria-label={`${entry.name} を編集`}
                  >
                    編集
                  </button>
                  <button
                    onClick={() => handleDelete(entry)}
                    style={btnDanger}
                    aria-label={`${entry.name} を削除`}
                  >
                    削除
                  </button>
                </div>
              </div>

              {expandedId === entry.id && (
                <div style={{ padding: '10px 14px 16px', background: color.bg1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: color.textMuted, marginBottom: 8 }}>
                    選択肢一覧:
                  </div>
                  {entry.choices.length === 0 ? (
                    <div style={{ fontSize: 11, color: color.textMuted, fontStyle: 'italic' }}>
                      (選択肢が登録されていません)
                    </div>
                  ) : (
                    entry.choices.map((opt, i) => (
                      <div key={i} style={{
                        padding: '6px 12px',
                        fontSize: 12,
                        color: color.text,
                        background: color.bg0,
                        borderRadius: 6,
                        marginBottom: 4,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}>
                        <span>{opt.label}</span>
                        <span style={{ color: color.textMuted, fontFamily: 'monospace', fontSize: 10 }}>{opt.value}</span>
                      </div>
                    ))
                  )}
                  {entry.appliesToTags && (
                    <div style={{ marginTop: 8, fontSize: 10, color: color.textMuted }}>
                      対象タグ: <span style={{ color: color.cyan }}>{entry.appliesToTags}</span>
                    </div>
                  )}
                  <div style={{ marginTop: 6, fontSize: 10, color: color.textMuted, fontFamily: 'monospace' }}>
                    ID: {entry.id}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editOpen && (
        <Modal
          title={form.id ? `プルダウンを編集: ${form.name || ''}` : '＋ 新しいプルダウンを作る'}
          onClose={() => !saving && setEditOpen(false)}
          preview={preview}
        >
          {editForm}
        </Modal>
      )}

      <Dialog {...dialogProps} />
      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}
