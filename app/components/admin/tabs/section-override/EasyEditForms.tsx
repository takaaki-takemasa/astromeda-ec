/**
 * EasyEditForms — section-override の「かんたん編集」フォーム集 (patch 0189)
 *
 * CEO 指示「リンク先画面の設計はすべてハードコードではなく、非エンジニアが管理する方法と
 * エンジニアが HTML を直接触る方法の二種類で設計されているか」への対応。
 *
 * 設計:
 *   - HTML/CSS 直接編集 = エンジニア向け B (既存)
 *   - 各 section_key に対応する form (image URL + リンク先 + 表示テキスト) = 非エンジニア向け A (本ファイル)
 *
 * 利用側 (AdminSectionOverride.tsx):
 *   <SegmentedControl mode={editMode} setMode={setEditMode} />
 *   {editMode === 'easy' ? <EasyEditForm ...> : <HTMLTextarea>}
 *
 * 対応セクション (MVP):
 *   - gpc_hero: 3 slides × { image_url, link_url, label }
 *   - gpc_feature_cards: N cards × { image_url, link_url, title }
 *   - gpc_extra_1 (8色): 8 colors × { image_url, link_url, color_name }
 *   - gpc_parts_cards: 4 cards × { image_url, link_url, label }
 *   - gpc_contact: { tel, line_url }
 *   未対応 section: null を返し HTML 直編集 fallback
 */
import {useState, useEffect, useRef} from 'react';
import {color, space} from '~/lib/design-tokens';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: color.bg1,
  color: color.text,
  border: `1px solid ${color.border}`,
  borderRadius: 4,
  fontSize: 13,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: color.text,
  marginBottom: 4,
  marginTop: 10,
};

const cardStyle: React.CSSProperties = {
  padding: 12,
  border: `1px solid ${color.border}`,
  borderRadius: 8,
  marginBottom: 12,
  background: color.bg1,
};

// ──────────────────────────────────────────────
// gpc_hero: 3 スライドの auto-rotation スライダー
// ──────────────────────────────────────────────

interface HeroSlide {
  imageUrl: string;
  linkUrl: string;
  label: string;
}

function parseHeroSlides(html: string): HeroSlide[] {
  if (!html) return [{imageUrl: '', linkUrl: '', label: ''}, {imageUrl: '', linkUrl: '', label: ''}, {imageUrl: '', linkUrl: '', label: ''}];
  const slides: HeroSlide[] = [];
  const re = /<a[^>]*class="gpch-slide"[^>]*href="([^"]+)"[^>]*aria-label="([^"]*)"[^>]*><img[^>]*src="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    slides.push({linkUrl: m[1], label: m[2], imageUrl: m[3]});
  }
  while (slides.length < 3) slides.push({imageUrl: '', linkUrl: '', label: ''});
  return slides.slice(0, 3);
}

function buildHeroHtml(slides: HeroSlide[]): string {
  const safe = slides.map(s => ({
    imageUrl: (s.imageUrl || '').replace(/"/g, '&quot;'),
    linkUrl: (s.linkUrl || '#').replace(/"/g, '&quot;'),
    label: (s.label || 'バナー').replace(/"/g, '&quot;'),
  }));
  return `<style>
  .gpch-wrap { position: relative; width: 100%; max-width: 1200px; margin: 24px auto 0; padding: 0 16px; }
  .gpch-stage { position: relative; width: 100%; aspect-ratio: 1200/371; overflow: hidden; border-radius: 12px; }
  .gpch-track { display: flex; width: 300%; height: 100%; animation: gpch-slide 18s infinite; }
  .gpch-slide { flex: 0 0 33.3333%; height: 100%; display: block; text-decoration: none; }
  .gpch-slide img { width: 100%; height: 100%; object-fit: cover; display: block; }
  @keyframes gpch-slide {
    0%, 28% { transform: translateX(0%); }
    33%, 61% { transform: translateX(-33.3333%); }
    66%, 94% { transform: translateX(-66.6666%); }
    100% { transform: translateX(0%); }
  }
  .gpch-dots { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; z-index: 2; }
  .gpch-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.5); animation: gpch-dot 18s infinite; }
  .gpch-dot:nth-child(1) { animation-delay: 0s; }
  .gpch-dot:nth-child(2) { animation-delay: -12s; }
  .gpch-dot:nth-child(3) { animation-delay: -6s; }
  @keyframes gpch-dot {
    0%, 28%, 100% { background: rgba(255,255,255,.95); width: 20px; }
    33%, 100% { background: rgba(255,255,255,.5); width: 8px; }
  }
</style>
<div class="gpch-wrap">
  <div class="gpch-stage">
    <div class="gpch-track">
${safe.map((s, i) => `      <a class="gpch-slide" href="${s.linkUrl}" aria-label="${s.label}"><img src="${s.imageUrl}" alt="${s.label}" loading="${i === 0 ? 'eager' : 'lazy'}" /></a>`).join('\n')}
    </div>
    <div class="gpch-dots">
      <span class="gpch-dot"></span>
      <span class="gpch-dot"></span>
      <span class="gpch-dot"></span>
    </div>
  </div>
</div>`;
}

function HeroEasyForm({customHtml, onChange}: {customHtml: string; onChange: (html: string) => void}) {
  // 初期値は customHtml から parse、以後は内部 state でフォーム入力を保持
  const [slides, setSlides] = useState<HeroSlide[]>(() => parseHeroSlides(customHtml));
  const initRef = useRef(true);
  // customHtml が外部から変わった時 (別 entry を選択) のみ再 parse
  useEffect(() => {
    if (initRef.current) { initRef.current = false; return; }
    setSlides(parseHeroSlides(customHtml));
  }, [customHtml]);

  const update = (i: number, field: keyof HeroSlide, value: string) => {
    const next = slides.slice();
    next[i] = {...next[i], [field]: value};
    setSlides(next);
    onChange(buildHeroHtml(next));
  };

  return (
    <div>
      <div style={{fontSize: 12, color: color.textSecondary, marginBottom: 12, padding: 10, background: 'rgba(0,180,150,.08)', borderRadius: 6, border: `1px solid rgba(0,180,150,.3)`}}>
        💡 3 枚のバナー画像が 6 秒ずつ自動で切り替わるスライダーです。各スライドの画像 URL とリンク先を指定してください。
      </div>
      {slides.map((s, i) => (
        <div key={i} style={cardStyle}>
          <div style={{fontSize: 13, fontWeight: 800, color: color.text, marginBottom: 8}}>
            🎬 スライド {i + 1}
          </div>
          <label style={labelStyle}>画像 URL <span style={{color: '#ff6464'}}>*必須</span></label>
          <input style={inputStyle} type="url" placeholder="https://cdn.shopify.com/..." value={s.imageUrl} onChange={(e) => update(i, 'imageUrl', e.target.value)} />
          {s.imageUrl && (
            <img src={s.imageUrl} alt="プレビュー" style={{maxWidth: 240, maxHeight: 80, marginTop: 8, borderRadius: 4, border: `1px solid ${color.border}`}} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
          <label style={labelStyle}>リンク先 (クリックで遷移)</label>
          <input style={inputStyle} type="text" placeholder="/collections/ranking または https://..." value={s.linkUrl} onChange={(e) => update(i, 'linkUrl', e.target.value)} />
          <label style={labelStyle}>説明 (アクセシビリティ用)</label>
          <input style={inputStyle} type="text" placeholder="売上ランキング" value={s.label} onChange={(e) => update(i, 'label', e.target.value)} />
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────
// 公開ヘルパー: section_key → 対応 form (なければ null = HTML 編集 fallback)
// ──────────────────────────────────────────────

export function getEasyForm(
  sectionKey: string,
  customHtml: string,
  onChange: (html: string) => void,
): React.ReactNode | null {
  switch (sectionKey) {
    case 'gpc_hero':
      return <HeroEasyForm customHtml={customHtml} onChange={onChange} />;
    // TODO patch 0190+: gpc_feature_cards / gpc_extra_1 / gpc_parts_cards / gpc_contact 等
    default:
      return null;
  }
}

export function hasEasyForm(sectionKey: string): boolean {
  return ['gpc_hero'].includes(sectionKey);
}
