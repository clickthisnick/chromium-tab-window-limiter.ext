import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { limitsDescription } from '../src/shared.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const manifestPath = path.join(root, 'src', 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

if (manifest.manifest_version !== 3) {
  fail('manifest_version must stay 3');
}
if (manifest.version !== pkg.version) {
  fail(`manifest version ${manifest.version} does not match package.json ${pkg.version}`);
}
if (manifest.background?.service_worker !== 'background.js' || manifest.background?.type !== 'module') {
  fail('background must be the module service worker background.js');
}
if (manifest.action?.default_popup !== 'popup.html') {
  fail('action popup must stay popup.html');
}
for (const permission of ['tabs', 'storage']) {
  if (!manifest.permissions?.includes(permission)) {
    fail(`missing permission ${permission}`);
  }
}
if (manifest.incognito !== 'spanning') {
  fail('incognito mode must stay spanning so one worker can see incognito windows');
}

const required = [
  'src/background.js',
  'src/enforcement.js',
  'src/shared.js',
  'src/popup.js',
  'src/popup.html',
  'src/manifest.json',
];
for (const file of required) {
  try {
    await access(path.join(root, file));
  } catch {
    fail(`missing ${file}`);
  }
}

const html = await readFile(path.join(root, 'src', 'popup.html'), 'utf8');
const hooks = [
  'id="tabWindowLimiter"',
  'id="tabs"',
  'id="normal-windows"',
  'id="windows"',
  'id="status"',
  'id="limits"',
  'id="error"',
  'data-testid="limiter-toggle"',
  'data-testid="tab-count"',
  'data-testid="normal-window-count"',
  'data-testid="window-count"',
  'data-testid="limiter-status"',
  'aria-live="polite"',
  'type="module"',
];
for (const hook of hooks) {
  if (!html.includes(hook)) {
    fail(`popup.html is missing ${hook}`);
  }
}
if (!html.replace(/\s+/g, ' ').includes(limitsDescription())) {
  fail('popup.html limits text does not match limitsDescription()');
}

const tests = await readdir(path.join(root, 'test'));
if (!tests.some((name) => name.endsWith('.test.js'))) {
  fail('test directory has no test files');
}

console.log(`build ok (${manifest.version})`);
