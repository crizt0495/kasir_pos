export const ACTIVE_DEBT_STATUSES = ['pending', 'partial', 'overdue'];

export function pickSaleDebt(debts) {
  const list = Array.isArray(debts) ? debts : [];
  return (
    list.find((d) => ACTIVE_DEBT_STATUSES.includes(d.status)) ||
    list.find((d) => d.status === 'cancelled') ||
    list.find((d) => d.status === 'paid') ||
    null
  );
}

/**
 * Satu-satunya fungsi untuk menentukan "Sisa Hutang" / "Status Pembayaran"
 * di halaman Detail Transaksi dan daftar Penjualan.
 *
 * Bergantung pada data `customer_debts` via `debt` (sudah dipilih oleh
 * pickSaleDebt), BUKAN komputasi dari cash_received yang bisa basi.
 *
 * Fallback untuk data lama tanpa hutang tertaut masih dijaga agar tidak
 * merusak transaksi warisan.
 */
export function saleDebtView(debt, cashReceived, total) {
  if (debt) {
    const sisa = Math.max(
      0,
      Number(
        debt.remaining_amount ??
          Math.max(Number(debt.amount || 0) - Number(debt.paid_amount || 0), 0)
      )
    );
    if (debt.status === 'cancelled') return { kind: 'cancelled', label: 'DIBATALKAN', sisa: 0 };
    if (debt.status === 'paid') return { kind: 'paid', label: 'LUNAS', sisa: 0 };
    return { kind: 'unpaid', label: 'BELUM LUNAS', sisa };
  }

  const cr = Number(cashReceived);
  const t = Number(total);
  if (cashReceived != null && Number.isFinite(cr) && Number.isFinite(t)) {
    if (cr < t) return { kind: 'unpaid', label: 'BELUM LUNAS', sisa: t - cr };
    return { kind: 'paid', label: 'LUNAS', sisa: 0 };
  }
  // cashReceived null/invalid: jangan tampilkan kolom sisa (anggap lunas)
  return { kind: 'paid', label: 'LUNAS', sisa: 0 };
}
