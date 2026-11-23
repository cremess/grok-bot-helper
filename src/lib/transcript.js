const fs = require('node:fs');
const { isValidBotId } = require('./link');
const { findPersistenceFile } = require('./roster');

const LAST_AGENT_KEY = /^sand\.client\.slice\.account\..+\.selection\.last-agent$/;

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveAgentId(dir, botId) {
  if (typeof botId === 'string' && botId.length) return botId;
  try {
    const file = findPersistenceFile(dir, LAST_AGENT_KEY);
    if (!file) return null;
    const id = JSON.parse(fs.readFileSync(file, 'utf8'))?.value?.agentId;
    return isValidBotId(id) ? id : null;
  } catch {
    return null;
  }
}

function findTranscriptFile(dir, agentId) {
  if (typeof agentId !== 'string' || !agentId) return null;
  return findPersistenceFile(dir,
    new RegExp(`^sand\\.client\\.slice\\.account\\..+\\.transcript\\.replicas\\.${escapeRegex(agentId)}$`));
}

const numeric = (value) => typeof value === 'number' && Number.isFinite(value) ? value : 0;

function parseTranscript(json) {
  try {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!Array.isArray(data?.value?.entries)) return [];
    return data.value.entries.flatMap((entry) => {
      if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) return [];
      let role;
      let text;
      if (entry.kind === 'message' && entry.role === 'user') {
        role = 'user';
        text = entry.content;
      } else if (entry.kind === 'send-message' && entry.message?.type === 'text') {
        role = 'bot';
        text = entry.message.content;
      }
      if (typeof text !== 'string' || !text.trim()) return [];
      return [{ id: entry.id, role, text: text.trim(),
        timestampMs: numeric(entry.timestampMs), seq: numeric(entry.seq) }];
    }).sort((a, b) => a.seq - b.seq || a.timestampMs - b.timestampMs)
      .map(({ seq, ...entry }) => entry);
  } catch {
    return [];
  }
}

function readConversation(dir, botId) {
  const agentId = resolveAgentId(dir, botId);
  if (!agentId) return { ok: false, error: 'no-agent' };
  const file = findTranscriptFile(dir, agentId);
  if (!file) return { ok: false, error: 'not-found' };
  try {
    // A file caught mid-write fails to parse; report it instead of an empty conversation.
    const entries = parseTranscript(JSON.parse(fs.readFileSync(file, 'utf8')));
    return { ok: true, agentId, entries, mtimeMs: fs.statSync(file).mtimeMs };
  } catch {
    return { ok: false, error: 'unreadable' };
  }
}

function latestReply(entries, { afterMs } = {}) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.role === 'bot' && (afterMs === undefined || entry.timestampMs > afterMs)) return entry;
  }
  return null;
}

function recentExchanges(entries, limit = 6) {
  return Number.isInteger(limit) && limit > 0 ? entries.slice(-limit) : [];
}

function userMessageSince(entries, afterMs) {
  return entries.some((entry) => entry.role === 'user' && entry.timestampMs >= afterMs);
}

// Decides delivery and reply for a sent prompt. With a baseline of entry ids read before sending,
// only entries that are new count, so an older reply or a clock skew can't be mistaken for the answer.
// Without a baseline it falls back to the send time.
function replyState(entries, { knownIds, afterMs } = {}) {
  const fresh = knownIds instanceof Set ? entries.filter((entry) => !knownIds.has(entry.id)) : null;
  if (fresh) {
    return { delivered: fresh.some((entry) => entry.role === 'user'),
      reply: latestReply(fresh) };
  }
  return { delivered: userMessageSince(entries, afterMs ?? 0), reply: latestReply(entries, { afterMs }) };
}

module.exports = { replyState, escapeRegex, resolveAgentId, findTranscriptFile, parseTranscript,
  readConversation, latestReply, recentExchanges, userMessageSince };
