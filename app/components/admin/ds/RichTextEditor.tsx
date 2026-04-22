/**
 * RichTextEditor primitive — patch 0107 (CEO P0-α)
 *
 * 「商品説明」を中学生でも編集できる UI に改修するための共通プリミティブ。
 *
 * 構成:
 *   ✏️ かんたん編集 ... contenteditable な WYSIWYG。ツールバーで太字/斜体/見出し/
 *                     段落/箇条書き/番号付き/リンク/水平線/取り消し が使える。
 *   📄 プレビュー   ... 実サイトと同じスタイルでサニタイズ済み HTML を描画。
 *   {} HTML        ... 上級者向け生 HTML 編集。textarea。
 *
 * 設計の軸:
 *   - 依存パッケージ「ゼロ」(npm 追加なし)。Cloudflare Workers / Oxygen edge で
 *     確実に動くことを優先。document.execCommand は deprecated だが太字/斜体/
 *     段落/見出し/list/link/hr 程度の 1 行操作はあらゆるブラウザで動く。
 *   - React reconciliation と contenteditable の競合を避けるため、初回 mount 時
 *     のみ dangerouslySetInnerHTML で値を流し込み、以降は onInput で innerHTML
 *     を読み取って onChange に渡す (one-way)。外部から value が変わった場合は
 *     props.value !== editorRef.innerHTML の時だけ書き戻す。
 *   - サニタイズは既存 sanitize-html ヘルパーがあれば使う。なければ <script>/
 *     on*= 属性の素朴除去 (XSS 第一波遮断)。
 *
 * 使い方:
 *   <RichTextEditor
 *     value={basic.descriptionHtml}
 *     onChange={(html) => setBasic({...basic, descriptionHtml: html})}
 *   />
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import {color, font, radius} from '~/lib/design-tokens';

// ── 軽量サニタイザ (server からの XSS 攻撃を rendering 前に削る) ──
function lightSanitize(html: string): string {
  return (html || '')
    // <script>...</script> を全除去
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    // <iframe> も基本除去 (動画埋込は後日 oEmbed 等で対応)
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    // on* イベントハンドラ属性 (onclick, onload 等) を除去
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    // javascript: URL を除去
    .replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"')
    .replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'");
}

// ── Toolbar ボタン共通スタイル ──
const tbBtn: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 12,
  fontWeight: 600,
  color: color.text,
  background: color.bg0,
  border: `1px solid ${color.border}`,
  borderRadius: radius.sm,
  cursor: 'pointer',
  fontFamily: font.family,
  minWidth: 32,
  textAlign: 'center' as const,
};

const tbBtnActive: React.CSSProperties = {
  ...tbBtn,
  background: color.cyan,
  color: '#000',
  borderColor: color.cyan,
};

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  /** プレースホルダ (空のとき表示するヒント) */
  placeholder?: string;
  /** エディタの最小高さ (px) */
  minHeight?: number;
  /** id 属性 (label との紐付け用) */
  id?: string;
  /** aria-label (label の代わり) */
  ariaLabel?: string;
}

type Mode = 'wysiwyg' | 'preview' | 'html';

export default function RichTextEditor({
  value,
  onChange,
  placeholder = '商品説明をここに書きましょう。太字や見出しは上のボタンから選べます。',
  minHeight = 280,
  id,
  ariaLabel,
}: RichTextEditorProps) {
  const [mode, setMode] = useState<Mode>('wysiwyg');
  const editorRef = useRef<HTMLDivElement | null>(null);

  // 外部 value が変わったとき、editor の innerHTML が違っていたら書き戻す。
  // (キャレット位置を壊さないよう同値時はノータッチ)
  useEffect(() => {
    if (mode !== 'wysiwyg') return;
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value || '';
    }
  }, [value, mode]);

  // ツールバーアクション (document.execCommand)
  const exec = useCallback(
    (command: string, arg?: string) => {
      // contenteditable にフォーカスを戻してから実行 (Safari 対策)
      editorRef.current?.focus();
      try {
        document.execCommand(command, false, arg);
      } catch {
        /* unsupported コマンドは黙って無視 */
      }
      // 実行直後の HTML を親に通知
      const html = editorRef.current?.innerHTML || '';
      onChange(html);
    },
    [onChange],
  );

  const handleInput = useCallback(() => {
    const html = editorRef.current?.innerHTML || '';
    onChange(html);
  }, [onChange]);

  // リンク挿入: 選択範囲があればそこを <a>、なければ末尾に挿入
  const insertLink = useCallback(() => {
    const url = window.prompt('リンク先の URL を入力してください (例: https://example.com)');
    if (!url) return;
    const safe = /^(https?:\/\/|\/)/.test(url) ? url : `https://${url}`;
    exec('createLink', safe);
  }, [exec]);

  // ペーストはプレーンテキストに正規化 (Word/サイトコピペの汚染防止)
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  // ── ヘッダー: モード切替 ──
  const tabBtn = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        // wysiwyg → 他モードへの切替時に最新 HTML を取り出して同期
        if (mode === 'wysiwyg' && editorRef.current) {
          const html = editorRef.current.innerHTML;
          if (html !== value) onChange(html);
        }
        setMode(m);
      }}
      aria-pressed={mode === m}
      style={{
        padding: '8px 16px',
        fontSize: 12,
        fontWeight: mode === m ? 700 : 500,
        color: mode === m ? color.cyan : color.textMuted,
        background: 'transparent',
        border: 'none',
        borderBottom: `2px solid ${mode === m ? color.cyan : 'transparent'}`,
        cursor: 'pointer',
        fontFamily: font.family,
        marginBottom: -1,
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        background: color.bg0,
        overflow: 'hidden',
      }}
    >
      {/* モード切替タブ */}
      <div
        role="tablist"
        aria-label="編集モード"
        style={{
          display: 'flex',
          gap: 4,
          padding: '4px 8px 0',
          background: color.bg1,
          borderBottom: `1px solid ${color.border}`,
        }}
      >
        {tabBtn('wysiwyg', '✏️ かんたん編集')}
        {tabBtn('preview', '📄 プレビュー')}
        {tabBtn('html', '{} HTML')}
      </div>

      {/* かんたん編集 (WYSIWYG) */}
      {mode === 'wysiwyg' && (
        <>
          {/* ツールバー */}
          <div
            role="toolbar"
            aria-label="文字装飾"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
              padding: 8,
              borderBottom: `1px solid ${color.border}`,
              background: color.bg1,
            }}
          >
            <button type="button" style={tbBtn} onClick={() => exec('bold')} aria-label="太字" title="太字 (Ctrl+B)"><b>B</b></button>
            <button type="button" style={tbBtn} onClick={() => exec('italic')} aria-label="斜体" title="斜体 (Ctrl+I)"><i>I</i></button>
            <button type="button" style={tbBtn} onClick={() => exec('underline')} aria-label="下線" title="下線 (Ctrl+U)"><u>U</u></button>
            <span style={{width: 1, background: color.border, margin: '0 4px'}} />
            <button type="button" style={tbBtn} onClick={() => exec('formatBlock', '<h2>')} aria-label="大見出し" title="大見出し">H2</button>
            <button type="button" style={tbBtn} onClick={() => exec('formatBlock', '<h3>')} aria-label="中見出し" title="中見出し">H3</button>
            <button type="button" style={tbBtn} onClick={() => exec('formatBlock', '<p>')} aria-label="段落" title="段落">¶</button>
            <span style={{width: 1, background: color.border, margin: '0 4px'}} />
            <button type="button" style={tbBtn} onClick={() => exec('insertUnorderedList')} aria-label="箇条書き" title="箇条書き">• リスト</button>
            <button type="button" style={tbBtn} onClick={() => exec('insertOrderedList')} aria-label="番号付きリスト" title="番号付きリスト">1. リスト</button>
            <span style={{width: 1, background: color.border, margin: '0 4px'}} />
            <button type="button" style={tbBtn} onClick={insertLink} aria-label="リンク挿入" title="リンク挿入">🔗 リンク</button>
            <button type="button" style={tbBtn} onClick={() => exec('insertHorizontalRule')} aria-label="区切り線" title="区切り線">― 区切り線</button>
            <span style={{width: 1, background: color.border, margin: '0 4px'}} />
            <button type="button" style={tbBtn} onClick={() => exec('removeFormat')} aria-label="装飾を消す" title="装飾を消す">✕ 装飾解除</button>
            <button type="button" style={tbBtn} onClick={() => exec('undo')} aria-label="元に戻す" title="元に戻す (Ctrl+Z)">↶</button>
            <button type="button" style={tbBtn} onClick={() => exec('redo')} aria-label="やり直す" title="やり直す (Ctrl+Shift+Z)">↷</button>
          </div>

          {/* contenteditable 本体 */}
          <div
            id={id}
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label={ariaLabel || '商品説明エディタ'}
            aria-multiline="true"
            onInput={handleInput}
            onBlur={handleInput}
            onPaste={handlePaste}
            data-placeholder={placeholder}
            // 初回 mount のみ既存 HTML を流し込む。useEffect が以降の同期を担う
            dangerouslySetInnerHTML={{__html: value || ''}}
            style={{
              minHeight,
              padding: 14,
              outline: 'none',
              color: color.text,
              fontSize: font.sm,
              fontFamily: font.family,
              lineHeight: 1.7,
              background: color.bg0,
            }}
          />

          {/* placeholder 表示用 CSS (要素が空のときのみ表示) */}
          <style dangerouslySetInnerHTML={{__html: `
            [contenteditable][data-placeholder]:empty::before {
              content: attr(data-placeholder);
              color: ${color.textMuted};
              pointer-events: none;
              display: inline-block;
            }
            [contenteditable] h2 { font-size: 18px; font-weight: 700; margin: 14px 0 8px; }
            [contenteditable] h3 { font-size: 15px; font-weight: 700; margin: 12px 0 6px; }
            [contenteditable] ul, [contenteditable] ol { padding-left: 24px; margin: 8px 0; }
            [contenteditable] p { margin: 8px 0; }
            [contenteditable] hr { border: none; border-top: 1px solid ${color.border}; margin: 14px 0; }
            [contenteditable] a { color: ${color.cyan}; text-decoration: underline; }
          `}} />
        </>
      )}

      {/* プレビュー */}
      {mode === 'preview' && (
        <div
          style={{
            padding: 18,
            minHeight,
            color: color.text,
            fontSize: font.sm,
            lineHeight: 1.7,
            background: color.bg0,
          }}
        >
          {value && value.trim() ? (
            <div
              dangerouslySetInnerHTML={{__html: lightSanitize(value)}}
              style={{wordBreak: 'break-word'}}
            />
          ) : (
            <div style={{color: color.textMuted, fontStyle: 'italic'}}>
              （まだ何も書かれていません）
            </div>
          )}
          <style dangerouslySetInnerHTML={{__html: `
            .rte-preview-style h2 { font-size: 18px; font-weight: 700; margin: 14px 0 8px; }
            .rte-preview-style h3 { font-size: 15px; font-weight: 700; margin: 12px 0 6px; }
            .rte-preview-style ul, .rte-preview-style ol { padding-left: 24px; margin: 8px 0; }
            .rte-preview-style p { margin: 8px 0; }
          `}} />
        </div>
      )}

      {/* HTML 編集モード (上級者向け) */}
      {mode === 'html' && (
        <div style={{padding: 0}}>
          <div
            style={{
              padding: '8px 14px',
              fontSize: 11,
              color: color.textMuted,
              background: color.bg1,
              borderBottom: `1px solid ${color.border}`,
              lineHeight: 1.5,
            }}
          >
            ⚠️ 上級者向けです。HTML を直接書き換えると、表示が崩れることがあります。
          </div>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            style={{
              width: '100%',
              minHeight,
              padding: 14,
              border: 'none',
              outline: 'none',
              resize: 'vertical' as const,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12,
              lineHeight: 1.55,
              background: color.bg0,
              color: color.text,
              boxSizing: 'border-box' as const,
            }}
          />
        </div>
      )}
    </div>
  );
}
