import {
  STORAGE_KEY,
  countLimitedTabs,
  countLimitedWindows,
  isLimiterActive,
  limiterStatusCopy,
  limitsDescription,
  timestampForToggle,
} from './shared.js';

const button = document.getElementById(STORAGE_KEY);
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');
const limitsEl = document.getElementById('limits');
const previewEl = document.getElementById('preview-note');

function extensionApi() {
  const api = globalThis.chrome;
  if (!api?.tabs?.query || !api?.windows?.getAll || !api?.storage?.local?.get) {
    return null;
  }
  return api;
}

function setError(message) {
  if (!message) {
    errorEl.hidden = true;
    errorEl.textContent = '';
    return;
  }
  errorEl.hidden = false;
  errorEl.textContent = message;
}

function render(snapshot) {
  document.getElementById('tabs').textContent = String(snapshot.tabs);
  document.getElementById('normal-windows').textContent = String(snapshot.normalWindows);
  document.getElementById('windows').textContent = String(snapshot.windows);
  const copy = limiterStatusCopy(snapshot.active);
  button.textContent = copy.buttonLabel;
  statusEl.textContent = copy.status;
  limitsEl.textContent = limitsDescription();
}

async function readSnapshot(api) {
  const [tabs, windows, data] = await Promise.all([
    api.tabs.query({}),
    api.windows.getAll(),
    api.storage.local.get(STORAGE_KEY),
  ]);
  return {
    tabs: countLimitedTabs(tabs, windows),
    normalWindows: countLimitedWindows(windows),
    windows: windows.length,
    active: isLimiterActive(data[STORAGE_KEY]),
  };
}

async function updateUI(api) {
  const snapshot = await readSnapshot(api);
  render(snapshot);
  setError('');
  return snapshot;
}

async function toggleActive(api) {
  button.disabled = true;
  try {
    const data = await api.storage.local.get(STORAGE_KEY);
    const active = isLimiterActive(data[STORAGE_KEY]);
    await api.storage.local.set({ [STORAGE_KEY]: timestampForToggle(active) });
    await updateUI(api);
  } catch (err) {
    console.error(err);
    setError('Could not change the limiter. Try again.');
  } finally {
    button.disabled = false;
    button.focus();
  }
}

function bindLiveUpdates(api) {
  const refresh = () => {
    updateUI(api).catch((err) => {
      console.error(err);
      setError('Could not refresh the tab and window counts.');
    });
  };
  api.tabs.onCreated?.addListener(refresh);
  api.tabs.onRemoved?.addListener(refresh);
  api.windows.onCreated?.addListener(refresh);
  api.windows.onRemoved?.addListener(refresh);
  api.storage.onChanged?.addListener((changes, area) => {
    if (area === 'local' && Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
      refresh();
    }
  });
}

limitsEl.textContent = limitsDescription();

const api = extensionApi();
if (!api) {
  render({ tabs: 0, normalWindows: 0, windows: 0, active: true });
  previewEl.hidden = false;
  button.disabled = true;
} else {
  button.addEventListener('click', () => {
    toggleActive(api);
  });
  bindLiveUpdates(api);
  updateUI(api).catch((err) => {
    console.error(err);
    setError('Could not read tabs, windows, or the saved pause.');
    statusEl.textContent = 'Limiter status is unavailable.';
  });
}
