// Talks to OpenBot through its local automation API, the same one the official OpenBot CLI uses.
// OpenBot writes the API address and a token to %APPDATA%\OpenBot\automation\url and \token while it
// runs and at least one agent has "Local scripts" on. Only a plain http address on this computer is
// accepted, and the token only ever goes in the authorization header of requests to that address: it is
// never returned, logged, saved or shown, and error details are cleaned of it.

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const REQUEST_TIMEOUT_MS = 30000;
const POLL_MS = 2000;
const DEFAULT_REPLY_TIMEOUT_MS = 10 * 60 * 1000;
// The only link the app opens for OpenBot: it brings the OpenBot window up.
const OPENBOT_APP_URL = 'openbot://';
const FINAL_STATUSES = new Set(['completed', 'failed', 'interrupted', 'cancelled']);
// URL.hostname keeps the brackets around an IPv6 address.
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
// Ids start with a letter or digit: "." and ".." would be read as path segments and move the request to
// another endpoint (with the token).
const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const DELIVERY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/;
const MAX_DETAIL_LENGTH = 300;
// The answer kept from a delivery (the same cap as Hermes's output) and the largest response body read.
const MAX_ANSWER_LENGTH = 200 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_NAME_LENGTH = 80;
const MAX_AGENTS = 200;

function automationDirectory(appData) {
  return path.join(appData, 'OpenBot', 'automation');
}

function isValidAgentId(id) {
  return typeof id === 'string' && AGENT_ID_PATTERN.test(id);
}

// Accepts only http on 127.0.0.1, localhost or ::1, without credentials, query or fragment.
// Returns the base the API paths are added to.
function parseOpenBotUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return { ok: false, error: 'invalid-url' };
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return { ok: false, error: 'invalid-url' };
  }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname) || url.username || url.password
      || url.search || url.hash) {
    return { ok: false, error: 'not-local' };
  }
  return { ok: true, base: `${url.origin}${url.pathname.replace(/\/+$/, '')}` };
}

// Reads the address and token OpenBot wrote. Missing or empty files mean OpenBot is closed or no agent
// has Local scripts on. The token is returned only to the client below, never in an error.
async function readConnection(directory) {
  let url;
  let token;
  try {
    [url, token] = await Promise.all([
      fs.promises.readFile(path.join(directory, 'url'), 'utf8'),
      fs.promises.readFile(path.join(directory, 'token'), 'utf8'),
    ]);
  } catch {
    return { ok: false, error: 'not-set-up' };
  }
  url = url.replace(/^﻿/, '').trim();
  token = token.replace(/^﻿/, '').trim();
  if (!url || !token || token.length > 4096 || /[\s\u0000-\u001f\u007f]/.test(token)) {
    return { ok: false, error: 'not-set-up' };
  }
  const parsed = parseOpenBotUrl(url);
  if (!parsed.ok) return parsed;
  return { ok: true, base: parsed.base, token };
}

// A short, single-line text from OpenBot (an error message) that is safe to show: control characters
// removed, the token blanked out if it ever showed up, and cut to a few hundred characters.
function safeDetail(value, token) {
  if (typeof value !== 'string') return '';
  let text = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  if (typeof token === 'string' && token) text = text.split(token).join('[hidden]');
  const points = [...text];
  return points.length > MAX_DETAIL_LENGTH ? `${points.slice(0, MAX_DETAIL_LENGTH - 1).join('')}…` : text;
}

// Keeps the agents with a valid id, with a trimmed name (the id when the name is missing).
function normalizeAgents(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const agents = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || !isValidAgentId(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    const name = typeof item.name === 'string' ? item.name.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim() : '';
    agents.push({ id: item.id, name: [...(name || item.id)].slice(0, MAX_NAME_LENGTH).join('') });
    if (agents.length >= MAX_AGENTS) break;
  }
  return agents;
}

// The delivery addressed to `agentId` in the answer to a sent message.
function findDelivery(receipt, agentId) {
  const deliveries = receipt && Array.isArray(receipt.deliveries) ? receipt.deliveries : [];
  const delivery = deliveries.find((item) => item && item.recipientAgentId === agentId);
  if (!delivery || typeof delivery.id !== 'string' || !DELIVERY_ID_PATTERN.test(delivery.id)) return null;
  return { id: delivery.id, status: typeof delivery.status === 'string' ? delivery.status : '' };
}

// Reads a delivery: 'completed' with the answer, 'failed' (failed, interrupted or cancelled) with the
// status and error, or 'running' for anything else (queued, running, or an answer we don't know yet).
function deliveryOutcome(delivery, token) {
  const status = delivery && typeof delivery.status === 'string' ? delivery.status : '';
  if (!FINAL_STATUSES.has(status)) return { state: 'running', status };
  if (status === 'completed') {
    const answer = typeof delivery.answer === 'string' ? delivery.answer : '';
    return answer.length > MAX_ANSWER_LENGTH
      ? { state: 'completed', answer: answer.slice(0, MAX_ANSWER_LENGTH).replace(/[\uD800-\uDBFF]$/, ''), clipped: true }
      : { state: 'completed', answer };
  }
  return { state: 'failed', status, detail: safeDetail(delivery.error, token) };
}

// True when the agent waits for a person: a question, an approval or a browser takeover.
function needsPerson(pending) {
  if (!pending || typeof pending !== 'object') return false;
  return ['prompts', 'approvals', 'browserTakeovers']
    .some((key) => Array.isArray(pending[key]) && pending[key].length > 0);
}

// What the Settings window and the prompt tell the user about OpenBot, from the agent list result:
// 'ready', 'no-agents' (OpenBot answers but no agent has Local scripts on), 'not-set-up' (no address or
// token: OpenBot is closed or no agent has Local scripts on), 'unreachable' (OpenBot doesn't answer),
// 'not-local' (the address isn't on this computer, refused) or 'error'.
function openBotState(result) {
  if (result && result.ok) return Array.isArray(result.agents) && result.agents.length ? 'ready' : 'no-agents';
  switch (result && result.error) {
    case 'not-set-up': return 'not-set-up';
    case 'unreachable': return 'unreachable';
    case 'not-local':
    case 'invalid-url': return 'not-local';
    default: return 'error';
  }
}

// Reads a response body as text, giving up (null) past `maxBytes` so a huge answer can't fill the memory.
async function readLimited(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    return Buffer.byteLength(text) > maxBytes ? null : text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Waits `ms`, or less when `signal` aborts.
function wait(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}

function newClientMessageId() {
  return `ghh-${randomUUID()}`;
}

// A client that reads the connection files when needed. On a 401 (OpenBot restarted and changed the
// token) or when OpenBot doesn't answer (it may have moved to another port), it reads them again and
// tries once more if they changed. Every method resolves to { ok: true, ... } or { ok: false, error }.
function createOpenBotClient({ directory, fetchImpl = globalThis.fetch, requestTimeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  let connection;

  async function connect(fresh) {
    if (!connection || fresh) connection = await readConnection(directory);
    return connection;
  }

  async function once(target, method, pathname, body, signal) {
    let response;
    const timeout = AbortSignal.timeout(requestTimeoutMs);
    try {
      response = await fetchImpl(target.base + pathname, {
        method,
        headers: {
          authorization: `Bearer ${target.token}`,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
      });
    } catch {
      return { ok: false, error: 'unreachable' };
    }
    let text;
    try {
      text = await readLimited(response, MAX_RESPONSE_BYTES);
    } catch {
      return { ok: false, error: 'unreachable' };
    }
    if (text === null) return { ok: false, error: 'bad-response' };
    let value = null;
    try {
      value = text ? JSON.parse(text) : null;
    } catch {
      value = undefined;
    }
    // The token of this request comes back with the value, only to clean details read from it.
    if (response.ok) return value === undefined ? { ok: false, error: 'bad-response' } : { ok: true, value, token: target.token };
    const error = { 401: 'unauthorized', 403: 'forbidden', 404: 'not-found' }[response.status] || 'http';
    return { ok: false, error, status: response.status,
      detail: safeDetail(value && typeof value === 'object' ? value.error : '', target.token) };
  }

  async function request(method, pathname, body, signal) {
    const target = await connect(false);
    if (!target.ok) {
      connection = undefined;
      return { ok: false, error: target.error };
    }
    let result = await once(target, method, pathname, body, signal);
    if (result.error === 'unauthorized' || result.error === 'unreachable') {
      const fresh = await connect(true);
      if (!fresh.ok) {
        connection = undefined;
        return { ok: false, error: fresh.error };
      }
      if (fresh.base !== target.base || fresh.token !== target.token) result = await once(fresh, method, pathname, body, signal);
    }
    if (result.error === 'unauthorized' || result.error === 'unreachable') connection = undefined;
    return result;
  }

  const agentPath = (agentId) => `/v1/agents/${encodeURIComponent(agentId)}`;

  return {
    async listAgents() {
      const result = await request('GET', '/v1/agents');
      if (!result.ok) return result;
      if (!Array.isArray(result.value)) return { ok: false, error: 'bad-response' };
      return { ok: true, agents: normalizeAgents(result.value) };
    },
    async sendMessage(agentId, text, clientMessageId = newClientMessageId(), { signal } = {}) {
      if (!isValidAgentId(agentId)) return { ok: false, error: 'invalid-agent' };
      if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'empty' };
      const result = await request('POST', `${agentPath(agentId)}/messages`, { text, clientMessageId }, signal);
      if (!result.ok) return result;
      const delivery = findDelivery(result.value, agentId);
      if (!delivery) return { ok: false, error: 'not-queued' };
      return { ok: true, deliveryId: delivery.id, status: delivery.status,
        messageId: typeof result.value.messageId === 'string' ? result.value.messageId : '' };
    },
    async getDelivery(agentId, deliveryId, { signal } = {}) {
      if (!isValidAgentId(agentId) || typeof deliveryId !== 'string' || !DELIVERY_ID_PATTERN.test(deliveryId)) {
        return { ok: false, error: 'invalid-agent' };
      }
      const result = await request('GET', `${agentPath(agentId)}/deliveries/${encodeURIComponent(deliveryId)}`, undefined, signal);
      if (!result.ok) return result;
      return { ok: true, outcome: deliveryOutcome(result.value, result.token) };
    },
    async getPending(agentId, { signal } = {}) {
      if (!isValidAgentId(agentId)) return { ok: false, error: 'invalid-agent' };
      const result = await request('GET', `${agentPath(agentId)}/pending`, undefined, signal);
      if (!result.ok) return result;
      return { ok: true, needsPerson: needsPerson(result.value) };
    },
  };
}

// Errors that can happen while OpenBot restarts; polling keeps going through them until the deadline.
const TRANSIENT_ERRORS = new Set(['unreachable', 'unauthorized', 'not-set-up']);

// Sends one message and waits for its delivery to end. Resolves to { ok: true, answer, clipped } or
// { ok: false, error } with error 'needs-person' (the agent waits for an answer in OpenBot), 'failed'
// (with status and detail), 'timeout', 'cancelled', or a client error from sending. Aborting `signal`
// cancels right away, also during a request or between polls.
async function runOpenBotTurn({ client, agentId, text, clientMessageId = newClientMessageId(), pollMs = POLL_MS,
  timeoutMs = DEFAULT_REPLY_TIMEOUT_MS, signal, isCancelled = () => Boolean(signal?.aborted), onQueued,
  sleep = (ms) => wait(ms, signal), now = Date.now }) {
  const options = { signal };
  if (isCancelled()) return { ok: false, error: 'cancelled' };
  const sent = await client.sendMessage(agentId, text, clientMessageId, options);
  if (isCancelled()) return { ok: false, error: 'cancelled' };
  if (!sent.ok) return sent;
  if (typeof onQueued === 'function') onQueued(sent);
  const deadline = now() + timeoutMs;
  for (;;) {
    if (isCancelled()) return { ok: false, error: 'cancelled' };
    const delivery = await client.getDelivery(agentId, sent.deliveryId, options);
    if (isCancelled()) return { ok: false, error: 'cancelled' };
    if (delivery.ok) {
      const { outcome } = delivery;
      if (outcome.state === 'completed') return { ok: true, answer: outcome.answer, clipped: Boolean(outcome.clipped) };
      if (outcome.state === 'failed') return { ok: false, error: 'failed', status: outcome.status, detail: outcome.detail };
      const pending = await client.getPending(agentId, options);
      if (isCancelled()) return { ok: false, error: 'cancelled' };
      if (pending.ok && pending.needsPerson) return { ok: false, error: 'needs-person' };
    } else if (!TRANSIENT_ERRORS.has(delivery.error)) {
      return delivery;
    }
    if (now() >= deadline) return { ok: false, error: 'timeout' };
    await sleep(Math.min(pollMs, Math.max(0, deadline - now())));
  }
}

module.exports = {
  REQUEST_TIMEOUT_MS,
  POLL_MS,
  DEFAULT_REPLY_TIMEOUT_MS,
  MAX_ANSWER_LENGTH,
  OPENBOT_APP_URL,
  automationDirectory,
  isValidAgentId,
  parseOpenBotUrl,
  readConnection,
  safeDetail,
  normalizeAgents,
  findDelivery,
  deliveryOutcome,
  needsPerson,
  openBotState,
  newClientMessageId,
  createOpenBotClient,
  runOpenBotTurn,
};
