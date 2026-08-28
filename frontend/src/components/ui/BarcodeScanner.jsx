import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Camera, X as XIcon, AlertCircle, Keyboard, RefreshCw } from 'lucide-react';
import { Button, Input } from './index.jsx';

const containerId = 'barcode-scanner-container';
const LAST_RESULT_DEBOUNCE_MS = 1500;
const ENGINE_SWITCH_DELAY_MS = 2500;

export default function BarcodeScanner({ open, onClose, onScan }) {
  const [error, setError] = useState('');
  const [mode, setMode] = useState('camera');
  const [manual, setManual] = useState('');
  const [engine, setEngine] = useState('html5');
  const [retries, setRetries] = useState(0);
  const lastResultRef = useRef({ text: '', at: 0 });
  const html5Ref = useRef(null);
  const zxingRef = useRef(null);
  const zxingControlsRef = useRef(null);
  const lastTextRef = useRef('');

  const handleDecoded = (text) => {
    const value = String(text || '').trim();
    if (!value) return;
    const now = Date.now();
    if (value === lastResultRef.current.text && now - lastResultRef.current.at < LAST_RESULT_DEBOUNCE_MS) {
      return;
    }
    lastResultRef.current = { text: value, at: now };
    lastTextRef.current = value;
    stopAll();
    onScan(value);
  };

  const stopAll = () => {
    if (html5Ref.current) {
      try { html5Ref.current.stop().catch(() => {}); } catch (_) {}
      html5Ref.current = null;
    }
    if (zxingControlsRef.current) {
      try { zxingControlsRef.current.stop(); } catch (_) {}
      zxingControlsRef.current = null;
    }
    zxingRef.current = null;
  };

  const startHtml5 = (devices) => {
    if (!devices || devices.length === 0) {
      setError('Tidak ada kamera terdeteksi. Gunakan input manual.');
      setMode('manual');
      return;
    }
    const cameraId = devices.find((d) => /back|rear|environment/i.test(d.label))?.id || devices[0].id;
    const scanner = new Html5Qrcode(containerId, { verbose: false });
    html5Ref.current = scanner;
    scanner.start(
      cameraId,
      { fps: 10, qrbox: { width: 260, height: 140 } },
      (decodedText) => handleDecoded(decodedText),
      () => {}
    ).catch((err) => {
      if (html5Ref.current === scanner) {
        html5Ref.current = null;
        setError(err?.message || 'Gagal memulai kamera. Periksa izin browser.');
        setMode('manual');
      }
    });
  };

  const startZxing = (devices) => {
    if (!devices || devices.length === 0) {
      setError('Tidak ada kamera terdeteksi. Gunakan input manual.');
      setMode('manual');
      return;
    }
    const cameraId = devices.find((d) => /back|rear|environment/i.test(d.label))?.id || devices[0].id;
    const reader = new BrowserMultiFormatReader();
    zxingRef.current = reader;
    reader.decodeFromVideoDevice(cameraId, containerId, (result, err, controls) => {
      if (controls && !zxingControlsRef.current) zxingControlsRef.current = controls;
      if (result) handleDecoded(result.getText());
    }).catch((err) => {
      if (zxingRef.current === reader) {
        zxingRef.current = null;
        setError(err?.message || 'Gagal memulai kamera. Periksa izin browser.');
        setMode('manual');
      }
    });
  };

  useEffect(() => {
    if (!open || mode !== 'camera') return undefined;
    let cancelled = false;

    if (engine === 'html5') {
      Html5Qrcode.getCameras()
        .then((devices) => { if (!cancelled) startHtml5(devices); })
        .catch((err) => {
          if (cancelled) return;
          if (/permission|denied|notallowed/i.test(err?.message || '')) {
            setError('Izin kamera ditolak. Aktifkan izin atau gunakan input manual.');
            setMode('manual');
          } else {
            setTimeout(() => { if (!cancelled) setEngine('zxing'); }, ENGINE_SWITCH_DELAY_MS);
          }
        });
    } else {
      const fallback = async () => {
        try {
          const devices = await BrowserMultiFormatReader.listVideoInputDevices();
          if (cancelled) return;
          startZxing(devices);
        } catch (err) {
          if (cancelled) return;
          setError(err?.message || 'Gagal mengakses kamera. Periksa izin browser.');
          setMode('manual');
        }
      };
      fallback();
    }

    return () => {
      cancelled = true;
      stopAll();
    };
  }, [open, mode, engine, retries]);

  const handleClose = () => {
    stopAll();
    onClose();
  };

  const handleSwitchEngine = () => {
    stopAll();
    setEngine((e) => (e === 'html5' ? 'zxing' : 'html5'));
    setError('');
  };

  const handleRetryCamera = () => {
    setError('');
    setMode('camera');
    setEngine('html5');
    setRetries((n) => n + 1);
  };

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
          <button onClick={handleClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {mode === 'camera' ? (
          <>
            <div className="bg-slate-900 p-3">
              <div id={containerId} className="overflow-hidden rounded-lg [&_video]:w-full [&_video]:h-auto" />
            </div>
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
              <p className="mb-2 text-xs text-slate-500">
                Arahkan kamera ke barcode produk. Mendukung QR, EAN, UPC, Code 128/39, dan lain-lain.
              </p>
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => setMode('manual')} className="text-xs font-medium text-primary-600 hover:underline">
                  Input manual
                </button>
                <button onClick={handleSwitchEngine} title={`Engine aktif: ${engine === 'html5' ? 'html5-qrcode' : 'zxing'}`} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
                  <RefreshCw className="h-3 w-3" /> {engine === 'html5' ? 'html5' : 'zxing'}
                </button>
              </div>
              {lastTextRef.current && (
                <p className="mt-1 truncate text-[11px] text-slate-400">Terakhir: {lastTextRef.current}</p>
              )}
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
              <Button type="button" variant="outline" onClick={handleRetryCamera}>Coba Kamera</Button>
              <Button type="submit" disabled={!manual.trim()}>Cari Produk</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
