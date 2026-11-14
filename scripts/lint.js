import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function javascriptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await javascriptFiles(full));
    } else if (entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

const files = [
  ...await javascriptFiles(path.join(root, 'src')),
  ...await javascriptFiles(path.join(root, 'test')),
  ...await javascriptFiles(path.join(root, 'scripts')),
];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    fail(result.stderr || `syntax check failed for ${file}`);
  }
}

const banned = ['innerHTML', 'outerHTML', 'document.write', 'eval('];
for (const file of await javascriptFiles(path.join(root, 'src'))) {
  const source = await readFile(file, 'utf8');
  for (const token of banned) {
    if (source.includes(token)) {
      fail(`${path.relative(root, file)} contains ${token}`);
    }
  }
}

console.log(`lint ok (${files.length} files)`);
