const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { encodeBase32 } = require('../src/lib/roster');
const { readUsage, isBlocked, formatReset } = require('../src/lib/usage');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-usage-'));
after(() => {
  const resolved = path.resolve(root);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('grokbot-usage-'));
  fs.rmSync(resolved, { recursive: true, force: true });
});
function fixture(name, data) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  const file = path.join(dir, `${encodeBase32('sand.client.slice.account.a.weekly-usage.cache')}.blob`);
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
  return dir;
}
const cache = (usage) => ({ schemaVersion: 3, value: { kind: 'present', reading: {
  usage, readAtMs: 1000,
} } });

test('uso ausente, JSON quebrado e erro de leitura não lançam', (t) => {
  assert.deepEqual(readUsage(root), { ok: false, error: 'not-found' });
  assert.deepEqual(readUsage(path.join(root, 'ausente')), { ok: false, error: 'not-found' });
  assert.deepEqual(readUsage(fixture('quebrado', '{')), { ok: false, error: 'unreadable' });
  const dir = fixture('inacessivel', cache({}));
  t.mock.method(fs, 'readFileSync', () => { throw Object.assign(new Error('Sem acesso'), { code: 'EACCES' }); });
  assert.deepEqual(readUsage(dir), { ok: false, error: 'unreadable' });
});

test('lê uso bloqueado, plano e horário da leitura', () => {
  const usage = readUsage(fixture('bloqueado', cache({ percentUsed: 100, wouldRefuseSend: true,
    nextResetMs: 3000, grokPlanLabel: 'Grok Bot Plan' })));
  assert.deepEqual(usage, { ok: true, percentUsed: 100, wouldRefuseSend: true,
    nextResetMs: 3000, readAtMs: 1000, planLabel: 'Grok Bot Plan' });
  assert.equal(isBlocked(usage, 2000), true);
  assert.equal(isBlocked(usage, 3000), false);
  assert.equal(isBlocked(usage, 4000), false);
  assert.equal(isBlocked({ ...usage, nextResetMs: null }, 4000), true);
});

test('uso sem recusa não bloqueia, mesmo com percentual de 100%', () => {
  const usage = readUsage(fixture('disponivel', cache({ percentUsed: 100, wouldRefuseSend: false })));
  assert.equal(isBlocked(usage, 2000), false);
  assert.equal(isBlocked({ ok: false, wouldRefuseSend: true, nextResetMs: null }, 2000), false);
});

test('campos ausentes e tipos errados usam valores seguros', () => {
  for (const [name, data] of [['vazio', {}], ['tipos', cache({ percentUsed: '100',
    wouldRefuseSend: 'true', nextResetMs: '3000', grokPlanLabel: 42 })],
  ['ausente', { value: { kind: 'absent' } }]]) {
    const usage = readUsage(fixture(name, data));
    assert.equal(usage.percentUsed, null);
    assert.equal(usage.wouldRefuseSend, false);
    assert.equal(usage.nextResetMs, null);
    assert.equal(usage.planLabel, null);
    assert.equal(isBlocked(usage, 2000), false);
  }
});

test('formatReset usa datas fixas no fuso local, inclusive virada de ano', () => {
  const now = new Date(2026, 10, 23, 7).getTime();
  assert.equal(formatReset(null, now), 'em breve');
  assert.equal(formatReset(new Date(2026, 10, 23, 8, 25).getTime(), now), 'hoje às 08:25');
  assert.equal(formatReset(new Date(2026, 10, 24, 8, 25).getTime(), now), 'amanhã às 08:25');
  assert.equal(formatReset(new Date(2026, 10, 25, 8, 25).getTime(), now), 'qua., 25/11 às 08:25');
  assert.equal(formatReset(new Date(2027, 0, 1, 8, 25).getTime(),
    new Date(2026, 11, 31, 23).getTime()), 'amanhã às 08:25');
});
