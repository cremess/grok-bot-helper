const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseMarkdown } = require('../src/lib/markdown');
const text = (value) => ({ type: 'text', text: value });
const paragraph = (children) => ({ type: 'paragraph', children });

test('parágrafos preservam quebra simples e separam linhas vazias', () => {
  assert.deepEqual(parseMarkdown('um\r\ndois\r\n\r\ntrês'), [
    paragraph([text('um'), { type: 'break' }, text('dois')]), paragraph([text('três')]),
  ]);
  for (const value of ['', ' \n\t', null, undefined, 42, {}]) assert.deepEqual(parseMarkdown(value), []);
});

test('títulos de níveis 1 a 3 e título fora do escopo como parágrafo', () => {
  assert.deepEqual(parseMarkdown('# Um\n## Dois\n### Três\n#### Quatro'), [
    ...['Um', 'Dois', 'Três'].map((value, index) => ({ type: 'heading', level: index + 1, children: [text(value)] })),
    paragraph([text('#### Quatro')]),
  ]);
});

test('listas consecutivas agrupam marcadores e separam ordenadas de não ordenadas', () => {
  assert.deepEqual(parseMarkdown('- um\n* **dois**\n1. três\n2. quatro'), [
    { type: 'list', ordered: false, items: [[text('um')], [{ type: 'strong', children: [text('dois')] }]] },
    { type: 'list', ordered: true, items: [[text('três')], [text('quatro')]] },
  ]);
});

test('código cercado ignora linguagem e preserva conteúdo literal', () => {
  assert.deepEqual(parseMarkdown('```js\n**x**\n<script>\n```\nfim'), [
    { type: 'code', text: '**x**\n<script>' }, paragraph([text('fim')]),
  ]);
  assert.deepEqual(parseMarkdown('```js\n**sem fechar**'), [paragraph([text('```js\n**sem fechar**')])]);
});

test('citações agrupam linhas e aceitam formatação inline', () => {
  assert.deepEqual(parseMarkdown('> um\n> *dois*'), [{ type: 'quote', children: [
    text('um'), { type: 'break' }, { type: 'em', children: [text('dois')] },
  ] }]);
});

test('inline aceita negrito, itálico, código e aninhamento simples', () => {
  assert.deepEqual(parseMarkdown('**forte `código`** *itálico* _outro_'), [paragraph([
    { type: 'strong', children: [text('forte '), { type: 'code', text: 'código' }] },
    text(' '), { type: 'em', children: [text('itálico')] },
    text(' '), { type: 'em', children: [text('outro')] },
  ])]);
  assert.deepEqual(parseMarkdown('`**literal**`'), [paragraph([{ type: 'code', text: '**literal**' }])]);
});

test('links só aceitam http e https e HTML permanece texto', () => {
  assert.deepEqual(parseMarkdown('[a](https://example.com) [b](http://example.com)'), [paragraph([
    { type: 'link', text: 'a', href: 'https://example.com' }, text(' '),
    { type: 'link', text: 'b', href: 'http://example.com' },
  ])]);
  for (const input of ['[x](javascript:alert)', '[x](data:text/html,x)', '[x](file:///tmp/x)',
    '[x](//example.com)', '[x](/local)', '<script>alert(1)</script>']) {
    assert.deepEqual(parseMarkdown(input), [paragraph([text(input)])]);
  }
});

test('marcação não fechada permanece literal', () => {
  for (const input of ['**aberto', '*aberto', '_aberto', '`aberto', '[aberto](https://example.com']) {
    assert.deepEqual(parseMarkdown(input), [paragraph([text(input)])]);
  }
});

test('exportação de navegador funciona sem CommonJS', () => {
  const context = vm.createContext({ URL });
  vm.runInContext(fs.readFileSync(require.resolve('../src/lib/markdown'), 'utf8'), context);
  assert.equal(typeof context.parseMarkdown, 'function');
  assert.equal(JSON.stringify(context.parseMarkdown('oi')), JSON.stringify([paragraph([text('oi')])]));
});
