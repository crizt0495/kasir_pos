import { useState, useEffect, useCallback } from 'react';

/**
 * Hook pagination yang auto-adjust page ketika totalPages berkurang
 * (misal: setelah delete item terakhir di halaman terakhir).
 *
 * @param {number|undefined} totalPages - jumlah total halaman dari API
 * @param {number} defaultPage - halaman awal (default 1)
 * @returns {[number, (page: number) => void, () => void]} [page, setPage, resetPage]
 */
export function usePagination(totalPages, defaultPage = 1) {
  const [page, setPage] = useState(defaultPage);

  useEffect(() => {
    if (totalPages && page > totalPages && page > 1) {
      setPage(totalPages);
    }
  }, [totalPages, page]);

  const resetPage = useCallback(() => {
    setPage(1);
  }, []);

  return [page, setPage, resetPage];
}
