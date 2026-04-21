/**
 * patch 0093: astromeda_legal_info Metaobject を LEGAL 定数にオーバーレイするヘルパー。
 *
 * 使い分け:
 *   - AstroFooter: rootData.metaLegalInfo を loader 経由で受け取り、mergeLegal() でオーバーレイ。
 *   - /legal/tokushoho, /legal/privacy: useRouteLoaderData<RootLoader>('root') で同じ値にアクセス。
 *
 * 空文字 / undefined の場合はハードコード LEGAL 定数にフォールバック。
 * これにより Go-Live 後も管理画面 (サイト設定 > 法務) のみで特商法・保証・会社情報・プライバシーが編集可能。
 */
import {LEGAL} from '~/lib/astromeda-data';
import type {MetaLegalInfo} from '~/root';

function pickLegalValue<T extends string>(cmsVal: unknown, fallback: T): T {
  if (typeof cmsVal === 'string' && cmsVal.trim() !== '') return cmsVal as T;
  return fallback;
}

export function mergeLegal(meta: MetaLegalInfo | null | undefined) {
  if (!meta) return LEGAL;
  const c = meta.company || {};
  const t = meta.tokusho || {};
  const w = meta.warranty || {};
  return {
    company: {
      name: pickLegalValue(c.name, LEGAL.company.name),
      en: pickLegalValue(c.en, LEGAL.company.en),
      ceo: pickLegalValue(c.ceo, LEGAL.company.ceo),
      est: pickLegalValue(c.est, LEGAL.company.est),
      addr: pickLegalValue(c.addr, LEGAL.company.addr),
      biz: pickLegalValue(c.biz, LEGAL.company.biz),
      partners: pickLegalValue(c.partners, LEGAL.company.partners),
    },
    tokusho: {
      seller: pickLegalValue(t.seller, LEGAL.tokusho.seller),
      resp: pickLegalValue(t.resp, LEGAL.tokusho.resp),
      addr: pickLegalValue(t.addr, LEGAL.tokusho.addr),
      tel: pickLegalValue(t.tel, LEGAL.tokusho.tel),
      email: pickLegalValue(t.email, LEGAL.tokusho.email),
      pay: pickLegalValue(t.pay, LEGAL.tokusho.pay),
      ship: pickLegalValue(t.ship, LEGAL.tokusho.ship),
      shipTime: pickLegalValue(t.shipTime, LEGAL.tokusho.shipTime),
      cancel: pickLegalValue(t.cancel, LEGAL.tokusho.cancel),
      returnP: pickLegalValue(t.returnP, LEGAL.tokusho.returnP),
      price: pickLegalValue(t.price, LEGAL.tokusho.price),
    },
    warranty: {
      base: pickLegalValue(w.base, LEGAL.warranty.base),
      ext: pickLegalValue(w.ext, LEGAL.warranty.ext),
      extPrice2: pickLegalValue(w.extPrice2, LEGAL.warranty.extPrice2),
      extPrice3: pickLegalValue(w.extPrice3, LEGAL.warranty.extPrice3),
      scope: pickLegalValue(w.scope, LEGAL.warranty.scope),
      exclude: pickLegalValue(w.exclude, LEGAL.warranty.exclude),
      repair: pickLegalValue(w.repair, LEGAL.warranty.repair),
      repairCost: pickLegalValue(w.repairCost, LEGAL.warranty.repairCost),
      support: pickLegalValue(w.support, LEGAL.warranty.support),
      device: pickLegalValue(w.device ?? '', LEGAL.warranty.device),
    },
    privacy: pickLegalValue(meta.privacy, LEGAL.privacy),
  };
}

export type MergedLegal = ReturnType<typeof mergeLegal>;
