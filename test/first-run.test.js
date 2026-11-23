const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FALLBACK_SHORTCUTS, pickShortcut, isFirstRun } = require('../src/lib/first-run');

test('uses the preferred shortcut when registration succeeds and stops trying', () => {
  const attempts = [];
  assert.deepEqual(pickShortcut('Ctrl+G', (shortcut) => {
    attempts.push(shortcut);
    return true;
  }), { shortcut: 'Ctrl+G', changed: false });
  assert.deepEqual(attempts, ['Ctrl+G']);
});

test('uses the second shortcut when the preferred one fails', () => {
  const attempts = [];
  assert.deepEqual(pickShortcut('Alt+Space', (shortcut) => {
    attempts.push(shortcut);
    return shortcut === 'Ctrl+Shift+Space';
  }), { shortcut: 'Ctrl+Shift+Space', changed: true });
  assert.deepEqual(attempts, ['Alt+Space', 'Ctrl+Shift+Space']);
});

test('reports failure and preserves the preferred shortcut when none register', () => {
  const attempts = [];
  assert.deepEqual(pickShortcut('Ctrl+G', (shortcut) => {
    attempts.push(shortcut);
    return false;
  }), { shortcut: 'Ctrl+G', changed: false, failed: true });
  assert.deepEqual(attempts, ['Ctrl+G', ...FALLBACK_SHORTCUTS]);
});

test('does not retry the preferred shortcut when it is already an alternative', () => {
  const attempts = [];
  pickShortcut('Alt+Shift+G', (shortcut) => {
    attempts.push(shortcut);
    return false;
  });
  assert.deepEqual(attempts, ['Alt+Shift+G', 'Alt+Space', 'Ctrl+Shift+Space', 'Ctrl+Alt+G']);
});

test('first run depends on the settings file being absent', () => {
  assert.equal(isFirstRun(false), true);
  assert.equal(isFirstRun(true), false);
});
