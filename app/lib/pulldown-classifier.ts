/**
 * Pulldown Component Classification
 * patch 0103
 *
 * CEO 指示「プルダウン項目と製品を区別し、プルダウン項目については製品として
 * 製品UI上にもこのシステム内にも製品と認識および表示せず、プルダウン項目としての
 * 認識に統合し必要に応じてタグをつけて間違えないようにしてください」への対応。
 *
 * 旧 Globo 由来のプルダウン部品（カスタマイズ選択肢のための隠れ商品）と
 * 通常商品を canonical に判別するための共通ヘルパー。
 *
 * 判定優先順:
 *   (1) tags に PULLDOWN_COMPONENT_TAG ('pulldown-component') がある（canonical マーカー）
 *   (2) tags に 'globo-product-options' がある（旧 Globo option 系：282件）
 *   (3) tags=[] かつ productType=''（旧 Globo 純粋部品：212件）
 *   (4) title に '延長保証' を含む（warranty line_item_property：77件）
 *
 * (1) は将来 Shopify 側に bulk_tags_add で付与する canonical マーカー。
 * 一度付与すれば (2)(3)(4) のヒューリスティクスは退路として機能する。
 */

export const PULLDOWN_COMPONENT_TAG = 'pulldown-component';

/** プルダウン項目判定に最低限必要なフィールドのみを要求する型 */
export interface ClassifiableProduct {
  title?: string;
  tags?: string[];
  productType?: string;
}

/** 販売可否判定に追加で必要なフィールド */
export interface SellableProduct extends ClassifiableProduct {
  status?: string;
  totalInventory?: number | null;
  availableForSale?: boolean;
}

/**
 * プルダウン項目（カスタマイズ選択肢の部品）かどうかを canonical 判定。
 * 商品 UI / システム内のいかなる「商品リスト」もこの判定で除外する。
 */
export function isPulldownComponent(p: ClassifiableProduct): boolean {
  const tags = p.tags ?? [];
  const productType = (p.productType ?? '').trim();
  const title = p.title ?? '';

  if (tags.includes(PULLDOWN_COMPONENT_TAG)) return true;
  if (tags.includes('globo-product-options')) return true;
  if (tags.length === 0 && productType === '') return true;
  if (title.includes('延長保証')) return true;
  return false;
}

/**
 * 出品中（販売停止/在庫停止でない）かどうかを判定。
 * CEO 指示「現在販売停止もしくは在庫停止している製品は含めない」に対応。
 *
 *   - status が 'ACTIVE' 以外（DRAFT/ARCHIVED）→ 出品停止
 *   - totalInventory が 0 以下 → 在庫切れ
 *   - availableForSale が false → 販売不可
 *
 * 引数オブジェクトに status / totalInventory / availableForSale が無い場合は
 * 「販売可」とみなす（情報が欠落しているだけで停止状態とは断定しない）。
 */
export function isSellable(p: SellableProduct): boolean {
  if (typeof p.status === 'string' && p.status !== 'ACTIVE') return false;
  if (typeof p.totalInventory === 'number' && p.totalInventory <= 0) return false;
  if (typeof p.availableForSale === 'boolean' && !p.availableForSale) return false;
  return true;
}

/**
 * Storefront 商品リストから「商品 UI に出すべきもの」を残すフィルタ。
 *   - プルダウン項目（部品）は除外
 *   - 販売停止/在庫停止は除外
 *
 * Storefront API が返す Storefront 型 (variants.nodes[].availableForSale) と
 * Admin API が返す型 (totalInventory + status) のどちらでも使えるよう
 * union 型で受け取る。
 */
export function filterDisplayableProducts<T extends SellableProduct>(products: T[]): T[] {
  return products.filter((p) => !isPulldownComponent(p) && isSellable(p));
}
