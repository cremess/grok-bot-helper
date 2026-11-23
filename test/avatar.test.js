const { test } = require('node:test');
const assert = require('node:assert/strict');
const { avatarColor, avatarInitial } = require('../src/lib/avatar');

const colors = {
  black: '#3f3f46', gray: '#71717a', grey: '#71717a', brown: '#9a6b4b',
  red: '#e5484d', orange: '#f76b15', yellow: '#e2a336', green: '#30a46c',
  teal: '#12a594', blue: '#1080f3', indigo: '#5b5bd6', purple: '#8e4ec6', pink: '#d6409f',
};

test('known Grok Bot colors', () => {
  for (const [name, color] of Object.entries(colors)) assert.equal(avatarColor(name, 'bot'), color);
  assert.equal(avatarColor(' BLUE ', 'bot'), colors.blue);
});

test('unknown or null colors use a stable hash into the palette', () => {
  for (const id of ['bot-1', 'bot-2', '', null, '\u00e9']) {
    const color = avatarColor(null, id);
    assert.equal(avatarColor(null, id), color);
    assert.equal(avatarColor('unknown', id), color);
    assert.ok(Object.values(colors).includes(color));
  }
});

test('alphanumeric and accented initials and empty names', () => {
  for (const [name, initial] of [['Technical follow-up', 'T'], ['  \u00e9clair', '\u00c9'], ['', '?'], [' ! 2 bots', '2'], ['🙂 action', 'A'], ['---', '?'], [null, '?']]) {
    assert.equal(avatarInitial(name), initial);
  }
});
