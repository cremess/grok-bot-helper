# Task 22 — Replace the "Conversation / Latest reply" toggle with a clear segmented control

Read `AGENTS.md` first.

## Problem
In the prompt's reply header there is a text button that flips between "Conversation" and "Latest reply". It shows the **mode you would switch to**, not the mode you are in, so users can't tell what they're looking at (when it says "Conversation" you are actually seeing the latest reply). It also looks like plain text, not a control.

## Goal
A small **segmented control** that always shows both views, with the current one selected — the same visual language as the segmented controls in Settings (sliding selected pill).

## Files involved
- `src/prompt/prompt.html`, `src/prompt/prompt.css`, `src/prompt/prompt.js`, `src/lib/i18n.js` (en + pt-BR), `src/ui/tokens.css` only if a shared token is needed.

## Specification
1. **Placement**: same place as today (right side of the reply header), after the copy and open-in-Grok-Bot icon buttons, separated from them by 8 px. Vertically centered with the header row.
2. **Control**:
   - Two segments, each with a 14 px SVG icon + short label:
     - **Latest** (icon: a single message bubble) — shows the latest reply.
     - **Chat** (icon: two overlapping bubbles) — shows the recent conversation.
     - pt-BR labels: **Última** / **Conversa**.
   - Height 26 px, font 12 px/500, container radius 8 px with `var(--surface)` background and 1 px `var(--border)`; 2 px inner padding.
   - Selected segment: a pill (radius 6 px) with `var(--hover)`-like raised background (`color-mix(in srgb, var(--text) 10%, var(--surface))` in dark, white with `--shadow-sm` in light) and `var(--text)` color; unselected segments use `var(--secondary)` and get `var(--text)` on hover.
   - The pill **slides** between segments (animate `transform`/`width` with the standard transition; respect `prefers-reduced-motion`).
   - Accessibility: `role="radiogroup"` with `aria-label` ("Reply view" / "Visualização da resposta"); each segment is `role="radio"` with `aria-checked`, roving `tabindex` (only the selected one is tabbable), Left/Right arrow keys switch, Enter/Space select. Focus ring visible.
   - Each segment has a `title` tooltip: "Latest reply" / "Recent conversation" (pt-BR: "Última resposta" / "Conversa recente").
3. **Keyboard shortcut** in the prompt: `Ctrl+L` toggles between the two views (do not interfere when the bot picker is open). Add it to i18n and mention it in the tooltip, e.g. "Latest reply (Ctrl+L)".
4. **Behavior** stays the same as today: switching views re-renders, the Chat view scrolls to the newest message, the "Show more" logic only applies to Latest, the user-sized layout still fills the space, the choice resets to Latest each time the prompt opens (current behavior). Remove the old toggle button, its i18n keys (`prompt.conversation`, `prompt.latest` if no longer used) and dead CSS.
5. **Hide the control** when there is no conversation to show (same condition that hides the reply area today) and while waiting state shows only the sent bubble with no prior conversation.
6. Update `README.md` mentions of the old toggle: "Switch to **Conversation** …" → "Use the **Latest / Chat** switch (or `Ctrl+L`) …"; and the Usage table gets a row for `Ctrl+L`.

## Acceptance criteria
- `npm test` and `npm run check` pass (update tests that check i18n keys if needed; both locales must have the same keys).
- No `innerHTML`; CSP unchanged.

## Do NOT
- Do not change anything else in the prompt or settings. Do not add dependencies, run the app, commit or push.

## When done
Replace the whole content of `.handoff/RESULT.md` with the result of this task.
