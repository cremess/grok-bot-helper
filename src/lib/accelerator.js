const KEY_CODES = {
  Space: 'Space', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace',
  Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End',
  PageUp: 'PageUp', PageDown: 'PageDown',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
};

function acceleratorFromKeyEvent({ code, ctrlKey, altKey, shiftKey, metaKey }) {
  const modifiers = [];
  if (ctrlKey) modifiers.push('Ctrl');
  if (altKey) modifiers.push('Alt');
  if (shiftKey) modifiers.push('Shift');
  if (metaKey) modifiers.push('Super');
  if (!modifiers.length) return null;

  let key;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) key = code;
  else if (Object.hasOwn(KEY_CODES, code)) key = KEY_CODES[code];
  if (!key) return null;
  return [...modifiers, key].join('+');
}

if (typeof module !== 'undefined' && module.exports) module.exports = { acceleratorFromKeyEvent };
else globalThis.acceleratorFromKeyEvent = acceleratorFromKeyEvent;
