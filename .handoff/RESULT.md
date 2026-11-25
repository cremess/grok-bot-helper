# Task 24 — UI Automation auto-send and Ctrl+Space default

## Changed files

- `src/main.js` polls Grok Bot windows and verifies the normalized draft twice before invoking an enabled Send button in the same window. The fixed PowerShell command receives the expected draft through stdin and requires neither focus nor keystrokes. It invokes once, waits up to three seconds for the composer to clear, and keeps the existing exit codes and prompt-window behavior. The composer search lasts 8 or 25 seconds based on the link confirmation setting. Draft conflict detection tracks each composer across consecutive polls. The process watchdog allows time for startup and post-send confirmation.
- `src/main.js` also shares a session-wide warning history between prompt and selection shortcuts so that each accelerator gets at most one registration-failure balloon.
- `src/lib/settings.js` and `src/lib/first-run.js` set the new default and fallback order. Existing saved shortcuts are preserved.
- `src/lib/i18n.js` and `src/settings/settings.html` describe Send-button automation in Settings. The English and Brazilian Portuguese auto-send failure messages direct users to send the draft in Grok Bot.
- `README.md` documents the new default and the current sending behavior.
- `test/first-run.test.js` and `test/settings.test.js` cover the new default and fallback behavior, including preservation of a saved Alt+Space shortcut.
- `.handoff/RESULT.md` records this round.

## Verification

- `npm test` passed all 211 tests.
- `npm run check` passed syntax checks for 55 files.
- Windows PowerShell parsed the embedded helper. Isolated checks covered empty stdin and post-invoke confirmation. Simulated UI Automation controls covered the voice-to-send transition, a voice-only button, a draft change during the final read, a composer that did not clear, a sustained mismatch, a missing window, and a missing composer.
- `git diff --check` passed.
- Live Grok Bot behavior was not verified. The app was not run or built, as directed by the task.

## Questions or blockers

None.
