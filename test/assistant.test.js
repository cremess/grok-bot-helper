const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ASSISTANTS, isAssistant, textLimit, validateAssistantText, isValidReplyTimeout, replyTimeoutMs, conversationKey,
  addEntry, conversationFromLog, createTurnRegistry,
} = require('../src/lib/assistant');

test('three destinations, Grok Bot first', () => {
  assert.deepEqual(ASSISTANTS, ['grokbot', 'openbot', 'hermes']);
  for (const value of ASSISTANTS) assert.equal(isAssistant(value), true);
  for (const value of ['', 'Grokbot', 'other', null, undefined, 0]) assert.equal(isAssistant(value), false);
});

test('Grok Bot keeps its 1000 characters; OpenBot and Hermes take up to 20 000', () => {
  assert.equal(textLimit('grokbot'), 1000);
  assert.equal(textLimit(undefined), 1000);
  assert.equal(textLimit('openbot'), 20000);
  assert.equal(textLimit('hermes'), 20000);
  assert.deepEqual(validateAssistantText('  Hi  '), { ok: true, text: 'Hi' });
  assert.deepEqual(validateAssistantText('   '), { ok: false, error: 'empty' });
  assert.deepEqual(validateAssistantText(null), { ok: false, error: 'empty' });
  assert.equal(validateAssistantText('a'.repeat(20000)).ok, true);
  // Emoji count as one character, as in the counter.
  assert.equal(validateAssistantText('🎉'.repeat(20000)).ok, true);
  assert.deepEqual(validateAssistantText('a'.repeat(20001)), { ok: false, error: 'too-long', max: 20000 });
});

test('the reply timeout is a whole number of minutes from 1 to 120, 10 by default', () => {
  for (const value of [1, 10, 120]) assert.equal(isValidReplyTimeout(value), true);
  for (const value of [0, 121, 1.5, '10', null, NaN]) assert.equal(isValidReplyTimeout(value), false);
  assert.equal(replyTimeoutMs(3), 180000);
  assert.equal(replyTimeoutMs(0), 600000);
  assert.equal(replyTimeoutMs(undefined), 600000);
});

test('each OpenBot agent and Hermes have their own in-memory conversation', () => {
  assert.equal(conversationKey({ assistant: 'grokbot', openbotAgentId: 'a' }), null);
  assert.equal(conversationKey({ assistant: 'openbot', openbotAgentId: 'agent-1' }), 'openbot:agent-1');
  assert.equal(conversationKey({ assistant: 'openbot', openbotAgentId: '' }), null);
  assert.equal(conversationKey({ assistant: 'hermes' }), 'hermes');
  assert.equal(conversationKey(undefined), null);
});

test('the log keeps unique ids, the last 100 entries and gives the latest reply', () => {
  let log = [];
  assert.deepEqual(conversationFromLog(log), { ok: true, entries: [], latest: null });
  log = addEntry(log, { role: 'user', text: 'Hi', timestampMs: 1 });
  assert.deepEqual(conversationFromLog(log).latest, null);
  log = addEntry(log, { role: 'bot', text: 'Hello', timestampMs: 2 });
  log = addEntry(log, { role: 'user', text: 'More?', timestampMs: 3 });
  assert.deepEqual(log.map((entry) => entry.id), ['local-1', 'local-2', 'local-3']);
  assert.deepEqual(conversationFromLog(log).latest, { id: 'local-2', role: 'bot', text: 'Hello', timestampMs: 2 });
  assert.equal(addEntry(log, { role: 'anything', text: 5, timestampMs: 4 }).at(-1).role, 'bot');
  for (let index = 0; index < 150; index += 1) log = addEntry(log, { role: index % 2 ? 'bot' : 'user', text: String(index), timestampMs: index });
  assert.equal(log.length, 100);
  assert.equal(new Set(log.map((entry) => entry.id)).size, 100);
  assert.equal(conversationFromLog(log).entries.length, 12);
  assert.equal(conversationFromLog(log, 4).entries.length, 4);
  assert.equal(conversationFromLog(undefined).ok, true);
});

test('one turn per conversation, registered before sending and freed only by itself', () => {
  const turns = createTurnRegistry();
  const first = { cancelled: false };
  assert.equal(turns.start('openbot:agent-1', first), true);
  // A second send to the same agent is refused while the first is still being sent.
  assert.equal(turns.start('openbot:agent-1', { cancelled: false }), false);
  // Other conversations are independent.
  const hermes = { cancelled: false };
  assert.equal(turns.start('hermes', hermes), true);
  assert.equal(turns.active('openbot:agent-1'), first);
  // A stopped turn no longer shows as waiting but keeps the conversation until it ended.
  first.cancelled = true;
  assert.equal(turns.active('openbot:agent-1'), undefined);
  assert.equal(turns.get('openbot:agent-1'), first);
  assert.equal(turns.start('openbot:agent-1', { cancelled: false }), false);
  // Only the turn itself frees it.
  assert.equal(turns.release('openbot:agent-1', { cancelled: false }), false);
  assert.equal(turns.release('openbot:agent-1', first), true);
  assert.equal(turns.release('openbot:agent-1', first), false);
  const second = { cancelled: false };
  assert.equal(turns.start('openbot:agent-1', second), true);
  // The late end of the first turn can't free the second one.
  assert.equal(turns.release('openbot:agent-1', first), false);
  assert.equal(turns.get('openbot:agent-1'), second);
  assert.deepEqual(turns.all(), [hermes, second]);
  assert.equal(turns.start('', {}), false);
  assert.equal(turns.start(null, {}), false);
  assert.equal(turns.start('x', undefined), false);
});
