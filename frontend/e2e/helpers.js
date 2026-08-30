import { expect } from '@playwright/test';

export async function login(page) {
  await page.goto('/login');
  await page.getByPlaceholder('Masukkan username').fill('admin');
  await page.getByPlaceholder('Masukkan password').fill('Admin123!');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor({ state: 'visible' });
}

export function trackErrors(page) {
  const problems = [];
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
  });
  page.on('requestfailed', (req) => problems.push(`requestfailed: ${req.url()} → ${req.failure()?.errorText || ''}`));
  page.on('response', (res) => {
    if (res.url().includes('/api/') && res.status() >= 400) {
      problems.push(`http ${res.status()}: ${res.url()}`);
    }
  });
  return problems;
}

export function assertClean(problems) {
  expect(problems, `Error tidak boleh muncul:\n${problems.join('\n')}`).toEqual([]);
}

export const fieldControl = (scope, labelText) =>
  scope
    .locator('label', { hasText: labelText })
    .first()
    .locator('xpath=..')
    .locator('input, select, textarea')
    .first();

export const uniqName = (prefix) => `${prefix} ${Date.now()}`;

export function parseRupiah(text) {
  const raw = String(text || '').replace(/[^\d-]/g, '');
  const negative = raw.startsWith('-');
  const n = Number(raw.replace(/-/g, ''));
  return (negative ? -1 : 1) * (Number.isFinite(n) ? n : 0);
}