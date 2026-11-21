import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lefthook = path.join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'lefthook.cmd' : 'lefthook',
);

const install = spawnSync(lefthook, ['install'], { stdio: 'inherit' });
if (install.status === 0) {
  process.exit(0);
}

const hooksPath = spawnSync('git', ['config', '--get', 'core.hooksPath'], { encoding: 'utf8' });
if (hooksPath.stdout.trim()) {
  console.log('skipped lefthook install because git core.hooksPath is already set');
  process.exit(0);
}

process.exit(install.status ?? 1);
