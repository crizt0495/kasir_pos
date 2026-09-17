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
const { saveApiCache, clearApiCache } = await import('../offline/apiCache.js');

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

describe('Axios interceptor — snapshot offline untuk GET', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(healthOkResponse));
    window.dispatchEvent.mockClear();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await clearApiCache();
  });

  const getConfig = (url) => ({ method: 'get', baseURL: '/api', url, params: null });

  it('network error + snapshot tersedia → resolusi dengan data cache', async () => {
    const config = getConfig('/products');
    await saveApiCache(config, { success: true, data: { items: [{ id: 'p1' }] } }, 200);
    const result = await rejected({ config, code: 'ERR_NETWORK', message: 'Network Error' });
    expect(result).not.toBeNull();
    expect(result.config).toBe(config);
    expect(result.status).toBe(200);
    expect(result.data.data.items).toHaveLength(1);
  });

  it('gateway 503 + snapshot tersedia → resolusi dengan data cache', async () => {
    const config = getConfig('/dashboard/summary');
    await saveApiCache(config, { success: true, data: { total_sales: 5 } }, 200);
    const result = await rejected({ config, response: { status: 503 } });
    expect(result.data.data.total_sales).toBe(5);
  });

  it('network error + TANPA snapshot → tetap reject', async () => {
    await expect(
      rejected({ config: getConfig('/belum-pernah-dibuka'), code: 'ERR_NETWORK' })
    ).rejects.toBeDefined();
  });

  it('mutasi (POST) + snapshot tersedia → TETAP reject (tidak disajikan)', async () => {
    const config = { method: 'post', baseURL: '/api', url: '/products', params: null };
    await saveApiCache(config, { success: true, data: { id: 'x' } }, 201);
    await expect(rejected({ config, code: 'ERR_NETWORK' })).rejects.toBeDefined();
  });
});