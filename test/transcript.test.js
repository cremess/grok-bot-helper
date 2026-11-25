const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { encodeBase32, findPersistenceFile } = require('../src/lib/roster');
const { escapeRegex, resolveAgentId, findTranscriptFile, parseTranscript,
  readConversation, latestReply, recentExchanges, userMessageSince, replyState, trackTranscriptChange,
  grokWaitPhase, waitDecision, REPLY_SETTLE_MS, NOT_DELIVERED_MS, REPLY_TIMEOUT_MS } = require('../src/lib/transcript');

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
  blob(dir, 'transcript.replicas.bot', '{');
  // A truncated file (caught mid-write) must not look like an empty conversation.
  assert.deepEqual(readConversation(dir, 'bot'), { ok: false, error: 'unreadable' });
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

test('replyState only counts entries that are new since the send', () => {
  const before = parseTranscript(transcript([user('u1', 1, 8000), bot('b1', 2, 8500)]));
  const knownIds = new Set(before.map((entry) => entry.id));
  // The previous reply (8500) lands just before a new send at 10000.
  assert.deepEqual(replyState(before, { knownIds, afterMs: 8000 }), { delivered: false, reply: null });
  const delivered = parseTranscript(transcript([user('u1', 1, 8000), bot('b1', 2, 8500), user('u2', 3, 10000)]));
  assert.deepEqual(replyState(delivered, { knownIds, afterMs: 8000 }), { delivered: true, reply: null });
  const answered = parseTranscript(transcript([user('u1', 1, 8000), bot('b1', 2, 8500),
    user('u2', 3, 10000), bot('b2', 4, 11000)]));
  const state = replyState(answered, { knownIds, afterMs: 8000 });
  assert.equal(state.delivered, true);
  assert.equal(state.reply.id, 'b2');
});

test('replyState ignores clock skew when a baseline exists and falls back to time without one', () => {
  const entries = parseTranscript(transcript([user('u2', 3, 1000), bot('b2', 4, 1500)]));
  // Timestamps far behind the local clock still count as new entries.
  assert.equal(replyState(entries, { knownIds: new Set(), afterMs: 999999 }).reply.id, 'b2');
  assert.equal(replyState(entries, { afterMs: 999999 }).reply, null);
  assert.equal(replyState(entries, { afterMs: 1200 }).reply.id, 'b2');
});

test('replyState ignores an old entry rewritten with a new id', () => {
  const before = parseTranscript(transcript([user('u1', 1, 8000), bot('b1', 2, 8500)]));
  const knownIds = new Set(before.map((entry) => entry.id));
  const rewritten = parseTranscript(transcript([user('u1-final', 1, 8000), bot('b1-final', 2, 8500)]));
  assert.deepEqual(replyState(rewritten, { knownIds, knownUntilMs: 8500, afterMs: 0 }), { delivered: false, reply: null });
  const answered = parseTranscript(transcript([user('u1-final', 1, 8000), bot('b1-final', 2, 8500),
    user('u2', 3, 9000), bot('b2', 4, 9100)]));
  const state = replyState(answered, { knownIds, knownUntilMs: 8500, afterMs: 0 });
  assert.equal(state.delivered, true);
  assert.equal(state.reply.id, 'b2');
});

test('replyState judges entries without a timestamp by id alone', () => {
  const entries = parseTranscript(transcript([user('u2', 3, null), bot('b2', 4, null)]));
  const state = replyState(entries, { knownIds: new Set(['u1']), knownUntilMs: 0 });
  assert.equal(state.delivered, true);
  assert.equal(state.reply.id, 'b2');
});

test('trackTranscriptChange keeps the change time while mtime is stable and resets it on a change or a mid-write read', () => {
  const read = (mtimeMs) => ({ ok: true, entries: [], mtimeMs });
  const first = trackTranscriptChange(undefined, read(500), 1000);
  assert.deepEqual(first, { mtimeMs: 500, changedAt: 1000 });
  assert.strictEqual(trackTranscriptChange(first, read(500), 3000), first);
  assert.deepEqual(trackTranscriptChange(first, read(600), 3000), { mtimeMs: 600, changedAt: 3000 });
  // A file caught mid-write counts as a change and keeps the last known mtime.
  const failed = trackTranscriptChange(first, { ok: false, error: 'unreadable' }, 4000);
  assert.deepEqual(failed, { mtimeMs: 500, changedAt: 4000 });
  assert.strictEqual(trackTranscriptChange(failed, read(500), 6000), failed);
  for (const mtime of [NaN, Infinity, '500', null]) {
    assert.deepEqual(trackTranscriptChange(first, read(mtime), 7000), { mtimeMs: 500, changedAt: 7000 });
  }
  assert.deepEqual(trackTranscriptChange(undefined, { ok: false, error: 'unreadable' }, 10), { mtimeMs: undefined, changedAt: 10 });
});

test('trackTranscriptChange treats a missing transcript or agent as quiet, not as a change', () => {
  const first = trackTranscriptChange(undefined, { ok: true, mtimeMs: 500 }, 1000);
  for (const error of ['not-found', 'no-agent']) {
    assert.strictEqual(trackTranscriptChange(first, { ok: false, error }, 9000), first);
  }
  assert.strictEqual(trackTranscriptChange(first, undefined, 9000), first);
  assert.deepEqual(trackTranscriptChange(undefined, { ok: false, error: 'not-found' }, 20), { mtimeMs: undefined, changedAt: 20 });
});

test('waitDecision keeps reading after the first reply until the transcript is quiet', () => {
  assert.equal(REPLY_SETTLE_MS, 4000);
  const base = { delivered: true, hasReply: true, elapsedMs: 5000 };
  assert.equal(waitDecision({ ...base, quietMs: 0 }), 'settling');
  assert.equal(waitDecision({ ...base, quietMs: REPLY_SETTLE_MS - 1 }), 'settling');
  assert.equal(waitDecision({ ...base, quietMs: REPLY_SETTLE_MS }), 'replied');
  assert.equal(waitDecision({ ...base, quietMs: 1000, settleMs: 1000 }), 'replied');
  // A transcript that never settles still ends at the overall timeout, with the reply shown.
  assert.equal(waitDecision({ ...base, quietMs: 0, elapsedMs: REPLY_TIMEOUT_MS }), 'replied');
  // A reply means the message arrived, even if the user entry wasn't seen.
  assert.equal(waitDecision({ ...base, delivered: false, elapsedMs: NOT_DELIVERED_MS, quietMs: 0 }), 'settling');
});

test('waitDecision without a reply keeps the delivery and timeout rules', () => {
  assert.equal(NOT_DELIVERED_MS, 120000);
  assert.equal(waitDecision(), 'waiting');
  assert.equal(waitDecision({ delivered: false, elapsedMs: NOT_DELIVERED_MS - 1 }), 'waiting');
  assert.equal(waitDecision({ delivered: false, elapsedMs: NOT_DELIVERED_MS }), 'not-delivered');
  assert.equal(waitDecision({ delivered: true, elapsedMs: NOT_DELIVERED_MS }), 'waiting');
  assert.equal(waitDecision({ delivered: true, elapsedMs: REPLY_TIMEOUT_MS - 1, quietMs: 1e9 }), 'waiting');
  assert.equal(waitDecision({ delivered: true, elapsedMs: REPLY_TIMEOUT_MS }), 'timed-out');
  assert.equal(waitDecision({ delivered: false, elapsedMs: REPLY_TIMEOUT_MS }), 'not-delivered');
});

test('a bot answering with several messages is followed until it stops writing', () => {
  // Simulates the poll: one tick per second, two bot messages two seconds apart.
  const before = parseTranscript(transcript([user('u1', 1, 100), bot('b1', 2, 200)]));
  const request = { knownIds: new Set(before.map((entry) => entry.id)), knownUntilMs: 200 };
  const writes = { 0: [user('u2', 3, 300)], 2: [bot('b2', 4, 400)], 4: [bot('b3', 5, 500)] };
  let raw = [user('u1', 1, 100), bot('b1', 2, 200)];
  let mtime = 1;
  let watch;
  let seen = null;
  const shown = [];
  let status;
  let tick = 0;
  for (; tick < 30; tick += 1) {
    if (writes[tick]) { raw = [...raw, ...writes[tick]]; mtime += 1; }
    const state = replyState(parseTranscript(transcript(raw)), request);
    if (state.reply) seen = state.reply;
    const now = tick * 1000;
    watch = trackTranscriptChange(watch, { ok: true, mtimeMs: mtime }, now);
    status = waitDecision({ delivered: state.delivered, hasReply: Boolean(seen), elapsedMs: now,
      quietMs: now - watch.changedAt });
    if (status === 'settling' && shown.at(-1) !== seen.id) shown.push(seen.id);
    if (status !== 'waiting' && status !== 'settling') break;
  }
  assert.equal(status, 'replied');
  assert.deepEqual(shown, ['b2', 'b3']);
  assert.equal(seen.id, 'b3');
  assert.equal(tick, 4 + REPLY_SETTLE_MS / 1000);
});

test('confirmed sends show the lag hint after 20 seconds until a reply appears', () => {
  const request = { autoSent: true, delivered: true, waitStartedAt: 5000 };
  assert.equal(grokWaitPhase(request, 24999), 'sent');
  assert.equal(grokWaitPhase(request, 25000), 'sent-with-hint');
  assert.equal(grokWaitPhase({ ...request, reply: {} }, 25001), undefined);
  assert.equal(grokWaitPhase({ delivered: false }, 25000), 'awaiting-delivery');
  assert.equal(grokWaitPhase({ delivered: true }, 25000), undefined);
});

test('late replies to earlier parts do not finish the final reply wait', () => {
  const earlier = { id: 'b1', role: 'bot', text: 'First reply', timestampMs: 10 };
  const final = { id: 'u2', role: 'user', text: '(2/2) End', timestampMs: 20 };
  const answer = { ...earlier, id: 'b2', timestampMs: 30 };
  for (const baseline of [{ knownIds: new Set() }, { afterMs: 0 }]) {
    const request = { ...baseline, expectPrefix: '(2/2)' };
    assert.equal(replyState([earlier], request).reply, null);
    assert.deepEqual(replyState([earlier, final], request), { delivered: true, reply: null });
    assert.equal(replyState([earlier, final, answer], request).reply, answer);
  }
});

test('replyState with expectPrefix only counts the expected part as delivered', () => {
  const knownIds = new Set(['u1']);
  const typed = parseTranscript(transcript([user('u1', 1, 100), user('u2', 2, 200, 'something typed meanwhile')]));
  assert.equal(replyState(typed, { knownIds, knownUntilMs: 100, expectPrefix: '(2/3)' }).delivered, false);
  const part = parseTranscript(transcript([user('u1', 1, 100), user('u2', 2, 200, '(2/3) second part')]));
  assert.equal(replyState(part, { knownIds, knownUntilMs: 100, expectPrefix: '(2/3)' }).delivered, true);
  assert.equal(replyState(part, { afterMs: 150, expectPrefix: '(3/3)' }).delivered, false);
  assert.equal(replyState(part, { afterMs: 150, expectPrefix: '(2/3)' }).delivered, true);
});
