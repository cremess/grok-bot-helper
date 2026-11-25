# Task 24 — Send by invoking Grok Bot's send button (no focus, no keystrokes) + Ctrl+Space default

Read `AGENTS.md` first.

## Diagnosis (Claude Code, read-only inspection of the real Grok Bot with UI Automation)
- Auto-send v1 (focus + `Ctrl+Enter`) **fails in real use**: Grok Bot is already running, the deep link is delivered to the existing window, and Windows' foreground lock keeps it in the background (it only flashes). The helper requires the foreground window + focused element, so it never sends.
- Grok Bot's composer **is accessible without focus**:
  - Composer: `ControlType.Edit`, name `"Prompt"`, `ClassName` contains **`sand-prompt-field`** (ProseMirror). `TextPattern`/`ValuePattern` available. An empty composer reads as `"\n"`.
  - Send button: `ControlType.Button` whose `ClassName` contains **`sand-prompt-send`**, with **`InvokePattern`**. It's the same round button for every state: when the composer is empty its name is a voice action (`"Iniciar um chat de voz"` / `"Iniciar entrada de voz"` in pt-BR; English equivalents like `"Start a voice chat"` / `"Start voice input"`); when there is text it becomes the send action (Grok Bot's catalog labels: `"Enviar mensagem"`, `"Enviar"`, `"Send message"`, `"Send"`).
- Class names are language-independent; button names are localized.

## Part A — Auto-send v2 (replace the v1 helper script in `src/main.js`; keep the stdin/no-command-line rule and all existing result codes and flows)
New fixed PowerShell script (constant string; expected text via stdin; seconds via `$args[0]`), **no foreground or focus requirement, no SendKeys**:
1. Every 200 ms until timeout: enumerate top-level windows (`AutomationElement.RootElement` children) whose `ProcessId` belongs to a process named exactly `Grok Bot`.
2. In each such window find descendants with `ClassName` containing `sand-prompt-field` (Edit) — use a `PropertyCondition` on `ControlType.Edit` and filter by class, not a full-tree text dump. Read text via `TextPattern.DocumentRange.GetText(-1)` (fallback `ValuePattern`), normalize like today.
3. If a composer's text **equals** the expected text: in the **same window**, find the Button whose `ClassName` contains `sand-prompt-send`, require `IsEnabled`, and require its name to be a send label (case-insensitive match of `^(enviar|send)( message| mensagem)?$`). If the name is still a voice label, keep polling (Grok Bot updates the button right after the draft appears). Re-read the composer once more (must still match), then `InvokePattern.Invoke()`.
4. After invoking, poll up to 3 s for the composer to become empty (normalized `''`); if it does → exit `sent` (0). If it doesn't → exit `timeout` (6) (do not invoke twice).
5. Mismatch rule: if a composer **in the window that changed most recently** (simplest: any composer) has a **different non-empty** text continuously for **3 s** (was 1.5 s; Grok Bot may still be switching chats) and no composer matches → exit `mismatch` (3).
6. On timeout: exit `notForeground` (5) if no Grok Bot window was found, `noComposer` (4) if no composer was found, `timeout` (6) otherwise. (Keep the names; "notForeground" now means "no Grok Bot window".)
- Timeout: 8 s when the link confirmation is dismissed, 25 s otherwise (as today).
- Keep the existing safety notes; update comments to describe v2. The prompt window bring-to-front after success stays as is.
- Keep the user-facing messages; adjust the `not-sent` copy to: "Your message is in Grok Bot's text box but couldn't be sent automatically. Send it in Grok Bot." (pt-BR equivalent) — no keyboard instruction.

## Part B — Shortcut defaults (`src/lib/settings.js`, `src/lib/first-run.js`, tests, i18n, README)
- `DEFAULT_SETTINGS.shortcut` → **`'Ctrl+Space'`**.
- `FALLBACK_SHORTCUTS` → `['Ctrl+Space', 'Ctrl+Shift+Space', 'Alt+Shift+G', 'Ctrl+Alt+G']` (**no `Alt+Space`**).
- The tray balloon "Couldn't register {shortcut}" is shown **at most once per accelerator per app session**.
- Existing users keep whatever shortcut they saved (only the default/fallbacks change).
- README/CONTRIBUTING/i18n: every mention of the default `Alt+Space` → `Ctrl+Space`.

## Acceptance criteria
- `npm test` and `npm run check` pass (update tests that assert the old default/fallbacks).
- The helper never sends keystrokes and never needs focus; the user's text never appears in a command line, script, log or error.

## Do NOT
- Do not add dependencies, run the app, build, commit or push. Do not write to Grok Bot's files.

## When done
Replace the whole content of `.handoff/RESULT.md` with the result of this task.
