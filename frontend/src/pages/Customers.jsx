import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Eye } from 'lucide-react';
import { customersApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { DataTable, SearchInput, Button, Modal, Field, Input, Textarea, ConfirmDialog } from '../components/ui/index.jsx';
import { formatRupiah, formatNumber } from '../utils/format.js';

const emptyForm = { name: '', phone: '', email: '', address: '', birth_date: '', notes: '' };

export default function Customers() {
  const navigate = useNavigate();
  const { can } = usePermission();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [toDelete, setToDelete] = useState(null);

  const list = useApi(() => customersApi.list({ search: debounced || undefined, page, pageSize: 20 }).then((r) => r.data), [debounced, page]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  };
  const openEdit = (c) => {
    setEditing(c);
    setForm({
      name: c.name, phone: c.phone || '', email: c.email || '',
      address: c.address || '', birth_date: c.birth_date || '', notes: c.notes || '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setFormError('Nama pelanggan wajib diisi');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await customersApi.update(editing.id, form);
        toast.success('Pelanggan berhasil diperbarui');
      } else {
        await customersApi.create(form);
        toast.success('Pelanggan berhasil dibuat');
      }
      setModalOpen(false);
      list.reload();
    } catch (error) {
      setFormError(getErrorMessage(error, 'Gagal menyimpan pelanggan'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await customersApi.remove(toDelete.id);
      toast.success('Pelanggan berhasil dihapus');
      setToDelete(null);
      list.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menghapus pelanggan'));
    }
  };

  const d = list.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pelanggan</h1>
          <p className="text-sm text-slate-500">Kelola data pelanggan</p>
        </div>
        {can('customers.create') && <Button icon={Plus} onClick={openCreate}>Tambah Pelanggan</Button>}
      </div>

      <DataTable
        columns={[
          { key: 'name', header: 'Nama', render: (r) => <span className="font-medium text-slate-800">{r.name}</span> },
          { key: 'phone', header: 'No. HP', render: (r) => r.phone || '-' },
          { key: 'email', header: 'Email', render: (r) => r.email || '-' },
          { key: 'total_transactions', header: 'Transaksi', render: (r) => formatNumber(r.total_transactions) },
          { key: 'total_spend', header: 'Total Belanja', render: (r) => <span className="font-semibold">{formatRupiah(r.total_spend)}</span> },
          { key: 'actions', header: 'Aksi', render: (r) => (
            <div className="flex gap-1">
              <button onClick={() => navigate(`/customers/${r.id}`)} className="rounded-md p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-600">
                <Eye className="h-4 w-4" />
              </button>
              {can('customers.update') && (
                <button onClick={() => openEdit(r)} className="rounded-md p-1.5 text-slate-400 hover:bg-primary-50 hover:text-primary-600">
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {can('customers.delete') && (
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
        toolbar={<SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari nama, HP, email..." className="w-full sm:w-72" />}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Pelanggan' : 'Tambah Pelanggan'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button onClick={save} loading={saving}>Simpan</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nama" required error={formError}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="No. HP">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="08xxxxxxxxxx" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Tanggal Lahir">
            <Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Alamat">
              <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Catatan">
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Hapus pelanggan ini?"
        message={`Pelanggan "${toDelete?.name}" akan dihapus.`}
      />
    </div>
  );
}
