import dayjs from 'dayjs';

// Nama bulan singkat Indonesia — dikomposisi manual agar output deterministik
// (tidak bergantung pada locale bundle dayjs)
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** 15 Agu 2026 */
function partsID(value) {
  const d = dayjs(value);
  const day = String(d.date()).padStart(2, '0');
  const month = MONTHS_ID[d.month()];
  return { day, month, year: d.year(), time: d.format('HH:mm'), valid: d.isValid() };
}

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
  const { day, month, year, valid } = partsID(value);
  return valid ? `${day} ${month} ${year}` : '-';
}

/** Format tanggal + jam: 15 Agu 2026, 14:30 */
export function formatDateTime(value) {
  if (!value) return '-';
  const { day, month, year, time, valid } = partsID(value);
  return valid ? `${day} ${month} ${year}, ${time}` : '-';
}

/** Tanggal input HTML (YYYY-MM-DD) hari ini */
export function todayInput() {
  return dayjs().format('YYYY-MM-DD');
}

/** Nilai input datetime-local (YYYY-MM-DDTHH:mm), default sekarang */
export function dateTimeInput(value) {
  return dayjs(value || undefined).format('YYYY-MM-DDTHH:mm');
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

const DEBT_STATUS_LABELS = {
  pending: 'Belum Bayar',
  paid: 'Lunas',
  partial: 'Sebagian',
  overdue: 'Jatuh Tempo',
  cancelled: 'Dibatalkan',
};

export function debtStatusLabel(status) {
  return DEBT_STATUS_LABELS[status] || status;
}

export function debtStatusColor(status) {
  const colors = {
    pending: 'bg-danger-50 text-danger-700',
    paid: 'bg-success-50 text-success-700',
    partial: 'bg-warning-50 text-warning-700',
    overdue: 'bg-danger-100 text-danger-700',
    cancelled: 'bg-slate-100 text-slate-500',
  };
  return colors[status] || 'bg-slate-100 text-slate-700';
}
