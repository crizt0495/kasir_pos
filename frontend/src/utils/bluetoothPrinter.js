// ============================================================
// Printer Bluetooth Thermal — wrapper Web Bluetooth API.
// Mendukung printer ESC/POS dengan GATT service/characteristic
// yang bisa di-write (write / writeWithoutResponse).
// ============================================================

const MAX_CHUNK = 180; // BLE chunk lebih kecil agar aman (MTU umum 512-20 byte)
const CHUNK_DELAY = 40; // ms antar chunk (beberapa printer butuh gap)

// UUID umum printer thermal BLE (HM-10 / CC2541, nikone, dsb.)
const KNOWN_SERVICE_UUIDS = [
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // HM-10 / CC2541 service
];

const WRITE_PROPS = ['write', 'writeWithoutResponse'];

/** Browser mendukung Web Bluetooth? */
export function bluetoothSupported() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

function isWriteableChar(char) {
  const props = char.properties || {};
  return WRITE_PROPS.some((p) => props[p] === true);
}

function preferredChar(chars) {
  for (const c of chars) {
    if (isWriteableChar(c)) return c;
  }
  return null;
}

/**
 * Cari characteristic yang bisa di-write dari list service printer.
 * Service disepakati: gunakan service utuh → characteristics.
 */
async function findWriteChar(server) {
  const services = await server.getPrimaryServices();
  for (const service of services) {
    // Prioritaskan service yang uuid-nya dikenal printer thermal
    const known = KNOWN_SERVICE_UUIDS.includes(service.uuid.toLowerCase());
    const chars = await service.getCharacteristics().catch(() => []);
    if (known) {
      const target = preferredChar(chars);
      if (target) return { service, char: target };
    }
  }
  // Fallback: cek semua service lain
  for (const service of services) {
    const chars = await service.getCharacteristics().catch(() => []);
    const target = preferredChar(chars);
    if (target) return { service, char: target };
  }
  return null;
}

/**
 * Hubungkan ke perangkat dan cari characteristic ESC/POS yang writable.
 * device: BluetoothDevice dari navigator.bluetooth.requestDevice()
 * @returns {{ char: BluetoothRemoteGATTCharacteristic, deviceName: string }}
 */
export async function connectPrinter(device, { timeout } = {}) {
  if (!device) throw new Error('Perangkat tidak dipilih');
  let server;
  if (device.gatt?.connected) {
    server = await device.gatt.connect();
  } else {
    const timer = timeout
      ? new Promise((_, rej) => setTimeout(() => rej(new Error('Koneksi Bluetooth timeout')), timeout))
      : null;
    server = await Promise.race([device.gatt.connect(), timer]);
    if (timer) clearTimeout(timer);
  }
  try {
    const found = await findWriteChar(server);
    if (!found) {
      await device.gatt.disconnect().catch(() => {});
      throw new Error(`Perangkat "${device.name || 'Bluetooth'}" tidak memiliki karakteristik cetak`);
    }
    storeDeviceInIDB(device);
    return { char: found.char, deviceName: device.name || 'Printer Bluetooth' };
  } catch (err) {
    try { await device.gatt.disconnect(); } catch { /* bo */ }
    throw err;
  }
}

/** Kirim Uint8Array ESC/POS ke karakteristik printer. */
export async function writePrinterBytes(char, bytes) {
  if (!char) throw new Error('Printer belum terhubung');
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const useWithoutResponse = char.properties?.writeWithoutResponse === true;
  for (let i = 0; i < data.length; i += MAX_CHUNK) {
    const chunk = data.subarray(i, i + MAX_CHUNK);
    if (useWithoutResponse) {
      await char.writeValueWithoutResponse(chunk);
    } else {
      await char.writeValue(chunk);
    }
    if (i + MAX_CHUNK < data.length) {
      // QoS minim: beberapa printer menggugurkan data bila chunk terlalu cepat
      await new Promise((r) => setTimeout(r, CHUNK_DELAY));
    }
  }
}

// ===================== IndexedDB Device Storage =====================

const IDB_NAME = 'bt_printer_db';
const IDB_VERSION = 1;
const STORE_NAME = 'device';

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

/**
 * Simpan objek BluetoothDevice di IndexedDB (bisa di-reconnect tanpa picker).
 * @param {BluetoothDevice} device
 */
export async function storeDeviceInIDB(device) {
  try {
    const db = await openIDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(device, 'current');
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB tidak tersedia — tetap gunakan koneksi sesi aktif
  }
}

/**
 * Ambil BluetoothDevice dari IndexedDB untuk auto-reconnect.
 * @returns {BluetoothDevice|null}
 */
export async function loadDeviceFromIDB() {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get('current');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Hapus device dari IndexedDB (saat putuskan/printer diganti). */
export async function clearDeviceFromIDB() {
  try {
    const db = await openIDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch {
    // ignore
  }
}

// ===================== Session Writer =====================

/**
 * Simpan "writer" (device + char handle) di memori sesi untuk dipakai
 * auto-print tanpa perlu requestDevice ulang.
 */
let sessionWriter = null;

export function getSessionWriter() {
  return sessionWriter;
}

export function setSessionWriter(w) {
  sessionWriter = w;
}

export function clearSessionWriter() {
  sessionWriter = null;
}