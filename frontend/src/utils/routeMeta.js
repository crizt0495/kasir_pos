export const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/pos': 'POS / Kasir',
  '/products': 'Produk',
  '/categories': 'Kategori',
  '/customers': 'Pelanggan',
  '/suppliers': 'Supplier',
  '/inventory': 'Stok',
  '/inventory/movements': 'Pergerakan Stok',
  '/inventory/opname': 'Stock Opname',
  '/purchases': 'Pembelian',
  '/sales': 'Penjualan',
  '/returns': 'Retur',
  '/cashier': 'Kasir',
  '/expenses': 'Pengeluaran',
  '/reports': 'Laporan',
  '/profit-sharing': 'Bagi Hasil 2,5%',
  '/users': 'Users',
  '/roles': 'Roles',
  '/permissions': 'Permissions',
  '/audit-logs': 'Audit Log',
  '/settings': 'Settings',
  '/change-password': 'Ganti Password',
};

export function resolvePageTitle(pathname) {
  return PAGE_TITLES[pathname] || PAGE_TITLES[`/${pathname.split('/')[1]}`] || 'POS';
}
