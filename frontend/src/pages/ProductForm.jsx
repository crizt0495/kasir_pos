import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save, ArrowLeft, Plus, Camera } from 'lucide-react';
import { productsApi, categoriesApi, unitsApi } from '../api/index.js';
import { useApi } from '../hooks/useApi.js';
import { usePermission } from '../hooks/usePermission.js';
import { productSchema, categorySchema, unitSchema } from '../schemas/index.js';
import { validateSchema } from '../utils/validation.js';
import { toast } from '../stores/uiStore.js';
import { getErrorMessage } from '../api/client.js';
import { Button, Field, Input, Select, Textarea, CurrencyInput, Card, Modal, Skeleton, ErrorState, BarcodeScanner } from '../components/ui/index.jsx';
import ProductImage from '../components/ProductImage.jsx';

export default function ProductForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(isEdit);
  const { can } = usePermission();

  const categories = useApi(() => categoriesApi.list({ pageSize: 1000 }).then((r) => r.data?.items || []), []);
  const units = useApi(() => unitsApi.list().then((r) => r.data), []);

  const [catModal, setCatModal] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', description: '' });
  const [catSaving, setCatSaving] = useState(false);

  const [unitModal, setUnitModal] = useState(false);
  const [unitForm, setUnitForm] = useState({ name: '', short_name: '' });
  const [unitSaving, setUnitSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    trigger,
    formState: { errors, isSubmitting, isValid },
  } = useForm({
    resolver: zodResolver(productSchema),
    mode: 'onChange',
    defaultValues: {
      sku: '', barcode: '', name: '', category_id: '', unit_id: '', purchase_price: '',
      sale_price: '', stock: '', min_stock: '', status: 'active', description: '', image_url: '',
    },
  });

  useEffect(() => {
    trigger();
  }, [trigger]);

  const imageUrl = watch('image_url');

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
        trigger();
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
      image_url: values.image_url || null,
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

  const catValidation = useMemo(() => validateSchema(categorySchema, { status: 'active', ...catForm }), [catForm]);
  const unitValidation = useMemo(() => validateSchema(unitSchema, unitForm), [unitForm]);

  const saveCategory = async () => {
    if (!catValidation.isValid) {
      toast.error(Object.values(catValidation.errors)[0]);
      return;
    }
    setCatSaving(true);
    try {
      const res = await categoriesApi.create(catForm);
      toast.success('Kategori berhasil dibuat');
      setCatModal(false);
      setCatForm({ name: '', description: '' });
      await categories.reload();
      setValue('category_id', res.data?.id || '');
    } catch (error) { toast.error(getErrorMessage(error, 'Gagal membuat kategori')); }
    finally { setCatSaving(false); }
  };

  const saveUnit = async () => {
    if (!unitValidation.isValid) {
      toast.error(Object.values(unitValidation.errors)[0]);
      return;
    }
    setUnitSaving(true);
    try {
      const res = await unitsApi.create(unitForm);
      toast.success('Satuan berhasil dibuat');
      setUnitModal(false);
      setUnitForm({ name: '', short_name: '' });
      await units.reload();
      setValue('unit_id', res.data?.id || '');
    } catch (error) { toast.error(getErrorMessage(error, 'Gagal membuat satuan')); }
    finally { setUnitSaving(false); }
  };

  const handleScan = (code) => {
    setScannerOpen(false);
    setValue('barcode', code, { shouldValidate: true });
    toast.success('Barcode terisi');
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
              <div className="relative">
                <Input {...register('barcode')} error={errors.barcode} placeholder="8991001000001" className="pr-10 font-mono tracking-wider" />
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  title="Scan barcode dengan kamera"
                  aria-label="Scan barcode dengan kamera"
                  className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition-all duration-150 hover:bg-primary-50 hover:text-primary-600"
                >
                  <Camera className="h-4 w-4" />
                </button>
              </div>
            </Field>
            <Field label="Kategori" error={errors.category_id?.message}>
              <div className="flex items-center gap-1">
                <Select {...register('category_id')} error={errors.category_id} className="flex-1">
                  <option value="">Pilih kategori</option>
                  {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                {can('categories.create') && (
                  <button type="button" onClick={() => setCatModal(true)} title="Tambah kategori" className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-400 hover:border-primary-300 hover:text-primary-500 transition-colors">
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
            </Field>
            <Field label="Satuan" error={errors.unit_id?.message}>
              <div className="flex items-center gap-1">
                <Select {...register('unit_id')} error={errors.unit_id} className="flex-1">
                  <option value="">Pilih satuan</option>
                  {(units.data || []).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.short_name})</option>)}
                </Select>
                {can('products.create') && (
                  <button type="button" onClick={() => setUnitModal(true)} title="Tambah satuan" className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-400 hover:border-primary-300 hover:text-primary-500 transition-colors">
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
            </Field>
            <Field label="Harga Beli" required error={errors.purchase_price?.message}>
              <Controller
                control={control}
                name="purchase_price"
                render={({ field }) => (
                  <CurrencyInput value={field.value} onChange={field.onChange} error={errors.purchase_price} placeholder="0" />
                )}
              />
            </Field>
            <Field label="Harga Jual" required error={errors.sale_price?.message}>
              <Controller
                control={control}
                name="sale_price"
                render={({ field }) => (
                  <CurrencyInput value={field.value} onChange={field.onChange} error={errors.sale_price} placeholder="0" />
                )}
              />
            </Field>
            <Field label="Stok Awal" error={errors.stock?.message}>
              <Input type="number" step="0.001" {...register('stock')} error={errors.stock} disabled={isEdit} placeholder="0" />
            </Field>
            <Field label="Stok Minimum" error={errors.min_stock?.message} hint="Peringatan stok menipis">
              <Input type="number" step="0.001" {...register('min_stock')} error={errors.min_stock} placeholder="0" />
            </Field>
            <Field label="Status">
              <Select {...register('status')}>
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </Select>
            </Field>
            <Field label="Foto Produk (URL)" error={errors.image_url?.message} hint="Tempel link gambar produk (opsional)">
              <div className="flex items-center gap-3">
                <Input {...register('image_url')} error={errors.image_url} placeholder="https://contoh.com/foto-produk.jpg" className="flex-1" />
                <ProductImage src={imageUrl} alt="Preview foto produk" className="h-12 w-12" />
              </div>
            </Field>
          </div>

          <Field label="Deskripsi" error={errors.description?.message}>
            <Textarea rows={3} {...register('description')} error={errors.description} placeholder="Deskripsi singkat produk..." />
          </Field>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" type="button" onClick={() => navigate('/products')}>
              Batal
            </Button>
            <Button
              type="submit"
              disabled={!isValid || isSubmitting}
              loading={isSubmitting}
              icon={Save}
            >
              Simpan Produk
            </Button>
          </div>
        </form>
      </Card>

      <Modal
        open={catModal}
        onClose={() => setCatModal(false)}
        title="Tambah Kategori"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCatModal(false)}>Batal</Button>
            <Button onClick={saveCategory} loading={catSaving} disabled={!catValidation.isValid}>Simpan</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nama Kategori" required error={catValidation.errors.name}>
            <Input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} placeholder="cth: Makanan" autoFocus error={!!catValidation.errors.name} />
          </Field>
          <Field label="Deskripsi">
            <Input value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} placeholder="Deskripsi singkat (opsional)" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={unitModal}
        onClose={() => setUnitModal(false)}
        title="Tambah Satuan"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUnitModal(false)}>Batal</Button>
            <Button onClick={saveUnit} loading={unitSaving} disabled={!unitValidation.isValid}>Simpan</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nama Satuan" required error={unitValidation.errors.name}>
            <Input value={unitForm.name} onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })} placeholder="cth: Kilogram" autoFocus error={!!unitValidation.errors.name} />
          </Field>
          <Field label="Singkatan" required hint="Singkatan yang ditampilkan di tabel" error={unitValidation.errors.short_name}>
            <Input value={unitForm.short_name} onChange={(e) => setUnitForm({ ...unitForm, short_name: e.target.value })} placeholder="cth: Kg" error={!!unitValidation.errors.short_name} />
          </Field>
        </div>
      </Modal>

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
      />
    </div>
  );
}
