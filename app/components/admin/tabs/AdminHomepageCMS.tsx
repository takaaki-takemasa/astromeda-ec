/**
 * AdminHomepageCMS Tab — ホームページCMS管理
 *
 * IPコラボレーション・ヒーローバナーをメタオブジェクト経由で管理。
 * COLLABSのフォールバックデータがあるため、メタオブジェクト未登録でも動作する。
 */

import { useState, useEffect, useCallback } from 'react';
import { color } from '~/lib/design-tokens';
import { CompactKPI } from '~/components/admin/CompactKPI';

interface CollabEntry {
  id: string;
  handle: string;
  name: string;
  shopHandle: string;
  theme: string;
  featured: boolean;
  sortOrder: number;
}

interface BannerEntry {
  id: string;
  handle: string;
  title: string;
  collectionHandle: string | null;
  linkUrl: string | null;
  sortOrder: number;
  active: boolean;
}

interface HomepageStats {
  totalCollabs: number;
  featuredCollabs: number;
  totalBanners: number;
  activeBanners: number;
}

export default function AdminHomepageCMS() {
  const [collabs, setCollabs] = useState<CollabEntry[]>([]);
  const [banners, setBanners] = useState<BannerEntry[]>([]);
  const [stats, setStats] = useState<HomepageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initStatus, setInitStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'collabs' | 'banners'>('collabs');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/homepage');
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      if (json.success) {
        setCollabs(json.collabs);
        setBanners(json.banners);
        setStats(json.stats);
        setError(null);
      } else {
        setError(json.error || '取得に失敗');
      }
    } catch {
      setError('ホームページデータの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleInit = async () => {
    setInitStatus('定義を作成中...');
    try {
      const res = await fetch('/api/admin/homepage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'init_definitions' }),
      });
      const json = await res.json();
      setInitStatus(json.success ? 'メタオブジェクト定義を作成しました' : `エラー: ${json.error}`);
      if (json.success) fetchData();
    } catch {
      setInitStatus('初期化に失敗しました');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: color.text, margin: 0 }}>
          ホームページCMS
        </h2>
        <button
          onClick={handleInit}
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

      {initStatus && (
        <div style={{
          background: initStatus.includes('エラー') ? '#3a1515' : '#153a1a',
          border: `1px solid ${initStatus.includes('エラー') ? '#6b2020' : '#206b2a'}`,
          borderRadius: 8, padding: '12px', marginBottom: 16, fontSize: 13,
          color: initStatus.includes('エラー') ? '#ff6b6b' : '#6bff7b',
        }}>
          {initStatus}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
          <CompactKPI label="IPコラボ" value={String(stats.totalCollabs)} />
          <CompactKPI label="フィーチャー" value={String(stats.featuredCollabs)} />
          <CompactKPI label="バナー" value={String(stats.totalBanners)} />
          <CompactKPI label="有効バナー" value={String(stats.activeBanners)} />
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${color.border}`, marginBottom: 24 }}>
        {(['collabs', 'banners'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: activeTab === tab ? 700 : 400,
              color: activeTab === tab ? color.cyan : color.textMuted,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? `2px solid ${color.cyan}` : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            {tab === 'collabs' ? 'IPコラボ' : 'ヒーローバナー'}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: color.textMuted, fontSize: 14 }}>読み込み中...</div>}

      {error && (
        <div style={{ color: '#ff6b6b', fontSize: 14, padding: '16px', background: '#3a1515', borderRadius: 8, marginBottom: 16 }}>
          {error}
          <div style={{ marginTop: 8, fontSize: 12, color: color.textMuted }}>
            メタオブジェクト定義が未作成の場合は「定義を初期化」ボタンを押してください。
            フォールバックデータ（astromeda-data.ts の COLLABS 26件）は自動適用されます。
          </div>
        </div>
      )}

      {/* IPコラボ一覧 */}
      {activeTab === 'collabs' && !loading && (
        <div>
          {collabs.length === 0 ? (
            <div style={{
              background: color.bg0, border: `1px solid ${color.border}`, borderRadius: 12,
              padding: '32px', textAlign: 'center', color: color.textMuted,
            }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>メタオブジェクトにIPコラボが未登録</div>
              <div style={{ fontSize: 12, color: color.cyan }}>
                フォールバック (astromeda-data.ts COLLABS 26件) が自動使用されます
              </div>
            </div>
          ) : (
            <div style={{ background: color.bg0, border: `1px solid ${color.border}`, borderRadius: 12, overflow: 'hidden' }}>
              {collabs.map((c) => (
                <div key={c.id} style={{
                  padding: '12px 16px',
                  borderBottom: `1px solid ${color.border}`,
                  display: 'grid',
                  gridTemplateColumns: '50px 1fr 200px 80px 60px',
                  gap: 12,
                  alignItems: 'center',
                }}>
                  <div style={{ fontSize: 13, color: color.textMuted }}>{c.sortOrder}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: color.text }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: color.textMuted }}>{c.handle}</div>
                  </div>
                  <div style={{ fontSize: 11, color: color.textMuted, fontFamily: 'monospace' }}>{c.shopHandle}</div>
                  <div style={{ fontSize: 11, color: c.featured ? color.cyan : color.textMuted }}>
                    {c.featured ? '★ Featured' : '—'}
                  </div>
                  <div style={{
                    fontSize: 10, padding: '2px 6px',
                    background: `${color.cyan}20`, color: color.cyan,
                    borderRadius: 4, textAlign: 'center',
                  }}>
                    {c.theme}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* バナー一覧 */}
      {activeTab === 'banners' && !loading && (
        <div>
          {banners.length === 0 ? (
            <div style={{
              background: color.bg0, border: `1px solid ${color.border}`, borderRadius: 12,
              padding: '32px', textAlign: 'center', color: color.textMuted,
            }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>メタオブジェクトにバナーが未登録</div>
              <div style={{ fontSize: 12, color: color.cyan }}>
                現在のバナーはコレクション画像から自動取得されています
              </div>
            </div>
          ) : (
            <div style={{ background: color.bg0, border: `1px solid ${color.border}`, borderRadius: 12, overflow: 'hidden' }}>
              {banners.map((b) => (
                <div key={b.id} style={{
                  padding: '12px 16px',
                  borderBottom: `1px solid ${color.border}`,
                  display: 'grid',
                  gridTemplateColumns: '50px 1fr 200px 80px',
                  gap: 12,
                  alignItems: 'center',
                }}>
                  <div style={{ fontSize: 13, color: color.textMuted }}>{b.sortOrder}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: color.text }}>{b.title}</div>
                    <div style={{ fontSize: 11, color: color.textMuted }}>{b.handle}</div>
                  </div>
                  <div style={{ fontSize: 11, color: color.textMuted, fontFamily: 'monospace' }}>
                    {b.collectionHandle || b.linkUrl || '—'}
                  </div>
                  <div style={{
                    fontSize: 11, fontWeight: 600,
                    color: b.active ? '#6bff7b' : '#ff6b6b',
                  }}>
                    {b.active ? '有効' : '無効'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
