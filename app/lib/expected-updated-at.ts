/**
 * Optimistic Compare-And-Swap (CAS) helper — patch 0115 (P2-5)
 *
 * 並行編集による last-write-wins (silent overwrite) を防ぐ楽観的ロック。
 *
 * 使い方:
 *   1. 更新 schema に `expectedUpdatedAt: expectedUpdatedAtField` を追加（optional）
 *   2. 更新ハンドラで mutation の前に現状取得 → `validateExpectedUpdatedAt(current.updatedAt, body.expectedUpdatedAt)`
 *   3. mismatch なら `casConflictResponse(current)` を return して 409 + 最新値を返す
 *   4. クライアントは 409 を受け取ったら ConfirmDialog で「最新を読み込んで変更を破棄しますか？」を出す
 *
 * 設計方針 (保守的・後方互換):
 *   - expectedUpdatedAt は **optional** — 送らないクライアントはそのまま動く（curl 直叩きや旧 client 互換）
 *   - 送られてきた時のみ CAS チェック発火 — opt-in の楽観的ロック
 *   - mismatch 時は **400 でも 422 でもなく 409 Conflict** — REST 標準の楽観的ロック衝突コード
 *   - 比較は文字列同値 — Shopify の updatedAt は ISO8601 で安定して文字列比較可能
 *
 * patch 0115 では server-side のインフラのみ実装。client-side の loadedAt 捕捉と 409 UI は
 * 後続 patch 0116 で実装する（段階的ロールアウトで既存挙動を壊さない）。
 */

import {z} from 'zod';
import {data} from 'react-router';

/**
 * Zod field for the optional expectedUpdatedAt parameter.
 * Use this in update schemas: `expectedUpdatedAt: expectedUpdatedAtField`
 */
export const expectedUpdatedAtField = z
  .string()
  .min(1)
  .max(64)
  .optional();

export type CasResult<T> =
  | {ok: true}
  | {ok: false; current: T; currentUpdatedAt: string};

/**
 * Compare current entity's updatedAt against the client-provided expectation.
 *
 * - Returns `{ok: true}` if no expectation provided (skip CAS — backwards compat)
 * - Returns `{ok: true}` if expectation matches
 * - Returns `{ok: false, current, currentUpdatedAt}` if mismatch (caller should 409)
 *
 * @param current - the freshly-fetched current entity (must have updatedAt)
 * @param expectedUpdatedAt - the client's expected updatedAt (from initial GET)
 */
export function validateExpectedUpdatedAt<T extends {updatedAt?: string | null}>(
  current: T | null | undefined,
  expectedUpdatedAt: string | undefined,
): CasResult<T> {
  // No expectation → skip CAS (opt-in)
  if (!expectedUpdatedAt) return {ok: true};

  // No current entity (deleted by other user) → 409 with null current
  if (!current) {
    return {
      ok: false,
      current: null as unknown as T,
      currentUpdatedAt: '',
    };
  }

  const currentTs = String(current.updatedAt || '');

  // Match → ok
  if (currentTs && currentTs === expectedUpdatedAt) {
    return {ok: true};
  }

  // Mismatch → 409
  return {ok: false, current, currentUpdatedAt: currentTs};
}

/**
 * Build a 409 Conflict Response with the latest entity state.
 * Client should display: 「別の人が同じデータを編集しました。最新を読み込んで変更を破棄しますか？」
 */
export function casConflictResponse<T>(current: T | null, currentUpdatedAt: string) {
  return data(
    {
      success: false,
      error: '別のユーザーが同じデータを更新しました。最新を読み込み直してください。',
      conflict: true,
      current,
      currentUpdatedAt,
    },
    {status: 409},
  );
}

/**
 * Extract updatedAt string from a Metaobject's fields[].
 * Some Metaobject GraphQL queries return updatedAt as a top-level field;
 * older queries may not — fall back to '' (which disables CAS for that record).
 */
export function readMetaobjectUpdatedAt(
  mo: {updatedAt?: string | null} | null | undefined,
): string {
  if (!mo) return '';
  return String(mo.updatedAt || '');
}
