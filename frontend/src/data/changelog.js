// Versi aplikasi & riwayat pembaruan (changelog).
// Setiap rilis: tambahkan entry baru di PALING ATAS, lalu naikkan APP_VERSION.
// Frontend menampilkan popup "Apa yang baru" otomatis saat versi terbaru
// belum pernah dilihat oleh user (disimpan di localStorage per perangkat).

export const APP_VERSION = '1.1.0';

// Key localStorage untuk menandai versi terakhir yang sudah dilihat user
export const SEEN_VERSION_KEY = 'pos.seen.version';

export const CHANGELOG = [
  {
    version: '1.1.0',
    date: '2026-09-16',
    title: 'Notifikasi Pembaruan Aplikasi',
    description:
      'Kini setiap ada versi baru aplikasi, pengguna langsung diberitahu lewat popup "Apa yang baru" berisi daftar fitur & perbaikan terbaru.',
    features: [
      'Popup "Apa yang baru" muncul otomatis saat versi rilis baru tersedia',
      'Tombol sakelar di bar atas untuk membuka daftar pembaruan kapan saja',
      'Daftar riwayat rilis lengkap mulai dari versi pertama',
    ],
    improvements: [
      'Sidebar menampilkan nomor versi aplikasi yang sebenarnya',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-08-01',
    title: 'Rilis Perdana POS Kasir',
    description:
      'Fondasi lengkap aplikasi Point of Sale untuk pengelolaan toko sehari-hari.',
    features: [
      'POS / Kasir dengan scan barcode & hitung otomatis',
      'Penjualan, retur, dan pencatatan hutang pelanggan',
      'Manajemen produk, kategori, pelanggan, dan supplier',
      'Inventori, stock opname, dan pergerakan harga',
      'Manajemen kas, pengeluaran, dan pembelian',
      'Laporan penjualan & bagi hasil 2,5%',
      'Multi-user dengan roles & permissions',
      'Notifikasi penjualan & hutang via Web Push ke pemilik',
    ],
  },
];

/** Rilis terbaru (entry paling atas daftar). */
export function latestRelease() {
  return CHANGELOG[0] || null;
}

/** Apakah ada rilis baru yang belum dilihat user di perangkat ini? */
export function hasUnseenRelease() {
  try {
    return localStorage.getItem(SEEN_VERSION_KEY) !== APP_VERSION;
  } catch {
    return true;
  }
}

/** Tandai versi (default: terbaru) sudah dilihat user. */
export function markChangelogSeen(version = APP_VERSION) {
  try {
    localStorage.setItem(SEEN_VERSION_KEY, version);
  } catch {
    /* abaikan */
  }
}