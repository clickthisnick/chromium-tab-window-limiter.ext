import { STORAGE_KEY } from '../src/shared.js';

export function createMockChrome(initial = {}) {
  const state = {
    tabs: (initial.tabs ?? []).map((tab) => ({ ...tab })),
    windows: (initial.windows ?? []).map((win) => ({ ...win })),
    timestamp: initial.timestamp,
    badge: null,
    badgeColor: null,
    storageFails: Boolean(initial.storageFails),
    removedTabIds: [],
    removedWindowIds: [],
  };

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
        state.removedTabIds.push(id);
        const existed = state.tabs.some((tab) => tab.id === id);
        state.tabs = state.tabs.filter((tab) => tab.id !== id);
        if (!existed) {
          throw new Error(`No tab ${id}`);
        }
      },
    },
    windows: {
      async getAll() {
        return state.windows.map((win) => ({ ...win }));
      },
      async get(id) {
        const win = state.windows.find((item) => item.id === id);
        if (!win) {
          throw new Error(`No window ${id}`);
        }
        return { ...win };
      },
      async remove(id) {
        state.removedWindowIds.push(id);
        const existed = state.windows.some((win) => win.id === id);
        state.windows = state.windows.filter((win) => win.id !== id);
        state.tabs = state.tabs.filter((tab) => tab.windowId !== id);
        if (!existed) {
          throw new Error(`No window ${id}`);
        }
      },
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
    },
    action: {
      async setBadgeBackgroundColor({ color }) {
        state.badgeColor = color;
      },
      async setBadgeText({ text }) {
        state.badge = text;
      },
    },
  };

  return { api, state };
}
