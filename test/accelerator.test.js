const test = require('node:test');
const assert = require('node:assert/strict');
const { acceleratorFromKeyEvent } = require('../src/lib/accelerator');
const { isValidShortcut } = require('../src/lib/settings');

const cases = [
  [{ code: 'Space', altKey: true }, 'Alt+Space'],
  [{ code: 'KeyG', ctrlKey: true, shiftKey: true }, 'Ctrl+Shift+G'],
  [{ code: 'F12', metaKey: true, shiftKey: true }, 'Shift+Super+F12'],
  [{ code: 'ArrowUp', ctrlKey: true, altKey: true }, 'Ctrl+Alt+Up'],
  [{ code: 'Slash', ctrlKey: true }, 'Ctrl+/'],
  [{ code: 'KeyA' }, null],
  [{ code: 'ControlLeft', ctrlKey: true }, null],
  [{ code: 'Unknown', ctrlKey: true }, null],
];

for (const [event, expected] of cases) {
  test(`converts ${JSON.stringify(event)} to ${expected}`, () => {
    const actual = acceleratorFromKeyEvent(event);
    assert.equal(actual, expected);
    if (actual !== null) assert.equal(isValidShortcut(actual), true);
  });
}

test('all supported key codes and combinations produce valid shortcuts', () => {
  const codes = [
    ...Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`),
    ...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
    ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
    'Space', 'Tab', 'Enter', 'Backspace', 'Delete', 'Insert', 'Home', 'End',
    'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash',
    'Semicolon', 'Quote', 'Comma', 'Period', 'Slash',
  ];
  for (const code of codes) {
    for (let mask = 1; mask < 16; mask++) {
      const result = acceleratorFromKeyEvent({
        code, ctrlKey: Boolean(mask & 1), altKey: Boolean(mask & 2),
        shiftKey: Boolean(mask & 4), metaKey: Boolean(mask & 8),
      });
      assert.notEqual(result, null, code);
      assert.equal(isValidShortcut(result), true, result);
    }
  }
});
