# Task 23 (part 2) — Trust a confirmed auto-send and tolerate Grok Bot's disk lag

Part 1 (auto-send helper, `autoSend` setting, "default bot" label) is **accepted**. Keep it as is.

## New evidence (Claude Code, from the maintainer's real test)
Grok Bot writes the conversation to disk **lazily**: a message sent at 09:17:17 only appeared in the transcript file at 09:18:09 (~52 s later). Our "did it reach Grok Bot?" check gives up after **45 s**, so it reported "didn't reach" for a message that did arrive. Replies are also visible on disk only after that lag.

## Changes (`src/main.js`, `src/prompt/prompt.js|css`, `src/lib/i18n.js` en + pt-BR, tests if logic moves to `src/lib/`)
1. **Auto-send success = delivered.** When the auto-send helper returns `sent` (exit 0), treat the message as delivered right away: do **not** run the "message reached Grok Bot" timeout for it. The prompt shows the sent bubble with a small **"Sent ✓"** marker (pt-BR "Enviada ✓") and the status line becomes **"Sent. Waiting for {bot}'s reply…"** (pt-BR "Enviada. Aguardando a resposta de {bot}…"); after 20 s without a reply, add a quiet hint: **"Replies can take up to a minute to show up here."** (pt-BR "A resposta pode levar até um minuto para aparecer aqui."). Then wait for the reply as today (up to 10 min, "Stop" still available).
2. **Manual / not auto-sent path** (autoSend off, or helper returned `not-sent`): raise the "didn't reach Grok Bot" window from 45 s to **120 s**, and while waiting show **"Waiting for Grok Bot to receive your message… If it's in Grok Bot's text box, press Ctrl+Enter there."** (pt-BR equivalent). Only after 120 s with no user message on disk show the "didn't reach" state.
3. **Multi-part sends**: same rule per part — a part confirmed by the helper counts as delivered; the next part waits only for the previous part's helper success (not for the disk), with a 1.5 s gap between parts so Grok Bot processes them in order.
4. Keep "a single wait timer at a time" and all existing safety checks. Do not change the helper script.
5. Add tests for any pure logic you extract (e.g. a function that decides the waiting state from `{ autoSent, elapsedMs, userMessageSeen, replySeen }`).

## Acceptance criteria
- `npm test` and `npm run check` pass.
- No false "didn't reach" for an auto-sent message, however long Grok Bot takes to write to disk (until the 10-min reply timeout).

## Do NOT
- Do not add dependencies, run the app, build, commit or push.

## When done
Replace the whole content of `.handoff/RESULT.md` with the result of this part.
