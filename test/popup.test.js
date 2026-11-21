import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PAUSE_MS, STORAGE_KEY } from '../src/shared.js';
import { createMockChrome } from './mock-chrome.js';

const NOW = 1_700_000_000_000;
Date.now = () => NOW;

function settle() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function createElement() {
  const listeners = {};
  return {
    textContent: '',
    hidden: true,
    disabled: false,
    focusCalls: 0,
    listeners,
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
    click() {
      return listeners.click?.();
    },
    focus() {
      this.focusCalls += 1;
    },
  };
}

function fakeDocument() {
  const ids = [
    STORAGE_KEY,
    'status',
    'error',
    'limits',
    'preview-note',
    'tabs',
    'normal-windows',
    'windows',
  ];
  const els = {};
  for (const id of ids) {
    els[id] = createElement();
  }
  return {
    els,
    getElementById(id) {
      return els[id] ?? null;
    },
  };
}

const bootDocument = fakeDocument();
globalThis.document = /** @type {Document} */ (/** @type {unknown} */ (bootDocument));
const { mountPopup } = await import('../src/popup.js');

function sampleBrowser() {
  const tabs = Array.from({ length: 10 }, (_, index) => ({
    id: index + 1,
    windowId: 1,
    pinned: false,
    incognito: false,
  }));
  tabs.push(
    { id: 50, windowId: 1, pinned: true, incognito: false },
    { id: 60, windowId: 2, pinned: false, incognito: false },
  );
  return createMockChrome({
    tabs,
    windows: [
      { id: 1, type: 'normal', incognito: false },
      { id: 2, type: 'popup', incognito: false },
    ],
    timestamp: NOW - PAUSE_MS,
  });
}

test('the popup script mounts itself when a document exists and chrome does not', () => {
  const button = bootDocument.els[STORAGE_KEY];
  assert.equal(bootDocument.els['preview-note'].hidden, false);
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, 'Pause limiter');
  assert.equal(bootDocument.els.tabs.textContent, '0');
  assert.equal(bootDocument.els['normal-windows'].textContent, '0');
  assert.equal(bootDocument.els.windows.textContent, '0');
  assert.match(bootDocument.els.limits.textContent, /past 10/);
  assert.equal(button.listeners.click, undefined);
});

test('an incomplete chrome object stays on the preview state', () => {
  globalThis.chrome = /** @type {ChromeApi} */ ({ tabs: {} });
  const doc = fakeDocument();
  mountPopup(doc);
  assert.equal(doc.els['preview-note'].hidden, false);
  assert.equal(doc.els[STORAGE_KEY].disabled, true);
  assert.equal(doc.els[STORAGE_KEY].textContent, 'Pause limiter');
});

test('shows limited counts and toggles the pause timestamp', async () => {
  const { api, state } = sampleBrowser();
  globalThis.chrome = /** @type {ChromeApi} */ (api);
  const doc = fakeDocument();
  mountPopup(doc);
  await settle();

  const button = doc.els[STORAGE_KEY];
  assert.equal(doc.els['preview-note'].hidden, true);
  assert.equal(doc.els.tabs.textContent, '10');
  assert.equal(doc.els['normal-windows'].textContent, '1');
  assert.equal(doc.els.windows.textContent, '2');
  assert.equal(button.textContent, 'Pause limiter');
  assert.equal(doc.els.status.textContent, 'Limiter is on.');
  assert.equal(doc.els.error.hidden, true);

  await button.click();
  assert.equal(state.timestamp, NOW);
  assert.equal(button.textContent, 'Resume limiter');
  assert.match(doc.els.status.textContent, /10 seconds/);
  assert.equal(button.disabled, false);
  assert.equal(button.focusCalls, 1);

  await button.click();
  assert.equal(state.timestamp, NOW - PAUSE_MS);
  assert.equal(button.textContent, 'Pause limiter');
  assert.equal(button.focusCalls, 2);
});

test('the button stays disabled until the pause write finishes', async () => {
  const { api, state } = sampleBrowser();
  const doc = fakeDocument();
  mountPopup(doc, api);
  await settle();

  let release;
  api.storage.local.set = (values) =>
    new Promise((resolve) => {
      release = () => {
        state.timestamp = values[STORAGE_KEY];
        resolve();
      };
    });

  const button = doc.els[STORAGE_KEY];
  const pending = button.click();
  await settle();
  assert.equal(button.disabled, true);
  release();
  await pending;
  assert.equal(button.disabled, false);
  assert.equal(state.timestamp, NOW);
  assert.equal(button.focusCalls, 1);
});

test('live updates follow tabs, windows, and the pause key', async () => {
  const { api, state } = sampleBrowser();
  let reads = 0;
  const get = api.storage.local.get.bind(api.storage.local);
  api.storage.local.get = async (...args) => {
    reads += 1;
    return get(...args);
  };
  const doc = fakeDocument();
  mountPopup(doc, api);
  await settle();
  assert.equal(reads, 1);

  for (const fire of [
    () => api.tabs.onCreated.emit(),
    () => api.tabs.onRemoved.emit(),
    () => api.windows.onCreated.emit(),
    () => api.windows.onRemoved.emit(),
  ]) {
    const before = reads;
    fire();
    await settle();
    assert.equal(reads, before + 1);
  }

  api.storage.onChanged.emit({ other: { newValue: 1 } }, 'local');
  api.storage.onChanged.emit({ [STORAGE_KEY]: { newValue: NOW } }, 'session');
  await settle();
  assert.equal(reads, 5);
  assert.equal(doc.els.status.textContent, 'Limiter is on.');

  state.timestamp = NOW;
  api.storage.onChanged.emit({ [STORAGE_KEY]: { newValue: NOW } }, 'local');
  await settle();
  assert.equal(reads, 6);
  assert.equal(doc.els[STORAGE_KEY].textContent, 'Resume limiter');
});

test('shows the read, toggle, and refresh errors', async () => {
  const errors = [];
  const original = console.error;
  console.error = (err) => {
    errors.push(err);
  };
  try {
    const failing = createMockChrome({ storageFails: true });
    const readDoc = fakeDocument();
    mountPopup(readDoc, failing.api);
    await settle();
    assert.equal(readDoc.els.error.hidden, false);
    assert.equal(
      readDoc.els.error.textContent,
      'Could not read tabs, windows, or the saved pause.',
    );
    assert.equal(readDoc.els.status.textContent, 'Limiter status is unavailable.');
    assert.equal(errors[0].message, 'storage unavailable');

    const { api } = sampleBrowser();
    const toggleDoc = fakeDocument();
    mountPopup(toggleDoc, api);
    await settle();
    api.storage.local.set = async () => {
      throw new Error('write failed');
    };
    await toggleDoc.els[STORAGE_KEY].click();
    assert.equal(toggleDoc.els.error.textContent, 'Could not change the limiter. Try again.');
    assert.equal(toggleDoc.els[STORAGE_KEY].disabled, false);
    assert.equal(toggleDoc.els[STORAGE_KEY].focusCalls, 1);

    api.tabs.query = async () => {
      throw new Error('tabs unavailable');
    };
    api.tabs.onCreated.emit();
    await settle();
    assert.equal(toggleDoc.els.error.textContent, 'Could not refresh the tab and window counts.');
    assert.equal(errors.at(-1).message, 'tabs unavailable');
  } finally {
    console.error = original;
  }
});
