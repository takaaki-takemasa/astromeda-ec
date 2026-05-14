/** DEPRECATED (Phase L): 旧公開レビュー一覧 → 商品一覧へ 301 */
import { redirect } from "@shopify/remix-oxygen";
export async function loader() {
  return redirect("https://shop.mining-base.co.jp/collections/all", 301);
}
export default function Deprecated() { return null; }
