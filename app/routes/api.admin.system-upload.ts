/**
 * Admin API — システムファイルアップロード + 自動デプロイ
 *
 * POST /api/admin/system-upload
 * Claudeで修正されたZIPを受け取り、検証・展開・デプロイトリガー。
 *
 * 医学メタファー: 遺伝子治療 — 修正されたDNA（ソースコード）を
 * 生体（システム）に導入し、再生（リビルド＋再デプロイ）を誘導
 *
 * Oxygen環境の制約:
 * - ファイルシステムへの書き込み不可
 * - シェルコマンド実行不可
 * → ZIPの検証・差分表示を行い、デプロイコマンドを返す
 * → 将来的にはWebhookベースの自動デプロイに移行可能
 */

import { data } from 'react-router';
import { unzipSync, strFromU8 } from 'fflate';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';

// アップロード上限: 10MB
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

// 許可する拡張子
const ALLOWED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.css',
]);

// 危険なパスパターン
const DANGEROUS_PATTERNS = [
  /\.\./,           // ディレクトリトラバーサル
  /node_modules/,   // node_modules上書き防止
  /\.env/,          // 環境変数ファイル
  /\.git\//,        // git内部ファイル
  /dist\//,         // ビルド成果物
];

interface UploadedFile {
  path: string;
  content: string;
  size: number;
}

interface UploadValidation {
  valid: boolean;
  fileCount: number;
  totalSize: number;
  files: Array<{ path: string; size: number; status: 'new' | 'modified' | 'unchanged' }>;
  errors: string[];
  warnings: string[];
}

// メモリ内ステージング（最新アップロードのみ保持）
let stagedUpload: {
  files: UploadedFile[];
  uploadedAt: string;
  validation: UploadValidation;
} | null = null;

export function getStagedUpload() {
  return stagedUpload;
}

export async function action({ request, context }: { request: Request; context: { env: Env } }) {
  const csrfError = await verifyCsrfForAdmin(request, context.env);
  if (csrfError) return csrfError;

  // 認証チェック
  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env as Env);
  if (!auth.authenticated) return auth.response;

  if (request.method !== 'POST') {
    return data({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // RBAC: system.upload permission required
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const role = requirePermission(session, 'system.upload');
    // Content-Lengthチェック
    const contentLength = parseInt(request.headers.get('Content-Length') || '0');
    if (contentLength > MAX_UPLOAD_SIZE) {
      return data({
        error: `ファイルサイズが上限(${MAX_UPLOAD_SIZE / 1024 / 1024}MB)を超えています`,
      }, { status: 413 });
    }

    // ZIPデータ読み込み
    const arrayBuffer = await request.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_UPLOAD_SIZE) {
      return data({ error: 'ファイルサイズが上限を超えています' }, { status: 413 });
    }

    const zipData = new Uint8Array(arrayBuffer);

    // ZIP展開
    let unzipped: Record<string, Uint8Array>;
    try {
      unzipped = unzipSync(zipData);
    } catch (e) {
      return data({ error: 'ZIPファイルの展開に失敗しました。正しいZIPファイルをアップロードしてください。' }, { status: 400 });
    }

    // バリデーション
    const validation: UploadValidation = {
      valid: true,
      fileCount: 0,
      totalSize: 0,
      files: [],
      errors: [],
      warnings: [],
    };

    const uploadedFiles: UploadedFile[] = [];

    // 現在のソースバンドル（比較用）
    let currentBundle: Record<string, unknown> | null = null;
    try {
      currentBundle = (await import('virtual:source-bundle')).default as Record<string, unknown>;
    } catch { /* バンドル不在時はスキップ */ }

    const currentFileMap = new Map<string, string>();
    if (currentBundle) {
      for (const f of currentBundle.files) {
        currentFileMap.set(f.path, f.content);
      }
    }

    for (const [zipPath, fileData] of Object.entries(unzipped)) {
      // ディレクトリエントリはスキップ
      if (zipPath.endsWith('/')) continue;

      // astromeda-ec/ プレフィックスを除去
      let relativePath = zipPath;
      if (relativePath.startsWith('astromeda-ec/')) {
        relativePath = relativePath.slice('astromeda-ec/'.length);
      }

      // メタファイルはスキップ
      if (relativePath === 'UPDATE_README.json') continue;

      // 危険なパスチェック
      const isDangerous = DANGEROUS_PATTERNS.some(p => p.test(relativePath));
      if (isDangerous) {
        validation.errors.push(`危険なパス: ${relativePath}`);
        validation.valid = false;
        continue;
      }

      // 拡張子チェック
      const ext = '.' + relativePath.split('.').pop();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        validation.warnings.push(`非対応拡張子: ${relativePath} (${ext})`);
        continue;
      }

      // ファイルコンテンツ
      const content = strFromU8(fileData);
      const size = content.length;

      // 差分チェック
      let status: 'new' | 'modified' | 'unchanged' = 'new';
      const currentContent = currentFileMap.get(relativePath);
      if (currentContent !== undefined) {
        status = currentContent === content ? 'unchanged' : 'modified';
      }

      validation.fileCount++;
      validation.totalSize += size;
      validation.files.push({ path: relativePath, size, status });

      if (status !== 'unchanged') {
        uploadedFiles.push({ path: relativePath, content, size });
      }
    }

    // 変更ファイルがなければ警告
    const changedFiles = validation.files.filter(f => f.status !== 'unchanged');
    if (changedFiles.length === 0 && validation.errors.length === 0) {
      validation.warnings.push('変更されたファイルがありません');
    }

    // ステージングに保存
    stagedUpload = {
      files: uploadedFiles,
      uploadedAt: new Date().toISOString(),
      validation,
    };

    auditLog({
      action: 'system_upload',
      role,
      resource: 'system-upload',
      detail: `${changedFiles.length} files staged for deployment`,
      success: validation.valid,
    });

    return data({
      success: true,
      validation,
      changedCount: changedFiles.length,
      message: validation.valid
        ? `${changedFiles.length}ファイルの変更を検出。デプロイ準備完了。`
        : `検証エラーが${validation.errors.length}件あります。修正してください。`,
      deployInstructions: [
        'Astromeda 起動.batを開いてください',
        '「デプロイしてください」とClaudeに伝えてください',
        'Claudeが自動でビルド＋デプロイを実行します',
      ],
    });
  } catch (error) {
    console.error('[system-upload] Error:', error);
    return data(
      { error: 'アップロード処理に失敗しました' },
      { status: 500 },
    );
  }
}
