import { describe, it, expect } from 'vitest';
import { landingPath } from './landing.js';

describe('landingPath', () => {
  it('user dengan dashboard.view → /dashboard', () => {
    expect(landingPath({ permissions: ['dashboard.view', 'pos.access'] })).toBe('/dashboard');
  });
  it('kasir tanpa dashboard.view → /pos', () => {
    expect(landingPath({ permissions: ['pos.access', 'sales.view'] })).toBe('/pos');
  });
  it('user null → fallback default /dashboard', () => {
    expect(landingPath(null)).toBe('/dashboard');
  });
});