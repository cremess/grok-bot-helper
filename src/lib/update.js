function isLoopbackFeed(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f\\]/.test(value)) return false;
  // Match the literal authority so URL normalization cannot hide credentials or an alternate address.
  const authority = /^http:\/\/(?:127\.0\.0\.1|localhost):(\d{1,5})(?:\/|$)/i.exec(value);
  return Boolean(authority && Number(authority[1]) > 0 && URL.canParse(value));
}

module.exports = { isLoopbackFeed };
