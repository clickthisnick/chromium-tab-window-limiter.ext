import {
  ensureDefaultTimestamp,
  handleTabCreated,
  handleTabRemoved,
  handleWindowCreated,
  handleWindowRemoved,
  updateBadge,
} from './enforcement.js';
import { createSerializer } from './shared.js';

const enqueue = createSerializer();

function guard(task) {
  enqueue(task).catch((err) => {
    console.error('Tab window limiter failed', err);
  });
}

function report(result) {
  if (result?.error) {
    console.error('Tab window limiter failed', result.error);
  }
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

chrome.tabs.onCreated.addListener((tab) => {
  guard(async () => {
    report(await handleTabCreated(tab));
  });
});

chrome.tabs.onRemoved.addListener(() => {
  guard(async () => {
    report(await handleTabRemoved());
  });
});

chrome.windows.onCreated.addListener((win) => {
  guard(async () => {
    report(await handleWindowCreated(win));
  });
});

chrome.windows.onRemoved.addListener(() => {
  guard(async () => {
    report(await handleWindowRemoved());
  });
});
