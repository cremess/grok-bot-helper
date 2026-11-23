const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseMarkdown } = require('../src/lib/markdown');
const text = (value) => ({ type: 'text', text: value });
const paragraph = (children) => ({ type: 'paragraph', children });

test('paragraphs preserve single newlines and split on blank lines', () => {
  assert.deepEqual(parseMarkdown('one\r\ntwo\r\n\r\nthree'), [
    paragraph([text('one'), { type: 'break' }, text('two')]), paragraph([text('three')]),
  ]);
  for (const value of ['', ' \n\t', null, undefined, 42, {}]) assert.deepEqual(parseMarkdown(value), []);
});

test('supports heading levels 1 to 3 and treats other headings as paragraphs', () => {
  assert.deepEqual(parseMarkdown('# One\n## Two\n### Three\n#### Four'), [
    ...['One', 'Two', 'Three'].map((value, index) => ({ type: 'heading', level: index + 1, children: [text(value)] })),
    paragraph([text('#### Four')]),
  ]);
});

test('groups consecutive list items and separates ordered and unordered lists', () => {
  assert.deepEqual(parseMarkdown('- one\n* **two**\n1. three\n2. four'), [
    { type: 'list', ordered: false, items: [[text('one')], [{ type: 'strong', children: [text('two')] }]] },
    { type: 'list', ordered: true, items: [[text('three')], [text('four')]] },
  ]);
});

test('fenced code ignores language and preserves literal content', () => {
  assert.deepEqual(parseMarkdown('```js\n**x**\n<script>\n```\nend'), [
    { type: 'code', text: '**x**\n<script>' }, paragraph([text('end')]),
  ]);
  assert.deepEqual(parseMarkdown('```js\n**unclosed**'), [paragraph([text('```js\n**unclosed**')])]);
});

test('quotes group lines and support inline formatting', () => {
  assert.deepEqual(parseMarkdown('> one\n> *two*'), [{ type: 'quote', children: [
    text('one'), { type: 'break' }, { type: 'em', children: [text('two')] },
  ] }]);
});

test('inline formatting supports bold, italics, code and simple nesting', () => {
  assert.deepEqual(parseMarkdown('**bold `code`** *italic* _other_'), [paragraph([
    { type: 'strong', children: [text('bold '), { type: 'code', text: 'code' }] },
    text(' '), { type: 'em', children: [text('italic')] },
    text(' '), { type: 'em', children: [text('other')] },
  ])]);
  assert.deepEqual(parseMarkdown('`**literal**`'), [paragraph([{ type: 'code', text: '**literal**' }])]);
});

test('links allow only http and https and HTML remains text', () => {
  assert.deepEqual(parseMarkdown('[a](https://example.com) [b](http://example.com)'), [paragraph([
    { type: 'link', text: 'a', href: 'https://example.com' }, text(' '),
    { type: 'link', text: 'b', href: 'http://example.com' },
  ])]);
  for (const input of ['[x](javascript:alert)', '[x](data:text/html,x)', '[x](file:///tmp/x)',
    '[x](//example.com)', '[x](/local)', '<script>alert(1)</script>']) {
    assert.deepEqual(parseMarkdown(input), [paragraph([text(input)])]);
  }
});

test('unclosed markup remains literal', () => {
  for (const input of ['**open', '*open', '_open', '`open', '[open](https://example.com']) {
    assert.deepEqual(parseMarkdown(input), [paragraph([text(input)])]);
  }
});

test('browser export works without CommonJS', () => {
  const context = vm.createContext({ URL });
  vm.runInContext(fs.readFileSync(require.resolve('../src/lib/markdown'), 'utf8'), context);
  assert.equal(typeof context.parseMarkdown, 'function');
  assert.equal(JSON.stringify(context.parseMarkdown('hi')), JSON.stringify([paragraph([text('hi')])]));
});
