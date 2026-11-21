import { STORAGE_KEY } from '../src/shared.js';

function emitter() {
  const listeners = [];
  return {
    addListener(fn) {
      listeners.push(fn);
    },
    emit(...args) {
      for (const fn of listeners) {
        fn(...args);
      }
    },
  };
}

export function createMockChrome(initial = {}) {
  const state = {
    tabs: (initial.tabs ?? []).map((tab) => ({ ...tab })),
    windows: (initial.windows ?? []).map((win) => ({ ...win })),
    timestamp: initial.timestamp,
    badge: null,
    badgeColor: null,
    storageFails: Boolean(initial.storageFails),
    windowsFail: Boolean(initial.windowsFail),
    badgeFails: Boolean(initial.badgeFails),
    failNextRemove: Boolean(initial.failNextRemove),
    /** @type {number[]} */
    removedTabIds: [],
    /** @type {number[]} */
    removedWindowIds: [],
  };

  function failRemove() {
    if (!state.failNextRemove) {
      return false;
    }
    state.failNextRemove = false;
    return true;
  }

  const api = {
    tabs: {
      async query() {
        return state.tabs.map((tab) => ({ ...tab }));
      },
      async get(id) {
        const tab = state.tabs.find((item) => item.id === id);
        if (!tab) {
          throw new Error(`No tab ${id}`);
        }
        return { ...tab };
      },
      async remove(id) {
        if (failRemove()) {
          throw new Error('remove failed');
        }
        state.removedTabIds.push(id);
        const existed = state.tabs.some((tab) => tab.id === id);
        state.tabs = state.tabs.filter((tab) => tab.id !== id);
        if (!existed) {
          throw new Error(`No tab ${id}`);
        }
      },
      onCreated: emitter(),
      onRemoved: emitter(),
    },
    windows: {
      async getAll() {
        if (state.windowsFail) {
          throw new Error('windows unavailable');
        }
        return state.windows.filter((win) => !win.omitFromGetAll).map((win) => ({ ...win }));
      },
      async get(id) {
        const win = state.windows.find((item) => item.id === id);
        if (!win) {
          throw new Error(`No window ${id}`);
        }
        return { ...win };
      },
      async remove(id) {
        if (failRemove()) {
          throw new Error('remove failed');
        }
        state.removedWindowIds.push(id);
        const existed = state.windows.some((win) => win.id === id);
        state.windows = state.windows.filter((win) => win.id !== id);
        state.tabs = state.tabs.filter((tab) => tab.windowId !== id);
        if (!existed) {
          throw new Error(`No window ${id}`);
        }
      },
      onCreated: emitter(),
      onRemoved: emitter(),
    },
    storage: {
      local: {
        async get() {
          if (state.storageFails) {
            throw new Error('storage unavailable');
          }
          if (state.timestamp === undefined) {
            return {};
          }
          return { [STORAGE_KEY]: state.timestamp };
        },
        async set(values) {
          if (state.storageFails) {
            throw new Error('storage unavailable');
          }
          state.timestamp = values[STORAGE_KEY];
        },
      },
      onChanged: emitter(),
    },
    runtime: {
      onInstalled: emitter(),
      onStartup: emitter(),
    },
    action: {
      async setBadgeBackgroundColor({ color }) {
        state.badgeColor = color;
      },
      async setBadgeText({ text }) {
        if (state.badgeFails) {
          throw new Error('badge failed');
        }
        state.badge = text;
      },
    },
  };

  return { api, state };
}
