//
// Draft keranjang POS — auto-save ke IndexedDB setiap perubahan supaya
// refresh/mis-klik menu tidak menghilangkan keranjang (Poin 5).
//
import { getOne, putOne, deleteOne } from './db.js';

const DRAFT_KEY = 'pos_cart_draft';

/** Simpan draft keranjang ({ items, discount, customer, savedAt }). */
export async function saveCartDraft(draft) {
  try {
    const row = { key: DRAFT_KEY, value: { ...draft, savedAt: Date.now() } };
    await putOne('keranjang_draft', row);
    return true;
  } catch {
    return false;
  }
}

/** Baca draft keranjang terakhir (atau null bila belum ada / simpan kosong). */
export async function loadCartDraft() {
  try {
    const row = await getOne('keranjang_draft', DRAFT_KEY);
    const value = row?.value;
    if (!value) return null;
    if (!Array.isArray(value.items) || value.items.length === 0) return null;
    return value;
  } catch {
    return null;
  }
}

/** Hapus draft keranjang setelah dipakai / transaksi selesai. */
export async function clearCartDraft() {
  try {
    await deleteOne('keranjang_draft', DRAFT_KEY);
    return true;
  } catch {
    return false;
  }
}