/**
 * AboutSectionsSection — patch 0052 Phase C 第2段で AdminPageEditor.tsx から切り出し
 *
 * トップページ「ABOUT セクション」の Metaobject (astromeda_about_section) 管理 UI。
 * 元々 AdminPageEditor.tsx の L809-1147 にインライン定義されていた ~339行を
 * 独立ファイルへ移動し、モンスターファイル解体を更に進める。
 *
 * 依存は shared.tsx と admin/ds/UrlPicker + admin/preview/PreviewFrame のみ。
 * 振る舞いは移動前と完全同一。
 */

import React, {useCallback, useEffect, useState} from 'react';
import {T, al} from '~/lib/astromeda-data';
import PreviewFrame, {type PreviewDevice} from '~/components/admin/preview/PreviewFrame';
import {UrlPicker} from '~/components/admin/ds/UrlPicker';
import {ToggleSwitch} from '~/components/admin/ds/ToggleSwitch';
import {
  type AboutSection,
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
// AboutSectionsSection
// ══════════════════════════════════════════════════════════

export function AboutSectionsSection({pushToast, confirm}: SectionProps) {
  const [items, setItems] = useState<AboutSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AboutSection | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<{aboutSections: AboutSection[]}>('/api/admin/about-sections');
    setItems(res?.aboutSections || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (form: Partial<AboutSection> & {handle?: string}, isCreate: boolean) => {
    setSaving(true);
    const body: Record<string, unknown> = isCreate
      ? {
          action: 'create',
          handle: form.handle || '',
          title: form.title || '',
          bodyHtml: form.bodyHtml || '',
          linkUrl: form.linkUrl || '',
          linkLabel: form.linkLabel || '',
          isActive: form.isActive ?? true,
          image: form.image || undefined,
        }
      : {
          action: 'update',
          metaobjectId: form.id,
          title: form.title,
          bodyHtml: form.bodyHtml,
          linkUrl: form.linkUrl,
          linkLabel: form.linkLabel,
          isActive: form.isActive,
          image: form.image || undefined,
        };
    const res = await apiPost('/api/admin/about-sections', body);
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
    const res = await apiPost('/api/admin/about-sections', {action: 'delete', metaobjectId: id});
    if (res.success) {
      pushToast('削除しました', 'success');
      await load();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const modalOpen = creating || editing !== null;
  const initial: Partial<AboutSection> = creating ? {isActive: true} : editing || {};

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>ABOUT セクション ({items.length})</div>
        <button type="button" onClick={() => setCreating(true)} style={btn(true)}>＋ 新規追加</button>
      </div>
      {loading ? (
        <div style={{textAlign: 'center', padding: 40}}><Spinner /></div>
      ) : items.length === 0 ? (
        <div style={{color: T.t4, fontSize: 12, textAlign: 'center', padding: 30}}>エントリがありません</div>
      ) : (
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <thead>
            <tr>
              <th style={thStyle}>タイトル</th>
              <th style={thStyle}>本文 (抜粋)</th>
              <th style={thStyle}>リンクラベル</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td style={tdStyle}>{c.title}</td>
                <td style={{...tdStyle, color: T.t5, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                  {c.bodyHtml.replace(/<[^>]*>/g, '').slice(0, 60)}
                </td>
                <td style={tdStyle}>{c.linkLabel}</td>
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
        <AboutSectionForm
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

function AboutSectionForm({
  initial,
  isCreate,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: Partial<AboutSection>;
  isCreate: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (form: Partial<AboutSection> & {handle?: string}) => void;
}) {
  const [handle, setHandle] = useState(initial.handle || '');
  const [title, setTitle] = useState(initial.title || '');
  const [bodyHtml, setBodyHtml] = useState(initial.bodyHtml || '');
  const [image, setImage] = useState(initial.image || '');
  const [linkUrl, setLinkUrl] = useState(initial.linkUrl || '');
  const [linkLabel, setLinkLabel] = useState(initial.linkLabel || '');
  const [isActive, setIsActive] = useState(initial.isActive ?? true);
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  // Live preview — 2カラム ABOUT セクション(左 image / 右 title+bodyHtml+CTA)
  const safeBodyHtml = bodyHtml.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  const previewPane = (
    <PreviewFrame device={device} onDeviceChange={setDevice}>
      <div style={{padding: 32, opacity: isActive ? 1 : 0.5}}>
        <div
          className="aped-about-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: device === 'mobile' ? '1fr' : '1fr 1fr',
            gap: 28,
            alignItems: 'center',
            background: `linear-gradient(135deg, #0a0e1a 0%, #0f1a2e 50%, #162040 100%)`,
            border: `1px solid ${al(T.c, 0.15)}`,
            borderRadius: 16,
            padding: 32,
          }}
        >
          {/* 左: Image */}
          <div
            style={{
              aspectRatio: '4/3',
              borderRadius: 12,
              overflow: 'hidden',
              position: 'relative',
              background: image
                ? T.bg
                : `linear-gradient(160deg, ${al(T.c, 0.18)}, ${al(T.tx, 0.02)} 70%)`,
              border: `1px solid ${al(T.tx, 0.08)}`,
            }}
          >
            {image && /^https?:\/\//.test(image) ? (
              <img
                src={image}
                alt={title || ''}
                style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block'}}
              />
            ) : (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: T.t4,
                  fontSize: 11,
                }}
              >
                {image ? `(画像ID: ${image.slice(0, 30)}...)` : '(画像未設定)'}
              </div>
            )}
          </div>

          {/* 右: Content */}
          <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: T.c,
                letterSpacing: 4,
                opacity: 0.8,
              }}
            >
              ABOUT
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 900,
                color: '#fff',
                lineHeight: 1.3,
                margin: 0,
              }}
            >
              {title || '(タイトル未入力)'}
            </div>
            {safeBodyHtml ? (
              <div
                style={{
                  fontSize: 13,
                  color: T.t5,
                  lineHeight: 1.7,
                }}
                dangerouslySetInnerHTML={{__html: safeBodyHtml}}
              />
            ) : (
              <div style={{fontSize: 12, color: T.t4, fontStyle: 'italic'}}>
                (本文未入力)
              </div>
            )}
            {(linkLabel || linkUrl) && (
              <div style={{marginTop: 8}}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '10px 20px',
                    background: al(T.c, 0.12),
                    border: `1px solid ${al(T.c, 0.4)}`,
                    borderRadius: 8,
                    color: T.c,
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: 1,
                  }}
                >
                  {linkLabel || '(ラベル未入力)'}
                </span>
                {linkUrl && (
                  <div style={{fontSize: 9, color: T.t4, marginTop: 4, fontFamily: 'monospace'}}>
                    → {linkUrl}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{fontSize: 9, color: T.t4, textAlign: 'center', marginTop: 14}}>
          ※ 2カラム layout preview (mobile = 縦積み)
        </div>
      </div>
    </PreviewFrame>
  );

  return (
    <Modal
      title={isCreate ? 'ABOUT セクション 新規追加' : 'ABOUT セクション 編集'}
      onClose={onCancel}
      preview={previewPane}
    >
      <div style={{display: 'grid', gap: 12}}>
        {isCreate && (
          <div>
            <label style={labelStyle}>Handle</label>
            <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} style={inputStyle} />
          </div>
        )}
        <div>
          <label style={labelStyle}>タイトル</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>本文 HTML</label>
          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            rows={6}
            style={{...inputStyle, fontFamily: 'monospace'}}
          />
          <div style={{fontSize: 10, color: T.t4, marginTop: 4}}>
            &lt;script&gt;タグは使用不可。その他 HTML タグは許可。
          </div>
        </div>
        <div>
          <label style={labelStyle}>画像（Shopify 画像ID・任意）</label>
          <input type="text" value={image} onChange={(e) => setImage(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <UrlPicker
            label="リンク URL"
            optional
            value={linkUrl}
            onChange={(next) => setLinkUrl(next)}
          />
        </div>
        <div>
          <label style={labelStyle}>リンクラベル</label>
          <input type="text" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} style={inputStyle} placeholder="詳しく見る →" />
        </div>
        <div>
          <ToggleSwitch
            checked={isActive}
            onChange={setIsActive}
            label="フロントに表示する"
            hint="オフにすると下書き扱いになり、お客様にはこのセクションが見えません。"
          />
        </div>
        <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
          <button type="button" onClick={onCancel} style={btn()} disabled={saving}>キャンセル</button>
          <button
            type="button"
            onClick={() => onSubmit({id: initial.id, handle, title, bodyHtml, image, linkUrl, linkLabel, isActive})}
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
