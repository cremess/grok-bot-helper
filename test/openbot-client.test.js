const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {
  OPENBOT_APP_URL, MAX_ANSWER_LENGTH, automationDirectory, isValidAgentId, parseOpenBotUrl, readConnection, safeDetail, normalizeAgents,
  findDelivery, deliveryOutcome, needsPerson, openBotState, newClientMessageId, createOpenBotClient, runOpenBotTurn,
} = require('../src/lib/openbot-client');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-openbot-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));
let directoryCount = 0;
// Fictional tokens only; the real OpenBot token is never read by the tests.
const TOKEN = 'fake-token-alpha-0123456789';
const NEW_TOKEN = 'fake-token-bravo-9876543210';

function automationFolder(url, token = TOKEN) {
  const directory = path.join(root, `automation-${++directoryCount}`);
  fs.mkdirSync(directory);
  if (url !== undefined) fs.writeFileSync(path.join(directory, 'url'), url);
  if (token !== null) fs.writeFileSync(path.join(directory, 'token'), token);
  return directory;
}

// A small stand-in for OpenBot's automation API. `state` controls what it answers.
async function fakeOpenBot(state = {}) {
  const seen = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      seen.push({ method: request.method, url: request.url, authorization: request.headers.authorization,
        body: body ? JSON.parse(body) : undefined });
      const send = (status, value) => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(value));
      };
      if (request.headers.authorization !== `Bearer ${state.token ?? TOKEN}`) return send(401, { error: 'Unauthorized' });
      const agents = state.agents ?? [{ id: 'agent-1', name: 'Fictional Helper' }];
      if (request.method === 'GET' && request.url === '/v1/agents') return send(200, agents);
      const match = /^\/v1\/agents\/([^/]+)\/(messages|pending|deliveries\/([^/]+))$/.exec(request.url);
      if (!match || !agents.some((agent) => agent.id === decodeURIComponent(match[1]))) return send(404, { error: 'No such agent' });
      const agentId = decodeURIComponent(match[1]);
      if (match[2] === 'messages' && request.method === 'POST') {
        return send(200, { messageId: 'message-1', deliveries: [
          { id: 'delivery-other', recipientAgentId: 'someone-else', status: 'queued' },
          { id: 'delivery-1', recipientAgentId: agentId, status: 'queued' },
        ] });
      }
      if (match[2] === 'pending') return send(200, state.pending ?? { prompts: [], approvals: [], browserTakeovers: [] });
      if (match[3]) {
        state.polls = (state.polls ?? 0) + 1;
        const steps = state.deliveries ?? [{ status: 'completed', answer: 'Hello from the fake agent.' }];
        return send(200, steps[Math.min(state.polls - 1, steps.length - 1)]);
      }
      send(404, { error: 'Not found' });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  after(() => server.close());
  return { url: `http://127.0.0.1:${server.address().port}`, seen, server };
}

const instant = { pollMs: 1, sleep: () => new Promise((resolve) => setImmediate(resolve)) };

test('the automation folder is under the roaming app data folder', () => {
  assert.equal(automationDirectory(path.join('C:', 'Data')), path.join('C:', 'Data', 'OpenBot', 'automation'));
  assert.equal(OPENBOT_APP_URL, 'openbot://');
});

test('only plain http addresses on this computer are accepted', () => {
  for (const [url, base] of [
    ['http://127.0.0.1:4567', 'http://127.0.0.1:4567'],
    ['http://127.0.0.1:4567/', 'http://127.0.0.1:4567'],
    ['  http://localhost:80/api/  ', 'http://localhost/api'],
    ['http://LOCALHOST:9', 'http://localhost:9'],
    ['http://[::1]:4567', 'http://[::1]:4567'],
  ]) assert.deepEqual(parseOpenBotUrl(url), { ok: true, base }, url);
  for (const url of ['https://127.0.0.1:4567', 'http://192.168.0.5:4567', 'http://example.com', 'http://127.0.0.1.example.com',
    'http://user:pass@127.0.0.1:1', 'http://127.0.0.1:1/?x=1', 'http://127.0.0.1:1/#x', 'file:///C:/x', 'http://0.0.0.0:1',
    'http://127.0.0.2:1', 'ftp://localhost']) {
    assert.deepEqual(parseOpenBotUrl(url), { ok: false, error: 'not-local' }, url);
  }
  for (const url of ['', '   ', 'not a url', null, 42]) assert.deepEqual(parseOpenBotUrl(url), { ok: false, error: 'invalid-url' });
});

test('reading the connection needs both files and a local address, and trims them', async () => {
  assert.deepEqual(await readConnection(path.join(root, 'missing')), { ok: false, error: 'not-set-up' });
  assert.deepEqual(await readConnection(automationFolder('http://127.0.0.1:1', null)), { ok: false, error: 'not-set-up' });
  assert.deepEqual(await readConnection(automationFolder(undefined)), { ok: false, error: 'not-set-up' });
  assert.deepEqual(await readConnection(automationFolder('http://127.0.0.1:1', '  \n')), { ok: false, error: 'not-set-up' });
  assert.deepEqual(await readConnection(automationFolder('http://127.0.0.1:1', 'two words')), { ok: false, error: 'not-set-up' });
  assert.deepEqual(await readConnection(automationFolder('\uFEFFhttp://127.0.0.1:1\r\n', `${TOKEN}\n`)),
    { ok: true, base: 'http://127.0.0.1:1', token: TOKEN });
  const refused = await readConnection(automationFolder('http://203.0.113.9:1'));
  assert.deepEqual(refused, { ok: false, error: 'not-local' });
  assert.ok(!JSON.stringify(refused).includes(TOKEN));
});

test('agent ids, agent lists and deliveries are validated', () => {
  for (const id of ['agent-1', 'a', 'A_b.c:d', 'x'.repeat(128)]) assert.equal(isValidAgentId(id), true, id);
  for (const id of ['', 'x'.repeat(129), 'a/b', 'a b', '../x', '.', '..', '.x', '-a', ':a', null, 1]) {
    assert.equal(isValidAgentId(id), false, String(id));
  }
  assert.deepEqual(normalizeAgents([{ id: 'a', name: ' Ana ' }, { id: 'a', name: 'Dup' }, { id: 'bad id', name: 'X' },
    { id: 'b' }, null, 'x', { id: 'c', name: `${'n'.repeat(90)}` }, { id: 'd', name: 'Line\nbreak' }]), [
    { id: 'a', name: 'Ana' }, { id: 'b', name: 'b' }, { id: 'c', name: 'n'.repeat(80) }, { id: 'd', name: 'Line break' },
  ]);
  assert.deepEqual(normalizeAgents({}), []);
  assert.deepEqual(findDelivery({ deliveries: [{ id: 'd0', recipientAgentId: 'other' }, { id: 'd1', recipientAgentId: 'a', status: 'queued' }] }, 'a'),
    { id: 'd1', status: 'queued' });
  for (const receipt of [null, {}, { deliveries: [] }, { deliveries: [{ id: 'd/1', recipientAgentId: 'a' }] },
    { deliveries: [{ recipientAgentId: 'a' }] }]) assert.equal(findDelivery(receipt, 'a'), null);
});

test('delivery outcomes: completed with the answer, final failures, anything else still running', () => {
  assert.deepEqual(deliveryOutcome({ status: 'completed', answer: '**Done**' }), { state: 'completed', answer: '**Done**' });
  assert.deepEqual(deliveryOutcome({ status: 'completed' }), { state: 'completed', answer: '' });
  for (const status of ['failed', 'interrupted', 'cancelled']) {
    assert.deepEqual(deliveryOutcome({ status, error: `Broke with ${TOKEN}\nhere` }, TOKEN),
      { state: 'failed', status, detail: 'Broke with [hidden] here' });
  }
  for (const value of [{ status: 'running' }, { status: 'queued' }, { status: 'new-state' }, {}, null]) {
    assert.equal(deliveryOutcome(value).state, 'running');
  }
  assert.equal(safeDetail('x'.repeat(500)).length, 300);
  assert.equal(safeDetail(42), '');
});

test('the agent waits for a person when any pending list has items', () => {
  assert.equal(needsPerson({ prompts: [], approvals: [], browserTakeovers: [] }), false);
  assert.equal(needsPerson({ prompts: [{}], approvals: [], browserTakeovers: [] }), true);
  assert.equal(needsPerson({ approvals: [{}] }), true);
  assert.equal(needsPerson({ browserTakeovers: [{}] }), true);
  for (const value of [null, {}, 'x', { prompts: 'yes' }]) assert.equal(needsPerson(value), false);
});

test('the OpenBot state tells apart closed or not set up, no agents, not answering and ready', () => {
  assert.equal(openBotState({ ok: false, error: 'not-set-up' }), 'not-set-up');
  assert.equal(openBotState({ ok: true, agents: [] }), 'no-agents');
  assert.equal(openBotState({ ok: false, error: 'unreachable' }), 'unreachable');
  assert.equal(openBotState({ ok: true, agents: [{ id: 'a', name: 'A' }] }), 'ready');
  assert.equal(openBotState({ ok: false, error: 'not-local' }), 'not-local');
  assert.equal(openBotState({ ok: false, error: 'invalid-url' }), 'not-local');
  for (const value of [{ ok: false, error: 'unauthorized' }, { ok: false, error: 'http' }, null]) assert.equal(openBotState(value), 'error');
});

test('client message ids are unique and prefixed', () => {
  const first = newClientMessageId();
  assert.match(first, /^ghh-[0-9a-f-]{36}$/);
  assert.notEqual(first, newClientMessageId());
});

test('lists agents with the token only in the authorization header', async () => {
  const api = await fakeOpenBot({ agents: [{ id: 'agent-1', name: 'Fictional Helper', extra: true }] });
  const client = createOpenBotClient({ directory: automationFolder(`${api.url}/`) });
  assert.deepEqual(await client.listAgents(), { ok: true, agents: [{ id: 'agent-1', name: 'Fictional Helper' }] });
  assert.deepEqual(api.seen.map(({ method, url, authorization }) => ({ method, url, authorization })),
    [{ method: 'GET', url: '/v1/agents', authorization: `Bearer ${TOKEN}` }]);
});

test('an empty agent list means no agent has Local scripts on', async () => {
  const api = await fakeOpenBot({ agents: [] });
  const result = await createOpenBotClient({ directory: automationFolder(api.url) }).listAgents();
  assert.deepEqual(result, { ok: true, agents: [] });
  assert.equal(openBotState(result), 'no-agents');
});

test('a refused connection is reported as not answering', async () => {
  const api = await fakeOpenBot();
  await new Promise((resolve) => api.server.close(resolve));
  const result = await createOpenBotClient({ directory: automationFolder(api.url) }).listAgents();
  assert.deepEqual(result, { ok: false, error: 'unreachable' });
  assert.equal(openBotState(result), 'unreachable');
});

test('missing files are reported without any request', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('should not be called'); };
  const result = await createOpenBotClient({ directory: path.join(root, 'nothing-here'), fetchImpl }).listAgents();
  assert.deepEqual(result, { ok: false, error: 'not-set-up' });
  assert.equal(calls, 0);
});

test('a non-local address is refused and the token is never sent', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('should not be called'); };
  for (const url of ['http://198.51.100.7:4000', 'https://localhost:4000', 'http://evil.example']) {
    const client = createOpenBotClient({ directory: automationFolder(url), fetchImpl });
    const result = await client.listAgents();
    assert.deepEqual(result, { ok: false, error: 'not-local' }, url);
    assert.equal(openBotState(result), 'not-local');
  }
  assert.equal(calls, 0);
});

test('a redirect is not followed', async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(302, { location: 'http://203.0.113.1/v1/agents' });
    response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  after(() => server.close());
  const result = await createOpenBotClient({ directory: automationFolder(`http://127.0.0.1:${server.address().port}`) }).listAgents();
  assert.equal(result.ok, false);
});

test('on a 401 it reads the url and token again and retries once', async () => {
  const state = {};
  const api = await fakeOpenBot(state);
  const directory = automationFolder(api.url);
  const client = createOpenBotClient({ directory });
  assert.equal((await client.listAgents()).ok, true);
  // OpenBot restarted: new token in the file and on the server.
  state.token = NEW_TOKEN;
  fs.writeFileSync(path.join(directory, 'token'), NEW_TOKEN);
  assert.equal((await client.listAgents()).ok, true);
  assert.deepEqual(api.seen.map((request) => request.authorization),
    [`Bearer ${TOKEN}`, `Bearer ${TOKEN}`, `Bearer ${NEW_TOKEN}`]);
});

test('a 401 with an unchanged token fails without looping and without the token in the result', async () => {
  const api = await fakeOpenBot({ token: NEW_TOKEN });
  const client = createOpenBotClient({ directory: automationFolder(api.url) });
  const result = await client.listAgents();
  assert.deepEqual(result, { ok: false, error: 'unauthorized', status: 401, detail: 'Unauthorized' });
  assert.equal(api.seen.length, 1);
  assert.ok(!JSON.stringify(result).includes(TOKEN));
  assert.equal(openBotState(result), 'error');
});

test('when OpenBot moved to another port, the new address is read and used in the same call', async () => {
  const first = await fakeOpenBot();
  const second = await fakeOpenBot();
  const directory = automationFolder(first.url);
  const client = createOpenBotClient({ directory });
  assert.equal((await client.listAgents()).ok, true);
  await new Promise((resolve) => first.server.close(resolve));
  fs.writeFileSync(path.join(directory, 'url'), second.url);
  assert.equal((await client.listAgents()).ok, true);
  assert.equal(second.seen.length, 1);
  await new Promise((resolve) => second.server.close(resolve));
  assert.equal((await client.listAgents()).error, 'unreachable');
});

test('error details from OpenBot never carry the token', async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(500, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: `Internal error near ${TOKEN}` }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  after(() => server.close());
  const result = await createOpenBotClient({ directory: automationFolder(`http://127.0.0.1:${server.address().port}`) }).listAgents();
  assert.deepEqual(result, { ok: false, error: 'http', status: 500, detail: 'Internal error near [hidden]' });
  assert.ok(!JSON.stringify(result).includes(TOKEN));
});

test('a full turn sends the text with a client message id and polls until completed', async () => {
  const state = { deliveries: [{ status: 'queued' }, { status: 'running' }, { status: 'completed', answer: '## Hi\n- one' }] };
  const api = await fakeOpenBot(state);
  const client = createOpenBotClient({ directory: automationFolder(api.url) });
  let queued;
  const result = await runOpenBotTurn({ client, agentId: 'agent-1', text: 'Hello there', clientMessageId: 'ghh-test-1',
    onQueued: (value) => { queued = value; }, ...instant });
  assert.deepEqual(result, { ok: true, answer: '## Hi\n- one', clipped: false });
  assert.deepEqual(queued, { ok: true, deliveryId: 'delivery-1', status: 'queued', messageId: 'message-1' });
  assert.deepEqual(api.seen[0].body, { text: 'Hello there', clientMessageId: 'ghh-test-1' });
  assert.equal(api.seen[0].url, '/v1/agents/agent-1/messages');
  assert.deepEqual(api.seen.slice(1).map((request) => request.url), [
    '/v1/agents/agent-1/deliveries/delivery-1', '/v1/agents/agent-1/pending',
    '/v1/agents/agent-1/deliveries/delivery-1', '/v1/agents/agent-1/pending',
    '/v1/agents/agent-1/deliveries/delivery-1',
  ]);
});

test('a failed delivery returns its status and a cleaned error', async () => {
  const api = await fakeOpenBot({ deliveries: [{ status: 'running' }, { status: 'failed', error: 'Model refused' }] });
  const client = createOpenBotClient({ directory: automationFolder(api.url) });
  assert.deepEqual(await runOpenBotTurn({ client, agentId: 'agent-1', text: 'Hi', ...instant }),
    { ok: false, error: 'failed', status: 'failed', detail: 'Model refused' });
});

test('an agent waiting for a person stops the wait', async () => {
  const api = await fakeOpenBot({ deliveries: [{ status: 'running' }], pending: { prompts: [], approvals: [{ id: 'x' }], browserTakeovers: [] } });
  const client = createOpenBotClient({ directory: automationFolder(api.url) });
  assert.deepEqual(await runOpenBotTurn({ client, agentId: 'agent-1', text: 'Hi', ...instant }), { ok: false, error: 'needs-person' });
});

test('the wait times out and can be cancelled', async () => {
  const api = await fakeOpenBot({ deliveries: [{ status: 'running' }] });
  const client = createOpenBotClient({ directory: automationFolder(api.url) });
  let clock = 0;
  const timedOut = await runOpenBotTurn({ client, agentId: 'agent-1', text: 'Hi', timeoutMs: 5000, now: () => clock,
    pollMs: 2000, sleep: async (ms) => { clock += ms; } });
  assert.deepEqual(timedOut, { ok: false, error: 'timeout' });
  let cancelled = false;
  const result = await runOpenBotTurn({ client, agentId: 'agent-1', text: 'Hi', isCancelled: () => cancelled,
    pollMs: 1, sleep: async () => { cancelled = true; } });
  assert.deepEqual(result, { ok: false, error: 'cancelled' });
});

test('sending to an agent without Local scripts reports not found, and bad input is refused locally', async () => {
  const api = await fakeOpenBot();
  const client = createOpenBotClient({ directory: automationFolder(api.url) });
  const missing = await runOpenBotTurn({ client, agentId: 'agent-gone', text: 'Hi', ...instant });
  assert.equal(missing.error, 'not-found');
  assert.deepEqual(await client.sendMessage('bad/id', 'Hi'), { ok: false, error: 'invalid-agent' });
  assert.deepEqual(await client.sendMessage('agent-1', '   '), { ok: false, error: 'empty' });
  assert.deepEqual(await client.getDelivery('agent-1', '../x'), { ok: false, error: 'invalid-agent' });
  assert.equal(api.seen.length, 1);
});

test('ids that are path segments are refused, and valid ids stay inside the agent path', async () => {
  for (const id of ['.', '..', '.x']) assert.equal(isValidAgentId(id), false, id);
  for (const id of ['.', '..']) {
    // This is what a dot id would have done: the URL parser resolves it to another endpoint.
    assert.notEqual(new URL(`http://127.0.0.1:1/v1/agents/${encodeURIComponent(id)}/messages`).pathname,
      `/v1/agents/${id}/messages`);
  }
  for (const id of ['a', 'a..b', 'agent.1', 'x:y', 'A_b-c']) {
    assert.equal(isValidAgentId(id), true, id);
    assert.equal(new URL(`http://127.0.0.1:1/v1/agents/${encodeURIComponent(id)}/messages`).pathname,
      `/v1/agents/${encodeURIComponent(id)}/messages`);
  }
  assert.equal(findDelivery({ deliveries: [{ id: '..', recipientAgentId: 'a' }] }, 'a'), null);
  let calls = 0;
  const client = createOpenBotClient({ directory: automationFolder('http://127.0.0.1:1'), fetchImpl: async () => { calls += 1; } });
  assert.deepEqual(await client.sendMessage('..', 'Hi'), { ok: false, error: 'invalid-agent' });
  assert.deepEqual(await client.getDelivery('a', '..'), { ok: false, error: 'invalid-agent' });
  assert.deepEqual(await client.getPending('.'), { ok: false, error: 'invalid-agent' });
  assert.equal(calls, 0);
});

test('a very long answer is cut and marked clipped; a huge response body is refused', async () => {
  const long = deliveryOutcome({ status: 'completed', answer: 'a'.repeat(MAX_ANSWER_LENGTH + 10) });
  assert.equal(long.answer.length, MAX_ANSWER_LENGTH);
  assert.equal(long.clipped, true);
  assert.equal(deliveryOutcome({ status: 'completed', answer: 'short' }).clipped, undefined);
  const api = await fakeOpenBot({ deliveries: [{ status: 'completed', answer: 'b'.repeat(MAX_ANSWER_LENGTH + 5) }] });
  const client = createOpenBotClient({ directory: automationFolder(api.url) });
  const result = await runOpenBotTurn({ client, agentId: 'agent-1', text: 'Hi', ...instant });
  assert.equal(result.ok, true);
  assert.equal(result.clipped, true);
  assert.equal(result.answer.length, MAX_ANSWER_LENGTH);
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify([{ id: 'a', name: 'x'.repeat(3 * 1024 * 1024) }]));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  after(() => server.close());
  const huge = await createOpenBotClient({ directory: automationFolder(`http://127.0.0.1:${server.address().port}`) }).listAgents();
  assert.deepEqual(huge, { ok: false, error: 'bad-response' });
});

test('the token used to clean a delivery error is the one of that request, even after a restart', async () => {
  const state = { deliveries: [{ status: 'failed', error: `Broke near ${NEW_TOKEN} and ${TOKEN}` }] };
  const api = await fakeOpenBot(state);
  const directory = automationFolder(api.url);
  const client = createOpenBotClient({ directory });
  assert.equal((await client.listAgents()).ok, true);
  state.token = NEW_TOKEN;
  fs.writeFileSync(path.join(directory, 'token'), NEW_TOKEN);
  const result = await client.getDelivery('agent-1', 'delivery-1');
  assert.equal(result.ok, true);
  assert.equal(result.outcome.detail, `Broke near [hidden] and ${TOKEN}`);
  assert.ok(!JSON.stringify(result).includes(NEW_TOKEN));
});

test('aborting the signal cancels during a request and between polls', async () => {
  const api = await fakeOpenBot({ deliveries: [{ status: 'running' }] });
  const client = createOpenBotClient({ directory: automationFolder(api.url) });
  const before = AbortSignal.abort();
  assert.deepEqual(await runOpenBotTurn({ client, agentId: 'agent-1', text: 'Hi', signal: before }), { ok: false, error: 'cancelled' });
  assert.equal(api.seen.length, 0);
  const controller = new AbortController();
  const started = Date.now();
  const pending = runOpenBotTurn({ client, agentId: 'agent-1', text: 'Hi', signal: controller.signal, pollMs: 60000 });
  setTimeout(() => controller.abort(), 150);
  assert.deepEqual(await pending, { ok: false, error: 'cancelled' });
  assert.ok(Date.now() - started < 5000);
  // A request stuck in OpenBot is cut short too.
  const stuck = http.createServer(() => {});
  await new Promise((resolve) => stuck.listen(0, '127.0.0.1', resolve));
  after(() => stuck.closeAllConnections() || stuck.close());
  const stuckClient = createOpenBotClient({ directory: automationFolder(`http://127.0.0.1:${stuck.address().port}`) });
  const second = new AbortController();
  const waiting = runOpenBotTurn({ client: stuckClient, agentId: 'agent-1', text: 'Hi', signal: second.signal });
  setTimeout(() => second.abort(), 150);
  assert.deepEqual(await waiting, { ok: false, error: 'cancelled' });
});
