import { useState } from 'react';
import { Plus, Pencil, Trash2, Truck } from 'lucide-react';
import { suppliersApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { DataTable, SearchInput, Button, Modal, Field, Input, Textarea, Select, StatusBadge, ConfirmDialog } from '../components/ui/index.jsx';

const emptyForm = { name: '', contact_person: '', phone: '', email: '', address: '', notes: '', status: 'active' };

export default function Suppliers() {
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

  const list = useApi(() => suppliersApi.list({ search: debounced || undefined, page, pageSize: 20 }).then((r) => r.data), [debounced, page]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  };
  const openEdit = (s) => {
    setEditing(s);
    setForm({
      name: s.name, contact_person: s.contact_person || '', phone: s.phone || '',
      email: s.email || '', address: s.address || '', notes: s.notes || '', status: s.status,
    });
    setFormError('');
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setFormError('Nama supplier wajib diisi');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await suppliersApi.update(editing.id, form);
        toast.success('Supplier berhasil diperbarui');
      } else {
        await suppliersApi.create(form);
        toast.success('Supplier berhasil dibuat');
      }
      setModalOpen(false);
      list.reload();
    } catch (error) {
      setFormError(getErrorMessage(error, 'Gagal menyimpan supplier'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await suppliersApi.remove(toDelete.id);
      toast.success('Supplier berhasil dihapus');
      setToDelete(null);
      list.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menghapus supplier'));
    }
  };

  const d = list.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Supplier</h1>
          <p className="text-sm text-slate-500">Kelola pemasok barang</p>
        </div>
        {can('suppliers.create') && <Button icon={Plus} onClick={openCreate}>Tambah Supplier</Button>}
      </div>

      <DataTable
        columns={[
          { key: 'name', header: 'Supplier', render: (r) => (
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-slate-300" />
              <div>
                <p className="font-medium text-slate-800">{r.name}</p>
                {r.contact_person && <p className="text-xs text-slate-400">{r.contact_person}</p>}
              </div>
            </div>
          )},
          { key: 'phone', header: 'Telepon', render: (r) => r.phone || '-' },
          { key: 'email', header: 'Email', render: (r) => r.email || '-' },
          { key: 'address', header: 'Alamat', render: (r) => <span className="line-clamp-1 max-w-52">{r.address || '-'}</span> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'actions', header: 'Aksi', render: (r) => (
            <div className="flex gap-1">
              {can('suppliers.update') && (
                <button onClick={() => openEdit(r)} className="rounded-md p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600">
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {can('suppliers.delete') && (
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
        toolbar={<SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari nama, telepon..." className="w-full sm:w-72" />}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Supplier' : 'Tambah Supplier'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button onClick={save} loading={saving}>Simpan</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nama Supplier" required error={formError}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Kontak Person">
            <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
          </Field>
          <Field label="Telepon">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
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
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </Select>
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Hapus supplier ini?"
        message={`Supplier "${toDelete?.name}" akan dihapus.`}
      />
    </div>
  );
}
