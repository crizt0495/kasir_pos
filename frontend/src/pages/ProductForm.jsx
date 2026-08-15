import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save, ArrowLeft } from 'lucide-react';
import { productsApi, categoriesApi, unitsApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { productSchema } from '../schemas/index.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Button, Field, Input, Select, Textarea, Card, Skeleton, ErrorState } from '../components/ui/index.jsx';

export default function ProductForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(isEdit);

  const categories = useApi(() => categoriesApi.list().then((r) => r.data), []);
  const units = useApi(() => unitsApi.list().then((r) => r.data), []);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: {
      sku: '', barcode: '', name: '', category_id: '', unit_id: '', purchase_price: 0,
      sale_price: 0, stock: 0, min_stock: 0, status: 'active', description: '',
    },
  });

  // Muat data produk saat edit
  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    productsApi
      .get(id)
      .then((res) => {
        if (cancelled) return;
        reset({
          ...res.data,
          category_id: res.data.category_id || '',
          unit_id: res.data.unit_id || '',
        });
      })
      .catch((e) => toast.error(getErrorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id, isEdit, reset]);

  const onSubmit = async (values) => {
    const payload = {
      ...values,
      category_id: values.category_id || null,
      unit_id: values.unit_id || null,
      barcode: values.barcode || null,
      description: values.description || null,
    };
    try {
      if (isEdit) {
        await productsApi.update(id, payload);
        toast.success('Produk berhasil diperbarui');
      } else {
        await productsApi.create(payload);
        toast.success('Produk berhasil dibuat');
      }
      navigate('/products');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Gagal menyimpan produk'));
    }
  };

  if (loading) {
    return (
      <Card bodyClassName="p-6">
        <Skeleton className="h-10 w-1/3 mb-4" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      </Card>
    );
  }

  if (isEdit && categories.error) return <ErrorState onRetry={categories.reload} />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/products')} className="rounded-lg border border-slate-300 bg-white p-2 text-slate-500 hover:bg-slate-50">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{isEdit ? 'Edit Produk' : 'Tambah Produk'}</h1>
          <p className="text-sm text-slate-500">Lengkapi informasi produk</p>
        </div>
      </div>

      <Card bodyClassName="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Nama Produk" required error={errors.name?.message}>
              <Input {...register('name')} error={errors.name} placeholder="cth: Indomie Goreng" />
            </Field>
            <Field label="SKU" required error={errors.sku?.message}>
              <Input {...register('sku')} error={errors.sku} placeholder="cth: BRG-0001" />
            </Field>
            <Field label="Barcode" error={errors.barcode?.message} hint="Scan barcode produk">
              <Input {...register('barcode')} error={errors.barcode} placeholder="8991001000001" />
            </Field>
            <Field label="Kategori" error={errors.category_id?.message}>
              <Select {...register('category_id')} error={errors.category_id}>
                <option value="">Pilih kategori</option>
                {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Satuan" error={errors.unit_id?.message}>
              <Select {...register('unit_id')} error={errors.unit_id}>
                <option value="">Pilih satuan</option>
                {(units.data || []).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.short_name})</option>)}
              </Select>
            </Field>
            <Field label="Harga Beli" required error={errors.purchase_price?.message}>
              <Input type="number" step="100" {...register('purchase_price')} error={errors.purchase_price} />
            </Field>
            <Field label="Harga Jual" required error={errors.sale_price?.message}>
              <Input type="number" step="100" {...register('sale_price')} error={errors.sale_price} />
            </Field>
            <Field label="Stok Awal" error={errors.stock?.message}>
              <Input type="number" step="0.001" {...register('stock')} error={errors.stock} disabled={isEdit} />
            </Field>
            <Field label="Stok Minimum" error={errors.min_stock?.message} hint="Peringatan stok menipis">
              <Input type="number" step="0.001" {...register('min_stock')} error={errors.min_stock} />
            </Field>
            <Field label="Status">
              <Select {...register('status')}>
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </Select>
            </Field>
          </div>

          <Field label="Deskripsi" error={errors.description?.message}>
            <Textarea rows={3} {...register('description')} error={errors.description} placeholder="Deskripsi singkat produk..." />
          </Field>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" type="button" onClick={() => navigate('/products')}>
              Batal
            </Button>
            <Button type="submit" loading={isSubmitting} icon={Save}>
              Simpan Produk
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
