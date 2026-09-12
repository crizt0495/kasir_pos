import { useEffect, useMemo, useState } from 'react';
import { Save, Store, Settings as SettingsIcon, Receipt, Bluetooth, BluetoothConnected, Printer, Percent, Boxes, UserCog, AlertTriangle, Bell } from 'lucide-react';
import { settingsApi, notificationsApi } from '../api/index.js';
import { subscribePush } from '../components/layout/NotificationsBell';
import { useApi } from '../hooks/useApi.js';
import { useBluetoothPrinter } from '../hooks/useBluetoothPrinter.js';
import { settingsSchema } from '../schemas/index.js';
import { validateSchema } from '../utils/validation.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Button } from '../components/ui/Button.jsx';
import { Tabs } from '../components/ui/DataTable.jsx';
import { Field, Input, Select, Checkbox } from '../components/ui/Form.jsx';
import { Card } from '../components/ui/DataTable.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';

const TABS = [
  { key: 'store', label: 'Toko' },
  { key: 'pos', label: 'POS & Struk' },
  { key: 'printer', label: 'Printer' },
  { key: 'tax', label: 'Pajak' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'session', label: 'User & Sesi' },
  { key: 'notification', label: 'Notifikasi' },
];

export default function Settings() {
  const [tab, setTab] = useState('store');
  const settings = useApi(() => settingsApi.get().then((r) => r.data), []);
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [pushStatus, setPushStatus] = useState(null); // null | 'subscribed' | 'denied' | 'vapid-missing'
  const bluetooth = useBluetoothPrinter();

  const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

  const checkPushStatus = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) { setPushStatus('vapid-missing'); return; }
      if (!VAPID_PUBLIC_KEY) { setPushStatus('vapid-missing'); return; }
      if (Notification.permission === 'denied') { setPushStatus('denied'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setPushStatus(sub ? 'subscribed' : 'none');
    } catch {
      setPushStatus('vapid-missing');
    }
  };

  useEffect(() => { checkPushStatus(); }, []);

  const s = settings.data || {};

  const [form, setForm] = useState(null);

  // Inisialisasi form dari data settings dengan default agar section
  // yang belum tersimpan di DB tidak membuat form selalu invalid
  if (!form && !settings.loading) {
    setForm({
      store: { name: '', phone: '', address: '', logo_url: '', npwp: '', ...(s.store || {}) },
      pos: {
        default_payment_method: 'CASH',
        receipt_width: '58mm',
        auto_print_receipt: s.pos?.print_method === 'bluetooth' ? true : false,
        print_method: 'browser',
        ...(s.pos || {}),
        auto_print_receipt: s.pos?.print_method === 'bluetooth' ? true : (s.pos?.auto_print_receipt ?? false),
      },
      tax: { enabled: false, percentage: 0, ...(s.tax || {}) },
      inventory: { allow_negative_stock: false, low_stock_threshold: 0, ...(s.inventory || {}) },
      user_session: { session_timeout_minutes: 480, ...(s.user_session || {}) },
      invoice: { prefix: 'INV', ...(s.invoice || {}) },
      notification: {
        enabled: false,
        owner_phone: '',
        telegram_chat_id: '',
        channels: { web_push: true, sms: false, telegram: false },
        ...(s.notification || {}),
      },
    });
  }

  const update = (section, patch) => setForm((f) => ({ ...f, [section]: { ...f[section], ...patch } }));

  const { isValid, errors } = useMemo(() => validateSchema(settingsSchema, form || {}), [form]);

  const save = async () => {
    if (!form) return;
    if (!isValid) {
      toast.error('Ada pengaturan yang belum valid — periksa field yang bertanda merah');
      return;
    }
    setSaving(true);
    try {
      await settingsApi.update([
        { key: 'store', value: form.store },
        { key: 'pos', value: form.pos },
        { key: 'tax', value: form.tax },
        { key: 'inventory', value: form.inventory },
        { key: 'user_session', value: form.user_session },
        { key: 'invoice', value: form.invoice },
        { key: 'notification', value: form.notification },
      ]);
      toast.success('Pengaturan berhasil disimpan');
      settings.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menyimpan pengaturan'));
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTestSending(true);
    try {
      const res = await notificationsApi.sendTest();
      const r = res.data || {};
      const parts = [];
      if (r.web_push) parts.push(`Web Push: ${(r.web_push?.sent || 0) > 0 ? 'OK' : `tidak ada penerima${r.web_push?.skipped ? ' (' + r.web_push.skipped + ')' : ''}`}`);
      if (parts.length) {
        toast.success('Hasil uji notifikasi: ' + parts.join(' · '));
      } else {
        toast.info('Tidak ada channel eksternal aktif. Web Push perlu browser owner yang subscribe.');
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal mengirim notifikasi uji'));
    } finally {
      setTestSending(false);
    }
  };

  if (settings.loading || !form) {
    return <Card bodyClassName="p-6"><p className="text-sm text-slate-400">Memuat pengaturan...</p></Card>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Settings"
        description="Konfigurasi toko, POS, pajak, dan sistem"
        actions={
          <Button onClick={save} loading={saving} disabled={!isValid} icon={Save}>Simpan Pengaturan</Button>
        }
      />

      {!isValid && (
        <div className="flex items-start gap-2 rounded-lg border-2 border-black bg-amber-50 p-3 text-sm text-amber-700" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Beberapa pengaturan belum valid sehingga tombol simpan nonaktif:{' '}
            {Object.keys(errors)
              .map((k) => TABS.find((t) => t.key === k)?.label || k)
              .join(', ')}
            .
          </span>
        </div>
      )}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'store' && (
        <Card title={<span className="flex items-center gap-2"><Store className="h-4 w-4" /> Informasi Toko</span>} bodyClassName="p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Nama Toko" required error={errors.store?.name}>
              <Input value={form.store.name || ''} onChange={(e) => update('store', { name: e.target.value })} error={!!errors.store?.name} />
            </Field>
            <Field label="Telepon" hint="Opsional">
              <Input value={form.store.phone || ''} onChange={(e) => update('store', { phone: e.target.value })} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Alamat" hint="Opsional">
                <Input value={form.store.address || ''} onChange={(e) => update('store', { address: e.target.value })} />
              </Field>
            </div>
            <Field label="Logo (URL)" hint="Opsional" error={errors.store?.logo_url}>
              <Input value={form.store.logo_url || ''} onChange={(e) => update('store', { logo_url: e.target.value })} placeholder="https://..." error={!!errors.store?.logo_url} />
            </Field>
            <Field label="NPWP" hint="Opsional">
              <Input value={form.store.npwp || ''} onChange={(e) => update('store', { npwp: e.target.value })} maxLength={50} />
            </Field>
          </div>
        </Card>
      )}

      {tab === 'pos' && (
        <Card title={<span className="flex items-center gap-2"><Receipt className="h-4 w-4" /> Pengaturan POS & Struk</span>} bodyClassName="p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Metode Pembayaran Default">
              <Select value={form.pos.default_payment_method || 'CASH'} onChange={(e) => update('pos', { default_payment_method: e.target.value })}>
                {['CASH', 'QRIS', 'DEBIT', 'CREDIT', 'TRANSFER', 'E_WALLET'].map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </Field>
            <Field label="Lebar Struk">
              <Select value={form.pos.receipt_width || '58mm'} onChange={(e) => update('pos', { receipt_width: e.target.value })}>
                <option value="58mm">58mm (printer thermal kecil)</option>
                <option value="80mm">80mm (printer thermal besar)</option>
              </Select>
            </Field>
            <Field label="Prefix Nomor Transaksi" required hint="Contoh: INV → INV-20260815-000001" error={errors.invoice?.prefix}>
              <Input
                value={form.invoice?.prefix || ''}
                onChange={(e) => update('invoice', { prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) })}
                error={!!errors.invoice?.prefix}
              />
            </Field>
            <div className="md:mt-7">
              <Checkbox
                label="Cetak struk otomatis setelah transaksi"
                checked={form.pos.print_method === 'bluetooth' ? true : form.pos.auto_print_receipt === true}
                disabled={form.pos.print_method === 'bluetooth'}
                onChange={(e) => update('pos', { auto_print_receipt: e.target.checked })}
              />
              {form.pos.print_method === 'bluetooth' && (
                <p className="mt-1 text-xs text-slate-500">Printer Bluetooth selalu mencetak struk otomatis setelah transaksi.</p>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-start gap-4 rounded-xl border-2 border-black bg-slate-50 p-4">
            <div className="min-w-[220px] flex-1">
              <Field label="Metode Cetak">
                <Select
                  value={form.pos.print_method || 'browser'}
                  onChange={(e) => {
                    const v = e.target.value;
                    const changes = { print_method: v };
                    if (v === 'bluetooth') {
                      changes.auto_print_receipt = true;
                      setTab('printer');
                    }
                    update('pos', changes);
                  }}
                >
                  <option value="browser">Browser (dialog cetak / PDF)</option>
                  <option value="bluetooth">Printer Bluetooth (thermal)</option>
                </Select>
                <span className="mt-1 block text-xs text-slate-500">
                  Bluetooth butuh Chrome/Edge via HTTPS, printer ESC/POS (58mm/80mm). Pasangkan printer di tab "Printer".
                </span>
              </Field>
            </div>
          </div>
        </Card>
      )}

      {tab === 'tax' && (
        <Card title={<span className="flex items-center gap-2"><Percent className="h-4 w-4" /> Pajak</span>} bodyClassName="p-5">
          <div className="space-y-4">
            <Checkbox
              label="Aktifkan pajak pada transaksi"
              checked={form.tax.enabled === true}
              onChange={(e) => update('tax', { enabled: e.target.checked })}
            />
            <Field label="Persentase Pajak (%)" required={form.tax.enabled === true} error={errors.tax?.percentage}>
              <Input
                type="number"
                min="0"
                max="100"
                step="any"
                value={form.tax.percentage ?? 0}
                onChange={(e) => update('tax', { percentage: e.target.value === '' ? 0 : Number(e.target.value) })}
                disabled={form.tax.enabled !== true}
                error={!!errors.tax?.percentage}
              />
            </Field>
            <p className="text-xs text-slate-400">Pajak dihitung dari subtotal setelah diskon pada saat checkout.</p>
          </div>
        </Card>
      )}

      {tab === 'inventory' && (
        <Card title={<span className="flex items-center gap-2"><Boxes className="h-4 w-4" /> Inventory</span>} bodyClassName="p-5">
          <div className="space-y-4">
            <Checkbox
              label="Izinkan stok negatif"
              checked={form.inventory.allow_negative_stock === true}
              onChange={(e) => update('inventory', { allow_negative_stock: e.target.checked })}
            />
            <p className="text-xs text-slate-400">Jika dimatikan, transaksi akan ditolak bila stok tidak mencukupi.</p>
            <Field label="Ambang Stok Menipis (default)" error={errors.inventory?.low_stock_threshold}>
              <Input
                type="number"
                min="0"
                step="any"
                value={form.inventory.low_stock_threshold ?? 0}
                onChange={(e) => update('inventory', { low_stock_threshold: e.target.value === '' ? 0 : Number(e.target.value) })}
                error={!!errors.inventory?.low_stock_threshold}
              />
            </Field>
          </div>
        </Card>
      )}

      {tab === 'session' && (
        <Card title={<span className="flex items-center gap-2"><UserCog className="h-4 w-4" /> User & Sesi</span>} bodyClassName="p-5">
          <Field label="Session Timeout (menit)" required error={errors.user_session?.session_timeout_minutes} hint="Sesi login berakhir setelah waktu ini (default 480 menit / 8 jam)">
            <Input
              type="number"
              min="1"
              step="1"
              value={form.user_session.session_timeout_minutes ?? 480}
              onChange={(e) => update('user_session', { session_timeout_minutes: e.target.value === '' ? 0 : Number(e.target.value) })}
              error={!!errors.user_session?.session_timeout_minutes}
            />
          </Field>
        </Card>
      )}

      {tab === 'notification' && (
        <Card title={<span className="flex items-center gap-2"><Bell className="h-4 w-4" /> Notifikasi Penjualan</span>} bodyClassName="p-5">
          <div className="space-y-5">
            <Checkbox
              label="Aktifkan notifikasi penjualan ke Owner"
              checked={form.notification.enabled === true}
              onChange={(e) => update('notification', { enabled: e.target.checked })}
            />
            <p className="text-xs text-slate-400">
              Jika diaktifkan, Owner akan menerima pemberitahuan setiap ada transaksi penjualan baru.
            </p>

            <div className="border-t-2 border-black pt-4">
              <p className="mb-3 text-sm font-medium text-slate-700">Channel pengiriman</p>
              <div className="space-y-3">
                <Checkbox
                  label="Web Push (browser HP owner — perlu install PWA & subscribe)"
                  checked={form.notification.channels?.web_push === true}
                  onChange={(e) => update('notification', { channels: { ...(form.notification.channels || {}), web_push: e.target.checked } })}
                  disabled={!form.notification.enabled}
                />
                <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-black bg-white px-3 py-2.5">
                  <span className="text-xs text-slate-500">
                    Status Web Push di perangkat ini:{' '}
                    <b className="text-slate-700">
                      {pushStatus === 'subscribed' ? 'Teraktifkan ✓' : pushStatus === 'denied' ? 'Ditolak browser' : pushStatus === 'vapid-missing' ? 'VAPID belum dikonfigurasi' : 'Belum aktif'}
                    </b>
                  </span>
                  <Button
                    size="xs"
                    variant="outline"
                    icon={Bell}
                    loading={subscribing}
                    disabled={!form.notification.enabled || !VAPID_PUBLIC_KEY}
                    onClick={async () => {
                      setSubscribing(true);
                      try {
                        const ok = await subscribePush();
                        await checkPushStatus();
                        if (ok) {
                          toast.success('Web Push aktif di perangkat ini');
                        } else if (pushStatus === 'denied') {
                          toast.error('Izin notifikasi ditolak browser — aktifkan lewat ikon 🔒 di address bar');
                        } else {
                          toast.error('Gagal mengaktifkan Web Push — cek VAPID key & koneksi');
                        }
                      } catch (err) {
                        if (err?.name === 'NotAllowedError') {
                          setPushStatus('denied');
                          toast.error('Izin notifikasi ditolak browser — aktifkan lewat ikon 🔒 di address bar');
                        } else {
                          toast.error(getErrorMessage(err, 'Gagal mengaktifkan Web Push'));
                        }
                      } finally {
                        setSubscribing(false);
                      }
                    }}
                  >
                    Aktifkan Web Push
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border-2 border-black bg-white p-4 text-xs text-slate-500">
              <p className="font-medium text-slate-600">Cara kerja:</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4">
                <li>Owner harus buka aplikasi di browser HP, klik <b>Aktifkan Web Push</b>, lalu izinkan notifikasi di browser.</li>
                <li>Install aplikasi ke layar utama HP agar tetap menerima notifikasi saat tertutup (PWA).</li>
              </ul>
            </div>

            <div className="flex items-center justify-between gap-3 border-t-2 border-black pt-4">
              <div>
                <p className="text-sm font-medium text-slate-700">Uji notifikasi penjualan</p>
                <p className="text-xs text-slate-400">Kirim notifikasi uji melalui channel yang aktif untuk memastikan konfigurasi berfungsi.</p>
              </div>
              <Button
                icon={Bell}
                variant="secondary"
                onClick={sendTest}
                loading={testSending}
                disabled={!form.notification.enabled}
              >
                Kirim Notifikasi Uji
              </Button>
            </div>
          </div>
        </Card>
      )}

      {tab === 'printer' && (
        <Card title={<span className="flex items-center gap-2"><Printer className="h-4 w-4" /> Printer Bluetooth</span>} bodyClassName="p-5">
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl border-2 border-black bg-slate-50 p-4">
              {bluetooth.isConnected ? (
                <BluetoothConnected className="h-8 w-8 text-success-600" aria-hidden="true" />
              ) : bluetooth.connecting ? (
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600" aria-hidden="true" />
              ) : (
                <Bluetooth className={`h-8 w-8 ${bluetooth.supported ? 'text-slate-400' : 'text-danger-500'}`} aria-hidden="true" />
              )}
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">
                  {bluetooth.isConnected
                    ? `Terhubung: ${bluetooth.connectedName}`
                    : bluetooth.connecting
                      ? 'Menghubungkan...'
                      : bluetooth.supported
                        ? bluetooth.hasStoredDevice
                          ? 'Printer tersimpan — akan otomatis terhubung saat cetak'
                          : 'Printer belum terhubung'
                        : 'Web Bluetooth tidak didukung'}
                </p>
                <p className="text-xs text-slate-500">
                  {bluetooth.supported
                    ? 'Setelah pairing pertama, printer akan otomatis terhubung saat Anda mencetak struk.'
                    : 'Butuh Chrome/Edge (desktop/Android) dengan koneksi HTTPS. Firefox/Safari tidak mendukung Web Bluetooth.'}
                </p>
              </div>
              <div className="flex gap-2">
                {bluetooth.isConnected ? (
                  <Button variant="outline" size="sm" onClick={bluetooth.disconnect}>
                    Putuskan
                  </Button>
                ) : (
                  <Button
                    icon={Bluetooth}
                    size="sm"
                    loading={bluetooth.busy || bluetooth.connecting}
                    disabled={!bluetooth.supported}
                    onClick={async () => {
                      try {
                        if (bluetooth.hasStoredDevice) {
                          await bluetooth.autoConnect();
                          toast.success('Printer Bluetooth otomatis terhubung');
                        } else {
                          await bluetooth.connect();
                          toast.success('Printer Bluetooth terhubung');
                        }
                      } catch (err) {
                        toast.error(getErrorMessage(err, 'Gagal menghubungkan printer Bluetooth'));
                      }
                    }}
                  >
                    {bluetooth.hasStoredDevice ? 'Sambungkan Ulang' : 'Hubungkan Printer'}
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-lg border-2 border-black bg-white p-4 text-xs text-slate-500">
              <p className="font-medium text-slate-600">Cara penggunaan:</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4">
                <li>Pastikan printer thermal menyala & dalam mode Bluetooth (pairing).</li>
                <li>Klik <b>Hubungkan Printer</b> sekali saja, lalu pilih printer dari dialog browser.</li>
                <li>Setelah itu, printer akan <b>otomatis terhubung</b> setiap kali Anda mencetak struk.</li>
                <li>Untuk cetak otomatis: set metode cetak ke <b>Printer Bluetooth</b> di tab "POS & Struk" dan aktifkan "Cetak struk otomatis".</li>
              </ul>
            </div>

            <div className="flex items-center justify-between gap-3 border-t-2 border-black pt-4">
              <div>
                <p className="text-sm font-medium text-slate-700">Uji cetak struk</p>
                <p className="text-xs text-slate-400">Cetak struk contoh untuk memastikan printer & lebar kertas sudah benar.</p>
              </div>
              <Button
                icon={Printer}
                variant="secondary"
                disabled={!bluetooth.supported || (!bluetooth.isConnected && !bluetooth.hasStoredDevice)}
                loading={bluetooth.connecting}
                onClick={async () => {
                  try {
                    await bluetooth.printStruk(
                      {
                        invoice_number: 'INV-UJI-000001',
                        created_at: new Date().toISOString(),
                        cashier: { username: 'Uji', profiles: { full_name: 'Uji Struk' } },
                        customer: { name: 'Pelanggan Uji' },
                        items: [{ id: '1', product: { name: 'Produk Contoh' }, quantity: 2, price: 15000, discount: 0, subtotal: 30000 }],
                        subtotal: 30000,
                        discount: 0,
                        tax: 0,
                        additional_cost: 0,
                        total: 30000,
                        payment_method: 'CASH',
                        payments: [{ cash_received: 50000, change_amount: 20000 }],
                      },
                      { name: (form?.store?.name) || 'Toko Anda', address: form?.store?.address, phone: form?.store?.phone, npwp: form?.store?.npwp },
                      { receipt_width: form?.pos?.receipt_width || '58mm' }
                    );
                    toast.success('Struk uji berhasil dicetak');
                  } catch (err) {
                    toast.error(getErrorMessage(err, 'Gagal mencetak struk uji'));
                  }
                }}
              >
                Cetak Struk Uji
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
