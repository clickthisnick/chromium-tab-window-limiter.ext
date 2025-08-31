const extensionName = 'tabWindowLimiter';
const millisecondsLimit = 10000;

function getMillisecondTime(pastMilliseconds = 0) {
  return Date.now() - pastMilliseconds;
}

function isAboveThreshold(timestamp) {
  return Date.now() - timestamp > millisecondsLimit;
}

async function updateUI() {
  const tabs = await chrome.tabs.query({ windowType: 'normal', pinned: false });
  const windows = await chrome.windows.getAll({});

  document.getElementById('tabs').innerText = tabs.length;
  document.getElementById('windows').innerText = windows.length;

  const data = await chrome.storage.local.get(extensionName);
  const active = isAboveThreshold(data[extensionName]);
  const button = document.getElementById(extensionName);
  button.value = active ? 'Disable' : 'Enable';
}

async function toggleActive() {
  const data = await chrome.storage.local.get(extensionName);
  const active = isAboveThreshold(data[extensionName]);
  const newTimestamp = active ? Date.now() : Date.now() - millisecondsLimit;
  await chrome.storage.local.set({ [extensionName]: newTimestamp });
  updateUI();
}

// Generate button
const div = document.getElementById('active');
div.innerHTML = `<input id="${extensionName}" type="button">`;
document.getElementById(extensionName).addEventListener('click', toggleActive);

updateUI();

