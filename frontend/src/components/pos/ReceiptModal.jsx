import { Modal } from '../ui/index.jsx';
import Receipt from './Receipt.jsx';

export default function ReceiptModal({ open, onClose, sale, settings }) {
  if (!sale) return null;

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Struk Transaksi">
      <Receipt sale={sale} store={settings?.store} pos={settings?.pos} />
    </Modal>
  );
}