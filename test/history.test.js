const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { loadHistory, addToHistory, saveHistory } = require('../src/lib/history');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-history-'));
after(() => fs.rmSync(directory, { recursive: true, force: true }));

test('missing, corrupt or invalid history loads as an empty list without throwing', () => {
  assert.deepEqual(loadHistory(path.join(directory, 'missing.json')), []);
  assert.deepEqual(loadHistory(null), []);
  assert.deepEqual(loadHistory(directory), []);
  const file = path.join(directory, 'invalid.json');
  for (const text of ['', '{', '{}', 'null', '123', '"text"']) {
    fs.writeFileSync(file, text);
    assert.deepEqual(loadHistory(file), []);
  }
});

test('adding trims text, moves duplicates to the end and preserves the original list', () => {
  const list = ['first', 'second'];
  assert.deepEqual(addToHistory(list, ' first '), ['second', 'first']);
  assert.deepEqual(list, ['first', 'second']);
  const unchanged = addToHistory(list, '  \n ');
  assert.deepEqual(unchanged, list);
  assert.notStrictEqual(unchanged, list);
  assert.deepEqual(addToHistory(list, null), list);
  assert.deepEqual(addToHistory(['Hello'], 'hello'), ['Hello', 'hello']);
});

test('adding keeps the latest 50 messages and accepts a custom limit', () => {
  const list = Array.from({ length: 55 }, (_, index) => String(index));
  assert.deepEqual(addToHistory(list, 'last'), [...list.slice(-49), 'last']);
  assert.deepEqual(addToHistory(list, 'last', 2), ['54', 'last']);
});

test('saving creates directories and replaces atomically; loading filters data and limits history', () => {
  const file = path.join(directory, 'subdirectory', 'history.json');
  const list = ['first', 'a caf\u00e9 with accents'];
  saveHistory(file, list);
  assert.deepEqual(loadHistory(file), list);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
  saveHistory(file, ['other']);
  assert.deepEqual(loadHistory(file), ['other']);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
  const many = Array.from({ length: 60 }, (_, index) => `text ${index}`);
  fs.writeFileSync(file, JSON.stringify([null, 1, {}, ...many, '', '  ', 'text 59']));
  assert.deepEqual(loadHistory(file), many.slice(-50));
  saveHistory(file, []);
  assert.deepEqual(loadHistory(file), []);
});
