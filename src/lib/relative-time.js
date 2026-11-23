function relativeTime(timestampMs, nowMs = Date.now()) {
  const date = new Date(timestampMs);
  const now = new Date(nowMs);
  const seconds = Math.max(0, (nowMs - timestampMs) / 1000);
  if (seconds < 60) return 'agora';
  if (seconds < 3600) return `há ${Math.floor(seconds / 60)} min`;
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, now)) return `há ${Math.floor(seconds / 3600)} h`;
  const pad = (value) => String(value).padStart(2, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(date, yesterday)) return `ontem, ${time}`;
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}, ${time}`;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { relativeTime };
else globalThis.relativeTime = relativeTime;
