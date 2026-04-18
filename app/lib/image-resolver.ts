/**
 * image-resolver — 管理画面の画像入力値を Shopify file_reference 仕様に合わせて変換
 *
 * 背景（patch 0026）:
 *   管理画面の IP バナー / ヒーローバナー / カテゴリカード等の画像欄は
 *   Shopify 側では file_reference 型フィールドで、値は `gid://shopify/MediaImage/...`
 *   形式の GID を期待する。しかし CEO はそこに HTTP の CDN URL を直接貼るので、
 *   Shopify が userErrors で弾き、「画像を変更することができない」という現象になる。
 *
 *   この helper は入力を以下に正規化する:
 *     - 空 / undefined         → null（書き込みスキップ用）
 *     - gid://shopify/…        → そのまま返す
 *     - http(s)://…            → fileCreate で Shopify に取り込み、MediaImage GID を返す
 *     - その他（/images/... や 自由文字列）→ null を返して呼び出し側でスキップさせる
 *       （file_reference は GID しか受け付けられないため、無効値は黙って保存しない方が安全）
 *
 * 呼び出し側は、値が null のときは fields 配列への push をスキップすること。
 */

import type { AdminClient } from '../../agents/core/shopify-admin';

export interface ResolveResult {
  gid: string | null;
  /** 実際に Shopify に新規ファイル作成が発生した場合に CDN URL が入る（任意） */
  fileUrl?: string;
  /** 警告/情報メッセージ（ロギング用） */
  note?: string;
}

/**
 * file_reference 用に画像値を GID に正規化する。
 *
 * @param client  Admin API クライアント
 * @param rawValue  管理画面から送られてきた生値
 * @param alt   fileCreate 時の alt 属性（任意）
 */
export async function resolveFileReferenceGid(
  client: AdminClient,
  rawValue: string | null | undefined,
  alt?: string,
): Promise<ResolveResult> {
  const v = (rawValue || '').trim();
  if (!v) return { gid: null, note: 'empty' };

  if (v.startsWith('gid://shopify/')) {
    return { gid: v, note: 'pass-through' };
  }

  if (/^https?:\/\//i.test(v)) {
    // Shopify が externalUrl を fetch して MediaImage を作成する（fileCreate + originalSource）
    try {
      const created = await client.createFileFromStagedUpload(v, alt);
      return { gid: created.id, fileUrl: created.url, note: 'uploaded' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Shopify fileCreate が失敗した場合でも metaobject 側の保存自体は続行させたい
      // ので null を返して呼び出し側で「画像欄は無視して他フィールドを保存」させる。
      return { gid: null, note: `fileCreate-failed: ${msg}` };
    }
  }

  // 相対パス / その他の自由文字列は file_reference には入れられないので黙って捨てる。
  return { gid: null, note: `invalid-format: ${v.slice(0, 40)}` };
}

/**
 * Array<{key, value}> 内の指定 key を file_reference GID に置換する副作用ヘルパー。
 * 値が null に落ちる場合は fields から取り除く。
 *
 * 戻り値は `notes[]` — デバッグ用に Shopify Admin 監査ログへ仕込む想定。
 */
export async function normalizeFileReferenceField(
  client: AdminClient,
  fields: Array<{ key: string; value: string }>,
  targetKey: string,
  alt?: string,
): Promise<string[]> {
  const idx = fields.findIndex((f) => f.key === targetKey);
  if (idx < 0) return [];

  const raw = fields[idx].value;
  const result = await resolveFileReferenceGid(client, raw, alt);

  if (result.gid) {
    fields[idx].value = result.gid;
    return result.note ? [`${targetKey}: ${result.note}`] : [];
  }

  // GID に解決できなかった → file_reference に書けないので取り除く
  fields.splice(idx, 1);
  return [`${targetKey}: dropped (${result.note || 'unresolvable'})`];
}

/**
 * Metaobject タイプ別の file_reference フィールドキー一覧。
 * astromeda_pc_color.image_url は single_line_text_field なので対象外。
 */
const FILE_REFERENCE_KEYS_BY_TYPE: Record<string, string[]> = {
  astromeda_article_content: ['featured_image'],
  astromeda_ip_banner: ['image'],
  astromeda_hero_banner: ['image'],
  astromeda_category_card: ['image'],
  astromeda_about_section: ['image'],
};

/**
 * 統一 CMS エンドポイント /api/admin/cms 用：
 *   指定タイプに定義されている file_reference キーを全て GID に正規化する。
 *   呼び出し側は type 情報だけ渡せばよい。
 */
export async function normalizeFileReferenceFieldsByType(
  client: AdminClient,
  type: string,
  fields: Array<{ key: string; value: string }>,
  alt?: string,
): Promise<string[]> {
  const keys = FILE_REFERENCE_KEYS_BY_TYPE[type];
  if (!keys || keys.length === 0) return [];
  const notes: string[] = [];
  for (const key of keys) {
    const n = await normalizeFileReferenceField(client, fields, key, alt);
    notes.push(...n);
  }
  return notes;
}
