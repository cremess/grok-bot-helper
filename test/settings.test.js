const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  DEFAULT_SETTINGS, isValidShortcut, normalizeSettings, loadSettings, saveSettings,
} = require('../src/lib/settings');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-'));
after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));

const validSettings = { botId: 'bot_123-ABC', botName: '', shortcut: 'Ctrl+Shift+G', launchAtLogin: true };

test('carregar arquivo inexistente, vazio ou inválido retorna os padrões', () => {
  assert.deepEqual(loadSettings(path.join(temporaryDirectory, 'ausente.json')), DEFAULT_SETTINGS);
  for (const [name, contents] of [['vazio', ''], ['invalido', '{']]) {
    const filePath = path.join(temporaryDirectory, `${name}.json`);
    fs.writeFileSync(filePath, contents, 'utf8');
    assert.deepEqual(loadSettings(filePath), DEFAULT_SETTINGS);
  }
  assert.deepEqual(loadSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings(temporaryDirectory), DEFAULT_SETTINGS);
});

test('salvar cria pastas, permite carregar de volta e não deixa arquivo temporário', () => {
  const filePath = path.join(temporaryDirectory, 'pasta', 'interna', 'settings.json');
  assert.deepEqual(saveSettings(filePath, validSettings), validSettings);
  assert.deepEqual(loadSettings(filePath), validSettings);
  assert.equal(fs.existsSync(`${filePath}.tmp`), false);
  assert.equal(fs.readFileSync(filePath, 'utf8'), JSON.stringify(validSettings, null, 2));

  const updated = { ...validSettings, botId: '' };
  assert.deepEqual(saveSettings(filePath, updated), updated);
  assert.deepEqual(loadSettings(filePath), updated);
  assert.equal(fs.existsSync(`${filePath}.tmp`), false);
});

test('valores inválidos usam o padrão somente no campo correspondente', () => {
  for (const [field, value] of [['botId', 'bot com espaço'], ['shortcut', 'Space'], ['launchAtLogin', 'sim']]) {
    assert.deepEqual(normalizeSettings({ ...validSettings, [field]: value }), {
      ...validSettings, [field]: DEFAULT_SETTINGS[field],
    });
  }
});

test('salvar e carregar normalizam os valores e descartam chaves desconhecidas', () => {
  const filePath = path.join(temporaryDirectory, 'normalizado.json');
  const raw = { ...validSettings, shortcut: 'Space', extra: 'ignorado' };
  const expected = { ...validSettings, shortcut: DEFAULT_SETTINGS.shortcut };
  assert.deepEqual(saveSettings(filePath, raw), expected);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), expected);
  fs.writeFileSync(filePath, JSON.stringify(raw), 'utf8');
  assert.deepEqual(loadSettings(filePath), expected);
  assert.deepEqual(normalizeSettings({ ...validSettings, extra: true }), validSettings);
});

test('normalização exige objeto simples e preserva os padrões e a entrada', () => {
  for (const raw of [undefined, null, [], 'texto', 123, true, new Date(), new (class Settings {})()]) {
    assert.deepEqual(normalizeSettings(raw), DEFAULT_SETTINGS);
  }
  assert.deepEqual(normalizeSettings(Object.assign(Object.create(null), validSettings)), validSettings);
  const snapshot = { botId: '', botName: '', shortcut: 'Alt+Space', launchAtLogin: false };
  const input = { ...validSettings };
  const result = normalizeSettings(input);
  result.botId = 'outro';
  assert.deepEqual(input, validSettings);
  assert.deepEqual(DEFAULT_SETTINGS, snapshot);
  assert.equal(Object.isFrozen(DEFAULT_SETTINGS), true);
  assert.notStrictEqual(normalizeSettings(null), DEFAULT_SETTINGS);
});

test('botName usa padrão vazio, aplica trim e aceita até 80 caracteres', () => {
  assert.equal(DEFAULT_SETTINGS.botName, '');
  assert.equal(normalizeSettings({ botId: 'bot' }).botName, '');
  assert.equal(normalizeSettings({ botId: 'bot', botName: '  Grok  ' }).botName, 'Grok');
  assert.equal(normalizeSettings({ botId: 'bot', botName: ` ${'a'.repeat(80)} ` }).botName, 'a'.repeat(80));
  for (const botName of ['a'.repeat(81), null, 123, {}, []]) {
    assert.equal(normalizeSettings({ botId: 'bot', botName }).botName, '');
  }
});

test('botName é zerado quando o botId final é vazio e persiste com ID válido', () => {
  for (const botId of ['', undefined, 'inválido com espaço']) {
    assert.equal(normalizeSettings({ botId, botName: 'Grok' }).botName, '');
  }
  const filePath = path.join(temporaryDirectory, 'nome.json');
  const named = { ...validSettings, botName: 'Grok' };
  assert.deepEqual(saveSettings(filePath, named), named);
  assert.deepEqual(loadSettings(filePath), named);
  assert.equal(saveSettings(filePath, { ...named, botId: '' }).botName, '');
  fs.writeFileSync(filePath, `\uFEFF${JSON.stringify(named)}`, 'utf8');
  assert.deepEqual(loadSettings(filePath), named);
});

test('aceita todos os exemplos válidos de atalho', () => {
  for (const shortcut of ['Alt+Space', 'Ctrl+Shift+G', 'CommandOrControl+Alt+K', 'Super+Shift+F12']) {
    assert.equal(isValidShortcut(shortcut), true, shortcut);
  }
});

test('rejeita todos os exemplos inválidos de atalho', () => {
  for (const shortcut of ['Space', 'Alt', 'Alt+Shift', 'Alt+Alt+K', 'Alt+Space+K', 'Alt + K', '', '123', 'Alt+Ç']) {
    assert.equal(isValidShortcut(shortcut), false, shortcut);
  }
});

test('aceita os modificadores, teclas e símbolos especificados', () => {
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

test('rejeita tipos, teclas, separadores e modificadores fora do formato', () => {
  for (const shortcut of [null, undefined, 123, {}, 'Alt+k', 'Alt+F0', 'Alt+F25', 'Alt+F01',
    'Alt+', '+K', 'Alt++K', 'Meta+K', 'K+Alt', 'Alt+K\n', 'Alt+\tK']) {
    assert.equal(isValidShortcut(shortcut), false, String(shortcut));
  }
});
