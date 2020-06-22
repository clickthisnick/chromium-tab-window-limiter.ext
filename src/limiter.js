let tabsCount;
let windowsCount;

const maxTabsCount = 10;
const maxWindowsCount = 1;
const disableIncognitoWindows = true;

function updateTabsCount(tab) {
    chrome.tabs.query({
        windowType: 'normal',
        pinned: false
    }, function (tabs) {
        tabsCount = tabs.length;
        document.getElementById('tabs').innerText = tabsCount
    });
}

function updateWindowsCount(window) {
    chrome.windows.getAll({

    }, function (windows) {
        windowsCount = windows.length;
        document.getElementById('windows').innerText = windowsCount
        chrome.browserAction.setBadgeText({"text": `${windowsCount}`})
    });
}

function createWindow(window) {
    if (disableIncognitoWindows) {
        if (window.incognito) {
            chrome.windows.remove(window.id); 
        }
    }

    updateWindowsCount()

    if (windowsCount > maxWindowsCount) {
        let dateString = localStorage.getItem(extensionName)

        if (isAboveThreshold(dateString)) {
            chrome.windows.remove(window.id);
        }
    }
}

function createTab(tab) {
    updateTabsCount()

    if (tabsCount > maxTabsCount) {
        let dateString = localStorage.getItem(extensionName)

        if (isAboveThreshold(dateString)) {
            chrome.tabs.remove(tab.id);
        }
    }
}

chrome.tabs.onCreated.addListener(createTab)
chrome.tabs.onUpdated.addListener(updateTabsCount)
chrome.tabs.onRemoved.addListener(updateTabsCount)

chrome.windows.onCreated.addListener(createWindow)


function init() {
    // By default enable
    const millisecondsString = localStorage.getItem(extensionName)
    if (millisecondsString === null) {
        localStorage.setItem(extensionName, getMillisecondTime(millisecondsLimit))
    }

    updateTabsCount();
    updateWindowsCount();
}

init()