// @ts-check

/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 */

/**
 * @type {FunctionRunResult}
 */
const NO_CHANGES = {
  operations: [],
};

/**
 * Astromeda Cart Transform — カスタマイズ価格調整
 *
 * カート属性 _customization_surcharge の数値を読み取り、
 * 本体価格 + 追加金額 に価格を update する。
 *
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function cartTransformRun(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    // _customization_surcharge 属性を取得
    const surchargeAttr = line.attribute;
    if (!surchargeAttr || !surchargeAttr.value) {
      continue;
    }

    const surcharge = parseFloat(surchargeAttr.value);
    if (isNaN(surcharge) || surcharge <= 0) {
      continue;
    }

    const basePrice = parseFloat(line.cost.amountPerQuantity.amount);
    if (isNaN(basePrice)) {
      continue;
    }

    // 新しい単価 = 本体価格 + カスタマイズ追加金額
    const newPrice = (basePrice + surcharge).toFixed(2);

    operations.push({
      update: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: {
              amount: newPrice,
            },
          },
        },
      },
    });
  }

  if (operations.length === 0) {
    return NO_CHANGES;
  }

  return { operations };
}
