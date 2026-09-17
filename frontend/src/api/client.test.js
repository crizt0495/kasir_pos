import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const listeners = {};
globalThis.window = {
  location: { pathname: '/pos' },
  addEventListener: (type, fn) => {
    (listeners[type] ||= []).push(fn);
  },
  removeEventListener: () => {},
  dispatchEvent: vi.fn((e) => {
    (listeners[e.type] || []).forEach((fn) => fn(e));
  }),
};

const { api } = await import('./client.js');

const rejected = api.interceptors.response.handlers[0].rejected;

const healthOkResponse = {
  ok: true,
  headers: { get: () => 'application/json' },
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Axios interceptor — auth:expired tidak di-dispatch saat offline', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(healthOkResponse));
    window.dispatchEvent.mockClear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('online + 401 → dispatch auth:expired', async () => {
    await expect(rejected({ response: { status: 401 } })).rejects.toBeDefined();
    await flush();
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(window.dispatchEvent.mock.calls[0][0].type).toBe('auth:expired');
  });

  it('offline + 401 → TIDAK dispatch (navigator offline)', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await expect(rejected({ response: { status: 401 } })).rejects.toBeDefined();
    await flush();
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });

  it('navigator online + health gagal (Wi-Fi nyambung, internet mati) + 401 → TIDAK dispatch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(rejected({ response: { status: 401 } })).rejects.toBeDefined();
    await flush();
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });

  it('online + 503 (gateway offline) → TIDAK dispatch', async () => {
    await expect(rejected({ response: { status: 503 } })).rejects.toBeDefined();
    await flush();
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });

  it('koneksi mati total (tanpa response object) → TIDAK dispatch', async () => {
    await expect(rejected(new TypeError('Failed to fetch'))).rejects.toBeDefined();
    await flush();
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });

  it('halaman /login + 401 → TIDAK dispatch', async () => {
    window.location.pathname = '/login';
    await expect(rejected({ response: { status: 401 } })).rejects.toBeDefined();
    await flush();
    expect(window.dispatchEvent).not.toHaveBeenCalled();
    window.location.pathname = '/pos';
  });
});