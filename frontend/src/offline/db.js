//
// IndexedDB wrapper ringan untuk mode offline POS Kasir.
// Tidak menggunakan dependency eksternal (cukup API bawaan browser).
//
// Database: pos_offline_db
//   - products       (keyPath id)       → katalog produk untuk grid/cari offline
//   - categories     (keyPath id)       → kategori (filter offline)
//   - customers      (keyPath id)       → daftar pelanggan utk pemilih pelanggan offline
//   - pending_sales  (keyPath offline_id) → antrian transaksi yang disimpan offline
//   - meta           (key key)          → nilai tambahan ({ key, value })
//

const DB_NAME = 'pos_offline_db';
const DB_VERSION = 1;

const STORES = ['products', 'categories', 'customers', 'pending_sales', 'meta'];

let dbPromise = null;

export function openOfflineDB() {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: name === 'meta' ? 'key' : (name === 'pending_sales' ? 'offline_id' : 'id') });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function withStore(name, mode, fn) {
  return openOfflineDB().then((db) => {
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(name, mode);
        const store = tx.objectStore(name);
        const request = fn(store);
        if (request && typeof request === 'object' && typeof request.onsuccess !== 'undefined') {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        } else {
          tx.oncomplete = () => resolve(mode === 'readwrite' ? request : undefined);
          tx.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        }
      } catch {
        resolve(null);
      }
    });
  });
}

/** Simpan banyak baris sekaligus ke satu object store (mode readwrite). */
export function putAll(name, rows) {
  if (!Array.isArray(rows) || !rows.length) return Promise.resolve(0);
  return withStore(name, 'readwrite', (store) => {
    for (const row of rows) store.put(row);
    return rows.length;
  });
}

/** Ambil semua baris sebuah object store. */
export function getAll(name) {
  return withStore(name, 'readonly', (store) => store.getAll());
}

/** Simpan satu baris. */
export function putOne(name, row) {
  return withStore(name, 'readwrite', (store) => store.put(row));
}

/** Hapus satu baris berdasarkan key. */
export function deleteOne(name, key) {
  return withStore(name, 'readwrite', (store) => store.delete(key));
}

/** Jumlah baris sebuah object store. */
export function countAll(name) {
  return withStore(name, 'readonly', (store) => store.count());
}

/** Baca nilai meta ({ key, value }) → kembalikan value (atau null). */
export function getMeta(key) {
  return getAll('meta').then((rows) => {
    const hit = Array.isArray(rows) ? rows.find((r) => r?.key === key) : null;
    return hit ? hit.value : null;
  });
}

/** Simpan nilai meta. */
export function setMeta(key, value) {
  return putOne('meta', { key, value });
}

/** Hapus seluruh isi sebuah object store (misal saat reseed katalog). */
export function clearStore(name) {
  return withStore(name, 'readwrite', (store) => store.clear());
}