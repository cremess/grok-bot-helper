# Task 19 — English everywhere + i18n module (prepared for a future language switch)

## Context
The repository is now public and the audience is mostly English-speaking. **Everything** must be in English: UI text, tray menu, balloons, notifications, error messages, relative times/dates, code comments, test names, docs. Strings must be centralized so a language switch can be added later (NOT in this task).

Read `AGENTS.md` first (it is already in English and is the source of truth).

## Files involved
- Create: `src/lib/i18n.js`, `test/i18n.test.js`
- Change: every file under `src/` (JS, HTML, CSS comments), `scripts/*.js` (comments/log messages), `test/*.js` (test names, comments, expected strings that change), `package.json` (`description` only), `CONTRIBUTING.md`, `.github/pull_request_template.md`, `.handoff/HISTORY.md` (translate the existing rows faithfully; keep dates)
- Do NOT touch: `README.md` (Claude Code rewrites it), `AGENTS.md`, `LICENSE`, `assets/`, `build/`, `.handoff/TASK.md`

## 1. `src/lib/i18n.js` (works in Node and in the browser, same dual export as `src/lib/accelerator.js`)
- `const STRINGS = { en: { ...all keys... } }` with **flat, namespaced keys**, e.g. `prompt.placeholder`, `prompt.to`, `prompt.send`, `prompt.sent`, `prompt.hints.send`, `prompt.waiting`, `errors.empty`, `settings.title`, `settings.rows.afterSend.title`, `tray.openPrompt`, `balloon.ready.title`, etc.
- `t(key, params = {}, locale = 'en')` → string with `{name}` placeholders replaced; unknown key → returns the key itself (so missing strings are visible) and never throws.
- `LOCALES = ['en']`, `DEFAULT_LOCALE = 'en'`.
- `test/i18n.test.js`: placeholder replacement, unknown key, every key is a non-empty string, no key value contains Portuguese-specific characters (`ã õ ç é ê á à í ó ú â ô` — case-insensitive) as a guard against leftovers.

## 2. Use `t()` everywhere user-facing
- Main process (`src/main.js`): tray tooltip/menu labels, balloons, notifications, window titles, any text sent to renderers.
- Renderers: load `../lib/i18n.js` with `<script src>` before the page script; replace all hardcoded text with `t(...)`. Static HTML text (labels, placeholders, `aria-label`, `title`) is filled from JS on load via `textContent`/`setAttribute` (use `data-i18n="key"`, `data-i18n-placeholder`, `data-i18n-title`, `data-i18n-aria-label` attributes and one small helper that applies them). HTML keeps English fallback text so it is readable without JS. `<html lang="en">`.
- `src/lib/*` pure modules that build user-facing text: `relative-time.js` → English ("just now", "3 min ago", "2 h ago", "yesterday, 6:59 PM", "Nov 21, 6:59 PM" — use `Intl.DateTimeFormat('en-US', …)`); `usage.js` `formatReset` → "today at 8:25 AM", "tomorrow at 8:25 AM", "Wed, Nov 25 at 8:25 AM". Keep function names/signatures; update their tests.
- Error codes stay as codes; only messages are translated.

## 3. Translation quality
- Natural, concise product English (think Raycast/Linear microcopy). Examples:
  - "Pergunte ou peça algo…" → "Ask or tell Grok anything…"
  - "Para <bot>" → "To <bot>"
  - "<bot> está respondendo…" → "<bot> is replying…"
  - "A mensagem não chegou ao Grok Bot." → "Your message didn't reach Grok Bot."
  - "Seu limite do Grok Bot acabou. Renova {reset}." → "You're out of Grok Bot usage. Resets {reset}."
  - "Enviar mesmo assim" → "Send anyway"; "Tentar de novo" → "Try again"; "Parar" → "Stop"
  - "Depois de enviar" → "After sending" with "Wait for reply" / "Close and notify"
  - "Iniciar com o Windows" → "Launch at startup"
  - "Bot padrão do Grok Bot" → "Grok Bot default"; "Outro bot (colar link ou ID)" → "Other bot (paste link or ID)…"
  - "mais usado" → "most used"; "Buscar bot…" → "Search bots…"
  - Welcome: "Welcome! Pick which Grok Bot bot your messages go to. Then press {shortcut} anywhere."
- Code comments in English, short. Test names in English.

## 4. Docs
- `CONTRIBUTING.md` and the PR template fully in English; replace "ask Pedro for review" with "ask the maintainer (@pedrofigueiredo25) for a review". Mention that strings live in `src/lib/i18n.js` and that new UI text must be added there.
- `package.json` `description`: "Unofficial Windows companion for Grok Bot: a global shortcut opens a floating prompt that talks to your bots."

## Acceptance criteria
- `npm test` and `npm run check` pass.
- `git grep -n -i -E "[ãõçáàâéêíóôú]"` returns **only** `README.md`, `.handoff/TASK.md` lines (README is handled separately) — i.e. no Portuguese left in code, tests, HTML, CSS or the other docs. Report the command output in RESULT.md.
- No behavior changes besides language/date formatting.

## Do NOT
- Do not implement a language switch UI. Do not add dependencies. Do not run the app.
- Do not commit or push. Do not touch the files listed as off-limits.

## When done
Replace the whole content of `.handoff/RESULT.md` with the result of this task (in English).
