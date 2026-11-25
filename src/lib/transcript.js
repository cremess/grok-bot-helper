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

// Decides delivery and reply for a sent prompt. With a baseline read before sending, an entry counts
// only if its id is new and it isn't older than the newest entry already there. Both checks use Grok
// Bot's own data, so a clock difference with this PC doesn't matter, and an old entry rewritten with
// a new id is still ignored. Entries without a timestamp are judged by id alone.
// Without a baseline it falls back to the send time. With `expectPrefix` (a part like "(2/3)"), only a
// user message starting with it counts as delivered, so a message typed in Grok Bot meanwhile doesn't.
function replyState(entries, { knownIds, knownUntilMs = 0, afterMs, expectPrefix } = {}) {
  const ours = (entry) => entry.role === 'user'
    && (typeof expectPrefix !== 'string' || entry.text.startsWith(expectPrefix));
  const isNew = (entry) => !knownIds.has(entry.id) && (entry.timestampMs === 0 || entry.timestampMs > knownUntilMs);
  const fresh = knownIds instanceof Set ? entries.filter(isNew) : null;
  if (typeof expectPrefix === 'string') {
    // A delayed disk write can contain replies to earlier parts of the same send.
    const candidates = fresh ?? entries.filter((entry) => entry.timestampMs >= (afterMs ?? 0));
    const index = candidates.findIndex(ours);
    return { delivered: index >= 0, reply: index >= 0 ? latestReply(candidates.slice(index + 1)) : null };
  }
  if (fresh) {
    return { delivered: fresh.some(ours), reply: latestReply(fresh) };
  }
  const since = afterMs ?? 0;
  return { delivered: entries.some((entry) => ours(entry) && entry.timestampMs >= since),
    reply: latestReply(entries, { afterMs }) };
}

function grokWaitPhase(request, now = Date.now()) {
  if (!request || request.reply) return undefined;
  if (!request.delivered) return 'awaiting-delivery';
  if (request.autoSent) return now - request.waitStartedAt >= 20000 ? 'sent-with-hint' : 'sent';
  return undefined;
}

const REPLY_SETTLE_MS = 4000;
const NOT_DELIVERED_MS = 120000;
const REPLY_TIMEOUT_MS = 10 * 60 * 1000;

// Remembers when the transcript file last changed, using the local clock for "when". Takes the result of
// readConversation. A file that can't be parsed is usually being written by Grok Bot, so it counts as a
// change; a missing file or agent doesn't, otherwise a transcript that disappears would never look quiet.
function trackTranscriptChange(previous, read, nowMs) {
  const mtimeMs = read?.ok ? read.mtimeMs : undefined;
  const known = typeof mtimeMs === 'number' && Number.isFinite(mtimeMs);
  if (previous && known && mtimeMs === previous.mtimeMs) return previous;
  if (previous && !read?.ok && read?.error !== 'unreadable') return previous;
  return { mtimeMs: known ? mtimeMs : previous?.mtimeMs, changedAt: nowMs };
}

// Decides what the reply poll does next. A bot can answer one prompt with several messages, so the
// first reply doesn't end the wait: it keeps reading ('settling') until the transcript has been quiet
// for settleMs, or until the overall timeout. Without a reply it keeps the earlier rules: give up on
// delivery after notDeliveredMs, and stop waiting after timeoutMs.
// Returns 'waiting', 'settling', 'replied', 'not-delivered' or 'timed-out'.
function waitDecision({ delivered = false, hasReply = false, elapsedMs = 0, quietMs = 0,
  settleMs = REPLY_SETTLE_MS, notDeliveredMs = NOT_DELIVERED_MS, timeoutMs = REPLY_TIMEOUT_MS } = {}) {
  if (hasReply) return quietMs >= settleMs || elapsedMs >= timeoutMs ? 'replied' : 'settling';
  if (!delivered && elapsedMs >= notDeliveredMs) return 'not-delivered';
  if (elapsedMs >= timeoutMs) return 'timed-out';
  return 'waiting';
}

module.exports = { replyState, escapeRegex, resolveAgentId, findTranscriptFile, parseTranscript,
  readConversation, latestReply, recentExchanges, userMessageSince, trackTranscriptChange, waitDecision,
  grokWaitPhase, REPLY_SETTLE_MS, NOT_DELIVERED_MS, REPLY_TIMEOUT_MS };
