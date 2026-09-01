import axios from 'axios';

/**
 * Axios instance — cookie httpOnly dipakai untuk autentikasi.
 * baseURL: VITE_API_BASE_URL atau '/api' (Vite proxy / Vercel rewrite).
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
  timeout: 30000,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    try {
      const status = error?.response?.status;
      const path = window?.location?.pathname || '';

      if (status === 401 && !path.startsWith('/login') && !path.startsWith('/change-password')) {
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
      if (status === 500 && (path.startsWith('/login') || error?.config?.url?.includes('/auth/'))) {
        document.cookie = 'pos_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
        if (!path.startsWith('/login')) {
          window.location.href = '/login';
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
