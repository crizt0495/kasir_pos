import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hook data fetching ringan (tanpa react-query).
 * @param fetcher fungsi yang mengembalikan Promise
 * @param deps dependency array — ketika berubah, fetch ulang
 */
export function useApi(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetcherRef.current();
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({ data: null, loading: false, error });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

/** Parameter pagination default untuk halaman tabel */
export function defaultParams(page = 1, pageSize = 20, extra = {}) {
  return { page, pageSize, ...extra };
}
