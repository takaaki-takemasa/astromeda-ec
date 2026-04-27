/**
 * AdminSectionOverride — セクション単位 HTML/CSS 上書きタブ (patch 0166)
 *
 * CEO 指示「他社（デザイン会社）に作業を任せる予定」+「HTML で一括変更もできるように」
 * への基盤実装。astromeda_section_override Metaobject を CRUD する admin UI。
 *
 * 流れ:
 *   1. セクション選択 (15個・トップ/ゲーミングPC/グローバル)
 *   2. モード選択 (default / custom_html / custom_css)
 *   3. HTML/CSS 入力 (textarea)
 *   4. 公開フラグ (is_active)
 *   5. 保存 → /api/admin/cms POST → Shopify Metaobject
 *
 * 注意:
 *   - 初回セットアップ時は Metaobject 定義作成ボタンを押す必要がある
 *     (定義は手動 metaobjectDefinitionCreate で作る — patch 0167 で自動化予定)
 *   - storefront 側への注入は patch 0167 で各セクションコンポーネントに hook 追加
 *   - sanitize-html.ts で multi_line_text_field の保存時に script/iframe/onclick 除去
 */
import {useEffect, useState, useCallback, useMemo} from 'react';
import {color, radius, space} from '~/lib/design-tokens';
import {useToast} from '~/components/admin/ds/Toast';
import {useConfirmDialog} from '~/hooks/useConfirmDialog';
import {ConfirmDialog} from '~/components/admin/ds/ConfirmDialog';
import {AdminListSkeleton, AdminEmptyCard} from '~/components/admin/ds/InlineListState';
import {TabHeaderHint} from '~/components/admin/ds/TabHeaderHint';
import {ToggleSwitch} from '~/components/admin/ds/ToggleSwitch';
import {SECTION_KEYS, MODE_LABEL, type SectionKey, type OverrideMode} from '~/lib/section-override';

interface OverrideEntry {
  id: string;
  handle: string;
  sectionKey: SectionKey;
  mode: OverrideMode;
  customHtml: string;
  customCss: string;
  isActive: boolean;
  notes: string;
  updatedAt: string;
}

const cardStyle: React.CSSProperties = {
  background: color.bg1,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  padding: space[4],
  marginBottom: space[3],
};

function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  return document.querySelector<HTMLMetaElement>('meta[name="_csrf"]')?.content || '';
}

async function cmsGet(): Promise<OverrideEntry[]> {
  const res = await fetch('/api/admin/cms?type=astromeda_section_override', {
    credentials: 'include',
  });
  if (!res.ok) {
    if (res.status === 404 || res.status === 400) return []; // 定義未作成
    throw new Error(`HTTP ${res.status}`);
  }
  const json = (await res.json()) as {success: boolean; items?: Array<{id: string; handle: string; updatedAt: string; fields: Array<{key: string; value: string | null}>}>};
  if (!json.success || !json.items) return [];
  return json.items.map((item) => {
    const get = (k: string) => item.fields.find((f) => f.key === k)?.value || '';
    const sectionKey = (get('section_key') || item.handle) as SectionKey;
    const modeRaw = get('mode') || 'default';
    const mode: OverrideMode = ['default', 'custom_html', 'custom_css'].includes(modeRaw)
      ? (modeRaw as OverrideMode)
      : 'default';
    return {
      id: item.id,
      handle: item.handle,
      sectionKey,
      mode,
      customHtml: get('custom_html'),
      customCss: get('custom_css'),
      isActive: get('is_active') === 'true',
      notes: get('notes'),
      updatedAt: item.updatedAt,
    };
  });
}

async function cmsPost(action: 'create' | 'update' | 'delete', body: Record<string, unknown>): Promise<{success: boolean; error?: string}> {
  const csrf = getCsrfToken();
  const res = await fetch('/api/admin/cms', {
    method: 'POST',
    credentials: 'include',
    headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf},
    body: JSON.stringify({...body, action, type: 'astromeda_section_override', _csrf: csrf}),
  });
  const json = (await res.json().catch(() => ({success: false, error: 'JSON parse error'}))) as {success: boolean; error?: string};
  if (!res.ok && !json.error) json.error = `HTTP ${res.status}`;
  return json;
}

async function setupDefinition(): Promise<{success: boolean; error?: string}> {
  // patch 0166: astromeda_section_override Metaobject 定義を作成 (idempotent)
  const csrf = getCsrfToken();
  const res = await fetch('/api/admin/metaobject-definitions', {
    method: 'POST',
    credentials: 'include',
    headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf},
    body: JSON.stringify({
      action: 'create',
      type: 'astromeda_section_override',
      name: 'セクションHTML上書き',
      fieldDefinitions: [
        {key: 'section_key', name: 'セクション識別子', type: 'single_line_text_field'},
        {key: 'mode', name: 'モード', type: 'single_line_text_field'},
        {key: 'custom_html', name: 'カスタムHTML', type: 'multi_line_text_field'},
        {key: 'custom_css', name: 'カスタムCSS', type: 'multi_line_text_field'},
        {key: 'is_active', name: '有効', type: 'boolean'},
        {key: 'notes', name: '編集メモ', type: 'multi_line_text_field'},
      ],
      _csrf: csrf,
    }),
  });
  const json = (await res.json().catch(() => ({success: false, error: 'JSON parse error'}))) as {success: boolean; error?: string};
  // 既に存在する場合の 409 などは success 扱い
  if (json.error && /already exists|既に|duplicate/i.test(json.error)) {
    return {success: true};
  }
  return json;
}

export default function AdminSectionOverride() {
  const [entries, setEntries] = useState<OverrideEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const {pushToast, Toast} = useToast();
  const {confirm, dialogProps} = useConfirmDialog();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const items = await cmsGet();
      setEntries(items);
      setSetupNeeded(false);
    } catch (e) {
      // 定義未作成と推定
      setSetupNeeded(true);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSetup = useCallback(async () => {
    setSetupBusy(true);
    const res = await setupDefinition();
    setSetupBusy(false);
    if (res.success) {
      pushToast('セクションHTML上書きの保管庫を作成しました', 'success');
      await refresh();
    } else {
      pushToast(`作成失敗: ${res.error || 'unknown'}`, 'error');
    }
  }, [pushToast, refresh]);

  const handleSave = useCallback(async (entry: Partial<OverrideEntry>, isCreate: boolean) => {
    const handle = `override-${entry.sectionKey || 'unknown'}`;
    const fields = [
      {key: 'section_key', value: entry.sectionKey || ''},
      {key: 'mode', value: entry.mode || 'default'},
      {key: 'custom_html', value: entry.customHtml || ''},
      {key: 'custom_css', value: entry.customCss || ''},
      {key: 'is_active', value: String(entry.isActive ?? true)},
      {key: 'notes', value: entry.notes || ''},
    ];
    const body = isCreate
      ? {handle, fields}
      : {metaobjectId: entry.id, fields};
    const res = await cmsPost(isCreate ? 'create' : 'update', body);
    if (res.success) {
      pushToast('保存しました', 'success');
      setEditingId(null);
      setCreating(false);
      await refresh();
    } else {
      pushToast(`保存失敗: ${res.error || 'unknown'}`, 'error');
    }
  }, [pushToast, refresh]);

  const handleDelete = useCallback(async (entry: OverrideEntry) => {
    const ok = await confirm({
      title: 'セクション上書きを削除しますか？',
      message: '削除すると、このセクションは元のデザインに戻ります。後で再度作成し直すこともできます。',
      destructive: true,
      confirmLabel: '削除する',
    });
    if (!ok) return;
    const res = await cmsPost('delete', {metaobjectId: entry.id, confirm: true});
    if (res.success) {
      pushToast('削除しました — このセクションは元のデザインに戻ります', 'success');
      await refresh();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  }, [confirm, pushToast, refresh]);

  const editingEntry = editingId ? entries.find((e) => e.id === editingId) : null;
  const usedSectionKeys = useMemo(() => new Set(entries.map((e) => e.sectionKey)), [entries]);
  // patch 0166: SECTION_KEYS は readonly tuple なので filter 後は配列にキャスト
  const availableSections = useMemo(
    () => (SECTION_KEYS as readonly typeof SECTION_KEYS[number][]).filter((s) => !usedSectionKeys.has(s.key)),
    [usedSectionKeys],
  );

  return (
    <div style={{padding: 20, color: color.text}}>
      <TabHeaderHint
        title="🎨 デザイン上書き (HTML/CSS) — 上級者向け"
        description="トップページやゲーミングPCタブの各セクションを、お好みの HTML や CSS で上書きできます。デザイン会社さんに依頼した HTML をそのまま貼り付けて反映できます。"
        relatedTabs={[{label: 'お店の見た目を変える', tab: 'pageEditor'}, {label: 'メンバー管理', tab: 'members'}]}
      />

      <div style={{
        background: color.bg2,
        border: `1px dashed ${color.border}`,
        borderRadius: radius.md,
        padding: space[3],
        marginBottom: space[4],
        fontSize: 12,
        color: color.textSecondary,
        lineHeight: 1.7,
      }}>
        <b style={{color: color.text}}>使い方</b>
        <ol style={{margin: '6px 0 0 18px', padding: 0}}>
          <li>下の「＋ 新規上書きを追加」ボタンを押して、上書きしたいセクションを選びます</li>
          <li>モードを選択：「CSS だけ上書き」（見た目だけ変える）or「HTML/CSS を完全に上書き」（構造ごと差し替える）</li>
          <li>HTML / CSS を貼り付けて「保存」</li>
          <li>「公開」をオンにすると即座にお店に反映されます</li>
          <li>失敗したら「削除」ボタンで元のデザインに戻せます (壊れません)</li>
        </ol>
        <div style={{marginTop: 8, fontSize: 11, color: '#FF9500'}}>
          ⚠ HTML/CSS は <b>script タグ・iframe・onclick・javascript: URL</b> などは自動で除去されます (安全のため)
        </div>
      </div>

      {setupNeeded && (
        <div style={{
          background: '#FF950022',
          border: `2px solid #FF9500`,
          borderRadius: radius.md,
          padding: space[3],
          marginBottom: space[3],
        }}>
          <div style={{fontWeight: 800, color: color.text, marginBottom: 4}}>初回セットアップが必要です</div>
          <div style={{fontSize: 12, color: color.textSecondary, marginBottom: 10, lineHeight: 1.5}}>
            この機能を使うには、最初に Shopify 側に「セクション上書き保管庫」を作成する必要があります (1回だけ)。
          </div>
          <button
            type="button"
            onClick={handleSetup}
            disabled={setupBusy}
            style={{
              padding: '10px 18px',
              background: '#FF9500',
              color: '#0a0a0a',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 800,
              cursor: setupBusy ? 'wait' : 'pointer',
            }}
          >
            {setupBusy ? '作成中...' : '🚀 保管庫を作成する'}
          </button>
        </div>
      )}

      {loading ? (
        <AdminListSkeleton rows={3} />
      ) : !setupNeeded && entries.length === 0 && !creating ? (
        <AdminEmptyCard
          title="まだ上書きはありません"
          description="「＋ 新規上書きを追加」ボタンから、最初のセクション上書きを追加できます。"
          action={
            <button
              type="button"
              onClick={() => setCreating(true)}
              style={{
                padding: '10px 16px',
                background: color.cyan,
                color: '#0a0a0a',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              ＋ 新規上書きを追加
            </button>
          }
        />
      ) : !setupNeeded ? (
        <>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[3]}}>
            <div style={{fontSize: 14, fontWeight: 800, color: color.text}}>
              現在の上書き ({entries.length} 件)
            </div>
            {availableSections.length > 0 && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                style={{
                  padding: '8px 14px',
                  background: color.cyan,
                  color: '#0a0a0a',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                ＋ 新規上書きを追加
              </button>
            )}
          </div>

          <div style={{display: 'grid', gap: space[2]}}>
            {entries.map((entry) => {
              const sectionDef = SECTION_KEYS.find((s) => s.key === entry.sectionKey);
              const modeMeta = MODE_LABEL[entry.mode];
              return (
                <div key={entry.id} style={{...cardStyle, marginBottom: 0, padding: space[3]}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[3]}}>
                    <div style={{flex: 1}}>
                      <div style={{fontSize: 13, fontWeight: 800, color: color.text, marginBottom: 4}}>
                        {sectionDef?.label || entry.sectionKey}
                      </div>
                      <div style={{display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4}}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          background: modeMeta.color + '22',
                          color: modeMeta.color,
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 800,
                        }}>{modeMeta.label}</span>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          background: entry.isActive ? '#34C75922' : '#88888822',
                          color: entry.isActive ? '#34C759' : '#888',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 800,
                        }}>{entry.isActive ? '🟢 公開中' : '🔴 下書き'}</span>
                      </div>
                      {entry.notes && (
                        <div style={{fontSize: 11, color: color.textSecondary}}>📝 {entry.notes}</div>
                      )}
                    </div>
                    <div style={{display: 'flex', gap: 6}}>
                      <button type="button" onClick={() => setEditingId(entry.id)} style={{padding: '6px 12px', background: color.bg2, color: color.text, border: `1px solid ${color.border}`, borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer'}}>編集</button>
                      <button type="button" onClick={() => handleDelete(entry)} style={{padding: '6px 12px', background: '#FF3B30', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer'}}>削除</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {(creating || editingEntry) && (
        <OverrideForm
          initial={editingEntry || undefined}
          availableSections={creating ? availableSections : SECTION_KEYS}
          isCreate={creating}
          onCancel={() => {
            setEditingId(null);
            setCreating(false);
          }}
          onSubmit={(form) => handleSave(form, creating)}
        />
      )}

      <Toast />
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}

// ━━━ 編集フォーム (Modal 風オーバーレイ) ━━━

function OverrideForm({
  initial,
  availableSections,
  isCreate,
  onCancel,
  onSubmit,
}: {
  initial?: OverrideEntry;
  availableSections: readonly typeof SECTION_KEYS[number][];
  isCreate: boolean;
  onCancel: () => void;
  onSubmit: (form: Partial<OverrideEntry>) => void;
}) {
  const [sectionKey, setSectionKey] = useState<SectionKey>(initial?.sectionKey || availableSections[0]?.key || 'home_hero');
  const [mode, setMode] = useState<OverrideMode>(initial?.mode || 'default');
  const [customHtml, setCustomHtml] = useState(initial?.customHtml || '');
  const [customCss, setCustomCss] = useState(initial?.customCss || '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? false);
  const [notes, setNotes] = useState(initial?.notes || '');

  const sectionDef = SECTION_KEYS.find((s) => s.key === sectionKey);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      role="dialog"
      aria-modal="true"
    >
      <div style={{
        background: color.bg0,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        padding: space[4],
        maxWidth: 900,
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <div style={{fontSize: 16, fontWeight: 800, color: color.text, marginBottom: space[3]}}>
          {isCreate ? '➕ 新規セクション上書き' : '✏️ セクション上書きを編集'}
        </div>

        <div style={{display: 'grid', gap: space[3]}}>
          {/* セクション選択 */}
          <div>
            <label style={{display: 'block', fontSize: 12, fontWeight: 700, color: color.text, marginBottom: 6}}>
              対象セクション <span style={{color: '#FF3B30'}}>＊</span>
            </label>
            <select
              value={sectionKey}
              onChange={(e) => setSectionKey(e.target.value as SectionKey)}
              disabled={!isCreate}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: color.bg1,
                color: color.text,
                border: `1px solid ${color.border}`,
                borderRadius: 4,
                fontSize: 13,
              }}
            >
              {availableSections.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            {sectionDef && (
              <div style={{fontSize: 11, color: color.textSecondary, marginTop: 4}}>
                ページ: {sectionDef.page === 'home' ? 'トップページ' : sectionDef.page === 'gaming-pc' ? 'ゲーミングPCタブ' : '全ページ共通'}
              </div>
            )}
          </div>

          {/* モード選択 (segmented control) */}
          <div>
            <label style={{display: 'block', fontSize: 12, fontWeight: 700, color: color.text, marginBottom: 6}}>
              モード
            </label>
            <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
              {(['default', 'custom_css', 'custom_html'] as OverrideMode[]).map((m) => {
                const meta = MODE_LABEL[m];
                const active = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    style={{
                      flex: '1 1 200px',
                      padding: space[2],
                      background: active ? meta.color : color.bg1,
                      color: active ? '#0a0a0a' : color.text,
                      border: `1.5px solid ${meta.color}`,
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{marginBottom: 2}}>{meta.label}</div>
                    <div style={{fontSize: 10, fontWeight: 500, opacity: 0.85, lineHeight: 1.4}}>
                      {meta.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* HTML 入力 (mode=custom_html 時のみ) */}
          {mode === 'custom_html' && (
            <div>
              <label style={{display: 'block', fontSize: 12, fontWeight: 700, color: color.text, marginBottom: 6}}>
                カスタム HTML
              </label>
              <textarea
                value={customHtml}
                onChange={(e) => setCustomHtml(e.target.value)}
                rows={12}
                placeholder={`<section>\n  <h2>Hello</h2>\n  <p>このセクションを完全にこの HTML で置き換えます</p>\n</section>`}
                style={{
                  width: '100%',
                  padding: space[2],
                  background: color.bg1,
                  color: color.text,
                  border: `1px solid ${color.border}`,
                  borderRadius: 4,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  lineHeight: 1.5,
                  resize: 'vertical',
                }}
              />
              <div style={{fontSize: 11, color: color.textSecondary, marginTop: 4}}>
                {customHtml.length.toLocaleString()} / 100,000 文字
              </div>
            </div>
          )}

          {/* CSS 入力 (mode=custom_css or custom_html 時) */}
          {(mode === 'custom_css' || mode === 'custom_html') && (
            <div>
              <label style={{display: 'block', fontSize: 12, fontWeight: 700, color: color.text, marginBottom: 6}}>
                カスタム CSS
              </label>
              <textarea
                value={customCss}
                onChange={(e) => setCustomCss(e.target.value)}
                rows={8}
                placeholder={`.hero-slider-wrap {\n  background: #ff00ff;\n  padding: 40px;\n}`}
                style={{
                  width: '100%',
                  padding: space[2],
                  background: color.bg1,
                  color: color.text,
                  border: `1px solid ${color.border}`,
                  borderRadius: 4,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  lineHeight: 1.5,
                  resize: 'vertical',
                }}
              />
              <div style={{fontSize: 11, color: color.textSecondary, marginTop: 4}}>
                {customCss.length.toLocaleString()} / 100,000 文字
              </div>
            </div>
          )}

          {/* 編集メモ */}
          <div>
            <label style={{display: 'block', fontSize: 12, fontWeight: 700, color: color.text, marginBottom: 6}}>
              編集メモ (任意)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例: ○○デザイン会社 田中さん納品 (2026-04-27)"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: color.bg1,
                color: color.text,
                border: `1px solid ${color.border}`,
                borderRadius: 4,
                fontSize: 13,
              }}
            />
          </div>

          {/* 公開フラグ */}
          <ToggleSwitch
            checked={isActive}
            onChange={setIsActive}
            label="今すぐお店に反映する (公開)"
            hint="オフにすると下書き扱いになり、お客様にはこの上書きが見えません。"
          />

          {/* ボタン */}
          <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: space[2]}}>
            <button type="button" onClick={onCancel} style={{padding: '10px 18px', background: color.bg1, color: color.text, border: `1px solid ${color.border}`, borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer'}}>キャンセル</button>
            <button
              type="button"
              onClick={() => onSubmit({id: initial?.id, sectionKey, mode, customHtml, customCss, isActive, notes})}
              style={{padding: '10px 18px', background: color.cyan, color: '#0a0a0a', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 800, cursor: 'pointer'}}
            >
              💾 保存する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
