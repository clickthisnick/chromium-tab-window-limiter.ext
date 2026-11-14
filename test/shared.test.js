import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BADGE_COLOR,
  DISABLE_INCOGNITO,
  MAX_TABS,
  MAX_WINDOWS,
  PAUSE_MS,
  STORAGE_KEY,
  badgeText,
  countLimitedTabs,
  countLimitedWindows,
  createSerializer,
  initialTimestamp,
  isLimiterActive,
  limiterStatusCopy,
  limitsDescription,
  normalizeTimestamp,
  shouldCloseCreatedTab,
  shouldCloseCreatedWindow,
  shouldCloseIncognito,
  tabCountsTowardLimit,
  timestampForToggle,
} from '../src/shared.js';

const NOW = 1_700_000_000_000;

test('keeps the installed limits and storage contract', () => {
  assert.equal(STORAGE_KEY, 'tabWindowLimiter');
  assert.equal(MAX_TABS, 10);
  assert.equal(MAX_WINDOWS, 1);
  assert.equal(DISABLE_INCOGNITO, true);
  assert.equal(PAUSE_MS, 10000);
  assert.equal(BADGE_COLOR, '#808080');
});

test('treats a missing or corrupt pause timestamp as on', () => {
  assert.equal(normalizeTimestamp(undefined), null);
  assert.equal(normalizeTimestamp(null), null);
  assert.equal(normalizeTimestamp(''), null);
  assert.equal(normalizeTimestamp('later'), null);
  assert.equal(normalizeTimestamp(Number.NaN), null);
  assert.equal(normalizeTimestamp(true), null);
  assert.equal(normalizeTimestamp('1700000000000'), 1700000000000);
  assert.equal(isLimiterActive(undefined, NOW), true);
  assert.equal(isLimiterActive('later', NOW), true);
  assert.equal(isLimiterActive(0, NOW), true);
});

test('pause lasts exactly PAUSE_MS and enable is immediate at the boundary', () => {
  assert.equal(isLimiterActive(NOW, NOW), false);
  assert.equal(isLimiterActive(NOW - PAUSE_MS + 1, NOW), false);
  assert.equal(isLimiterActive(NOW - PAUSE_MS, NOW), true);
  assert.equal(isLimiterActive(NOW - PAUSE_MS - 1, NOW), true);

  const pausedAt = timestampForToggle(true, NOW);
  assert.equal(isLimiterActive(pausedAt, NOW), false);
  assert.equal(isLimiterActive(pausedAt, NOW + PAUSE_MS), true);

  const resumedAt = timestampForToggle(false, NOW);
  assert.equal(resumedAt, initialTimestamp(NOW));
  assert.equal(isLimiterActive(resumedAt, NOW), true);
});

test('counts only unpinned tabs in non-incognito normal windows', () => {
  const windows = [
    { id: 1, type: 'normal', incognito: false },
    { id: 2, type: 'popup', incognito: false },
    { id: 3, type: 'devtools', incognito: false },
    { id: 4, type: 'normal', incognito: true },
  ];
  const tabs = [
    { id: 1, windowId: 1, pinned: false },
    { id: 2, windowId: 1, pinned: true },
    { id: 3, windowId: 2, pinned: false },
    { id: 4, windowId: 3, pinned: false },
    { id: 5, windowId: 4, pinned: false },
  ];

  assert.equal(countLimitedTabs(tabs, windows), 1);
  assert.equal(tabCountsTowardLimit(tabs[1], windows[0]), false);
  assert.equal(tabCountsTowardLimit({ id: 'x', pinned: false }, windows[0]), false);
  assert.equal(countLimitedWindows(windows), 1);
});

test('includes a created tab or window that is not in the query yet', () => {
  const windows = [{ id: 1, type: 'normal', incognito: false }];
  const createdWindow = { id: 2, type: 'normal', incognito: false };
  const tabs = Array.from({ length: 10 }, (_, index) => ({
    id: index + 1,
    windowId: 1,
    pinned: false,
  }));
  const createdTab = { id: 11, windowId: 1, pinned: false };

  assert.equal(countLimitedWindows(windows, createdWindow), 2);
  assert.equal(countLimitedTabs(tabs, windows, createdTab, windows[0]), 11);
  assert.equal(shouldCloseCreatedTab(createdTab, windows[0], tabs, windows, true), true);
  assert.equal(shouldCloseCreatedTab(createdTab, windows[0], tabs, windows, false), false);
  assert.equal(
    shouldCloseCreatedWindow(createdWindow, windows, true),
    true,
  );
});

test('does not close pinned tabs, popups, devtools, or the last normal window', () => {
  const normal = { id: 1, type: 'normal', incognito: false };
  const popup = { id: 2, type: 'popup', incognito: false };
  const devtools = { id: 3, type: 'devtools', incognito: false };
  const pinned = { id: 9, windowId: 1, pinned: true };
  const tabs = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    windowId: 1,
    pinned: false,
  }));

  assert.equal(shouldCloseCreatedTab(pinned, normal, tabs, [normal], true), false);
  assert.equal(
    shouldCloseCreatedTab({ id: 20, windowId: 2, pinned: false }, popup, tabs, [normal, popup], true),
    false,
  );
  assert.equal(shouldCloseCreatedWindow(popup, [normal, popup], true), false);
  assert.equal(shouldCloseCreatedWindow(devtools, [normal, devtools], true), false);
  assert.equal(shouldCloseCreatedWindow(normal, [normal], true), false);
  assert.equal(shouldCloseCreatedWindow(normal, [normal], false), false);
});

test('incognito windows close even while paused', () => {
  const incognito = { id: 5, type: 'normal', incognito: true };
  assert.equal(shouldCloseIncognito(incognito), true);
  assert.equal(shouldCloseIncognito({ id: 1, type: 'normal', incognito: false }), false);
  assert.equal(shouldCloseCreatedWindow(incognito, [incognito, { id: 1, type: 'normal' }], false), false);
});

test('badge text stays within four characters', () => {
  assert.equal(badgeText(0), '0');
  assert.equal(badgeText(2), '2');
  assert.equal(badgeText(10000), '1000');
  assert.equal(badgeText(-1), '0');
  assert.equal(badgeText(Number.NaN), '0');
});

test('popup copy names the action and the pause', () => {
  const on = limiterStatusCopy(true);
  const off = limiterStatusCopy(false);
  assert.equal(on.buttonLabel, 'Pause limiter');
  assert.equal(on.status, 'Limiter is on.');
  assert.match(off.buttonLabel, /Resume limiter/);
  assert.match(off.status, /10 seconds/);
  assert.match(limitsDescription(), /past 10/);
  assert.match(limitsDescription(), /another normal window/);
  assert.match(limitsDescription(), /Pinned tabs/);
});

test('serializer runs one task at a time and continues after failure', async () => {
  const enqueue = createSerializer();
  const order = [];
  const first = enqueue(async () => {
    order.push('start-1');
    await new Promise((resolve) => setTimeout(resolve, 15));
    order.push('end-1');
  });
  const failing = enqueue(async () => {
    order.push('fail');
    throw new Error('boom');
  });
  const third = enqueue(async () => {
    order.push('third');
  });

  await first;
  await assert.rejects(failing, /boom/);
  await third;
  assert.deepEqual(order, ['start-1', 'end-1', 'fail', 'third']);
});
