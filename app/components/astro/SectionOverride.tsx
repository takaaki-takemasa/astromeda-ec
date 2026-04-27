/**
 * SectionOverride — storefront 側 wrapper コンポーネント (patch 0167)
 *
 * 各セクションコンポーネント (HeroSlider/CollabGrid/PCShowcase 等) を本コンポーネントで包むと、
 * astromeda_section_override Metaobject の設定に応じて以下のいずれかで描画する:
 *
 *   mode='default'      → children をそのまま (元のデザイン)
 *   mode='custom_css'   → children + <style>{customCss}</style> を後追加 (CSS 上書き)
 *   mode='custom_html'  → sanitize 済の customHtml を dangerouslySetInnerHTML で描画 (HTML 完全置換)
 *                          + customCss も同時注入
 *
 * セキュリティ:
 *   - customHtml は ~/lib/sanitize-html.ts で再サニタイズ (defense in depth)
 *   - customCss は <style> 内に挿入 — JS 実行不可、URL 注入も不可 (CSS 仕様)
 *   - script/iframe/onclick/javascript: は cms-field-validator + sanitize-html の二重防御で除去
 *
 * フェイルセーフ:
 *   - useRouteLoaderData('root') で取れない (子ルート単独 render 時等) → children だけ描画
 *   - active=false の override → children だけ描画
 *   - sectionKey に該当する override が無い → children だけ描画
 */
import {useMemo} from 'react';
import {useRouteLoaderData} from 'react-router';
import {sanitizeHtml} from '~/lib/sanitize-html';
import type {SectionKey, OverrideMode} from '~/lib/section-override';

interface SectionOverrideProps {
  /** どのセクションの上書きを適用するか */
  sectionKey: SectionKey;
  /** 元のデザイン (mode=default の場合に表示) */
  children: React.ReactNode;
  /** 上書きを <div data-section-override="..."> でラップする時のクラス (任意) */
  wrapperClassName?: string;
}

interface RootDataWithOverrides {
  metaSectionOverrides?: Array<{
    sectionKey: SectionKey;
    mode: OverrideMode;
    customHtml: string;
    customCss: string;
    isActive: boolean;
  }> | null;
}

export function SectionOverride({sectionKey, children, wrapperClassName}: SectionOverrideProps) {
  // patch 0167: root loader が配信する全 active overrides を取得
  const rootData = useRouteLoaderData('root') as RootDataWithOverrides | undefined;
  const overrides = rootData?.metaSectionOverrides || [];

  // この sectionKey の active override を 1 つ採用 (複数あれば最初の 1 件)
  const override = useMemo(
    () => overrides.find((o) => o.sectionKey === sectionKey && o.isActive),
    [overrides, sectionKey],
  );

  // React Hooks Rules: 全 useMemo を early-return より前で呼ぶこと
  // override が無い時はサニタイズ不要だが、hook 呼び出しを skip すると hooks count がズレるので
  // 空文字列の場合は no-op (sanitize-html('') === '')
  const safeHtml = useMemo(
    () => sanitizeHtml(override?.customHtml || ''),
    [override?.customHtml],
  );
  const scopedCss = useMemo(
    () => (override?.customCss ? scopeCssToSection(override.customCss, sectionKey) : ''),
    [override?.customCss, sectionKey],
  );

  // mode=default または override 不在 → children だけ
  if (!override || override.mode === 'default') {
    return <>{children}</>;
  }

  // mode=custom_css → children + <style> 注入
  if (override.mode === 'custom_css') {
    return (
      <div data-section-override={sectionKey} data-override-mode="css" className={wrapperClassName}>
        {children}
        {scopedCss && (
          <style
            data-section-override-css={sectionKey}
            dangerouslySetInnerHTML={{__html: scopedCss}}
          />
        )}
      </div>
    );
  }

  // mode=custom_html → sanitize 済 HTML + CSS 注入 (children は捨てる)
  return (
    <div data-section-override={sectionKey} data-override-mode="html" className={wrapperClassName}>
      <div dangerouslySetInnerHTML={{__html: safeHtml}} />
      {scopedCss && (
        <style
          data-section-override-css={sectionKey}
          dangerouslySetInnerHTML={{__html: scopedCss}}
        />
      )}
    </div>
  );
}

/**
 * カスタム CSS を当該セクションのみに limit する scoping。
 * `[data-section-override="home_hero"] .my-class { ... }` のような prefix を付与。
 *
 * 注: 本格的な CSS パーサは使わず、簡易な heuristic でセレクタの先頭にだけ prefix を付ける。
 * @media や @keyframes はそのまま (中身のセレクタには prefix しない — CEO が知らずに書いた CSS が
 * 全画面に効くと事故になるため、あえて scope-leak を許容する選択)。
 *
 * よりカチッとした scoping が必要になったら、stylis や postcss-prefix-selector を導入する。
 */
function scopeCssToSection(css: string, sectionKey: string): string {
  // 簡易実装: トップレベルのセレクタブロックに `[data-section-override="..."]` prefix を付与
  // ".my-class { ... }" → '[data-section-override="home_hero"] .my-class { ... }'
  // @media / @keyframes / @supports はスキップ (中身は触らない)
  const scopePrefix = `[data-section-override="${sectionKey}"]`;
  let depth = 0;
  let buf = '';
  let out = '';
  let inAtRule = false;
  let atRuleDepth = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      if (depth === 0) {
        // セレクタ buf を確定: @media 等は触らない
        const trimmed = buf.trim();
        if (trimmed.startsWith('@')) {
          inAtRule = true;
          atRuleDepth = 1;
          out += buf + ch;
          buf = '';
          depth++;
          continue;
        }
        // 通常のセレクタ: , 区切りで個別に prefix
        const prefixed = trimmed
          .split(',')
          .map((s) => `${scopePrefix} ${s.trim()}`)
          .join(', ');
        out += prefixed + ch;
        buf = '';
      } else {
        // ネストした { (at-rule 内) はそのまま
        out += buf + ch;
        buf = '';
        if (inAtRule) atRuleDepth++;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (inAtRule) {
        atRuleDepth--;
        if (atRuleDepth === 0) inAtRule = false;
      }
      out += buf + ch;
      buf = '';
    } else {
      buf += ch;
    }
  }
  return out + buf;
}
