import { spawn } from 'child_process';

const BACKEND_CWD = '/home/chris/Documents/Aplikasi/pos/backend';
const FRONTEND_CWD = '/home/chris/Documents/Aplikasi/pos/frontend';

const backend = spawn('node', ['src/server.js'], {
  cwd: BACKEND_CWD,
  env: process.env,
  stdio: ['ignore', 'ignore', 'ignore'],
});

async function postLogin() {
  try {
    const res = await fetch('http://127.0.0.1:3001/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin123!' }),
    });
    return res.status;
  } catch { return 0; }
}

let ready = false;
for (let i = 0; i < 40; i++) {
  const code = await postLogin();
  if (code === 200) { ready = true; console.log('backend READY'); break; }
  await new Promise((r) => setTimeout(r, 1000));
}
if (!ready) {
  console.log('BACKEND TIDAK READY — login gagal');
  backend.kill('SIGKILL');
  process.exit(2);
}

console.log('menjalankan E2E...');
const e2e = spawn('node', ['e2e_detailed.mjs'], {
  cwd: FRONTEND_CWD,
  env: process.env,
  stdio: 'inherit',
});
e2e.on('exit', (code) => {
  console.log('E2E exit code:', code);
  backend.kill('SIGKILL');
  process.exit(code ?? 0);
});
e2e.on('error', (e) => {
  console.log('E2E error:', e.message);
  backend.kill('SIGKILL');
  process.exit(1);
});
