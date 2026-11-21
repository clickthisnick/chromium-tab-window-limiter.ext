import {
  BADGE_COLOR,
  DISABLE_INCOGNITO,
  STORAGE_KEY,
  badgeText,
  initialTimestamp,
  isLimiterActive,
  normalizeTimestamp,
  shouldCloseCreatedTab,
  shouldCloseCreatedWindow,
  shouldCloseIncognito,
} from './shared.js';

/** @returns {LimiterResult} */
function emptyResult() {
  return {
    closedTabId: null,
    closedWindowId: null,
    active: null,
    badge: null,
    error: null,
  };
}

async function readActive(api, now) {
  const data = await api.storage.local.get(STORAGE_KEY);
  return isLimiterActive(data[STORAGE_KEY], now);
}

export async function updateBadge(api = chrome) {
  const windows = await api.windows.getAll();
  const text = badgeText(windows.length);
  await api.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  await api.action.setBadgeText({ text });
  return text;
}

export async function ensureDefaultTimestamp(api = chrome, now = Date.now()) {
  const data = await api.storage.local.get(STORAGE_KEY);
  if (data[STORAGE_KEY] == null) {
    const timestamp = initialTimestamp(now);
    await api.storage.local.set({ [STORAGE_KEY]: timestamp });
    return timestamp;
  }
  return normalizeTimestamp(data[STORAGE_KEY]);
}

async function removeIfPresent(collection, id) {
  try {
    await collection.remove(id);
    return true;
  } catch (err) {
    try {
      await collection.get(id);
    } catch {
      return false;
    }
    throw err;
  }
}

async function finish(result, api) {
  try {
    result.badge = await updateBadge(api);
  } catch (err) {
    if (!result.error) {
      result.error = err;
    }
  }
  return result;
}

async function windowForTab(tab, windows, api) {
  const known = windows.find((win) => win.id === tab.windowId);
  if (known) {
    return known;
  }
  if (typeof tab.windowId !== 'number') {
    return null;
  }
  try {
    return await api.windows.get(tab.windowId);
  } catch {
    return null;
  }
}

export async function handleTabCreated(tab, api = chrome, now = Date.now()) {
  const result = emptyResult();
  try {
    if (!tab || typeof tab.id !== 'number') {
      return await finish(result, api);
    }

    try {
      result.active = await readActive(api, now);
    } catch (err) {
      result.error = err;
      return await finish(result, api);
    }

    const windows = await api.windows.getAll();
    const win = await windowForTab(tab, windows, api);
    const incognitoWindowId = win?.id ?? tab.windowId;
    if (
      shouldCloseIncognito(win) ||
      (DISABLE_INCOGNITO && tab.incognito && typeof incognitoWindowId === 'number')
    ) {
      const removed = await removeIfPresent(api.windows, incognitoWindowId);
      if (removed) {
        result.closedWindowId = incognitoWindowId;
      }
      return await finish(result, api);
    }

    if (!result.active) {
      return await finish(result, api);
    }

    const tabs = await api.tabs.query({});
    if (shouldCloseCreatedTab(tab, win, tabs, windows, result.active)) {
      const removed = await removeIfPresent(api.tabs, tab.id);
      if (removed) {
        result.closedTabId = tab.id;
      }
    }
  } catch (err) {
    result.error = err;
  }
  return finish(result, api);
}

export async function handleWindowCreated(win, api = chrome, now = Date.now()) {
  const result = emptyResult();
  try {
    if (shouldCloseIncognito(win)) {
      const removed = await removeIfPresent(api.windows, win.id);
      if (removed) {
        result.closedWindowId = win.id;
      }
      return await finish(result, api);
    }

    if (!win || typeof win.id !== 'number') {
      return await finish(result, api);
    }

    try {
      result.active = await readActive(api, now);
    } catch (err) {
      result.error = err;
      return await finish(result, api);
    }

    const windows = await api.windows.getAll();
    if (shouldCloseCreatedWindow(win, windows, result.active)) {
      const removed = await removeIfPresent(api.windows, win.id);
      if (removed) {
        result.closedWindowId = win.id;
      }
    }
  } catch (err) {
    result.error = err;
  }
  return finish(result, api);
}

export async function refreshAfterRemoval(api = chrome) {
  return finish(emptyResult(), api);
}
