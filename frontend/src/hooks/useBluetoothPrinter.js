import { useCallback, useEffect, useState } from 'react';
import {
  bluetoothSupported,
  connectPrinter,
  writePrinterBytes,
  getSessionWriter,
  setSessionWriter,
  clearSessionWriter,
  loadDeviceFromIDB,
  clearDeviceFromIDB,
} from '../utils/bluetoothPrinter.js';
import { buildEscPosReceipt } from '../utils/escpos.js';

const CONNECT_TIMEOUT = 15000;

/**
 * State + aksi printer Bluetooth (dengan auto-connect persisten via IndexedDB).
 * - connect(): pairing pertama via navigator.bluetooth.requestDevice (butuh klik user)
 * - autoConnect(): otomatis sambung ke printer yang tersimpan di IndexedDB — tanpa picker
 * - printStruk(sale, store, pos): bangun ESC/POS + kirim, auto-connect bila koneksi hilang
 * - disconnect()
 */
export function useBluetoothPrinter() {
  const [supported] = useState(bluetoothSupported());
  const [connectedName, setConnectedName] = useState(() => getSessionWriter()?.deviceName || '');
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [hasStoredDevice, setHasStoredDevice] = useState(false);

  // Auto-connect saat halaman dimuat: jika ada printer tersimpan di IndexedDB,
  // sambungkan diam-diam lewat gatt.connect() (tidak butuh klik/picker).
  useEffect(() => {
    if (!supported) return;
    let active = true;

    const init = async () => {
      const w = getSessionWriter();
      if (w) {
        if (active) setConnectedName(w.deviceName);
        return;
      }

      const device = await loadDeviceFromIDB();
      if (!active) return;
      if (!device) {
        setHasStoredDevice(false);
        return;
      }

      setHasStoredDevice(true);
      setConnecting(true);
      try {
        const writer = await connectPrinter(device, { timeout: CONNECT_TIMEOUT });
        if (!active) return;
        setSessionWriter(writer);
        setConnectedName(writer.deviceName);
      } catch {
        // Printer mati / tidak terjangkau → biarkan; saat cetak akan dicoba ulang.
      } finally {
        if (active) setConnecting(false);
      }
    };

    init();
    return () => { active = false; };
  }, [supported]);

  /** Hubungkan ulang dari device tersimpan di IndexedDB tanpa picker. */
  const autoConnect = useCallback(async () => {
    if (!supported) throw new Error('Web Bluetooth tidak didukung browser ini');
    // Sesi aktif → langsung pakai.
    if (getSessionWriter()) return getSessionWriter();

    const device = await loadDeviceFromIDB();
    if (!device) throw new Error('Tidak ada printer tersimpan — klik "Hubungkan Printer" sekali');

    setConnecting(true);
    try {
      const writer = await connectPrinter(device, { timeout: CONNECT_TIMEOUT });
      setSessionWriter(writer);
      setConnectedName(writer.deviceName);
      setHasStoredDevice(true);
      return writer;
    } finally {
      setConnecting(false);
    }
  }, [supported]);

  /** Pairing pertama manual (reqDevice) — hanya perlu sekali. */
  const connect = useCallback(async () => {
    if (!supported) throw new Error('Browser tidak mendukung Web Bluetooth (butuh Chrome/Edge via HTTPS)');
    setBusy(true);
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['49535343-fe7d-4ae5-8fa9-9fafd205e455', '000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2'],
      });
      const writer = await connectPrinter(device, { timeout: CONNECT_TIMEOUT });
      setSessionWriter(writer);
      setConnectedName(writer.deviceName);
      setHasStoredDevice(true);
      return writer;
    } finally {
      setBusy(false);
    }
  }, [supported]);

  const disconnect = useCallback(async () => {
    clearSessionWriter();
    clearDeviceFromIDB();
    setConnectedName('');
    setHasStoredDevice(false);
  }, []);

  /**
   * Cetak struk via Bluetooth. Prioritas:
   * 1. Sesi aktif → langsung cetak. Jika gagal (putus), reconnect + coba lagi.
   * 2. Device tersimpan di IndexedDB → auto-connect diam-diam, lalu cetak.
   * 3. Tidak ada → lempar error (user perlu pairing sekali).
   */
  const printStruk = useCallback(
    async (sale, store, pos) => {
      if (!supported) throw new Error('Web Bluetooth tidak didukung browser ini');
      const bytes = buildEscPosReceipt({ sale, store, pos });
      let writer = getSessionWriter();
      // Coba cetak dengan sesi aktif; bila gagal, reconnect lalu coba ulang sekali.
      try {
        if (writer) {
          await writePrinterBytes(writer.char, bytes);
          return true;
        }
      } catch {
        clearSessionWriter();
        writer = null;
      }
      if (!writer) {
        writer = await autoConnect();
      }
      await writePrinterBytes(writer.char, bytes);
      return true;
    },
    [supported, autoConnect]
  );

  return {
    supported,
    connectedName,
    busy,
    connecting,
    hasStoredDevice,
    isConnected: Boolean(connectedName),
    connect,
    autoConnect,
    disconnect,
    printStruk,
  };
}

export const isBluetoothSupported = bluetoothSupported;