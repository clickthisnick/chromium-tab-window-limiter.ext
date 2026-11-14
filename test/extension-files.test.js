import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { limitsDescription } from '../src/shared.js';

const root = path.resolve(import.meta.dirname, '..');

test('the unpacked extension still loads from src with no build output', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'src', 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal(manifest.background.type, 'module');
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.equal(manifest.incognito, 'spanning');
  assert.ok(manifest.permissions.includes('tabs'));
  assert.ok(manifest.permissions.includes('storage'));

  const required = [
    'src/background.js',
    'src/enforcement.js',
    'src/shared.js',
    'src/popup.js',
    'src/popup.html',
    'src/manifest.json',
  ];
  const present = new Set(await readdir(path.join(root, 'src')));
  for (const file of required) {
    assert.equal(present.has(path.basename(file)), true, `missing ${file}`);
  }

  const html = (await readFile(path.join(root, 'src', 'popup.html'), 'utf8')).replace(/\s+/g, ' ');
  for (const hook of [
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
    'src="popup.js"',
  ]) {
    assert.equal(html.includes(hook), true, `popup.html is missing ${hook}`);
  }
  assert.equal(html.includes(limitsDescription()), true);
});
