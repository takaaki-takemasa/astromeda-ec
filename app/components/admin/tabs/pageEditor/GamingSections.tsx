/**
 * GamingSections — patch 0056 Phase C 第2段で AdminPageEditor.tsx から切り出し
 *
 * GamingPCLanding (= /guides/how-to-choose) 用の Metaobject 管理 UI バンドル。
 * 6 セクション: GamingCrudSection (汎用 CRUD 実体) + 5 の thin wrapper + GamingContactSection。
 *
 * Metaobject タイプ:
 *  - astromeda_gaming_feature_card  → GamingFeatureCardsSection  (特集カード)
 *  - astromeda_gaming_parts_card    → GamingPartsCardsSection    (CPU/GPU カード)
 *  - astromeda_gaming_price_range   → GamingPriceRangesSection   (価格帯リンク)
 *  - astromeda_gaming_hero_slide    → GamingHeroSlidesSection    (ヒーロースライド / label = alt_text)
 *  - astromeda_gaming_contact       → GamingContactSection       (電話 / LINE 連絡先・単一エントリ)
 *
 * フロント側のフォールバック (GamingPCLanding のハードコード) は、Metaobject に 1 件でも
 * 存在すれば Metaobject 側が優先される (exclusive-OR merge)。CEO 要望「最下層タブまで UI 編集可能」
 * の最後のピース。
 *
 * 元々 AdminPageEditor.tsx の L1162-1647 にインライン定義されていた ~486行を独立ファイル化。
 * 振る舞いは移動前と完全同一。
 */

import React, {useCallback, useEffect, useState} from 'react';
import {T, al} from '~/lib/astromeda-data';
import {UrlPicker} from '~/components/admin/ds/UrlPicker';
import {ToggleSwitch} from '~/components/admin/ds/ToggleSwitch';
import {
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
  cmsCreate,
  cmsUpdate,
  cmsDelete,
} from './shared';

// ══════════════════════════════════════════════════════════
// patch 0038: GamingPCLanding 6セクションを Metaobject 化
// ══════════════════════════════════════════════════════════

type GamingCmsItem = {
  id: string;
  handle: string;
  label?: string;
  // patch 0039: gaming_hero_slide は alt_text、contact は phone_number 等の専用フィールドを持つ
  alt_text?: string;
  image_url?: string;
  link_url?: string;
  category?: string;
  display_order?: string;
  is_active?: string;
  phone_number?: string;
  phone_hours?: string;
  line_url?: string;
  line_label?: string;
  line_hours?: string;
};

// cmsList は GamingCmsItem 型に特化した helper なのでここに置く。
// （shared の cmsCreate/cmsUpdate/cmsDelete は型を絞らない汎用版を使う。）
async function cmsList(type: string): Promise<GamingCmsItem[]> {
  const res = await apiGet<{success: boolean; items?: GamingCmsItem[]}>(`/api/admin/cms?type=${type}`);
  return (res?.items || []) as GamingCmsItem[];
}

interface GamingSectionConfig {
  type: string;
  title: string;
  description: string;
  /** CPU / GPU 等のカテゴリプルダウンを出すか */
  withCategory?: boolean;
  /** 画像URLフィールドを出すか */
  withImage?: boolean;
  categoryOptions?: Array<{value: string; label: string}>;
  /** patch 0039: ラベルフィールドの Metaobject キー名を上書き（gaming_hero_slide では 'alt_text'） */
  labelFieldKey?: string;
  /** patch 0039: ラベル UI 表示名（例: 代替テキスト） */
  labelFieldName?: string;
}

function GamingCrudSection({
  config,
  pushToast,
  confirm,
}: {config: GamingSectionConfig} & SectionProps) {
  const [items, setItems] = useState<GamingCmsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<GamingCmsItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  // フォーム state
  const [fHandle, setFHandle] = useState('');
  const [fLabel, setFLabel] = useState('');
  const [fImageUrl, setFImageUrl] = useState('');
  const [fLinkUrl, setFLinkUrl] = useState('');
  const [fCategory, setFCategory] = useState(config.categoryOptions?.[0]?.value || '');
  const [fDisplayOrder, setFDisplayOrder] = useState(0);
  const [fIsActive, setFIsActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await cmsList(config.type);
    // display_order 昇順でソート
    list.sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));
    setItems(list);
    setLoading(false);
  }, [config.type]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setCreating(true);
    setEditing(null);
    setFHandle('');
    setFLabel('');
    setFImageUrl('');
    setFLinkUrl('');
    setFCategory(config.categoryOptions?.[0]?.value || '');
    setFDisplayOrder(items.length + 1);
    setFIsActive(true);
  };

  const openEdit = (item: GamingCmsItem) => {
    setEditing(item);
    setCreating(false);
    setFHandle(item.handle || '');
    // patch 0039: labelFieldKey が 'alt_text' ならそれを読み込む
    const labelKey = config.labelFieldKey || 'label';
    setFLabel(((item as Record<string, string | undefined>)[labelKey]) || '');
    setFImageUrl(item.image_url || '');
    setFLinkUrl(item.link_url || '');
    setFCategory(item.category || config.categoryOptions?.[0]?.value || '');
    setFDisplayOrder(Number(item.display_order || 0));
    setFIsActive(item.is_active !== 'false');
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!fLabel.trim()) {
      pushToast(`${config.labelFieldName || 'ラベル'}は必須です`, 'error');
      return;
    }
    setSaving(true);
    // patch 0039: labelFieldKey で metaobject field key を切替（gaming_hero_slide では 'alt_text'）
    const labelKey = config.labelFieldKey || 'label';
    const fields: Array<{key: string; value: string}> = [
      {key: labelKey, value: fLabel},
      {key: 'link_url', value: fLinkUrl},
      {key: 'display_order', value: String(fDisplayOrder)},
      {key: 'is_active', value: fIsActive ? 'true' : 'false'},
    ];
    if (config.withImage) {
      fields.push({key: 'image_url', value: fImageUrl});
    }
    if (config.withCategory) {
      fields.push({key: 'category', value: fCategory});
    }
    const res = creating
      ? await cmsCreate(config.type, fHandle || `${config.type.replace('astromeda_', '')}-${Date.now()}`, fields)
      : await cmsUpdate(config.type, editing!.id, fields);
    setSaving(false);
    if (res.success) {
      pushToast(creating ? '作成しました' : '更新しました', 'success');
      closeModal();
      await load();
    } else {
      pushToast(`保存失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const handleDelete = async (item: GamingCmsItem) => {
    const labelKey = config.labelFieldKey || 'label';
    const labelVal = (item as Record<string, string | undefined>)[labelKey] || item.handle;
    if (!(await confirm(`「${labelVal}」を削除しますか？`))) return;
    const res = await cmsDelete(config.type, item.id);
    if (res.success) {
      pushToast('削除しました', 'success');
      await load();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const modalOpen = creating || editing !== null;

  return (
    <div style={cardStyle}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
        <div>
          <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>{config.title} ({items.length})</div>
          <div style={{fontSize: 10, color: T.t4, marginTop: 3}}>{config.description}</div>
        </div>
        <button type="button" onClick={openCreate} style={btn(true)}>＋ 新規追加</button>
      </div>
      {items.length === 0 && !loading && (
        <div style={{
          background: al(T.c, 0.08),
          border: `1px solid ${al(T.c, 0.3)}`,
          borderRadius: 8,
          padding: 14,
          fontSize: 12,
          color: T.tx,
          marginBottom: 14,
          lineHeight: 1.6,
        }}>
          <div style={{fontWeight: 800, marginBottom: 4}}>📦 Metaobject は空です — フロントはコード内ハードコード値を表示中</div>
          <div style={{color: T.t4, fontSize: 11}}>
            新規追加するとこのセクションが Metaobject から読み込まれるようになります。1件でも追加すると、フロントのハードコード値は完全に置き換わります。
          </div>
        </div>
      )}
      {loading ? (
        <div style={{textAlign: 'center', padding: 30}}><Spinner /></div>
      ) : items.length === 0 ? (
        <div style={{color: T.t4, fontSize: 12, textAlign: 'center', padding: 20}}>エントリがありません</div>
      ) : (
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <thead>
            <tr>
              {config.withImage && <th style={thStyle}>画像</th>}
              <th style={thStyle}>{config.labelFieldName || 'ラベル'}</th>
              {config.withCategory && <th style={thStyle}>カテゴリ</th>}
              <th style={thStyle}>リンク</th>
              <th style={thStyle}>順</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                {config.withImage && (
                  <td style={{...tdStyle, width: 72}}>
                    {item.image_url && /^https?:\/\//.test(item.image_url) ? (
                      <img src={item.image_url} alt={item.label || item.alt_text || ''} style={{width: 64, height: 40, objectFit: 'contain', borderRadius: 4, background: '#000'}} />
                    ) : (
                      <div style={{width: 64, height: 40, borderRadius: 4, background: al(T.tx, 0.05), fontSize: 9, color: T.t4, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>未設定</div>
                    )}
                  </td>
                )}
                <td style={tdStyle}>{(item as Record<string, string | undefined>)[config.labelFieldKey || 'label'] || <span style={{color: T.t4}}>(未入力)</span>}</td>
                {config.withCategory && <td style={tdStyle}>{item.category || '—'}</td>}
                <td style={{...tdStyle, color: T.t5, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{item.link_url || '—'}</td>
                <td style={tdStyle}>{item.display_order || 0}</td>
                <td style={tdStyle}>{item.is_active !== 'false' ? '✓' : '—'}</td>
                <td style={{...tdStyle, textAlign: 'right'}}>
                  <button type="button" onClick={() => openEdit(item)} style={{...btn(), marginRight: 6}}>編集</button>
                  <button type="button" onClick={() => handleDelete(item)} style={btn(false, true)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalOpen && (
        <Modal title={creating ? `${config.title} 新規追加` : `${config.title} 編集`} onClose={closeModal}>
          <div style={{display: 'grid', gap: 12}}>
            {creating && (
              <div>
                <label style={labelStyle}>Handle（省略時は自動生成）</label>
                <input type="text" value={fHandle} onChange={(e) => setFHandle(e.target.value)} style={inputStyle} placeholder={`${config.type.replace('astromeda_', '')}-xxx`} />
              </div>
            )}
            <div>
              <label style={labelStyle}>{config.labelFieldName || 'ラベル'} *</label>
              <input type="text" value={fLabel} onChange={(e) => setFLabel(e.target.value)} style={inputStyle} />
            </div>
            {config.withImage && (
              <div>
                <label style={labelStyle}>画像 URL（ロゴ・アイコン画像）</label>
                <input type="text" value={fImageUrl} onChange={(e) => setFImageUrl(e.target.value)} style={inputStyle} placeholder="https://..." />
                <div style={{fontSize: 10, color: T.t4, marginTop: 4}}>
                  ※ Shopify にアップロード済みの画像 URL を貼ってください。/images/... などの相対パスも可。
                </div>
              </div>
            )}
            {config.withCategory && config.categoryOptions && (
              <div>
                <label style={labelStyle}>カテゴリ</label>
                <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} style={inputStyle}>
                  {config.categoryOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <UrlPicker
                label="リンク先"
                optional
                value={fLinkUrl}
                onChange={(next) => setFLinkUrl(next)}
              />
            </div>
            <div>
              <label style={labelStyle}>表示順</label>
              <input type="number" value={fDisplayOrder} onChange={(e) => setFDisplayOrder(parseInt(e.target.value, 10) || 0)} style={inputStyle} />
            </div>
            <div>
              <ToggleSwitch
                checked={fIsActive}
                onChange={setFIsActive}
                label="フロントに表示する"
                hint="オフにすると下書き扱いになり、お客様には見えません。"
              />
            </div>
            <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
              <button type="button" onClick={closeModal} style={btn()} disabled={saving}>キャンセル</button>
              <button type="button" onClick={handleSave} style={btn(true)} disabled={saving}>
                {saving ? '保存中…' : creating ? '作成' : '保存'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function GamingFeatureCardsSection(props: SectionProps) {
  return (
    <GamingCrudSection
      {...props}
      config={{
        type: 'astromeda_gaming_feature_card',
        title: '🎮 ゲーミングPC 特集カード',
        description: 'ゲーミングPC ランディング「FEATURE / 特集」セクションのカード（売上ランキング/NEW/RTX5090/AMD 等）。',
        withImage: true,
      }}
    />
  );
}

export function GamingPartsCardsSection(props: SectionProps) {
  return (
    <GamingCrudSection
      {...props}
      config={{
        type: 'astromeda_gaming_parts_card',
        title: '🎮 ゲーミングPC パーツカード (CPU / GPU)',
        description: '「パーツで選ぶ」セクションの CPU / GPU カード。category で cpu / gpu を指定してください。',
        withImage: true,
        withCategory: true,
        categoryOptions: [
          {value: 'cpu', label: 'CPU'},
          {value: 'gpu', label: 'GPU'},
        ],
      }}
    />
  );
}

export function GamingPriceRangesSection(props: SectionProps) {
  return (
    <GamingCrudSection
      {...props}
      config={{
        type: 'astromeda_gaming_price_range',
        title: '🎮 ゲーミングPC 価格帯リンク',
        description: '「値段で選ぶ」セクションの価格帯リンク（例: 200,001〜250,000円 → /collections/gaming-pc?price=200001-250000）。',
      }}
    />
  );
}

// ══════════════════════════════════════════════════════════
// patch 0039: ゲーミングPC ヒーロースライド (astromeda_gaming_hero_slide)
// ラベルフィールドは alt_text（代替テキスト）
// ══════════════════════════════════════════════════════════
export function GamingHeroSlidesSection(props: SectionProps) {
  return (
    <GamingCrudSection
      {...props}
      config={{
        type: 'astromeda_gaming_hero_slide',
        title: '🎮 ゲーミングPC ヒーロースライド',
        description: 'ゲーミングPC LP 上部のスライダー画像。トップページとは別管理。',
        withImage: true,
        labelFieldKey: 'alt_text',
        labelFieldName: '代替テキスト (alt)',
      }}
    />
  );
}

// ══════════════════════════════════════════════════════════
// patch 0039: ゲーミングPC お問い合わせ (astromeda_gaming_contact)
// 単一エントリ編集（handle=default を自動使用）
// ══════════════════════════════════════════════════════════
export function GamingContactSection({pushToast, confirm}: SectionProps) {
  const [item, setItem] = useState<GamingCmsItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fPhoneNumber, setFPhoneNumber] = useState('');
  const [fPhoneHours, setFPhoneHours] = useState('');
  const [fLineUrl, setFLineUrl] = useState('');
  const [fLineLabel, setFLineLabel] = useState('');
  const [fLineHours, setFLineHours] = useState('');
  const [fIsActive, setFIsActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await cmsList('astromeda_gaming_contact');
    const first = list[0] || null;
    setItem(first);
    setFPhoneNumber(first?.phone_number || '');
    setFPhoneHours(first?.phone_hours || '');
    setFLineUrl(first?.line_url || '');
    setFLineLabel(first?.line_label || '');
    setFLineHours(first?.line_hours || '');
    setFIsActive(first ? first.is_active !== 'false' : true);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    const fields: Array<{key: string; value: string}> = [
      {key: 'phone_number', value: fPhoneNumber},
      {key: 'phone_hours', value: fPhoneHours},
      {key: 'line_url', value: fLineUrl},
      {key: 'line_label', value: fLineLabel},
      {key: 'line_hours', value: fLineHours},
      {key: 'is_active', value: fIsActive ? 'true' : 'false'},
    ];
    const res = item
      ? await cmsUpdate('astromeda_gaming_contact', item.id, fields)
      : await cmsCreate('astromeda_gaming_contact', 'default', fields);
    setSaving(false);
    if (res.success) {
      pushToast(item ? '更新しました' : '作成しました', 'success');
      await load();
    } else {
      pushToast(`保存失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    if (!(await confirm('お問い合わせ情報を削除しますか？削除するとフロントはハードコードのフォールバックに戻ります'))) return;
    const res = await cmsDelete('astromeda_gaming_contact', item.id);
    if (res.success) {
      pushToast('削除しました', 'success');
      await load();
    } else {
      pushToast(`削除失敗: ${res.error || 'unknown'}`, 'error');
    }
  };

  if (loading) return <div style={{textAlign: 'center', padding: 30}}><Spinner /></div>;

  return (
    <div style={cardStyle}>
      <div style={{marginBottom: 14}}>
        <div style={{fontSize: 13, fontWeight: 800, color: T.tx}}>📞 ゲーミングPC お問い合わせ {item ? '(設定中)' : '(未設定 — フォールバック表示中)'}</div>
        <div style={{fontSize: 10, color: T.t4, marginTop: 3}}>ゲーミングPC LP「CONTACT」セクションの電話・LINE 連絡先。1件のみ設定。</div>
      </div>
      {!item && (
        <div style={{
          background: al(T.c, 0.08),
          border: `1px solid ${al(T.c, 0.3)}`,
          borderRadius: 8,
          padding: 14,
          fontSize: 12,
          color: T.tx,
          marginBottom: 14,
          lineHeight: 1.6,
        }}>
          <div style={{fontWeight: 800, marginBottom: 4}}>📦 Metaobject は空 — フロントはハードコード値（03-6903-5371 / lin.ee/v43hEUKX）を表示中</div>
          <div style={{color: T.t4, fontSize: 11}}>下記を入力して保存すると、フロントが Metaobject から読み込まれるようになります。</div>
        </div>
      )}
      <div style={{display: 'grid', gap: 14}}>
        <div>
          <label style={labelStyle}>電話番号（表示用テキスト）</label>
          <input type="text" value={fPhoneNumber} onChange={(e) => setFPhoneNumber(e.target.value)} style={inputStyle} placeholder="03-6903-5371" />
          <div style={{fontSize: 10, color: T.t4, marginTop: 4}}>※ tel: リンクは自動生成されます（数字とハイフン以外は除去）</div>
        </div>
        <div>
          <label style={labelStyle}>電話 営業時間</label>
          <input type="text" value={fPhoneHours} onChange={(e) => setFPhoneHours(e.target.value)} style={inputStyle} placeholder="営業時間：午前9時〜午後6時" />
        </div>
        <div>
          <label style={labelStyle}>LINE URL</label>
          <input type="text" value={fLineUrl} onChange={(e) => setFLineUrl(e.target.value)} style={inputStyle} placeholder="https://lin.ee/v43hEUKX" />
        </div>
        <div>
          <label style={labelStyle}>LINE ボタンラベル</label>
          <input type="text" value={fLineLabel} onChange={(e) => setFLineLabel(e.target.value)} style={inputStyle} placeholder="公式LINEを友達追加" />
        </div>
        <div>
          <label style={labelStyle}>LINE 営業時間</label>
          <input type="text" value={fLineHours} onChange={(e) => setFLineHours(e.target.value)} style={inputStyle} placeholder="営業時間：午前9時〜午後6時" />
        </div>
        <div>
          <ToggleSwitch
            checked={fIsActive}
            onChange={setFIsActive}
            label="フロントに表示する"
            hint="オフにすると下書き扱いになり、お客様には見えません。"
          />
        </div>
        <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
          {item && <button type="button" onClick={handleDelete} style={btn(false, true)}>削除</button>}
          <button type="button" onClick={handleSave} style={btn(true)} disabled={saving}>
            {saving ? '保存中…' : item ? '更新' : '作成'}
          </button>
        </div>
      </div>
    </div>
  );
}
