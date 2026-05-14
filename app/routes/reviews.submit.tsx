/** DEPRECATED (Phase L): 旧投稿ルート → App Proxy 新 URL に 301 */
import { redirect, type LoaderFunctionArgs } from "@shopify/remix-oxygen";
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  return redirect(`https://shop.mining-base.co.jp/apps/reviews/submit${token ? `?token=${encodeURIComponent(token)}` : ""}`, 301);
}
export default function Deprecated() { return null; }
