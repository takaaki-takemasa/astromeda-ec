/**
 * AdminMetaobjectDefinitions Tab — Shopify Metaobject 定義 CRUD (patch 0068)
 *
 * CEO 指摘「Shopify admin に行かせず管理画面で完結させたい」の P4。
 * Shopify の Metaobject 定義（CMS のスキーマ／型）を admin から
 * 一覧・新規作成・フィールド追加・削除できるタブ。
 *
 * - 一覧: type / 表示名 / フィールド数 / 実体件数（>=1 の表示）
 * - 詳細: クリックで右ペインに展開、フィールド一覧と「+ フィールド追加」フォーム
 * - 新規作成: type / 表示名 / 説明 / フィールド配列（key/name/type）
 * - 削除: 強い確認ダイアログ（実体 Metaobject ごと削除される旨を明示）
 *
 * 効果器: 遺伝子ライブラリ管理 — 幹細胞の DNA 設計図を増減
 */

import {useState, useEffect, useCallback, useMemo} from 'react';
import {color, font, radius, space} from '~/lib/design-tokens';
import {useConfirmDialog} from '~/hooks/useConfirmDialog';
import {AdminEmptyCard, AdminListSkeleton} from '~/components/admin/ds/InlineListState';

// ━━━ Types ━━━

interface FieldDef {
  key: string;
  name: string;
  type: string;
  required: boolean;
  description: string | null;
}

interface MetaobjectDefinition {
  id: string;
  type: string;
  name: string;
  description: string | null;
  fieldCount: number;
  metaobjectsCount: number;
  fieldDefinitions: FieldDef[];
}

interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  endCursor: string | null;
}

// Shopify が受け入れる主要 field type を UI 選択肢として提供
const FIELD_TYPE_OPTIONS: Array<{value: string; label: string; group: string}> = [
  {value: 'single_line_text_field', label: '一行テキスト', group: 'テキスト'},
  {value: 'multi_line_text_field', label: '複数行テキスト', group: 'テキスト'},
  {value: 'rich_text_field', label: 'リッチテキスト', group: 'テキスト'},
  {value: 'number_integer', label: '整数', group: '数値'},
  {value: 'number_decimal', label: '小数', group: '数値'},
  {value: 'boolean', label: 'true/false', group: '数値'},
  {value: 'date', label: '日付', group: '日時'},
  {value: 'date_time', label: '日時', group: '日時'},
  {value: 'url', label: 'URL', group: 'URL/メディア'},
  {value: 'color', label: 'カラー', group: 'URL/メディア'},
  {value: 'file_reference', label: 'ファイル参照', group: 'URL/メディア'},
  {value: 'product_reference', label: '商品参照', group: '参照'},
  {value: 'collection_reference', label: 'コレクション参照', group: '参照'},
  {value: 'variant_reference', label: 'バリアント参照', group: '参照'},
  {value: 'page_reference', label: 'ページ参照', group: '参照'},
  {value: 'metaobject_reference', label: 'メタオブジェクト参照', group: '参照'},
  {value: 'mixed_reference', label: '汎用参照', group: '参照'},
  {value: 'json', label: 'JSON', group: 'その他'},
  {value: 'money', label: '金額', group: 'その他'},
  {value: 'rating', label: '評価', group: 'その他'},
  {value: 'list.single_line_text_field', label: '一行テキスト（リスト）', group: 'リスト'},
  {value: 'list.number_integer', label: '整数（リスト）', group: 'リスト'},
  {value: 'list.file_reference', label: 'ファイル参照（リスト）', group: 'リスト'},
  {value: 'list.product_reference', label: '商品参照（リスト）', group: 'リスト'},
  {value: 'list.collection_reference', label: 'コレクション参照（リスト）', group: 'リスト'},
  {value: 'list.variant_reference', label: 'バリアント参照（リスト）', group: 'リスト'},
  {value: 'list.metaobject_reference', label: 'メタオブジェクト参照（リスト）', group: 'リスト'},
];

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
  display: 'block',
  fontSize: font.xs,
  fontWeight: 600,
  color: color.textMuted,
  marginBottom: 4,
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

const btnGhost: React.CSSProperties = {
  padding: '6px 10px',
  background: 'transparent',
  color: color.cyan,
  border: `1px solid ${color.cyan}`,
  borderRadius: radius.sm,
  fontSize: font.xs,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: font.family,
};

// ━━━ API helpers ━━━

async function apiList(
  cursor: string | null,
): Promise<{items: MetaobjectDefinition[]; pageInfo: PageInfo}> {
  const params = new URLSearchParams({limit: '50'});
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`/api/admin/metaobject-definitions?${params.toString()}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'API error');
  return {
    items: json.definitions ?? [],
    pageInfo: json.pageInfo ?? {hasNextPage: false, hasPreviousPage: false, endCursor: null},
  };
}

async function apiCreate(payload: {
  type: string;
  name: string;
  description?: string;
  fields: Array<{key: string; name: string; type: string}>;
}): Promise<{success: boolean; error?: string; id?: string; type?: string}> {
  const res = await fetch('/api/admin/metaobject-definitions', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action: 'create', ...payload}),
  });
  return res.json();
}

async function apiAddFields(
  id: string,
  fields: Array<{key: string; name: string; type: string}>,
): Promise<{success: boolean; error?: string; fieldsAdded?: number}> {
  const res = await fetch('/api/admin/metaobject-definitions', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action: 'add_fields', id, fields}),
  });
  return res.json();
}

async function apiDelete(
  id: string,
): Promise<{success: boolean; error?: string; deletedId?: string | null; notFound?: boolean}> {
  const res = await fetch('/api/admin/metaobject-definitions', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action: 'delete', id, confirm: true}),
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

// ━━━ Type バッジ用色 ━━━

function typeBadgeColor(t: string): string {
  if (t.includes('text') || t.includes('rich_text')) return '#00d9ff';
  if (t.includes('number') || t === 'boolean') return '#facc15';
  if (t.includes('date')) return '#a78bfa';
  if (t === 'url' || t === 'color') return '#34d399';
  if (t.includes('reference')) return '#f472b6';
  if (t.startsWith('list.')) return '#fb923c';
  return '#9ca3af';
}

// ━━━ Field Editor (新規作成 / 追加で共通利用) ━━━

interface DraftField {
  key: string;
  name: string;
  type: string;
}

function FieldEditor({
  fields,
  onChange,
}: {
  fields: DraftField[];
  onChange: (next: DraftField[]) => void;
}) {
  const addField = () =>
    onChange([...fields, {key: '', name: '', type: 'single_line_text_field'}]);
  const removeField = (i: number) => onChange(fields.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<DraftField>) =>
    onChange(fields.map((f, idx) => (idx === i ? {...f, ...patch} : f)));

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
      {fields.length === 0 && (
        <div
          style={{
            padding: 12,
            border: `1px dashed ${color.border}`,
            borderRadius: radius.md,
            color: color.textMuted,
            fontSize: font.xs,
            textAlign: 'center',
          }}
        >
          フィールドがありません。「+ フィールドを追加」を押してください。
        </div>
      )}
      {fields.map((f, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1.4fr auto',
            gap: 8,
            alignItems: 'end',
          }}
        >
          <div>
            <label style={labelStyle}>キー (英小文字+_)</label>
            <input
              style={inputStyle}
              value={f.key}
              onChange={(e) => update(i, {key: e.target.value})}
              placeholder="例: title"
            />
          </div>
          <div>
            <label style={labelStyle}>表示名</label>
            <input
              style={inputStyle}
              value={f.name}
              onChange={(e) => update(i, {name: e.target.value})}
              placeholder="例: タイトル"
            />
          </div>
          <div>
            <label style={labelStyle}>型</label>
            <select
              style={inputStyle}
              value={f.type}
              onChange={(e) => update(i, {type: e.target.value})}
            >
              {FIELD_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  [{opt.group}] {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            style={btnDanger}
            onClick={() => removeField(i)}
            aria-label={`フィールド ${i + 1} を削除`}
            title="このフィールドを削除"
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" style={btnGhost} onClick={addField}>
        + フィールドを追加
      </button>
    </div>
  );
}

// ━━━ Create Form ━━━

function CreateForm({
  open,
  onClose,
  onSaved,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onToast: (msg: string, type: 'ok' | 'err') => void;
}) {
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<DraftField[]>([
    {key: 'title', name: 'タイトル', type: 'single_line_text_field'},
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setType('');
      setName('');
      setDescription('');
      setFields([{key: 'title', name: 'タイトル', type: 'single_line_text_field'}]);
    }
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    if (!type || !name) {
      onToast('type と 表示名 は必須です', 'err');
      return;
    }
    if (fields.some((f) => !f.key || !f.name)) {
      onToast('全フィールドの key と 表示名を入力してください', 'err');
      return;
    }
    setSaving(true);
    try {
      const res = await apiCreate({
        type,
        name,
        description: description || undefined,
        fields: fields.map((f) => ({key: f.key, name: f.name, type: f.type})),
      });
      if (res.success) {
        onToast(`定義を作成しました: ${res.type}`, 'ok');
        onSaved();
        onClose();
      } else {
        onToast(`作成失敗: ${res.error || '不明なエラー'}`, 'err');
      }
    } catch (e) {
      onToast(`作成エラー: ${e instanceof Error ? e.message : String(e)}`, 'err');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.7)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: color.bg1,
          border: `1px solid ${color.border}`,
          borderRadius: radius.lg,
          padding: 24,
          maxWidth: 720,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
          <h2 style={{margin: 0, fontSize: font.lg, color: color.text}}>新しい Metaobject 定義を作成</h2>
          <button style={btnOutline} onClick={onClose}>
            閉じる
          </button>
        </div>

        <div style={{display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16}}>
          <div>
            <label style={labelStyle}>type（識別子・英小文字+_、後から変更不可）</label>
            <input
              style={inputStyle}
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="例: astromeda_new_section"
            />
          </div>
          <div>
            <label style={labelStyle}>表示名</label>
            <input
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 新セクション"
            />
          </div>
          <div>
            <label style={labelStyle}>説明（任意）</label>
            <input
              style={inputStyle}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="この Metaobject 定義の用途"
            />
          </div>
        </div>

        <h3 style={{margin: '16px 0 8px', fontSize: font.md, color: color.text}}>フィールド</h3>
        <FieldEditor fields={fields} onChange={setFields} />

        <div style={{display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20}}>
          <button style={btnOutline} onClick={onClose} disabled={saving}>
            キャンセル
          </button>
          <button style={btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? '作成中…' : '作成する'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ━━━ Detail / Add fields panel ━━━

function DetailPanel({
  def,
  onClose,
  onAdded,
  onToast,
}: {
  def: MetaobjectDefinition | null;
  onClose: () => void;
  onAdded: () => void;
  onToast: (msg: string, type: 'ok' | 'err') => void;
}) {
  const [draft, setDraft] = useState<DraftField[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft([]);
  }, [def?.id]);

  if (!def) return null;

  const handleSave = async () => {
    if (draft.length === 0) {
      onToast('追加するフィールドがありません', 'err');
      return;
    }
    if (draft.some((f) => !f.key || !f.name)) {
      onToast('全フィールドの key と 表示名を入力してください', 'err');
      return;
    }
    const existingKeys = new Set(def.fieldDefinitions.map((f) => f.key));
    const dup = draft.find((f) => existingKeys.has(f.key));
    if (dup) {
      onToast(`既存フィールドと重複: ${dup.key}`, 'err');
      return;
    }
    setSaving(true);
    try {
      const res = await apiAddFields(def.id, draft);
      if (res.success) {
        onToast(`${res.fieldsAdded} 件追加しました`, 'ok');
        setDraft([]);
        onAdded();
      } else {
        onToast(`追加失敗: ${res.error || '不明なエラー'}`, 'err');
      }
    } catch (e) {
      onToast(`追加エラー: ${e instanceof Error ? e.message : String(e)}`, 'err');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        background: color.bg1,
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        padding: 16,
      }}
    >
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12}}>
        <div>
          <div style={{fontSize: font.lg, fontWeight: 700, color: color.text}}>{def.name}</div>
          <div style={{fontSize: font.xs, color: color.textMuted, marginTop: 2}}>
            <code style={{background: color.bg0, padding: '2px 6px', borderRadius: 4}}>
              {def.type}
            </code>
            <span style={{marginLeft: 8}}>
              フィールド {def.fieldCount} 件 / 実体 {def.metaobjectsCount > 0 ? '≥1' : '0'} 件
            </span>
          </div>
          {def.description && (
            <div style={{fontSize: font.xs, color: color.textMuted, marginTop: 6}}>
              {def.description}
            </div>
          )}
        </div>
        <button style={btnOutline} onClick={onClose}>
          閉じる
        </button>
      </div>

      <h4 style={{margin: '12px 0 8px', fontSize: font.sm, color: color.text}}>既存フィールド</h4>
      <div
        style={{
          background: color.bg0,
          border: `1px solid ${color.border}`,
          borderRadius: radius.sm,
          padding: 8,
          maxHeight: 240,
          overflow: 'auto',
        }}
      >
        {def.fieldDefinitions.length === 0 ? (
          <div style={{fontSize: font.xs, color: color.textMuted, textAlign: 'center'}}>
            フィールドなし
          </div>
        ) : (
          def.fieldDefinitions.map((f) => (
            <div
              key={f.key}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1.5fr 1.3fr',
                gap: 8,
                padding: '6px 4px',
                fontSize: font.xs,
                borderBottom: `1px dashed ${color.border}`,
                alignItems: 'center',
              }}
            >
              <code style={{color: color.text}}>{f.key}</code>
              <span style={{color: color.textMuted}}>{f.name}</span>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: radius.full,
                  background: typeBadgeColor(f.type) + '22',
                  color: typeBadgeColor(f.type),
                  fontSize: 11,
                  width: 'fit-content',
                  fontWeight: 600,
                }}
              >
                {f.type}
                {f.required && ' *'}
              </span>
            </div>
          ))
        )}
      </div>

      <h4 style={{margin: '16px 0 8px', fontSize: font.sm, color: color.text}}>+ フィールドを追加</h4>
      <FieldEditor fields={draft} onChange={setDraft} />

      <div style={{display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12}}>
        <button style={btnPrimary} onClick={handleSave} disabled={saving || draft.length === 0}>
          {saving ? '追加中…' : `${draft.length} 件 追加`}
        </button>
      </div>
    </div>
  );
}

// ━━━ Main ━━━

export default function AdminMetaobjectDefinitions() {
  const [list, setList] = useState<MetaobjectDefinition[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo>({
    hasNextPage: false,
    hasPreviousPage: false,
    endCursor: null,
  });
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([null]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{msg: string; type: 'ok' | 'err'} | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {confirm, dialogProps, ConfirmDialog} = useConfirmDialog();

  const showToast = useCallback((msg: string, type: 'ok' | 'err') => {
    setToast({msg, type});
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async (cursor: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const {items, pageInfo: pi} = await apiList(cursor);
      setList(items);
      setPageInfo(pi);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(cursorHistory[cursorHistory.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorHistory.length]);

  const handleNext = () => {
    if (pageInfo.hasNextPage && pageInfo.endCursor) {
      setCursorHistory([...cursorHistory, pageInfo.endCursor]);
    }
  };
  const handlePrev = () => {
    if (cursorHistory.length > 1) {
      setCursorHistory(cursorHistory.slice(0, -1));
    }
  };
  const handleReload = () => {
    load(cursorHistory[cursorHistory.length - 1]);
  };

  const selected = useMemo(() => list.find((d) => d.id === selectedId) ?? null, [list, selectedId]);

  const handleDelete = async (def: MetaobjectDefinition) => {
    const ok = await confirm({
      title: `定義 "${def.name}" を削除しますか？`,
      message:
        def.metaobjectsCount > 0
          ? `⚠️ この定義には実体の Metaobject インスタンスがあります（少なくとも 1 件）。削除すると、紐づく全インスタンスも一緒に削除されます。フロントエンドの該当セクションがフォールバックに切り替わります。本当に削除しますか？`
          : `定義 "${def.type}" を削除します。実体インスタンスはありません。`,
      confirmLabel: '削除する',
      cancelLabel: 'キャンセル',
      destructive: true,
      contextPath: ['コマース', '🧭 ナビ・マーケ・分析', '🧬 CMS 定義'],
    });
    if (!ok) return;
    try {
      const res = await apiDelete(def.id);
      if (res.success) {
        showToast(res.notFound ? '既に削除済みでした' : '削除しました', 'ok');
        if (selectedId === def.id) setSelectedId(null);
        handleReload();
      } else {
        showToast(`削除失敗: ${res.error || '不明なエラー'}`, 'err');
      }
    } catch (e) {
      showToast(`削除エラー: ${e instanceof Error ? e.message : String(e)}`, 'err');
    }
  };

  return (
    <div style={{padding: space[6]}}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{margin: 0, fontSize: font.xl, color: color.text}}>
            🧬 Metaobject 定義
          </h1>
          <div style={{fontSize: font.xs, color: color.textMuted, marginTop: 4}}>
            CMS 用のスキーマ（型）を管理。新しいセクションや項目を追加するには、まず定義を作成します。
          </div>
        </div>
        <div style={{display: 'flex', gap: 8}}>
          <button style={btnOutline} onClick={handleReload} disabled={loading}>
            {loading ? '更新中…' : '🔄 更新'}
          </button>
          <button style={btnPrimary} onClick={() => setCreateOpen(true)}>
            + 新規定義
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            background: color.red + '22',
            border: `1px solid ${color.red}`,
            borderRadius: radius.md,
            color: color.red,
            fontSize: font.sm,
            marginBottom: 12,
          }}
        >
          エラー: {error}
        </div>
      )}

      <div style={{display: 'grid', gridTemplateColumns: selected ? '1.2fr 1.4fr' : '1fr', gap: 16}}>
        {/* List */}
        <div
          style={{
            background: color.bg1,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 1.6fr 0.8fr 0.8fr 1fr',
              gap: 8,
              padding: '10px 12px',
              background: color.bg0,
              borderBottom: `1px solid ${color.border}`,
              fontSize: font.xs,
              fontWeight: 700,
              color: color.textMuted,
            }}
          >
            <div>type</div>
            <div>表示名</div>
            <div>フィールド</div>
            <div>実体</div>
            <div style={{textAlign: 'right'}}>操作</div>
          </div>
          {loading && list.length === 0 && (
            <AdminListSkeleton rows={6} />
          )}
          {list.length === 0 && !loading && (
            <AdminEmptyCard
              icon="🧬"
              title="Metaobject 定義はまだありません"
              description="Metaobject 定義は、管理画面の各サブタブでフィールドを持ったカスタムデータ型を作るための骨組みです。「+ 定義を作る」から新規作成できます。"
            />
          )}
          {list.map((d) => {
            const isSel = d.id === selectedId;
            return (
              <div
                key={d.id}
                onClick={() => setSelectedId(isSel ? null : d.id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 1.6fr 0.8fr 0.8fr 1fr',
                  gap: 8,
                  padding: '10px 12px',
                  borderBottom: `1px solid ${color.border}`,
                  alignItems: 'center',
                  fontSize: font.sm,
                  cursor: 'pointer',
                  background: isSel ? color.cyan + '15' : 'transparent',
                }}
              >
                <code
                  style={{
                    fontSize: font.xs,
                    color: color.text,
                    background: color.bg0,
                    padding: '2px 6px',
                    borderRadius: 4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {d.type}
                </code>
                <div style={{color: color.text}}>{d.name}</div>
                <div style={{color: color.textMuted}}>{d.fieldCount}</div>
                <div style={{color: d.metaobjectsCount > 0 ? color.cyan : color.textMuted}}>
                  {d.metaobjectsCount > 0 ? '≥1' : '0'}
                </div>
                <div style={{display: 'flex', gap: 4, justifyContent: 'flex-end'}}>
                  <button
                    style={btnDanger}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(d);
                    }}
                  >
                    削除
                  </button>
                </div>
              </div>
            );
          })}
          {/* Pagination */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: 12,
              background: color.bg0,
              borderTop: `1px solid ${color.border}`,
            }}
          >
            <button
              style={{...btnOutline, opacity: cursorHistory.length > 1 ? 1 : 0.4}}
              onClick={handlePrev}
              disabled={cursorHistory.length <= 1}
              aria-label="前のページ"
            >
              ← 前
            </button>
            <span style={{color: color.textMuted, fontSize: font.xs, alignSelf: 'center'}}>
              ページ {cursorHistory.length}
            </span>
            <button
              style={{...btnOutline, opacity: pageInfo.hasNextPage ? 1 : 0.4}}
              onClick={handleNext}
              disabled={!pageInfo.hasNextPage}
              aria-label="次のページ"
            >
              次 →
            </button>
          </div>
        </div>

        {/* Detail */}
        {selected && (
          <DetailPanel
            def={selected}
            onClose={() => setSelectedId(null)}
            onAdded={() => handleReload()}
            onToast={showToast}
          />
        )}
      </div>

      <CreateForm
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => handleReload()}
        onToast={showToast}
      />

      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
