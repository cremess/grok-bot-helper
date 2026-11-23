const { test } = require('node:test');
const assert = require('node:assert/strict');
const { avatarColor, avatarInitial } = require('../src/lib/avatar');

const colors = {
  black: '#3f3f46', gray: '#71717a', grey: '#71717a', brown: '#9a6b4b',
  red: '#e5484d', orange: '#f76b15', yellow: '#e2a336', green: '#30a46c',
  teal: '#12a594', blue: '#1080f3', indigo: '#5b5bd6', purple: '#8e4ec6', pink: '#d6409f',
};

test('cores conhecidas do Grok Bot', () => {
  for (const [name, color] of Object.entries(colors)) assert.equal(avatarColor(name, 'bot'), color);
  assert.equal(avatarColor(' BLUE ', 'bot'), colors.blue);
});

test('cor desconhecida ou nula usa hash estável dentro da paleta', () => {
  for (const id of ['bot-1', 'bot-2', '', null, 'á']) {
    const color = avatarColor(null, id);
    assert.equal(avatarColor(null, id), color);
    assert.equal(avatarColor('desconhecida', id), color);
    assert.ok(Object.values(colors).includes(color));
  }
});

test('iniciais alfanuméricas, acentuadas e nomes vazios', () => {
  for (const [name, initial] of [['Follow-up Técnico', 'F'], ['  ébano', 'É'], ['', '?'], [' ! 2 bots', '2'], ['🙂 ação', 'A'], ['---', '?'], [null, '?']]) {
    assert.equal(avatarInitial(name), initial);
  }
});
