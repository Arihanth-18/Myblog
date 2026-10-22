// Development: API with auto-restart on :4000 + Vite dev server on :5173 (proxying /api).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const start = (name, cwd, args) => {
  const child = spawn(process.execPath, args, { cwd: path.join(root, cwd), stdio: 'inherit' });
  child.on('exit', code => { console.log(`[${name}] exited (${code})`); process.exit(code ?? 0); });
  return child;
};
const kids = [
  start('api', 'backend', ['--watch', 'src/server.js']),
  start('web', 'frontend', [path.join('node_modules', 'vite', 'bin', 'vite.js')]),
];
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { kids.forEach(k => k.kill()); process.exit(0); });
console.log('\nSite:  http://localhost:5173\nAdmin: http://localhost:5173/admin\n');
