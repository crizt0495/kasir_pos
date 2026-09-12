import { describe, it, expect } from 'vitest';
import { storeDeviceInIDB, loadDeviceFromIDB, clearDeviceFromIDB } from './bluetoothPrinter.js';

describe('bluetoothPrinter IndexedDB', () => {
  it('tidak crash bila indexedDB tidak tersedia (try/catch)', async () => {
    globalThis.indexedDB = undefined;
    await expect(storeDeviceInIDB({ id: 'dev-1', name: 'Thermal 80' })).resolves.toBeUndefined();
    await expect(loadDeviceFromIDB()).resolves.toBeNull();
    await expect(clearDeviceFromIDB()).resolves.toBeUndefined();
  });

  it('tidak crash bila indexedDB.open mengembalikan request gagal', async () => {
    globalThis.indexedDB = {
      open: () => {
        const req = { result: null, error: new Error('gagal') };
        queueMicrotask(() => { if (req.onerror) req.onerror(); });
        return req;
      },
    };
    await expect(storeDeviceInIDB({ id: 'dev-1' })).resolves.toBeUndefined();
    await expect(loadDeviceFromIDB()).resolves.toBeNull();
  });
});