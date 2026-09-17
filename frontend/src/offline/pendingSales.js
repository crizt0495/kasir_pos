//
// Antrean transaksi offline — simpan di IndexedDB, lalu sinkronisasi
// SATU PER SATU ke server saat internet kembali.
//
import { getAll, putOne, deleteOne, countAll, clearStore } from './db.js';
import { syncApi } from '../api/index.js';
import { refreshPelangganCache } from './catalog.js';

/** Id unik untuk transaksi offline (UUID bila tersedia). */
export function generateOfflineId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fallback di bawah */
  }
  return `off-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Simpan satu transaksi pending. */
export function savePendingSale(record) {
  return putOne('pending_sales', record);
}

/** Daftar transaksi pending (urut dari yang tertua). */
export function listPendingSales() {
  return getAll('pending_sales').then((rows) =>
    (rows || []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  );
}

/** Jumlah transaksi pending. */
export function countPendingSales() {
  return countAll('pending_sales').then((n) => Number(n) || 0);
}

/** Hapus satu transaksi pending setelah sukses disinkronkan. */
export function removePendingSale(offlineId) {
  return deleteOne('pending_sales', offlineId);
}

/** Bersihkan seluruh antrean (dipakai test/opsi admin). */
export function clearPendingSales() {
  return clearStore('pending_sales');
}

/**
 * Sinkronkan seluruh antrean secara berurutan (satu transaksi per permintaan).
 * - sukses → transaksi dihapus dari IndexedDB
 * - satu transaksi gagal (jaringan maupun permanen) → antrean BERHENTI di situ;
 *   sisanya tetap menunggu & dicoba lagi otomatis 30 detik kemudian.
 * Mengembalikan { total, synced, failed, networkError }.
 */
export async function syncPendingSales() {
  const pending = await listPendingSales();
  if (!pending.length) return { total: 0, synced: 0, failed: 0, networkError: false };

  let synced = 0;
  let failed = 0;
  let networkError = false;

  for (const record of pending) {
    try {
      const res = await syncApi.sync([{ offline_id: record.offline_id, payload: record.payload }]);
      const item = res?.data?.results?.[0];
      const success = Boolean(res?.data?.results) && Boolean(item?.success ?? true);
      if (success) {
        await removePendingSale(record.offline_id);
        synced += 1;
      } else {
        failed += 1;
        break;
      }
    } catch {
      networkError = true;
      failed += 1;
      break;
    }
  }

  // Sinkronkan ulang cache pelanggan supaya sisa hutang tidak basi
  // (transaksi hutang offline bisa mengubah hutang pelanggan di server).
  if (synced > 0) {
    await refreshPelangganCache().catch(() => {});
  }

  return { total: pending.length, synced, failed, networkError };
}