const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { MAX_TEMPLATES, MAX_TEMPLATE_NAME, MAX_TEMPLATE_TEXT, normalizeTemplate, normalizeTemplates,
  validateTemplates, applyTemplate } = require('../src/lib/templates');

test('limits are 30 templates, 40-character names and 500-character texts', () => {
  assert.equal(MAX_TEMPLATES, 30);
  assert.equal(MAX_TEMPLATE_NAME, 40);
  assert.equal(MAX_TEMPLATE_TEXT, 500);
});

test('normalizeTemplate trims, checks types and counts emoji as one character', () => {
  assert.deepEqual(normalizeTemplate({ name: '  Summarize ', text: ' Summarize: ' }), { name: 'Summarize', text: 'Summarize:' });
  assert.deepEqual(normalizeTemplate({ name: 'a'.repeat(40), text: 'b'.repeat(500), extra: 1 }),
    { name: 'a'.repeat(40), text: 'b'.repeat(500) });
  assert.deepEqual(normalizeTemplate({ name: '\u{1F600}'.repeat(40), text: '\u{1F600}'.repeat(500) }),
    { name: '\u{1F600}'.repeat(40), text: '\u{1F600}'.repeat(500) });
  assert.deepEqual(normalizeTemplate(Object.assign(Object.create(null), { name: 'n', text: 't' })), { name: 'n', text: 't' });
  for (const item of [null, undefined, 'x', [], 42, new (class Template {})(),
    { name: 'a'.repeat(41), text: 't' }, { name: 'n', text: 'b'.repeat(501) },
    { name: '', text: 't' }, { name: 'n', text: '   ' }, { name: 1, text: 't' }, { name: 'n', text: {} },
    { text: 't' }, { name: 'n' }]) {
    assert.equal(normalizeTemplate(item), null, JSON.stringify(item));
  }
});

test('normalizeTemplates drops bad items and keeps at most 30', () => {
  const many = Array.from({ length: 35 }, (_, index) => ({ name: `T${index}`, text: `Text ${index}` }));
  const result = normalizeTemplates([{ name: 'bad' }, ...many]);
  assert.equal(result.length, 30);
  assert.deepEqual(result[0], { name: 'T0', text: 'Text 0' });
  for (const value of [undefined, null, {}, 'list']) assert.deepEqual(normalizeTemplates(value), []);
});

test('validateTemplates rejects the whole list when any item is invalid or there are too many', () => {
  assert.deepEqual(validateTemplates([]), { ok: true, templates: [] });
  assert.deepEqual(validateTemplates([{ name: ' A ', text: 'B' }]), { ok: true, templates: [{ name: 'A', text: 'B' }] });
  const thirty = Array.from({ length: 30 }, (_, index) => ({ name: `T${index}`, text: 'x' }));
  assert.equal(validateTemplates(thirty).ok, true);
  for (const list of [[...thirty, { name: 'one more', text: 'x' }], [{ name: 'A', text: 'B' }, { name: '', text: 'B' }],
    null, undefined, 'x', {}]) {
    assert.deepEqual(validateTemplates(list), { ok: false });
  }
});

test('applyTemplate puts the text at the start of the message', () => {
  assert.equal(applyTemplate('', 'Summarize:'), 'Summarize: ');
  assert.equal(applyTemplate('   ', 'Summarize:'), 'Summarize: ');
  assert.equal(applyTemplate('the meeting notes', 'Summarize:'), 'Summarize:\nthe meeting notes');
  assert.equal(applyTemplate('keep', ''), 'keep');
  assert.equal(applyTemplate(undefined, 'T'), 'T ');
  assert.equal(applyTemplate('keep', null), 'keep');
});

test('templates.js also loads in the renderer without CommonJS', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../src/lib/templates'), 'utf8'), context);
  assert.equal(context.applyTemplate('x', 'T'), 'T\nx');
  assert.equal(context.MAX_TEMPLATES, 30);
});
