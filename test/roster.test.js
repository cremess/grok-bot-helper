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

test('base32 matches a known vector and round-trips UTF-8', () => {
  assert.equal(encodeBase32('sand'), 'onqw4za');
  for (const text of ['', 'sand', 'ASCII 123', 'grok%7Cuser_01ABC', 'A caf\u00e9 and a smile 😀']) {
    const encoded = encodeBase32(text);
    assert.match(encoded, /^[a-z2-7]*$/);
    assert.equal(decodeBase32(encoded), text);
    assert.equal(decodeBase32(encoded.toUpperCase()), text);
  }
  for (const text of ['onqw4za=', 'abc1', 'abc0', 'ab c', 'ab!c', '\u00e9', null]) {
    assert.equal(decodeBase32(text), null);
  }
});

test('findRosterFile returns null for missing directories or rosters', () => {
  assert.equal(findRosterFile(path.join(temporaryDirectory, 'missing')), null);
  const dir = createDirectory('no-roster');
  fs.writeFileSync(path.join(dir, 'invalid!.blob'), '{}');
  fs.writeFileSync(path.join(dir, `${encodeBase32('other.key')}.blob`), '{}');
  fs.writeFileSync(path.join(dir, `${encodeBase32('sand.client.slice.account.a.roster.last-roster')}.txt`), '{}');
  assert.equal(findRosterFile(dir), null);
});

test('findRosterFile finds the roster among other blobs and returns an absolute path', () => {
  const dir = createDirectory('roster');
  fs.writeFileSync(path.join(dir, `${encodeBase32('other.key')}.blob`), '{}');
  const filePath = writeRoster(dir, 'grok%7Cuser_01ABC', '{}');
  assert.equal(findRosterFile(dir), filePath);
  assert.equal(path.isAbsolute(findRosterFile(dir)), true);
});

test('findRosterFile selects the newest mtime across accounts', () => {
  const dir = createDirectory('accounts');
  const first = writeRoster(dir, 'account-a', '{}');
  const second = writeRoster(dir, 'account-b', '{}');
  fs.utimesSync(first, new Date('2020-01-01'), new Date('2020-01-01'));
  fs.utimesSync(second, new Date('2021-01-01'), new Date('2021-01-01'));
  assert.equal(findRosterFile(dir), second);
  fs.utimesSync(first, new Date('2022-01-01'), new Date('2022-01-01'));
  assert.equal(findRosterFile(dir), first);
});

test('parseRoster accepts an object or JSON and returns only id, trimmed name and color', () => {
  const data = roster([{ ...bot, name: '  Grok  ', extra: 'ignored' }]);
  const expected = [{ id: bot.id, name: 'Grok', color: 'black' }];
  assert.deepEqual(parseRoster(data), expected);
  assert.deepEqual(parseRoster(JSON.stringify(data)), expected);
  assert.equal(data.value.rows[0].name, '  Grok  ');
});

test('parseRoster returns an empty list for invalid JSON or unexpected formats', () => {
  for (const data of ['{', '', 'null', null, undefined, [], {}, { value: {} },
    { value: { rows: {} } }, { value: { rows: null } }]) {
    assert.deepEqual(parseRoster(data), []);
  }
});

test('parseRoster filters removed bots, groups, invalid IDs and empty names', () => {
  const rows = [null, 42, {}, { ...bot, isRemovedFromSidebar: true },
    { ...bot, isGroup: true }, { ...bot, id: 'invalid ID' }, { ...bot, id: '' },
    { ...bot, name: '  ' }, { ...bot, name: 42 },
    { ...bot, isHiddenFromSidebar: true }];
  assert.deepEqual(parseRoster(roster(rows)), [{ id: bot.id, name: 'Grok', color: 'black' }]);
});

test('parseRoster sorts by activity and breaks ties by name in en-US', () => {
  const rows = [
    { id: 'z', name: 'Zebra' },
    { id: 'b', name: 'Beta', lastActivityAt: 10 },
    { id: 'a', name: '\u00c1corn', lastActivityAt: 10 },
    { id: 'recent', name: 'Recent', lastActivityAt: 20 },
    { id: 'old', name: 'Old', lastActivityAt: -1 },
  ];
  assert.deepEqual(parseRoster(roster(rows)).map(({ id }) => id), ['recent', 'a', 'b', 'z', 'old']);
});

test('parseRoster removes duplicate IDs keeping the first after sorting', () => {
  const rows = [
    { ...bot, name: 'Old', lastActivityAt: 1 },
    { ...bot, name: 'New', lastActivityAt: 2 },
    { id: 'other', name: 'Other' },
  ];
  assert.deepEqual(parseRoster(roster(rows)), [
    { id: bot.id, name: 'New', color: 'black' },
    { id: 'other', name: 'Other', color: null },
  ]);
});

test('parseRoster limits names to 80 characters and normalizes absent colors', () => {
  for (const avatarColor of [undefined, null, 42, '', '   ']) {
    assert.deepEqual(parseRoster(roster([{ ...bot, name: ` ${'a'.repeat(90)} `, avatarColor }])), [
      { id: bot.id, name: 'a'.repeat(80), color: null },
    ]);
  }
});

test('listBots returns not-found for missing directories or rosters', () => {
  assert.deepEqual(listBots(path.join(temporaryDirectory, 'nonexistent')), { ok: false, error: 'not-found' });
  assert.deepEqual(listBots(createDirectory('empty-list')), { ok: false, error: 'not-found' });
});

test('listBots treats broken JSON as an empty list and reads valid data', () => {
  const dir = createDirectory('list');
  const filePath = writeRoster(dir, 'account', '{');
  assert.deepEqual(listBots(dir), { ok: true, bots: [] });
  fs.writeFileSync(filePath, JSON.stringify(roster([bot])), 'utf8');
  assert.deepEqual(listBots(dir), {
    ok: true, bots: [{ id: bot.id, name: 'Grok', color: 'black' }],
  });
});

test('listBots returns unreadable on read errors without throwing', (t) => {
  const dir = createDirectory('unreadable');
  const filePath = writeRoster(dir, 'account', '{}');
  const originalRead = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (target, ...args) => {
    if (target === filePath) throw Object.assign(new Error('Access denied'), { code: 'EACCES' });
    return originalRead(target, ...args);
  });
  assert.deepEqual(listBots(dir), { ok: false, error: 'unreadable' });
});
