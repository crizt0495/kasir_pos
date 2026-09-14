import { useEffect, useMemo, useState } from 'react';
import { Save, Store, Settings as SettingsIcon, Receipt, Search, Bluetooth, BluetoothConnected, Printer, Unplug, Percent, Boxes, UserCog, AlertTriangle, Bell } from 'lucide-react';
import { settingsApi, notificationsApi } from '../api/index.js';
import { subscribePush } from '../components/layout/NotificationsBell';
import { useApi } from '../hooks/useApi.js';
import { useBluetoothPrinter } from '../hooks/useBluetoothPrinter.js';
import { usePrinterConnect, DEFAULT_CONNECT_CONFIG } from '../context/PrinterConnectProvider.jsx';
import { settingsSchema } from '../schemas/index.js';
import { validateSchema } from '../utils/validation.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Button } from '../components/ui/Button.jsx';
import { Tabs } from '../components/ui/DataTable.jsx';
import { Field, Input, Select, Checkbox, Textarea } from '../components/ui/Form.jsx';
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
  const [testingPrint, setTestingPrint] = useState(false);
  const bluetooth = useBluetoothPrinter();
  const { openConnectModal } = usePrinterConnect();

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

  const handleTestPrint = async () => {
    if (!bluetooth.isConnected) return;
    setTestingPrint(true);
    try {
      await bluetooth.printStruk(
        {
          invoice_number: `TEST-${Date.now().toString().slice(-6)}`,
          created_at: new Date().toISOString(),
          cashier: { username: 'Admin' },
          customer: null,
          payment_method: 'cash',
          items: [{ product: { name: 'Produk Uji Cetak' }, quantity: 2, price: 15000, discount: 0, subtotal: 30000 }],
          subtotal: 30000,
          discount: 0,
          tax: 0,
          additional_cost: 0,
          total: 30000,
          payments: [{ cash_received: 30000, change_amount: 0 }],
        },
        settings.data?.store,
        settings.data?.pos
      );
      toast.success('Struk test berhasil dikirim ke printer');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Gagal cetak struk test'));
    } finally {
      setTestingPrint(false);
    }
  };

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
        print_method: 'bluetooth',
        show_unit_price: true,
        show_footer_nota: true,
        footer_nota: 'Terima kasih atas kunjungan Anda!',
        ...(s.pos || {}),
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

      {tab === 'printer' && (
        <div className="space-y-5">
          <Card title={<span className="flex items-center gap-2"><Bluetooth className="h-4 w-4" /> Status Koneksi</span>} bodyClassName="p-5">
            <div className="flex items-center gap-3 rounded-lg border-2 border-black bg-white p-4">
              {bluetooth.isConnected ? (
                <BluetoothConnected className="h-8 w-8 shrink-0 text-success-600" aria-hidden="true" />
              ) : bluetooth.connecting ? (
                <div className="h-8 w-8 shrink-0 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600" aria-hidden="true" />
              ) : (
                <Bluetooth className={`h-8 w-8 shrink-0 ${bluetooth.supported ? 'text-slate-400' : 'text-danger-500'}`} aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {bluetooth.isConnected
                    ? `Terhubung ke: ${bluetooth.connectedName}`
                    : bluetooth.connecting
                      ? 'Menghubungkan...'
                      : bluetooth.hasStoredDevice
                        ? 'Printer tersimpan — belum terhubung'
                        : 'Belum ada printer terhubung'}
                </p>
                <p className="text-xs text-slate-500">
                  {bluetooth.isConnected
                    ? 'Printer siap digunakan untuk mencetak struk'
                    : bluetooth.supported
                      ? 'Setelah pairing pertama, printer otomatis tersambung saat mencetak struk.'
                      : 'Web Bluetooth tidak didukung — butuh Chrome/Edge (desktop/Android) dengan koneksi HTTPS.'}
                </p>
              </div>
            </div>
          </Card>

          <Card title={<span className="flex items-center gap-2"><Search className="h-4 w-4" /> Cari Printer</span>} bodyClassName="p-5">
            <p className="mb-4 text-sm text-slate-600">Scan perangkat Bluetooth di sekitar, lalu pilih printer thermal Anda (58mm / 80mm). Printer yang dipilih disimpan otomatis sebagai printer default.</p>
            <Button icon={Bluetooth} disabled={!bluetooth.supported} onClick={() => openConnectModal({ ...DEFAULT_CONNECT_CONFIG, title: 'Cari & Hubungkan Printer', connectLabel: 'Hubungkan', onConnected: () => toast.success('Printer Bluetooth terhubung') })}>
              Scan & Hubungkan Printer Bluetooth
            </Button>
          </Card>

          <Card title={<span className="flex items-center gap-2"><Printer className="h-4 w-4" /> Test Print</span>} bodyClassName="p-5">
            <p className="mb-4 text-sm text-slate-600">Cetak struk uji untuk memastikan printer sudah terpasang dengan baik.</p>
            <Button icon={Printer} disabled={!bluetooth.isConnected} loading={testingPrint} onClick={handleTestPrint}>
              Cetak Struk Test
            </Button>
          </Card>

          <Card title={<span className="flex items-center gap-2"><Unplug className="h-4 w-4" /> Lupakan Printer</span>} bodyClassName="p-5">
            <p className="mb-4 text-sm text-slate-600">Hapus koneksi printer Bluetooth yang tersimpan. Anda tetap bisa menghubungkan ulang kapan saja.</p>
            <Button variant="danger" icon={Unplug} disabled={!bluetooth.isConnected && !bluetooth.hasStoredDevice} onClick={async () => {
              await bluetooth.disconnect();
              toast.info('Koneksi printer dihapus — silakan hubungkan kembali saat mencetak');
            }}>
              Hapus Koneksi Printer
            </Button>
          </Card>

          <Card title={<span className="flex items-center gap-2"><Receipt className="h-4 w-4" /> Pengaturan Struk</span>} bodyClassName="p-5">
            <div className="space-y-3">
              <Checkbox
                label="Tampilkan Harga Satuan"
                checked={form.pos.show_unit_price !== false}
                onChange={(e) => update('pos', { show_unit_price: e.target.checked })}
              />
              <p className="text-xs text-slate-400">
                Saat aktif, setiap item struk menampilkan kolom Qty, Harga Satuan, dan Subtotal
                (contoh: <code className="rounded bg-slate-100 px-1">1 x 150.000 = 150.000</code>).
                Saat tidak aktif, kolom harga satuan disembunyikan.
              </p>
              <Checkbox
                label="Tampilkan Footer Nota"
                checked={form.pos.show_footer_nota !== false}
                onChange={(e) => update('pos', { show_footer_nota: e.target.checked })}
              />
              <p className="text-xs text-slate-400">
                Tampilkan teks penutup custom di bagian paling bawah struk, sebelum kertas dipotong.
              </p>
              {form.pos.show_footer_nota !== false && (
                <>
                  <Textarea
                    name="footer_nota"
                    rows={4}
                    maxLength={200}
                    value={form.pos.footer_nota || ''}
                    onChange={(e) => update('pos', { footer_nota: e.target.value })}
                    error={!!errors.pos?.footer_nota}
                    placeholder="Terima kasih atas kunjungan Anda!"
                  />
                  <p className="text-right text-xs text-slate-400">
                    {(form.pos.footer_nota || '').length}/200 karakter
                  </p>
                </>
              )}
            </div>
          </Card>
        </div>
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
    </div>
  );
}
