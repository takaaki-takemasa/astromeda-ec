/**
 * Admin API — システムファイルダウンロード
 *
 * GET /api/admin/system-download
 * ビルド時に埋め込まれたソースファイルをZIPとしてダウンロード。
 * 非エンジニアがClaudeに渡すための「DNA抽出」エンドポイント。
 *
 * 医学メタファー: DNA抽出 — 生体（システム）からDNA（ソースコード）を抽出し、
 * 外部の研究者（Claude）に提供するためのプロトコル
 */

import { data } from 'react-router';
import { zipSync, strToU8 } from 'fflate';
import { requirePermission } from '~/lib/rbac';
import { auditLog } from '~/lib/audit-log';
import { AppSession } from '~/lib/session';

export async function loader({ request, context }: { request: Request; context: { env: Env } }) {
  // 認証チェック
  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env as Env);
  if (!auth.authenticated) return auth.response;

  try {
    // RBAC: system.download permission required
    const session = await AppSession.init(request, [context.env.SESSION_SECRET]);
    const role = requirePermission(session, 'system.download');
    // ビルド時に埋め込まれたソースバンドルを取得
    const bundle = (await import('virtual:source-bundle')).default;

    // fflateでZIPを生成
    const zipData: Record<string, Uint8Array> = {};

    for (const file of bundle.files) {
      // ZIPエントリのパス: astromeda-ec/ファイルパス
      const zipPath = `astromeda-ec/${file.path}`;
      zipData[zipPath] = strToU8(file.content);
    }

    // メタ情報ファイルを追加
    const meta = {
      exportedAt: new Date().toISOString(),
      projectName: bundle.projectName,
      fileCount: bundle.fileCount,
      builtAt: bundle.generatedAt,
      instructions: [
        '1. このZIPファイルをClaudeにアップロードしてください',
        '2. 修正したい内容をClaudeに説明してください',
        '3. Claudeが修正したファイルをZIPでダウンロードしてください',
        '4. ダウンロードしたZIPを管理画面の「アップデート」タブからアップロードしてください',
      ],
    };
    zipData['astromeda-ec/UPDATE_README.json'] = strToU8(JSON.stringify(meta, null, 2));

    const zipped = zipSync(zipData);

    auditLog({
      action: 'system_download',
      role,
      resource: 'system-download',
      detail: `${bundle.fileCount} files exported`,
      success: true,
    });

    // ZIPをResponse として返す
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `astromeda-system-${timestamp}.zip`;

    return new Response(zipped.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(zipped.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[system-download] Error:', error);
    return data(
      { error: 'ZIPファイルの生成に失敗しました' },
      { status: 500 },
    );
  }
}
