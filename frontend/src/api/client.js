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
    const status = error.response?.status;
    const path = window.location.pathname;

    // Sesi kedaluwarsa / belum login → kabari store via event, redirect ke login
    if ((status === 401) && !path.startsWith('/login') && !path.startsWith('/change-password')) {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    return Promise.reject(error);
  }
);

/** Helper: ambil data dari response sukses { success, message, data } */
export function unwrap(response) {
  return response.data?.data ?? response.data;
}

/** Helper: pesan error yang bisa ditampilkan */
export function getErrorMessage(error, fallback = 'Terjadi kesalahan, silakan coba lagi') {
  return error?.response?.data?.message || error?.message || fallback;
}
