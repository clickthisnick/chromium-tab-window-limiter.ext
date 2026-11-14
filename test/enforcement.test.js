import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ensureDefaultTimestamp,
  handleTabCreated,
  handleTabRemoved,
  handleWindowCreated,
} from '../src/enforcement.js';
import { BADGE_COLOR, PAUSE_MS, STORAGE_KEY } from '../src/shared.js';
import { createMockChrome } from './mock-chrome.js';

const NOW = 1_700_000_000_000;

function normalWindow(id, incognito = false) {
  return { id, type: 'normal', incognito };
}

function tab(id, windowId, pinned = false) {
  return { id, windowId, pinned, incognito: false };
}

function manyTabs(count, windowId = 1) {
  return Array.from({ length: count }, (_, index) => tab(index + 1, windowId));
}

test('closes only the new unpinned tab that crosses the limit', async () => {
  const tabs = manyTabs(10);
  tabs.push(tab(11, 1));
  const { api, state } = createMockChrome({
    tabs,
    windows: [normalWindow(1)],
    timestamp: NOW - PAUSE_MS,
  });

  const result = await handleTabCreated(tab(11, 1), api, NOW);

  assert.equal(result.closedTabId, 11);
  assert.deepEqual(state.removedTabIds, [11]);
  assert.deepEqual(state.tabs.map((item) => item.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(result.badge, '1');
  assert.equal(state.badgeColor, BADGE_COLOR);
});

test('leaves existing extra tabs alone when a different tab is closed', async () => {
  const { api, state } = createMockChrome({
    tabs: manyTabs(15),
    windows: [normalWindow(1)],
    timestamp: NOW - PAUSE_MS,
  });

  const removed = await handleTabRemoved(api);
  assert.equal(removed.closedTabId, null);
  assert.deepEqual(state.removedTabIds, []);
  assert.equal(state.tabs.length, 15);
  assert.equal(removed.badge, '1');
});

test('does not close a new tab during the pause', async () => {
  const tabs = manyTabs(14);
  tabs.push(tab(15, 1));
  const { api, state } = createMockChrome({
    tabs,
    windows: [normalWindow(1)],
    timestamp: NOW,
  });

  const result = await handleTabCreated(tab(15, 1), api, NOW);
  assert.equal(result.active, false);
  assert.equal(result.closedTabId, null);
  assert.equal(state.tabs.length, 15);
});

test('does not close pinned tabs or tabs in popup windows', async () => {
  const windows = [normalWindow(1), { id: 2, type: 'popup', incognito: false }];
  const tabs = manyTabs(12);
  const pinned = tab(50, 1, true);
  const popupTab = { id: 60, windowId: 2, pinned: false, incognito: false };
  tabs.push(pinned, popupTab);
  const { api, state } = createMockChrome({
    tabs,
    windows,
    timestamp: NOW - PAUSE_MS,
  });

  const pinnedResult = await handleTabCreated(pinned, api, NOW);
  const popupResult = await handleTabCreated(popupTab, api, NOW);
  assert.equal(pinnedResult.closedTabId, null);
  assert.equal(popupResult.closedTabId, null);
  assert.deepEqual(state.removedTabIds, []);
});

test('closes a new normal window and not the window the user already had', async () => {
  const created = normalWindow(2);
  const { api, state } = createMockChrome({
    tabs: [tab(1, 1), tab(2, 2)],
    windows: [normalWindow(1), created],
    timestamp: NOW - PAUSE_MS,
  });

  const result = await handleWindowCreated(created, api, NOW);
  assert.equal(result.closedWindowId, 2);
  assert.deepEqual(state.windows.map((win) => win.id), [1]);
  assert.deepEqual(state.tabs.map((item) => item.id), [1]);
  assert.equal(result.badge, '1');
});

test('does not close popups, devtools, or the only normal window', async () => {
  const popup = { id: 8, type: 'popup', incognito: false };
  const devtools = { id: 9, type: 'devtools', incognito: false };
  const { api, state } = createMockChrome({
    windows: [normalWindow(1), popup, devtools],
    tabs: [tab(1, 1)],
    timestamp: NOW - PAUSE_MS,
  });

  assert.equal((await handleWindowCreated(popup, api, NOW)).closedWindowId, null);
  assert.equal((await handleWindowCreated(devtools, api, NOW)).closedWindowId, null);
  assert.equal((await handleWindowCreated(normalWindow(1), api, NOW)).closedWindowId, null);
  assert.deepEqual(state.removedWindowIds, []);
});

test('closes a new incognito window even when the limiter is paused', async () => {
  const incognito = normalWindow(4, true);
  const { api, state } = createMockChrome({
    windows: [normalWindow(1), incognito],
    tabs: [tab(1, 1), { id: 4, windowId: 4, pinned: false, incognito: true }],
    timestamp: NOW,
  });

  const fromWindow = await handleWindowCreated(incognito, api, NOW);
  assert.equal(fromWindow.closedWindowId, 4);
  assert.deepEqual(state.windows.map((win) => win.id), [1]);

  state.windows.push(incognito);
  state.tabs.push({ id: 4, windowId: 4, pinned: false, incognito: true });
  const fromTab = await handleTabCreated(
    { id: 4, windowId: 4, pinned: false, incognito: true },
    api,
    NOW,
  );
  assert.equal(fromTab.closedWindowId, 4);
  assert.equal(fromTab.closedTabId, null);
  assert.deepEqual(state.windows.map((win) => win.id), [1]);
});

test('a second incognito close after the window is gone is not an error', async () => {
  const incognito = normalWindow(4, true);
  const { api } = createMockChrome({
    windows: [normalWindow(1)],
    tabs: [tab(1, 1)],
    timestamp: NOW - PAUSE_MS,
  });

  const result = await handleWindowCreated(incognito, api, NOW);
  assert.equal(result.closedWindowId, null);
  assert.equal(result.error, null);
  assert.equal(result.badge, '1');
});

test('storage failure does not close tabs, and a corrupt value stays enforced', async () => {
  const tabs = manyTabs(11);
  const failing = createMockChrome({
    tabs,
    windows: [normalWindow(1)],
    storageFails: true,
  });
  const failed = await handleTabCreated(tab(11, 1), failing.api, NOW);
  assert.equal(failed.closedTabId, null);
  assert.equal(failed.error.message, 'storage unavailable');
  assert.equal(failing.state.tabs.length, 11);

  const corrupt = createMockChrome({
    tabs,
    windows: [normalWindow(1)],
    timestamp: 'nope',
  });
  const enforced = await handleTabCreated(tab(11, 1), corrupt.api, NOW);
  assert.equal(enforced.active, true);
  assert.equal(enforced.closedTabId, 11);
  assert.equal(corrupt.state.timestamp, 'nope');
});

test('default timestamp is on, and an existing pause is kept', async () => {
  const fresh = createMockChrome({});
  const created = await ensureDefaultTimestamp(fresh.api, NOW);
  assert.equal(created, NOW - PAUSE_MS);
  assert.equal(fresh.state.timestamp, NOW - PAUSE_MS);
  assert.equal(await ensureDefaultTimestamp(fresh.api, NOW + 50), NOW - PAUSE_MS);

  const paused = createMockChrome({ timestamp: NOW });
  assert.equal(await ensureDefaultTimestamp(paused.api, NOW), NOW);
  assert.equal(paused.state.timestamp, NOW);

  const zero = createMockChrome({ timestamp: 0 });
  assert.equal(await ensureDefaultTimestamp(zero.api, NOW), 0);

  const numericString = createMockChrome({ timestamp: String(NOW - PAUSE_MS) });
  assert.equal(await ensureDefaultTimestamp(numericString.api, NOW), NOW - PAUSE_MS);
  assert.equal(numericString.state.timestamp, String(NOW - PAUSE_MS));
  assert.equal(STORAGE_KEY, 'tabWindowLimiter');
});
