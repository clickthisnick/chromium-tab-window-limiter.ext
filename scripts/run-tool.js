import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
const args = process.argv.slice(3);

if (name === 'codespell') {
  const result = spawnSync('python3', ['-m', 'codespell_lib', ...args], {
    stdio: 'inherit',
    env: { ...process.env, PYTHONPATH: path.join(root, '.tools', 'py') },
  });
  process.exit(result.status ?? 1);
}

const exe = process.platform === 'win32' ? `${name}.exe` : name;
const bin = path.join(root, '.tools', 'bin', exe);
if (!name || !existsSync(bin)) {
  console.error(`Missing ${name || 'tool'}. Run npm install.`);
  process.exit(1);
}

const result = spawnSync(bin, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
