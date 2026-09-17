import { Ban, CheckCircle2, Wallet } from 'lucide-react';
import { formatRupiahCard } from '../../utils/format.js';
import { StatusBadge } from './Feedback.jsx';

/**
 * Badge status pembayaran/hutang transaksi — SATU format di Detail Transaksi
 * dan daftar Penjualan. Sumber data: customer_debts (single source of truth).
 *
 * debt: objek hutang yang sudah dipilih (pickSaleDebt), atau null.
 * saleStatus: status transaksi (dipakai bila transaksi tanpa hutang).
 */
export function SaleStatusBadge({ debt, saleStatus, className = '' }) {
  if (!debt) return <StatusBadge status={saleStatus} className={className} />;

  if (debt.status === 'cancelled') {
    return (
      <span className={`inline-flex items-center gap-1 rounded-md bg-slate-200 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-slate-700 ${className}`}>
        <Ban className="h-4 w-4 shrink-0" aria-hidden="true" />
        DIBATALKAN
      </span>
    );
  }

  if (debt.status === 'paid') {
    return (
      <span className={`inline-flex items-center gap-1 rounded-md bg-success-100 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-success-700 ${className}`}>
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        LUNAS
      </span>
    );
  }

  const sisa = Math.max(
    0,
    Number(debt.remaining_amount ?? Math.max(Number(debt.amount || 0) - Number(debt.paid_amount || 0), 0))
  );

  return (
    <span className={`inline-flex items-center gap-1 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-amber-700 ${className}`}>
      <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" />
      BELUM LUNAS
      {sisa > 0 && <span className="ml-0.5 font-mono text-[0.7rem]">({formatRupiahCard(sisa)})</span>}
    </span>
  );
}
