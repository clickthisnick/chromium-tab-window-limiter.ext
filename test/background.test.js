import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PAUSE_MS } from '../src/shared.js';
import { createMockChrome } from './mock-chrome.js';

const NOW = 1_700_000_000_000;
const tabs = Array.from({ length: 11 }, (_, index) => ({
  id: index + 1,
  windowId: 1,
  pinned: false,
  incognito: false,
}));
const mock = createMockChrome({
  tabs,
  windows: [{ id: 1, type: 'normal', incognito: false }],
  timestamp: NOW - PAUSE_MS,
});

const listeners = {};
function listen(name) {
  return {
    addListener(fn) {
      listeners[name] = fn;
    },
  };
}

globalThis.chrome = mock.api;
globalThis.chrome.runtime = {
  onInstalled: listen('installed'),
  onStartup: listen('startup'),
};
globalThis.chrome.tabs.onCreated = listen('tabCreated');
globalThis.chrome.tabs.onRemoved = listen('tabRemoved');
globalThis.chrome.windows.onCreated = listen('winCreated');
globalThis.chrome.windows.onRemoved = listen('winRemoved');

Date.now = () => NOW;

await import('../src/background.js');

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

test('listeners close a new tab, leave removals alone, and preserve storage', async () => {
  await listeners.startup();
  await flush();
  assert.equal(mock.state.badge, '1');
  assert.deepEqual(mock.state.removedTabIds, []);
  assert.deepEqual(mock.state.removedWindowIds, []);

  await listeners.tabCreated(tabs[10]);
  await flush();
  assert.deepEqual(mock.state.removedTabIds, [11]);
  assert.equal(
    mock.state.tabs.some((item) => item.id === 11),
    false,
  );

  const removedBefore = mock.state.removedTabIds.length;
  await listeners.tabRemoved(1, { windowId: 1, isWindowClosing: false });
  await flush();
  assert.equal(mock.state.removedTabIds.length, removedBefore);

  const existing = mock.state.timestamp;
  await listeners.installed();
  await flush();
  assert.equal(mock.state.timestamp, existing);

  mock.state.timestamp = undefined;
  await listeners.installed();
  await flush();
  assert.equal(mock.state.timestamp, NOW - PAUSE_MS);
});

test('window listeners close a new normal window and refresh after removal', async () => {
  const created = { id: 2, type: 'normal', incognito: false };
  mock.state.windows.push(created);
  mock.state.tabs.push({ id: 2, windowId: 2, pinned: false, incognito: false });

  await listeners.winCreated(created);
  await flush();
  assert.deepEqual(mock.state.removedWindowIds, [2]);
  assert.equal(
    mock.state.windows.some((win) => win.id === 2),
    false,
  );

  mock.state.windows.push({ id: 3, type: 'popup', incognito: false });
  await listeners.winRemoved();
  await flush();
  assert.equal(mock.state.badge, '2');

  mock.state.windows.pop();
  await listeners.winRemoved();
  await flush();
  assert.equal(mock.state.badge, '1');
});

test('logs storage and startup failures', async () => {
  const errors = [];
  const original = console.error;
  console.error = (...args) => {
    errors.push(args);
  };
  try {
    mock.state.storageFails = true;
    await listeners.tabCreated(tabs[10]);
    await flush();
    assert.equal(
      errors.some((args) => args[1]?.message === 'storage unavailable'),
      true,
    );

    errors.length = 0;
    mock.state.storageFails = false;
    mock.state.windowsFail = true;
    await listeners.startup();
    await flush();
    assert.equal(
      errors.some((args) => args[1]?.message === 'windows unavailable'),
      true,
    );
  } finally {
    console.error = original;
    mock.state.storageFails = false;
    mock.state.windowsFail = false;
  }
});
