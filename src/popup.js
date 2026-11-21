import {
  STORAGE_KEY,
  countLimitedTabs,
  countLimitedWindows,
  isLimiterActive,
  limiterStatusCopy,
  limitsDescription,
  timestampForToggle,
} from './shared.js';

function extensionApi() {
  const api = globalThis.chrome;
  if (!api?.tabs?.query || !api?.windows?.getAll || !api?.storage?.local?.get) {
    return null;
  }
  return api;
}

/** @param {PopupDocument} doc @param {ChromeApi | null} [api] */
export function mountPopup(doc, api = extensionApi()) {
  const button = doc.getElementById(STORAGE_KEY);
  const statusEl = doc.getElementById('status');
  const errorEl = doc.getElementById('error');
  const limitsEl = doc.getElementById('limits');
  const previewEl = doc.getElementById('preview-note');

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
    doc.getElementById('tabs').textContent = String(snapshot.tabs);
    doc.getElementById('normal-windows').textContent = String(snapshot.normalWindows);
    doc.getElementById('windows').textContent = String(snapshot.windows);
    const copy = limiterStatusCopy(snapshot.active);
    button.textContent = copy.buttonLabel;
    statusEl.textContent = copy.status;
    limitsEl.textContent = limitsDescription();
  }

  async function readSnapshot(browser) {
    const [tabs, windows, data] = await Promise.all([
      browser.tabs.query({}),
      browser.windows.getAll(),
      browser.storage.local.get(STORAGE_KEY),
    ]);
    return {
      tabs: countLimitedTabs(tabs, windows),
      normalWindows: countLimitedWindows(windows),
      windows: windows.length,
      active: isLimiterActive(data[STORAGE_KEY]),
    };
  }

  async function updateUI(browser) {
    const snapshot = await readSnapshot(browser);
    render(snapshot);
    setError('');
    return snapshot;
  }

  async function toggleActive(browser) {
    button.disabled = true;
    try {
      const data = await browser.storage.local.get(STORAGE_KEY);
      const active = isLimiterActive(data[STORAGE_KEY]);
      await browser.storage.local.set({ [STORAGE_KEY]: timestampForToggle(active) });
      await updateUI(browser);
    } catch (err) {
      console.error(err);
      setError('Could not change the limiter. Try again.');
    } finally {
      button.disabled = false;
      button.focus();
    }
  }

  function bindLiveUpdates(browser) {
    const refresh = () => {
      updateUI(browser).catch((err) => {
        console.error(err);
        setError('Could not refresh the tab and window counts.');
      });
    };
    browser.tabs.onCreated?.addListener(refresh);
    browser.tabs.onRemoved?.addListener(refresh);
    browser.windows.onCreated?.addListener(refresh);
    browser.windows.onRemoved?.addListener(refresh);
    browser.storage.onChanged?.addListener((changes, area) => {
      if (area === 'local' && Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
        refresh();
      }
    });
  }

  limitsEl.textContent = limitsDescription();

  if (!api) {
    render({ tabs: 0, normalWindows: 0, windows: 0, active: true });
    previewEl.hidden = false;
    button.disabled = true;
    return;
  }

  button.addEventListener('click', () => toggleActive(api));
  bindLiveUpdates(api);
  updateUI(api).catch((err) => {
    console.error(err);
    setError('Could not read tabs, windows, or the saved pause.');
    statusEl.textContent = 'Limiter status is unavailable.';
  });
}

if (typeof document !== 'undefined') {
  mountPopup(document);
}
