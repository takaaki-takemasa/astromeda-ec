/**
 * AdminSettings Tab — System Update & Configuration
 */

import { useState, useCallback } from 'react';
import { color } from '~/lib/design-tokens';
import { SchedulerPanel } from '~/components/admin/SchedulerPanel';

export default function AdminSettings() {
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'done' | 'error'>('idle');
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'validating' | 'done' | 'error'>('idle');
  const [uploadResult, setUploadResult] = useState<unknown>(null);
  const [uploadError, setUploadError] = useState<string>('');
  const [dragOver, setDragOver] = useState(false);

  const handleDownload = useCallback(async () => {
    setDownloadStatus('downloading');
    try {
      const res = await fetch('/api/admin/system-download');
      if (!res.ok) {
        throw new Error(`ダウンロード失敗: ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition');
      const match = disposition?.match(/filename="(.+)"/);
      a.download = match?.[1] || 'astromeda-system.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadStatus('done');
      setTimeout(() => setDownloadStatus('idle'), 3000);
    } catch (e: unknown) {
      setDownloadStatus('error');
      setUploadError(e instanceof Error ? e.message : 'ダウンロードに失敗しました');
    }
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setUploadError('ZIPファイルのみアップロード可能です');
      setUploadStatus('error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('ファイルサイズが10MBを超えています');
      setUploadStatus('error');
      return;
    }

    setUploadStatus('uploading');
    setUploadError('');
    setUploadResult(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      setUploadStatus('validating');

      const res = await fetch('/api/admin/system-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: arrayBuffer,
      });

      const result = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        throw new Error((result.error as string) || `アップロード失敗: ${res.status}`);
      }

      setUploadResult(result);
      setUploadStatus('done');
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : 'アップロードに失敗しました');
      setUploadStatus('error');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const steps = [
    {num: 1, title: 'ダウンロード', desc: '現在のシステムファイルをZIPでダウンロード', icon: '📥', color: color.cyan},
    {num: 2, title: 'Claudeで修正', desc: 'ZIPをClaudeにアップロードして修正を依頼', icon: '🤖', color: color.green},
    {num: 3, title: 'ZIPを受け取る', desc: 'Claudeから修正済みZIPをダウンロード', icon: '📦', color: color.yellow},
    {num: 4, title: 'アップロード', desc: '修正済みZIPをここにアップロード', icon: '📤', color: color.orange},
  ];

  return (
    <div>
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        color: color.textDim,
        letterSpacing: 2,
        marginBottom: 16,
      }}>
        SYSTEM UPDATE — システムアップデート
      </div>

      {/* ステップガイド */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 12,
        marginBottom: 32,
      }}>
        {steps.map((s) => (
          <div key={s.num} style={{
            background: color.bg1,
            borderRadius: 14,
            border: `1px solid ${color.border}`,
            padding: 16,
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: 12, right: 14,
              fontSize: 24, fontWeight: 900, color: `${s.color}15`,
            }}>
              {s.num}
            </div>
            <div style={{fontSize: 24, marginBottom: 8}}>{s.icon}</div>
            <div style={{fontSize: 13, fontWeight: 800, color: s.color, marginBottom: 4}}>
              STEP {s.num}: {s.title}
            </div>
            <div style={{fontSize: 11, color: color.textMuted, lineHeight: 1.5}}>
              {s.desc}
            </div>
          </div>
        ))}
      </div>

      {/* ダウンロード */}
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        color: color.cyan,
        letterSpacing: 2,
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: color.cyan, boxShadow: `0 0 6px ${color.cyan}60`,
        }} />
        STEP 1: DOWNLOAD
      </div>

      <div style={{
        background: color.bg1,
        borderRadius: 14,
        border: `1px solid ${color.border}`,
        padding: 24,
        marginBottom: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div>
          <div style={{fontSize: 14, fontWeight: 800, color: color.text, marginBottom: 4}}>
            システムファイルをダウンロード
          </div>
          <div style={{fontSize: 11, color: color.textMuted, lineHeight: 1.5}}>
            現在のソースコード（ルート、コンポーネント、エージェント設定）をZIPファイルとしてダウンロード。
          </div>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloadStatus === 'downloading'}
          style={{
            background: downloadStatus === 'done' ? color.green :
                        downloadStatus === 'error' ? color.red : color.cyan,
            color: '#000',
            border: 'none',
            borderRadius: 10,
            padding: '12px 28px',
            fontSize: 13,
            fontWeight: 800,
            cursor: downloadStatus === 'downloading' ? 'wait' : 'pointer',
            opacity: downloadStatus === 'downloading' ? 0.7 : 1,
            transition: 'all .2s',
            whiteSpace: 'nowrap',
          }}
        >
          {downloadStatus === 'idle' && '📥 ダウンロード'}
          {downloadStatus === 'downloading' && '⏳ ダウンロード中...'}
          {downloadStatus === 'done' && '✅ ダウンロード完了'}
          {downloadStatus === 'error' && '❌ エラー'}
        </button>
      </div>

      {/* アップロード */}
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        color: color.orange,
        letterSpacing: 2,
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: color.orange, boxShadow: `0 0 6px ${color.orange}60`,
        }} />
        STEP 4: UPLOAD
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          background: dragOver ? `${color.orange}10` : color.bg1,
          borderRadius: 14,
          border: `2px dashed ${dragOver ? color.orange : color.border}`,
          padding: 40,
          textAlign: 'center',
          transition: 'all .3s',
          cursor: 'pointer',
          marginBottom: 24,
        }}
        onClick={() => document.getElementById('update-file-input')?.click()}
      >
        <input
          id="update-file-input"
          type="file"
          accept=".zip"
          onChange={handleFileInput}
          style={{display: 'none'}}
        />

        {uploadStatus === 'idle' && (
          <>
            <div style={{fontSize: 48, marginBottom: 12, opacity: 0.7}}>📤</div>
            <div style={{fontSize: 14, fontWeight: 800, color: color.text, marginBottom: 6}}>
              修正済みZIPをここにドロップ
            </div>
            <div style={{fontSize: 11, color: color.textMuted}}>
              またはクリックしてファイルを選択（ZIP形式・10MB以下）
            </div>
          </>
        )}

        {uploadStatus === 'uploading' && (
          <>
            <div style={{fontSize: 48, marginBottom: 12, animation: 'pulse 1s infinite'}}>📤</div>
            <div style={{fontSize: 14, fontWeight: 800, color: color.orange}}>
              アップロード中...
            </div>
          </>
        )}

        {uploadStatus === 'validating' && (
          <>
            <div style={{fontSize: 48, marginBottom: 12, animation: 'pulse 1s infinite'}}>🔍</div>
            <div style={{fontSize: 14, fontWeight: 800, color: color.yellow}}>
              ファイル検証中...
            </div>
          </>
        )}

        {uploadStatus === 'done' && uploadResult && (
          <>
            <div style={{fontSize: 48, marginBottom: 12}}>✅</div>
            <div style={{fontSize: 14, fontWeight: 800, color: color.green, marginBottom: 6}}>
              {uploadResult.message}
            </div>
          </>
        )}

        {uploadStatus === 'error' && (
          <>
            <div style={{fontSize: 48, marginBottom: 12}}>❌</div>
            <div style={{fontSize: 14, fontWeight: 800, color: color.red, marginBottom: 6}}>
              エラー
            </div>
            <div style={{fontSize: 11, color: color.textMuted}}>
              {uploadError}
            </div>
          </>
        )}
      </div>

      {uploadResult && uploadResult.validation && (
        <div style={{
          background: color.bg1,
          borderRadius: 14,
          border: `1px solid ${color.border}`,
          padding: 20,
          marginBottom: 24,
        }}>
          <div style={{
            fontSize: 11,
            fontWeight: 800,
            color: color.green,
            letterSpacing: 2,
            marginBottom: 14,
          }}>
            検証結果
          </div>

          <div style={{display: 'grid', gap: 6}}>
            {uploadResult.validation.files
              .filter((f: Record<string, unknown>) => f.status !== 'unchanged')
              .map((f: Record<string, unknown>) => (
                <div key={f.path} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: f.status === 'new' ? `${color.green}08` : `${color.yellow}08`,
                  border: `1px solid ${f.status === 'new' ? `${color.green}20` : `${color.yellow}20`}`,
                }}>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 800,
                    color: f.status === 'new' ? color.green : color.yellow,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: f.status === 'new' ? `${color.green}15` : `${color.yellow}15`,
                  }}>
                    {f.status === 'new' ? 'NEW' : 'MOD'}
                  </span>
                  <span style={{fontSize: 11, color: color.text, fontFamily: 'monospace'}}>
                    {f.path}
                  </span>
                  <span style={{fontSize: 9, color: color.textDim, marginLeft: 'auto'}}>
                    {(f.size / 1024).toFixed(1)}KB
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {(uploadStatus === 'done' || uploadStatus === 'error') && (
        <button
          type="button"
          onClick={() => { setUploadStatus('idle'); setUploadResult(null); setUploadError(''); }}
          style={{
            background: 'none',
            border: `1px solid ${color.border}`,
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 11,
            color: color.textMuted,
            cursor: 'pointer',
          }}
        >
          🔄 リセット
        </button>
      )}

      {/* スケジューラー管理 */}
      <SchedulerPanel />
    </div>
  );
}
