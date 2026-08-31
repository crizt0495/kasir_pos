import { spawn } from 'child_process';
import { execSync } from 'child_process';
import fs from 'fs';
const LOG = '/tmp/e2e_expense.log';
const out = []; const log = (m) => { out.push(m); fs.writeFileSync(LOG, out.join('\n')); };
const BACKEND_CWD = '/home/chris/Documents/Aplikasi/pos/backend';
const BASE = 'http://127.0.0.1:5188';
const DESC = 'Tes tambah pengeluaran E2E ' + Date.now();
const NOMINAL = 150000;

const backend = spawn('node', ['src/server.js'], { cwd: BACKEND_CWD, env: process.env, stdio: ['ignore','ignore','ignore'] });
async function postLogin(){ try{ const r=await fetch('http://127.0.0.1:3001/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'Admin2026!x'})}); return r.status;}catch{return 0;} }
for(let i=0;i<40;i++){ const c=await postLogin(); if(c===200){ log('backend READY'); break; } await new Promise(r=>setTimeout(r,1000)); }

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const consoleErrors=[], pageErrors=[], bad=[];
page.on('console', m=>{ if(m.type()==='error') consoleErrors.push(m.text()); });
page.on('pageerror', e=>pageErrors.push(e.message));
page.on('response', r=>{ if(r.status()>=400) bad.push(r.status()+' '+r.url()); });

const results=[]; const ok=(s)=>{results.push('[PASS] '+s);log('[PASS] '+s);}; const fail=(s,e)=>{results.push('[FAIL] '+s+' — '+e);log('[FAIL] '+s+' — '+e);};
const step=async(n,fn)=>{ try{ await fn(); ok(n);}catch(e){ fail(n,(e&&e.message?e.message:String(e)).split('\n')[0]); } };

await step('Login admin', async()=>{
  await page.goto(BASE+'/login',{waitUntil:'domcontentloaded'});
  await page.fill('input[placeholder="Masukkan username"]','admin');
  await page.fill('input[placeholder="Masukkan password"]','Admin2026!x');
  await page.click('button:has-text("Login")');
  await page.waitForFunction(()=>!location.pathname.startsWith('/login'),null,{timeout:15000});
});

await step('Buka modal Tambah Pengeluaran', async()=>{
  await page.goto(BASE+'/expenses',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(800);
  await page.click('button:has-text("Tambah Pengeluaran")');
  await page.waitForSelector('text=Tambah Pengeluaran',{timeout:8000});
  if(await page.locator('input[placeholder="0"]').count()<1) throw new Error('input nominal tdk ada');
});

await step('Isi form pengeluaran', async()=>{
  const modal = page.locator('[role="dialog"]');
  await modal.locator('select').nth(0).selectOption({ label: 'Listrik & Air' });
  await modal.locator('select').nth(1).selectOption({ label: 'Transfer' });
  await modal.locator('input[placeholder="0"]').fill(String(NOMINAL));
  await modal.locator('textarea[placeholder="Opsional"]').fill(DESC);
});

await step('Simpan pengeluaran', async()=>{
  await page.click('button:has-text("Simpan")');
  await page.waitForSelector('text=Tambah Pengeluaran', { state: 'hidden', timeout: 10000 }).catch(()=>{});
  await page.waitForTimeout(800);
});

await step('Verifikasi via API', async()=>{
  const resp = await page.request.get(BASE+'/api/expenses?search='+encodeURIComponent(DESC));
  const body = await resp.json();
  const found=(body.data?.items||[]).filter(i=>i.description===DESC && Number(i.amount)===NOMINAL);
  if(found.length<1) throw new Error('pengeluaran tdk ditemukan di API (total items='+(body.data?.items?.length||0)+')');
  log('  API ditemukan id='+found[0].id+' amount='+found[0].amount+' category='+found[0].category+' method='+found[0].payment_method);
});

await step('Verifikasi via Database (psql)', async()=>{
  const sql=`SELECT count(*) FROM expenses WHERE description = '${DESC.replace(/'/g,"''")}' AND amount = ${NOMINAL};`;
  const r=execSync(`PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -tA -c "${sql}"`,{encoding:'utf8'}).trim();
  log('  DB count='+r);
  if(r!=='1') throw new Error('DB count != 1 (got '+r+')');
});

await step('Muncul di tabel UI', async()=>{
  await page.goto(BASE+'/expenses',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(800);
  await page.fill('input[placeholder="Cari deskripsi..."]', DESC);
  await page.waitForTimeout(900);
  if(await page.locator('text='+DESC).count()<1) throw new Error('tdk tampil di tabel');
});

log('\n=== RINGKASAN ===');
results.forEach(r=>log(r));
log('Console Errors: '+consoleErrors.length); consoleErrors.forEach(e=>log('  • '+e));
log('Page Errors   : '+pageErrors.length); pageErrors.forEach(e=>log('  • '+e));
log('HTTP>=400     : '+[...new Set(bad)].length); [...new Set(bad)].forEach(b=>log('  • '+b));
log('=== BEBAS ERROR: '+(consoleErrors.length===0&&pageErrors.length===0&&[...new Set(bad)].length===0?'YA':'TIDAK')+' ===');

await browser.close(); backend.kill('SIGKILL'); process.exit(0);
