import { useCallback, useState } from 'react';
import { bluetoothSupported, connectPrinter, writePrinterBytes, getSessionWriter, setSessionWriter, clearSessionWriter } from '../utils/bluetoothPrinter.js';
import { buildEscPosReceipt } from '../utils/escpos.js';

const CONNECT_TIMEOUT = 15000;

/**
 * State + aksi printer Bluetooth.
 * - connect(): minta pairing via navigator.bluetooth.requestDevice (perlu klik user)
 * - printStruk(sale, store, pos): bangun ESC/POS + kirim (pakai koneksi sesi aktif)
 * - disconnect()
 */
export function useBluetoothPrinter() {
  const [supported] = useState(bluetoothSupported());
  // Koneksi sesi lintas halaman dalam SPA (module-level) — state awal dari writer aktif.
  const [connectedName, setConnectedName] = useState(() => getSessionWriter()?.deviceName || '');
  const [busy, setBusy] = useState(false);

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
      return writer;
    } finally {
      setBusy(false);
    }
  }, [supported]);

  const disconnect = useCallback(() => {
    clearSessionWriter();
    setConnectedName('');
  }, []);

  /**
   * Cetak struk via Bluetooth. Jika belum ada koneksi sesi, lempar error
   * agar caller bisa fallback ke window.print() atau minta user menghubungkan.
   */
  const printStruk = useCallback(
    async (sale, store, pos) => {
      if (!supported) throw new Error('Web Bluetooth tidak didukung browser ini');
      const writer = getSessionWriter();
      if (!writer) throw new Error('Printer belum dipasangkan — klik "Hubungkan Printer"');
      const bytes = buildEscPosReceipt({ sale, store, pos });
      await writePrinterBytes(writer.char, bytes);
      return true;
    },
    [supported]
  );

  return {
    supported,
    connectedName,
    busy,
    isConnected: Boolean(connectedName),
    connect,
    disconnect,
    printStruk,
  };
}

export const isBluetoothSupported = bluetoothSupported;