const maxTabsCount = 10;
const maxWindowsCount = 1;
const disableIncognitoWindows = true;
const extensionName = 'tabWindowLimiter';
const millisecondsLimit = 10000;

// Initialize storage
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(extensionName, data => {
    if (!data[extensionName]) {
      chrome.storage.local.set({ [extensionName]: Date.now() - millisecondsLimit });
    }
  });
});

async function getCounts() {
  const tabs = await chrome.tabs.query({ windowType: 'normal', pinned: false });
  const windows = await chrome.windows.getAll({});
  return { tabsCount: tabs.length, windowsCount: windows.length };
}

function isAboveThreshold(timestamp) {
  return Date.now() - timestamp > millisecondsLimit;
}

async function enforceLimits() {
  const { tabsCount, windowsCount } = await getCounts();
  const data = await chrome.storage.local.get(extensionName);
  const active = isAboveThreshold(data[extensionName]);

  if (windowsCount > maxWindowsCount && active) {
    const allWindows = await chrome.windows.getAll();
    chrome.windows.remove(allWindows[allWindows.length - 1].id);
  }

  if (tabsCount > maxTabsCount && active) {
    const allTabs = await chrome.tabs.query({});
    chrome.tabs.remove(allTabs[allTabs.length - 1].id);
  }

  chrome.action.setBadgeBackgroundColor({ color: '#808080' });
  chrome.action.setBadgeText({ text: `${windowsCount}` });
}

// Tab & Window Listeners
chrome.tabs.onCreated.addListener(enforceLimits);
chrome.tabs.onRemoved.addListener(enforceLimits);
chrome.windows.onCreated.addListener(async (win) => {
  if (disableIncognitoWindows && win.incognito) {
    chrome.windows.remove(win.id);
  }
  enforceLimits();
});
