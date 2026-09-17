import { describe, it, expect, beforeEach } from 'vitest';
import {
  isCacheableConfig,
  buildCacheKey,
  saveApiCache,
  loadApiCache,
  clearApiCache,
} from '../offline/apiCache.js';

const getConfig = (over = {}) => ({
  method: 'get',
  baseURL: '/api',
  url: '/products',
  params: { page: 1, pageSize: 20 },
  ...over,
});

describe('apiCache — snapshot respons API untuk baca offline', () => {
  beforeEach(() => clearApiCache());

  it('isCacheableConfig: hanya GET JSON biasa', () => {
    expect(isCacheableConfig(getConfig())).toBe(true);
    expect(isCacheableConfig(getConfig({ method: 'post' }))).toBe(false);
    expect(isCacheableConfig(getConfig({ method: 'put' }))).toBe(false);
    expect(isCacheableConfig(getConfig({ responseType: 'blob' }))).toBe(false);
    expect(isCacheableConfig(getConfig({ url: '/auth/me' }))).toBe(false);
    expect(isCacheableConfig(null)).toBe(false);
  });

  it('buildCacheKey konsisten terhadap urutan params', () => {
    expect(buildCacheKey(getConfig({ params: { page: 1, pageSize: 20 } }))).toBe(
      buildCacheKey(getConfig({ params: { pageSize: 20, page: 1 } }))
    );
  });

  it('saveApiCache → loadApiCache mengembalikan data tersimpan', async () => {
    const config = getConfig();
    await saveApiCache(config, { success: true, data: { items: [{ id: 'p1' }] } }, 200);
    const row = await loadApiCache(config);
    expect(row).not.toBeNull();
    expect(row.data.data.items).toHaveLength(1);
  });

  it('fallback family key: param berbeda tetap mendapat snapshot endpoint', async () => {
    await saveApiCache(getConfig({ url: '/sales' }), { data: { total: 7 } }, 200);
    const row = await loadApiCache(getConfig({ url: '/sales', params: { from: 'x', to: 'y' } }));
    expect(row).not.toBeNull();
    expect(row.data.data.total).toBe(7);
  });

  it('fallback family terbaru menimpa yang lama', async () => {
    await saveApiCache(getConfig({ url: '/sales', params: { page: 1 } }), { data: 1 });
    await saveApiCache(getConfig({ url: '/sales', params: { page: 2 } }), { data: 2 });
    const row = await loadApiCache(getConfig({ url: '/sales' }));
    expect(row.data.data).toBe(2);
  });

  it('loadApiCache null bila belum pernah tersimpan', async () => {
    expect(await loadApiCache(getConfig({ url: '/never-fetched' }))).toBeNull();
  });

  it('clearApiCache mengosongkan semua snapshot', async () => {
    await saveApiCache(getConfig(), { data: 1 });
    await clearApiCache();
    expect(await loadApiCache(getConfig())).toBeNull();
  });
});