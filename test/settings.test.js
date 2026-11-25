const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  DEFAULT_SETTINGS, isValidShortcut, normalizeSettings, loadSettings, saveSettings,
  canonicalShortcut, sameShortcut, selectionShortcutError,
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

const validSettings = { botId: 'bot_123-ABC', botName: '', shortcut: 'Ctrl+Shift+G', selectionShortcut: '', launchAtLogin: true, autoSend: true, afterSend: 'wait', notifyOnReply: false, theme: 'system', language: 'system', promptBounds: null, templates: [], autoUpdate: true, lastUpdateCheckMs: 0, assistant: 'grokbot', openbotAgentId: '', openbotAgentName: '', hermesPath: '', hermesModel: '', hermesProvider: '', hermesContinue: true, replyTimeoutMinutes: 10 };

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
  const snapshot = { botId: '', botName: '', shortcut: 'Ctrl+Space', selectionShortcut: '', launchAtLogin: false, autoSend: true, afterSend: 'wait', notifyOnReply: false, theme: 'system', language: 'system', promptBounds: null, templates: [], autoUpdate: true, lastUpdateCheckMs: 0, assistant: 'grokbot', openbotAgentId: '', openbotAgentName: '', hermesPath: '', hermesModel: '', hermesProvider: '', hermesContinue: true, replyTimeoutMinutes: 10 };
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

test('automatic sending defaults on and persists an opt-out', () => {
  for (const autoSend of [undefined, null, 'false', 0]) assert.equal(normalizeSettings({ autoSend }).autoSend, true);
  const file = path.join(temporaryDirectory, 'auto-send.json');
  saveSettings(file, { autoSend: false });
  assert.equal(loadSettings(file).autoSend, false);
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

test('canonicalShortcut treats Windows spellings of Ctrl and modifier order as the same shortcut', () => {
  assert.equal(canonicalShortcut('Shift+Control+K'), 'Ctrl+Shift+K');
  assert.equal(canonicalShortcut('CommandOrControl+Alt+K'), 'Ctrl+Alt+K');
  assert.equal(canonicalShortcut('Super+Alt+F1'), 'Alt+Super+F1');
  assert.equal(canonicalShortcut('Alt+k'), null);
  assert.equal(canonicalShortcut(''), null);
  assert.equal(sameShortcut('Ctrl+Shift+G', 'Shift+CmdOrCtrl+G'), true);
  assert.equal(sameShortcut('Ctrl+Shift+G', 'Ctrl+Alt+G'), false);
  assert.equal(sameShortcut('', ''), false);
  assert.equal(sameShortcut('bad', 'bad'), false);
});

test('the selection shortcut is off by default and accepts Ctrl or Alt combinations', () => {
  assert.equal(DEFAULT_SETTINGS.selectionShortcut, '');
  assert.equal(normalizeSettings({}).selectionShortcut, '');
  for (const value of ['', 'Ctrl+Shift+S', 'Alt+Q', 'Control+Alt+Space', 'CmdOrCtrl+F2', 'Alt+Shift+1']) {
    assert.equal(selectionShortcutError(value, 'Alt+Space'), null, value);
  }
});

test('the selection shortcut rejects copy keys, Super, missing Ctrl or Alt and bad values', () => {
  for (const value of ['Ctrl+C', 'Control+C', 'CommandOrControl+C', 'Ctrl+Insert', 'Super+Shift+S',
    'Ctrl+Super+S', 'Shift+S', 'Shift+F1', 'S', 'Ctrl+s', 'Ctrl + S', null, undefined, 42, {}]) {
    assert.equal(selectionShortcutError(value, 'Alt+Space'), 'invalid', String(value));
  }
  // Ctrl+Shift+C is not a copy shortcut, so it stays allowed.
  assert.equal(selectionShortcutError('Ctrl+Shift+C', 'Alt+Space'), null);
});

test('the selection shortcut cannot collide with the prompt shortcut, in any spelling', () => {
  assert.equal(selectionShortcutError('Alt+Space', 'Alt+Space'), 'conflict');
  assert.equal(selectionShortcutError('Shift+Control+G', 'Ctrl+Shift+G'), 'conflict');
  assert.equal(selectionShortcutError('CmdOrCtrl+Shift+G', 'Ctrl+Shift+G'), 'conflict');
  assert.equal(selectionShortcutError('Ctrl+Alt+G', 'Ctrl+Shift+G'), null);
});

test('normalizeSettings keeps a valid selection shortcut and drops invalid or colliding ones', () => {
  const file = path.join(temporaryDirectory, 'selection.json');
  const saved = saveSettings(file, { ...validSettings, selectionShortcut: 'Ctrl+Alt+S' });
  assert.equal(saved.selectionShortcut, 'Ctrl+Alt+S');
  assert.equal(loadSettings(file).selectionShortcut, 'Ctrl+Alt+S');
  for (const selectionShortcut of ['Ctrl+C', 'Ctrl+Shift+G', 'Shift+Ctrl+G', 'Super+S', 'Shift+S', 7, null, []]) {
    assert.equal(normalizeSettings({ ...validSettings, selectionShortcut }).selectionShortcut, '', String(selectionShortcut));
  }
  // The comparison uses the final prompt shortcut, including the default when the saved one is invalid.
  assert.equal(normalizeSettings({ shortcut: 'Space', selectionShortcut: 'Ctrl+Space' }).selectionShortcut, '');
  assert.equal(normalizeSettings({ shortcut: 'Alt+Space' }).shortcut, 'Alt+Space');
  assert.equal(normalizeSettings({ shortcut: 'Ctrl+Shift+G', selectionShortcut: 'Alt+Space' }).selectionShortcut, 'Alt+Space');
});

test('templates default to an empty list and are persisted after validation', () => {
  assert.deepEqual(DEFAULT_SETTINGS.templates, []);
  assert.equal(Object.isFrozen(DEFAULT_SETTINGS.templates), true);
  // Each normalized copy gets its own list, so changing one can't change the defaults.
  const first = normalizeSettings(null);
  first.templates.push({ name: 'x', text: 'y' });
  assert.deepEqual(normalizeSettings(null).templates, []);
  const file = path.join(temporaryDirectory, 'templates.json');
  const templates = [{ name: 'Summarize', text: 'Summarize:' }, { name: 'Translate', text: 'Translate to English:' }];
  assert.deepEqual(saveSettings(file, { ...validSettings, templates }).templates, templates);
  assert.deepEqual(loadSettings(file).templates, templates);
  const { templates: omitted, ...legacy } = validSettings;
  assert.deepEqual(normalizeSettings(legacy).templates, []);
  for (const value of [null, 'text', {}, 3]) assert.deepEqual(normalizeSettings({ templates: value }).templates, []);
  assert.deepEqual(normalizeSettings({ templates: [{ name: ' A ', text: ' B ' }, { name: '', text: 'x' }] }).templates,
    [{ name: 'A', text: 'B' }]);
});

test('a fresh install follows the system language and accepts only system, en and pt-BR', () => {
  assert.equal(DEFAULT_SETTINGS.language, 'system');
  assert.equal(loadSettings(path.join(temporaryDirectory, 'no-such-settings.json')).language, 'system');
  for (const language of ['system', 'en', 'pt-BR']) {
    const file = path.join(temporaryDirectory, 'language.json');
    assert.equal(saveSettings(file, { ...validSettings, language }).language, language);
    assert.equal(loadSettings(file).language, language);
  }
  for (const language of [undefined, null, '', 'pt', 'pt-PT', 'PT-BR', 'fr', 1, {}]) {
    // Settings saved before the option existed (or with a bad value) keep the English interface.
    assert.equal(normalizeSettings({ ...validSettings, language }).language, 'en', String(language));
  }
  const { language, ...olderFile } = validSettings;
  assert.equal(normalizeSettings(olderFile).language, 'en');
});

test('automatic updates default to on and an explicit opt-out persists', () => {
  assert.equal(DEFAULT_SETTINGS.autoUpdate, true);
  assert.equal(DEFAULT_SETTINGS.lastUpdateCheckMs, 0);
  const file = path.join(temporaryDirectory, 'updates.json');
  const saved = saveSettings(file, { ...validSettings, autoUpdate: false, lastUpdateCheckMs: 1700000000000 });
  assert.equal(saved.autoUpdate, false);
  const loaded = loadSettings(file);
  assert.equal(loaded.autoUpdate, false);
  assert.equal(loaded.lastUpdateCheckMs, 1700000000000);
  for (const value of ['true', 1, null, {}]) assert.equal(normalizeSettings({ autoUpdate: value }).autoUpdate, true);
  for (const value of [-1, NaN, Infinity, '5', null]) {
    assert.equal(normalizeSettings({ lastUpdateCheckMs: value }).lastUpdateCheckMs, 0, String(value));
  }
});

test('legacy update preferences are ignored during migration', () => {
  const file = path.join(temporaryDirectory, 'legacy-updates.json');
  for (const checkForUpdates of [false, true]) {
    fs.writeFileSync(file, JSON.stringify({ checkForUpdates }));
    const settings = loadSettings(file);
    assert.equal(settings.autoUpdate, true);
    assert.equal(Object.hasOwn(settings, 'checkForUpdates'), false);
  }
  assert.equal(normalizeSettings({ checkForUpdates: true, autoUpdate: false }).autoUpdate, false);
});

test('the assistant defaults to Grok Bot and accepts only the three destinations', () => {
  assert.equal(DEFAULT_SETTINGS.assistant, 'grokbot');
  for (const assistant of ['grokbot', 'openbot', 'hermes']) {
    assert.equal(normalizeSettings({ ...validSettings, assistant }).assistant, assistant);
  }
  for (const assistant of ['', 'OpenBot', 'other', null, 1]) {
    assert.deepEqual(normalizeSettings({ ...validSettings, assistant }), validSettings);
  }
  // Settings from before this option keep sending to Grok Bot.
  const { assistant, ...legacy } = validSettings;
  assert.equal(normalizeSettings(legacy).assistant, 'grokbot');
});

test('the OpenBot agent id is validated and its name kept only with an id', () => {
  const agent = { ...validSettings, assistant: 'openbot', openbotAgentId: 'agent-1', openbotAgentName: '  Fictional Helper ' };
  assert.deepEqual(normalizeSettings(agent), { ...agent, openbotAgentName: 'Fictional Helper' });
  for (const openbotAgentId of ['bad id', '../x', '.', '..', '.x', 'x'.repeat(129), 5]) {
    const result = normalizeSettings({ ...agent, openbotAgentId });
    assert.equal(result.openbotAgentId, '');
    assert.equal(result.openbotAgentName, '');
  }
  assert.equal(normalizeSettings({ ...agent, openbotAgentName: 'n'.repeat(81) }).openbotAgentName, '');
});

test('Hermes settings: a local .exe path, strict model and provider names, continue on by default', () => {
  assert.equal(DEFAULT_SETTINGS.hermesContinue, true);
  const hermes = { ...validSettings, assistant: 'hermes', hermesPath: 'C:\\Tools\\hermes.exe', hermesModel: 'anthropic/claude-sonnet-4',
    hermesProvider: 'openrouter', hermesContinue: false };
  assert.deepEqual(normalizeSettings(hermes), hermes);
  for (const [field, value] of [['hermesPath', 'hermes.exe'], ['hermesPath', 'C:\\Windows\\System32\\cmd.exe'], ['hermesPath', '\\\\server\\share\\hermes.exe'], ['hermesPath', 'C:\\x\\run.bat'],
    ['hermesModel', '--yolo'], ['hermesModel', 'a b'], ['hermesProvider', 'x;y'], ['hermesProvider', 'p'.repeat(101)],
    ['hermesContinue', 'no'], ['hermesContinue', null]]) {
    assert.deepEqual(normalizeSettings({ ...hermes, [field]: value }), { ...hermes, [field]: DEFAULT_SETTINGS[field] }, `${field}=${value}`);
  }
});

test('the reply timeout is 1 to 120 whole minutes, 10 by default', () => {
  assert.equal(DEFAULT_SETTINGS.replyTimeoutMinutes, 10);
  for (const value of [1, 30, 120]) assert.equal(normalizeSettings({ ...validSettings, replyTimeoutMinutes: value }).replyTimeoutMinutes, value);
  for (const value of [0, 121, 2.5, '5', null]) {
    assert.equal(normalizeSettings({ ...validSettings, replyTimeoutMinutes: value }).replyTimeoutMinutes, 10);
  }
});
