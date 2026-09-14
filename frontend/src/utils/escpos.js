import { formatRupiah, formatDateTimeWIB, paymentMethodLabel, formatQty, formatNumber } from './format.js';

// ============================================================
// ESC/POS encoder untuk printer thermal (58mm / 80mm)
// Nyatakan struktur struk sebagai teks baris per baris lalu
// terjemahkan ke byte ESC/POS. Murni & mudah di-test.
// ============================================================

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const CMD = {
  init: () => Uint8Array.of(ESC, 0x40),
  align: (n) => Uint8Array.of(ESC, 0x61, n), // 0 kiri, 1 tengah, 2 kanan
  printMode: (n) => Uint8Array.of(ESC, 0x21, n), // bit1 fontB, bit3 bold, bit4 dh, bit5 dw
  selectFontA: () => Uint8Array.of(ESC, 0x4d, 0), // ESC M 0 = font standar (32 kolom @58mm / 48 @80mm)
  charSize: (n) => Uint8Array.of(GS, 0x21, n), // GS ! n — n=0 ukuran normal
  feed: (n) => Uint8Array.of(ESC, 0x64, n),
  cutFull: () => Uint8Array.of(GS, 0x56, 0),
  cutPartial: () => Uint8Array.of(GS, 0x56, 65, 0),
};

const NORMAL = Uint8Array.of();
const BOLD = Uint8Array.of(ESC, 0x21, 0x08);

/** Karakter non-ASCII yang umum → ekuivalen ASCII (banyak printer thermal hanya CP437). */
const CHAR_MAP = {
  '×': 'x',
  '—': '-',
  '–': '-',
  '’': "'",
  '‘': "'",
  '“': '"',
  '”': '"',
  '…': '...',
  '«': '<',
  '»': '>',
  '⇒': '>',
  '▶': '>',
  '✓': 'v',
  '·': '.',
  '\u00a0': ' ',
};

/** Sanitasi teks agar aman dikirim ke printer thermal (ASCII-safe). */
export function sanitize(text) {
  return String(text == null ? '' : text)
    .split('')
    .map((ch) => (ch in CHAR_MAP ? CHAR_MAP[ch] : ch.codePointAt(0) < 128 ? ch : '?'))
    .join('');
}

function dashed(width) {
  return '-'.repeat(width);
}

/** Pecah teks panjang jadi beberapa baris sesuai lebar (dengan pemotongan kata). */
function wrap(text, width) {
  const words = sanitize(text).split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
    if (current.length > width) {
      while (current.length > width) {
        lines.push(current.slice(0, width));
        current = current.slice(width);
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Garis solid (sama seperti border-t di Receipt.jsx). */
function solidLine(width) {
  return '='.repeat(width);
}

/**
 * Kolom angka item (Qty / Harga / Subtotal) — semuanya rata kanan.
 * Subtotal selalu mentok ke tepi kanan; Qty & Harga mengikuti di kirinya.
 */
function numberColumns(width, showHarga) {
  const subtotalRight = width - 1;
  const hargaRight = showHarga ? subtotalRight - 10 : -1;
  const qtyRight = showHarga ? hargaRight - 8 : subtotalRight - 12;
  return { qtyRight, hargaRight, subtotalRight };
}

/** Tulis teks rata kanan ke buffer (berakhir tepat di kolom `right`). */
function putRight(buf, text, right) {
  const t = sanitize(text).slice(0, buf.length);
  let start = right - t.length + 1;
  if (start < 0) start = 0;
  for (let i = 0; i < t.length; i += 1) buf[start + i] = t[i];
  return buf;
}

/** Header kolom item: "Item" (kiri) + Qty/Harga/Subtotal (rata kanan). */
function itemHeader(width, cols, showHarga) {
  const buf = new Array(width).fill(' ');
  for (let i = 0; i < 'Item'.length; i += 1) buf[i] = 'Item'[i];
  putRight(buf, 'Qty', cols.qtyRight);
  if (showHarga) putRight(buf, 'Harga', cols.hargaRight);
  putRight(buf, 'Subtotal', cols.subtotalRight);
  return buf.join('');
}

/** Baris nilai item (qty / harga satuan / subtotal) rata kanan. */
function itemValueRow(width, cols, showHarga, qty, harga, subtotal) {
  const buf = new Array(width).fill(' ');
  putRight(buf, formatQty(Number(qty) || 0), cols.qtyRight);
  if (showHarga) putRight(buf, formatNumber(harga), cols.hargaRight);
  putRight(buf, formatNumber(subtotal), cols.subtotalRight);
  return buf.join('');
}

/**
 * Susun struktur struk sebagai [ { text, style, align } ].
 * Layout disamakan persis dengan Receipt.jsx (modal preview).
 */
export function buildReceiptLayout({ sale, store, pos }) {
  const width = pos?.receipt_width === '80mm' ? 48 : 32;

  const lines = [];
  const push = (text, extra = {}) => lines.push({ text, ...extra });
  const centered = (text, extra = {}) => {
    for (const t of wrap(text, width)) push(t, { align: 'center', ...extra });
  };

  // ---------- Kop toko ----------
  push((store?.name || 'Toko Anda').toUpperCase(), { style: 'bold', align: 'center' });
  if (store?.address) centered(store.address);
  if (store?.phone) centered(`Telp: ${store.phone}`);
  if (store?.npwp) centered(`NPWP: ${store.npwp}`);
  push(dashed(width));

  // ---------- Info transaksi (titik dua sejajar) ----------
  const info = (label, value, extra = {}) => {
    const prefix = `${label.padEnd(9)} : `;
    const parts = wrap(value == null || value === '' ? '-' : String(value), width - prefix.length);
    parts.forEach((t, i) => push((i === 0 ? prefix : ' '.repeat(prefix.length)) + t, extra));
  };
  info('No.', sale?.invoice_number);
  info('Tanggal', sale?.created_at ? formatDateTimeWIB(sale.created_at) : '-');
  info('Kasir', sale?.cashier?.profiles?.full_name || sale?.cashier?.username);
  if (sale?.customer) info('Pelanggan', sale.customer.name);
  push(dashed(width));

  // ---------- Item ----------
  // Nama produk (bold) di baris sendiri; baris berikutnya memuat kolom
  // Qty / Harga Satuan / Subtotal rata kanan (atan "Tampilkan Harga
  // Satuan" dimatikan, kolom Harga dihilangkan).
  const showHarga = pos?.show_unit_price !== false;
  const itemCols = numberColumns(width, showHarga);
  push(itemHeader(width, itemCols, showHarga), { style: 'bold' });
  push(dashed(width));

  for (const it of sale?.items || []) {
    const name = it.product?.name || 'Produk';
    const unitLabel = it.product?.unit?.short_name || it.product?.unit?.name;
    for (const t of wrap(name, width)) push(t, { style: 'bold' });
    if (unitLabel) push(sanitize(unitLabel));
    push(itemValueRow(width, itemCols, showHarga, it.quantity, it.price, it.subtotal));
    if (Number(it.discount) > 0) {
      push(`  (disc -${formatRupiah(it.discount)})`);
    }
  }
  push(dashed(width));

  // ---------- Rangkuman ----------
  const totalQty = (sale?.items || []).reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  info('JUMLAH ITEM', formatQty(totalQty));
  if (Number(sale?.discount) > 0) info('Diskon', `-${formatRupiah(sale?.discount)}`);
  if (Number(sale?.tax) > 0) info('Pajak', formatRupiah(sale?.tax));
  if (Number(sale?.additional_cost) > 0) info('Biaya Lain', formatRupiah(sale?.additional_cost));

  push(solidLine(width));
  info('TOTAL', formatRupiah(sale?.total), { style: 'bold' });
  info(paymentMethodLabel(sale?.payment_method), formatRupiah(sale?.payments?.[0]?.cash_received ?? sale?.total));
  if (Number(sale?.payments?.[0]?.change_amount) > 0) {
    info('Kembalian', formatRupiah(sale?.payments?.[0]?.change_amount));
  }

  // ---------- Hutang ----------
  const cashReceived = Number(sale?.payments?.[0]?.cash_received);
  const total = Number(sale?.total || 0);
  if (sale?.payments?.[0]?.cash_received != null && cashReceived < total) {
    push(dashed(width));
    centered('SISA HUTANG', { style: 'bold' });
    centered(formatRupiah(total - cashReceived), { style: 'bold' });
    info('TOTAL', formatRupiah(total));
    info('DIBAYAR', formatRupiah(cashReceived));
    info('SISA HUTANG', formatRupiah(total - cashReceived));
    centered('STATUS: BELUM LUNAS', { style: 'bold' });
  }

  // ---------- Footer ----------
  push(dashed(width));
  push('');
  centered('Barang yang sudah dibeli tidak dapat dikembalikan kecuali ada kesalahan dari toko.');
  if (pos?.show_footer_nota !== false) {
    const defaultFooter = 'Terima kasih atas kunjungan Anda!';
    const raw = pos?.footer_nota == null ? defaultFooter : String(pos?.footer_nota);
    const footerText = raw.trim();
    if (footerText) {
      push('');
      for (const t of footerText.split('\n').flatMap((p) => wrap(p, width))) centered(t);
    }
  }

  return { width, lines };
}

/**
 * Skor kerapian layout struk (0–100). Dipakai test & halaman preview agar
 * kualitas cetak terukur. Mengembalikan daftar temuan yang bisa ditindak.
 */
export function scoreReceiptLayout({ width, lines }) {
  const issues = [];
  const texts = lines.map((l) => l.text);

  // 1) Tidak ada baris melebihi lebar kolom
  lines.forEach((l, i) => {
    if (sanitize(l.text).length > width) issues.push({ line: i + 1, type: 'overflow' });
  });

  // 2) Titik dua blok info harus sejajar
  const infoColons = texts
    .filter((t) => /^(No\.|Tanggal|Kasir|Pelanggan)\s*:/.test(t))
    .map((t) => t.indexOf(':'))
    .filter((i) => i >= 0);
  if (infoColons.length > 1 && new Set(infoColons).size > 1) {
    issues.push({ type: 'info-colon' });
  }

  // 3) Header kolom item harus rata kanan sampai tepi kolom
  const atRightEdge = (t) => t.length === width && !t.endsWith(' ');
  const header = lines.find((l) => l.style === 'bold' && /^Item/.test(l.text) && /Subtotal/.test(l.text));
  if (header && !atRightEdge(header.text)) {
    issues.push({ type: 'header-align' });
  }

  // 4) Baris nilai item (diawali banyak spasi, diakhiri angka) harus mentok
  //    kanan — hasil putRight() selalu berakhir tepat di tepi kolom.
  lines.forEach((l, i) => {
    const t = l.text;
    if (l.align === 'center') return;
    if (!/^\s{4,}/.test(t)) return;
    if (!/\d$/.test(t)) return;
    if (!atRightEdge(t)) issues.push({ line: i + 1, type: 'money-align' });
  });

  // 5) Baris rangkuman harus memakai titik dua ("JUMLAH ITEM : 4")
  const totalLabels = /^(JUMLAH ITEM|Diskon|Pajak|Biaya Lain|TOTAL|Tunai|Debit|QRIS|Kredit|Transfer|E-Wallet|Kembalian|DIBAYAR)\s*/;
  texts.forEach((t, i) => {
    if (totalLabels.test(t) && t.indexOf(':') < 0) issues.push({ line: i + 1, type: 'total-colon' });
  });

  const penalty = issues.reduce((acc, it) => acc + (it.type === 'overflow' ? 20 : 10), 0);
  return { score: Math.max(0, 100 - penalty), issues };
}



/** Terjemahkan layout → byte ESC/POS (Uint8Array). */
export function encodeLinesToBytes({ width, lines }) {
  const parts = [];
  parts.push(CMD.init());
  // Kunci font standar + ukuran normal + alignment kiri, agar lebar baris
  // persis width (32/48 kolom) di semua printer thermal — mencegah struk jorok.
  parts.push(CMD.selectFontA());
  parts.push(CMD.charSize(0));
  parts.push(CMD.align(0));
  for (const item of lines) {
    // Baris tengah: kirim teks APA ADANYA + perintah ESC a 1 (printer yang
    // memusatkan). Jangan di-pad manual — dulu dua-duanya membuat teks
    // tergeser ke kanan (dobel center) di kertas.
    const text = sanitize(item.align === 'center' ? item.text.trim() : item.text).slice(0, width);
    let mode = NORMAL;
    if (item.style === 'bold') mode = BOLD;
    if (item.align === 'center') parts.push(CMD.align(1));
    else parts.push(CMD.align(0));
    if (item.style !== 'normal') parts.push(mode);
    parts.push(new TextEncoder().encode(text));
    parts.push(Uint8Array.of(LF));
    if (item.style !== 'normal') parts.push(CMD.printMode(0));
  }
  parts.push(CMD.feed(3));
  parts.push(CMD.cutPartial());

  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Satu panggil: struk sale + store + pos → byte ESC/POS siap kirim ke printer. */
export function buildEscPosReceipt({ sale, store, pos }) {
  return encodeLinesToBytes(buildReceiptLayout({ sale, store, pos }));
}