import { describe, it, expect, beforeEach } from 'vitest';
import { storeBluetoothDevice, getStoredBluetoothDevice, clearStoredBluetoothDevice } from './bluetoothPrinter.js';

const storageMock = () => {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
};

describe('bluetoothPrinter localStorage', () => {
  beforeEach(() => {
    globalThis.localStorage = storageMock();
  });

  it('storeBluetoothDevice menyimpan id & nama perangkat', () => {
    storeBluetoothDevice({ id: 'dev-1', name: 'Thermal 80' });
    expect(getStoredBluetoothDevice()).toEqual({ id: 'dev-1', name: 'Thermal 80' });
  });

  it('menggunakan nama default bila device tidak punya nama', () => {
    storeBluetoothDevice({ id: 'dev-2' });
    expect(getStoredBluetoothDevice().name).toBe('Printer Bluetooth');
  });

  it('getStoredBluetoothDevice mengembalikan null bila kosong', () => {
    expect(getStoredBluetoothDevice()).toBeNull();
  });

  it('clearStoredBluetoothDevice menghapus data', () => {
    storeBluetoothDevice({ id: 'dev-1', name: 'Thermal' });
    clearStoredBluetoothDevice();
    expect(getStoredBluetoothDevice()).toBeNull();
  });

  it('tidak crash bila device null atau localStorage error', () => {
    storeBluetoothDevice(null);
    expect(getStoredBluetoothDevice()).toBeNull();
    globalThis.localStorage = undefined;
    storeBluetoothDevice({ id: 'dev-3' });
  });
});