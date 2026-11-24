const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { STRINGS, LOCALES, DEFAULT_LOCALE, LANGUAGE_NAMES, t, applyI18n, resolveLocale, setLocale, getLocale,
  intlLocale } = require('../src/lib/i18n');

test('English and Brazilian Portuguese are supported, English is the default', () => {
  assert.deepEqual(LOCALES, ['en', 'pt-BR']);
  assert.equal(DEFAULT_LOCALE, 'en');
  assert.equal(getLocale(), 'en');
  assert.deepEqual(Object.keys(LANGUAGE_NAMES), LOCALES);
});

test('replaces named placeholders literally, including numeric values', () => {
  assert.equal(t('prompt.counter', { length: 0, max: 1000 }), '0/1000');
  assert.equal(t('balloon.ready.body', { shortcut: '$&{name}' }),
    'Use $&{name} to open the prompt. The icon stays here in the tray.');
  assert.equal(t('prompt.counter', { length: 3 }), '3/{max}');
});

test('unknown keys stay visible and unsupported locales fall back to English', () => {
  for (const key of ['missing.key', 'toString', '__proto__']) assert.equal(t(key), key);
  assert.equal(t('prompt.pin', {}, 'missing'), 'Pin');
  assert.equal(t('prompt.counter', null), '{length}/{max}');
  assert.doesNotThrow(() => t('prompt.counter', { length: { toString() { throw Error(); } } }));
});

test('all keys are namespaced and contain nonempty strings, with no Portuguese left in English', () => {
  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(STRINGS[locale])) {
      assert.match(key, /^[a-zA-Z]+\.[a-zA-Z.]+$/);
      assert.equal(typeof value, 'string', key);
      assert.ok(value.trim().length, `${locale} ${key}`);
    }
  }
  for (const [key, value] of Object.entries(STRINGS.en)) {
    assert.doesNotMatch(value, /[\u00e3\u00f5\u00e7\u00e9\u00ea\u00e1\u00e0\u00ed\u00f3\u00fa\u00e2\u00f4]/i, key);
  }
});

test('pt-BR has exactly the English keys and the same placeholders', () => {
  const placeholders = (text) => [...text.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();
  assert.deepEqual(Object.keys(STRINGS['pt-BR']).sort(), Object.keys(STRINGS.en).sort());
  for (const key of Object.keys(STRINGS.en)) {
    assert.deepEqual(placeholders(STRINGS['pt-BR'][key]), placeholders(STRINGS.en[key]), key);
  }
});

test('no locale table repeats a key (a repeated key silently overrides the first one)', () => {
  const source = fs.readFileSync(require.resolve('../src/lib/i18n'), 'utf8');
  const tables = source.split(/\n  '?pt-BR'?: \{\n/);
  assert.equal(tables.length, 2);
  for (const table of tables) {
    const keys = [...table.matchAll(/^ {4}'([a-zA-Z.]+)':/gm)].map((match) => match[1]);
    assert.ok(keys.length > 100);
    assert.deepEqual(keys.filter((key, index) => keys.indexOf(key) !== index), []);
  }
});

test('pt-BR strings use no long dash', () => {
  for (const [key, value] of Object.entries(STRINGS['pt-BR'])) assert.doesNotMatch(value, /\u2014/, key);
});

test('resolveLocale maps the setting and the Windows locale to a supported locale', () => {
  assert.equal(resolveLocale('en', 'pt-BR'), 'en');
  assert.equal(resolveLocale('pt-BR', 'en-US'), 'pt-BR');
  for (const system of ['pt', 'pt-BR', 'pt-PT', 'PT-br', 'pt_BR']) assert.equal(resolveLocale('system', system), 'pt-BR', system);
  for (const system of ['en-US', 'es', 'fr-FR', 'ptx', 'p', '', undefined, null, 42]) {
    assert.equal(resolveLocale('system', system), 'en', String(system));
  }
  assert.equal(resolveLocale('invalid', 'pt-BR'), 'pt-BR');
  assert.equal(resolveLocale(undefined, 'en-GB'), 'en');
});

test('setLocale switches the default locale used by t and Intl, and rejects unknown locales', (context) => {
  context.after(() => setLocale('en'));
  assert.equal(setLocale('pt-BR'), 'pt-BR');
  assert.equal(t('prompt.send'), 'Enviar');
  assert.equal(t('prompt.send', {}, 'en'), 'Send');
  assert.equal(intlLocale(), 'pt-BR');
  assert.equal(setLocale('fr'), 'en');
  assert.equal(t('prompt.send'), 'Send');
  assert.equal(intlLocale(), 'en-US');
});

test('browser export works without CommonJS', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../src/lib/i18n'), 'utf8'), context);
  assert.equal(context.t('prompt.usage', { percent: 80 }), 'Usage: 80%');
  assert.equal(typeof context.applyI18n, 'function');
  assert.equal(context.DEFAULT_LOCALE, 'en');
});

test('in the renderer the locale comes from the page query, and only supported locales are accepted', () => {
  for (const [search, expected] of [['?locale=pt-BR', 'Enviar'], ['?welcome=1&locale=pt-BR', 'Enviar'],
    ['?locale=xx', 'Send'], ['', 'Send']]) {
    const context = vm.createContext({ URLSearchParams, location: { search } });
    vm.runInContext(fs.readFileSync(require.resolve('../src/lib/i18n'), 'utf8'), context);
    assert.equal(context.t('prompt.send'), expected, search);
  }
});

test('static HTML localization sets text and attributes using DOM APIs', () => {
  const nodes = new Map();
  for (const [attribute, key] of [
    ['data-i18n', 'prompt.send'], ['data-i18n-placeholder', 'prompt.placeholder'],
    ['data-i18n-title', 'prompt.pinHelp'], ['data-i18n-aria-label', 'prompt.close'],
  ]) {
    nodes.set(`[${attribute}]`, {
      getAttribute(name) { assert.equal(name, attribute); return key; },
      setAttribute(name, value) { this[name] = value; },
    });
  }
  applyI18n({ querySelectorAll(selector) { return [nodes.get(selector)]; } });
  assert.equal(nodes.get('[data-i18n]').textContent, 'Send');
  assert.equal(nodes.get('[data-i18n-placeholder]').placeholder, 'Ask or tell Grok anything\u2026');
  assert.equal(nodes.get('[data-i18n-title]').title, 'Pin (keep open when clicking outside)');
  assert.equal(nodes.get('[data-i18n-aria-label]')['aria-label'], 'Close');
});

test('renderer HTML localization keys resolve and i18n loads before dependent scripts', () => {
  for (const page of ['prompt', 'settings']) {
    const html = fs.readFileSync(require.resolve(`../src/${page}/${page}.html`), 'utf8');
    assert.match(html, /<html lang="en">/);
    assert.ok(html.indexOf('../lib/i18n.js') < html.indexOf(`src="${page}.js"`));
    for (const match of html.matchAll(/data-i18n(?:-placeholder|-title|-aria-label)?="([^"]+)"/g)) {
      assert.ok(Object.hasOwn(STRINGS.en, match[1]), match[1]);
    }
  }
});
