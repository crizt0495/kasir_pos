import { describe, it, expect } from 'vitest';
import { CHANGELOG, APP_VERSION, latestRelease, hasUnseenRelease, SEEN_VERSION_KEY } from './changelog.js';

describe('changelog', () => {
  it('APP_VERSION cocok dengan entry terbaru', () => {
    expect(APP_VERSION).toBe(String(CHANGELOG[0].version));
  });

  it('entry diurutkan dari versi terbaru ke lama', () => {
    const versions = CHANGELOG.map((r) => r.version);
    const sorted = [...versions].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    expect(versions).toEqual(sorted);
  });

  it('setiap rilis punya versi, tanggal, judul, dan setidaknya satu konten', () => {
    for (const release of CHANGELOG) {
      expect(String(release.version)).toMatch(/^\d+\.\d+\.\d+$/);
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(release.title.trim().length).toBeGreaterThan(0);
      const total = (release.features?.length || 0) + (release.improvements?.length || 0) + (release.fixes?.length || 0);
      expect(total).toBeGreaterThan(0);
    }
  });

  it('latestRelease mengembalikan rilis terbaru', () => {
    expect(latestRelease()).toBe(CHANGELOG[0]);
  });

  it('hasUnseenRelease return true saat belum pernah dilihat (fallback non-browser)', () => {
    expect(hasUnseenRelease()).toBe(true);
  });

  it('key localStorage stabil', () => {
    expect(SEEN_VERSION_KEY).toBe('pos.seen.version');
  });
});