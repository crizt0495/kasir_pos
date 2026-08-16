import { useState } from 'react';
import { Package } from 'lucide-react';

/**
 * Gambar produk dengan fallback placeholder otomatis:
 * - jika `src` kosong → ikon produk
 * - jika gambar gagal dimuat (onError) → ikon produk
 *
 * Props:
 * - src, alt: URL & teks alternatif
 * - className: ukuran & bentuk (mis. "h-10 w-10")
 * - imgClassName: tambahan untuk elemen <img> (mis. efek hover zoom)
 * - rounded: boolean default true (rounded-lg)
 */
export default function ProductImage({ src, alt = '', className = '', imgClassName = '', rounded = true }) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-300 ${rounded ? 'rounded-lg' : ''} ${className}`}
      >
        <Package className="h-1/2 w-1/2 max-h-10 max-w-10" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setError(true)}
      className={`shrink-0 object-cover ${rounded ? 'rounded-lg' : ''} ${className} ${imgClassName}`}
    />
  );
}
