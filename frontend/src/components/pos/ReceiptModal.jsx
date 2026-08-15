import { Printer, FileDown } from 'lucide-react';
import { Modal, Button } from '../ui/index.jsx';
import Receipt from './Receipt.jsx';

export default function ReceiptModal({ open, onClose, sale, settings }) {
  if (!sale) return null;

  const handlePrint = () => window.print();

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
