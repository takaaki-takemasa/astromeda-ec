/**
 * AdminCustomization Tab — カスタマイズオプション管理
 *
 * メタオブジェクト経由でPC構成オプション（メモリ、SSD、電源等）を
 * CRUD管理する。STANDARD_OPTIONSをフォールバックとして維持。
 */

import { useState, useEffect, useCallback } from 'react';
import { color } from '~/lib/design-tokens';

interface OptionItem {
  value: string;
  label: string;
}

interface CustomizationEntry {
  id: string;
  handle: string;
  name: string;
  options: OptionItem[];
  dependsOnField: string | null;
  dependsOnValue: string | null;
  sortOrder: number;
}

export default function AdminCustomization() {
  const [entries, setEntries] = useState<CustomizationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [initStatus, setInitStatus] = useState<string | null>(null);

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
    } catch (e) {
      setError('カスタマイズデータの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleInitDefinition = async () => {
    setInitStatus('初期化中...');
    try {
      const res = await fetch('/api/admin/customization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'init_definition' }),
      });
      const json = await res.json();
      if (json.success) {
        setInitStatus('メタオブジェクト定義を作成しました');
        fetchData();
      } else {
        setInitStatus(`エラー: ${json.error}`);
      }
    } catch {
      setInitStatus('初期化に失敗しました');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: color.text, margin: 0 }}>
          カスタマイズオプション管理
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleInitDefinition}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              color: color.textMuted,
              background: 'transparent',
              border: `1px solid ${color.border}`,
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            定義を初期化
          </button>
        </div>
      </div>

      {initStatus && (
        <div style={{
          background: initStatus.includes('エラー') ? '#3a1515' : '#153a1a',
          border: `1px solid ${initStatus.includes('エラー') ? '#6b2020' : '#206b2a'}`,
          borderRadius: 8,
          padding: '12px',
          marginBottom: 16,
          fontSize: 13,
          color: initStatus.includes('エラー') ? '#ff6b6b' : '#6bff7b',
        }}>
          {initStatus}
        </div>
      )}

      {loading && <div style={{ color: color.textMuted, fontSize: 14 }}>読み込み中...</div>}

      {error && (
        <div style={{ color: '#ff6b6b', fontSize: 14, padding: '16px', background: '#3a1515', borderRadius: 8, marginBottom: 16 }}>
          {error}
          <div style={{ marginTop: 8, fontSize: 12, color: color.textMuted }}>
            メタオブジェクト定義が未作成の場合は「定義を初期化」ボタンを押してください。
          </div>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div style={{
          background: color.bg0,
          border: `1px solid ${color.border}`,
          borderRadius: 12,
          padding: '32px',
          textAlign: 'center',
          color: color.textMuted,
        }}>
          <div style={{ fontSize: 14, marginBottom: 16 }}>
            カスタマイズオプションが登録されていません
          </div>
          <div style={{ fontSize: 12 }}>
            「定義を初期化」後、Shopify管理画面のメタオブジェクトから登録するか、
            APIで一括登録してください。
          </div>
          <div style={{ marginTop: 16, fontSize: 12, color: color.cyan }}>
            現在はフォールバックの STANDARD_OPTIONS（17項目）が使用されます。
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <div style={{ background: color.bg0, border: `1px solid ${color.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '50px 1fr 80px 120px',
            gap: 12,
            padding: '12px 16px',
            fontSize: 10,
            fontWeight: 700,
            color: color.textMuted,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            borderBottom: `1px solid ${color.border}`,
          }}>
            <div>順序</div>
            <div>オプション名</div>
            <div>選択肢数</div>
            <div>依存</div>
          </div>

          {entries.map((entry) => (
            <div key={entry.id} style={{ borderBottom: `1px solid ${color.border}` }}>
              <button
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: '50px 1fr 80px 120px',
                  gap: 12,
                  padding: '12px 16px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'inherit',
                  font: 'inherit',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 13, color: color.textMuted }}>{entry.sortOrder}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: color.text }}>{entry.name}</div>
                <div style={{ fontSize: 13, color: color.cyan }}>{entry.options.length}</div>
                <div style={{ fontSize: 11, color: entry.dependsOnField ? color.cyan : color.textMuted }}>
                  {entry.dependsOnField ? `→ ${entry.dependsOnField}` : 'なし'}
                </div>
              </button>

              {expandedId === entry.id && (
                <div style={{ padding: '12px 16px 16px', background: color.bg1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: color.textMuted, marginBottom: 8 }}>
                    選択肢一覧:
                  </div>
                  {entry.options.map((opt, i) => (
                    <div key={i} style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      color: color.text,
                      background: color.bg0,
                      borderRadius: 6,
                      marginBottom: 4,
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}>
                      <span>{opt.label}</span>
                      <span style={{ color: color.textMuted, fontFamily: 'monospace', fontSize: 10 }}>{opt.value}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 8, fontSize: 10, color: color.textMuted }}>
                    ID: {entry.id} / Handle: {entry.handle}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
