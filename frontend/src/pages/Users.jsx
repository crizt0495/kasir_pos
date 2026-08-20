import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, KeyRound } from 'lucide-react';
import { usersApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { usePermission } from '../hooks/usePermission.js';
import { useAuthStore } from '../stores/authStore.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { DataTable, SearchInput, Button, Badge, ConfirmDialog, Modal, Field, Input, PageHeader } from '../components/ui/index.jsx';
import { initials, formatDateTime } from '../utils/format.js';

export default function Users() {
  const navigate = useNavigate();
  const { can } = usePermission();
  const currentUser = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 400);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [toDelete, setToDelete] = useState(null);
  const [resetUser, setResetUser] = useState(null);
  const [resetPwd, setResetPwd] = useState('');
  const [resetting, setResetting] = useState(false);

  const list = useApi(() => usersApi.list({ search: debounced || undefined, page, pageSize }).then((r) => r.data), [debounced, page, pageSize]);

  const confirmDelete = async () => {
    try {
      await usersApi.remove(toDelete.id);
      toast.success('User berhasil dihapus');
      setToDelete(null);
      list.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menghapus user'));
    }
  };

  const doReset = async () => {
    if (resetPwd.length < 8) {
      toast.error('Password minimal 8 karakter');
      return;
    }
    setResetting(true);
    try {
      await usersApi.update(resetUser.id, { password: resetPwd, must_change_password: true });
      toast.success(`Password ${resetUser.username} direset — user wajib ganti saat login`);
      setResetUser(null);
      setResetPwd('');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal mereset password'));
    } finally {
      setResetting(false);
    }
  };

  const d = list.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        description="Kelola akun pengguna aplikasi"
        actions={can('users.create') && <Button icon={Plus} onClick={() => navigate('/users/new')}>Tambah User</Button>}
      />

      <DataTable
        columns={[
          { key: 'user', header: 'User', render: (r) => (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
                {initials(r.full_name || r.username)}
              </div>
              <div>
                <p className="font-medium text-slate-800">
                  {r.full_name || r.username}
                  {r.id === currentUser?.id && <span className="ml-1.5 text-xs text-primary-500">(Anda)</span>}
                </p>
                <p className="text-xs text-slate-400">@{r.username}</p>
              </div>
            </div>
          )},
          { key: 'roles', header: 'Role', render: (r) => (
            <div className="flex flex-wrap gap-1">
              {(r.roles || []).map((role) => (
                <Badge key={role.id} color={role.code === 'super_admin' ? 'bg-red-100 text-red-700' : 'bg-primary-100 text-primary-700'}>
                  {role.name}
                </Badge>
              ))}
            </div>
          )},
          { key: 'email', header: 'Email', render: (r) => r.email || '-' },
          { key: 'last_login_at', header: 'Login Terakhir', render: (r) => (r.last_login_at ? formatDateTime(r.last_login_at) : '-') },
          { key: 'status', header: 'Status', render: (r) => (
            <Badge color={r.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
              {r.is_active ? 'Aktif' : 'Nonaktif'}
            </Badge>
          )},
          { key: 'actions', header: 'Aksi', render: (r) => (
            <div className="flex gap-1">
              {can('users.update') && (
                <>
                  <button onClick={() => setResetUser(r)} title="Reset password" className="rounded-md p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600">
                    <KeyRound className="h-4 w-4" />
                  </button>
                  <button onClick={() => navigate(`/users/${r.id}/edit`)} className="rounded-md p-1.5 text-slate-400 hover:bg-primary-50 hover:text-primary-600">
                    <Pencil className="h-4 w-4" />
                  </button>
                </>
              )}
              {can('users.delete') && (
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
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
                {initials(r.full_name || r.username)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800 truncate">
                  {r.full_name || r.username}
                  {r.id === currentUser?.id && <span className="ml-1.5 text-xs text-primary-500">(Anda)</span>}
                </p>
                <p className="text-xs text-slate-400">@{r.username}</p>
              </div>
              <Badge color={r.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                {r.is_active ? 'Aktif' : 'Nonaktif'}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1">
              {(r.roles || []).map((role) => (
                <Badge key={role.id} color={role.code === 'super_admin' ? 'bg-red-100 text-red-700' : 'bg-primary-100 text-primary-700'}>
                  {role.name}
                </Badge>
              ))}
            </div>
            <div className="flex justify-end gap-1">
              {can('users.update') && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); setResetUser(r); }} className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-100 transition-colors">
                    Reset
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/users/${r.id}/edit`); }} className="rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-100 transition-colors">
                    Edit
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        toolbar={<SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari username, nama, email..." className="w-full sm:w-72" />}
      />

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Hapus user ini?"
        message={`User "${toDelete?.username}" akan dihapus permanen.`}
      />

      <Modal
        open={!!resetUser}
        onClose={() => setResetUser(null)}
        title={`Reset Password — ${resetUser?.username}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetUser(null)}>Batal</Button>
            <Button onClick={doReset} loading={resetting}>Reset Password</Button>
          </>
        }
      >
        <Field label="Password baru" hint="Minimal 8 karakter, huruf dan angka. User wajib mengganti saat login berikutnya.">
          <Input type="password" value={resetPwd} onChange={(e) => setResetPwd(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}
