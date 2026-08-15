/**
 * Bersihkan input pencarian agar aman untuk string filter PostgREST (.or()).
 *
 * supabase-js `.or()` menerima string filter mentah — nilai user yang
 * diinterpolasi ke dalamnya (mis. `name.ilike.%${q}%`) bisa memanipulasi
 * struktur filter jika mengandung koma, kurung, atau kutip. Helper ini
 * menetralkan karakter struktural filter dan membatasi panjang.
 *
 * Catatan: untuk `.ilike()` / `.eq()` biasa, supabase-js sudah mem-parameterize
 * nilai sehingga aman tanpa helper ini.
 */
export function safeSearch(value, maxLen = 100) {
  return String(value || '')
    .slice(0, maxLen)
    // Koma memisahkan filter dalam .or(); kurung/kutip mengubah struktur;
    // karakter kontrol dibuang. Karakter lain (spasi, strip, titik) tetap aman.
    .replace(/[(),"\\]/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim();
}
