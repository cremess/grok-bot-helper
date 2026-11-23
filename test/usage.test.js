const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { encodeBase32 } = require('../src/lib/roster');
const { readUsage, isBlocked, formatReset } = require('../src/lib/usage');
const { setLocale } = require('../src/lib/i18n');

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

test('missing usage, broken JSON and read errors do not throw', (t) => {
  assert.deepEqual(readUsage(root), { ok: false, error: 'not-found' });
  assert.deepEqual(readUsage(path.join(root, 'missing')), { ok: false, error: 'not-found' });
  assert.deepEqual(readUsage(fixture('broken', '{')), { ok: false, error: 'unreadable' });
  const dir = fixture('inaccessible', cache({}));
  t.mock.method(fs, 'readFileSync', () => { throw Object.assign(new Error('Access denied'), { code: 'EACCES' }); });
  assert.deepEqual(readUsage(dir), { ok: false, error: 'unreadable' });
});

test('reads blocked usage, plan and read timestamp', () => {
  const usage = readUsage(fixture('blocked', cache({ percentUsed: 100, wouldRefuseSend: true,
    nextResetMs: 3000, grokPlanLabel: 'Grok Bot Plan' })));
  assert.deepEqual(usage, { ok: true, percentUsed: 100, wouldRefuseSend: true,
    nextResetMs: 3000, readAtMs: 1000, planLabel: 'Grok Bot Plan' });
  assert.equal(isBlocked(usage, 2000), true);
  assert.equal(isBlocked(usage, 3000), false);
  assert.equal(isBlocked(usage, 4000), false);
  assert.equal(isBlocked({ ...usage, nextResetMs: null }, 4000), true);
});

test('usage without refusal does not block even at 100 percent', () => {
  const usage = readUsage(fixture('available', cache({ percentUsed: 100, wouldRefuseSend: false })));
  assert.equal(isBlocked(usage, 2000), false);
  assert.equal(isBlocked({ ok: false, wouldRefuseSend: true, nextResetMs: null }, 2000), false);
});

test('missing fields and wrong types use safe defaults', () => {
  for (const [name, data] of [['empty', {}], ['types', cache({ percentUsed: '100',
    wouldRefuseSend: 'true', nextResetMs: '3000', grokPlanLabel: 42 })],
  ['missing', { value: { kind: 'absent' } }]]) {
    const usage = readUsage(fixture(name, data));
    assert.equal(usage.percentUsed, null);
    assert.equal(usage.wouldRefuseSend, false);
    assert.equal(usage.nextResetMs, null);
    assert.equal(usage.planLabel, null);
    assert.equal(isBlocked(usage, 2000), false);
  }
});

test('formatReset uses fixed local dates across year boundaries', () => {
  const now = new Date(2026, 10, 23, 7).getTime();
  assert.equal(formatReset(null, now), 'soon');
  assert.equal(formatReset(new Date(2026, 10, 23, 8, 25).getTime(), now), 'today at 8:25 AM');
  assert.equal(formatReset(new Date(2026, 10, 24, 8, 25).getTime(), now), 'tomorrow at 8:25 AM');
  assert.equal(formatReset(new Date(2026, 10, 25, 8, 25).getTime(), now), 'Wed, Nov 25 at 8:25 AM');
  assert.equal(formatReset(new Date(2027, 0, 1, 8, 25).getTime(),
    new Date(2026, 11, 31, 23).getTime()), 'tomorrow at 8:25 AM');
});

test('formatReset follows the active locale', (context) => {
  context.after(() => setLocale('en'));
  setLocale('pt-BR');
  const now = new Date(2026, 10, 23, 7).getTime();
  assert.equal(formatReset(null, now), 'em breve');
  // ICU versions differ on a leading zero in the hour; either is fine.
  assert.match(formatReset(new Date(2026, 10, 23, 8, 25).getTime(), now), /^hoje \u00e0s 0?8:25$/);
  assert.match(formatReset(new Date(2026, 10, 24, 8, 25).getTime(), now), /^amanh\u00e3 \u00e0s 0?8:25$/);
  const later = formatReset(new Date(2026, 10, 25, 8, 25).getTime(), now);
  assert.match(later, /25/);
  assert.match(later, / \u00e0s 0?8:25$/);
  assert.doesNotMatch(later, /Wed|Nov/);
});
