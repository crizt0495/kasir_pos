import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Store, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { loginSchema } from '../schemas/index.js';
import { authApi } from '../api/index.js';
import { useAuthStore } from '../stores/authStore.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Button, Field, Input, Checkbox } from '../components/ui/index.jsx';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((s) => s.setSession);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { username: '', password: '', rememberMe: false } });

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      const res = await authApi.login(values);
      setSession(res.data);
      toast.success(`Selamat datang, ${res.data.profile?.full_name || res.data.username}!`);
      const from = location.state?.from || '/dashboard';
      navigate(from, { replace: true });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Login gagal, periksa username dan password'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle at 20% 20%, rgb(99 102 241 / 0.5) 0, transparent 40%), radial-gradient(circle at 80% 80%, rgb(14 165 233 / 0.4) 0, transparent 40%)',
        }}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-lg shadow-primary-600/30">
            <Store className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-white">POS Kasir</h1>
          <p className="text-sm text-slate-400">Masuk untuk mengelola toko Anda</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
          <Field label="Username" error={errors.username?.message}>
            <Input placeholder="Masukkan username" autoComplete="username" {...register('username')} error={errors.username} />
          </Field>

          <Field label="Password" error={errors.password?.message}>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Masukkan password"
                autoComplete="current-password"
                {...register('password')}
                error={errors.password}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          <div className="flex items-center justify-between">
            <Checkbox label="Ingat saya" {...register('rememberMe')} />
          </div>

          <Button type="submit" loading={submitting} className="w-full" size="lg">
            Login
          </Button>

          <div className="flex items-center justify-center gap-1.5 pt-1 text-xs text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Sesi Anda aman & terenkripsi
          </div>
        </form>
      </div>
    </div>
  );
}
