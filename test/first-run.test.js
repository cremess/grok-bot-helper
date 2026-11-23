const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FALLBACK_SHORTCUTS, pickShortcut, isFirstRun } = require('../src/lib/first-run');

test('usa o preferido quando ele registra e encerra as tentativas', () => {
  const attempts = [];
  assert.deepEqual(pickShortcut('Ctrl+G', (shortcut) => {
    attempts.push(shortcut);
    return true;
  }), { shortcut: 'Ctrl+G', changed: false });
  assert.deepEqual(attempts, ['Ctrl+G']);
});

test('usa o segundo atalho quando o preferido falha', () => {
  const attempts = [];
  assert.deepEqual(pickShortcut('Alt+Space', (shortcut) => {
    attempts.push(shortcut);
    return shortcut === 'Ctrl+Shift+Space';
  }), { shortcut: 'Ctrl+Shift+Space', changed: true });
  assert.deepEqual(attempts, ['Alt+Space', 'Ctrl+Shift+Space']);
});

test('informa falha e preserva o preferido quando nenhum registra', () => {
  const attempts = [];
  assert.deepEqual(pickShortcut('Ctrl+G', (shortcut) => {
    attempts.push(shortcut);
    return false;
  }), { shortcut: 'Ctrl+G', changed: false, failed: true });
  assert.deepEqual(attempts, ['Ctrl+G', ...FALLBACK_SHORTCUTS]);
});

test('não repete o preferido que já pertence à lista de alternativas', () => {
  const attempts = [];
  pickShortcut('Alt+Shift+G', (shortcut) => {
    attempts.push(shortcut);
    return false;
  });
  assert.deepEqual(attempts, ['Alt+Shift+G', 'Alt+Space', 'Ctrl+Shift+Space', 'Ctrl+Alt+G']);
});

test('primeira execução depende da ausência do arquivo de configurações', () => {
  assert.equal(isFirstRun(false), true);
  assert.equal(isFirstRun(true), false);
});
