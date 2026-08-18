import { useState } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react';
import { rolesApi, permissionsApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { usePermission } from '../hooks/usePermission.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import {
  DataTable, Button, Modal, Field, Input, Textarea, Badge, ConfirmDialog, Card, SearchInput, Skeleton, ErrorState, PageHeader,
} from '../components/ui/index.jsx';

export default function Roles() {
  const { can } = usePermission();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', description: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [permRole, setPermRole] = useState(null);
  const [selectedPerms, setSelectedPerms] = useState([]);
  const [savingPerms, setSavingPerms] = useState(false);

  const roles = useApi(() => rolesApi.list({ page, pageSize: 20, search: debounced || undefined }).then((r) => r.data), [page, debounced]);
  const permissions = useApi(() => permissionsApi.list().then((r) => r.data), []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', code: '', description: '' });
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (role) => {
    setEditing(role);
    setForm({ name: role.name, code: role.code, description: role.description || '' });
    setFormError('');
    setModalOpen(true);
  };

  const openPerms = async (role) => {
    setPermRole(role);
    setSelectedPerms([]);
    try {
      const res = await rolesApi.get(role.id);
      setSelectedPerms(res.data.permissions.map((p) => p.code));
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const togglePerm = (code) => {
    setSelectedPerms((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const toggleModule = (module, codes) => {
    const moduleCodes = codes.map((p) => p.code);
    const allSelected = moduleCodes.every((c) => selectedPerms.includes(c));
    setSelectedPerms((prev) => {
      if (allSelected) return prev.filter((c) => !moduleCodes.includes(c));
      return [...new Set([...prev, ...moduleCodes])];
    });
  };

  const savePerms = async () => {
    setSavingPerms(true);
    try {
      await rolesApi.setPermissions(permRole.id, { permission_codes: selectedPerms });
      toast.success('Permission role diperbarui — user dengan role ini perlu login ulang');
      setPermRole(null);
      roles.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menyimpan permission'));
    } finally {
      setSavingPerms(false);
    }
  };

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      setFormError('Nama dan kode role wajib diisi');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await rolesApi.update(editing.id, form);
        toast.success('Role berhasil diperbarui');
      } else {
        await rolesApi.create(form);
        toast.success('Role berhasil dibuat');
      }
      setModalOpen(false);
      roles.reload();
    } catch (error) {
      setFormError(getErrorMessage(error, 'Gagal menyimpan role'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await rolesApi.remove(toDelete.id);
      toast.success('Role berhasil dihapus');
      setToDelete(null);
      roles.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menghapus role'));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Roles"
        description="Kelola role dan hak aksesnya"
        actions={can('roles.create') && <Button icon={Plus} onClick={openCreate}>Tambah Role</Button>}
      />

      <Card>
        {roles.loading ? (
          <div className="p-4"><Skeleton className="h-10 w-full" /></div>
        ) : roles.error ? (
          <ErrorState onRetry={roles.reload} />
        ) : (
          <DataTable
            columns={[
              { key: 'role', header: 'Role', render: (r) => (
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`h-4 w-4 ${r.is_system ? 'text-red-400' : 'text-primary-400'}`} />
                  <div>
                    <p className="font-medium text-slate-800">
                      {r.name}
                      {r.is_system && <span className="ml-1.5 text-xs text-red-400">sistem</span>}
                    </p>
                    <p className="text-xs text-slate-400">{r.code}</p>
                  </div>
                </div>
              )},
              { key: 'description', header: 'Deskripsi', render: (r) => <span className="line-clamp-1 max-w-72">{r.description || '-'}</span> },
              { key: 'permission_count', header: 'Permission', render: (r) => <Badge color="bg-primary-100 text-primary-700">{r.permission_count}</Badge> },
              { key: 'user_count', header: 'User', render: (r) => <Badge color="bg-slate-100 text-slate-700">{r.user_count}</Badge> },
              { key: 'actions', header: 'Aksi', render: (r) => (
                <div className="flex gap-1">
                  {can('roles.update') && (
                    <button onClick={() => openPerms(r)} className="rounded-md px-2 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50">
                      Atur Permission
                    </button>
                  )}
                  {can('roles.update') && (
                    <button onClick={() => openEdit(r)} className="rounded-md p-1.5 text-slate-400 hover:bg-primary-50 hover:text-primary-600">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {can('roles.delete') && (
                    <button onClick={() => setToDelete(r)} disabled={r.is_system || r.user_count > 0} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )},
            ]}
            data={roles.data?.items || []}
            loading={false}
            page={page}
            totalPages={roles.data?.totalPages}
            total={roles.data?.total}
            pageSize={roles.data?.pageSize}
            onPageChange={setPage}
            toolbar={<SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari role..." />}
            renderCard={(r) => (
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className={`h-4 w-4 ${r.is_system ? 'text-red-400' : 'text-primary-400'}`} />
                    <div>
                      <p className="font-medium text-slate-800">
                        {r.name}
                        {r.is_system && <span className="ml-1.5 text-xs text-red-400">sistem</span>}
                      </p>
                      <p className="text-xs text-slate-400">{r.code}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Badge color="bg-primary-100 text-primary-700">{r.permission_count} perm</Badge>
                    <Badge color="bg-slate-100 text-slate-700">{r.user_count} user</Badge>
                  </div>
                </div>
                {r.description && <p className="text-xs text-slate-500 line-clamp-1">{r.description}</p>}
                <div className="flex justify-end gap-1">
                  {can('roles.update') && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); openPerms(r); }} className="rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-100 transition-colors">
                        Permission
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-100 transition-colors">
                        Edit
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          />
        )}
      </Card>

      {/* Modal create/edit role */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Role' : 'Tambah Role'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button onClick={save} loading={saving}>Simpan</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nama Role" required error={formError}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="cth: Manager Toko" />
          </Field>
          <Field label="Kode Role" required hint="Huruf kecil, angka, underscore — unik" error={formError}>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="cth: manager" disabled={editing?.is_system} />
          </Field>
          <Field label="Deskripsi">
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
      </Modal>

      {/* Modal atur permission */}
      <Modal
        open={!!permRole}
        onClose={() => setPermRole(null)}
        title={`Atur Permission — ${permRole?.name}`}
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPermRole(null)}>Batal</Button>
            <Button onClick={savePerms} loading={savingPerms}>Simpan Permission ({selectedPerms.length})</Button>
          </>
        }
      >
        {permissions.loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(permissions.data?.grouped || {}).map(([module, perms]) => {
              const moduleSelected = perms.every((p) => selectedPerms.includes(p.code));
              return (
                <div key={module} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{module}</p>
                    <button
                      onClick={() => toggleModule(module, perms)}
                      className={`text-xs font-medium ${moduleSelected ? 'text-primary-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {moduleSelected ? 'Semua' : 'Pilih semua'}
                    </button>
                  </div>
                  <div className="space-y-1">
                    {perms.map((p) => (
                      <label key={p.code} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedPerms.includes(p.code)}
                          onChange={() => togglePerm(p.code)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="flex-1 truncate">{p.name}</span>
                        <code className="text-[10px] text-slate-400">{p.code}</code>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Hapus role ini?"
        message={`Role "${toDelete?.name}" akan dihapus. Role sistem tidak dapat dihapus.`}
      />
    </div>
  );
}
