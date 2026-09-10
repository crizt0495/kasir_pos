import { Printer, Bluetooth, FileDown } from 'lucide-react';
import { Modal, Button } from '../ui/index.jsx';
import Receipt from './Receipt.jsx';
import { useBluetoothPrinter } from '../../hooks/useBluetoothPrinter.js';
import { toast } from '../../stores/uiStore.js';
import { getErrorMessage } from '../../api/client.js';

export default function ReceiptModal({ open, onClose, sale, settings }) {
  const bluetooth = useBluetoothPrinter();
  if (!sale) return null;

  const handlePrint = () => window.print();

  const handleBluetoothPrint = async () => {
    try {
      if (!bluetooth.isConnected) await bluetooth.connect();
      await bluetooth.printStruk(sale, settings?.store, settings?.pos);
      toast.success('Struk berhasil dikirim ke printer Bluetooth');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Gagal cetak via Bluetooth'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Struk Transaksi"
      footer={
        <>
          <Button variant="secondary" icon={FileDown} onClick={handlePrint}>
            Simpan PDF
          </Button>
          <Button variant="outline" icon={Bluetooth} disabled={!bluetooth.supported} onClick={handleBluetoothPrint}>
            Cetak via Bluetooth
          </Button>
          <Button icon={Printer} onClick={handlePrint}>
            Cetak Struk
          </Button>
        </>
      }
    >
      <Receipt sale={sale} store={settings?.store} pos={settings?.pos} />
      <p className="mt-3 text-center text-xs text-slate-400">
        Untuk menyimpan PDF, pilih "Simpan sebagai PDF" pada dialog cetak browser.
      </p>
    </Modal>
  );
}