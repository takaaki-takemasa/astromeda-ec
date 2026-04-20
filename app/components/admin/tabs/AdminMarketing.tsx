/**
 * AdminMarketing Tab — キャンペーン管理
 *
 * CMS API経由でastromeda_campaign MetaobjectのCRUD。
 * カスタムオプション（astromeda_custom_option）管理も統合。
 */

import { useState, useEffect, useCallback } from 'react';
import { color, font, radius, space } from '~/lib/design-tokens';
import { CompactKPI } from '~/components/admin/CompactKPI';
import { Modal } from '~/components/admin/Modal';
import PreviewFrame, { type PreviewDevice } from '~/components/admin/preview/PreviewFrame';
import { T, al } from '~/lib/astromeda-data';
// patch 0048 (Phase A 適用): window.confirm() 置換用の Stripe 水準確認モーダル
import { useConfirmDialog } from '~/hooks/useConfirmDialog';

// ── Types ──
interface MetaobjectNode {
  id: string;
  handle: string;
  type: string;
  updatedAt?: string;
  [key: string]: string | undefined;
}

type SubTab = 'campaigns' | 'options';

// ── Styles ──
const cardStyle: React.CSSProperties = {
  background: color.bg1,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  padding: space[4],
  marginBottom: space[3],
};

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

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  fontSize: font.sm,
  fontWeight: active ? 700 : 500,
  color: active ? '#000' : color.cyan,
  background: active ? color.cyan : 'transparent',
  border: `1px solid ${active ? color.cyan : 'rgba(0,240,255,.3)'}`,
  borderRadius: radius.md,
  cursor: 'pointer',
  fontFamily: font.family,
});

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

// ── CMS API helpers ──
async function cmsGet(type: string): Promise<MetaobjectNode[]> {
  const res = await fetch(`/api/admin/cms?type=${type}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const json = await res.json();
  return json.items ?? [];
}

async function cmsPost(body: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('/api/admin/cms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Toast ──
function Toast({ msg, type }: { msg: string; type: 'ok' | 'err' }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, padding: '10px 20px',
      borderRadius: radius.md, fontSize: font.sm, fontWeight: 600,
      color: type === 'ok' ? '#000' : '#fff',
      background: type === 'ok' ? color.cyan : color.red,
      zIndex: 200, boxShadow: '0 4px 20px rgba(0,0,0,.5)',
    }}>
      {msg}
    </div>
  );
}

// ══════════════════════════════════
// Preview Components
// ══════════════════════════════════

/**
 * CampaignBannerPreview — サイトバナーでのキャンペーン表示イメージ
 * banner_text / accent_color / discount_rate / status を視覚化
 */
function CampaignBannerPreview({
  name,
  banner_text,
  accent_color,
  discount_rate,
  status,
  campaign_type,
  start_date,
  end_date,
  description,
  is_active,
}: {
  name?: string;
  banner_text?: string;
  accent_color?: string;
  discount_rate?: string;
  status?: string;
  campaign_type?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
  is_active?: string;
}) {
  const accent = accent_color || '#00F0FF';
  const active = is_active !== 'false';
  const discount = Number(discount_rate || 0);
  const statusLabel = status === 'active' ? '実施中' : status === 'planned' ? '予定' : status === 'completed' ? '完了' : '';
  const typeLabel = campaign_type === 'sale' ? 'SALE' :
    campaign_type === 'promotion' ? 'PROMO' :
    campaign_type === 'collab' ? 'COLLAB' :
    campaign_type === 'seasonal' ? 'SEASONAL' :
    campaign_type === 'clearance' ? 'CLEARANCE' : '';

  return (
    <div style={{ background: T.bg, color: T.tx, fontFamily: 'inherit', padding: 0 }}>
      {/* Top banner strip */}
      <div style={{
        background: `linear-gradient(90deg, ${accent} 0%, ${al(accent, 0.6)} 100%)`,
        color: '#000',
        padding: '12px 20px',
        textAlign: 'center',
        fontWeight: 800,
        fontSize: 14,
        letterSpacing: '0.02em',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {banner_text || '(バナーテキスト未入力)'}
        {discount > 0 && (
          <span style={{
            marginLeft: 12,
            background: '#000',
            color: accent,
            padding: '2px 10px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 900,
          }}>
            {discount}% OFF
          </span>
        )}
      </div>

      {/* Detail card (mocked hero-below campaign card) */}
      <div style={{ padding: 20 }}>
        <div style={{
          background: al(accent, 0.08),
          border: `1px solid ${al(accent, 0.4)}`,
          borderRadius: 12,
          padding: 16,
          position: 'relative',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            {typeLabel && (
              <span style={{
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.08em',
                padding: '3px 8px',
                borderRadius: 4,
                background: accent,
                color: '#000',
              }}>
                {typeLabel}
              </span>
            )}
            {statusLabel && (
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 999,
                background: status === 'active' ? '#22c55e' : status === 'planned' ? accent : al(T.tx, 0.2),
                color: status === 'active' ? '#fff' : status === 'planned' ? '#000' : T.t4,
              }}>
                {statusLabel}
              </span>
            )}
            {!active && (
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 4,
                background: al(T.tx, 0.1),
                color: T.t4,
              }}>
                非表示
              </span>
            )}
          </div>

          <h3 style={{
            fontSize: 18,
            fontWeight: 900,
            margin: '0 0 8px',
            color: T.tx,
            lineHeight: 1.3,
          }}>
            {name || '(キャンペーン名未入力)'}
          </h3>

          {(start_date || end_date) && (
            <div style={{
              fontSize: 11,
              color: T.t4,
              marginBottom: 10,
              fontFamily: 'monospace',
            }}>
              {start_date || '...'} 〜 {end_date || '...'}
            </div>
          )}

          {description && (
            <p style={{
              fontSize: 12,
              lineHeight: 1.6,
              color: al(T.tx, 0.8),
              margin: '0 0 12px',
              whiteSpace: 'pre-wrap',
            }}>
              {description}
            </p>
          )}

          <button style={{
            background: accent,
            color: '#000',
            border: 'none',
            borderRadius: 6,
            padding: '8px 18px',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'default',
            marginTop: 4,
          }}>
            詳しく見る →
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * OptionCardPreview — 商品カスタマイズUIでのオプション表示イメージ
 * option_name / option_type / price / description を視覚化
 */
function OptionCardPreview({
  option_name,
  option_type,
  price,
  description,
  is_active,
}: {
  option_name?: string;
  option_type?: string;
  price?: string;
  description?: string;
  is_active?: string;
}) {
  const active = is_active !== 'false';
  const priceNum = Number(price || 0);
  const typeLabel = option_type === 'upgrade' ? 'アップグレード' :
    option_type === 'accessory' ? 'アクセサリー' :
    option_type === 'service' ? 'サービス' :
    option_type === 'warranty' ? '保証延長' : option_type || '';
  const typeColor = option_type === 'upgrade' ? '#06f' :
    option_type === 'accessory' ? '#22c55e' :
    option_type === 'service' ? '#f59e0b' :
    option_type === 'warranty' ? '#a855f7' : '#888';

  return (
    <div style={{ background: T.bg, color: T.tx, fontFamily: 'inherit', padding: 20 }}>
      <div style={{
        fontSize: 11,
        color: T.t4,
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: `1px solid ${al(T.tx, 0.1)}`,
      }}>
        商品カスタマイズ画面でのイメージ
      </div>

      {/* Option card */}
      <label style={{
        display: 'block',
        background: al(T.tx, 0.03),
        border: `2px solid ${active ? al(T.tx, 0.15) : al(T.tx, 0.08)}`,
        borderRadius: 10,
        padding: 14,
        cursor: 'pointer',
        transition: 'all .15s',
        opacity: active ? 1 : 0.5,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <input
            type="checkbox"
            disabled
            style={{
              marginTop: 3,
              width: 18,
              height: 18,
              accentColor: typeColor,
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              {typeLabel && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: al(typeColor, 0.15),
                  color: typeColor,
                  border: `1px solid ${al(typeColor, 0.3)}`,
                }}>
                  {typeLabel}
                </span>
              )}
              {!active && (
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: al(T.tx, 0.1),
                  color: T.t4,
                }}>
                  非表示
                </span>
              )}
            </div>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: T.tx,
              marginBottom: description ? 6 : 0,
              lineHeight: 1.3,
            }}>
              {option_name || '(オプション名未入力)'}
            </div>
            {description && (
              <p style={{
                fontSize: 11,
                lineHeight: 1.5,
                color: al(T.tx, 0.7),
                margin: 0,
                whiteSpace: 'pre-wrap',
              }}>
                {description}
              </p>
            )}
          </div>
          <div style={{
            fontSize: 15,
            fontWeight: 900,
            color: priceNum > 0 ? T.tx : T.t4,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {priceNum > 0 ? `+¥${priceNum.toLocaleString('ja-JP')}` : '無料'}
          </div>
        </div>
      </label>

      {/* Hint */}
      <div style={{
        marginTop: 12,
        padding: 10,
        background: al(T.tx, 0.02),
        border: `1px dashed ${al(T.tx, 0.1)}`,
        borderRadius: 6,
        fontSize: 10,
        color: T.t4,
        lineHeight: 1.5,
      }}>
        商品ページ「カスタマイズ」セクションに表示されます。
        <br />チェックを入れると合計金額に加算されます。
      </div>
    </div>
  );
}

// ══════════════════════════════════
// ① CampaignList — キャンペーン CRUD
// ══════════════════════════════════
function CampaignList({ onToast }: { onToast: (m: string, t: 'ok' | 'err') => void }) {
  const [items, setItems] = useState<MetaobjectNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');
  // patch 0048: window.confirm 置換用
  const {confirm: confirmDialog, dialogProps, ConfirmDialog: Dialog} = useConfirmDialog();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await cmsGet('astromeda_campaign');
      setItems(data.sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0)));
    } catch {
      onToast('キャンペーン取得失敗', 'err');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const startEdit = (item: MetaobjectNode) => {
    setEditId(item.id);
    setForm({
      name: item.name || '',
      campaign_type: item.campaign_type || 'sale',
      status: item.status || 'planned',
      start_date: item.start_date || '',
      end_date: item.end_date || '',
      discount_rate: item.discount_rate || '0',
      budget: item.budget || '0',
      target_audience: item.target_audience || '',
      description: item.description || '',
      banner_text: item.banner_text || '',
      accent_color: item.accent_color || '#00F0FF',
      is_active: item.is_active || 'true',
      display_order: item.display_order || '0',
    });
  };

  const startCreate = () => {
    setEditId('__new__');
    setForm({
      name: '',
      campaign_type: 'sale',
      status: 'planned',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: '',
      discount_rate: '0',
      budget: '0',
      target_audience: '',
      description: '',
      banner_text: '',
      accent_color: '#00F0FF',
      is_active: 'true',
      display_order: String(items.length),
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fields = Object.entries(form).map(([key, value]) => ({ key, value }));
      if (editId === '__new__') {
        const handle = `campaign-${form.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || Date.now()}`;
        const r = await cmsPost({ type: 'astromeda_campaign', action: 'create', handle, fields });
        if (!r.success) throw new Error(r.error);
        onToast('キャンペーン作成完了', 'ok');
      } else {
        const r = await cmsPost({ type: 'astromeda_campaign', action: 'update', id: editId, fields });
        if (!r.success) throw new Error(r.error);
        onToast('キャンペーン保存完了', 'ok');
      }
      setEditId(null);
      await fetchData();
    } catch (e) {
      onToast(e instanceof Error ? e.message : '保存失敗', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: 'このキャンペーンを削除しますか？',
      message: 'この操作は取り消せません。',
      confirmLabel: '削除する',
      destructive: true,
      contextPath: ['コマース', '🧭 ナビ・マーケ・分析', '📣 マーケティング', 'キャンペーン'],
    });
    if (!ok) return;
    const r = await cmsPost({ type: 'astromeda_campaign', action: 'delete', id });
    if (r.success) { onToast('キャンペーン削除完了', 'ok'); await fetchData(); }
    else onToast(r.error || '削除失敗', 'err');
  };

  if (loading) return <div style={{ color: color.textMuted, padding: 20 }}>読み込み中...</div>;

  const statusColor = (s: string) =>
    s === 'active' ? color.green : s === 'planned' ? color.cyan : color.textMuted;
  const statusLabel = (s: string) =>
    s === 'active' ? '実施中' : s === 'planned' ? '予定' : '完了';

  const activeCount = items.filter(i => i.status === 'active').length;
  const plannedCount = items.filter(i => i.status === 'planned').length;
  const completedCount = items.filter(i => i.status === 'completed').length;

  const isModalOpen = !!editId;
  const modalTitle = editId === '__new__' ? '新規キャンペーン' : 'キャンペーン編集';

  const previewPane = (
    <PreviewFrame device={previewDevice} onDeviceChange={setPreviewDevice}>
      <CampaignBannerPreview
        name={form.name}
        banner_text={form.banner_text}
        accent_color={form.accent_color}
        discount_rate={form.discount_rate}
        status={form.status}
        campaign_type={form.campaign_type}
        start_date={form.start_date}
        end_date={form.end_date}
        description={form.description}
        is_active={form.is_active}
      />
    </PreviewFrame>
  );

  const editForm = (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>キャンペーン名</label>
              <input style={inputStyle} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: GWスペシャルセール" />
            </div>
            <div>
              <label style={labelStyle}>タイプ</label>
              <select style={inputStyle} value={form.campaign_type || 'sale'} onChange={(e) => setForm({ ...form, campaign_type: e.target.value })}>
                <option value="sale">セール</option>
                <option value="promotion">プロモーション</option>
                <option value="collab">IPコラボ</option>
                <option value="seasonal">季節キャンペーン</option>
                <option value="clearance">在庫一掃</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>ステータス</label>
              <select style={inputStyle} value={form.status || 'planned'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="planned">予定</option>
                <option value="active">実施中</option>
                <option value="completed">完了</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>開始日</label>
              <input style={inputStyle} type="date" value={form.start_date || ''} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>終了日</label>
              <input style={inputStyle} type="date" value={form.end_date || ''} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>割引率（%）</label>
              <input style={inputStyle} type="number" value={form.discount_rate || '0'} onChange={(e) => setForm({ ...form, discount_rate: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>予算（円）</label>
              <input style={inputStyle} type="number" value={form.budget || '0'} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>ターゲット</label>
              <input style={inputStyle} value={form.target_audience || ''} onChange={(e) => setForm({ ...form, target_audience: e.target.value })} placeholder="例: 新規ユーザー / リピーター" />
            </div>
            <div>
              <label style={labelStyle}>アクセントカラー</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="color" value={form.accent_color || '#00F0FF'} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} style={{ width: 40, height: 32, border: 'none', cursor: 'pointer', borderRadius: 4 }} />
                <input style={{ ...inputStyle, flex: 1 }} value={form.accent_color || ''} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>表示順</label>
              <input style={inputStyle} type="number" value={form.display_order || '0'} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>バナーテキスト</label>
            <input style={inputStyle} value={form.banner_text || ''} onChange={(e) => setForm({ ...form, banner_text: e.target.value })} placeholder="サイトバナーに表示するテキスト" />
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>説明</label>
            <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={3} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="キャンペーンの詳細説明" />
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_active === 'true'} onChange={(e) => setForm({ ...form, is_active: String(e.target.checked) })} style={{ width: 16, height: 16, accentColor: color.cyan }} />
              <span style={{ fontSize: font.sm, color: color.text }}>有効</span>
            </label>
          </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={handleSave} disabled={saving} style={btnPrimary}>
          {saving ? '保存中...' : editId === '__new__' ? '作成' : '保存'}
        </button>
        <button onClick={() => setEditId(null)} style={btnOutline}>キャンセル</button>
      </div>
    </div>
  );

  const closeModal = () => setEditId(null);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <CompactKPI label="実施中" value={String(activeCount)} accent={color.green} />
          <CompactKPI label="予定" value={String(plannedCount)} accent={color.cyan} />
          <CompactKPI label="完了" value={String(completedCount)} accent={color.textMuted} />
        </div>
        <button onClick={startCreate} style={btnOutline}>+ 新規キャンペーン</button>
      </div>

      {isModalOpen && (
        <Modal title={modalTitle} onClose={closeModal} preview={previewPane}>
          {editForm}
        </Modal>
      )}

      {items.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📣</div>
          <div style={{ color: color.textMuted, fontSize: 13 }}>キャンペーンはまだありません</div>
          <div style={{ color: color.textDim, fontSize: 11, marginTop: 8 }}>「新規キャンペーン」から作成してください</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item) => {
            const isActive = item.status === 'active';
            const isCompleted = item.status === 'completed';
            return (
              <div key={item.id} style={{
                ...cardStyle,
                marginBottom: 0,
                padding: '14px 16px',
                borderColor: isActive ? color.green : color.border,
                opacity: isCompleted ? 0.6 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: color.text }}>
                        {item.name || item.handle}
                      </span>
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700,
                        background: `${statusColor(item.status || 'planned')}20`,
                        color: statusColor(item.status || 'planned'),
                      }}>
                        {statusLabel(item.status || 'planned')}
                      </span>
                      {item.campaign_type && (
                        <span style={{
                          fontSize: 9, padding: '2px 6px', borderRadius: 4,
                          background: 'rgba(255,255,255,.05)', color: color.textMuted,
                        }}>
                          {item.campaign_type}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: color.textMuted, marginTop: 4 }}>
                      {item.start_date && item.end_date && `${item.start_date} 〜 ${item.end_date}`}
                      {item.discount_rate && Number(item.discount_rate) > 0 && ` · ${item.discount_rate}% OFF`}
                      {item.budget && Number(item.budget) > 0 && ` · 予算 ¥${Number(item.budget).toLocaleString()}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => startEdit(item)} style={btnOutline}>編集</button>
                    <button onClick={() => handleDelete(item.id)} style={btnDanger}>削除</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Dialog {...dialogProps} />
    </div>
  );
}

// ══════════════════════════════════
// ② CustomOptionList — カスタムオプション CRUD
// ══════════════════════════════════
function CustomOptionList({ onToast }: { onToast: (m: string, t: 'ok' | 'err') => void }) {
  const [items, setItems] = useState<MetaobjectNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('mobile');
  // patch 0048: window.confirm 置換用
  const {confirm: confirmDialog, dialogProps, ConfirmDialog: Dialog} = useConfirmDialog();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await cmsGet('astromeda_custom_option');
      setItems(data.sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0)));
    } catch {
      onToast('カスタムオプション取得失敗', 'err');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const startEdit = (item: MetaobjectNode) => {
    setEditId(item.id);
    setForm({
      option_name: item.option_name || '',
      option_type: item.option_type || 'upgrade',
      price: item.price || '0',
      description: item.description || '',
      is_active: item.is_active || 'true',
      display_order: item.display_order || '0',
      applicable_products: item.applicable_products || '',
    });
  };

  const startCreate = () => {
    setEditId('__new__');
    setForm({
      option_name: '', option_type: 'upgrade', price: '0',
      description: '', is_active: 'true', display_order: String(items.length),
      applicable_products: '',
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fields = Object.entries(form).map(([key, value]) => ({ key, value }));
      if (editId === '__new__') {
        const handle = `option-${form.option_name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || Date.now()}`;
        const r = await cmsPost({ type: 'astromeda_custom_option', action: 'create', handle, fields });
        if (!r.success) throw new Error(r.error);
        onToast('オプション作成完了', 'ok');
      } else {
        const r = await cmsPost({ type: 'astromeda_custom_option', action: 'update', id: editId, fields });
        if (!r.success) throw new Error(r.error);
        onToast('オプション保存完了', 'ok');
      }
      setEditId(null);
      await fetchData();
    } catch (e) {
      onToast(e instanceof Error ? e.message : '保存失敗', 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: 'このオプションを削除しますか？',
      message: 'この操作は取り消せません。',
      confirmLabel: '削除する',
      destructive: true,
      contextPath: ['コマース', '🧭 ナビ・マーケ・分析', '📣 マーケティング', 'カスタムオプション'],
    });
    if (!ok) return;
    const r = await cmsPost({ type: 'astromeda_custom_option', action: 'delete', id });
    if (r.success) { onToast('オプション削除完了', 'ok'); await fetchData(); }
    else onToast(r.error || '削除失敗', 'err');
  };

  if (loading) return <div style={{ color: color.textMuted, padding: 20 }}>読み込み中...</div>;

  const isModalOpen = !!editId;
  const modalTitle = editId === '__new__' ? '新規オプション' : 'オプション編集';
  const closeModal = () => setEditId(null);

  const previewPane = (
    <PreviewFrame device={previewDevice} onDeviceChange={setPreviewDevice}>
      <OptionCardPreview
        option_name={form.option_name}
        option_type={form.option_type}
        price={form.price}
        description={form.description}
        is_active={form.is_active}
      />
    </PreviewFrame>
  );

  const editForm = (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>オプション名</label>
          <input style={inputStyle} value={form.option_name || ''} onChange={(e) => setForm({ ...form, option_name: e.target.value })} placeholder="例: メモリ32GB増設" />
        </div>
        <div>
          <label style={labelStyle}>タイプ</label>
          <select style={inputStyle} value={form.option_type || 'upgrade'} onChange={(e) => setForm({ ...form, option_type: e.target.value })}>
            <option value="upgrade">アップグレード</option>
            <option value="accessory">アクセサリー</option>
            <option value="service">サービス</option>
            <option value="warranty">保証延長</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>価格（円）</label>
          <input style={inputStyle} type="number" value={form.price || '0'} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>表示順</label>
          <input style={inputStyle} type="number" value={form.display_order || '0'} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>対象商品（カンマ区切り）</label>
          <input style={inputStyle} value={form.applicable_products || ''} onChange={(e) => setForm({ ...form, applicable_products: e.target.value })} placeholder="空=全商品 / 商品ハンドルをカンマ区切り" />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>説明</label>
        <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={3} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="オプションの詳細説明" />
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.is_active === 'true'} onChange={(e) => setForm({ ...form, is_active: String(e.target.checked) })} style={{ width: 16, height: 16, accentColor: color.cyan }} />
          <span style={{ fontSize: font.sm, color: color.text }}>有効</span>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={handleSave} disabled={saving} style={btnPrimary}>
          {saving ? '保存中...' : editId === '__new__' ? '作成' : '保存'}
        </button>
        <button onClick={closeModal} style={btnOutline}>キャンセル</button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <CompactKPI label="オプション数" value={String(items.length)} />
        <button onClick={startCreate} style={btnOutline}>+ 新規オプション</button>
      </div>

      {isModalOpen && (
        <Modal title={modalTitle} onClose={closeModal} preview={previewPane}>
          {editForm}
        </Modal>
      )}

      {items.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🛠️</div>
          <div style={{ color: color.textMuted, fontSize: 13 }}>カスタムオプションはまだありません</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item) => (
            <div key={item.id} style={{
              ...cardStyle, marginBottom: 0, padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
              opacity: item.is_active === 'true' ? 1 : 0.5,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: color.text }}>
                    {item.option_name || item.handle}
                  </span>
                  <span style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 4,
                    background: 'rgba(255,255,255,.05)', color: color.textMuted,
                  }}>
                    {item.option_type || 'upgrade'}
                  </span>
                </div>
                {item.description && (
                  <div style={{ fontSize: 11, color: color.textMuted, marginTop: 2 }}>
                    {item.description}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: color.cyan, whiteSpace: 'nowrap' }}>
                +¥{Number(item.price || 0).toLocaleString('ja-JP')}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => startEdit(item)} style={btnOutline}>編集</button>
                <button onClick={() => handleDelete(item.id)} style={btnDanger}>削除</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog {...dialogProps} />
    </div>
  );
}

// ══════════════════════════════════
// Main Component
// ══════════════════════════════════
export default function AdminMarketing() {
  const [tab, setTab] = useState<SubTab>('campaigns');
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  const showToast = useCallback((msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: color.text, margin: 0 }}>
          マーケティング
        </h2>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button onClick={() => setTab('campaigns')} style={tabStyle(tab === 'campaigns')}>
          キャンペーン
        </button>
        <button onClick={() => setTab('options')} style={tabStyle(tab === 'options')}>
          カスタムオプション
        </button>
      </div>

      {tab === 'campaigns' && <CampaignList onToast={showToast} />}
      {tab === 'options' && <CustomOptionList onToast={showToast} />}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}
