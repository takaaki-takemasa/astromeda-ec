/**
 * ImagePicker — 画像選択プリミティブ
 *
 * patch 0083 (2026-04-20) R1-P1-1
 *
 * admin の画像入力欄を「URL 手打ち専用」から「アップロード / ライブラリ選択 / URL貼り付け」
 * の 3 モード切替に置き換える共有コンポーネント。
 *
 * Why:
 *   - CEO/店員が画像を差し替えるとき、今までは Shopify admin で先にアップロード→ CDN URL を
 *     手コピー → Astromeda admin にペーストという 2 段階操作が必要だった。
 *   - patch 0083 の狙いは「Astromeda admin の中で完結させる」こと。
 *
 * 使い方:
 *   <ImagePicker value={form.image_url} onChange={(url) => setForm({...form, image_url: url})} />
 *
 * タブ構成:
 *   1. 📤 アップロード        — ドラッグ&ドロップ or クリックで Shopify Files に新規アップロード
 *   2. 📚 ライブラリから選択  — GET /api/admin/files?type=IMAGE の一覧からサムネ選択
 *   3. 🔗 URL を貼り付け       — 外部 CDN / ローカルパス直接入力
 *
 * 選択結果は常に「URL 文字列」で親に返す (CDN URL or relative path)。
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import type {CSSProperties} from 'react';
import {color, font, radius, space} from '~/lib/design-tokens';

// ━━━ 型定義 ━━━

type Mode = 'upload' | 'library' | 'url';

type UploadState = 'idle' | 'preparing' | 'uploading' | 'done' | 'error';

interface ShopifyImage {
  id: string;
  url: string;
  previewUrl: string;
  alt: string;
  originalFileName: string;
  createdAt: string;
  width: number | null;
  height: number | null;
}

interface ImagePickerProps {
  /** 現在の画像 URL */
  value: string;
  /** 新しい URL が選ばれたら呼ばれる */
  onChange: (url: string) => void;
  /** ラベル (default "画像") */
  label?: string;
  /** 任意フィールドか */
  optional?: boolean;
  /** ヘルパーテキスト */
  hint?: string;
  /** 初期表示タブ (default upload) */
  initialMode?: Mode;
}

// ━━━ 定数 ━━━

const ACCEPTED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

const MODES: {id: Mode; emoji: string; jp: string; helper: string}[] = [
  {id: 'upload', emoji: '📤', jp: 'アップロード', helper: '新しい画像を Shopify に保存して使う'},
  {id: 'library', emoji: '📚', jp: 'ライブラリ', helper: 'すでに Shopify に保存してある画像から選ぶ'},
  {id: 'url', emoji: '🔗', jp: 'URL 貼り付け', helper: '外部の画像 URL やローカルパスを直接入力する'},
];

// ━━━ コンポーネント ━━━

export function ImagePicker({
  value,
  onChange,
  label = '画像',
  optional = false,
  hint,
  initialMode = 'upload',
}: ImagePickerProps) {
  const [mode, setMode] = useState<Mode>(initialMode);

  // ── アップロード状態 ──
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // ── ライブラリ状態 ──
  const [libraryItems, setLibraryItems] = useState<ShopifyImage[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryError, setLibraryError] = useState('');

  // ━━━ アップロード処理 ━━━
  const handleFile = useCallback(
    async (file: File) => {
      if (!ACCEPTED_MIMES.includes(file.type)) {
        setUploadError('対応形式: JPEG / PNG / GIF / WebP');
        setUploadState('error');
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setUploadError('ファイルサイズは 20MB 以下にしてください');
        setUploadState('error');
        return;
      }
      setUploadError('');
      setUploadState('preparing');
      setUploadProgress(10);
      try {
        const stageRes = await fetch('/api/admin/images', {
          method: 'POST',
          credentials: 'include',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            action: 'staged_upload',
            filename: file.name,
            mimeType: file.type,
            fileSize: file.size,
          }),
        });
        const stageJson = (await stageRes.json()) as {
          success?: boolean;
          error?: string;
          stagedTarget?: {
            url: string;
            resourceUrl: string;
            parameters: Array<{name: string; value: string}>;
          };
        };
        if (!stageJson.success || !stageJson.stagedTarget) {
          throw new Error(stageJson.error || 'アップロード準備に失敗しました');
        }
        setUploadState('uploading');
        setUploadProgress(40);
        const {url, resourceUrl, parameters} = stageJson.stagedTarget;
        const formData = new FormData();
        for (const p of parameters) formData.append(p.name, p.value);
        formData.append('file', file);
        const cdnRes = await fetch(url, {method: 'POST', body: formData});
        if (!cdnRes.ok && cdnRes.status !== 201) {
          throw new Error(`CDN アップロード失敗: HTTP ${cdnRes.status}`);
        }
        setUploadProgress(100);
        setUploadState('done');
        onChange(resourceUrl);
      } catch (err) {
        setUploadState('error');
        setUploadError(err instanceof Error ? err.message : 'アップロードに失敗しました');
      }
    },
    [onChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFile(file);
      if (inputRef.current) inputRef.current.value = '';
    },
    [handleFile],
  );

  // ━━━ ライブラリ取得 ━━━
  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryError('');
    try {
      const q = librarySearch.trim();
      const qs = new URLSearchParams({
        type: 'IMAGE',
        limit: '36',
      });
      if (q) qs.set('query', q);
      const res = await fetch(`/api/admin/files?${qs.toString()}`, {
        credentials: 'include',
      });
      const json = (await res.json()) as {
        success?: boolean;
        files?: ShopifyImage[];
        error?: string;
      };
      if (!json.success) throw new Error(json.error || 'ライブラリの取得に失敗しました');
      setLibraryItems(json.files || []);
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : 'ライブラリの取得に失敗しました');
      setLibraryItems([]);
    } finally {
      setLibraryLoading(false);
    }
  }, [librarySearch]);

  useEffect(() => {
    if (mode !== 'library') return;
    void loadLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ━━━ style ━━━
  const wrapperStyle: CSSProperties = {display: 'flex', flexDirection: 'column', gap: space[2]};
  const labelStyle: CSSProperties = {
    fontSize: font.xs,
    color: color.textSecondary,
    fontWeight: font.semibold,
  };
  const tabStyle = (active: boolean): CSSProperties => ({
    padding: '6px 10px',
    fontSize: font.xs,
    fontWeight: font.semibold,
    fontFamily: font.family,
    borderRadius: radius.md,
    border: `1px solid ${active ? color.cyan : color.border}`,
    background: active ? color.cyanDim : 'transparent',
    color: active ? color.cyan : color.textSecondary,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  });

  // ━━━ render ━━━
  return (
    <div style={wrapperStyle}>
      <label style={labelStyle}>
        {label}
        {optional ? ' (任意)' : ''}
      </label>

      {/* 現在画像プレビュー */}
      {value ? (
        <div
          style={{
            display: 'flex',
            gap: space[2],
            alignItems: 'center',
            padding: space[2],
            background: color.bg2,
            border: `1px solid ${color.border}`,
            borderRadius: radius.md,
          }}
        >
          <img
            src={value}
            alt=""
            style={{
              width: 64,
              height: 40,
              objectFit: 'cover',
              borderRadius: radius.sm,
              background: color.bg0,
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
            }}
          />
          <div
            style={{
              flex: 1,
              fontSize: font.xs,
              color: color.textMuted,
              fontFamily: font.mono,
              wordBreak: 'break-all',
            }}
          >
            現在: {value}
          </div>
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="現在の画像を外す"
            style={{
              padding: '4px 8px',
              fontSize: font.xs,
              color: color.textMuted,
              background: 'transparent',
              border: `1px solid ${color.border}`,
              borderRadius: radius.sm,
              cursor: 'pointer',
              fontFamily: font.family,
            }}
          >
            外す
          </button>
        </div>
      ) : null}

      {/* モード切替タブ */}
      <div style={{display: 'flex', flexWrap: 'wrap', gap: space[1]}}>
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            title={m.helper}
            aria-label={`${m.jp}モード`}
            aria-pressed={mode === m.id}
            onClick={() => setMode(m.id)}
            style={tabStyle(mode === m.id)}
          >
            <span>{m.emoji}</span>
            <span>{m.jp}</span>
          </button>
        ))}
      </div>

      {/* ヘルパー */}
      <div style={{fontSize: font.xs, color: color.textMuted}}>
        {MODES.find((m) => m.id === mode)?.helper}
        {hint ? ` ・ ${hint}` : ''}
      </div>

      {/* タブ本体 */}
      {mode === 'upload' ? (
        <div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => uploadState !== 'uploading' && inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
            }}
            aria-label="ドロップ または クリックで画像をアップロード"
            style={{
              width: '100%',
              height: 140,
              border: `2px dashed ${
                dragOver ? color.cyan : uploadState === 'error' ? color.red : color.border
              }`,
              borderRadius: radius.md,
              background: dragOver ? 'rgba(0,240,255,.04)' : color.bg0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'border-color .2s, background .2s',
            }}
          >
            {uploadState === 'idle' && (
              <>
                <div style={{fontSize: 22, marginBottom: 4}}>📁</div>
                <div style={{fontSize: font.xs, color: color.textMuted}}>
                  画像をドラッグ&ドロップ、または クリックして選択
                </div>
                <div style={{fontSize: 10, color: color.textMuted, marginTop: 4}}>
                  JPEG / PNG / GIF / WebP ・ 最大 20MB
                </div>
              </>
            )}
            {(uploadState === 'preparing' || uploadState === 'uploading') && (
              <>
                <div
                  style={{
                    fontSize: font.xs,
                    color: color.cyan,
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  {uploadState === 'preparing' ? '準備中...' : 'アップロード中...'}
                </div>
                <div
                  style={{
                    width: 200,
                    height: 4,
                    background: 'rgba(255,255,255,.1)',
                    borderRadius: 2,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${uploadProgress}%`,
                      height: '100%',
                      background: color.cyan,
                      borderRadius: 2,
                      transition: 'width .3s',
                    }}
                  />
                </div>
              </>
            )}
            {uploadState === 'done' && (
              <div style={{fontSize: font.xs, color: '#6bff7b', fontWeight: 700}}>
                ✓ アップロード完了・保存ボタンを押して確定してください
              </div>
            )}
            {uploadState === 'error' && (
              <>
                <div
                  style={{
                    fontSize: font.xs,
                    color: color.red,
                    fontWeight: 700,
                    marginBottom: 4,
                  }}
                >
                  ✕ {uploadError}
                </div>
                <div style={{fontSize: 10, color: color.textMuted}}>
                  クリックして再試行
                </div>
              </>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_MIMES.join(',')}
            onChange={handleInputChange}
            style={{display: 'none'}}
            aria-label="画像ファイルを選択"
          />
        </div>
      ) : mode === 'library' ? (
        <div>
          <div style={{display: 'flex', gap: space[1], marginBottom: space[2]}}>
            <input
              type="text"
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void loadLibrary();
              }}
              placeholder="ファイル名で検索 (例: hero, pc-setup)"
              aria-label="ライブラリを検索"
              style={{
                flex: 1,
                padding: '8px 10px',
                fontSize: font.sm,
                fontFamily: font.family,
                color: color.text,
                background: color.bg1,
                border: `1px solid ${color.border}`,
                borderRadius: radius.md,
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => void loadLibrary()}
              disabled={libraryLoading}
              style={{
                padding: '8px 14px',
                fontSize: font.xs,
                fontWeight: font.semibold,
                color: color.cyan,
                background: 'transparent',
                border: `1px solid ${color.cyan}`,
                borderRadius: radius.md,
                cursor: libraryLoading ? 'not-allowed' : 'pointer',
                fontFamily: font.family,
              }}
            >
              {libraryLoading ? '読込中...' : '🔍 検索'}
            </button>
          </div>
          {libraryError ? (
            <div
              style={{
                padding: 10,
                fontSize: font.xs,
                color: color.red,
                background: 'rgba(255,45,85,.08)',
                border: `1px solid ${color.red}`,
                borderRadius: radius.md,
              }}
            >
              ✕ {libraryError}
            </div>
          ) : null}
          {libraryLoading ? (
            <div
              style={{
                padding: space[4],
                textAlign: 'center',
                fontSize: font.xs,
                color: color.textMuted,
              }}
            >
              読み込み中...
            </div>
          ) : libraryItems.length === 0 && !libraryError ? (
            <div
              style={{
                padding: space[4],
                textAlign: 'center',
                fontSize: font.xs,
                color: color.textMuted,
                background: color.bg0,
                border: `1px dashed ${color.border}`,
                borderRadius: radius.md,
              }}
            >
              📭 画像が見つかりません。アップロードタブから新規アップロードしてください。
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                gap: space[1],
                maxHeight: 320,
                overflow: 'auto',
                padding: space[1],
                background: color.bg0,
                border: `1px solid ${color.border}`,
                borderRadius: radius.md,
              }}
            >
              {libraryItems.map((file) => {
                const selected = file.url === value || file.previewUrl === value;
                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => onChange(file.url)}
                    aria-label={`画像を選択: ${file.originalFileName || file.alt || 'untitled'}`}
                    aria-pressed={selected}
                    title={file.originalFileName || file.alt}
                    style={{
                      padding: 4,
                      background: selected ? color.cyanDim : 'transparent',
                      border: `2px solid ${selected ? color.cyan : color.border}`,
                      borderRadius: radius.sm,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <img
                      src={file.previewUrl || file.url}
                      alt={file.alt || file.originalFileName || ''}
                      style={{
                        width: '100%',
                        height: 70,
                        objectFit: 'cover',
                        borderRadius: 3,
                        background: color.bg2,
                      }}
                    />
                    <div
                      style={{
                        fontSize: 10,
                        color: color.textMuted,
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textAlign: 'center',
                      }}
                    >
                      {file.originalFileName || '—'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* mode === 'url' */
        <div>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://cdn.shopify.com/... または /images/pc-setup/white.jpg"
            aria-label="画像の URL を入力"
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: font.sm,
              fontFamily: font.mono,
              color: color.text,
              background: color.bg1,
              border: `1px solid ${color.border}`,
              borderRadius: radius.md,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{fontSize: 10, color: color.textMuted, marginTop: 4}}>
            外部 CDN URL / 相対パス / データ URI いずれも OK
          </div>
        </div>
      )}
    </div>
  );
}
