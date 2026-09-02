import { formatRupiah, formatNumber, formatDateTime, paymentMethodLabel } from '../../utils/format.js';

/**
 * Struk thermal 58mm / 80mm.
 * Menggunakan font monospace; lebar disesuaikan setting toko.
 */
export default function Receipt({ sale, store, pos }) {
  const width = pos?.receipt_width === '80mm' ? '80mm' : '58mm';
  const storeName = store?.name || 'Toko Anda';
  const items = sale?.items || [];

  return (
    <div className="receipt-print mx-auto bg-white p-4 font-mono text-xs text-black" style={{ width }}>
      {/* Kop */}
      <div className="text-center">
        <p className="text-sm font-bold uppercase">{storeName}</p>
        {store?.address && <p>{store.address}</p>}
        {store?.phone && <p>Telp: {store.phone}</p>}
        {store?.npwp && <p>NPWP: {store.npwp}</p>}
      </div>

      <Divider />

      <div className="space-y-0.5">
        <p>No : {sale?.invoice_number}</p>
        <p>Tanggal : {sale?.created_at ? formatDateTime(sale.created_at) : '-'}</p>
        <p>Kasir : {sale?.cashier?.profiles?.full_name || sale?.cashier?.username || '-'}</p>
        {sale?.customer && <p>Pelanggan : {sale.customer.name}</p>}
      </div>

      <Divider />

      {/* Item */}
      <div>
        <div className="flex justify-between">
          <span className="flex-1">Item</span>
          <span className="w-16 text-right">Qty</span>
          <span className="w-24 text-right">Subtotal</span>
        </div>
        {items.map((it) => (
          <div key={it.id} className="mt-0.5">
            <p className="leading-tight">{it.product?.name || 'Produk'}</p>
            <div className="flex justify-between pl-1 text-[11px]">
              <span>
                {formatNumber(it.quantity)} x {formatRupiah(it.price)}
                {Number(it.discount) > 0 && <span className="text-slate-500"> (disc {formatRupiah(it.discount)})</span>}
              </span>
              <span className="w-24 text-right">{formatRupiah(it.subtotal)}</span>
            </div>
          </div>
        ))}
      </div>

      <Divider />

      {/* Total */}
      <div className="space-y-0.5">
        <Row label="Subtotal" value={formatRupiah(sale?.subtotal)} />
        {Number(sale?.discount) > 0 && <Row label="Diskon" value={`-${formatRupiah(sale?.discount)}`} />}
        {Number(sale?.tax) > 0 && <Row label="Pajak" value={formatRupiah(sale?.tax)} />}
        {Number(sale?.additional_cost) > 0 && <Row label="Biaya Lain" value={formatRupiah(sale?.additional_cost)} />}
        <div className="flex justify-between border-t border-black pt-1 text-sm font-bold">
          <span>TOTAL</span>
          <span>{formatRupiah(sale?.total)}</span>
        </div>
        <Row label={paymentMethodLabel(sale?.payment_method)} value={formatRupiah(sale?.payments?.[0]?.cash_received ?? sale?.total)} />
        {Number(sale?.payments?.[0]?.change_amount) > 0 && (
          <Row label="Kembalian" value={formatRupiah(sale?.payments?.[0]?.change_amount)} />
        )}
      </div>

      {/* Tampilkan info hutang (spec §19) bila pembayaran kurang dari total */}
      {(() => {
        const cashReceived = Number(sale?.payments?.[0]?.cash_received);
        const total = Number(sale?.total || 0);
        const isDebt = sale?.payments?.[0]?.cash_received != null && cashReceived < total;
        if (!isDebt) return null;
        return (
          <>
            <Divider />
            <div className="space-y-0.5 border-2 border-black p-2">
              <div className="text-center">
                <p className="font-bold">SISA HUTANG</p>
                <p className="text-sm font-bold">{formatRupiah(total - cashReceived)}</p>
              </div>
              <Row label="TOTAL" value={formatRupiah(total)} />
              <Row label="DIBAYAR" value={formatRupiah(cashReceived)} />
              <Row label="SISA HUTANG" value={<span className="font-bold">{formatRupiah(total - cashReceived)}</span>} />
              <div className="text-center pt-1">
                <p className="font-bold">STATUS: BELUM LUNAS</p>
              </div>
            </div>
          </>
        );
      })()}

      <Divider />

      <div className="text-center leading-relaxed">
        <p>Terima kasih atas kunjungan Anda!</p>
        <p>Barang yang sudah dibeli tidak dapat dikembalikan</p>
        <p>kecuali ada kesalahan dari toko.</p>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="my-2 border-t border-dashed border-black" />;
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
