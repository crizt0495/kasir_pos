import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const listeners = {};
const memoryStorage = (() => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
})();
globalThis.window = {
  location: { pathname: '/pos' },
  localStorage: memoryStorage,
  addEventListener: (type, fn) => {
    (listeners[type] ||= []).push(fn);
  },
  removeEventListener: () => {},
  dispatchEvent: (e) => {
    (listeners[e.type] || []).forEach((fn) => fn(e));
  },
};
vi.stubGlobal('localStorage', memoryStorage);

vi.mock('../api/index.js', () => ({
  authApi: { me: vi.fn() },
}));

const { useAuthStore } = await import('../stores/authStore.js');
const { authApi } = await import('../api/index.js');

const userObj = { id: 'u1', username: 'admin', roles: [{ code: 'owner', name: 'Owner' }] };

function givenLoggedIn() {
  useAuthStore.setState({ user: userObj, loading: true });
}

describe('bootstrap — JANGAN logout saat offline', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, loading: true });
    vi.mocked(authApi.me).mockReset();
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('koneksi mati (error tanpa response) → sesi dipertahankan', async () => {
    givenLoggedIn();
    vi.mocked(authApi.me).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().user).toBe(userObj);
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it('service worker offline fallback (HTTP 503) → sesi dipertahankan', async () => {
    givenLoggedIn();
    vi.mocked(authApi.me).mockRejectedValueOnce({ response: { status: 503 } });
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().user).toBe(userObj);
  });

  it('navigator offline + respons 401 (mis. captive portal) → sesi dipertahankan', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    givenLoggedIn();
    vi.mocked(authApi.me).mockRejectedValueOnce({ response: { status: 401, data: {} } });
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().user).toBe(userObj);
  });

  it('online + 401 asli (sesi kedaluwarsa) → sesi dibersihkan', async () => {
    givenLoggedIn();
    vi.mocked(authApi.me).mockRejectedValueOnce({ response: { status: 401, data: {} } });
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().user).toBeNull();
  });
});

describe('event auth:expired — diabaikan saat offline', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('navigator offline → clear TIDAK dipanggil', () => {
    vi.stubGlobal('navigator', { onLine: false });
    givenLoggedIn();
    window.dispatchEvent(new CustomEvent('auth:expired'));
    expect(useAuthStore.getState().user).toBe(userObj);
  });

  it('navigator online → clear dipanggil (sesi kadaluarsa asli)', () => {
    vi.stubGlobal('navigator', { onLine: true });
    givenLoggedIn();
    window.dispatchEvent(new CustomEvent('auth:expired'));
    expect(useAuthStore.getState().user).toBeNull();
  });
});