# Agent notes

## Before you finish

```bash
npm install
npm run check
```

`npm run check` is the single check. It formats, lints, typechecks, checks HTML, CSS, links, spelling, and workflows, then runs the tests with coverage and the size budget.

## Rules

- Keep it simple. The extension loads unpacked from `src/`. Do not add a build step.
- Do not add a dependency without a stated reason.
- Keep archived content, including the "Make better" note in the README.
- Every bug fix gets a test.
- Never lower the coverage floor or the size budget. The floors are the `--test-coverage-*` values in `package.json`. `maxBytes` in `size-budget.json` is the maximum unpacked `src/` size (measured size plus 512 bytes). Do not decrease the floors or increase `maxBytes`.
- Do not make visible UI changes unless asked.
- Keep existing URLs working. The link check in `npm run check` must pass.

`chrome.storage.local` key `tabWindowLimiter` is a number: the epoch milliseconds when the limiter was last paused. Missing or invalid values mean the limiter is on. Do not store a boolean there.

## CI

`.github/workflows/ci.yml` runs on `push` and `pull_request` with `contents: read`. The job checks out the repo, runs `npm ci`, and then runs `npm run check`.

Lefthook runs `npm run lint` on pre-commit. That is the fast half: Prettier, ESLint, `tsc --noEmit`, html-validate, stylelint, the link checker, codespell, and actionlint. Coverage and the size budget run only inside `npm run check`.

Dependabot updates npm, pip, and GitHub Actions weekly, in one group per ecosystem.

codespell is the Python package in `requirements.txt`. The npm package named `codespell` is a different tool. actionlint is pinned in `scripts/install-check-tools.js` because it ships as a release binary. `@types/node` is installed so `tsc --noEmit` can check the scripts. `overrides` in `package.json` pins `glob` and `minimatch` past the advisories still pulled by the latest linkinator. The chrome surface the extension calls is declared in `types/chrome-api.d.ts`. `src/popup.html` is left out of Prettier because reprinting it only makes the shipped popup larger.

Branch protection is not stored in this repo. The default branch is `master`. Require the CI check there in the repository settings.
