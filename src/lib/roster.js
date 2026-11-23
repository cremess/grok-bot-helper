const fs = require('node:fs');
const path = require('node:path');
const { isValidBotId } = require('./link');

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const ROSTER_KEY = /^sand\.client\.slice\.account\..+\.roster\.last-roster$/;

function decodeBase32(text) {
  if (typeof text !== 'string' || /[^a-z2-7]/i.test(text)) return null;
  let buffer = 0;
  let bits = 0;
  const bytes = [];
  for (const character of text.toLowerCase()) {
    buffer = (buffer << 5) | ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
    }
    buffer &= (1 << bits) - 1;
  }
  return Buffer.from(bytes).toString('utf8');
}

function encodeBase32(text) {
  let buffer = 0;
  let bits = 0;
  let encoded = '';
  for (const byte of Buffer.from(text, 'utf8')) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += ALPHABET[(buffer >>> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits) encoded += ALPHABET[(buffer << (5 - bits)) & 31];
  return encoded;
}

// Preserve access errors internally so listBots can distinguish read failures.
function locatePersistenceFile(dir, keyRegex) {
  let newest = null;
  let newestTime = -Infinity;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.blob')) continue;
    const key = decodeBase32(entry.name.slice(0, -5));
    if (key === null) continue;
    keyRegex.lastIndex = 0;
    if (!keyRegex.test(key)) continue;
    const filePath = path.resolve(dir, entry.name);
    const modified = fs.statSync(filePath).mtimeMs;
    if (modified > newestTime) {
      newest = filePath;
      newestTime = modified;
    }
  }
  return newest;
}

function findPersistenceFile(dir, keyRegex) {
  try {
    return locatePersistenceFile(dir, keyRegex);
  } catch {
    return null;
  }
}

function findRosterFile(dir) {
  return findPersistenceFile(dir, ROSTER_KEY);
}

function parseRoster(json) {
  try {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!Array.isArray(data?.value?.rows)) return [];
    const rows = data.value.rows
      .filter((row) => row && isValidBotId(row.id)
        && typeof row.name === 'string' && row.name.trim()
        && row.isRemovedFromSidebar !== true && row.isGroup !== true)
      .map((row) => ({
        id: row.id,
        name: row.name.trim().slice(0, 80),
        color: typeof row.avatarColor === 'string' && row.avatarColor.trim()
          ? row.avatarColor : null,
        activity: typeof row.lastActivityAt === 'number' && Number.isFinite(row.lastActivityAt)
          ? row.lastActivityAt : 0,
      }))
      .sort((a, b) => b.activity - a.activity || a.name.localeCompare(b.name, 'en-US'));
    const seen = new Set();
    return rows.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    }).map(({ id, name, color }) => ({ id, name, color }));
  } catch {
    return [];
  }
}

function listBots(dir) {
  try {
    const filePath = locatePersistenceFile(dir, ROSTER_KEY);
    if (!filePath) return { ok: false, error: 'not-found' };
    return { ok: true, bots: parseRoster(fs.readFileSync(filePath, 'utf8')) };
  } catch (error) {
    return { ok: false, error: error.code === 'ENOENT' ? 'not-found' : 'unreadable' };
  }
}

module.exports = { decodeBase32, encodeBase32, findPersistenceFile, findRosterFile, parseRoster, listBots };
