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
const user = (id, seq, timestampMs, content = ' pergunta ') =>
  ({ kind: 'message', role: 'user', id, seq, timestampMs, content });
const bot = (id, seq, timestampMs, content = ' resposta ') =>
  ({ kind: 'send-message', id, seq, timestampMs, message: { type: 'text', content } });
const transcript = (entries) => ({ schemaVersion: 1, value: { entries } });

test('userMessageSince considera somente usuário com corte inclusivo', () => {
  const entries = parseTranscript(transcript([user('u', 1, 100), bot('b', 2, 200)]));
  assert.equal(userMessageSince(entries, 99), true);
  assert.equal(userMessageSince(entries, 100), true);
  assert.equal(userMessageSince(entries, 101), false);
  assert.equal(userMessageSince(entries, 200), false);
  assert.equal(userMessageSince([], 0), false);
});

test('busca genérica seleciona blob mais recente e não lança para pasta ou regex inválidos', () => {
  const dir = directory('generica');
  const first = blob(dir, 'selection.last-agent', {}, 'a');
  const second = blob(dir, 'selection.last-agent', {}, 'b');
  fs.utimesSync(first, 100, 100);
  fs.utimesSync(second, 200, 200);
  fs.writeFileSync(path.join(dir, 'invalido!.blob'), '{}');
  const regex = /\.selection\.last-agent$/g;
  assert.equal(findPersistenceFile(dir, regex), second);
  assert.equal(findPersistenceFile(dir, regex), second);
  assert.equal(findPersistenceFile(path.join(dir, 'ausente'), regex), null);
  assert.equal(findPersistenceFile(dir, null), null);
});

test('encontra conversa do bot exato entre contas e escapa metacaracteres', () => {
  const dir = directory('conversas');
  blob(dir, 'transcript.replicas.outro', transcript([]));
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
    ok: true, agentId: 'bot.1', entries: [{ id: 'b', role: 'bot', text: 'resposta', timestampMs: 10 }],
    mtimeMs: fs.statSync(newer).mtimeMs,
  });
});

test('resolve last-agent com ID válido e prioriza bot explícito', () => {
  const dir = directory('selecao');
  const file = blob(dir, 'selection.last-agent', { schemaVersion: 1, value: { agentId: 'bot_1' } });
  blob(dir, 'transcript.replicas.bot_1', transcript([]));
  assert.equal(resolveAgentId(dir, ''), 'bot_1');
  assert.equal(resolveAgentId(dir, 'outro'), 'outro');
  assert.equal(readConversation(dir, '').agentId, 'bot_1');
  for (const data of ['{', '{}', '{"value":{"agentId":"inválido espaço"}}']) {
    fs.writeFileSync(file, data);
    assert.equal(resolveAgentId(dir, ''), null);
    assert.deepEqual(readConversation(dir, ''), { ok: false, error: 'no-agent' });
  }
});

test('ausência e JSON quebrado têm resultados previsíveis', () => {
  const dir = directory('ausencia');
  assert.deepEqual(readConversation(dir, ''), { ok: false, error: 'no-agent' });
  assert.deepEqual(readConversation(dir, 'bot'), { ok: false, error: 'not-found' });
  const file = blob(dir, 'transcript.replicas.bot', '{');
  assert.deepEqual(readConversation(dir, 'bot'), {
    ok: true, agentId: 'bot', entries: [], mtimeMs: fs.statSync(file).mtimeMs,
  });
});

test('erro ao ler conversa retorna unreadable e erro ao ler seleção retorna no-agent', (t) => {
  const dir = directory('leitura');
  blob(dir, 'transcript.replicas.bot', '{}');
  blob(dir, 'selection.last-agent', { value: { agentId: 'bot' } });
  t.mock.method(fs, 'readFileSync', () => { throw Object.assign(new Error('Acesso negado'), { code: 'EACCES' }); });
  assert.deepEqual(readConversation(dir, 'bot'), { ok: false, error: 'unreadable' });
  assert.equal(resolveAgentId(dir, ''), null);
});

test('filtra entradas, apara texto e ordena por seq com desempate por timestamp', () => {
  const entries = [bot('b', 2, 30), user('u', 2, 20), user('primeiro', 1),
    null, {}, user('vazio', 4, 40, ' '), bot('numero', 4, 40, 42),
    { ...user('assistant', 4, 40), role: 'assistant' },
    ...['widget', 'attachment'].map((type) => ({ ...bot(type, 4, 40), message: { type, content: {} } })),
    { kind: 'user-attachment', id: 'anexo' }, { kind: 'event', id: 'evento' },
    { ...user('sem-id', 4, 40), id: undefined }];
  const expected = [
    { id: 'primeiro', role: 'user', text: 'pergunta', timestampMs: 0 },
    { id: 'u', role: 'user', text: 'pergunta', timestampMs: 20 },
    { id: 'b', role: 'bot', text: 'resposta', timestampMs: 30 },
  ];
  assert.deepEqual(parseTranscript(transcript(entries)), expected);
  assert.deepEqual(parseTranscript(JSON.stringify(transcript(entries))), expected);
  assert.equal(entries[0].message.content, ' resposta ');
  for (const json of ['{', '', null, undefined, {}, { value: { entries: {} } }]) {
    assert.deepEqual(parseTranscript(json), []);
  }
  for (const timestamp of ['10', NaN, Infinity, null]) {
    assert.equal(parseTranscript(transcript([bot('b', 1, timestamp)]))[0].timestampMs, 0);
  }
});

test('latestReply considera ordem da conversa e corte estrito; recentExchanges limita sem mutar', () => {
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
