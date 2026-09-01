import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Truck } from 'lucide-react';
import { suppliersApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { usePermission } from '../hooks/usePermission.js';
import { supplierSchema } from '../schemas/index.js';
import { validateSchema } from '../utils/validation.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Button } from '../components/ui/Button.jsx';
import { DataTable, SearchInput } from '../components/ui/DataTable.jsx';
import { Modal, ConfirmDialog } from '../components/ui/Modal.jsx';
import { Field, Input, Textarea, Select } from '../components/ui/Form.jsx';
import { StatusBadge } from '../components/ui/Feedback.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';

const emptyForm = { name: '', contact_person: '', phone: '', email: '', address: '', notes: '', status: 'active' };

export default function Suppliers() {
  const { can } = usePermission();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [toDelete, setToDelete] = useState(null);

  const list = useApi(() => suppliersApi.list({ search: debounced || undefined, page, pageSize }).then((r) => r.data), [debounced, page, pageSize]);

  const { isValid, errors } = useMemo(() => validateSchema(supplierSchema, form), [form]);

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
    if (!isValid) {
      setFormError(errors.name || 'Data belum lengkap');
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
      <PageHeader
        title="Supplier"
        description="Kelola pemasok barang"
        actions={can('suppliers.create') && <Button icon={Plus} onClick={openCreate}>Tambah Supplier</Button>}
      />

      <DataTable
        storageKey="suppliers"
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
                <button onClick={() => openEdit(r)} className="rounded-md p-1.5 text-slate-400 hover:bg-primary-50 hover:text-primary-600">
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
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        renderCard={(r) => (
          <div className="space-y-2.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-slate-800">{r.name}</p>
                {r.contact_person && <p className="text-xs text-slate-400">{r.contact_person}</p>}
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div className="space-y-0.5 text-xs text-slate-500">
              {r.phone && <p>Telepon: {r.phone}</p>}
              {r.email && <p>Email: {r.email}</p>}
              {r.address && <p className="truncate">Alamat: {r.address}</p>}
            </div>
            <div className="flex justify-end gap-1">
              {can('suppliers.update') && (
                <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-100 transition-colors">
                  Edit
                </button>
              )}
              {can('suppliers.delete') && (
                <button onClick={(e) => { e.stopPropagation(); setToDelete(r); }} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors">
                  Hapus
                </button>
              )}
            </div>
          </div>
        )}
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
            <Button onClick={save} loading={saving} disabled={!isValid}>Simpan</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nama Supplier" required error={errors.name || formError}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={!!errors.name || !!formError} />
          </Field>
          <Field label="Kontak Person" hint="Opsional">
            <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
          </Field>
          <Field label="Telepon" hint="Opsional — maks 30 karakter" error={errors.phone}>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={!!errors.phone} />
          </Field>
          <Field label="Email" hint="Opsional" error={errors.email}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={!!errors.email} />
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
