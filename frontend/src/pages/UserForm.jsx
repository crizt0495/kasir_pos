import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save, ArrowLeft, ShieldCheck } from 'lucide-react';
import { usersApi, rolesApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { userSchema } from '../schemas/index.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Button, Field, Input, Card, Skeleton, Checkbox } from '../components/ui/index.jsx';

export default function UserForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(isEdit);
  const [selectedRoles, setSelectedRoles] = useState([]);

  const roles = useApi(() => rolesApi.list().then((r) => r.data), []);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(userSchema),
    defaultValues: {
      username: '', full_name: '', email: '', phone: '', password: '',
      roles: [], is_active: true,
    },
  });

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    usersApi
      .get(id)
      .then((res) => {
        if (cancelled) return;
        const data = res.data;
        reset({
          username: data.username,
          full_name: data.full_name || '',
          email: data.email || '',
          phone: data.phone || '',
          password: '',
          roles: (data.roles || []).map((r) => r.id),
          is_active: data.is_active,
        });
        setSelectedRoles((data.roles || []).map((r) => r.id));
      })
      .catch((e) => toast.error(getErrorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id, isEdit, reset]);

  const toggleRole = (roleId) => {
    setSelectedRoles((prev) => (prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]));
  };

  const onSubmit = async (values) => {
    const payload = {
      full_name: values.full_name,
      email: values.email || null,
      phone: values.phone || null,
      roles: selectedRoles,
      is_active: values.is_active,
    };
    if (!isEdit) {
      payload.username = values.username;
      payload.password = values.password;
      payload.must_change_password = true;
    } else if (values.password) {
      payload.password = values.password;
      payload.must_change_password = true;
    }

    if (!selectedRoles.length) {
      toast.error('Pilih minimal satu role');
      return;
    }

    try {
      if (isEdit) {
        await usersApi.update(id, payload);
        toast.success('User berhasil diperbarui');
      } else {
        await usersApi.create(payload);
        toast.success('User berhasil dibuat');
      }
      navigate('/users');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menyimpan user'));
    }
  };

  if (loading) {
    return (
      <Card bodyClassName="p-6">
        <Skeleton className="mb-4 h-10 w-1/3" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/users')} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-500 hover:bg-slate-50">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{isEdit ? 'Edit User' : 'Tambah User'}</h1>
          <p className="text-sm text-slate-500">Atur akun dan hak akses pengguna</p>
        </div>
      </div>

      <Card bodyClassName="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {!isEdit && (
              <Field label="Username" required error={errors.username?.message}>
                <Input {...register('username')} error={errors.username} placeholder="cth: kasir2" disabled={isEdit} />
              </Field>
            )}
            <Field label="Nama Lengkap" required error={errors.full_name?.message}>
              <Input {...register('full_name')} error={errors.full_name} />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" {...register('email')} error={errors.email} />
            </Field>
            <Field label="No. HP" error={errors.phone?.message}>
              <Input {...register('phone')} error={errors.phone} />
            </Field>
            {!isEdit ? (
              <Field label="Password Awal" required error={errors.password?.message} hint="Minimal 8 karakter, huruf dan angka">
                <Input type="password" {...register('password')} error={errors.password} />
              </Field>
            ) : (
              <Field label="Reset Password (opsional)" error={errors.password?.message} hint="Kosongkan jika tidak ingin mengubah">
                <Input type="password" {...register('password')} error={errors.password} />
              </Field>
            )}
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <ShieldCheck className="h-4 w-4 text-indigo-500" /> Role (hak akses)
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(roles.data || []).map((role) => (
                <label
                  key={role.id}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 ${
                    selectedRoles.includes(role.id) ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">{role.name}</p>
                    <p className="text-xs text-slate-400">{role.permission_count} permission</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(role.id)}
                    onChange={() => toggleRole(role.id)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </label>
              ))}
            </div>
          </div>

          <Checkbox label="Akun aktif" {...register('is_active')} />

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" type="button" onClick={() => navigate('/users')}>Batal</Button>
            <Button type="submit" loading={isSubmitting} icon={Save}>Simpan User</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
