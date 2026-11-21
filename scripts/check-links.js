import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LinkChecker } from 'linkinator';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['README.md', 'llms.txt', 'AGENTS.md', 'src/popup.html'];
const urls = new Set();
const httpRe = /https?:\/\/[^\s)"'<>]+/g;
const mdRe = /\[[^\]]*\]\(([^)\s]+)\)/g;
const hrefRe = /href="([^"]+)"/g;

for (const file of files) {
  const text = await readFile(path.join(root, file), 'utf8');
  for (const match of text.matchAll(httpRe)) {
    urls.add(match[0].replace(/[.,]$/, ''));
  }
  for (const match of text.matchAll(hrefRe)) {
    const href = match[1];
    if (/^https?:\/\//.test(href)) {
      urls.add(href);
    }
  }
  for (const match of text.matchAll(mdRe)) {
    const target = match[1];
    if (target.startsWith('#')) {
      continue;
    }
    if (/^https?:\/\//.test(target)) {
      urls.add(target);
      continue;
    }
    const local = path.resolve(path.dirname(path.join(root, file)), target.split('#')[0]);
    try {
      await readFile(local);
    } catch {
      console.error(`${file} links to missing ${target}`);
      process.exit(1);
    }
  }
}

if (urls.size === 0) {
  console.log('links ok (none)');
  process.exit(0);
}

const checker = new LinkChecker();
let failed = false;
for (const url of urls) {
  const result = await checker.check({ path: url });
  for (const link of result.links) {
    if (link.state === 'BROKEN') {
      console.error(`broken ${link.url} (${link.status}) from ${url}`);
      failed = true;
    }
  }
}
if (failed) {
  process.exit(1);
}
console.log(`links ok (${urls.size})`);
