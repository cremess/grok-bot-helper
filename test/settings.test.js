const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  DEFAULT_SETTINGS, isValidShortcut, normalizeSettings, loadSettings, saveSettings,
} = require('../src/lib/settings');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-'));

test('promptBounds validates integer bounds, copies and persists position and size', () => {
  assert.equal(normalizeSettings({}).promptBounds, null);
  for (const bounds of [
    { x: -1920, y: -50, width: 460, height: 160 },
    { x: 100, y: 200, width: 1400, height: 1200 },
  ]) {
    const file = path.join(temporaryDirectory, 'bounds.json');
    const saved = saveSettings(file, { promptBounds: bounds });
    assert.deepEqual(saved.promptBounds, bounds);
    assert.notStrictEqual(saved.promptBounds, bounds);
    assert.deepEqual(loadSettings(file).promptBounds, bounds);
  }
  const valid = { x: 0, y: 0, width: 680, height: 300 };
  for (const bounds of [null, [], {}, 'bounds',
    ...['x', 'y', 'width', 'height'].flatMap((key) =>
      [NaN, Infinity, -Infinity, 1.5, '680', undefined].map((value) => ({ ...valid, [key]: value }))),
    { ...valid, width: 459 }, { ...valid, width: 1401 },
    { ...valid, height: 159 }, { ...valid, height: 1201 },
  ]) assert.equal(normalizeSettings({ promptBounds: bounds }).promptBounds, null);
});
after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

const validSettings = { botId: 'bot_123-ABC', botName: '', shortcut: 'Ctrl+Shift+G', launchAtLogin: true, afterSend: 'wait', notifyOnReply: false, theme: 'system', promptBounds: null };

test('loading missing, empty or invalid files returns defaults', () => {
  assert.deepEqual(loadSettings(path.join(temporaryDirectory, 'missing.json')), DEFAULT_SETTINGS);
  for (const [name, contents] of [['empty', ''], ['invalid', '{']]) {
    const filePath = path.join(temporaryDirectory, `${name}.json`);
    fs.writeFileSync(filePath, contents, 'utf8');
    assert.deepEqual(loadSettings(filePath), DEFAULT_SETTINGS);
  }
  assert.deepEqual(loadSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings(temporaryDirectory), DEFAULT_SETTINGS);
});

test('saving creates directories, round-trips and leaves no temporary file', () => {
  const filePath = path.join(temporaryDirectory, 'folder', 'inner', 'settings.json');
  assert.deepEqual(saveSettings(filePath, validSettings), validSettings);
  assert.deepEqual(loadSettings(filePath), validSettings);
  assert.equal(fs.existsSync(`${filePath}.tmp`), false);
  assert.equal(fs.readFileSync(filePath, 'utf8'), JSON.stringify(validSettings, null, 2));

  const updated = { ...validSettings, botId: '' };
  assert.deepEqual(saveSettings(filePath, updated), updated);
  assert.deepEqual(loadSettings(filePath), updated);
  assert.equal(fs.existsSync(`${filePath}.tmp`), false);
});

test('invalid values default only the corresponding field', () => {
  for (const [field, value] of [['botId', 'bot with spaces'], ['shortcut', 'Space'], ['launchAtLogin', 'yes']]) {
    assert.deepEqual(normalizeSettings({ ...validSettings, [field]: value }), {
      ...validSettings, [field]: DEFAULT_SETTINGS[field],
    });
  }
});

test('saving and loading normalize values and discard unknown keys', () => {
  const filePath = path.join(temporaryDirectory, 'normalized.json');
  const raw = { ...validSettings, shortcut: 'Space', extra: 'ignored' };
  const expected = { ...validSettings, shortcut: DEFAULT_SETTINGS.shortcut };
  assert.deepEqual(saveSettings(filePath, raw), expected);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), expected);
  fs.writeFileSync(filePath, JSON.stringify(raw), 'utf8');
  assert.deepEqual(loadSettings(filePath), expected);
  assert.deepEqual(normalizeSettings({ ...validSettings, extra: true }), validSettings);
});

test('normalization requires a plain object and preserves defaults and input', () => {
  for (const raw of [undefined, null, [], 'text', 123, true, new Date(), new (class Settings {})()]) {
    assert.deepEqual(normalizeSettings(raw), DEFAULT_SETTINGS);
  }
  assert.deepEqual(normalizeSettings(Object.assign(Object.create(null), validSettings)), validSettings);
  const snapshot = { botId: '', botName: '', shortcut: 'Alt+Space', launchAtLogin: false, afterSend: 'wait', notifyOnReply: false, theme: 'system', promptBounds: null };
  const input = { ...validSettings };
  const result = normalizeSettings(input);
  result.botId = 'other';
  assert.deepEqual(input, validSettings);
  assert.deepEqual(DEFAULT_SETTINGS, snapshot);
  assert.equal(Object.isFrozen(DEFAULT_SETTINGS), true);
  assert.notStrictEqual(normalizeSettings(null), DEFAULT_SETTINGS);
});

test('afterSend accepts and persists wait and hide and defaults to wait for invalid or absent values', () => {
  assert.equal(DEFAULT_SETTINGS.afterSend, 'wait');
  for (const afterSend of ['wait', 'hide']) {
    const expected = { ...validSettings, afterSend };
    const file = path.join(temporaryDirectory, `after-${afterSend}.json`);
    assert.deepEqual(normalizeSettings(expected), expected);
    assert.deepEqual(saveSettings(file, expected), expected);
    assert.deepEqual(loadSettings(file), expected);
  }
  for (const afterSend of [undefined, null, '', 'WAIT', 'other', 1, true, {}, []]) {
    assert.deepEqual(normalizeSettings({ ...validSettings, afterSend }), validSettings);
  }
  const { afterSend, ...legacy } = validSettings;
  assert.deepEqual(normalizeSettings(legacy), validSettings);
});

test('botName defaults to empty, trims and accepts up to 80 characters', () => {
  assert.equal(DEFAULT_SETTINGS.botName, '');
  assert.equal(normalizeSettings({ botId: 'bot' }).botName, '');
  assert.equal(normalizeSettings({ botId: 'bot', botName: '  Grok  ' }).botName, 'Grok');
  assert.equal(normalizeSettings({ botId: 'bot', botName: ` ${'a'.repeat(80)} ` }).botName, 'a'.repeat(80));
  for (const botName of ['a'.repeat(81), null, 123, {}, []]) {
    assert.equal(normalizeSettings({ botId: 'bot', botName }).botName, '');
  }
});

test('botName is cleared when the final botId is empty and persists with a valid ID', () => {
  for (const botId of ['', undefined, 'invalid with spaces']) {
    assert.equal(normalizeSettings({ botId, botName: 'Grok' }).botName, '');
  }
  const filePath = path.join(temporaryDirectory, 'name.json');
  const named = { ...validSettings, botName: 'Grok' };
  assert.deepEqual(saveSettings(filePath, named), named);
  assert.deepEqual(loadSettings(filePath), named);
  assert.equal(saveSettings(filePath, { ...named, botId: '' }).botName, '');
  fs.writeFileSync(filePath, `\uFEFF${JSON.stringify(named)}`, 'utf8');
  assert.deepEqual(loadSettings(filePath), named);
});

test('accepts all valid shortcut examples', () => {
  for (const shortcut of ['Alt+Space', 'Ctrl+Shift+G', 'CommandOrControl+Alt+K', 'Super+Shift+F12']) {
    assert.equal(isValidShortcut(shortcut), true, shortcut);
  }
});

test('rejects all invalid shortcut examples', () => {
  for (const shortcut of ['Space', 'Alt', 'Alt+Shift', 'Alt+Alt+K', 'Alt+Space+K', 'Alt + K', '', '123', 'Alt+\u00c7']) {
    assert.equal(isValidShortcut(shortcut), false, shortcut);
  }
});

test('accepts the specified modifiers, keys and symbols', () => {
  for (const modifier of ['Alt', 'Shift', 'Control', 'Ctrl', 'CommandOrControl', 'CmdOrCtrl', 'Super']) {
    assert.equal(isValidShortcut(`${modifier}+K`), true);
  }
  const keys = [
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    ...Array.from({ length: 24 }, (_, index) => `F${index + 1}`),
    'Space', 'Tab', 'Enter', 'Backspace', 'Delete', 'Insert', 'Home', 'End',
    'PageUp', 'PageDown', 'Up', 'Down', 'Left', 'Right',
    '`', '-', '=', '[', ']', '\\', ';', "'", ',', '.', '/',
  ];
  for (const key of keys) assert.equal(isValidShortcut(`Alt+${key}`), true, key);
});

test('rejects malformed types, keys, separators and modifiers', () => {
  for (const shortcut of [null, undefined, 123, {}, 'Alt+k', 'Alt+F0', 'Alt+F25', 'Alt+F01',
    'Alt+', '+K', 'Alt++K', 'Meta+K', 'K+Alt', 'Alt+K\n', 'Alt+\tK']) {
    assert.equal(isValidShortcut(shortcut), false, String(shortcut));
  }
});


test('notification and theme retain defaults for old files and invalid values', () => {
  const { notifyOnReply, theme, ...legacy } = validSettings;
  assert.deepEqual(normalizeSettings(legacy), validSettings);
  for (const value of [undefined, null, 'true', 1, {}, []]) {
    assert.equal(normalizeSettings({ notifyOnReply: value }).notifyOnReply, false);
  }
  for (const value of [undefined, null, '', 'DARK', 'auto', true, {}, []]) {
    assert.equal(normalizeSettings({ theme: value }).theme, 'system');
  }
});

test('notification and every valid theme are persisted', () => {
  for (const theme of ['system', 'dark', 'light']) {
    for (const notifyOnReply of [true, false]) {
      const expected = { ...validSettings, theme, notifyOnReply };
      const file = path.join(temporaryDirectory, 'options.json');
      assert.deepEqual(saveSettings(file, expected), expected);
      assert.deepEqual(loadSettings(file), expected);
    }
  }
});
