import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ensureDefaultTimestamp,
  handleTabCreated,
  handleWindowCreated,
  refreshAfterRemoval,
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
  assert.deepEqual(
    state.tabs.map((item) => item.id),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.equal(result.badge, '1');
  assert.equal(state.badgeColor, BADGE_COLOR);
});

test('leaves existing extra tabs alone when a different tab is closed', async () => {
  const { api, state } = createMockChrome({
    tabs: manyTabs(15),
    windows: [normalWindow(1)],
    timestamp: NOW - PAUSE_MS,
  });

  const removed = await refreshAfterRemoval(api);
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
  assert.deepEqual(
    state.windows.map((win) => win.id),
    [1],
  );
  assert.deepEqual(
    state.tabs.map((item) => item.id),
    [1],
  );
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
  assert.deepEqual(
    state.windows.map((win) => win.id),
    [1],
  );

  state.windows.push(incognito);
  state.tabs.push({ id: 4, windowId: 4, pinned: false, incognito: true });
  const fromTab = await handleTabCreated(
    { id: 4, windowId: 4, pinned: false, incognito: true },
    api,
    NOW,
  );
  assert.equal(fromTab.closedWindowId, 4);
  assert.equal(fromTab.closedTabId, null);
  assert.deepEqual(
    state.windows.map((win) => win.id),
    [1],
  );
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

test('a tab that is already gone, or a remove that still sees it, is reported honestly', async () => {
  const missing = createMockChrome({
    tabs: manyTabs(10),
    windows: [normalWindow(1)],
    timestamp: NOW - PAUSE_MS,
  });
  const raced = await handleTabCreated(tab(11, 1), missing.api, NOW);
  assert.equal(raced.closedTabId, null);
  assert.equal(raced.error, null);
  assert.equal(missing.state.tabs.length, 10);

  const stuck = createMockChrome({
    tabs: manyTabs(11),
    windows: [normalWindow(1)],
    timestamp: NOW - PAUSE_MS,
    failNextRemove: true,
  });
  const failed = await handleTabCreated(tab(11, 1), stuck.api, NOW);
  assert.equal(failed.closedTabId, null);
  assert.equal(failed.error.message, 'remove failed');
  assert.equal(stuck.state.tabs.length, 11);
});

test('badge failures are returned and do not replace an earlier error', async () => {
  const badge = createMockChrome({
    tabs: manyTabs(11),
    windows: [normalWindow(1)],
    timestamp: NOW - PAUSE_MS,
    badgeFails: true,
  });
  const badged = await handleTabCreated(tab(11, 1), badge.api, NOW);
  assert.equal(badged.closedTabId, 11);
  assert.equal(badged.error.message, 'badge failed');

  const both = createMockChrome({
    tabs: manyTabs(11),
    windows: [normalWindow(1)],
    storageFails: true,
    badgeFails: true,
  });
  const stored = await handleTabCreated(tab(11, 1), both.api, NOW);
  assert.equal(stored.closedTabId, null);
  assert.equal(stored.error.message, 'storage unavailable');
});

test('uses a window that was not in the list yet, and ignores a tab with no window', async () => {
  const hidden = { ...normalWindow(2), omitFromGetAll: true };
  const created = tab(30, 2);
  const listed = createMockChrome({
    tabs: [...manyTabs(10), created],
    windows: [normalWindow(1), hidden],
    timestamp: NOW - PAUSE_MS,
  });
  const closed = await handleTabCreated(created, listed.api, NOW);
  assert.equal(closed.closedTabId, 30);

  const noWindow = createMockChrome({
    tabs: [...manyTabs(12), { id: 4, pinned: false, incognito: false }],
    windows: [normalWindow(1)],
    timestamp: NOW - PAUSE_MS,
  });
  const left = await handleTabCreated(
    { id: 4, pinned: false, incognito: false },
    noWindow.api,
    NOW,
  );
  assert.equal(left.closedTabId, null);
  assert.equal(left.error, null);

  const missingWindow = createMockChrome({
    tabs: [...manyTabs(12), tab(8, 99)],
    windows: [normalWindow(1)],
    timestamp: NOW - PAUSE_MS,
  });
  const lookedUp = await handleTabCreated(tab(8, 99), missingWindow.api, NOW);
  assert.equal(lookedUp.closedTabId, null);
  assert.equal(lookedUp.error, null);
});

test('an incognito tab closes the window even when the window list missed it', async () => {
  const hidden = { ...normalWindow(4, true), omitFromGetAll: true };
  const created = { id: 4, windowId: 4, pinned: false, incognito: true };
  const found = createMockChrome({
    tabs: [tab(1, 1), created],
    windows: [normalWindow(1), hidden],
    timestamp: NOW,
  });
  const closed = await handleTabCreated(created, found.api, NOW);
  assert.equal(closed.closedWindowId, 4);
  assert.deepEqual(
    found.state.windows.map((win) => win.id),
    [1],
  );

  const absent = createMockChrome({
    tabs: [tab(1, 1)],
    windows: [normalWindow(1)],
    timestamp: NOW,
  });
  const raced = await handleTabCreated(created, absent.api, NOW);
  assert.equal(raced.closedWindowId, null);
  assert.equal(raced.error, null);
});

test('tab and window events without an id only refresh the badge', async () => {
  const { api, state } = createMockChrome({
    tabs: manyTabs(12),
    windows: [normalWindow(1)],
    timestamp: NOW - PAUSE_MS,
  });
  const tabResult = await handleTabCreated({ windowId: 1 }, api, NOW);
  assert.equal(tabResult.closedTabId, null);
  assert.equal(tabResult.badge, '1');
  assert.equal(state.tabs.length, 12);

  const windowResult = await handleWindowCreated({ type: 'normal' }, api, NOW);
  assert.equal(windowResult.closedWindowId, null);
  assert.equal(windowResult.badge, '1');
  assert.equal(state.windows.length, 1);
});

test('a window-list or storage failure does not close the new window or tab', async () => {
  const created = normalWindow(2);
  const storage = createMockChrome({
    windows: [normalWindow(1), created],
    tabs: [tab(1, 1), tab(2, 2)],
    storageFails: true,
  });
  const stored = await handleWindowCreated(created, storage.api, NOW);
  assert.equal(stored.closedWindowId, null);
  assert.equal(stored.error.message, 'storage unavailable');
  assert.equal(storage.state.windows.length, 2);

  const windows = createMockChrome({
    windows: [normalWindow(1), created],
    tabs: manyTabs(12),
    timestamp: NOW - PAUSE_MS,
    windowsFail: true,
  });
  const listed = await handleWindowCreated(created, windows.api, NOW);
  assert.equal(listed.closedWindowId, null);
  assert.equal(listed.error.message, 'windows unavailable');

  const tabFailure = await handleTabCreated(tab(12, 1), windows.api, NOW);
  assert.equal(tabFailure.closedTabId, null);
  assert.equal(tabFailure.error.message, 'windows unavailable');
  assert.equal(windows.state.tabs.length, 12);
});

test('does not close a new normal window during the pause', async () => {
  const created = normalWindow(2);
  const { api, state } = createMockChrome({
    windows: [normalWindow(1), created],
    tabs: [tab(1, 1), tab(2, 2)],
    timestamp: NOW,
  });
  const result = await handleWindowCreated(created, api, NOW);
  assert.equal(result.active, false);
  assert.equal(result.closedWindowId, null);
  assert.equal(state.windows.length, 2);
});

test('removal only refreshes the badge', async () => {
  const { api, state } = createMockChrome({
    windows: [normalWindow(1), normalWindow(2)],
    tabs: [tab(1, 1)],
  });
  state.windows.pop();
  const refreshed = await refreshAfterRemoval(api);
  assert.equal(refreshed.closedTabId, null);
  assert.equal(refreshed.closedWindowId, null);
  assert.equal(refreshed.badge, '1');

  const failing = createMockChrome({
    windows: [normalWindow(1)],
    badgeFails: true,
  });
  const result = await refreshAfterRemoval(failing.api);
  assert.equal(result.error.message, 'badge failed');
});
