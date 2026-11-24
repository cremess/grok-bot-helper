# Task 21 — Automatic updates with electron-updater (replaces the opt-in "check for updates")

Read `AGENTS.md` first. `electron-updater@6.8.12` is **already installed** by Claude Code as a runtime dependency (reason: in-app automatic updates from GitHub Releases). Record that line in RESULT.md. Do not add anything else.

## Goal
Installed copies of Grok Bot Helper update themselves: check GitHub Releases, download in the background, install on quit, and let the user restart now. Today the app only has an opt-in check that opens the release page (`src/lib/update.js` + `checkForUpdate()` in `src/main.js`); **replace it** with electron-updater and keep the useful pieces (version helpers, safe URL check, i18n, tray item).

## Files involved
- `src/main.js`, `src/lib/update.js` (+ `test/update.test.js`), `src/lib/settings.js` (+ `test/settings.test.js`), `src/lib/i18n.js` (en + pt-BR), `src/settings/settings.html|css|js`, `src-settings preload` (`src/settings-preload.js`), `package.json` (`build.publish` only), `README.md` (Privacy/Network + Updates sections only), `CONTRIBUTING.md` (release steps only)

## 1. Packaging (`package.json`)
- Add to `build`: `"publish": [{ "provider": "github", "owner": "cremess", "repo": "grok-bot-helper", "releaseType": "release" }]`. This makes electron-builder write `app-update.yml` into the app and `latest.yml` next to the installer. Do **not** add publish tokens or scripts that upload anything.

## 2. Settings (`src/lib/settings.js`)
- Replace `checkForUpdates` with **`autoUpdate: true`** (boolean, default **true**). Migration in `normalizeSettings`: if `raw.autoUpdate` is a boolean use it; otherwise default `true` (ignore the old `checkForUpdates`). Keep `lastUpdateCheckMs` (finite ≥ 0).
- Tests for default, explicit false, migration from an old file that only has `checkForUpdates`.

## 3. Updater (`src/main.js` + pure helpers in `src/lib/update.js`)
- Only when `app.isPackaged` (never in `npm start`). Use `const { autoUpdater } = require('electron-updater')`, required lazily inside the function that starts it (so dev runs and tests never load it).
- Config: `autoUpdater.autoDownload = true`, `autoUpdater.autoInstallOnAppQuit = true`, `autoUpdater.allowPrerelease = false`, `autoUpdater.allowDowngrade = false`, logger off (no files written with user paths).
- Schedule: first check ~30 s after startup, then every 6 h, only while `settings.autoUpdate` is true; turning it off stops the timer and turning it on starts it (and checks right away). Never two checks at the same time. Update `lastUpdateCheckMs` after each check.
- **Test hook (loopback only):** if the environment variable `GROK_BOT_HELPER_UPDATE_FEED` is set **and** is an `http://127.0.0.1:<port>/…` or `http://localhost:<port>/…` URL (validate with a pure helper `isLoopbackFeed(url)` in `update.js`, with tests), call `autoUpdater.setFeedURL({ provider: 'generic', url })` before checking. Any other value is ignored. Document this in CONTRIBUTING (release section) as the way to test updates locally.
- States kept in memory and exposed to the settings window: `idle`, `checking`, `available` (version), `downloading` (percent), `downloaded` (version), `up-to-date`, `error` (short code only; never show raw error text/paths).
- When an update is **downloaded**: tray balloon "Update ready — Grok Bot Helper {version} will install when you quit. Restart now from the tray menu." (i18n), and the tray menu gets **"Restart to update to {version}"** at the top, which calls `autoUpdater.quitAndInstall(true, true)` (silent install, relaunch). Before calling it, set a flag so the app's own `before-quit`/`will-quit` handlers don't block quitting.
- Keep the existing tray item "Update available…" only for the `available`/`downloading` states? No — remove the old "open release page" flow entirely; electron-updater handles downloading. Remove dead code (`checkForUpdate`, `openReleasePage`, `updateNotice` usage, `RELEASES_URL` fetch) and the corresponding tests that no longer apply; keep `parseVersion`/`compareVersions`/`isSafeReleaseUrl` only if still used (otherwise remove them and their tests).
- No notification spam: show the balloon once per downloaded version.

## 4. Settings UI
- In the existing Updates row (or a new **Updates** group if none): toggle **"Automatic updates"** — help "Downloads new versions from GitHub and installs them when you quit."; a status line showing the current version and the state, e.g. "Version 0.3.0 · Up to date", "Downloading 0.3.1… 42%", "0.3.1 is ready — restart to update" with a **"Restart now"** button (only in the downloaded state); and a small **"Check now"** button (disabled while checking/downloading or when the toggle is off).
- New IPC via `settings-preload.js`: `updateStatus()`, `checkForUpdates()`, `restartToUpdate()`, and an event `onUpdateStatus(callback)` pushed by main whenever the state changes. In dev (`!app.isPackaged`) the status is "Updates are only available in the installed app" and the buttons are disabled.
- Welcome screen: add one quiet line under the welcome text: "Grok Bot Helper keeps itself up to date. You can turn this off below." (i18n).
- Settings save/load includes `autoUpdate` (boolean; invalid → `invalid-option`).

## 5. i18n
- All new strings in **en and pt-BR**. Remove keys that are no longer used.

## 6. Docs
- `README.md`: in the privacy/network part, replace "no network requests by default" with an accurate statement: the only network request Grok Bot Helper makes by default is checking `github.com/cremess/grok-bot-helper` releases for updates (can be turned off in Settings → Automatic updates); OpenBot/Hermes behavior unchanged. Add a short **Updates** section: installed copies update automatically; the change takes effect after quitting or "Restart to update".
- `CONTRIBUTING.md` release steps: bump version → `npm run dist` → create a GitHub release `vX.Y.Z` and upload **all three** files from `dist/`: `Grok-Bot-Helper-Setup-X.Y.Z.exe`, `Grok-Bot-Helper-Setup-X.Y.Z.exe.blockmap`, `latest.yml` (the updater needs `latest.yml`). Plus the local test recipe with `GROK_BOT_HELPER_UPDATE_FEED`.

## Acceptance criteria
- `npm test` and `npm run check` pass.
- `node -e "require('electron-updater')"` is never executed in tests; dev `npm start` never loads electron-updater.
- No raw error messages or file paths shown to the user or written to disk by the updater.

## Do NOT
- Do not add dependencies, upload releases, set tokens, run the app or build the installer. Do not commit or push.
- Do not change behavior unrelated to updates.

## When done
Replace the whole content of `.handoff/RESULT.md` with the result of this task.
