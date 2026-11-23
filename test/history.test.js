const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { loadHistory, addToHistory, saveHistory } = require('../src/lib/history');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-history-'));
after(() => fs.rmSync(directory, { recursive: true, force: true }));

test('carregamento ausente, corrompido ou de formato inválido retorna lista vazia sem lançar', () => {
  assert.deepEqual(loadHistory(path.join(directory, 'ausente.json')), []);
  assert.deepEqual(loadHistory(null), []);
  assert.deepEqual(loadHistory(directory), []);
  const file = path.join(directory, 'invalido.json');
  for (const text of ['', '{', '{}', 'null', '123', '"texto"']) {
    fs.writeFileSync(file, text);
    assert.deepEqual(loadHistory(file), []);
  }
});

test('adicionar aplica trim, move duplicata para o fim e preserva a lista original', () => {
  const list = ['primeiro', 'segundo'];
  assert.deepEqual(addToHistory(list, ' primeiro '), ['segundo', 'primeiro']);
  assert.deepEqual(list, ['primeiro', 'segundo']);
  const unchanged = addToHistory(list, '  \n ');
  assert.deepEqual(unchanged, list);
  assert.notStrictEqual(unchanged, list);
  assert.deepEqual(addToHistory(list, null), list);
  assert.deepEqual(addToHistory(['Olá'], 'olá'), ['Olá', 'olá']);
});

test('adicionar limita aos 50 envios mais recentes e aceita limite personalizado', () => {
  const list = Array.from({ length: 55 }, (_, index) => String(index));
  assert.deepEqual(addToHistory(list, 'último'), [...list.slice(-49), 'último']);
  assert.deepEqual(addToHistory(list, 'último', 2), ['54', 'último']);
});

test('salvar cria pasta e substitui atomicamente, carregar filtra dados e limita o histórico', () => {
  const file = path.join(directory, 'subpasta', 'history.json');
  const list = ['primeiro', 'ação com acentuação'];
  saveHistory(file, list);
  assert.deepEqual(loadHistory(file), list);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
  saveHistory(file, ['outro']);
  assert.deepEqual(loadHistory(file), ['outro']);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
  const many = Array.from({ length: 60 }, (_, index) => `texto ${index}`);
  fs.writeFileSync(file, JSON.stringify([null, 1, {}, ...many, '', '  ', 'texto 59']));
  assert.deepEqual(loadHistory(file), many.slice(-50));
  saveHistory(file, []);
  assert.deepEqual(loadHistory(file), []);
});
