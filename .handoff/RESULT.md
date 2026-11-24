# Task 22 result

Replaced the reply header toggle with a Latest / Chat radio group. The selected pill slides and resizes using the shared transition, and the shared reduced-motion rule disables the animation. The group supports Left and Right arrows and native Enter and Space activation. Ctrl+L switches views when the reply area is visible and the bot picker is closed.

The prompt opens in Latest. Chat scrolls to the newest message, and Show more remains available only for overflowing replies in Latest at the automatic window size. The reply area and its switch are hidden when the prompt is waiting for its first reply.

## Changed files

- `src/prompt/prompt.html` adds the radio group and its two icon buttons.
- `src/prompt/prompt.css` styles the control, focus ring, and sliding selection in both themes.
- `src/prompt/prompt.js` updates selection, focus, pill geometry, and shortcut handling.
- `src/lib/i18n.js` adds the group label, segment labels, and shortcut tooltips in English and Brazilian Portuguese and removes the old toggle keys.
- `README.md` describes the switch and lists Ctrl+L in the Usage table.
- `.handoff/RESULT.md` records the handoff.

## Verification

- `npm test` passed all 206 tests, including locale parity and renderer localization keys.
- `npm run check` passed for all 53 JavaScript files.
- `git diff --check` passed.
- A Node simulation with fictional data verified selected state, roving tab order and arrow focus, click and Ctrl+L behavior, picker and waiting-state guards, Chat scrolling, Show more visibility, user-sized rendering, and reset on reopen.
- Static checks confirmed the prompt CSP is identical to the previous version and that the prompt contains no `innerHTML`.

## Questions and limitations

- No implementation blockers. Visual behavior and native keyboard activation were reviewed in source. Live Electron verification was outside the task scope.
