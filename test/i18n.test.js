const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { STRINGS, LOCALES, DEFAULT_LOCALE, t, applyI18n } = require('../src/lib/i18n');

test('English is the only supported locale and the default', () => {
  assert.deepEqual(LOCALES, ['en']);
  assert.equal(DEFAULT_LOCALE, 'en');
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

test('all keys are namespaced and contain nonempty English strings', () => {
  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(STRINGS[locale])) {
      assert.match(key, /^[a-zA-Z]+\.[a-zA-Z.]+$/);
      assert.equal(typeof value, 'string', key);
      assert.ok(value.trim().length, key);
      assert.doesNotMatch(value, /[\u00e3\u00f5\u00e7\u00e9\u00ea\u00e1\u00e0\u00ed\u00f3\u00fa\u00e2\u00f4]/i, key);
    }
  }
});

test('browser export works without CommonJS', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../src/lib/i18n'), 'utf8'), context);
  assert.equal(context.t('prompt.usage', { percent: 80 }), 'Usage: 80%');
  assert.equal(typeof context.applyI18n, 'function');
  assert.equal(context.DEFAULT_LOCALE, 'en');
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
