# AGENTS.md

## Project
GrokBot Assistant is an unofficial, community-made Windows companion for the Grok Bot desktop app. A global shortcut (default `Alt+Space`) opens a floating prompt; on send, the text goes to the chosen Grok Bot bot through the deep link `grokbot://app/v1/prompt?id=<bot>&text=<text>` (max 1000 characters). It can show the bot's latest reply by reading Grok Bot's local files (read-only). Target bot, shortcut, after-send behavior, theme and start-with-Windows are configurable. The app lives in the system tray.
Stack: Electron + JavaScript (CommonJS), no UI framework. Tests use Node's built-in runner (`node --test`) and cover the pure logic in `src/lib/`; windows and the global shortcut are verified manually or with Electron capture scripts.

- Run: `npm start`
- Test: `npm test` and `npm run check`

## Roles
- **Claude Code (orchestrator):** plans, splits the work into small tasks, writes the tasks, runs Codex, reviews diffs, runs tests and decides whether a task is accepted.
- **Codex (executor):** implements exactly the task it receives, without widening the scope, and records what it did.

## Handoff protocol (`.handoff/` folder)
- `.handoff/TASK.md`: written by Claude Code. Contains: goal, files involved, acceptance criteria and what NOT to do.
- `.handoff/RESULT.md`: written by Codex at the end of each task. Contains: changed files, summary of changes, tests run and their results, questions or blockers.
- `.handoff/HISTORY.md`: Claude Code appends one row per round (date, task, accepted/returned, reason).

## Rules for everyone
- Do not change files outside the task scope.
- Do not delete files without the maintainer's explicit permission.
- No commit, push or release without the maintainer's permission. The maintainer authorized Claude Code to commit and push each accepted task; Codex never commits or pushes.
- Do not add new dependencies without recording the reason in RESULT.md.
- Never store passwords, tokens, keys or personal data (names, e-mails, local paths, real bot IDs, real conversations) in project files. Tests and screenshots use fictional data.
- When in doubt, stop and record the question in RESULT.md instead of guessing.
- Write code, comments, UI text, docs, tasks and results in English. User-facing strings go through the i18n module.
