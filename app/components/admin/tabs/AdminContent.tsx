/**
 * AdminContent Tab — Content Management
 */

import { useState, useEffect } from 'react';
import { color } from '~/lib/design-tokens';
import { CompactKPI } from '~/components/admin/CompactKPI';

// Type definitions for API responses
interface ContentItem {
  title?: string;
  type?: string;
  status?: 'draft' | 'review' | 'published';
}

interface BannerItem {
  collectionHandle?: string;
  ipName?: string;
  thumbnailUrl?: string;
  status?: 'active' | 'inactive';
}

interface BannerStats {
  active: number;
  missing: number;
}

interface KeywordItem {
  keyword?: string;
  volume?: number;
  difficulty?: number;
  cpc?: string;
  intent?: string;
}

interface SEOAudit {
  score?: number;
  note?: string;
}

interface ContentResponse {
  contents: ContentItem[];
}

interface BannerResponse {
  banners: BannerItem[];
  stats: BannerStats;
}

interface SEOResponse {
  keywords: KeywordItem[];
  audit: SEOAudit | null;
}

export default function AdminContent() {
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [keywords, setKeywords] = useState<KeywordItem[]>([]);
  const [seoAudit, setSeoAudit] = useState<SEOAudit | null>(null);
  const [bannerStats, setBannerStats] = useState<BannerStats>({active: 0, missing: 0});
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<'articles' | 'banners' | 'seo'>('articles');

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/content').then(r => r.json() as Promise<ContentResponse>).catch(() => ({contents: []})),
      fetch('/api/admin/banners').then(r => r.json() as Promise<BannerResponse>).catch(() => ({banners: [], stats: {active: 0, missing: 0}})),
      fetch('/api/admin/seo').then(r => r.json() as Promise<SEOResponse>).catch(() => ({keywords: [], audit: null})),
    ]).then(([contentData, bannerData, seoData]) => {
      setContents((contentData as unknown as ContentResponse).contents || []);
      setBanners((bannerData as unknown as BannerResponse).banners || []);
      setBannerStats((bannerData as unknown as BannerResponse).stats || {active: 0, missing: 0});
      setKeywords((seoData as unknown as SEOResponse).keywords || []);
      setSeoAudit((seoData as unknown as SEOResponse).audit || null);
      setLoading(false);
    });
  }, []);

  const subTabs = [
    {key: 'articles' as const, label: '📝 記事・コンテンツ', count: contents.length},
    {key: 'banners' as const, label: '🖼️ IPバナー', count: banners.length},
    {key: 'seo' as const, label: '🔍 SEO', count: keywords.length},
  ];

  if (loading) return <div style={{color: color.textMuted, textAlign: 'center', padding: 60}}>読み込み中...</div>;

  return (
    <div>
      <div style={{display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap'}}>
        {subTabs.map(st => (
          <button key={st.key} onClick={() => setSubTab(st.key)} style={{
            padding: '8px 16px', borderRadius: 8, border: `1px solid ${subTab === st.key ? color.cyan : color.border}`,
            background: subTab === st.key ? 'rgba(0,240,255,.08)' : color.bg1,
            color: subTab === st.key ? color.cyan : color.textMuted, fontSize: 12, cursor: 'pointer', fontWeight: 700,
          }}>
            {st.label} ({st.count})
          </button>
        ))}
      </div>

      {subTab === 'articles' && (
        <div>
          {contents.length === 0 ? (
            <div style={{background: color.bg1, borderRadius: 12, border: `1px solid ${color.border}`, padding: 40, textAlign: 'center'}}>
              <div style={{fontSize: 32, marginBottom: 12}}>📝</div>
              <div style={{color: color.textMuted, fontSize: 13}}>コンテンツはまだありません</div>
              <div style={{color: color.textDim, fontSize: 11, marginTop: 8}}>ContentWriter Agentが記事を生成すると、ここに表示されます</div>
            </div>
          ) : (
            <div style={{display: 'grid', gap: 12}}>
              {contents.map((c: Record<string, unknown>, i: number) => (
                <div key={i} style={{background: color.bg1, borderRadius: 12, border: `1px solid ${color.border}`, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <div>
                    <div style={{fontSize: 13, fontWeight: 700, color: color.text}}>{c.title || '無題'}</div>
                    <div style={{fontSize: 11, color: color.textMuted, marginTop: 4}}>{c.type || 'article'} · {c.status || 'draft'}</div>
                  </div>
                  <span style={{
                    fontSize: 10, padding: '4px 10px', borderRadius: 20, fontWeight: 700,
                    background: c.status === 'published' ? 'rgba(0,230,118,.1)' : c.status === 'review' ? 'rgba(255,179,0,.1)' : 'rgba(255,255,255,.05)',
                    color: c.status === 'published' ? color.green : c.status === 'review' ? color.yellow : color.textMuted,
                  }}>
                    {c.status === 'published' ? '公開中' : c.status === 'review' ? 'レビュー待ち' : '下書き'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'banners' && (
        <div>
          <div style={{display: 'flex', gap: 12, marginBottom: 16}}>
            <CompactKPI label="ACTIVE" value={String(bannerStats.active)} accent={color.green} />
            <CompactKPI label="MISSING" value={String(bannerStats.missing)} accent={bannerStats.missing > 0 ? color.yellow : color.green} />
            <CompactKPI label="TOTAL" value={String(banners.length)} accent={color.cyan} />
          </div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12}}>
            {banners.map((b: Record<string, unknown>) => (
              <div key={b.collectionHandle} style={{
                background: color.bg1, borderRadius: 12, border: `1px solid ${color.border}`, overflow: 'hidden',
              }}>
                {b.thumbnailUrl ? (
                  <img src={b.thumbnailUrl} alt={b.ipName} style={{width: '100%', height: 120, objectFit: 'cover'}} />
                ) : (
                  <div style={{width: '100%', height: 120, background: 'linear-gradient(135deg, #1a1a3e, #0a0a1e)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                    <span style={{fontSize: 24}}>🖼️</span>
                  </div>
                )}
                <div style={{padding: '10px 12px'}}>
                  <div style={{fontSize: 11, fontWeight: 700, color: color.text, marginBottom: 4}}>{b.ipName}</div>
                  <span style={{
                    fontSize: 9, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                    background: b.status === 'active' ? 'rgba(0,230,118,.1)' : 'rgba(255,179,0,.1)',
                    color: b.status === 'active' ? color.green : color.yellow,
                  }}>
                    {b.status === 'active' ? '✓ 画像あり' : '⚠ 未設定'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'seo' && (
        <div>
          {seoAudit && (
            <div style={{background: color.bg1, borderRadius: 12, border: `1px solid ${color.border}`, padding: 16, marginBottom: 16}}>
              <div style={{fontSize: 11, fontWeight: 700, color: color.textDim, marginBottom: 8}}>SEO監査スコア</div>
              <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                <div style={{fontSize: 28, fontWeight: 900, color: seoAudit.score >= 80 ? color.green : seoAudit.score >= 50 ? color.yellow : color.red}}>
                  {seoAudit.score || '—'}
                </div>
                <div style={{fontSize: 11, color: color.textMuted}}>{seoAudit.note || ''}</div>
              </div>
            </div>
          )}
          <div style={{fontSize: 12, fontWeight: 700, color: color.text, marginBottom: 12}}>キーワードランキング Top {keywords.length}</div>
          <div style={{background: color.bg1, borderRadius: 12, border: `1px solid ${color.border}`, overflow: 'hidden'}}>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 80px 70px 70px 80px', padding: '10px 14px', borderBottom: `1px solid ${color.border}`, fontSize: 10, fontWeight: 700, color: color.textDim}}>
              <div>キーワード</div><div style={{textAlign:'right'}}>検索Vol</div><div style={{textAlign:'right'}}>難易度</div><div style={{textAlign:'right'}}>CPC</div><div style={{textAlign:'right'}}>意図</div>
            </div>
            {keywords.slice(0, 10).map((kw: Record<string, unknown>, i: number) => (
              <div key={i} style={{display: 'grid', gridTemplateColumns: '1fr 80px 70px 70px 80px', padding: '8px 14px', borderBottom: `1px solid ${color.border}`, fontSize: 11, color: color.text}}>
                <div style={{fontWeight: 600}}>{kw.keyword}</div>
                <div style={{textAlign:'right', color: color.cyan}}>{(kw.volume || 0).toLocaleString()}</div>
                <div style={{textAlign:'right', color: kw.difficulty > 60 ? color.red : kw.difficulty > 40 ? color.yellow : color.green}}>{kw.difficulty}</div>
                <div style={{textAlign:'right', color: color.textMuted}}>¥{kw.cpc}</div>
                <div style={{textAlign:'right'}}>
                  <span style={{fontSize: 9, padding: '2px 6px', borderRadius: 8, background: 'rgba(255,255,255,.05)', color: color.textMuted}}>{kw.intent}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
