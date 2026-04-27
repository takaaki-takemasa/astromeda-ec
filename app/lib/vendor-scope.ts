/**
 * Vendor scope filter — patch 0168 (2026-04-27)
 *
 * vendor ロール (他社デザイン会社等) は「コラボ以外のゲーミングPC + その他商品」のみ
 * 編集可能。IPコラボ商品 (NARUTO/呪術廻戦/ホロライブ等) には触れさせない。
 *
 * RBAC は permission ベースなのでデータレベルの制約は別実装。本モジュールが
 * 「商品/コレクションの GID + 現在 role」を受け取り、vendor が触れて良いかを判定する。
 *
 * 使い方:
 *   const role = requirePermission(session, 'products.edit');
 *   await assertVendorCanEditProduct(role, productId, client);  // throws AppError.forbidden() if not allowed
 */
import {AppError} from '~/lib/app-error';
import type {Role} from '~/lib/rbac';
import {detectIP} from '~/lib/collection-helpers';

interface ProductFetcher {
  getProduct(id: string): Promise<{
    id: string;
    title: string;
    tags: string[];
    productType?: string;
  } | null>;
}

interface CollectionFetcher {
  getCollection(id: string): Promise<{
    id: string;
    title: string;
    handle: string;
  } | null>;
}

/**
 * vendor が指定の商品を編集可能か判定。NG なら 403 で throw。
 * owner/admin/editor は無条件で通す (本関数は vendor 専用フィルタ)。
 */
export async function assertVendorCanEditProduct(
  role: Role,
  productId: string,
  client: ProductFetcher,
): Promise<void> {
  if (role !== 'vendor') return; // editor 以上は通す
  const product = await client.getProduct(productId).catch(() => null);
  if (!product) {
    // 取得失敗時は安全側に倒して拒否
    throw AppError.forbidden('外注先 (vendor) ロールで編集できる商品が見つかりませんでした');
  }
  // detectIP でタイトル+タグから IP コラボを判定。null 以外なら IP 商品
  const ip = detectIP(product.title || '', product.tags || []);
  if (ip) {
    throw AppError.forbidden(
      `この商品は IP コラボ商品 (${ip}) のため、外注先ロールでは編集できません。Astromeda の編集者以上の権限を持つメンバーに依頼してください。`,
    );
  }
  // 追加チェック: タグに 'コラボPC' / 'パックマスPC' 等が付いていれば IP 系と推定
  const collabTagPatterns = ['コラボPC', 'パックマスPC', 'collab', 'コラボ'];
  const hasCollabTag = (product.tags || []).some((t) =>
    collabTagPatterns.some((p) => t.includes(p)),
  );
  if (hasCollabTag) {
    throw AppError.forbidden(
      'この商品はコラボ系タグが付いているため、外注先ロールでは編集できません。',
    );
  }
}

/**
 * vendor が指定のコレクションを編集可能か判定。NG なら 403。
 * IP コラボのコレクション handle は HANDLE_TO_IP に登録済なので、それで判定。
 */
export async function assertVendorCanEditCollection(
  role: Role,
  collectionId: string,
  client: CollectionFetcher,
): Promise<void> {
  if (role !== 'vendor') return;
  const collection = await client.getCollection(collectionId).catch(() => null);
  if (!collection) {
    throw AppError.forbidden('外注先 (vendor) ロールで編集できるコレクションが見つかりませんでした');
  }
  // HANDLE_TO_IP に登録されているコレクションは IP 系なので拒否
  const {HANDLE_TO_IP} = await import('~/lib/collection-helpers');
  if (HANDLE_TO_IP[collection.handle]) {
    throw AppError.forbidden(
      `このコレクション (${collection.handle}) は IP コラボ用のため、外注先ロールでは編集できません。`,
    );
  }
}

/**
 * vendor が新規作成しようとしている商品/コレクションが「コラボ系」キーワードを
 * 含んでいないかをチェック (DB アクセス不要・タイトル/タグだけで判定)。
 * 作成時は GID がまだ無いので、入力データそのものを受け取る。
 */
export function assertVendorCanCreateProduct(
  role: Role,
  input: {title?: string; tags?: string[]},
): void {
  if (role !== 'vendor') return;
  const ip = detectIP(input.title || '', input.tags || []);
  if (ip) {
    throw AppError.forbidden(
      `この商品名は IP コラボ商品 (${ip}) と判定されました。外注先ロールでは IP コラボ商品を作成できません。`,
    );
  }
  const collabTagPatterns = ['コラボPC', 'パックマスPC', 'collab', 'コラボ'];
  const hasCollabTag = (input.tags || []).some((t) =>
    collabTagPatterns.some((p) => t.includes(p)),
  );
  if (hasCollabTag) {
    throw AppError.forbidden(
      'コラボ系タグの付いた商品は、外注先ロールでは作成できません。',
    );
  }
}
