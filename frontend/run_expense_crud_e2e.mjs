import { spawn } from 'child_process';
import { execSync } from 'child_process';
import fs from 'fs';
const LOG = '/tmp/e2e_expense_crud.log';
const out = []; const log = (m) => { out.push(m); fs.writeFileSync(LOG, out.join('\n')); };
const BACKEND_CWD = '/home/chris/Documents/Aplikasi/pos/backend';
const BASE = 'http://127.0.0.1:5188';

const backend = spawn('node', ['src/server.js'], { cwd: BACKEND_CWD, env: process.env, stdio: ['ignore','ignore','ignore'] });
async function postLogin(){ try{ const r=await fetch('http://127.0.0.1:3001/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'Admin123!'})}); return r.status;}catch{return 0;} }
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

const ts = Date.now();
const DESC = 'CRUD E2E ' + ts;
const DESC2 = 'CRUD E2E UPD ' + ts;

const dbCount = (where) => execSync(`PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -tA -c "SELECT count(*) FROM expenses WHERE ${where};"`,{encoding:'utf8'}).trim();
const apiFind = async (desc) => { const r=await page.request.get(BASE+'/api/expenses?search='+encodeURIComponent(desc)); const b=await r.json(); return (b.data?.items||[]).filter(i=>i.description===desc); };

async function fillForm(modal, { category, method, amount, description }) {
  await modal.locator('select').nth(0).selectOption({ label: category });
  await modal.locator('select').nth(1).selectOption({ label: method });
  await modal.locator('input[placeholder="0"]').fill(String(amount));
  await modal.locator('textarea[placeholder="Opsional"]').fill(description);
}
async function openCreate() {
  await page.goto(BASE+'/expenses',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(700);
  await page.click('button:has-text("Tambah Pengeluaran")');
  await page.waitForSelector('[role="dialog"]',{timeout:8000});
}

await step('Login admin', async()=>{
  await page.goto(BASE+'/login',{waitUntil:'domcontentloaded'});
  await page.fill('input[placeholder="Masukkan username"]','admin');
  await page.fill('input[placeholder="Masukkan password"]','Admin123!');
  await page.click('button:has-text("Login")');
  await page.waitForFunction(()=>!location.pathname.startsWith('/login'),null,{timeout:15000});
});

// CREATE
await step('CREATE pengeluaran', async()=>{
  await openCreate();
  await fillForm(page.locator('[role="dialog"]'), { category:'Listrik & Air', method:'Transfer', amount:150000, description:DESC });
  await page.click('button:has-text("Simpan")');
  await page.waitForSelector('[role="dialog"]',{state:'hidden',timeout:10000}).catch(()=>{});
  await page.waitForTimeout(600);
});
await step('READ setelah CREATE (API+DB)', async()=>{
  const f=await apiFind(DESC);
  if(f.length!==1) throw new Error('API items='+f.length);
  log('  API: id='+f[0].id+' amount='+f[0].amount+' category='+f[0].category+' method='+f[0].payment_method);
  if(Number(f[0].amount)!==150000||f[0].category!=='Listrik & Air'||f[0].payment_method!=='TRANSFER') throw new Error('nilai tdk sesuai');
  const c=dbCount(`description = '${DESC.replace(/'/g,"''")}' AND amount = 150000`);
  if(c!=='1') throw new Error('DB count='+c);
});

// UPDATE
await step('UPDATE pengeluaran', async()=>{
  await page.fill('input[placeholder="Cari deskripsi..."]', DESC);
  await page.waitForTimeout(900);
  await page.locator('tr:has-text("'+DESC+'") button').first().click();
  await page.waitForSelector('[role="dialog"]',{timeout:8000});
  if(!(await page.locator('h3',{hasText:'Edit Pengeluaran'}).count())) throw new Error('modal edit tdk terbuka');
  await fillForm(page.locator('[role="dialog"]'), { category:'Gaji', method:'Tunai', amount:275000, description:DESC2 });
  await page.click('button:has-text("Simpan")');
  await page.waitForSelector('[role="dialog"]',{state:'hidden',timeout:10000}).catch(()=>{});
  await page.waitForTimeout(600);
});
await step('READ setelah UPDATE (API+DB)', async()=>{
  const f=await apiFind(DESC2);
  if(f.length!==1) throw new Error('API items='+f.length);
  if(Number(f[0].amount)!==275000||f[0].category!=='Gaji'||f[0].payment_method!=='CASH') throw new Error('nilai update tdk sesuai');
  const c=dbCount(`description = '${DESC2.replace(/'/g,"''")}' AND amount = 275000 AND category = 'Gaji'`);
  if(c!=='1') throw new Error('DB count='+c);
  if((await apiFind(DESC)).length!==0) throw new Error('deskripsi lama msh ada');
});

// DELETE
await step('DELETE pengeluaran', async()=>{
  await page.fill('input[placeholder="Cari deskripsi..."]', DESC2);
  await page.waitForTimeout(900);
  await page.locator('tr:has-text("'+DESC2+'") button').nth(1).click();
  await page.waitForTimeout(500);
  await page.click('button:has-text("Ya, hapus")');
  await page.waitForTimeout(1200);
});
await step('READ setelah DELETE (API+DB)', async()=>{
  if((await apiFind(DESC2)).length!==0) throw new Error('masih ditemukan di API');
  const c=dbCount(`description = '${DESC2.replace(/'/g,"''")}'`);
  if(c!=='0') throw new Error('DB count='+c);
});

log('\n=== RINGKASAN CRUD PENGELUARAN ===');
results.forEach(r=>log(r));
log('Console Errors: '+consoleErrors.length); consoleErrors.forEach(e=>log('  • '+e));
log('Page Errors   : '+pageErrors.length); pageErrors.forEach(e=>log('  • '+e));
log('HTTP>=400     : '+[...new Set(bad)].length); [...new Set(bad)].forEach(b=>log('  • '+b));
log('=== BEBAS ERROR: '+(consoleErrors.length===0&&pageErrors.length===0&&[...new Set(bad)].length===0?'YA':'TIDAK')+' ===');

await browser.close(); backend.kill('SIGKILL'); process.exit(0);
