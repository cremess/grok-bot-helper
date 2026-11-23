const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_TEXT_LENGTH,
  validateText,
  isValidBotId,
  parseBotId,
  buildPromptLink,
} = require('../src/lib/link');

test('rejeita textos vazios e valores que não são strings', () => {
  for (const text of ['', '   ', '\n\t', undefined, null, 123, {}, []]) {
    assert.deepEqual(validateText(text), { ok: false, error: 'empty' });
    assert.deepEqual(buildPromptLink({ text }), { ok: false, error: 'empty' });
  }
});

test('limita o texto a 1000 pontos de código após trim', () => {
  assert.equal(MAX_TEXT_LENGTH, 1000);
  for (const text of ['a'.repeat(1000), '😀'.repeat(1000)]) {
    assert.deepEqual(validateText(` ${text} `), { ok: true, text });
    const result = buildPromptLink({ text });
    assert.equal(result.ok, true);
    assert.equal(new URL(result.url).searchParams.get('text'), text);
  }
  for (const text of ['a'.repeat(1001), '😀'.repeat(1001)]) {
    assert.deepEqual(validateText(text), { ok: false, error: 'too-long' });
    assert.deepEqual(buildPromptLink({ text }), { ok: false, error: 'too-long' });
  }
});

test('aplica trim e codifica espaços como %20', () => {
  assert.deepEqual(buildPromptLink({ text: ' \n olá mundo \t' }), {
    ok: true,
    url: 'grokbot://app/v1/prompt?text=ol%C3%A1%20mundo',
  });
});

test('preserva acentos, símbolos, emoji e quebra de linha na ida e volta', () => {
  const text = 'ação & = # + ?\nsegunda linha 😀';
  const result = buildPromptLink({ text });
  assert.equal(result.ok, true);
  assert.equal(new URL(result.url).searchParams.get('text'), text);
  assert.ok(result.url.includes('%2B'));
  assert.ok(!result.url.includes('+'));
});

test('inclui id antes de text e omite id quando não informado', () => {
  assert.deepEqual(buildPromptLink({ text: 'oi', botId: 'Bot_123-x' }), {
    ok: true,
    url: 'grokbot://app/v1/prompt?id=Bot_123-x&text=oi',
  });
  for (const botId of [undefined, null, '']) {
    const result = buildPromptLink({ text: 'oi', botId });
    assert.equal(result.ok, true);
    assert.equal(new URL(result.url).searchParams.has('id'), false);
  }
});

test('valida o tipo, os caracteres e o tamanho do ID', () => {
  for (const id of ['a', 'Bot_123-x', 'a'.repeat(128)]) {
    assert.equal(isValidBotId(id), true);
  }
  for (const id of ['', 'abc def', 'a/b', 'a'.repeat(129), 'á', 'abc\n', null, 123]) {
    assert.equal(isValidBotId(id), false);
  }
  for (const botId of ['abc def', 'a/b', 'a'.repeat(129), ' ', 0, false]) {
    assert.deepEqual(buildPromptLink({ text: 'oi', botId }), {
      ok: false, error: 'invalid-bot-id',
    });
  }
});

test('extrai o ID puro e dos quatro formatos de link aceitos com trim', () => {
  for (const input of [
    'Bot_123-x',
    'grokbot://app/v1/agent?id=Bot_123-x',
    'sand://app/v1/agent?id=Bot_123-x',
    'https://cursor.com/grok-bot/link/v1/agent?id=Bot_123-x',
    'https://cursor.com/sand/link/v1/agent?id=Bot_123-x',
  ]) {
    assert.equal(parseBotId(input), 'Bot_123-x');
    assert.equal(parseBotId(` \n${input}\t `), 'Bot_123-x');
  }
});

test('rejeita links fora dos formatos, IDs inválidos e entradas sem ID', () => {
  for (const input of [
    'https://evil.com/grok-bot/link/v1/agent?id=x',
    'grokbot://evil/v1/agent?id=x',
    'grokbot://app/v1/prompt?id=x',
    'sand://app/v1/agent/?id=x',
    'https://cursor.com/v1/agent?id=x',
    'http://cursor.com/grok-bot/link/v1/agent?id=x',
    'ftp://app/v1/agent?id=x',
    'https://cursor.com:123/grok-bot/link/v1/agent?id=x',
    'grokbot://app/v1/agent',
    'https://cursor.com/sand/link/v1/agent?id=',
    'grokbot://app/v1/agent?id=abc%20def',
    `sand://app/v1/agent?id=${'a'.repeat(129)}`,
    'isto não é um link!', '', '   ', null, undefined, 123,
  ]) {
    assert.equal(parseBotId(input), null, `Entrada: ${input}`);
  }
});
