import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Lingkungan browser minimal untuk zustand persist + auth:expired ───
const map = new Map();
const memoryStorage = {
  getItem: (k) => (map.has(k) ? map.get(k) : null),
  setItem: (k, v) => map.set(k, String(v)),
  removeItem: (k) => map.delete(k),
  clear: () => map.clear(),
};
vi.stubGlobal('localStorage', memoryStorage);

const listeners = {};
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

vi.mock('../api/index.js', () => ({
  authApi: { me: vi.fn() },
}));

const { useAuthStore } = await import('../stores/authStore.js');
const { authApi } = await import('../api/index.js');

const userObj = { id: 'u1', username: 'admin', roles: [{ code: 'owner', name: 'Owner' }] };

function givenLoggedIn() {
  useAuthStore.setState({ user: userObj, loading: false });
}

describe('clear() — TIDAK hapus sesi saat offline', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offline → clear() tidak menghapus user', () => {
    vi.stubGlobal('navigator', { onLine: false });
    givenLoggedIn();
    useAuthStore.getState().clear();
    expect(useAuthStore.getState().user).toBe(userObj);
  });

  it('online → clear() menghapus user (normal)', () => {
    vi.stubGlobal('navigator', { onLine: true });
    givenLoggedIn();
    useAuthStore.getState().clear();
    expect(useAuthStore.getState().user).toBeNull();
  });
});

describe('forceClear() — selalu hapus', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offline → forceClear() tetap menghapus user', () => {
    vi.stubGlobal('navigator', { onLine: false });
    givenLoggedIn();
    useAuthStore.getState().forceClear();
    expect(useAuthStore.getState().user).toBeNull();
  });
});

describe('bootstrap — tidak logout saat offline', () => {
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

  it('service worker offline fallback (503) → sesi dipertahankan', async () => {
    givenLoggedIn();
    vi.mocked(authApi.me).mockRejectedValueOnce({ response: { status: 503 } });
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().user).toBe(userObj);
  });

  it('navigator offline + respons 401 (captive portal) → sesi dipertahankan', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    givenLoggedIn();
    vi.mocked(authApi.me).mockRejectedValueOnce({ response: { status: 401 } });
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().user).toBe(userObj);
  });

  it('online + 401 asli → sesi dibersihkan', async () => {
    givenLoggedIn();
    vi.mocked(authApi.me).mockRejectedValueOnce({ response: { status: 401 } });
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().user).toBeNull();
  });
});

describe('safety net — restore otomatis saat user=null + offline', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('user dihapus saat offline → otomatis dipulihkan', () => {
    vi.stubGlobal('navigator', { onLine: false });
    givenLoggedIn();
    // Paksa set user ke null — simulasi code path tak terduga
    useAuthStore.setState({ user: null });
    // Safety net harus mengembalikan user (dari cache closure)
    expect(useAuthStore.getState().user).toEqual(userObj);
  });

  it('user dihapus saat online → TIDAK dipulihkan (logout normal)', () => {
    vi.stubGlobal('navigator', { onLine: true });
    givenLoggedIn();
    useAuthStore.setState({ user: null });
    expect(useAuthStore.getState().user).toBeNull();
  });
});

describe('event auth:expired — diabaikan saat offline', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('navigator offline → clear tidak dipanggil', () => {
    vi.stubGlobal('navigator', { onLine: false });
    givenLoggedIn();
    window.dispatchEvent(new CustomEvent('auth:expired'));
    expect(useAuthStore.getState().user).toBe(userObj);
  });

  it('navigator online → clear dipanggil', () => {
    vi.stubGlobal('navigator', { onLine: true });
    givenLoggedIn();
    window.dispatchEvent(new CustomEvent('auth:expired'));
    expect(useAuthStore.getState().user).toBeNull();
  });
});
