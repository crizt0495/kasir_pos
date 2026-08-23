import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Eye } from 'lucide-react';
import { customersApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { usePermission } from '../hooks/usePermission.js';
import { customerSchema } from '../schemas/index.js';
import { validateSchema } from '../utils/validation.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { DataTable, SearchInput, Button, Modal, Field, Input, Textarea, ConfirmDialog, PageHeader } from '../components/ui/index.jsx';
import { formatRupiah, formatNumber } from '../utils/format.js';

const emptyForm = { name: '', phone: '', email: '', address: '', birth_date: '', notes: '' };

export default function Customers() {
  const navigate = useNavigate();
  const { can } = usePermission();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [toDelete, setToDelete] = useState(null);

  const list = useApi(() => customersApi.list({ search: debounced || undefined, page, pageSize }).then((r) => r.data), [debounced, page, pageSize]);

  const { isValid, errors } = useMemo(() => validateSchema(customerSchema, form), [form]);

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
    if (!isValid) {
      setFormError(errors.name || 'Data belum lengkap');
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
      <PageHeader
        title="Pelanggan"
        description="Kelola data pelanggan"
        actions={can('customers.create') && <Button icon={Plus} onClick={openCreate}>Tambah Pelanggan</Button>}
      />

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
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        renderCard={(r) => (
          <div className="space-y-2.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-slate-800">{r.name}</p>
                {r.phone && <p className="text-xs text-slate-400">{r.phone}</p>}
                {r.email && <p className="text-xs text-slate-400">{r.email}</p>}
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>Transaksi: <b>{formatNumber(r.total_transactions)}</b></span>
              <span>Total: <b className="text-slate-800">{formatRupiah(r.total_spend)}</b></span>
            </div>
            <div className="flex justify-end gap-1">
              <button onClick={(e) => { e.stopPropagation(); navigate(`/customers/${r.id}`); }} className="rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-600 hover:bg-sky-100 transition-colors">
                Detail
              </button>
              {can('customers.update') && (
                <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-100 transition-colors">
                  Edit
                </button>
              )}
            </div>
          </div>
        )}
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
            <Button onClick={save} loading={saving} disabled={!isValid}>Simpan</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nama" required error={errors.name || formError}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={!!errors.name || !!formError} />
          </Field>
          <Field label="No. HP" hint="Opsional — maks 30 karakter">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="08xxxxxxxxxx" error={!!errors.phone} />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={!!errors.email} />
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
