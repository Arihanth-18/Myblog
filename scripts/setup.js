// One-time setup: installs dependencies, creates backend/.env, builds the frontend.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (args, cwd) => {
  const r = spawnSync(npm, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error(`\n"npm ${args.join(' ')}" failed in ${cwd}`); process.exit(r.status || 1); }
};

const envFile = path.join(root, 'backend', '.env');
if (!fs.existsSync(envFile)) {
  const example = fs.readFileSync(path.join(root, 'backend', '.env.example'), 'utf8');
  fs.writeFileSync(envFile, example.replace('replace-with-a-long-random-string', crypto.randomBytes(32).toString('hex')));
  console.log('Created backend/.env  -> open it, paste your Neon DATABASE_URL and change ADMIN_EMAIL / ADMIN_PASSWORD.\n');
}
run(['install'], path.join(root, 'backend'));
run(['install'], path.join(root, 'frontend'));
run(['run', 'build'], path.join(root, 'frontend'));
console.log('\nSetup complete. Edit backend/.env first (Neon DATABASE_URL + admin login).\n  Start the site:  npm start      (http://localhost:4000)\n  Admin login:     http://localhost:4000/admin\n');
