<p align="center">
  <img src="assets/icons/icon-256.png" width="96" alt="Grok Bot Helper icon">
</p>

<h1 align="center">Grok Bot Helper</h1>

<p align="center"><b>Your Grok Bot, one shortcut away — on Windows.</b></p>

<p align="center">
  <a href="https://github.com/pedrofigueiredo25/grok-bot-helper/actions/workflows/ci.yml"><img src="https://github.com/pedrofigueiredo25/grok-bot-helper/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078D4" alt="Windows 10 | 11">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/status-community%20%C2%B7%20unofficial-8e4ec6" alt="Community, unofficial">
</p>

<p align="center">
  <a href="https://github.com/pedrofigueiredo25/grok-bot-helper/releases/latest"><b>⬇ Download for Windows</b></a>
</p>

<p align="center">
  <img src="docs/screenshots/prompt.png" width="680" alt="The floating prompt showing the latest reply from a bot">
</p>

On macOS, Grok Bot ships with a built-in quick prompt you can summon from anywhere with a shortcut. **On Windows that feature doesn't exist yet** — so we built it. Grok Bot Helper is a small tray app that brings that "press a shortcut, talk to your bot" experience to Windows, and is meant to grow into a general-purpose helper around the Grok Bot desktop app.

> **Unofficial, community project.** Not affiliated with xAI or the makers of Grok Bot. It relies on Grok Bot links and local files that are not documented and may change with Grok Bot updates. It only **reads** those files on your computer and, with Grok Bot as the assistant (the default), never sends your data anywhere. If you choose OpenBot or Hermes instead, your message goes to that assistant on your PC: OpenBot through its local API, Hermes by running `hermes.exe`, which then sends it to the model provider you configured in Hermes (see [what that involves](#talk-to-grok-bot-openbot-or-hermes)). The one optional network request the app makes itself (the update check, off by default) is described below.

## Features

- **Quick prompt from anywhere** — press `Alt+Space` (configurable) in any app, type, hit `Enter`. Your message goes straight to the bot you picked.
- **See the reply right there** — the latest reply shows up in the prompt with proper formatting (lists, bold, code). Switch to **Conversation** to see the recent back-and-forth. If the bot answers in several messages, the prompt keeps reading until it stops writing, and notifies you once.
- **Send the text you selected** (optional) — pick a shortcut in Settings, select text in any app and press it: the prompt opens with that text, ready to send. Off by default.
- **Long messages, in parts** — Grok Bot links take up to 1000 characters. For longer messages the prompt offers **Send in N parts**: it splits at paragraphs or sentences, numbers each part `(1/N)`, and sends them one at a time, waiting for each to arrive. You can cancel midway.
- **Prompt templates** — save snippets like *Summarize:* or *Translate to English:* in Settings, then press `Ctrl+T` in the prompt to put one at the start of your message.
- **Pick any of your bots** — the bot picker lists the bots from your Grok Bot app, with search. Switch with `Ctrl+K` without leaving the prompt.
- **Or talk to OpenBot or Hermes** (optional) — choose the assistant under **Settings → Assistant**: Grok Bot (the default), an OpenBot agent, or the Hermes Agent CLI on your PC. See [below](#talk-to-grok-bot-openbot-or-hermes).
- **Wait or get notified** — keep the prompt open until the reply arrives, or let it close and get a dot on the tray icon (and an optional Windows notification).
- **A real window when you want it** — drag it, resize it, pin it so it stays open; it remembers where you left it.
- **Knows when Grok Bot can't take messages** — warns you when you're out of Grok Bot usage instead of waiting forever.
- **Small touches** — copy a reply, open the conversation in Grok Bot, browse your previous prompts with `↑`/`↓`, light and dark themes, launch at startup.
- **English or Portuguese** — the app follows your Windows language (Brazilian Portuguese for any Portuguese locale, English otherwise), or pick one under **Settings → Appearance → Language**. If you're updating from an older version, it stays in English until you change it.

<table>
  <tr>
    <td><img src="docs/screenshots/conversation.png" alt="Conversation view"></td>
    <td><img src="docs/screenshots/bot-picker.png" alt="Bot picker with search"></td>
  </tr>
  <tr>
    <td align="center"><sub>Conversation view</sub></td>
    <td align="center"><sub>Pick any of your bots (<code>Ctrl+K</code>)</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/waiting.png" alt="Waiting for a reply"></td>
    <td><img src="docs/screenshots/prompt-light.png" alt="Light theme"></td>
  </tr>
  <tr>
    <td align="center"><sub>Waiting for the reply</sub></td>
    <td align="center"><sub>Light theme</sub></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/settings.png" width="420" alt="Settings window">
</p>

<sub>Screenshots use fictional bots and messages.</sub>

## How it works

1. A global shortcut opens a floating prompt (Electron, lives in the tray).
2. When you send, the app opens a Grok Bot deep link — `grokbot://app/v1/prompt?id=<bot>&text=<text>` (up to 1000 characters; a longer message goes out as numbered parts, one link each, only after you confirm). Grok Bot may ask you to confirm *"Add message for Grok?"*; it has a *"Don't show again"* option. If you enable it, any `grokbot://` link can add text without asking, so decide with that in mind.
3. To show replies and your bot list, the app **reads** Grok Bot's local cache in `%APPDATA%\Grok Bot` — nothing is written there and nothing leaves your PC.
4. **Network:** by default the app makes no network requests at all; it only works with local files and Grok Bot links. With OpenBot as the assistant, it makes requests to OpenBot's local API on `127.0.0.1` only (they don't leave your PC); with Hermes, Hermes itself contacts the provider you set up in it. If you turn on **Settings → Data → Check for updates** (off by default), it asks the public GitHub API once a day for the latest release (`api.github.com/repos/pedrofigueiredo25/grok-bot-helper/releases/latest`), reads only the version number and the release page link, and shows a notice plus an **Update available** item in the tray menu when there's a newer version. No user data, no telemetry, no sign-in: GitHub only sees your IP address and the standard Electron user agent (app name and version, Windows version), like any browser request. If it fails, nothing happens.

## Talk to Grok Bot, OpenBot or Hermes

**Settings → Assistant → Talk to** picks where your messages go. Grok Bot is the default and works exactly as described above. The other two are optional and only used when you pick them.

| | Grok Bot (default) | OpenBot | Hermes |
| --- | --- | --- | --- |
| How the message goes | `grokbot://` link | OpenBot's local API on `127.0.0.1` | Runs `hermes.exe` on your PC |
| Message length | 1000 characters, longer ones in parts | Up to 20 000 characters, in one go | Up to 20 000 characters, in one go |
| Picker (`Ctrl+K`) | Your Grok Bot bots | Your OpenBot agents with Local scripts on | Hermes |
| Conversation view | Read from Grok Bot's cache | This session's messages, kept in memory only | This session's messages, kept in memory only |
| Usage warning | Yes | No (not Grok Bot) | No (not Grok Bot) |

The reply shows in the prompt with the same formatting, the tray dot and the optional notification work the same way, and the selected-text shortcut, templates and language work with any assistant. **Settings → Assistant → Wait for a reply** sets how long the prompt waits for OpenBot or Hermes (10 minutes by default).

### OpenBot

The app talks to OpenBot through its local automation API, the same one the official OpenBot CLI uses. OpenBot only offers it while it is open and only for agents that have **Local scripts** on. The app can't turn that on for you (it's an OpenBot permission), so:

1. In OpenBot, open the agent's chat and open the side panel (agent settings).
2. Go to **Permissions** and turn on **Local scripts**.
3. Do this for each agent you want to use here. The agent list in Settings (and in the prompt) refreshes by itself every few seconds while it's open.

If the list stays empty, Settings tells you why: OpenBot is closed or no agent has Local scripts on, OpenBot is open but no agent has Local scripts yet, or OpenBot isn't answering. **Open OpenBot** brings it up. If an agent asks you something or needs an approval while working, the prompt says so and stops waiting: answer it in OpenBot.

**Privacy:** the app reads the address and access token OpenBot writes to `%APPDATA%\OpenBot\automation` on your PC. It only accepts an address on this computer (`http://127.0.0.1`, `localhost` or `::1`) and refuses anything else. The token is read from disk when needed, sent only in the authorization header of those local requests, and never saved, logged or shown. Your message goes to the agent you picked, which then works with whatever model and tools you set up in OpenBot.

### Hermes

The app runs the [Hermes Agent](https://github.com/NousResearch/hermes-agent) CLI once per message: `hermes.exe chat --query-file - --oneshot -Q`, with your message written to its standard input (never on the command line) and without a shell. By default it looks for `%LOCALAPPDATA%\hermes\bin\hermes.exe`; you can point it to another `hermes.exe` in Settings. Model and provider are optional (empty uses your Hermes defaults). **Continue the conversation** (on by default) passes `--continue grok-bot-helper --create-if-missing`, so Hermes keeps one session of its own for this app and remembers earlier messages; turn it off for independent questions. **Stop** in the prompt ends the Hermes process.

**Privacy:** Hermes runs on your PC and sends your message to the model provider you configured in Hermes; this app doesn't contact any provider itself and doesn't keep the conversation after you quit.

## Install

**Requirements:** Windows 10 or 11 (64-bit) and the [Grok Bot](https://cursor.com/download/bot) desktop app, opened at least once.

**[⬇ Download the latest installer](https://github.com/pedrofigueiredo25/grok-bot-helper/releases/latest)** — grab `Grok-Bot-Helper-Setup-<version>.exe` from the release assets.

When you run the installer:

1. It installs for your user only, in one click, no admin rights needed.
2. The installer isn't code-signed yet, so Windows SmartScreen may say *"Windows protected your PC"*. Click **More info → Run anyway**.
3. On first launch a welcome screen lists your Grok Bot bots (the most used one is preselected). Click **Save and get started**.
4. Press the shortcut it shows (default `Alt+Space`; if that's taken, the app picks a free one and tells you).

To uninstall: **Windows Settings → Apps**.

## Usage

| Action | What it does |
| --- | --- |
| Shortcut (default `Alt+Space`) | Opens / closes the prompt |
| Selected-text shortcut (off by default, set it in Settings) | Copies the text selected in the app in front and opens the prompt with it (up to 1000 characters, added after any draft) |
| `Enter` | Sends the message (to Grok Bot: over 1000 characters, click **Send in N parts** to split it, up to 10 parts; OpenBot and Hermes take up to 20 000 characters at once) |
| `Shift+Enter` | New line |
| `Esc` or click outside | Closes the prompt (unless it's pinned) |
| `Ctrl+K` | Pick another bot (or OpenBot agent) |
| `Ctrl+T` | Insert a saved template at the start of the message (add templates in Settings) |
| `↑` / `↓` in an empty prompt | Browse your previous prompts |
| `Ctrl+,` | Open settings |
| Double-click the header | Reset the prompt's size and position |

Tray icon: left-click opens the prompt; right-click shows **Open prompt**, **Settings…**, **Reset prompt position** and **Quit** (plus **Update available** when the optional update check found a newer version).

Settings are stored in `%APPDATA%\grok-bot-helper\settings.json`.

**About the selected-text shortcut:** it presses `Ctrl+C` for you in the app in front (through PowerShell and .NET `SendKeys`, both part of Windows), reads the copied text and then puts your previous clipboard back. Text, HTML, RTF and images are restored; other formats (such as copied files) can't be. The copied text is never logged or saved. If Windows clipboard history (`Win+V`) is on, the copied selection may show up there. It doesn't press `Ctrl+C` in a terminal (cmd, PowerShell, Windows Terminal), where it would stop the running program. If the clipboard held a secret marked by a password manager as private, it is cleared instead of written back, so the secret doesn't lose that mark. It needs Ctrl or Alt and can't use the Windows key or `Ctrl+C` itself; release the keys after pressing it so the copy isn't mixed with them.

## Troubleshooting

- **The shortcut does nothing** — check the tray icon is there. Another app may own the shortcut (PowerToys Run uses `Alt+Space` by default); the app shows a tray notice when it can't register it. Pick another one in Settings.
- **"Your message didn't reach Grok Bot"** — you may be out of Grok Bot usage (the prompt tells you when it resets), you cancelled Grok Bot's confirmation, or Grok Bot isn't running.
- **No bots in the list** — open Grok Bot once, then click the refresh button next to the bot picker in Settings.
- **No OpenBot agents** — open OpenBot and turn on **Local scripts** for the agent (agent settings → Permissions). See [OpenBot](#openbot).
- **Hermes not found** — install Hermes Agent or set the path to `hermes.exe` under **Settings → Assistant**.

## Build from source

```powershell
git clone https://github.com/pedrofigueiredo25/grok-bot-helper.git
cd grok-bot-helper
npm install
npm start
```

If `node_modules/electron/dist/electron.exe` is missing after `npm install`, run `node node_modules/electron/install.js`.

| Command | |
| --- | --- |
| `npm start` | Run the app |
| `npm test` | Unit tests (Node's built-in runner) |
| `npm run check` | Syntax check of every JS file |
| `npm run icons` | Regenerate icons from the SVGs |
| `npm run dist` | Build the Windows installer into `dist/` |

## Contributing

Contributions are very welcome — bug reports, ideas and pull requests. Start with the [contributing guide](CONTRIBUTING.md): it covers setup, the code rules (security of the Electron windows, i18n), how to test without spending Grok Bot usage, and the PR flow.

Fun fact: this project is built with an AI pair — Claude Code plans and reviews, Codex implements. The `.handoff/` folder and [`AGENTS.md`](AGENTS.md) show how that works. You don't need to use any of it to contribute.

## License

[MIT](LICENSE)
