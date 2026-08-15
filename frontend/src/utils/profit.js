/**
 * Perhitungan laba — SNAPSHOT harga saat transaksi.
 * Laba Item = (Harga Jual - Harga Beli) × Qty - diskon item
 * Laba Transaksi = total seluruh laba item
 * Bagi hasil 2,5% = Total Laba Pelanggan × 2,5% (BUKAN dari omzet)
 */
export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** Laba satu item (harga beli/jual adalah snapshot saat transaksi) */
export function itemProfit(price, costPrice, quantity, discount = 0) {
  const qty = Number(quantity || 0);
  return round2(Number(price || 0) * qty - Number(discount || 0) - Number(costPrice || 0) * qty);
}

/** Laba transaksi = jumlah seluruh laba item */
export function saleProfit(items = []) {
  return round2(
    items.reduce((sum, i) => sum + itemProfit(i.price, i.cost_price, i.quantity, i.discount), 0)
  );
}

/** Nilai bagi hasil 2,5% pelanggan */
export function profitShare(totalProfit) {
  return round2(Number(totalProfit || 0) * 0.025);
}
