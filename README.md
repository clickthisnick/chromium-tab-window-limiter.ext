# Tab Window Limiter

Limits how many tabs and windows stay open in Chromium (Chrome, Edge, Brave, and other Chromium browsers).

## What it does

- Keeps you to **10 unpinned tabs** in normal windows and **1 normal window**.
- Closes an **incognito** window as soon as it opens.
- Closes only the **new** tab or window that crosses a limit. Tabs you already have stay open, including tabs opened while the limiter is paused.
- Pinned tabs, popup windows, and DevTools are left open and do not count toward the limit.
- The toolbar badge is grey and shows how many Chrome windows are open, including popups and DevTools.
- **Pause limiter** waits 10 seconds and then turns enforcement back on. **Resume limiter** turns it back on immediately.
- The pause is stored as a number in `chrome.storage.local` under `tabWindowLimiter`.

## Install

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select the `src` directory in this repo.

There is no build step. After you pull changes, choose **Reload** on the extension card.

Incognito windows are visible to the extension only after you open its details and turn on **Allow in Incognito**.

## Popup

Open the toolbar button **Tab Window Limiter**.

- **Pause limiter** / **Resume limiter** pauses for 10 seconds, or turns the limiter back on.
- **Unpinned tabs** and **Normal windows** are the numbers the limit uses.
- **All windows** is the same count as the toolbar badge.
- The status line under the button updates after every click.

## Change the limits

Edit the constants at the top of `src/shared.js`:

- `MAX_TABS` (default `10`)
- `MAX_WINDOWS` (default `1`)
- `PAUSE_MS` (default `10000`)
- `DISABLE_INCOGNITO` (default `true`)

Reload the unpacked extension after saving. Notes for automated agents are in `llms.txt` at the repository root.

## Tests

Requires Node.js 22 or newer. No packages need to be installed.

```bash
npm test
npm run lint
```

GitHub Actions runs those commands on push and pull request. `npm test` only runs `test/*.test.js`, so the Chrome stand-in in `test/mock-chrome.js` is not executed as a test.

## Make better

You can hide extensions in Chrome.
