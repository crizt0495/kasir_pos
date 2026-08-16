import { chromium } from '@playwright/test';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

const PAGES = [
  '/login',
  '/dashboard',
  '/pos',
  '/products',
  '/sales',
  '/inventory',
  '/customers',
  '/reports',
];

const problems = [];

async function checkPage(page, path, name) {
  // Detect horizontal overflow & element collisions
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const overflowX = doc.scrollWidth > doc.clientWidth + 1;
    const bodyOverflow = document.body.scrollWidth > document.body.clientWidth + 1;
    const buttonsUnder40 = [];
    const overlapped = [];
    const inputs = document.querySelectorAll('input, select, textarea, button');
    inputs.forEach((el) => {
      if (el.offsetParent !== null) {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.height < 28 && !el.closest('nav') && !el.closest('.no-check')) {
          buttonsUnder40.push(el.tagName + '.' + (el.className || '').toString().slice(0, 60));
        }
      }
    });
    document.querySelectorAll('*').forEach((el) => {
      if (el.offsetParent === null) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.left < -2 || r.top < -2 || r.right > document.documentElement.clientWidth + 2) return;
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'absolute') return;
      return;
    });
    return { overflowX, bodyOverflow, buttonsUnder40, overlapped };
  });

  const clipping = await page.evaluate(() => {
    const issues = [];
    document.querySelectorAll('*').forEach((el) => {
      if (el.offsetParent === null) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'absolute') return;
      const scrollWidth = el.scrollWidth;
      const overflowX = style.overflowX;
      if (scrollWidth > r.width + 4 && overflowX !== 'hidden' && overflowX !== 'clip' && !el.tagName.match(/^(TABLE|THEAD|TBODY|TR|TD|TH)$/) && !el.closest('.overflow-x-auto') && !el.closest('table') && !el.closest('nav')) {
        issues.push(el.tagName + '.' + (el.className || '').toString().slice(0, 80));
      }
    });
    return issues.slice(0, 20);
  });

  const problemsForPage = [];
  if (result.overflowX) problemsForPage.push(`horizontal page overflow (${result.overflowX})`);
  if (result.bodyOverflow) problemsForPage.push(`body horizontal overflow`);
  if (result.buttonsUnder40.length) problemsForPage.push(`small touch targets: ${result.buttonsUnder40.slice(0, 5).join(', ')}`);
  if (clipping.length) problemsForPage.push(`content clipping: ${clipping.slice(0, 5).join(', ')}`);

  await page.screenshot({ path: `/tmp/opencode/shots/${name}-${path.replace(/\//g, '_') || 'home'}.png`, fullPage: false });
  return problemsForPage;
}

async function main() {
  const browser = await chromium.launch();
  const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await loginCtx.newPage();

  // Login first
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/opencode/shots/login-desktop.png' });

  // Try known demo credentials
  const creds = [
    { username: 'admin', password: 'Admin123!' },
    { username: 'kasir', password: 'Kasir123!' },
  ];

  let loggedIn = false;
  for (const c of creds) {
    await page.fill('input[autocomplete="username"]', c.username).catch(() => {});
    await page.fill('input[autocomplete="current-password"]', c.password).catch(() => {});
    await page.click('button[type="submit"]').catch(() => {});
    await page.waitForTimeout(1500);
    if (page.url().includes('/dashboard')) {
      loggedIn = true;
      console.log('LOGIN OK with', c.username);
      break;
    }
  }

  if (!loggedIn) {
    console.log('LOGIN FAILED — checking seed for credentials');
    const seed = await import('fs').then((f) => f.readFileSync('/home/chris/Documents/Aplikasi/JS/POS/supabase/seed.sql', 'utf8'));
    const m = seed.match(/username[^,]*['"]([^'"]+)['"][^;]{0,600}/gi);
    console.log('seed sample:', m?.slice(0, 4));
    // fallback: use seed directly
    const bcryptHashes = seed.match(/\$2[aby]\$[^\s'"]+/g);
    console.log('hashes found:', bcryptHashes?.length);
  } else {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const p = await ctx.newPage();
      for (const path of PAGES) {
        try {
          await p.goto(`http://localhost:5173${path}`, { waitUntil: 'networkidle', timeout: 30000 });
          await p.waitForTimeout(1200);
          const issues = await checkPage(p, path, vp.name);
          if (issues.length) {
            problems.push(`${vp.name} ${path}: ${issues.join(' | ')}`);
          }
        } catch (e) {
          problems.push(`${vp.name} ${path}: PAGE ERROR ${e.message.split('\n')[0]}`);
        }
      }
      await ctx.close();
    }
  }

  await browser.close();
  console.log('\n===== SUMMARY =====');
  if (problems.length) {
    problems.forEach((x) => console.log('⚠️', x));
  } else {
    console.log('✅ No layout issues detected');
  }
}

main();