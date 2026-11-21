import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { limitsDescription } from '../src/shared.js';

const root = path.resolve(import.meta.dirname, '..');

test('the unpacked extension stays a Manifest V3 module with the popup hooks', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'src', 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal(manifest.background.type, 'module');
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.equal(manifest.action.default_title, 'Tab Window Limiter');
  assert.equal(manifest.incognito, 'spanning');
  assert.deepEqual(manifest.permissions, ['tabs', 'storage']);
  assert.equal(manifest.host_permissions, undefined);

  assert.deepEqual((await readdir(path.join(root, 'src'))).sort(), [
    'background.js',
    'enforcement.js',
    'manifest.json',
    'popup.html',
    'popup.js',
    'shared.js',
  ]);

  const html = (await readFile(path.join(root, 'src', 'popup.html'), 'utf8')).replace(/\s+/g, ' ');
  for (const hook of [
    'id="tabWindowLimiter"',
    'id="tabs"',
    'id="normal-windows"',
    'id="windows"',
    'id="status"',
    'id="limits"',
    'id="error"',
    'id="preview-note"',
    'data-testid="limiter-toggle"',
    'data-testid="tab-count"',
    'data-testid="normal-window-count"',
    'data-testid="window-count"',
    'data-testid="limiter-status"',
    'data-testid="limiter-error"',
    'data-testid="preview-note"',
    'aria-live="polite"',
    'type="module"',
    'src="popup.js"',
  ]) {
    assert.equal(html.includes(hook), true, `popup.html is missing ${hook}`);
  }
  assert.equal(html.includes(limitsDescription()), true);
});
