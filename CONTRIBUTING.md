# Contributing

## Overview

Grok Bot Helper is a Windows tray app that opens a prompt through a global shortcut.
Messages of up to 1000 characters go to the selected bot through the `grokbot://app/v1/prompt` deep link.
The bot list and conversations are read from Grok Bot's local files without modifying them.
This internal format may change with Grok Bot updates.

## Set up the environment

You need Windows 10 or 11, Node.js 22 or later, Git, and Grok Bot installed and opened at least once.
Clone the repository using the URL supplied by the maintainer:

```powershell
git clone <repository-url>
cd grok-bot-helper
npm install
npm start
```

Use the directory created by the clone in the `cd` command. If installation does not download
`node_modules/electron/dist/electron.exe`, run `node node_modules/electron/install.js` before starting.

## Commands

- `npm start`: launch the app with Electron.
- `npm test`: run tests with Node.js's built-in runner.
- `npm run check`: check JavaScript syntax in `src/`, `scripts/`, and `test/`.
- `npm run icons`: generate PNG and ICO icons from SVGs in `assets/`.
- `npm run dist`: build the 64-bit Windows NSIS installer in `dist/`.

## Directory structure

| Path | Contents |
| --- | --- |
| `src/main.js` | Main process: windows, tray, shortcuts, and Grok Bot integration. |
| `src/lib/` | Testable logic, including pure functions and file access. |
| `src/prompt/` | Prompt and conversation UI. |
| `src/settings/` | Settings and welcome UI. |
| `src/ui/` | Visual tokens and the shared BotPicker component. |
| `assets/` | App SVGs and icons. |
| `scripts/` | Icon generation and syntax checks. |
| `test/` | Automated tests using `node:test`. |
| `.handoff/` | The maintainer's Claude Code + Codex workflow log; contributors do not need to use it. |

## Code guidelines

- Use CommonJS. Prefer placing new logic in `src/lib/`, with `node:test` tests in `test/`.
- Preserve window security: `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`. Keep the CSP free of `unsafe-inline`.
- **Never** use `innerHTML` with external content. Bot names and messages come from Grok Bot files; build elements with DOM APIs and use `textContent` for text.
- Keep deep links and `shell.openExternal` calls in the main process. Validate bot IDs before building deep links and restrict external link protocols as the current code does.
- Do not include personal data, tokens, or paths from your computer in code or tests. Use fictional data and temporary directories for file tests.
- Write UI text, comments, test names, and docs in English. Strings live in `src/lib/i18n.js`; add all new UI text there and use `t()`. Use the `data-i18n` attributes for static HTML, with English fallback text.
- Discuss new dependencies in the PR before adding them.

## Test without using Grok Bot tokens

To test the UI and simulate sending and receiving, use an Electron script that calls
`app.setPath('appData', <temporary directory>)` **before** loading `src/main.js`.
The main process derives both the Helper data directory and `Grok Bot/sand-client-persistence` from that path.

Copy only the required Grok Bot files into the temporary directory: the roster, the selected bot's
conversation, and the last bot selection if using the default bot. Prefer fictional contents,
following the formats exercised by `test/roster.test.js` and `test/transcript.test.js`.

Before loading the main process, intercept `shell.openExternal` to log the link and simulate success
without opening Grok Bot. To simulate a reply, update only the temporary conversation copy with a bot
message timestamped after sending; the app polls that file. This tests the flow without sending real
messages or changing real Grok Bot files. This local testing script is not included in the repository.

## Contribution workflow

1. Create a branch from `main` with a `feat/` or `fix/` prefix.
2. Make small commits with imperative English messages, such as "Add text validation".
3. Run `npm run check` and `npm test`, then perform the relevant manual test on Windows.
4. Open a PR against `main`, fill in the template, and attach a screenshot for UI changes.
5. Wait for CI to pass and ask the maintainer (@pedrofigueiredo25) for a review.

## Report issues

Open an issue with reproduction steps, the expected result, what happened, and the Windows and Grok Bot versions.
