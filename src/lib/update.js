// Pure helpers for the optional update check. It is the app's only network access: one GET to the
// public GitHub releases API, at most once a day, only when the user turned it on. Nothing about the
// user is sent and only `tag_name` and `html_url` are read from the answer.

const REPOSITORY = 'cremess/grok-bot-helper';
const RELEASES_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_TIMEOUT_MS = 10000;

const VERSION_PATTERN = /^v?(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;

// Parses "1.2.3", "v1.2.3" or "1.2.3-beta.1" (semver); returns null for anything else.
function parseVersion(value) {
  if (typeof value !== 'string' || value.length > 64) return null;
  const match = VERSION_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, major, minor, patch, prerelease] = match;
  const pre = prerelease ? prerelease.split('.') : [];
  if (pre.some((part) => /^0\d+$/.test(part))) return null;
  return { major: Number(major), minor: Number(minor), patch: Number(patch), prerelease: pre,
    text: `${major}.${minor}.${patch}${prerelease ? `-${prerelease}` : ''}` };
}

function compareIdentifiers(a, b) {
  const numericA = /^\d+$/.test(a);
  const numericB = /^\d+$/.test(b);
  if (numericA && numericB) return Math.sign(Number(a) - Number(b));
  if (numericA !== numericB) return numericA ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

// Semver precedence: -1, 0 or 1. Build metadata is ignored; a prerelease comes before its release.
function compareVersions(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return Math.sign(a[key] - b[key]);
  }
  if (!a.prerelease.length || !b.prerelease.length) {
    return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length ? -1 : 1;
  }
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    if (a.prerelease[index] === undefined) return -1;
    if (b.prerelease[index] === undefined) return 1;
    const result = compareIdentifiers(a.prerelease[index], b.prerelease[index]);
    if (result) return result;
  }
  return 0;
}

function isNewerVersion(latest, current) {
  const next = parseVersion(latest);
  const installed = parseVersion(current);
  return Boolean(next && installed && compareVersions(next, installed) > 0);
}

// Only this project's release pages on github.com may be opened from the update notice.
function isSafeReleaseUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com' && url.port === ''
      && !url.username && !url.password
      && url.pathname.toLowerCase().startsWith(`/${REPOSITORY.toLowerCase()}/releases/`);
  } catch {
    return false;
  }
}

// Reads only tag_name and html_url from the API answer.
function parseRelease(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const version = parseVersion(data.tag_name);
  if (!version || !isSafeReleaseUrl(data.html_url)) return null;
  return { version: version.text, url: data.html_url };
}

// What to show, if anything: a release newer than the running version, with a safe page to open.
function updateNotice(data, currentVersion) {
  const release = parseRelease(data);
  return release && isNewerVersion(release.version, currentVersion) ? release : null;
}

// At most once a day, counting failed checks too. A last check in the future (the clock moved back)
// doesn't block checking forever.
function shouldCheckForUpdate({ enabled, lastCheckMs, nowMs, intervalMs = UPDATE_INTERVAL_MS }) {
  if (enabled !== true) return false;
  if (typeof lastCheckMs !== 'number' || !Number.isFinite(lastCheckMs) || lastCheckMs <= 0) return true;
  return nowMs - lastCheckMs >= intervalMs || lastCheckMs > nowMs + 60 * 1000;
}

module.exports = { REPOSITORY, RELEASES_URL, UPDATE_INTERVAL_MS, UPDATE_TIMEOUT_MS, parseVersion, compareVersions,
  isNewerVersion, isSafeReleaseUrl, parseRelease, updateNotice, shouldCheckForUpdate };
