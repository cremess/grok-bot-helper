const { t, intlLocale } = require('./i18n');
const fs = require('node:fs');
const { findPersistenceFile } = require('./roster');

const USAGE_KEY = /^sand\.client\.slice\.account\..+\.weekly-usage\.cache$/;
const numberOrNull = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;

function readUsage(dir) {
  try {
    // Preserve access errors that tolerant search turns into null.
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
  if (nextResetMs === null) return t('usage.soon');
  const reset = new Date(nextResetMs);
  const now = new Date(nowMs);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sameDay = (date) => reset.toDateString() === date.toDateString();
  const locale = intlLocale();
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(reset);
  const day = sameDay(now) ? t('usage.today') : sameDay(tomorrow) ? t('usage.tomorrow')
    : new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' }).format(reset);
  return t('usage.reset', { day, time });
}

module.exports = { readUsage, isBlocked, formatReset };
