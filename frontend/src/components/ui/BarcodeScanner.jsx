import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X as XIcon, AlertCircle, Keyboard } from 'lucide-react';
import { Button, Input } from './index.jsx';

export default function BarcodeScanner({ open, onClose, onScan }) {
  const containerId = 'barcode-scanner-container';
  const scannerRef = useRef(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('camera');
  const [manual, setManual] = useState('');

  useEffect(() => {
    if (!open || mode !== 'camera') return undefined;
    let stopped = false;
    const scanner = new Html5Qrcode(containerId, { verbose: false });
    scannerRef.current = scanner;

    Html5Qrcode.getCameras()
      .then((devices) => {
        if (stopped) return;
        if (!devices || devices.length === 0) {
          setError('Tidak ada kamera terdeteksi. Gunakan input manual.');
          setMode('manual');
          return;
        }
        const cameraId = devices.find((d) => /back|rear|environment/i.test(d.label))?.id || devices[0].id;
        return scanner.start(
          cameraId,
          { fps: 10, qrbox: { width: 260, height: 140 } },
          (decodedText) => {
            scanner.stop().catch(() => {});
            onScan(decodedText.trim());
          },
          () => {}
        );
      })
      .then(() => {
        if (stopped && scannerRef.current) {
          scannerRef.current.stop().catch(() => {});
        }
      })
      .catch((err) => {
        if (stopped) return;
        setError(err?.message || 'Gagal mengakses kamera. Periksa izin browser.');
        setMode('manual');
      });

    return () => {
      stopped = true;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [open, mode, onScan]);

  if (!open) return null;

  const submitManual = (e) => {
    e?.preventDefault();
    const code = manual.trim();
    if (!code) return;
    onScan(code);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            {mode === 'camera' ? <Camera className="h-5 w-5 text-primary-600" /> : <Keyboard className="h-5 w-5 text-primary-600" />}
            <h2 className="text-base font-semibold text-slate-900">Scan Barcode</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {mode === 'camera' ? (
          <>
            <div className="bg-slate-900 p-3">
              <div id={containerId} className="overflow-hidden rounded-lg [&_video]:w-full [&_video]:h-auto" />
            </div>
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
              <p className="mb-2 text-xs text-slate-500">Arahkan kamera ke barcode produk.</p>
              <button onClick={() => setMode('manual')} className="text-xs font-medium text-primary-600 hover:underline">
                Input manual
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submitManual} className="p-4 space-y-3">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <Input
              autoFocus
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Ketik kode barcode"
              className="font-mono tracking-wider"
            />
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setMode('camera'); setError(''); }}>Coba Kamera</Button>
              <Button type="submit" disabled={!manual.trim()}>Cari Produk</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
