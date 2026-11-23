const { test } = require('node:test');
const assert = require('node:assert/strict');
const { relativeTime } = require('../src/lib/relative-time');
const fs = require('node:fs');
const vm = require('node:vm');

const now = new Date(2026, 10, 23, 15, 30).getTime();
test('tempo relativo cobre os limites de segundos, minutos e horas', () => {
  assert.equal(relativeTime(now - 59000, now), 'agora');
  assert.equal(relativeTime(now - 60000, now), 'há 1 min');
  assert.equal(relativeTime(now - 3599000, now), 'há 59 min');
  assert.equal(relativeTime(now - 3600000, now), 'há 1 h');
  assert.equal(relativeTime(new Date(2026, 10, 23, 8, 30).getTime(), now), 'há 7 h');
});
test('datas usam dia e horário locais, inclusive mudança de mês e ano', () => {
  assert.equal(relativeTime(new Date(2026, 10, 22, 9, 5).getTime(), now), 'ontem, 09:05');
  assert.equal(relativeTime(new Date(2026, 10, 20, 9, 5).getTime(), now), '20/11, 09:05');
  assert.equal(relativeTime(new Date(2025, 11, 31, 12).getTime(), new Date(2026, 0, 1, 14).getTime()), 'ontem, 12:00');
  assert.equal(relativeTime(new Date(2026, 9, 31, 12).getTime(), new Date(2026, 10, 1, 14).getTime()), 'ontem, 12:00');
});
test('menos de uma hora tem prioridade sobre a mudança de dia', () => {
  assert.equal(relativeTime(new Date(2026, 10, 22, 23, 50).getTime(),
    new Date(2026, 10, 23, 0, 10).getTime()), 'há 20 min');
});
test('exportação de navegador funciona sem CommonJS', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../src/lib/relative-time'), 'utf8'), context);
  assert.equal(context.relativeTime(now - 60000, now), 'há 1 min');
});
