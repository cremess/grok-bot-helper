const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { encodeBase32, findPersistenceFile } = require('../src/lib/roster');
const { escapeRegex, resolveAgentId, findTranscriptFile, parseTranscript,
  readConversation, latestReply, recentExchanges, userMessageSince } = require('../src/lib/transcript');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-transcript-'));
after(() => {
  const resolved = path.resolve(root);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('grokbot-transcript-'));
  fs.rmSync(resolved, { recursive: true, force: true });
});
function directory(name) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  return dir;
}
function blob(dir, suffix, data, account = 'a') {
  const file = path.join(dir, `${encodeBase32(`sand.client.slice.account.${account}.${suffix}`)}.blob`);
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data), 'utf8');
  return file;
}
const user = (id, seq, timestampMs, content = ' question ') =>
  ({ kind: 'message', role: 'user', id, seq, timestampMs, content });
const bot = (id, seq, timestampMs, content = ' reply ') =>
  ({ kind: 'send-message', id, seq, timestampMs, message: { type: 'text', content } });
const transcript = (entries) => ({ schemaVersion: 1, value: { entries } });

test('userMessageSince considers only user messages with an inclusive cutoff', () => {
  const entries = parseTranscript(transcript([user('u', 1, 100), bot('b', 2, 200)]));
  assert.equal(userMessageSince(entries, 99), true);
  assert.equal(userMessageSince(entries, 100), true);
  assert.equal(userMessageSince(entries, 101), false);
  assert.equal(userMessageSince(entries, 200), false);
  assert.equal(userMessageSince([], 0), false);
});

test('generic search selects the latest blob and handles invalid directories or regexes without throwing', () => {
  const dir = directory('generic');
  const first = blob(dir, 'selection.last-agent', {}, 'a');
  const second = blob(dir, 'selection.last-agent', {}, 'b');
  fs.utimesSync(first, 100, 100);
  fs.utimesSync(second, 200, 200);
  fs.writeFileSync(path.join(dir, 'invalid!.blob'), '{}');
  const regex = /\.selection\.last-agent$/g;
  assert.equal(findPersistenceFile(dir, regex), second);
  assert.equal(findPersistenceFile(dir, regex), second);
  assert.equal(findPersistenceFile(path.join(dir, 'missing'), regex), null);
  assert.equal(findPersistenceFile(dir, null), null);
});

test('finds the exact bot conversation across accounts and escapes metacharacters', () => {
  const dir = directory('conversations');
  blob(dir, 'transcript.replicas.other', transcript([]));
  blob(dir, 'transcript.replicas.botX1', transcript([]));
  const older = blob(dir, 'transcript.replicas.bot.1', transcript([]));
  const newer = blob(dir, 'transcript.replicas.bot.1', transcript([bot('b', 1, 10)]), 'b');
  fs.utimesSync(older, 100, 100);
  fs.utimesSync(newer, 200, 200);
  assert.equal(findTranscriptFile(dir, 'bot.1'), newer);
  assert.equal(findTranscriptFile(dir, ''), null);
  assert.equal(findTranscriptFile(dir, null), null);
  const special = 'a.*+?^${}()|[]\\';
  assert.ok(new RegExp(`^${escapeRegex(special)}$`).test(special));
  assert.deepEqual(readConversation(dir, 'bot.1'), {
    ok: true, agentId: 'bot.1', entries: [{ id: 'b', role: 'bot', text: 'reply', timestampMs: 10 }],
    mtimeMs: fs.statSync(newer).mtimeMs,
  });
});

test('resolves last-agent with a valid ID and prioritizes an explicit bot', () => {
  const dir = directory('selection');
  const file = blob(dir, 'selection.last-agent', { schemaVersion: 1, value: { agentId: 'bot_1' } });
  blob(dir, 'transcript.replicas.bot_1', transcript([]));
  assert.equal(resolveAgentId(dir, ''), 'bot_1');
  assert.equal(resolveAgentId(dir, 'other'), 'other');
  assert.equal(readConversation(dir, '').agentId, 'bot_1');
  for (const data of ['{', '{}', '{"value":{"agentId":"invalid space"}}']) {
    fs.writeFileSync(file, data);
    assert.equal(resolveAgentId(dir, ''), null);
    assert.deepEqual(readConversation(dir, ''), { ok: false, error: 'no-agent' });
  }
});

test('missing files and broken JSON produce predictable results', () => {
  const dir = directory('absence');
  assert.deepEqual(readConversation(dir, ''), { ok: false, error: 'no-agent' });
  assert.deepEqual(readConversation(dir, 'bot'), { ok: false, error: 'not-found' });
  const file = blob(dir, 'transcript.replicas.bot', '{');
  assert.deepEqual(readConversation(dir, 'bot'), {
    ok: true, agentId: 'bot', entries: [], mtimeMs: fs.statSync(file).mtimeMs,
  });
});

test('conversation read errors return unreadable and selection read errors return no-agent', (t) => {
  const dir = directory('reading');
  blob(dir, 'transcript.replicas.bot', '{}');
  blob(dir, 'selection.last-agent', { value: { agentId: 'bot' } });
  t.mock.method(fs, 'readFileSync', () => { throw Object.assign(new Error('Access denied'), { code: 'EACCES' }); });
  assert.deepEqual(readConversation(dir, 'bot'), { ok: false, error: 'unreadable' });
  assert.equal(resolveAgentId(dir, ''), null);
});

test('filters entries, trims text and sorts by seq with timestamp tie-breaking', () => {
  const entries = [bot('b', 2, 30), user('u', 2, 20), user('first', 1),
    null, {}, user('empty', 4, 40, ' '), bot('number', 4, 40, 42),
    { ...user('assistant', 4, 40), role: 'assistant' },
    ...['widget', 'attachment'].map((type) => ({ ...bot(type, 4, 40), message: { type, content: {} } })),
    { kind: 'user-attachment', id: 'attachment' }, { kind: 'event', id: 'event' },
    { ...user('no-id', 4, 40), id: undefined }];
  const expected = [
    { id: 'first', role: 'user', text: 'question', timestampMs: 0 },
    { id: 'u', role: 'user', text: 'question', timestampMs: 20 },
    { id: 'b', role: 'bot', text: 'reply', timestampMs: 30 },
  ];
  assert.deepEqual(parseTranscript(transcript(entries)), expected);
  assert.deepEqual(parseTranscript(JSON.stringify(transcript(entries))), expected);
  assert.equal(entries[0].message.content, ' reply ');
  for (const json of ['{', '', null, undefined, {}, { value: { entries: {} } }]) {
    assert.deepEqual(parseTranscript(json), []);
  }
  for (const timestamp of ['10', NaN, Infinity, null]) {
    assert.equal(parseTranscript(transcript([bot('b', 1, timestamp)]))[0].timestampMs, 0);
  }
});

test('latestReply respects conversation order and strict cutoffs; recentExchanges limits without mutation', () => {
  const entries = parseTranscript(transcript([user('u1', 1, 1), bot('b1', 2, 2),
    user('u2', 3, 3), bot('b2', 4, 4), user('u3', 5, 5), bot('b3', 6, 6), user('u4', 7, 7)]));
  assert.equal(latestReply(entries), entries[5]);
  assert.equal(latestReply(entries, { afterMs: 4 }), entries[5]);
  assert.equal(latestReply(entries, { afterMs: 6 }), null);
  assert.equal(latestReply([], { afterMs: 0 }), null);
  assert.equal(latestReply([entries[0]]), null);
  assert.deepEqual(recentExchanges(entries), entries.slice(1));
  assert.deepEqual(recentExchanges(entries, 2), entries.slice(5));
  assert.deepEqual(recentExchanges(entries, 20), entries);
  assert.deepEqual(recentExchanges(entries, 0), []);
  assert.deepEqual(recentExchanges([], 3), []);
  assert.equal(entries.length, 7);
});
