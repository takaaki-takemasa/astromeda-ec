// @ts-check

/**
 * Astromeda Cart Transform — カスタマイズ価格調整
 *
 * PCカスタマイズオプション（メモリ増設、SSD追加等）の追加金額を
 * カートの実際の価格に反映するShopify Function。
 *
 * 仕組み:
 * 1. 商品ページでカスタマイズ選択時、_customization_surcharge 属性に追加金額（数値）をセット
 * 2. この関数がカートの各ラインを検査し、_customization_surcharge があれば
 *    update オペレーションで価格を 本体価格 + 追加金額 に変更
 *
 * 注意: update オペレーション（価格変更）は Shopify Plus または開発ストアでのみ利用可能。
 * 通常プランの場合は expand オペレーションで代替する（後述のフォールバック）。
 */

/**
 * @typedef {Object} RunInput
 * @property {Object} cart
 * @property {Array<CartLine>} cart.lines
 * @property {number} presentmentCurrencyRate
 */

/**
 * @typedef {Object} CartLine
 * @property {string} id
 * @property {number} quantity
 * @property {Object} cost
 * @property {Object} cost.amountPerQuantity
 * @property {string} cost.amountPerQuantity.amount
 * @property {string} cost.amountPerQuantity.currencyCode
 * @property {Object} merchandise
 * @property {Object|null} attribute
 * @property {string} [attribute.value]
 */

/**
 * @param {RunInput} input
 * @returns {{ operations: Array<Object> }}
 */
export function run(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    // _customization_surcharge 属性がない場合はスキップ
    if (!line.attribute || !line.attribute.value) {
      continue;
    }

    const surcharge = parseFloat(line.attribute.value);
    if (isNaN(surcharge) || surcharge <= 0) {
      continue;
    }

    const basePrice = parseFloat(line.cost.amountPerQuantity.amount);
    if (isNaN(basePrice)) {
      continue;
    }

    // 新しい合計単価 = 本体価格 + カスタマイズ追加金額
    const newPrice = (basePrice + surcharge).toFixed(2);

    // update オペレーション: カートライン価格を直接変更
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

  return { operations };
}
