import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { expensesApi, cashierApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import {
  DataTable, SearchInput, Button, Modal, Field, Input, Textarea, Select, ConfirmDialog, Badge, PageHeader,
} from '../components/ui/index.jsx';
import { formatRupiah, formatDate, paymentMethodLabel, paymentMethodColor, todayInput } from '../utils/format.js';

const CATEGORIES = ['Operasional', 'Listrik & Air', 'Gaji', 'Transportasi', 'Pajak', 'Perbaikan', 'Lainnya'];

const emptyForm = { expense_date: todayInput(), category: 'Operasional', amount: '', description: '', payment_method: 'CASH' };

export default function Expenses() {
  const { can } = usePermission();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [toDelete, setToDelete] = useState(null);

  const list = useApi(
    () => expensesApi.list({ search: search || undefined, category: category || undefined, from: from || undefined, to: to || undefined, page, pageSize: 20 }).then((r) => r.data),
    [search, category, from, to, page]
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (e) => {
    setEditing(e);
    setForm({
      expense_date: e.expense_date,
      category: e.category,
      amount: e.amount,
      description: e.description || '',
      payment_method: e.payment_method,
    });
    setFormError('');
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.category || !Number(form.amount)) {
      setFormError('Kategori dan nominal wajib diisi');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await expensesApi.update(editing.id, form);
        toast.success('Pengeluaran berhasil diperbarui');
      } else {
        // Jika ada sesi kas terbuka, catat ke kas otomatis
        let sessionId = null;
        try {
          const session = await cashierApi.openSession();
          sessionId = session.data?.id || null;
        } catch { /* tanpa sesi kas */ }
        await expensesApi.create({ ...form, session_id: sessionId });
        toast.success('Pengeluaran berhasil dicatat');
      }
      setModalOpen(false);
      list.reload();
    } catch (error) {
      setFormError(getErrorMessage(error, 'Gagal menyimpan pengeluaran'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await expensesApi.remove(toDelete.id);
      toast.success('Pengeluaran dihapus');
      setToDelete(null);
      list.reload();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const d = list.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pengeluaran"
        description="Catat semua pengeluaran operasional"
        actions={can('expenses.create') && <Button icon={Plus} onClick={openCreate}>Tambah Pengeluaran</Button>}
      />

      <DataTable
        columns={[
          { key: 'expense_date', header: 'Tanggal', render: (r) => formatDate(r.expense_date) },
          { key: 'category', header: 'Kategori', render: (r) => <Badge color="bg-slate-100 text-slate-700">{r.category}</Badge> },
          { key: 'description', header: 'Deskripsi', render: (r) => <span className="line-clamp-1 max-w-56">{r.description || '-'}</span> },
          { key: 'payment_method', header: 'Metode', render: (r) => (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${paymentMethodColor(r.payment_method)}`}>{paymentMethodLabel(r.payment_method)}</span>
          )},
          { key: 'amount', header: 'Nominal', render: (r) => <span className="font-semibold text-red-600">-{formatRupiah(r.amount)}</span> },
          { key: 'created_by_user', header: 'Oleh', render: (r) => r.created_by_user?.profiles?.full_name || r.created_by_user?.username || '-' },
          { key: 'actions', header: 'Aksi', render: (r) => (
            <div className="flex gap-1">
              {can('expenses.update') && (
                <button onClick={() => openEdit(r)} className="rounded-md p-1.5 text-slate-400 hover:bg-primary-50 hover:text-primary-600">
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {can('expenses.delete') && (
                <button onClick={() => setToDelete(r)} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )},
        ]}
        data={d?.items || []}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        page={page}
        totalPages={d?.totalPages}
        total={d?.total}
        pageSize={d?.pageSize}
        onPageChange={setPage}
        toolbar={
          <>
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari deskripsi..." className="w-full sm:w-56" />
            <div className="flex gap-2">
              <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="w-40">
                <option value="">Semua Kategori</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-36" />
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-36" />
            </div>
          </>
        }
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Pengeluaran' : 'Tambah Pengeluaran'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button onClick={save} loading={saving}>Simpan</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tanggal">
              <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
            </Field>
            <Field label="Kategori" required>
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Nominal (Rp)" required error={formError}>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Metode Pembayaran">
              <Select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                {['CASH', 'QRIS', 'DEBIT', 'CREDIT', 'TRANSFER', 'E_WALLET'].map((m) => <option key={m} value={m}>{paymentMethodLabel(m)}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Deskripsi">
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Hapus pengeluaran?"
        message="Data pengeluaran akan dihapus."
        confirmText="Ya, hapus"
      />
    </div>
  );
}
