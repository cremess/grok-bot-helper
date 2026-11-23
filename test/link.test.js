const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_TEXT_LENGTH,
  validateText,
  isValidBotId,
  parseBotId,
  buildPromptLink,
} = require('../src/lib/link');

test('rejects empty text and non-string values', () => {
  for (const text of ['', '   ', '\n\t', undefined, null, 123, {}, []]) {
    assert.deepEqual(validateText(text), { ok: false, error: 'empty' });
    assert.deepEqual(buildPromptLink({ text }), { ok: false, error: 'empty' });
  }
});

test('limits trimmed text to 1000 code points', () => {
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

test('trims text and encodes spaces as %20', () => {
  assert.deepEqual(buildPromptLink({ text: ' \n caf\u00e9 world \t' }), {
    ok: true,
    url: 'grokbot://app/v1/prompt?text=caf%C3%A9%20world',
  });
});

test('round-trips accents, symbols, emoji and newlines', () => {
  const text = 'caf\u00e9 & = # + ?\nsecond line 😀';
  const result = buildPromptLink({ text });
  assert.equal(result.ok, true);
  assert.equal(new URL(result.url).searchParams.get('text'), text);
  assert.ok(result.url.includes('%2B'));
  assert.ok(!result.url.includes('+'));
});

test('includes id before text and omits id when absent', () => {
  assert.deepEqual(buildPromptLink({ text: 'hi', botId: 'Bot_123-x' }), {
    ok: true,
    url: 'grokbot://app/v1/prompt?id=Bot_123-x&text=hi',
  });
  for (const botId of [undefined, null, '']) {
    const result = buildPromptLink({ text: 'hi', botId });
    assert.equal(result.ok, true);
    assert.equal(new URL(result.url).searchParams.has('id'), false);
  }
});

test('validates ID type, characters and length', () => {
  for (const id of ['a', 'Bot_123-x', 'a'.repeat(128)]) {
    assert.equal(isValidBotId(id), true);
  }
  for (const id of ['', 'abc def', 'a/b', 'a'.repeat(129), '\u00e9', 'abc\n', null, 123]) {
    assert.equal(isValidBotId(id), false);
  }
  for (const botId of ['abc def', 'a/b', 'a'.repeat(129), ' ', 0, false]) {
    assert.deepEqual(buildPromptLink({ text: 'hi', botId }), {
      ok: false, error: 'invalid-bot-id',
    });
  }
});

test('extracts a bare ID or one of four supported link formats with trimming', () => {
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

test('rejects unsupported links, invalid IDs and inputs without an ID', () => {
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
    'this is not a link!', '', '   ', null, undefined, 123,
  ]) {
    assert.equal(parseBotId(input), null, `Input: ${input}`);
  }
});
