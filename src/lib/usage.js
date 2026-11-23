const fs = require('node:fs');
const { findPersistenceFile } = require('./roster');

const USAGE_KEY = /^sand\.client\.slice\.account\..+\.weekly-usage\.cache$/;
const numberOrNull = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;

function readUsage(dir) {
  try {
    // Preserva erros de acesso que a busca tolerante transforma em null.
    fs.readdirSync(dir);
    const file = findPersistenceFile(dir, USAGE_KEY);
    if (!file) return { ok: false, error: 'not-found' };
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const reading = data?.value?.kind === 'present' ? data.value.reading : null;
    const usage = reading?.usage;
    return { ok: true, percentUsed: numberOrNull(usage?.percentUsed),
      wouldRefuseSend: usage?.wouldRefuseSend === true,
      nextResetMs: numberOrNull(usage?.nextResetMs), readAtMs: numberOrNull(reading?.readAtMs),
      planLabel: typeof usage?.grokPlanLabel === 'string' ? usage.grokPlanLabel : null };
  } catch (error) {
    return { ok: false, error: error.code === 'ENOENT' ? 'not-found' : 'unreadable' };
  }
}

function isBlocked(usage, nowMs) {
  return Boolean(usage?.ok && usage.wouldRefuseSend === true
    && (usage.nextResetMs === null || usage.nextResetMs > nowMs));
}

function formatReset(nextResetMs, nowMs) {
  if (nextResetMs === null) return 'em breve';
  const reset = new Date(nextResetMs);
  const now = new Date(nowMs);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sameDay = (date) => reset.toDateString() === date.toDateString();
  const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(reset);
  const day = sameDay(now) ? 'hoje' : sameDay(tomorrow) ? 'amanhã'
    : `${new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(reset)}, ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(reset)}`;
  return `${day} às ${time}`;
}

module.exports = { readUsage, isBlocked, formatReset };
