import { useState } from 'react';
import { Plus, Pencil, Trash2, Tags } from 'lucide-react';
import { categoriesApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import {
  Card, DataTable, SearchInput, Button, Modal, Field, Input, Textarea, Select,
  ConfirmDialog, StatusBadge, EmptyState, Skeleton, ErrorState, PageHeader,
} from '../components/ui/index.jsx';

export default function Categories() {
  const { can } = usePermission();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', status: 'active' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const list = useApi(() => categoriesApi.list({ search }).then((r) => r.data), [search]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '', status: 'active' });
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({ name: c.name, description: c.description || '', status: c.status });
    setFormError('');
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setFormError('Nama kategori wajib diisi');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await categoriesApi.update(editing.id, form);
        toast.success('Kategori berhasil diperbarui');
      } else {
        await categoriesApi.create(form);
        toast.success('Kategori berhasil dibuat');
      }
      setModalOpen(false);
      list.reload();
    } catch (error) {
      setFormError(getErrorMessage(error, 'Gagal menyimpan kategori'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await categoriesApi.remove(toDelete.id);
      toast.success('Kategori berhasil dihapus');
      setToDelete(null);
      list.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menghapus kategori'));
    }
  };

  const data = list.data || [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kategori"
        description="Kelompokkan produk agar mudah dicari"
        actions={can('categories.create') && <Button icon={Plus} onClick={openCreate}>Tambah Kategori</Button>}
      />

      <Card>
        {list.loading ? (
          <div className="p-4"><Skeleton className="h-10 w-full" /></div>
        ) : list.error ? (
          <ErrorState onRetry={list.reload} />
        ) : data.length === 0 ? (
          <EmptyState title="Belum ada kategori" />
        ) : (
          <DataTable
            columns={[
              { key: 'name', header: 'Nama', render: (r) => (
                <div className="flex items-center gap-2">
                  <Tags className="h-4 w-4 text-slate-300" />
                  <span className="font-medium text-slate-800">{r.name}</span>
                </div>
              )},
              { key: 'description', header: 'Deskripsi', render: (r) => r.description || '-' },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'created_at', header: 'Dibuat', render: (r) => new Date(r.created_at).toLocaleDateString('id-ID') },
              { key: 'actions', header: 'Aksi', render: (r) => (
                <div className="flex gap-1">
                  {can('categories.update') && (
                    <button onClick={() => openEdit(r)} className="rounded-md p-1.5 text-slate-400 hover:bg-primary-50 hover:text-primary-600">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {can('categories.delete') && (
                    <button onClick={() => setToDelete(r)} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )},
            ]}
            data={data}
            loading={false}
          />
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Kategori' : 'Tambah Kategori'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button onClick={save} loading={saving}>Simpan</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nama Kategori" required error={formError}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="cth: Makanan" />
          </Field>
          <Field label="Deskripsi">
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
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
        title="Hapus kategori ini?"
        message={`Kategori "${toDelete?.name}" akan dihapus.`}
      />
    </div>
  );
}
