const { test } = require('node:test');
const assert = require('node:assert/strict');
const { relativeTime } = require('../src/lib/relative-time');
const fs = require('node:fs');
const vm = require('node:vm');

const now = new Date(2026, 10, 23, 15, 30).getTime();
test('relative time covers second, minute and hour boundaries', () => {
  assert.equal(relativeTime(now - 59000, now), 'just now');
  assert.equal(relativeTime(now - 60000, now), '1 min ago');
  assert.equal(relativeTime(now - 3599000, now), '59 min ago');
  assert.equal(relativeTime(now - 3600000, now), '1 h ago');
  assert.equal(relativeTime(new Date(2026, 10, 23, 8, 30).getTime(), now), '7 h ago');
});
test('dates use local days and times across month and year boundaries', () => {
  assert.equal(relativeTime(new Date(2026, 10, 22, 9, 5).getTime(), now), 'yesterday, 9:05 AM');
  assert.equal(relativeTime(new Date(2026, 10, 20, 9, 5).getTime(), now), 'Nov 20, 9:05 AM');
  assert.equal(relativeTime(new Date(2025, 11, 31, 12).getTime(), new Date(2026, 0, 1, 14).getTime()), 'yesterday, 12:00 PM');
  assert.equal(relativeTime(new Date(2026, 9, 31, 12).getTime(), new Date(2026, 10, 1, 14).getTime()), 'yesterday, 12:00 PM');
});
test('less than an hour takes precedence over a day change', () => {
  assert.equal(relativeTime(new Date(2026, 10, 22, 23, 50).getTime(),
    new Date(2026, 10, 23, 0, 10).getTime()), '20 min ago');
});
test('browser export works without CommonJS', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../src/lib/i18n'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('../src/lib/relative-time'), 'utf8'), context);
  assert.equal(context.relativeTime(now - 60000, now), '1 min ago');
});
