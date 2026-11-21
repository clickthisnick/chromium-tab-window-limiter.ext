import {
  ensureDefaultTimestamp,
  handleTabCreated,
  handleWindowCreated,
  refreshAfterRemoval,
  updateBadge,
} from './enforcement.js';
import { createSerializer } from './shared.js';

const enqueue = createSerializer();

function guard(task) {
  enqueue(task).catch((err) => {
    console.error('Tab window limiter failed', err);
  });
}

function listen(event, task) {
  event.addListener((payload) => {
    guard(async () => {
      const result = await task(payload);
      if (result?.error) {
        console.error('Tab window limiter failed', result.error);
      }
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  guard(async () => {
    await ensureDefaultTimestamp();
    await updateBadge();
  });
});

chrome.runtime.onStartup.addListener(() => {
  guard(() => updateBadge());
});

listen(chrome.tabs.onCreated, handleTabCreated);
listen(chrome.tabs.onRemoved, () => refreshAfterRemoval());
listen(chrome.windows.onCreated, handleWindowCreated);
listen(chrome.windows.onRemoved, () => refreshAfterRemoval());
