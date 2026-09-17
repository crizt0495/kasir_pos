import { useState } from 'react';
import { X, Search, Banknote, Wallet, WifiOff, Check } from 'lucide-react';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';

const ONBOARDING_KEY = 'pos_has_seen_onboarding';

const STEPS = [
  {
    icon: Search,
    title: 'Cara Mencatat Penjualan',
    body: 'Klik foto produk untuk menambah ke keranjang, atau ketik nama / scan barcode lalu tekan Enter. Yuk, coba yang gampang dulu!',
  },
  {
    icon: Banknote,
    title: 'Bayar Cepat',
    body: 'Setelah selesai, tekan tombol hijau BAYAR LUNAS (F4) untuk pelanggan bayar penuh, atau tombol kuning SIMPAN JADI HUTANG (F8) setelah memilih pelanggan.',
  },
  {
    icon: WifiOff,
    title: 'Tetap Jalan Walau Internet Mati',
    body: 'Jangan panik kalau internet bermasalah. Transaksi disimpan di perangkat dan dikirim otomatis begitu internet kembali. Keranjang juga tidak hilang saat ketutup.',
  },
];

export function hasSeenOnboarding() {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return true;
  }
}

export function markOnboardingSeen() {
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {}
}

export default function OnboardingModal({ open, onClose }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const StepIcon = STEPS[step].icon;

  const finish = () => {
    markOnboardingSeen();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={finish}
      title="Selamat Datang 👋 Mengenal Kasir"
      size="md"
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full transition-colors ${i === step ? 'bg-primary-600' : 'bg-slate-300'}`}
                aria-hidden="true"
              />
            ))}
          </div>
          <div className="flex gap-2">
            {!isLast && (
              <Button variant="secondary" onClick={onClose}>
                Lewati
              </Button>
            )}
            {isLast ? (
              <Button onClick={finish}>
                <Check className="h-4 w-4" />
                Selesai, Mulai!
              </Button>
            ) : (
              <Button onClick={() => setStep((s) => s + 1)}>Lanjut</Button>
            )}
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr]">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 text-white shadow-md shadow-primary-500/25">
          <StepIcon className="h-8 w-8" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">{STEPS[step].title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{STEPS[step].body}</p>
        </div>
      </div>
    </Modal>
  );
}