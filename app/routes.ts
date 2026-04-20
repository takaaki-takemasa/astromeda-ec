import {flatRoutes} from '@react-router/fs-routes';
import {type RouteConfig} from '@react-router/dev/routes';
import {hydrogenRoutes} from '@shopify/hydrogen';

/**
 * patch 0062 (2026-04-20): /sitemap.xml の Oxygen CDN 固定 interceptor を
 * 回避するため、正式サイトマップ URL を /sitemap-index.xml に切替えた。
 * 旧 [sitemap.xml].tsx はフォールバックとして残置（Oxygen が将来
 * この挙動を改める可能性に備える）。詳細は [sitemap-index.xml].tsx
 * ファイル冒頭コメント参照。
 *
 * patch 0061 (revert): flat-routes の bracket-escape 衝突を原因と疑った
 * stripSitemapXml フィルタは不要だったので除去。真因は Oxygen edge 層。
 */
export default hydrogenRoutes([
  ...(await flatRoutes()),
]) satisfies RouteConfig;
