import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import PrinterConnectModal from '../components/pos/PrinterConnectModal.jsx';

export const DEFAULT_CONNECT_CONFIG = {
  title: 'Printer Tidak Terhubung',
  message: 'Gagal mencetak struk. Silakan aktifkan Bluetooth dan pilih printer thermal Anda.',
  connectLabel: 'Hubungkan & Cetak Ulang',
};

const PrinterConnectContext = createContext(null);

export function PrinterConnectProvider({ children }) {
  const [state, setState] = useState({ open: false });

  const openConnectModal = useCallback((config = {}) => {
    setState({ open: true, ...config });
  }, []);

  const closeModal = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  const value = useMemo(() => ({ openConnectModal }), [openConnectModal]);

  return (
    <PrinterConnectContext.Provider value={value}>
      {children}
      <PrinterConnectModal
        open={state.open}
        title={state.title}
        message={state.message}
        connectLabel={state.connectLabel}
        onClose={() => {
          const onClose = state.onClose;
          closeModal();
          onClose?.();
        }}
        onConnected={() => {
          const onConnected = state.onConnected;
          closeModal();
          onConnected?.();
        }}
      />
    </PrinterConnectContext.Provider>
  );
}

export function usePrinterConnect() {
  const ctx = useContext(PrinterConnectContext);
  if (!ctx) {
    throw new Error('usePrinterConnect harus dipakai di dalam <PrinterConnectProvider>');
  }
  return ctx;
}