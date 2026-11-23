(() => {
  const { t, intlLocale } = typeof module !== 'undefined' && module.exports ? require('./i18n') : globalThis;

  function relativeTime(timestampMs, nowMs = Date.now()) {
    const date = new Date(timestampMs);
    const now = new Date(nowMs);
    const seconds = Math.max(0, (nowMs - timestampMs) / 1000);
    if (seconds < 60) return t('time.justNow');
    if (seconds < 3600) return t('time.minutesAgo', { count: Math.floor(seconds / 60) });
    const sameDay = (a, b) => a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (sameDay(date, now)) return t('time.hoursAgo', { count: Math.floor(seconds / 3600) });
    const time = new Intl.DateTimeFormat(intlLocale(), { hour: 'numeric', minute: '2-digit' }).format(date);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (sameDay(date, yesterday)) return t('time.yesterday', { time });
    const day = new Intl.DateTimeFormat(intlLocale(), { month: 'short', day: 'numeric' }).format(date);
    return t('time.date', { date: day, time });
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { relativeTime };
  else globalThis.relativeTime = relativeTime;
})();
