import { useCallback, useEffect, useState } from 'react';
import { bluetoothSupported, connectPrinter, writePrinterBytes, getSessionWriter, setSessionWriter, clearSessionWriter, autoConnect, getStoredBluetoothDevice } from '../utils/bluetoothPrinter.js';
import { buildEscPosReceipt } from '../utils/escpos.js';

const CONNECT_TIMEOUT = 15000;

/**
 * State + aksi printer Bluetooth.
 * - connect(): minta pairing via navigator.bluetooth.requestDevice (perlu klik user)
 * - printStruk(sale, store, pos): bangun ESC/POS + kirim. Jika koneksi sesi hilang,
 *   mencoba auto-connect otomatis ke printer yang sudah pernah dipasang (dipicu user gesture).
 * - disconnect()
 */
export function useBluetoothPrinter() {
  const [supported] = useState(bluetoothSupported());
  // Koneksi sesi lintas halaman dalam SPA (module-level) — state awal dari writer aktif.
  const [connectedName, setConnectedName] = useState(() => getSessionWriter()?.deviceName || '');
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [hasStoredDevice, setHasStoredDevice] = useState(Boolean(getStoredBluetoothDevice()));

  // Pulihkan status sesi yang masih aktif (SPA antar-route, module-level).
  useEffect(() => {
    const w = getSessionWriter();
    if (w) setConnectedName(w.deviceName);
  }, []);

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

  const disconnect = useCallback(() => {
    clearSessionWriter();
    setConnectedName('');
    setHasStoredDevice(false);
  }, []);

  /**
   * Cetak struk via Bluetooth. Prioritas:
   * 1. Koneksi sesi aktif → langsung cetak.
   * 2. Belum ada sesi → auto-connect ke printer tersimpan (requestDevice dalam
   *    user gesture; browser ingat pilihan sebelumnya).
   * Gagal → lempar error agar caller menampilkan pesan.
   */
  const printStruk = useCallback(
    async (sale, store, pos) => {
      if (!supported) throw new Error('Web Bluetooth tidak didukung browser ini');
      let writer = getSessionWriter();
      if (!writer) {
        setConnecting(true);
        try {
          writer = await autoConnect();
          setSessionWriter(writer);
          setConnectedName(writer.deviceName);
          setHasStoredDevice(true);
        } catch {
          throw new Error('Printer Bluetooth tidak terhubung — tekan "Cetak via Bluetooth" setelah memilih printer');
        } finally {
          setConnecting(false);
        }
      }
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
    connecting,
    hasStoredDevice,
    isConnected: Boolean(connectedName),
    connect,
    disconnect,
    printStruk,
  };
}

export const isBluetoothSupported = bluetoothSupported;