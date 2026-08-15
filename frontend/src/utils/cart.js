/**
 * Hitung total keranjang.
 * items: [{ product: { sale_price }, quantity, discount }]
 * Returns { subtotal, discount, tax, additional_cost, total }
 */
export function computeTotals(items, discount = 0, tax = 0, additionalCost = 0) {
  const subtotal = (items || []).reduce((sum, i) => {
    const price = Number(i.product?.sale_price || i.price || 0);
    const itemDiscount = Number(i.discount || 0);
    return sum + price * Number(i.quantity) - itemDiscount;
  }, 0);

  const totalDiscount = Number(discount || 0);
  const totalTax = Number(tax || 0);
  const totalAdditional = Number(additionalCost || 0);

  return {
    subtotal: round2(subtotal),
    discount: round2(totalDiscount),
    tax: round2(totalTax),
    additional_cost: round2(totalAdditional),
    total: round2(subtotal - totalDiscount + totalTax + totalAdditional),
  };
}

/** Hitung pajak dari subtotal (setelah diskon) */
export function computeTax(subtotalAfterDiscount, percentage) {
  const pct = Number(percentage || 0);
  return round2((subtotalAfterDiscount * pct) / 100);
}

/** Hitung kembalian */
export function computeChange(paid, total) {
  return round2(Number(paid || 0) - Number(total || 0));
}

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
