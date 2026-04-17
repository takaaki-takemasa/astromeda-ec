/**
 * GenericCrudSublist — 汎用 Metaobject CRUD サブリスト
 *
 * Draft/Publish パターンを持つ Metaobject タイプ向けに、
 * 一覧 + 編集 + 新規追加 + 削除 + 下書き/公開切替 を
 * 設定駆動で一気に提供する共通コンポーネント。
 *
 * 使い方:
 *   <GenericCrudSublist
 *     items={items}
 *     onRefresh={fetchAll}
 *     onMsg={showMsg}
 *     type="astromeda_about_section"
 *     title="ABOUTセクション"
 *     unitLabel="ABOUT"
 *     handlePrefix="about"
 *     fields={[
 *       { key: 'title', label: '見出し', type: 'text', required: true, span: 2 },
 *       { key: 'body_html', label: '本文 HTML', type: 'textarea', span: 2 },
 *       ...
 *     ]}
 *     summary={(f) => ({ primary: f.title, secondary: f.link_url })}
 *   />
 */

import { useState, useMemo, type ReactNode } from 'react';
import { color } from '~/lib/design-tokens';
import { Modal } from '~/components/admin/Modal';
import PreviewFrame, { type PreviewDevice } from '~/components/admin/preview/PreviewFrame';
import {
  DraftBadge,
  PublishButtons,
  PublishStatusFilter,
  getPublishStatus,
  type PublishStatus,
} from '~/components/admin/DraftPublishBar';

// ── Types ──
export interface MetaobjectNode {
  id: string;
  handle: string;
  type: string;
  updatedAt?: string;
  publishStatus?: 'DRAFT' | 'ACTIVE';
  isDraft?: boolean;
  [key: string]: string | boolean | number | undefined;
}

export type FieldInputType = 'text' | 'textarea' | 'number' | 'boolean' | 'url' | 'json';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldInputType;
  required?: boolean;
  placeholder?: string;
  /** grid span 1 or 2 (default: 1) */
  span?: 1 | 2;
  /** JSON用: 整形表示するかどうか */
  prettyJson?: boolean;
}

export interface RowSummary {
  /** メイン行タイトル（太字） */
  primary: string;
  /** サブタイトル（小さい文字・ミュート色） */
  secondary?: string;
  /** 右端に表示する小タグ（例: 「表示中」等） */
  tag?: string;
}

export interface GenericCrudProps {
  items: MetaobjectNode[];
  onRefresh: () => void;
  onMsg: (s: string) => void;
  type: string;
  title: string;
  unitLabel: string;
  handlePrefix: string;
  fields: FieldDef[];
  summary: (f: Record<string, string>) => RowSummary;
  /** 並べ替えに使う field key（デフォルト: display_order） */
  orderKey?: string;
  /** 削除ボタンを表示するか（デフォルト: true） */
  allowDelete?: boolean;
  /** 新規追加ボタンを表示するか（デフォルト: true） */
  allowCreate?: boolean;
  /** 空状態メッセージ */
  emptyMessage?: string;
  /** モーダルフッターに表示する補助テキスト */
  footerHint?: string;
  /**
   * ライブプレビューを描画する関数（オプショナル）。
   * 指定すると編集モーダル右側に実サイト風のプレビューが表示される。
   * form 値が変わるたびに再描画される（リアルタイム反映）。
   */
  renderPreview?: (args: {
    items: MetaobjectNode[];
    form: Record<string, string>;
    editingId: string | null;
    isCreating: boolean;
  }) => ReactNode;
}

// ── Helper: field value extractor (v166+ flat format + legacy) ──
export function extractField(node: MetaobjectNode | Record<string, unknown>, key: string): string {
  return f(node, key);
}

function f(node: MetaobjectNode | Record<string, unknown>, key: string): string {
  const n = node as Record<string, unknown>;
  const direct = n[key];
  if (typeof direct === 'string') return direct;
  if (typeof direct === 'number' || typeof direct === 'boolean') return String(direct);
  const fields = (n as { fields?: Array<{ key: string; value: string }> }).fields;
  if (Array.isArray(fields)) return fields.find((x) => x.key === key)?.value ?? '';
  return '';
}

async function cmsPost(body: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('/api/admin/cms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Styles ──
const cardStyle: React.CSSProperties = {
  background: color.bg1,
  border: `1px solid ${color.border}`,
  borderRadius: 12,
  overflow: 'hidden',
};

const rowStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: `1px solid ${color.border}`,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: color.bg0,
  border: `1px solid ${color.border}`,
  borderRadius: 8,
  color: color.text,
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: color.textMuted,
  marginBottom: 4,
  display: 'block',
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 20px',
  fontSize: 13,
  fontWeight: 700,
  color: '#000',
  background: color.cyan,
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: 600,
  color: color.textMuted,
  background: 'transparent',
  border: `1px solid ${color.border}`,
  borderRadius: 8,
  cursor: 'pointer',
};

const btnDanger: React.CSSProperties = {
  ...btnSecondary,
  color: color.red,
  borderColor: 'rgba(255,45,85,.3)',
};

export function GenericCrudSublist({
  items,
  onRefresh,
  onMsg,
  type,
  title,
  unitLabel,
  handlePrefix,
  fields,
  summary,
  orderKey = 'display_order',
  allowDelete = true,
  allowCreate = true,
  emptyMessage,
  footerHint,
  renderPreview,
}: GenericCrudProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [publishFilter, setPublishFilter] = useState<'all' | 'active' | 'draft'>('all');
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');
  const editingItem = useMemo(
    () => (editing ? items.find((i) => i.id === editing) : undefined),
    [editing, items],
  );

  const emptyForm = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const fld of fields) {
      if (fld.key === orderKey) out[fld.key] = String((items.length || 0) + 1);
      else if (fld.type === 'boolean') out[fld.key] = 'true';
      else out[fld.key] = '';
    }
    return out;
  };

  const startEdit = (item: MetaobjectNode) => {
    setEditing(item.id);
    const next: Record<string, string> = {};
    for (const fld of fields) next[fld.key] = f(item, fld.key);
    setForm(next);
  };

  const save = async (id: string, publishStatus: PublishStatus) => {
    setSaving(true);
    try {
      const res = await cmsPost({
        type,
        action: 'update',
        id,
        fields: Object.entries(form).map(([key, value]) => ({ key, value })),
        status: publishStatus,
      });
      if (res.success) {
        onMsg(publishStatus === 'DRAFT' ? '下書きとして保存しました' : `${unitLabel}を公開しました`);
        setEditing(null);
        onRefresh();
      } else onMsg(`エラー: ${res.error}`);
    } finally {
      setSaving(false);
    }
  };

  const create = async (publishStatus: PublishStatus) => {
    setSaving(true);
    try {
      // Auto handle from first required text field or fallback timestamp
      const keySeed = fields.find((x) => x.required && x.type === 'text')?.key;
      const seedValue = keySeed ? (form[keySeed] || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : '';
      const handle = `${handlePrefix}-${seedValue || Date.now()}`.slice(0, 60);
      const res = await cmsPost({
        type,
        action: 'create',
        handle,
        fields: Object.entries(form).map(([key, value]) => ({ key, value })),
        status: publishStatus,
      });
      if (res.success) {
        onMsg(publishStatus === 'DRAFT' ? `${unitLabel}を下書き保存しました` : `${unitLabel}を公開しました`);
        setShowAdd(false);
        onRefresh();
      } else onMsg(`エラー: ${res.error}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(`この${unitLabel}を削除します。よろしいですか？`)) return;
    const res = await cmsPost({ type, action: 'delete', id });
    if (res.success) { onMsg(`${unitLabel}を削除しました`); onRefresh(); }
    else onMsg(`エラー: ${res.error}`);
  };

  const handleQuickPublishToggle = async (item: MetaobjectNode) => {
    const currentStatus = getPublishStatus(item);
    const nextAction = currentStatus === 'DRAFT' ? 'publish' : 'unpublish';
    const res = await cmsPost({ type, action: nextAction, id: item.id });
    if (res.success) { onMsg(nextAction === 'publish' ? '公開しました' : '下書きに戻しました'); onRefresh(); }
    else onMsg(`エラー: ${res.error}`);
  };

  const sorted = [...items].sort(
    (a, b) => Number(f(a, orderKey) || 99) - Number(f(b, orderKey) || 99),
  );

  const filtered = sorted.filter((item) => {
    if (publishFilter === 'all') return true;
    const ps = getPublishStatus(item);
    return publishFilter === 'active' ? ps === 'ACTIVE' : ps === 'DRAFT';
  });

  const isModalOpen = !!editing || showAdd;
  const modalTitle = editing ? `${title} 編集` : `${title} 新規追加`;
  const closeModal = () => { setEditing(null); setShowAdd(false); };
  const modalSaveDraft = () => { if (editing) save(editing, 'DRAFT'); else create('DRAFT'); };
  const modalPublish = () => { if (editing) save(editing, 'ACTIVE'); else create('ACTIVE'); };

  const renderField = (fld: FieldDef) => {
    const val = form[fld.key] ?? '';
    const style: React.CSSProperties = { ...inputStyle };
    if (fld.type === 'textarea' || fld.type === 'json') {
      style.minHeight = fld.type === 'json' ? 120 : 80;
      style.fontFamily = fld.type === 'json' ? 'monospace' : 'inherit';
      style.fontSize = fld.type === 'json' ? 12 : 13;
      return (
        <textarea
          style={style}
          value={val}
          onChange={(e) => setForm({ ...form, [fld.key]: e.target.value })}
          placeholder={fld.placeholder}
        />
      );
    }
    if (fld.type === 'boolean') {
      return (
        <select
          style={inputStyle}
          value={val || 'true'}
          onChange={(e) => setForm({ ...form, [fld.key]: e.target.value })}
        >
          <option value="true">ON（有効）</option>
          <option value="false">OFF（無効）</option>
        </select>
      );
    }
    return (
      <input
        style={inputStyle}
        type={fld.type === 'number' ? 'number' : fld.type === 'url' ? 'url' : 'text'}
        value={val}
        onChange={(e) => setForm({ ...form, [fld.key]: e.target.value })}
        placeholder={fld.placeholder}
      />
    );
  };

  const renderForm = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
      {fields.map((fld) => (
        <div key={fld.key} style={{ gridColumn: fld.span === 2 ? '1 / -1' : undefined }}>
          <label style={labelStyle}>
            {fld.label}
            {fld.required && <span style={{ color: '#ff6b6b' }}> *</span>}
          </label>
          {renderField(fld)}
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <PublishStatusFilter
          value={publishFilter}
          onChange={setPublishFilter}
          counts={{
            all: items.length,
            active: items.filter((i) => getPublishStatus(i) === 'ACTIVE').length,
            draft: items.filter((i) => getPublishStatus(i) === 'DRAFT').length,
          }}
        />
        {allowCreate && (
          <button style={btnPrimary} onClick={() => { setShowAdd(true); setForm(emptyForm()); }}>
            ＋ {unitLabel}を追加
          </button>
        )}
      </div>
      <div style={cardStyle}>
        {filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: color.textMuted, fontSize: 14 }}>
            {publishFilter === 'draft'
              ? `下書きの${unitLabel}はありません`
              : publishFilter === 'active'
                ? `公開中の${unitLabel}はありません`
                : emptyMessage ?? `${unitLabel}未登録（ハードコードフォールバックが使用されます）`}
          </div>
        ) : filtered.map((item) => {
          const ps = getPublishStatus(item);
          const flat: Record<string, string> = {};
          for (const fld of fields) flat[fld.key] = f(item, fld.key);
          const s = summary(flat);
          return (
            <div key={item.id} style={{ ...rowStyle, borderLeft: ps === 'DRAFT' ? '3px solid #ffb020' : undefined }}>
              <div style={{ width: 36, fontSize: 13, color: color.textMuted, textAlign: 'center' }}>
                {f(item, orderKey) || '—'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: color.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <DraftBadge status={ps} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.primary || '(未入力)'}
                  </span>
                </div>
                {s.secondary && (
                  <div style={{ fontSize: 11, color: color.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.secondary}
                  </div>
                )}
              </div>
              {s.tag && (
                <span style={{ fontSize: 10, padding: '2px 8px', background: `${color.cyan}20`, color: color.cyan, borderRadius: 4 }}>
                  {s.tag}
                </span>
              )}
              <button style={btnSecondary} onClick={() => handleQuickPublishToggle(item)} title={ps === 'DRAFT' ? 'すぐに公開' : '下書きに戻す'}>
                {ps === 'DRAFT' ? '公開' : '非公開'}
              </button>
              <button style={btnSecondary} onClick={() => startEdit(item)}>編集</button>
              {allowDelete && (
                <button style={btnDanger} onClick={() => remove(item.id)}>削除</button>
              )}
            </div>
          );
        })}
      </div>

      {isModalOpen && (
        <Modal
          title={modalTitle}
          onClose={closeModal}
          maxWidth={renderPreview ? 1400 : 900}
          preview={
            renderPreview ? (
              <PreviewFrame device={previewDevice} onDeviceChange={setPreviewDevice}>
                {renderPreview({
                  items,
                  form,
                  editingId: editing,
                  isCreating: showAdd,
                })}
              </PreviewFrame>
            ) : undefined
          }
        >
          {renderForm()}
          <div style={{ borderTop: `1px solid ${color.border}`, marginTop: 16, paddingTop: 12 }}>
            <PublishButtons
              onCancel={closeModal}
              onSaveDraft={modalSaveDraft}
              onPublish={modalPublish}
              saving={saving}
              isNew={!editing}
              currentStatus={editingItem ? getPublishStatus(editingItem) : undefined}
            />
          </div>
          <div style={{ fontSize: 11, color: color.textMuted, marginTop: 12, padding: 10, background: color.bg0, borderRadius: 6 }}>
            💡 {footerHint ?? '「下書き保存」は公開サイトに表示されません。「公開する」を押すとお客様に表示されます。'}
          </div>
        </Modal>
      )}
    </div>
  );
}
