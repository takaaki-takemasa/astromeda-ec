/**
 * Admin API — パスワード変更
 *
 * POST /api/admin/password
 * Body: { currentPassword, newPassword, userId? }
 *
 * 医学メタファー: 自己同一性の更新（Identity Renewal）
 * パスワード＝生体認証コードの更新。古い鍵を安全に新しい鍵に交換する。
 */

import { data } from 'react-router';
import { PasswordChangeSchema } from '~/lib/api-schemas';
import { verifyCsrfForAdmin } from '~/lib/csrf-middleware';

export async function action({ request, context }: { request: Request; context: { env: Env } }) {
  const csrfError = await verifyCsrfForAdmin(request, context.env);
  if (csrfError) return csrfError;

  const { verifyAdminAuth } = await import('~/lib/admin-auth');
  const auth = await verifyAdminAuth(request, context.env as Env);
  if (!auth.authenticated) return auth.response;

  try {
    // Zodスキーマによるリクエストボディ検証（S-04 免疫受容体）
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return data({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = PasswordChangeSchema.safeParse(rawBody);
    if (!validation.success) {
      return data({ success: false, error: '入力値が無効です', details: validation.error.errors.map(e => e.message) }, { status: 400 });
    }

    const { currentPassword, newPassword, userId } = validation.data;

    const env = context.env as Env;
    const adminPassword = env.ADMIN_PASSWORD;

    // レガシー認証（環境変数パスワード）の場合
    if (!userId) {
      // 現在のパスワード検証（timing-safe）
      const encoder = new TextEncoder();
      const inputBytes = encoder.encode(currentPassword);
      const expectedBytes = encoder.encode(adminPassword);
      const maxLen = Math.max(inputBytes.byteLength, expectedBytes.byteLength);
      let diff = inputBytes.byteLength ^ expectedBytes.byteLength;
      for (let i = 0; i < maxLen; i++) {
        diff |= (inputBytes[i] ?? 0) ^ (expectedBytes[i] ?? 0);
      }

      if (diff !== 0) {
        return data({ success: false, error: '現在のパスワードが正しくありません' }, { status: 401 });
      }

      // 環境変数パスワードはOxygen管理画面から変更が必要
      // ここではUserManager経由でのみ変更可能
      return data({
        success: false,
        error: '環境変数パスワードはOxygen管理画面から変更してください。マルチユーザー設定後はこのAPIから変更可能です。',
        hint: 'Shopify Partners → astromeda-ec → Hydrogen → Environment Variables → ADMIN_PASSWORD',
      });
    }

    // マルチユーザー認証の場合
    const { getUserManager } = await import('../../agents/core/user-manager.js');
    const mgr = getUserManager();
    await mgr.initialize(adminPassword);

    const changed = await mgr.changePassword(userId, newPassword);
    if (!changed) {
      return data({ success: false, error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    return data({ success: true, message: 'パスワードを変更しました' });
  } catch (error) {
    console.error('[password API] Error:', error);
    return data({ success: false, error: 'パスワード変更処理中にエラーが発生しました' }, { status: 500 });
  }
}
