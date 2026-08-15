import dayjs from 'dayjs';

const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const numberFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

/** Format Rupiah: Rp 15.000 */
export function formatRupiah(value) {
  const n = Number(value || 0);
  return rupiah.format(n);
}

/** Format angka umum */
export function formatNumber(value) {
  return numberFmt.format(Number(value || 0));
}

/** Format qty (hilangkan desimal jika bulat) */
export function formatQty(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) ? String(n) : numberFmt.format(n);
}

/** Format tanggal: 15 Agu 2026 */
export function formatDate(value) {
  if (!value) return '-';
  return dayjs(value).format('DD MMM YYYY');
}

/** Format tanggal + jam: 15 Agu 2026, 14:30 */
export function formatDateTime(value) {
  if (!value) return '-';
  return dayjs(value).format('DD MMM YYYY, HH:mm');
}

/** Tanggal input HTML (YYYY-MM-DD) hari ini */
export function todayInput() {
  return dayjs().format('YYYY-MM-DD');
}

/** Nama metode pembayaran dalam Bahasa Indonesia */
export const PAYMENT_METHOD_LABELS = {
  CASH: 'Tunai',
  QRIS: 'QRIS',
  DEBIT: 'Debit',
  CREDIT: 'Kredit',
  TRANSFER: 'Transfer',
  E_WALLET: 'E-Wallet',
};

export function paymentMethodLabel(method) {
  return PAYMENT_METHOD_LABELS[method] || method;
}

/** Warna badge metode pembayaran */
export function paymentMethodColor(method) {
  const colors = {
    CASH: 'bg-emerald-100 text-emerald-700',
    QRIS: 'bg-violet-100 text-violet-700',
    DEBIT: 'bg-sky-100 text-sky-700',
    CREDIT: 'bg-amber-100 text-amber-700',
    TRANSFER: 'bg-blue-100 text-blue-700',
    E_WALLET: 'bg-fuchsia-100 text-fuchsia-700',
  };
  return colors[method] || 'bg-slate-100 text-slate-700';
}

/** Inisial nama untuk avatar */
export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';
}
