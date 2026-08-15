import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Eye, EyeOff } from 'lucide-react';
import { changePasswordSchema } from '../schemas/index.js';
import { authApi } from '../api/index.js';
import { useAuthStore } from '../stores/authStore.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Button, Field, Input, Card } from '../components/ui/index.jsx';

export default function ChangePassword() {
  const navigate = useNavigate();
  const clear = useAuthStore((s) => s.clear);
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(changePasswordSchema) });

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      await authApi.changePassword(values);
      toast.success('Password berhasil diubah, silakan login kembali');
      clear();
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal mengubah password'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-10">
      <Card
        title={
          <span className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Ganti Password
          </span>
        }
        bodyClassName="p-5"
      >
        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
          Anda wajib mengganti password sebelum melanjutkan. Gunakan minimal 8 karakter dengan huruf dan angka.
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Password saat ini" error={errors.currentPassword?.message}>
            <div className="relative">
              <Input
                type={show ? 'text' : 'password'}
                {...register('currentPassword')}
                error={errors.currentPassword}
                className="pr-10"
              />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <Field label="Password baru" error={errors.newPassword?.message} hint="Minimal 8 karakter, kombinasi huruf dan angka">
            <Input type="password" {...register('newPassword')} error={errors.newPassword} />
          </Field>
          <Field label="Konfirmasi password baru" error={errors.confirmPassword?.message}>
            <Input type="password" {...register('confirmPassword')} error={errors.confirmPassword} />
          </Field>
          <Button type="submit" loading={submitting} className="w-full">
            Simpan Password
          </Button>
        </form>
      </Card>
    </div>
  );
}
