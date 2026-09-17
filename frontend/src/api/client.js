import axios from 'axios';
import { verifyBackendReachable } from '../utils/connectivity.js';
import { saveApiCache, loadApiCache } from '../offline/apiCache.js';

/**
 * Axios instance — cookie httpOnly dipakai untuk autentikasi.
 * baseURL: VITE_API_BASE_URL atau '/api' (Vite proxy / Vercel rewrite).
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
  timeout: 30000,
});

/**
 * Simpan respons GET sukses ke snapshot offline (fire-and-forget).
 * Data ini dipakai saat jaringan mati/gateway 503 supaya halaman tetap
 * menampilkan data terakhir yang diketahui (bukan ErrorState kosong).
 */
api.interceptors.response.use(
  (response) => {
    try {
      saveApiCache(response.config, response.data, response.status).catch(() => {});
    } catch {
      /* snapshot opsional — jangan ganggu aliran normal */
    }
    return response;
  },
  async (error) => {
    try {
      const status = error?.response?.status;
      const path = window?.location?.pathname || '';
      const browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

      // 401 dari jaringan/proxy yang "pura-pura" server (mis. koneksi terputus,
      // captive portal) jangan dianggap sesi kadaluarsa. Logout hanya ketika
      // backend BENAR-BENAR terjangkau (ping /api/health sukses) & menjawab 401.
      if (status === 401 && !browserOffline && !path.startsWith('/login') && !path.startsWith('/change-password')) {
        verifyBackendReachable().then((reachable) => {
          if (reachable) window.dispatchEvent(new CustomEvent('auth:expired'));
        });
      }

      // Offline / gateway tak terjangkau (no response, 502/503/504) untuk GET:
      // sajikan snapshot terakhir agar halaman tetap bisa dibaca. Tidak berlaku
      // untuk mutasi (POST/PUT/DELETE) — itu harus gagal dan ditangani page.
      if (isNetworkError(error) && error?.config) {
        const cached = await loadApiCache(error.config);
        if (cached) {
          return {
            data: cached.data,
            status: 200,
            statusText: 'OK',
            headers: {},
            config: error.config,
            _offlineSnapshot: true,
          };
        }
      }
    } catch {
      /* swallow errors in interceptor to avoid cascading failures */
    }
    return Promise.reject(error);
  }
);

/** Helper: ambil data dari response sukses { success, message, data } */
export function unwrap(response) {
  return response?.data?.data ?? response?.data;
}

/** Helper: pesan error yang bisa ditampilkan */
export function getErrorMessage(error, fallback = 'Terjadi kesalahan, silakan coba lagi') {
  if (!error) return fallback;
  const message = error?.response?.data?.message;
  if (typeof message === 'string' && message) return message;
  if (typeof error?.message === 'string' && error.message) return error.message;
  return fallback;
}

/**
 * Deteksi error jaringan (bukan error bisnis/validasi).
 * TRUE untuk: koneksi mati/terputus & HTTP 502/503/504 (gateway tak terjangkau).
 * FALSE untuk: error server yang valid (4xx/5xx payload) — retry tidak membantu.
 */
export function isNetworkError(error) {
  if (!error) return false;
  if (error.response) {
    return [502, 503, 504].includes(Number(error.response.status));
  }
  return true;
}
