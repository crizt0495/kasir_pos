import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Camera, X as XIcon, AlertCircle, Keyboard, RefreshCw } from 'lucide-react';
import { Button, Input } from './index.jsx';

const SCANNER_ID = 'barcode-scanner-container';
const LAST_RESULT_DEBOUNCE_MS = 1200;
const MAX_SCAN_ATTEMPTS = 3;
const RETRY_DELAY_MS = 800;
const SCAN_DELAY_MS = 400;

export default function BarcodeScanner({ open, onClose, onScan }) {
  const [mode, setMode] = useState('camera');
  const [manual, setManual] = useState('');
  const [engine, setEngine] = useState('zxing');
  const [status, setStatus] = useState('initializing');
  const [statusMsg, setStatusMsg] = useState('Memuat kamera...');
  const [lastScanned, setLastScanned] = useState('');
  const [attempts, setAttempts] = useState(0);

  const onScanRef = useRef(onScan);
  const lastResultRef = useRef({ text: '', at: 0 });
  const scanAttemptsRef = useRef(0);
  const html5Ref = useRef(null);
  const zxingReaderRef = useRef(null);
  const zxingControlsRef = useRef(null);
  const videoRef = useRef(null);
  const startedRef = useRef(false);

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  const stopAll = () => {
    startedRef.current = false;
    if (html5Ref.current) {
      try { html5Ref.current.stop().catch(() => {}); } catch (_) {}
      html5Ref.current = null;
    }
    if (zxingControlsRef.current) {
      try { zxingControlsRef.current.stop(); } catch (_) {}
      zxingControlsRef.current = null;
    }
    if (zxingReaderRef.current) { zxingReaderRef.current = null; }
    if (videoRef.current) {
      try { videoRef.current.srcObject?.getTracks().forEach((t) => t.stop()); } catch (_) {}
      videoRef.current = null;
    }
  };

  const onSuccess = (text) => {
    const value = String(text || '').trim();
    if (!value) return;
    const now = Date.now();
    if (value === lastResultRef.current.text && now - lastResultRef.current.at < LAST_RESULT_DEBOUNCE_MS) return;
    lastResultRef.current = { text: value, at: now };
    setLastScanned(value);
    stopAll();
    setStatus('scanned');
    setStatusMsg(`Terdeteksi: ${value}`);
    onScanRef.current(value);
  };

  const onError = (err) => {
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('no multi') || msg.includes('no barcode')) return;
    scanAttemptsRef.current += 1;
    if (scanAttemptsRef.current < MAX_SCAN_ATTEMPTS) {
      setTimeout(() => setAttempts((a) => a + 1), RETRY_DELAY_MS);
    }
  };

  const startHtml5 = (cameraId) => {
    if (html5Ref.current) return;
    const scanner = new Html5Qrcode(SCANNER_ID, { verbose: false });
    html5Ref.current = scanner;
    scanner.start(
      cameraId,
      { fps: 15, qrbox: { width: 280, height: 160 }, aspectRatio: 1.777778 },
      onSuccess,
      onError,
    ).catch((err) => {
      if (html5Ref.current !== scanner) return;
      html5Ref.current = null;
      if (/permission|denied|notallowed/i.test(err?.message || '')) {
        setStatus('error');
        setStatusMsg('Izin kamera ditolak. Aktifkan izin di pengaturan browser.');
        setMode('manual');
      } else {
        setEngine('zxing');
      }
    });
  };

  const startZxing = async (cameraId) => {
    if (zxingReaderRef.current) return;
    const reader = new BrowserMultiFormatReader();
    zxingReaderRef.current = reader;

    await new Promise((res) => setTimeout(res, SCAN_DELAY_MS));

    const vid = document.getElementById(SCANNER_ID);
    if (!vid) return;

    try {
      const hints = new Map();
      reader.decodeFromVideoDevice(cameraId, vid, (result, err) => {
        if (result) onSuccess(result.getText());
        else if (err) onError(err);
      }).then((controls) => {
        zxingControlsRef.current = controls;
      }).catch((err) => {
        if (zxingReaderRef.current !== reader) return;
        zxingReaderRef.current = null;
        if (/permission|denied|notallowed/i.test(err?.message || '')) {
          setStatus('error');
          setStatusMsg('Izin kamera ditolak. Aktifkan izin di pengaturan browser.');
          setMode('manual');
        } else {
          setEngine('html5');
        }
      });
    } catch (err) {
      if (zxingReaderRef.current !== reader) return;
      zxingReaderRef.current = null;
      setEngine('html5');
    }
  };

  const startCamera = async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStatus('initializing');
    setStatusMsg('Memuat kamera...');
    scanAttemptsRef.current = 0;

    try {
      const devices = await Html5Qrcode.getCameras();
      if (!startedRef.current) return;
      if (!devices || devices.length === 0) {
        setStatus('error');
        setStatusMsg('Tidak ada kamera terdeteksi.');
        setMode('manual');
        return;
      }
      const cameraId = devices.find((d) => /back|rear|environment/i.test(d.label))?.id || devices[0].id;
      setStatus('scanning');
      setStatusMsg('Arahkan barcode ke kamera...');

      if (engine === 'html5') {
        startHtml5(cameraId);
      } else {
        await startZxing(cameraId);
      }
    } catch (err) {
      if (!startedRef.current) return;
      if (/permission|denied|notallowed/i.test(err?.message || '')) {
        setStatus('error');
        setStatusMsg('Izin kamera ditolak. Aktifkan izin di pengaturan browser.');
        setMode('manual');
      } else {
        setEngine('html5');
      }
    }
  };

  useEffect(() => {
    if (!open || mode !== 'camera') return undefined;
    startCamera();
    return () => { stopAll(); };
  }, [open, mode, engine, attempts]);

  const handleClose = () => {
    stopAll();
    onClose();
  };

  const handleSwitchEngine = () => {
    stopAll();
    setEngine((e) => (e === 'zxing' ? 'html5' : 'zxing'));
    setStatus('initializing');
  };

  const handleRetryCamera = () => {
    stopAll();
    setMode('camera');
    setEngine('zxing');
    setAttempts((a) => a + 1);
    scanAttemptsRef.current = 0;
  };

  if (!open) return null;

  const submitManual = (e) => {
    e?.preventDefault();
    const code = manual.trim();
    if (!code) return;
    onScan(code);
  };

  const statusColor = {
    initializing: 'text-slate-400',
    scanning: 'text-emerald-500',
    scanned: 'text-primary-500',
    error: 'text-amber-600',
  }[status] || 'text-slate-400';

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
              <div
                id={SCANNER_ID}
                className="relative overflow-hidden rounded-lg [&_video]:w-full [&_video]:h-auto"
                style={{ minHeight: 200 }}
              >
                {status === 'initializing' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800 text-white">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <p className="mt-3 text-sm text-white/80">{statusMsg}</p>
                  </div>
                )}
                {status === 'error' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800 text-white text-center p-4">
                    <AlertCircle className="h-8 w-8 text-amber-400 mb-2" />
                    <p className="text-sm text-white/80">{statusMsg}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">{statusMsg}</p>
                <div className="flex items-center gap-2">
                  <button onClick={handleSwitchEngine} title="Ganti engine scanner" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors">
                    <RefreshCw className="h-3 w-3" /> {engine === 'zxing' ? 'zxing' : 'html5'}
                  </button>
                  <button onClick={() => setMode('manual')} className="text-xs font-medium text-primary-600 hover:underline">
                    Input manual
                  </button>
                </div>
              </div>
              {lastScanned && (
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono ${statusColor}`}>✓ {lastScanned}</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <form onSubmit={submitManual} className="p-4 space-y-3">
            {status === 'error' && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{statusMsg}</span>
              </div>
            )}
            <Input
              autoFocus
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Ketik atau scan barcode"
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
