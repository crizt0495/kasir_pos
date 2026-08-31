import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

function resolveNode() {
  if (existsSync(process.execPath) && !path.basename(process.execPath).includes('linker')) {
    return process.execPath;
  }
  const viaShell = spawnSync('sh', ['-lc', 'command -v node'], { encoding: 'utf8' });
  if (viaShell.status === 0 && viaShell.stdout.trim()) return viaShell.stdout.trim();
  return 'node';
}

const nodeBin = resolveNode();
const files = readdirSync(here)
  .filter((f) => f.endsWith('.test.js') && !f.startsWith('run-all'))
  .sort();

let total = 0;
let passed = 0;
let failed = 0;
let exit = 0;

const extract = (label, out) => Number(out.match(new RegExp(`(?:^|\\n)${label}\\s+(\\d+)`))?.[1] ?? 0);

for (const file of files) {
  const res = spawnSync(nodeBin, ['--experimental-test-module-mocks', path.join(here, file)], {
    env: process.env,
    encoding: 'utf8',
  });
  if (res.status !== 0) exit = 1;
  const out = (res.stdout || '') + '\n' + (res.stderr || '');
  const t = extract('ℹ tests', out);
  const p = extract('ℹ pass', out);
  const f = extract('ℹ fail', out);
  total += t;
  passed += p;
  failed += f;
  console.log(`${res.status === 0 && f === 0 ? 'PASS' : 'FAIL'}  ${file}  (${p}/${t})`);
}

console.log(`\n=== AGREGAT: ${passed}/${total} PASS, ${failed} FAIL ===`);
process.exit(exit === 0 && failed === 0 ? 0 : 1);
