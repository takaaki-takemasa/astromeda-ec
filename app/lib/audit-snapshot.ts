/**
 * 監査ログ before/after snapshot ヘルパー — patch 0116 (P2-6)
 *
 * 全保存パターン監査 2026-04-22 P2-6:
 * 「どのフィールドが・誰によって・いつ変更されたか」を構造化記録。
 *
 * 既存 auditLog の `detail: string` だと grep 検索しかできず、フィールド単位の
 * 変更履歴が追跡できなかった。本ヘルパーは before/after の Record<string, unknown>
 * を比較して changedFields[] を導出し、AuditEntry に構造化フィールドとして添付する。
 *
 * 使い方:
 *   const before = metaobjectFieldsToRecord(current.fields);
 *   const after = metaobjectFieldsToRecord(input.fields);
 *   const diff = computeFieldDiff(before, after);
 *   auditLog({ action, role, resource, success: true, ...diff });
 *
 * セキュリティ: password / token / secret / api_key 等は自動的に '[REDACTED]' に置換。
 */

// ━━━ 型 ━━━

export interface FieldDiff {
  /** 変更前の値（部分オブジェクト・null = 新規作成） */
  before: Record<string, unknown> | null;
  /** 変更後の値（部分オブジェクト・null = 削除） */
  after: Record<string, unknown> | null;
  /** 変更されたフィールドのキー一覧（before/after で値が異なるもの） */
  changedFields: string[];
}

export interface SnapshotOptions {
  /** 機密扱いするキー（追加分）。デフォルトの SENSITIVE_KEYS に upserted */
  sensitiveKeys?: string[];
  /** 値が長すぎる場合の切り詰め長 (default: 500) */
  maxValueLength?: number;
  /** changedFields に含めても before/after には含めないキー */
  excludeFromSnapshot?: string[];
}

// ━━━ 機密キー（自動マスク） ━━━

const SENSITIVE_KEYS = new Set([
  'password',
  'pass',
  'pwd',
  'token',
  'api_key',
  'apikey',
  'secret',
  'access_token',
  'refresh_token',
  'session_secret',
  'admin_password',
  'shopify_admin_access_token',
  'private_storefront_api_token',
  'csrf',
  'authorization',
  'cookie',
]);

const REDACTED = '[REDACTED]';

// ━━━ ヘルパー ━━━

/**
 * Shopify Metaobject の fields 配列を Record<string, string> に変換
 * @example
 * metaobjectFieldsToRecord([{key:'title', value:'Hello'}])
 * // → { title: 'Hello' }
 */
export function metaobjectFieldsToRecord(
  fields: ReadonlyArray<{ key: string; value: string }> | undefined,
): Record<string, string> {
  if (!fields || !Array.isArray(fields)) return {};
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (typeof f.key === 'string') {
      out[f.key] = typeof f.value === 'string' ? f.value : String(f.value ?? '');
    }
  }
  return out;
}

/**
 * 値を切り詰めて表示用文字列にする
 */
function truncate(value: unknown, maxLen: number): unknown {
  if (typeof value !== 'string') return value;
  if (value.length <= maxLen) return value;
  return value.substring(0, maxLen) + `...[+${value.length - maxLen}文字]`;
}

/**
 * オブジェクトの機密フィールドをマスクする
 */
export function sanitizeSnapshot(
  obj: Record<string, unknown> | null,
  opts: SnapshotOptions = {},
): Record<string, unknown> | null {
  if (obj === null || obj === undefined) return obj;
  const extraSensitive = new Set((opts.sensitiveKeys ?? []).map((k) => k.toLowerCase()));
  const maxLen = opts.maxValueLength ?? 500;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const kLower = k.toLowerCase();
    if (SENSITIVE_KEYS.has(kLower) || extraSensitive.has(kLower)) {
      out[k] = REDACTED;
    } else {
      out[k] = truncate(v, maxLen);
    }
  }
  return out;
}

/**
 * 値が「実質的に同じ」か (型を考慮した比較)
 * - undefined ≈ null ≈ '' を「未設定」として同一扱い
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  // 未設定の正規化
  const isEmpty = (v: unknown) => v === undefined || v === null || v === '';
  if (isEmpty(a) && isEmpty(b)) return true;
  if (isEmpty(a) !== isEmpty(b)) return false;
  // 型が違う場合は文字列化して比較 (例: number 123 vs string "123")
  if (typeof a !== typeof b) {
    return String(a) === String(b);
  }
  if (typeof a === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

/**
 * before / after の差分を計算
 *
 * @param before 変更前のオブジェクト (null = 新規作成)
 * @param after 変更後のオブジェクト (null = 削除)
 * @param opts オプション
 * @returns { before, after, changedFields }
 *
 * @example
 * // 更新時
 * computeFieldDiff(
 *   { title: 'Old', body: 'X' },
 *   { title: 'New', body: 'X' },
 * )
 * // → { before: { title: 'Old' }, after: { title: 'New' }, changedFields: ['title'] }
 *
 * // 新規作成時
 * computeFieldDiff(null, { title: 'New' })
 * // → { before: null, after: { title: 'New' }, changedFields: ['title'] }
 *
 * // 削除時
 * computeFieldDiff({ title: 'X' }, null)
 * // → { before: { title: 'X' }, after: null, changedFields: ['title'] }
 */
export function computeFieldDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  opts: SnapshotOptions = {},
): FieldDiff {
  const exclude = new Set(opts.excludeFromSnapshot ?? []);
  const beforeNorm = before ?? null;
  const afterNorm = after ?? null;

  // 新規作成
  if (beforeNorm === null && afterNorm !== null) {
    const changed = Object.keys(afterNorm).filter((k) => !exclude.has(k));
    return {
      before: null,
      after: sanitizeSnapshot(afterNorm, opts),
      changedFields: changed,
    };
  }

  // 削除
  if (beforeNorm !== null && afterNorm === null) {
    const changed = Object.keys(beforeNorm).filter((k) => !exclude.has(k));
    return {
      before: sanitizeSnapshot(beforeNorm, opts),
      after: null,
      changedFields: changed,
    };
  }

  // 両方 null = 変更なし (理論上ありえない)
  if (beforeNorm === null && afterNorm === null) {
    return { before: null, after: null, changedFields: [] };
  }

  // 更新 — キーのユニオンで差分検出
  const allKeys = new Set([
    ...Object.keys(beforeNorm as Record<string, unknown>),
    ...Object.keys(afterNorm as Record<string, unknown>),
  ]);
  const changedFields: string[] = [];
  const beforeDiff: Record<string, unknown> = {};
  const afterDiff: Record<string, unknown> = {};

  for (const k of allKeys) {
    if (exclude.has(k)) continue;
    const bv = (beforeNorm as Record<string, unknown>)[k];
    const av = (afterNorm as Record<string, unknown>)[k];
    if (!valuesEqual(bv, av)) {
      changedFields.push(k);
      beforeDiff[k] = bv;
      afterDiff[k] = av;
    }
  }

  return {
    before: sanitizeSnapshot(beforeDiff, opts),
    after: sanitizeSnapshot(afterDiff, opts),
    changedFields,
  };
}

/**
 * Metaobject 専用ショートカット — fields 配列を直接受け取って diff を返す
 *
 * @example
 * const diff = computeMetaobjectDiff(current.fields, input.fields);
 * auditLog({ ..., ...diff });
 */
export function computeMetaobjectDiff(
  beforeFields: ReadonlyArray<{ key: string; value: string }> | undefined,
  afterFields: ReadonlyArray<{ key: string; value: string }> | undefined,
  opts: SnapshotOptions = {},
): FieldDiff {
  // patch 0112 と整合: afterFields の空文字フィールドは「未送信扱い」なので diff に含めない
  // (実際の Shopify 上の値は変わらないため)
  const before = metaobjectFieldsToRecord(beforeFields);
  const after = metaobjectFieldsToRecord(afterFields);
  return computeFieldDiff(before, after, opts);
}
