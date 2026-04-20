import {flatRoutes} from '@react-router/fs-routes';
import {
  type RouteConfig,
  type RouteConfigEntry,
  route,
} from '@react-router/dev/routes';
import {hydrogenRoutes} from '@shopify/hydrogen';

/**
 * patch 0061: /sitemap.xml 404 Go-Live blocker 修正
 *
 * 症状: 本番で /sitemap.xml が 404 を返す。同じ bracket-escape 形式の
 *   /robots.txt, /llms.txt, /feed.xml, /sitemap-static.xml は全て 200。
 *   唯一 /sitemap.xml だけが壊れている。
 *
 * 原因: React Router v7 の flat-routes アルゴリズムが
 *   `[sitemap.xml].tsx` と兄弟の `sitemap.$type.$page[.xml].tsx` を
 *   同じ `sitemap` 先頭セグメントで nest させる結果、前者の URL 解決が
 *   破綻し 404 になる。
 *
 * 修正: flat-routes 出力を再帰的に走査して `[sitemap.xml].tsx` を
 *   参照するエントリを除外し、明示的な route() で /sitemap.xml を
 *   top-level に固定する。他の bracket-escape ルートには影響させない。
 */
const SITEMAP_XML_FILE_SUFFIX = '[sitemap.xml].tsx';

function stripSitemapXml(entries: RouteConfigEntry[]): RouteConfigEntry[] {
  return entries
    .filter(
      (e) => !(typeof e.file === 'string' && e.file.endsWith(SITEMAP_XML_FILE_SUFFIX)),
    )
    .map((e) =>
      e.children && e.children.length > 0
        ? {...e, children: stripSitemapXml(e.children)}
        : e,
    );
}

const fsRoutes = await flatRoutes();
const filteredFsRoutes = stripSitemapXml(fsRoutes);

export default hydrogenRoutes([
  ...filteredFsRoutes,
  route('/sitemap.xml', 'routes/[sitemap.xml].tsx', {id: 'sitemap-xml-index'}),
]) satisfies RouteConfig;
