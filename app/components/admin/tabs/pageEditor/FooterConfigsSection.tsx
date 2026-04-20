/**
 * FooterConfigsSection — patch 0053 Phase C 第2段で AdminPageEditor.tsx から切り出し
 *
 * フッター 4 カラム (ポリシー/会社/サポート/SNS 等) の Metaobject (astromeda_footer_config) 管理 UI。
 * 1 エントリ = 1 カラム。全エントリが完全 (section_title + links ≥1) になった時点で
 * フロント Footer が固定 13 リンクから Metaobject 表示に切替わる。
 *
 * 元々 AdminPageEditor.tsx の L815-1188 にインライン定義されていた ~374行を独立ファイル化。
 * 振る舞いは移動前と完全同一。
 */

import React, {useCallback, useEffect, useState} from 'react';
import {T, al} from '~/lib/astromeda-data';
import PreviewFrame, {type PreviewDevice} from '~/components/admin/preview/PreviewFrame';
import {ToggleSwitch} from '~/components/admin/ds/ToggleSwitch';
import {
  type FooterConfig,
  type SectionProps,
  cardStyle,
  labelStyle,
  inputStyle,
  btn,
  thStyle,
  tdStyle,
  Spinner,
  Modal,
  apiGet,
  apiPost,
} from './shared';

// ══════════════════════════════════════════════════════════
// FooterConfigsSection
// ══════════════════════════════════════════════════════════

export function FooterConfigsSection({pushToast, confirm}: SectionProps) {
  const [items, setItems] = useState<FooterConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FooterConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<{footerConfigs: FooterConfig[]}>('/api/admin/footer-configs');
    setItems(res?.footerConfigs || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (form: Partial<FooterConfig> & {handle?: string}, isCreate: boolean) => {
    setSaving(true);
    const body: Record<string, unknown> = isCreate
      ? {
          action: 'create',
          handle: form.handle || '',
          sectionTitle: form.sectionTitle || '',
          links: form.links || [],
          sortOrder: form.sortOrder ?? 0,
          isActive: form.isActive ?? true,
        }
      : {
          action: 'update',
          metaobjectId: form.id,
          sectionTitle: form.sectionTitle,
          links: form.links,
          sortOrder: form.sortOrder,
          isActive: form.isActive,
        };
    const res = await apiPost('/api/admin/footer-configs', body);
    setSaving(false);
    if (res.success) {
      pushToast('保存しました', 'success');
      setEditing(null);
      setCreating(false);
      await load();
    } else {
      pushToast(`失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm('このエントリを削除しますか？'))) return;
    const res = await apiPost('/api/admin/footer-configs', {action: 'delete', metaobjectId: id});
    if (res.success) {
      pushToast('削除しました', 'success');
      await load();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const modalOpen = creating || editing !== null;
  const initial: Partial<FooterConfig> = creating ? {sortOrder: 0, isActive: true, links: []} : editing || {};

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>フッター設定 ({items.length})</div>
        <button type="button" onClick={() => setCreating(true)} style={btn(true)}>＋ 新規追加</button>
      </div>
      <div style={{fontSize: 10, color: T.t4, marginBottom: 10}}>
        ※ 全エントリが完全 (section_title + links ≥1) になった時点でフロント Footer が Metaobject 表示に切替わります。不完全な間は既存の 13 リンク固定表示。
      </div>
      {loading ? (
        <div style={{textAlign: 'center', padding: 40}}><Spinner /></div>
      ) : items.length === 0 ? (
        <div style={{color: T.t4, fontSize: 12, textAlign: 'center', padding: 30}}>エントリがありません</div>
      ) : (
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <thead>
            <tr>
              <th style={thStyle}>セクション名</th>
              <th style={thStyle}>リンク数</th>
              <th style={thStyle}>順</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td style={tdStyle}>{c.sectionTitle}</td>
                <td style={tdStyle}>{c.links.length}</td>
                <td style={tdStyle}>{c.sortOrder}</td>
                <td style={tdStyle}>{c.isActive ? '✓' : '—'}</td>
                <td style={{...tdStyle, textAlign: 'right'}}>
                  <button type="button" onClick={() => setEditing(c)} style={{...btn(), marginRight: 6}}>編集</button>
                  <button type="button" onClick={() => handleDelete(c.id)} style={btn(false, true)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalOpen && (
        <FooterConfigForm
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
  );
}

function FooterConfigForm({
  initial,
  isCreate,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: Partial<FooterConfig>;
  isCreate: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (form: Partial<FooterConfig> & {handle?: string}) => void;
}) {
  const [handle, setHandle] = useState(initial.handle || '');
  const [sectionTitle, setSectionTitle] = useState(initial.sectionTitle || '');
  const [links, setLinks] = useState<Array<{label: string; url: string}>>(initial.links || []);
  const [sortOrder, setSortOrder] = useState(initial.sortOrder ?? 0);
  const [isActive, setIsActive] = useState(initial.isActive ?? true);
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  const updateLink = (idx: number, key: 'label' | 'url', value: string) => {
    setLinks((prev) => prev.map((x, i) => (i === idx ? {...x, [key]: value} : x)));
  };
  const addLink = () => setLinks((prev) => [...prev, {label: '', url: ''}]);
  const removeLink = (idx: number) => setLinks((prev) => prev.filter((_, i) => i !== idx));
  const moveLink = (idx: number, dir: -1 | 1) => {
    setLinks((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  // Live preview — AstroFooter.tsx multi-column mode を再現
  // 1 FooterConfig エントリ = 1 カラム。編集中カラム + 3 プレースホルダーで 4カラムグリッド
  const previewLinks = links.filter((l) => l.label.trim() !== '');
  const isMobile = device === 'mobile';
  const previewPane = (
    <PreviewFrame device={device} onDeviceChange={setDevice}>
      <footer
        style={{
          borderTop: `1px solid ${al(T.c, 0.2)}`,
          background: '#000',
          opacity: isActive ? 1 : 0.5,
        }}
      >
        <section style={{padding: '36px 28px 20px'}}>
          {/* Brand */}
          <div style={{marginBottom: 28}}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 900,
                color: T.tx,
                letterSpacing: 4,
                marginBottom: 8,
              }}
            >
              ASTROMEDA
            </div>
            <div style={{fontSize: 11, color: T.t4, maxWidth: 500, lineHeight: 1.6}}>
              株式会社マイニングベースが手掛けるゲーミングPCブランド。
            </div>
          </div>

          {/* 4-column grid (編集中カラム + 3 placeholder) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)',
              gap: 20,
              marginBottom: 28,
            }}
          >
            {/* 編集中カラム */}
            <div>
              <div
                style={{
                  fontWeight: 800,
                  color: T.tx,
                  fontSize: 12,
                  letterSpacing: 1,
                  marginBottom: 10,
                  paddingBottom: 6,
                  borderBottom: `1px solid ${al(T.c, 0.3)}`,
                }}
              >
                {sectionTitle || '(セクション名未入力)'}
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                {previewLinks.length === 0 ? (
                  <div style={{fontSize: 10, color: T.t4, fontStyle: 'italic'}}>(リンク未設定)</div>
                ) : (
                  previewLinks.map((lk, i) => (
                    <div
                      key={`link-${i}-${lk.label}`}
                      style={{
                        color: T.t4,
                        textDecoration: 'underline',
                        fontSize: 11,
                        cursor: 'default',
                        display: 'block',
                        lineHeight: 1.4,
                      }}
                    >
                      {lk.label}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* placeholder columns (non-mobile のみ) */}
            {!isMobile &&
              [0, 1, 2].map((i) => (
                <div key={`ph${i}`}>
                  <div
                    style={{
                      fontWeight: 800,
                      color: al(T.tx, 0.25),
                      fontSize: 12,
                      letterSpacing: 1,
                      marginBottom: 10,
                      paddingBottom: 6,
                      borderBottom: `1px dashed ${al(T.tx, 0.1)}`,
                    }}
                  >
                    (他のカラム)
                  </div>
                  <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                    {[0, 1, 2].map((j) => (
                      <div
                        key={j}
                        style={{
                          height: 8,
                          background: al(T.tx, 0.05),
                          borderRadius: 2,
                          width: `${60 + j * 10}%`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </div>

          {/* Copyright + SNS (固定) */}
          <div
            style={{
              borderTop: `1px solid ${al(T.tx, 0.1)}`,
              paddingTop: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{fontSize: 10, color: T.t3}}>
              © 2026 Mining Base Co., Ltd. ALL RIGHTS RESERVED.
            </div>
            <div style={{display: 'flex', gap: 10, fontSize: 10, color: T.t4}}>
              <span>X</span>
              <span>LINE</span>
              <span>Instagram</span>
            </div>
          </div>
        </section>
      </footer>
      <div style={{fontSize: 9, color: T.t4, textAlign: 'center', marginTop: 8, padding: '0 8px'}}>
        ※ 1 エントリ = 1 カラム。他カラムは別 FooterConfig エントリとして管理
      </div>
    </PreviewFrame>
  );

  return (
    <Modal title={isCreate ? 'フッター 新規追加' : 'フッター 編集'} onClose={onCancel} preview={previewPane}>
      <div style={{display: 'grid', gap: 12}}>
        {isCreate && (
          <div>
            <label style={labelStyle}>Handle</label>
            <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} style={inputStyle} />
          </div>
        )}
        <div>
          <label style={labelStyle}>セクション名</label>
          <input type="text" value={sectionTitle} onChange={(e) => setSectionTitle(e.target.value)} style={inputStyle} placeholder="ポリシー" />
        </div>
        <div>
          <label style={labelStyle}>リンク一覧 ({links.length} 件)</label>
          <div style={{display: 'grid', gap: 6}}>
            {links.map((lk, i) => (
              <div key={i} style={{display: 'grid', gridTemplateColumns: '1fr 2fr auto auto auto', gap: 4, alignItems: 'center'}}>
                <input
                  type="text"
                  value={lk.label}
                  onChange={(e) => updateLink(i, 'label', e.target.value)}
                  placeholder="利用規約"
                  style={inputStyle}
                />
                <input
                  type="text"
                  value={lk.url}
                  onChange={(e) => updateLink(i, 'url', e.target.value)}
                  placeholder="/policies/terms"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => moveLink(i, -1)}
                  disabled={i === 0}
                  style={{...btn(), padding: '4px 8px'}}
                  aria-label={`リンク ${i + 1} を上へ移動`}
                  title="上へ"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveLink(i, 1)}
                  disabled={i === links.length - 1}
                  style={{...btn(), padding: '4px 8px'}}
                  aria-label={`リンク ${i + 1} を下へ移動`}
                  title="下へ"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeLink(i)}
                  style={btn(false, true)}
                  aria-label={`リンク ${i + 1} を削除`}
                  title="削除"
                >
                  −
                </button>
              </div>
            ))}
            <button type="button" onClick={addLink} style={{...btn(), alignSelf: 'flex-start'}}>＋ リンク追加</button>
          </div>
        </div>
        <div>
          <label style={labelStyle}>表示順</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)} style={inputStyle} />
        </div>
        <div>
          <ToggleSwitch
            checked={isActive}
            onChange={setIsActive}
            label="フロントに表示する"
            hint="オフにすると下書き扱いになり、お客様にはこのカラムが見えません。"
          />
        </div>
        <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
          <button type="button" onClick={onCancel} style={btn()} disabled={saving}>キャンセル</button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                id: initial.id,
                handle,
                sectionTitle,
                links: links.filter((l) => l.label.trim() !== '' && l.url.trim() !== ''),
                sortOrder,
                isActive,
              })
            }
            style={btn(true)}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
