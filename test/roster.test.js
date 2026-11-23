const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  decodeBase32, encodeBase32, findRosterFile, parseRoster, listBots,
} = require('../src/lib/roster');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-roster-'));
after(() => {
  const resolved = path.resolve(temporaryDirectory);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('grokbot-roster-'));
  fs.rmSync(resolved, { recursive: true, force: true });
});

function createDirectory(name) {
  const dir = path.join(temporaryDirectory, name);
  fs.mkdirSync(dir);
  return dir;
}

function writeRoster(dir, account, contents) {
  const key = `sand.client.slice.account.${account}.roster.last-roster`;
  const filePath = path.join(dir, `${encodeBase32(key)}.blob`);
  fs.writeFileSync(filePath, contents, 'utf8');
  return filePath;
}

const bot = {
  id: '1f0c9a2e-5b7d-4c3a-9e8f-2a6b4d0c7e15', name: 'Grok', avatarColor: 'black',
  isGroup: false, isHiddenFromSidebar: false, isRemovedFromSidebar: false,
  lastActivityAt: 1795384795161,
};
const roster = (rows) => ({ schemaVersion: 4, value: { rows } });

test('base32 corresponde ao vetor conhecido e faz ida e volta em UTF-8', () => {
  assert.equal(encodeBase32('sand'), 'onqw4za');
  for (const text of ['', 'sand', 'ASCII 123', 'grok%7Cuser_01ABC', 'Ação, café e coração 😀']) {
    const encoded = encodeBase32(text);
    assert.match(encoded, /^[a-z2-7]*$/);
    assert.equal(decodeBase32(encoded), text);
    assert.equal(decodeBase32(encoded.toUpperCase()), text);
  }
  for (const text of ['onqw4za=', 'abc1', 'abc0', 'ab c', 'ab!c', 'á', null]) {
    assert.equal(decodeBase32(text), null);
  }
});

test('findRosterFile retorna null para pasta inexistente ou sem roster', () => {
  assert.equal(findRosterFile(path.join(temporaryDirectory, 'ausente')), null);
  const dir = createDirectory('sem-roster');
  fs.writeFileSync(path.join(dir, 'invalido!.blob'), '{}');
  fs.writeFileSync(path.join(dir, `${encodeBase32('outra.chave')}.blob`), '{}');
  fs.writeFileSync(path.join(dir, `${encodeBase32('sand.client.slice.account.a.roster.last-roster')}.txt`), '{}');
  assert.equal(findRosterFile(dir), null);
});

test('findRosterFile encontra o roster entre outros blobs e retorna caminho absoluto', () => {
  const dir = createDirectory('roster');
  fs.writeFileSync(path.join(dir, `${encodeBase32('outra.chave')}.blob`), '{}');
  const filePath = writeRoster(dir, 'grok%7Cuser_01ABC', '{}');
  assert.equal(findRosterFile(dir), filePath);
  assert.equal(path.isAbsolute(findRosterFile(dir)), true);
});

test('findRosterFile escolhe o mtime mais recente entre contas', () => {
  const dir = createDirectory('contas');
  const first = writeRoster(dir, 'conta-a', '{}');
  const second = writeRoster(dir, 'conta-b', '{}');
  fs.utimesSync(first, new Date('2020-01-01'), new Date('2020-01-01'));
  fs.utimesSync(second, new Date('2021-01-01'), new Date('2021-01-01'));
  assert.equal(findRosterFile(dir), second);
  fs.utimesSync(first, new Date('2022-01-01'), new Date('2022-01-01'));
  assert.equal(findRosterFile(dir), first);
});

test('parseRoster aceita objeto ou JSON e retorna só id, nome aparado e cor', () => {
  const data = roster([{ ...bot, name: '  Grok  ', extra: 'ignorado' }]);
  const expected = [{ id: bot.id, name: 'Grok', color: 'black' }];
  assert.deepEqual(parseRoster(data), expected);
  assert.deepEqual(parseRoster(JSON.stringify(data)), expected);
  assert.equal(data.value.rows[0].name, '  Grok  ');
});

test('parseRoster retorna lista vazia para JSON inválido ou formato inesperado', () => {
  for (const data of ['{', '', 'null', null, undefined, [], {}, { value: {} },
    { value: { rows: {} } }, { value: { rows: null } }]) {
    assert.deepEqual(parseRoster(data), []);
  }
});

test('parseRoster filtra removidos, grupos, IDs inválidos e nomes vazios', () => {
  const rows = [null, 42, {}, { ...bot, isRemovedFromSidebar: true },
    { ...bot, isGroup: true }, { ...bot, id: 'ID inválido' }, { ...bot, id: '' },
    { ...bot, name: '  ' }, { ...bot, name: 42 },
    { ...bot, isHiddenFromSidebar: true }];
  assert.deepEqual(parseRoster(roster(rows)), [{ id: bot.id, name: 'Grok', color: 'black' }]);
});

test('parseRoster ordena por atividade e desempata por nome em pt-BR', () => {
  const rows = [
    { id: 'z', name: 'Zebra' },
    { id: 'b', name: 'Beta', lastActivityAt: 10 },
    { id: 'a', name: 'Árvore', lastActivityAt: 10 },
    { id: 'recent', name: 'Recente', lastActivityAt: 20 },
    { id: 'old', name: 'Antigo', lastActivityAt: -1 },
  ];
  assert.deepEqual(parseRoster(roster(rows)).map(({ id }) => id), ['recent', 'a', 'b', 'z', 'old']);
});

test('parseRoster remove IDs duplicados mantendo o primeiro após ordenar', () => {
  const rows = [
    { ...bot, name: 'Antigo', lastActivityAt: 1 },
    { ...bot, name: 'Novo', lastActivityAt: 2 },
    { id: 'outro', name: 'Outro' },
  ];
  assert.deepEqual(parseRoster(roster(rows)), [
    { id: bot.id, name: 'Novo', color: 'black' },
    { id: 'outro', name: 'Outro', color: null },
  ]);
});

test('parseRoster limita o nome a 80 caracteres e normaliza cores ausentes', () => {
  for (const avatarColor of [undefined, null, 42, '', '   ']) {
    assert.deepEqual(parseRoster(roster([{ ...bot, name: ` ${'a'.repeat(90)} `, avatarColor }])), [
      { id: bot.id, name: 'a'.repeat(80), color: null },
    ]);
  }
});

test('listBots retorna not-found quando pasta ou roster não existem', () => {
  assert.deepEqual(listBots(path.join(temporaryDirectory, 'inexistente')), { ok: false, error: 'not-found' });
  assert.deepEqual(listBots(createDirectory('lista-vazia')), { ok: false, error: 'not-found' });
});

test('listBots trata JSON quebrado como lista vazia e lê o caso válido', () => {
  const dir = createDirectory('lista');
  const filePath = writeRoster(dir, 'conta', '{');
  assert.deepEqual(listBots(dir), { ok: true, bots: [] });
  fs.writeFileSync(filePath, JSON.stringify(roster([bot])), 'utf8');
  assert.deepEqual(listBots(dir), {
    ok: true, bots: [{ id: bot.id, name: 'Grok', color: 'black' }],
  });
});

test('listBots retorna unreadable em erro de leitura sem lançar', (t) => {
  const dir = createDirectory('ilegivel');
  const filePath = writeRoster(dir, 'conta', '{}');
  const originalRead = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (target, ...args) => {
    if (target === filePath) throw Object.assign(new Error('Acesso negado'), { code: 'EACCES' });
    return originalRead(target, ...args);
  });
  assert.deepEqual(listBots(dir), { ok: false, error: 'unreadable' });
});
