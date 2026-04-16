/**
 * ImageUploader — Sprint 7
 *
 * ドラッグ&ドロップ + クリックで画像アップロード
 * 2ステップ: POST /api/admin/images (staged_upload) → Shopify CDN 直接 POST
 */

import React, {useCallback, useRef, useState} from 'react';

const C = {bg: '#06060C', cyan: '#00F0FF', red: '#FF2D55', border: 'rgba(255,255,255,.06)', text: '#fff', muted: 'rgba(255,255,255,.4)'};
const ACCEPTED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

type UploadState = 'idle' | 'preparing' | 'uploading' | 'done' | 'error';

export interface ImageUploadResult {
  resourceUrl: string;
  filename: string;
  previewUrl: string;
}

interface ImageUploaderProps {
  onUpload: (result: ImageUploadResult) => void;
  currentImageUrl?: string | null;
  label?: string;
  height?: number;
  disabled?: boolean;
}

export function ImageUploader({onUpload, currentImageUrl, label = '画像をアップロード', height = 160, disabled = false}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (disabled) return;
    if (!ACCEPTED.includes(file.type)) {
      setErrorMsg('対応形式: JPEG/PNG/GIF/WebP');
      setState('error');
      return;
    }
    if (file.size > MAX_SIZE) {
      setErrorMsg('ファイルサイズは20MB以下にしてください');
      setState('error');
      return;
    }

    // Preview
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setErrorMsg('');

    // Step 1: staged upload URL 取得
    setState('preparing');
    setProgress(10);
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
      const stageJson = await stageRes.json() as {success?: boolean; error?: string; stagedTarget?: {url: string; resourceUrl: string; parameters: Array<{name: string; value: string}>}};
      if (!stageJson.success || !stageJson.stagedTarget) {
        throw new Error(stageJson.error || 'Staged upload 取得失敗');
      }

      // Step 2: Shopify CDN に直接アップロード
      setState('uploading');
      setProgress(30);

      const {url, resourceUrl, parameters} = stageJson.stagedTarget;
      const formData = new FormData();
      for (const p of parameters) {
        formData.append(p.name, p.value);
      }
      formData.append('file', file);

      const uploadRes = await fetch(url, {method: 'POST', body: formData});
      if (!uploadRes.ok && uploadRes.status !== 201) {
        throw new Error(`CDN upload failed: ${uploadRes.status}`);
      }

      setProgress(100);
      setState('done');
      onUpload({resourceUrl, filename: file.name, previewUrl: localUrl});
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'アップロード失敗');
    }
  }, [disabled, onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    if (inputRef.current) inputRef.current.value = '';
  }, [handleFile]);

  const stateLabel = state === 'preparing' ? 'URL取得中...'
    : state === 'uploading' ? 'アップロード中...'
    : state === 'done' ? '完了'
    : state === 'error' ? errorMsg
    : '';

  return (
    <div>
      <div style={{fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, marginBottom: 6}}>{label}</div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && state !== 'uploading' && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        style={{
          width: '100%',
          height,
          border: `2px dashed ${dragOver ? C.cyan : state === 'error' ? C.red : C.border}`,
          borderRadius: 10,
          background: dragOver ? 'rgba(0,240,255,.04)' : C.bg,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          position: 'relative',
          overflow: 'hidden',
          transition: 'border-color .2s',
        }}
      >
        {previewUrl && (
          <img
            src={previewUrl}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.3,
            }}
          />
        )}
        <div style={{position: 'relative', zIndex: 1, textAlign: 'center', padding: 10}}>
          {state === 'idle' && (
            <>
              <div style={{fontSize: 24, marginBottom: 4}}>📁</div>
              <div style={{fontSize: 11, color: C.muted}}>
                ドラッグ&ドロップ、またはクリックして選択
              </div>
              <div style={{fontSize: 9, color: C.muted, marginTop: 4}}>
                JPEG/PNG/GIF/WebP · 最大20MB
              </div>
            </>
          )}
          {(state === 'preparing' || state === 'uploading') && (
            <>
              <div style={{fontSize: 11, color: C.cyan, fontWeight: 700, marginBottom: 8}}>{stateLabel}</div>
              <div style={{width: 200, height: 4, background: 'rgba(255,255,255,.1)', borderRadius: 2, overflow: 'hidden'}}>
                <div style={{width: `${progress}%`, height: '100%', background: C.cyan, borderRadius: 2, transition: 'width .3s'}} />
              </div>
            </>
          )}
          {state === 'done' && (
            <div style={{fontSize: 11, color: '#6bff7b', fontWeight: 700}}>✓ アップロード完了</div>
          )}
          {state === 'error' && (
            <>
              <div style={{fontSize: 11, color: C.red, fontWeight: 700, marginBottom: 4}}>✕ {errorMsg}</div>
              <div style={{fontSize: 9, color: C.muted}}>クリックしてリトライ</div>
            </>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        onChange={handleInputChange}
        style={{display: 'none'}}
      />
    </div>
  );
}
