# Task 20 — Rebrand to "Grok Bot Helper" + premium UI polish

Read `AGENTS.md` first. Two parts; both are required.

## Part A — Rebrand to "Grok Bot Helper"
The product is no longer "an assistant to send prompts"; it is a **general-purpose Windows helper for Grok Bot** (quick prompt today, more helpers later). Tagline: **"Your Grok Bot, one shortcut away."**

1. Names everywhere (code, i18n strings, window titles, tray tooltip, balloons, notifications, `CONTRIBUTING.md`, PR template, comments): "GrokBot Assistant" / "grokbot-assistant" → **"Grok Bot Helper"** / **"grok-bot-helper"**. Do not touch `README.md`, `AGENTS.md`, `.handoff/HISTORY.md` (historical rows stay as they are).
2. `package.json`: `"name": "grok-bot-helper"`, `"productName": "Grok Bot Helper"`, `"author": "Grok Bot Helper contributors"`, `"license": "MIT"`, `"repository": { "type": "git", "url": "https://github.com/pedrofigueiredo25/grok-bot-helper.git" }`; `build.appId` → `"app.grokbothelper.desktop"`, `build.productName` → `"Grok Bot Helper"`, `nsis.shortcutName` → `"Grok Bot Helper"`, `nsis.artifactName` → `"Grok-Bot-Helper-Setup-${version}.exe"`. Keep the description already set. Run nothing that modifies `package-lock.json` except editing its top-level `"name"` fields to match (both `name` and `packages[""].name`).
3. `app.setAppUserModelId` → `'app.grokbothelper.desktop'`.
4. **Data folder + migration**: userData becomes `path.join(app.getPath('appData'), 'grok-bot-helper')`. Create `src/lib/migrate.js` (pure, `node:fs`/`node:path`): `migrateUserData(oldDir, newDir)` copies `settings.json` and `history.json` from `oldDir` to `newDir` **only if** `newDir/settings.json` does not exist and the old file exists; creates `newDir`; never throws; returns `{ migrated: string[] }`. Call it in `main.js` before loading settings, with `oldDir = appData/grokbot-assistant`. Tests in `test/migrate.test.js` (temp dirs): migrates both, skips when new exists, no old folder, partial (only settings).
5. i18n: add `app.name` = "Grok Bot Helper" and `app.tagline` = "Your Grok Bot, one shortcut away."; use them in the settings header (title "Settings", subtitle = tagline) and the welcome card title ("Welcome to Grok Bot Helper").

## Part B — Premium UI polish (prompt, settings, bot picker)
Goal: it should feel like Raycast / Linear / Arc. Concrete, verifiable items:

1. **One icon-button component.** Every icon-only button (pin, close, settings gear, copy, open-in-Grok-Bot, refresh, restore-default) uses a single `.icon-button` class from `src/ui/tokens.css`: `30×30`, `display: inline-grid; place-items: center; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--secondary)`; hover `background: var(--hover); color: var(--text)`; active `transform: scale(.94)`; focus-visible ring. Its SVG is `16×16`, `display: block`, `stroke-width: 1.75`, `stroke-linecap/linejoin: round`. **The close button must be an SVG "×" (two lines), not a text glyph** — today it is visibly off-center. All icons drawn on the same 16×16 grid so they look the same weight and are perfectly centered.
2. **Prompt**
   - Header: icon buttons in a tight group with 2 px gap; vertically centered with the bot picker; header height 44 px; the drag grip stays centered and subtle.
   - Card surface: 1 px hairline top highlight (`inset 0 1px 0 rgba(255,255,255,.04)` in dark), sections separated by a 1 px `var(--border)` hairline between the reply area and the composer.
   - **Composer**: the send control becomes a round **primary button** (32 px, accent gradient `#1080f3 → #5b3df5`, white up-arrow SVG) at the right of the textarea, disabled (40% opacity, no gradient) when the text is empty; keyboard hints become a single quiet line under the composer, 12 px, `kbd` chips 18 px tall with subtle border.
   - Reply header: bot avatar 18 px + name (600) + time (secondary) on the left; actions on the right as `.icon-button`s, then the "Conversation" toggle as a small text button.
   - **Empty state** (no conversation yet / Grok Bot not found): a centered, quiet block with a small icon and "No replies yet — say hi to {bot}." (or "Couldn't find Grok Bot on this PC.") instead of nothing.
   - Typing indicator: three dots with a soft wave animation (respect `prefers-reduced-motion`).
   - Markdown: comfortable line-height (1.55), paragraph spacing 8 px, code blocks with 10 px padding and 8 px radius, inline code with subtle background.
3. **Bot picker**
   - Trigger: 34 px (normal) / 28 px (compact), chevron 14 px, smooth hover; open state with accent ring.
   - Popover: items 34 px, 8 px radius, hover `var(--hover)`, active (keyboard) item with accent-tinted background; check icon as SVG; search field with a magnifier SVG inside; section label 11 px uppercase.
4. **Settings**
   - Header with app icon 36 px, "Settings" + tagline.
   - Rows: icon tiles 30 px with 16 px SVGs (same icon set), titles 14 px/600, descriptions 12.5 px secondary; controls aligned to the right on a consistent column.
   - **Switches**: 36×20, knob animates with the standard transition; on = accent.
   - **Segmented controls**: a sliding selected indicator (absolutely positioned pill that animates `transform`/`width` to the checked option); text never wraps.
   - Footer: primary "Save" with gradient and subtle shadow; secondary "Close" ghost button; both 34 px.
5. **Tokens**: add `--font-display: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif` for titles; `--shadow-sm`, `--shadow-popover`; keep dark and light themes visually equivalent (check contrast of secondary text ≥ 4.5:1 on the card background in both themes).
6. Keep everything accessible (ARIA, focus rings, keyboard) and keep the CSP / no-`innerHTML` rules.

## Acceptance criteria
- `npm test` and `npm run check` pass.
- `git grep -n -i "grokbot assistant\|grokbot-assistant"` only matches `README.md`, `AGENTS.md`, `.handoff/HISTORY.md`, and the migration code/tests (`oldDir` name). Report the output in RESULT.md.
- No behavior changes other than the rebrand, migration and visuals.

## Do NOT
- Do not touch `README.md`, `AGENTS.md`, `LICENSE`, `assets/`, `build/`, `scripts/build-icons.js`.
- Do not add dependencies, run the app, build the installer, commit or push.

## When done
Replace the whole content of `.handoff/RESULT.md` with the result of this task.
