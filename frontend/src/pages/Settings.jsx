import { useState } from 'react';
import { Save, Store, Settings as SettingsIcon, Receipt, Percent, Boxes, UserCog } from 'lucide-react';
import { settingsApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Card, Tabs, Button, Field, Input, Select, Checkbox } from '../components/ui/index.jsx';

const TABS = [
  { key: 'store', label: 'Toko' },
  { key: 'pos', label: 'POS & Struk' },
  { key: 'tax', label: 'Pajak' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'session', label: 'User & Sesi' },
];

export default function Settings() {
  const [tab, setTab] = useState('store');
  const settings = useApi(() => settingsApi.get().then((r) => r.data), []);
  const [saving, setSaving] = useState(false);

  const s = settings.data || {};

  const [form, setForm] = useState(null);

  // Inisialisasi form dari data settings
  if (!form && s.store) {
    setForm({
      store: { ...s.store },
      pos: { ...s.pos },
      tax: { ...s.tax },
      inventory: { ...s.inventory },
      user_session: { ...s.user_session },
      invoice: { prefix: s.invoice?.prefix || 'INV' },
    });
  }

  const update = (section, patch) => setForm((f) => ({ ...f, [section]: { ...f[section], ...patch } }));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await settingsApi.update([
        { key: 'store', value: form.store },
        { key: 'pos', value: form.pos },
        { key: 'tax', value: form.tax },
        { key: 'inventory', value: form.inventory },
        { key: 'user_session', value: form.user_session },
        { key: 'invoice', value: form.invoice },
      ]);
      toast.success('Pengaturan berhasil disimpan');
      settings.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menyimpan pengaturan'));
    } finally {
      setSaving(false);
    }
  };

  if (!form) {
    return <Card bodyClassName="p-6"><p className="text-sm text-slate-400">Memuat pengaturan...</p></Card>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500">Konfigurasi toko, POS, pajak, dan sistem</p>
        </div>
        <Button onClick={save} loading={saving} icon={Save}>Simpan Pengaturan</Button>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'store' && (
        <Card title={<span className="flex items-center gap-2"><Store className="h-4 w-4" /> Informasi Toko</span>} bodyClassName="p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Nama Toko">
              <Input value={form.store.name || ''} onChange={(e) => update('store', { name: e.target.value })} />
            </Field>
            <Field label="Telepon">
              <Input value={form.store.phone || ''} onChange={(e) => update('store', { phone: e.target.value })} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Alamat">
                <Input value={form.store.address || ''} onChange={(e) => update('store', { address: e.target.value })} />
              </Field>
            </div>
            <Field label="Logo (URL)">
              <Input value={form.store.logo_url || ''} onChange={(e) => update('store', { logo_url: e.target.value })} placeholder="https://..." />
            </Field>
            <Field label="NPWP">
              <Input value={form.store.npwp || ''} onChange={(e) => update('store', { npwp: e.target.value })} />
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
            <Field label="Prefix Nomor Transaksi" hint="Contoh: INV → INV-20260815-000001">
              <Input value={form.invoice?.prefix || ''} onChange={(e) => update('invoice', { prefix: e.target.value.toUpperCase().slice(0, 10) })} />
            </Field>
            <Checkbox
              label="Cetak struk otomatis setelah transaksi"
              checked={form.pos.auto_print_receipt === true}
              onChange={(e) => update('pos', { auto_print_receipt: e.target.checked })}
              className="md:mt-7"
            />
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
            <Field label="Persentase Pajak (%)">
              <Input
                type="number"
                value={form.tax.percentage || 0}
                onChange={(e) => update('tax', { percentage: Number(e.target.value) || 0 })}
                disabled={form.tax.enabled !== true}
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
            <Field label="Ambang Stok Menipis (default)">
              <Input
                type="number"
                value={form.inventory.low_stock_threshold || 0}
                onChange={(e) => update('inventory', { low_stock_threshold: Number(e.target.value) || 0 })}
              />
            </Field>
          </div>
        </Card>
      )}

      {tab === 'session' && (
        <Card title={<span className="flex items-center gap-2"><UserCog className="h-4 w-4" /> User & Sesi</span>} bodyClassName="p-5">
          <Field label="Session Timeout (menit)" hint="Sesi login berakhir setelah waktu ini (default 480 menit / 8 jam)">
            <Input
              type="number"
              value={form.user_session.session_timeout_minutes || 480}
              onChange={(e) => update('user_session', { session_timeout_minutes: Number(e.target.value) || 480 })}
            />
          </Field>
        </Card>
      )}
    </div>
  );
}
