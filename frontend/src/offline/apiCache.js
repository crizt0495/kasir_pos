import { openOfflineDB, putOne, getOne, deleteOne, getAll } from './db.js';

//
// Snapshot respons API — agar halaman (selain POS) tetap bisa dibaca saat
// offline. Setiap GET sukses yang lewat interceptor (client.js) disalin ke
// IndexedDB (store `api_cache`); saat jaringan mati/503, data "terakhir yang
// diketahui" dikembalikan sehingga halaman tidak render ErrorState kosong.
// Hanya respons GET berformat JSON yang di-snapshot; mutasi & unduhan
// (blob CSV/XLSX/PDF) serta /auth/me tidak ikut dicache.
//
// Fallback memori dipakai bila IndexedDB tak tersedia (mis. lingkungan test).
//

const STORE = 'api_cache';
const MAX_ENTRIES = 200;

// ---- Backend penyimpanan: IndexedDB (produksi) / Map (test/SSR) ----
const useMemory = typeof indexedDB === 'undefined';
const memoryStore = new Map();

async function storeDb() {
  if (useMemory) return null;
  try {
    return await openOfflineDB();
  } catch {
    return null;
  }
}

/** Apakah respons ini layak di-snapshot (GET JSON biasa). */
export function isCacheableConfig(config) {
  if (!config) return false;
  if (String(config.method || 'get').toLowerCase() !== 'get') return false;
  if (config.responseType && config.responseType !== 'json') return false;
  const url = String(config.url || '');
  if (url.includes('/auth/me')) return false;
  return true;
}

/** Kunci unik per permintaan (baseURL + url + params serasi). */
export function buildCacheKey(config) {
  const base = config.baseURL || '';
  const url = config.url || '';
  const params = stableSerialize(config.params);
  return `${base}|${url}?${params}`;
}

/**
 * Kunci "keluarga" endpoint (hanya base + url, tanpa params). Dipakai sebagai
 * fallback agar halaman dengan params dinamis (tanggal, halaman, pencarian)
 * tetap mendapat snapshot terakhir saat offline.
 */
export function buildFamilyKey(config) {
  const base = config.baseURL || '';
  const url = config.url || '';
  return `${base}|${url}?`;
}

function stableSerialize(params) {
  if (!params) return '';
  try {
    const keys = Object.keys(params).sort();
    return keys.map((k) => `${k}=${JSON.stringify(params[k])}`).join('&');
  } catch {
    return JSON.stringify(params);
  }
}

/** Simpan snapshot respons (fire-and-forget dari interceptor). */
export async function saveApiCache(config, data, status = 200) {
  if (!isCacheableConfig(config)) return;
  const now = Date.now();
  const row = { id: buildCacheKey(config), data, status, savedAt: now };
  const familyRow = { id: buildFamilyKey(config), data, status, savedAt: now };
  if (useMemory) {
    memoryStore.set(row.id, row);
    memoryStore.set(familyRow.id, familyRow);
    pruneMemory();
    return;
  }
  const db = await storeDb();
  if (!db) return;
  try {
    await putOne(STORE, row);
    await putOne(STORE, familyRow);
    await pruneIfNeeded();
  } catch {
    /* snapshot gagal → jangan mengganggu aliran normal */
  }
}

/** Ambil snapshot untuk sebuah permintaan (null bila belum ada). */
export async function loadApiCache(config) {
  if (!isCacheableConfig(config)) return null;
  const exactKey = buildCacheKey(config);
  const familyKey = buildFamilyKey(config);
  if (useMemory) {
    const row =
      memoryStore.get(exactKey) || memoryStore.get(familyKey) || null;
    return row && typeof row.data !== 'undefined' ? row : null;
  }
  const db = await storeDb();
  if (!db) return null;
  try {
    const row =
      (await getOne(STORE, exactKey)) || (await getOne(STORE, familyKey));
    if (!row || typeof row.data === 'undefined') return null;
    return row;
  } catch {
    return null;
  }
}

/** Hapus seluruh snapshot (dipanggil saat logout / sesi dihapus). */
export async function clearApiCache() {
  if (useMemory) {
    memoryStore.clear();
    return;
  }
  const db = await storeDb();
  if (!db) return;
  try {
    const rows = (await getAll(STORE)) || [];
    for (const row of rows) await deleteOne(STORE, row.id);
  } catch {
    /* abaikan */
  }
}

/** Jaga agar cache tidak membengkak: buang entri terlama di atas MAX_ENTRIES. */
async function pruneIfNeeded() {
  try {
    const rows = (await getAll(STORE)) || [];
    if (rows.length <= MAX_ENTRIES) return;
    rows.sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
    const excess = rows.slice(0, rows.length - MAX_ENTRIES);
    for (const row of excess) await deleteOne(STORE, row.id);
  } catch {
    /* abaikan */
  }
}

function pruneMemory() {
  if (memoryStore.size <= MAX_ENTRIES) return;
  const rows = [...memoryStore.values()].sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
  const excess = rows.slice(0, rows.length - MAX_ENTRIES);
  for (const row of excess) memoryStore.delete(row.id);
}