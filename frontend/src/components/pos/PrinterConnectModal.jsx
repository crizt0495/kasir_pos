import { useEffect, useState } from 'react';
import { Bluetooth, BluetoothConnected, Printer } from 'lucide-react';
import { useBluetoothPrinter } from '../../hooks/useBluetoothPrinter.js';
import { getErrorMessage } from '../../api/client.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';

/**
 * Modal "Hubungkan Printer" yang dipakai bersama (Settings, POS, Penjualan).
 * Membuka dialog pairing Bluetooth peramban; hasilnya disimpan otomatis
 * sebagai printer default di IndexedDB. onConnected dipanggil setelah sukses.
 */
export default function PrinterConnectModal({ open, onClose, message, onConnected }) {
  const bluetooth = useBluetoothPrinter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const handleClose = () => {
    if (busy) return;
    setError(null);
    onClose?.();
  };

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await bluetooth.connect();
      onConnected?.();
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal terhubung ke printer. Silakan cek kembali.'));
    } finally {
      setBusy(false);
    }
  };

  const status = bluetooth.isConnected
    ? `Terhubung ke: ${bluetooth.connectedName}`
    : bluetooth.hasStoredDevice
      ? 'Printer tersimpan tersedia'
      : 'Belum ada printer terhubung';

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Hubungkan Printer"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={busy}>
            Batal
          </Button>
          <Button variant="primary" icon={Bluetooth} onClick={handleConnect} loading={busy}>
            Hubungkan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 rounded-lg border-2 border-black bg-primary-100 p-2 text-primary-600">
            <Printer className="h-5 w-5" />
          </div>
          <p className="text-sm text-slate-700">
            {message || 'Tidak ada printer tersimpan. Silakan aktifkan Bluetooth dan pilih printer thermal Anda (58mm / 80mm).'}
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-lg border-2 border-black bg-slate-50 p-3">
          {bluetooth.isConnected ? (
            <BluetoothConnected className="h-6 w-6 shrink-0 text-success-600" aria-hidden="true" />
          ) : bluetooth.connecting ? (
            <div className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600" aria-hidden="true" />
          ) : (
            <Bluetooth className={`h-6 w-6 shrink-0 ${bluetooth.supported ? 'text-slate-400' : 'text-danger-500'}`} aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">{status}</p>
            <p className="text-xs text-slate-500">
              {bluetooth.isConnected
                ? 'Printer siap digunakan untuk mencetak struk'
                : 'Printer yang dipilih akan disimpan sebagai printer default'}
            </p>
          </div>
        </div>

        {!bluetooth.supported && (
          <p className="text-xs text-danger-600">Web Bluetooth tidak didukung browser ini — butuh Chrome/Edge (desktop/Android) dengan koneksi HTTPS.</p>
        )}

        {error && <p className="text-xs font-medium text-danger-600">{error}</p>}

        {busy && !error && (
          <p className="text-xs text-slate-500">Tunggu dialog Bluetooth dari peramban untuk memilih printer Anda...</p>
        )}
      </div>
    </Modal>
  );
}