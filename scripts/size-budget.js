import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const budget = JSON.parse(await readFile(path.join(root, 'size-budget.json'), 'utf8'));

async function filesIn(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesIn(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

const files = await filesIn(path.join(root, 'src'));
let bytes = 0;
for (const file of files) {
  bytes += (await stat(file)).size;
}

const maxBytes = budget.maxBytes;
console.log(`unpacked src ${bytes} bytes (budget ${maxBytes})`);
if (!Number.isInteger(maxBytes) || bytes > maxBytes) {
  console.error(`src is ${bytes} bytes, which is past the budget of ${maxBytes}`);
  process.exit(1);
}
