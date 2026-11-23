const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_TEXT_LENGTH, MAX_PARTS, splitMessage, validateText, buildPromptLink } = require('../src/lib/link');

const length = (text) => [...text].length;
const body = (part) => part.replace(/^\(\d+\/\d+\) /, '');

function assertValidParts(parts, max = MAX_TEXT_LENGTH) {
  assert.ok(parts.length > 1);
  parts.forEach((part, index) => {
    assert.ok(part.startsWith(`(${index + 1}/${parts.length}) `), part.slice(0, 12));
    assert.ok(length(part) <= max, `part ${index + 1} has ${length(part)} code points`);
    assert.ok(body(part).trim().length > 0, `part ${index + 1} is empty`);
    assert.equal(body(part), body(part).trim());
    assert.deepEqual(validateText(part), { ok: true, text: part });
  });
}

test('a message that fits is returned as one unprefixed part, and empty input gives no parts', () => {
  assert.equal(MAX_PARTS, 10);
  assert.deepEqual(splitMessage('  hello  '), ['hello']);
  assert.deepEqual(splitMessage('a'.repeat(1000)), ['a'.repeat(1000)]);
  assert.deepEqual(splitMessage('\u{1F600}'.repeat(1000)), ['\u{1F600}'.repeat(1000)]);
  for (const value of ['', '   \n', undefined, null, 42, {}]) assert.deepEqual(splitMessage(value), []);
});

test('the limit is exact and includes the prefix', () => {
  // 1001 characters with no space: the word has to be cut.
  const parts = splitMessage('a'.repeat(1001));
  assertValidParts(parts);
  assert.equal(parts.length, 2);
  assert.equal(length(parts[0]), 1000);
  assert.equal(parts[0], `(1/2) ${'a'.repeat(994)}`);
  assert.equal(parts[1], `(2/2) ${'a'.repeat(7)}`);
  assert.equal(parts.map(body).join(''), 'a'.repeat(1001));
  // A smaller limit behaves the same way.
  assert.deepEqual(splitMessage('abcdefghij', 8), ['(1/5) ab', '(2/5) cd', '(3/5) ef', '(4/5) gh', '(5/5) ij']);
  // A limit too small to hold even the prefix gives no parts instead of looping.
  assert.deepEqual(splitMessage('abcdefghij', 6), []);
});

test('emoji and other surrogate pairs count as one character and are never split', () => {
  const emoji = '\u{1F600}'.repeat(1500);
  const parts = splitMessage(emoji);
  assertValidParts(parts);
  for (const part of parts) assert.doesNotMatch(part, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  assert.equal(length(parts[0]), 1000);
  assert.equal(parts.map(body).join(''), emoji);
});

test('prefers a paragraph break, then a sentence end, then a space', () => {
  const paragraph = `${'word '.repeat(120).trim()}.\n\n${'next '.repeat(150).trim()}`;
  const byParagraph = splitMessage(paragraph);
  assertValidParts(byParagraph);
  assert.equal(body(byParagraph[0]), `${'word '.repeat(120).trim()}.`);

  const sentences = `${'This is a sentence. '.repeat(60).trim()}`;
  const bySentence = splitMessage(sentences);
  assertValidParts(bySentence);
  for (const part of bySentence.slice(0, -1)) assert.match(body(part), /sentence\.$/);

  const words = 'lorem '.repeat(300).trim();
  const bySpace = splitMessage(words);
  assertValidParts(bySpace);
  for (const part of bySpace) assert.match(body(part), /^lorem( lorem)*$/);
  assert.equal(bySpace.map(body).join(' '), words);
});

test('a paragraph break too early in the part does not make a tiny part', () => {
  const text = `Hi.\n\n${'filler text goes here '.repeat(80).trim()}`;
  const parts = splitMessage(text);
  assertValidParts(parts);
  assert.ok(length(body(parts[0])) > 500);
});

test('a break right at the limit uses the space that follows it', () => {
  const first = 'b'.repeat(994);
  const parts = splitMessage(`${first} ${'c'.repeat(20)}`);
  assert.deepEqual(parts, [`(1/2) ${first}`, `(2/2) ${'c'.repeat(20)}`]);
});

test('the prefix grows with ten or more parts and every part still fits', () => {
  const text = 'z'.repeat(9950);
  const parts = splitMessage(text);
  assertValidParts(parts);
  assert.equal(parts.length, 11);
  assert.ok(parts[0].startsWith('(1/11) '));
  assert.equal(parts.map(body).join(''), text);
});

test('no part is empty and whitespace runs between parts are dropped', () => {
  const text = `${'x'.repeat(990)}${' '.repeat(50)}\n\n\n${'y'.repeat(30)}`;
  const parts = splitMessage(text);
  assertValidParts(parts);
  assert.deepEqual(parts.map(body), ['x'.repeat(990), 'y'.repeat(30)]);
});

test('every part builds a valid deep link', () => {
  const parts = splitMessage('Hello world! '.repeat(200));
  for (const part of parts) assert.equal(buildPromptLink({ text: part, botId: 'bot_1' }).ok, true);
});
