// Shared rules for the three places the prompt can send to: Grok Bot (deep links, 1000 characters),
// OpenBot (local API) and Hermes (local CLI). Conversations with OpenBot and Hermes live only in memory
// for this run of the app; nothing here touches the disk.

const ASSISTANTS = ['grokbot', 'openbot', 'hermes'];
const GROK_BOT_TEXT_LENGTH = 1000;
// OpenBot and Hermes take long messages in one go, so there are no parts; this only stops a paste by mistake.
const MAX_ASSISTANT_TEXT_LENGTH = 20000;
const MAX_LOG_ENTRIES = 100;
const CONVERSATION_ENTRIES = 12;
const DEFAULT_REPLY_TIMEOUT_MINUTES = 10;
const MIN_REPLY_TIMEOUT_MINUTES = 1;
const MAX_REPLY_TIMEOUT_MINUTES = 120;

function isAssistant(value) {
  return ASSISTANTS.includes(value);
}

function textLimit(assistant) {
  return assistant === 'openbot' || assistant === 'hermes' ? MAX_ASSISTANT_TEXT_LENGTH : GROK_BOT_TEXT_LENGTH;
}

function validateAssistantText(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'empty' };
  const trimmed = text.trim();
  if ([...trimmed].length > MAX_ASSISTANT_TEXT_LENGTH) return { ok: false, error: 'too-long', max: MAX_ASSISTANT_TEXT_LENGTH };
  return { ok: true, text: trimmed };
}

function isValidReplyTimeout(minutes) {
  return Number.isInteger(minutes) && minutes >= MIN_REPLY_TIMEOUT_MINUTES && minutes <= MAX_REPLY_TIMEOUT_MINUTES;
}

function replyTimeoutMs(minutes) {
  return (isValidReplyTimeout(minutes) ? minutes : DEFAULT_REPLY_TIMEOUT_MINUTES) * 60 * 1000;
}

// The in-memory conversation a message belongs to: one per OpenBot agent, one for Hermes.
function conversationKey(settings) {
  if (settings?.assistant === 'openbot') return settings.openbotAgentId ? `openbot:${settings.openbotAgentId}` : null;
  if (settings?.assistant === 'hermes') return 'hermes';
  return null;
}

// Adds a message ({ role: 'user' | 'bot', text, timestampMs }) and keeps the last MAX_LOG_ENTRIES.
// Returns a new array; ids are unique within the log.
function addEntry(log, { role, text, timestampMs }) {
  const entries = Array.isArray(log) ? log : [];
  const last = entries[entries.length - 1];
  const id = `local-${(last ? Number(String(last.id).slice(6)) || 0 : 0) + 1}`;
  return [...entries, { id, role: role === 'user' ? 'user' : 'bot', text: String(text), timestampMs }].slice(-MAX_LOG_ENTRIES);
}

// The same shape the prompt gets for Grok Bot: the recent entries and the latest reply.
function conversationFromLog(log, limit = CONVERSATION_ENTRIES) {
  const entries = Array.isArray(log) ? log : [];
  let latest = null;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index].role === 'bot') {
      latest = entries[index];
      break;
    }
  }
  return { ok: true, entries: entries.slice(-limit), latest };
}

// One OpenBot or Hermes turn per conversation. A turn is registered before anything is sent, so a second
// send to the same conversation is refused while the first is being sent, waited on or stopped, and only
// the turn itself can free its conversation (a late finish of an older turn can't free a newer one).
function createTurnRegistry() {
  const turns = new Map();
  return {
    start(key, turn) {
      if (typeof key !== 'string' || !key || !turn || turns.has(key)) return false;
      turns.set(key, turn);
      return true;
    },
    get(key) {
      return turns.get(key);
    },
    // The turn the prompt shows as waiting: a stopped turn stays registered until it really ended.
    active(key) {
      const turn = turns.get(key);
      return turn && !turn.cancelled ? turn : undefined;
    },
    release(key, turn) {
      if (turns.get(key) !== turn) return false;
      turns.delete(key);
      return true;
    },
    all() {
      return [...turns.values()];
    },
  };
}

module.exports = {
  ASSISTANTS,
  GROK_BOT_TEXT_LENGTH,
  MAX_ASSISTANT_TEXT_LENGTH,
  DEFAULT_REPLY_TIMEOUT_MINUTES,
  MIN_REPLY_TIMEOUT_MINUTES,
  MAX_REPLY_TIMEOUT_MINUTES,
  isAssistant,
  textLimit,
  validateAssistantText,
  isValidReplyTimeout,
  replyTimeoutMs,
  conversationKey,
  addEntry,
  conversationFromLog,
  createTurnRegistry,
};
