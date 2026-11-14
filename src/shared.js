/**
 * Shared limiter rules for the background worker and the popup.
 *
 * chrome.storage.local["tabWindowLimiter"] is a number: the epoch time in
 * milliseconds when the limiter was last paused. Enforcement is on when that
 * value is missing, not a finite number, or at least PAUSE_MS in the past.
 * Existing installs already store this number, so it must not become a boolean.
 */

export const STORAGE_KEY = 'tabWindowLimiter';
export const MAX_TABS = 10;
export const MAX_WINDOWS = 1;
export const DISABLE_INCOGNITO = true;
export const PAUSE_MS = 10000;
export const BADGE_COLOR = '#808080';

export function normalizeTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function isLimiterActive(value, now = Date.now()) {
  const timestamp = normalizeTimestamp(value);
  if (timestamp == null) {
    return true;
  }
  return now - timestamp >= PAUSE_MS;
}

export function initialTimestamp(now = Date.now()) {
  return now - PAUSE_MS;
}

export function timestampForToggle(active, now = Date.now()) {
  return active ? now : now - PAUSE_MS;
}

export function isNormalWindow(win) {
  return Boolean(win) && (win.type == null || win.type === 'normal');
}

export function isLimitedWindow(win) {
  return isNormalWindow(win) && !win.incognito;
}

export function tabCountsTowardLimit(tab, win) {
  if (!tab || typeof tab.id !== 'number') {
    return false;
  }
  if (tab.pinned) {
    return false;
  }
  return isLimitedWindow(win);
}

export function countLimitedWindows(windows, createdWindow) {
  const list = windows.filter(isLimitedWindow);
  if (
    createdWindow &&
    typeof createdWindow.id === 'number' &&
    isLimitedWindow(createdWindow) &&
    !list.some((win) => win.id === createdWindow.id)
  ) {
    return list.length + 1;
  }
  return list.length;
}

export function countLimitedTabs(tabs, windows, createdTab, createdWindow) {
  const windowsById = new Map(windows.map((win) => [win.id, win]));
  if (createdWindow && typeof createdWindow.id === 'number') {
    windowsById.set(createdWindow.id, createdWindow);
  }

  let count = 0;
  let included = false;
  for (const tab of tabs) {
    if (tabCountsTowardLimit(tab, windowsById.get(tab.windowId))) {
      count += 1;
      if (createdTab && tab.id === createdTab.id) {
        included = true;
      }
    }
  }

  const createdWin = createdTab
    ? windowsById.get(createdTab.windowId) ?? createdWindow
    : null;
  if (!included && tabCountsTowardLimit(createdTab, createdWin)) {
    count += 1;
  }
  return count;
}

export function shouldCloseIncognito(win) {
  return Boolean(DISABLE_INCOGNITO && win && win.incognito && typeof win.id === 'number');
}

export function shouldCloseCreatedWindow(win, windows, active) {
  if (!win || typeof win.id !== 'number' || win.incognito || !isLimitedWindow(win)) {
    return false;
  }
  if (!active) {
    return false;
  }
  const count = countLimitedWindows(windows, win);
  if (count <= 1) {
    return false;
  }
  return count > MAX_WINDOWS;
}

export function shouldCloseCreatedTab(tab, win, tabs, windows, active) {
  if (!active || !tabCountsTowardLimit(tab, win)) {
    return false;
  }
  return countLimitedTabs(tabs, windows, tab, win) > MAX_TABS;
}

export function badgeText(windowCount) {
  const count = Number(windowCount);
  if (!Number.isFinite(count) || count < 0) {
    return '0';
  }
  return String(Math.floor(count)).slice(0, 4);
}

export function limiterStatusCopy(active) {
  if (active) {
    return {
      buttonLabel: 'Pause limiter',
      status: 'Limiter is on.',
    };
  }
  return {
    buttonLabel: 'Resume limiter',
    status: `Limiter is paused. It turns back on ${PAUSE_MS / 1000} seconds after you paused it.`,
  };
}

export function limitsDescription() {
  const windowRule = MAX_WINDOWS === 1
    ? 'opening another normal window closes that new window'
    : `opening a normal window past ${MAX_WINDOWS} closes that new window`;
  return `While the limiter is on, opening an unpinned tab past ${MAX_TABS} closes that new tab, and ${windowRule}. Incognito windows close immediately. Pinned tabs, popups, and DevTools stay open. Pause lasts ${PAUSE_MS / 1000} seconds, then the limiter turns back on. The All windows count matches the toolbar badge.`;
}

export function createSerializer() {
  let chain = Promise.resolve();
  return function enqueue(task) {
    const run = chain.then(() => task());
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}
