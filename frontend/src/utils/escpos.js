import { formatRupiah, formatDateTime, paymentMethodLabel, formatQty } from './format.js';

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
const BOLD_DOUBLE = Uint8Array.of(ESC, 0x21, 0x18); // bold + double height

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

/** Pad kanan label + nilai rata kanan ke lebar baris. */
function row(width, label, value) {
  const l = sanitize(label).slice(0, Math.max(0, width - 3));
  const v = sanitize(value).slice(0, Math.max(0, width - l.length));
  return (l + ' '.repeat(Math.max(0, width - l.length - v.length)) + v).slice(0, width);
}

function center(text, width) {
  const t = sanitize(text).slice(0, width);
  const pad = Math.max(0, Math.floor((width - t.length) / 2));
  return ' '.repeat(pad) + t;
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
 * Susun struktur struk sebagai [ { text, style, align } ].
 * Layout disamakan persis dengan Receipt.jsx (modal preview).
 */
export function buildReceiptLayout({ sale, store, pos }) {
  const width = pos?.receipt_width === '80mm' ? 48 : 32;

  const lines = [];
  const storeName = (store?.name || 'Toko Anda').toUpperCase();

  // Kop
  lines.push({ text: storeName, style: 'bold-double', align: 'center' });
  if (store?.address) lines.push({ text: store.address, align: 'center' });
  if (store?.phone) lines.push({ text: `Telp: ${store.phone}`, align: 'center' });
  if (store?.npwp) lines.push({ text: `NPWP: ${store.npwp}`, align: 'center' });
  lines.push({ text: dashed(width) });

  // Info transaksi
  lines.push({ text: `No : ${sale?.invoice_number || '-'}` });
  lines.push({ text: `Tanggal : ${sale?.created_at ? formatDateTime(sale.created_at) : '-'}` });
  lines.push({ text: `Kasir : ${sale?.cashier?.profiles?.full_name || sale?.cashier?.username || '-'}` });
  if (sale?.customer) lines.push({ text: `Pelanggan : ${sale.customer.name}` });
  lines.push({ text: dashed(width) });

  // Item header — disamakan Receipt.jsx: flex-1 + w-16 + w-24
  const qtyCol = pos?.receipt_width === '80mm' ? 12 : 8;
  const subCol = pos?.receipt_width === '80mm' ? 16 : 12;
  const nameCol = width - qtyCol - subCol;
  const hdr = 'Item' + ' '.repeat(Math.max(0, nameCol - 4)) + 'Qty'.padStart(qtyCol) + 'Subtotal'.padStart(subCol);
  lines.push({ text: hdr.slice(0, width), style: 'bold' });

  // Item detail — qty x harga (disc)   subtotal, sejajar dengan Receipt.jsx
  for (const it of sale?.items || []) {
    const name = it.product?.name || 'Produk';
    for (const t of wrap(name, width)) {
      lines.push({ text: t });
    }
    const qty = formatQty(it.quantity);
    const price = formatRupiah(it.price);
    const qtyPrice = `${qty} x ${price}`;
    const sub = formatRupiah(it.subtotal);
    const subLen = sanitize(sub).length;

    if (Number(it.discount) > 0) {
      const disc = ` (disc -${formatRupiah(it.discount)})`;
      const leftFull = `  ${qtyPrice}${disc}`;
      // Apakah muat satu baris: [qty x harga (disc)] + subtotal?
      if (leftFull.length + subLen < width) {
        lines.push({ text: row(width, leftFull, sub) });
      } else {
        // Tidak muat: qty x harga + subtotal, diskon di baris berikutnya
        lines.push({ text: row(width, `  ${qtyPrice}`, sub) });
        lines.push({ text: `   ${disc}`.slice(0, width) });
      }
    } else {
      lines.push({ text: row(width, `  ${qtyPrice}`, sub) });
    }
  }
  lines.push({ text: dashed(width) });

  // Total section
  lines.push({ text: row(width, 'Subtotal', formatRupiah(sale?.subtotal)) });
  if (Number(sale?.discount) > 0) lines.push({ text: row(width, 'Diskon', `-${formatRupiah(sale?.discount)}`) });
  if (Number(sale?.tax) > 0) lines.push({ text: row(width, 'Pajak', formatRupiah(sale?.tax)) });
  if (Number(sale?.additional_cost) > 0) lines.push({ text: row(width, 'Biaya Lain', formatRupiah(sale?.additional_cost)) });

  // Garis solid sebelum TOTAL (sama seperti border-t di Receipt.jsx)
  lines.push({ text: solidLine(width) });
  lines.push({ text: row(width, 'TOTAL', formatRupiah(sale?.total)), style: 'bold' });
  lines.push({ text: row(width, paymentMethodLabel(sale?.payment_method), formatRupiah(sale?.payments?.[0]?.cash_received ?? sale?.total)) });
  if (Number(sale?.payments?.[0]?.change_amount) > 0) {
    lines.push({ text: row(width, 'Kembalian', formatRupiah(sale?.payments?.[0]?.change_amount)) });
  }

  // Hutang
  const cashReceived = Number(sale?.payments?.[0]?.cash_received);
  const total = Number(sale?.total || 0);
  if (sale?.payments?.[0]?.cash_received != null && cashReceived < total) {
    lines.push({ text: dashed(width) });
    lines.push({ text: 'SISA HUTANG', style: 'bold', align: 'center' });
    lines.push({ text: formatRupiah(total - cashReceived), style: 'bold', align: 'center' });
    lines.push({ text: row(width, 'TOTAL', formatRupiah(total)) });
    lines.push({ text: row(width, 'DIBAYAR', formatRupiah(cashReceived)) });
    lines.push({ text: row(width, 'SISA HUTANG', formatRupiah(total - cashReceived)) });
    lines.push({ text: 'STATUS: BELUM LUNAS', style: 'bold', align: 'center' });
  }

  lines.push({ text: dashed(width) });
  for (const t of wrap('Terima kasih atas kunjungan Anda!', width)) lines.push({ text: t, align: 'center' });
  for (const t of wrap('Barang yang sudah dibeli tidak dapat dikembalikan kecuali ada kesalahan dari toko.', width)) lines.push({ text: t, align: 'center' });

  return { width, lines };
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
    const text = item.align === 'center' ? center(item.text, width) : sanitize(item.text).slice(0, width);
    let mode = NORMAL;
    if (item.style === 'bold') mode = BOLD;
    if (item.style === 'bold-double') mode = BOLD_DOUBLE;
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