/**
 * Discount Code API — patch 0069 follow-up 3 (bisect stub)
 *
 * 本物の CRUD 実装は git 履歴に退避（commit 8c1c2d9）。
 * deploy-production が 31s で exit 1 する原因を特定するため、
 * まずは route を最小 stub に置換して「ファイル存在」だけを残し、
 * 他のファイル（AdminDiscounts.tsx / shopify-admin.ts / audit-log.ts /
 * admin._index.tsx の tab 登録）は維持したまま deploy が通るか確認する。
 *
 * deploy が通れば → 本ファイル本体（Zod discriminatedUnion / dynamic import /
 *                  shopify-admin client 呼び出しのいずれか）が犯人。
 * deploy がまた失敗すれば → 犯人は他のファイル。さらにバイセクトする。
 */

import {data} from 'react-router';
import type {Route} from './+types/api.admin.discounts';

export async function loader(_args: Route.LoaderArgs) {
  return data(
    {success: false, error: 'discount CRUD (patch 0069) は一時的に無効化中'},
    {status: 501},
  );
}

export async function action(_args: Route.ActionArgs) {
  return data(
    {success: false, error: 'discount CRUD (patch 0069) は一時的に無効化中'},
    {status: 501},
  );
}
