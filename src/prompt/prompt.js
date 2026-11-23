applyI18n();

const textarea = document.getElementById('message');
let destinationDetails = {};
const card = document.getElementById('card');
const content = document.getElementById('content');
const pin = document.getElementById('pin');
const templatesButton = document.getElementById('templates');
const templateMenu = document.getElementById('template-menu');
let templates = [];
let pinned = false;
let userSized = false;

function setUserSized(value) {
  userSized = Boolean(value);
  card.classList.toggle('user-sized', userSized);
}

window.grokbot.onUserSized((value) => {
  setUserSized(value);
  renderConversation();
});

function showPinned(value) {
  pinned = value;
  pin.setAttribute('aria-pressed', String(pinned));
  pin.setAttribute('aria-label', pinned ? t('prompt.unpin') : t('prompt.pin'));
  pin.title = pinned ? t('prompt.unpin') : t('prompt.pinHelp');
}

pin.addEventListener('click', async () => {
  const value = !pinned;
  try {
    await window.grokbot.setPinned(value);
    showPinned(value);
  } catch { showError(t('errors.pin')); }
});
document.getElementById('close').addEventListener('click', () => window.grokbot.hide());
document.querySelector('header').addEventListener('dblclick', (event) => {
  if (!event.target.closest('button, input, #destination-picker')) window.grokbot.resetBounds();
});
window.grokbot.onBoundsReset(() => { picker.close(); updateLayout(); });
const counter = document.getElementById('counter');
const errorArea = document.getElementById('error');
const noticeArea = document.getElementById('notice');
const send = document.getElementById('send');
const usageWarning = document.getElementById('usage-warning');
const usageIndicator = document.getElementById('usage-indicator');
let usage = {};
// Grok Bot links take 1000 characters; OpenBot and Hermes up to 20 000 (the main process sends the limit).
let maxLength = 1000;
// Where messages go: 'grokbot', 'openbot' or 'hermes'.
let assistant = 'grokbot';
// How an OpenBot or Hermes turn failed: { message, detail, steps, openOpenBot, retry }.
let assistantError;
// The last OpenBot agent list ({ state, agents }) or Hermes state, for the notice above the reply.
let openbotStatus = null;
let hermesState = 'ready';
let agentPoll;
const errors = {
  empty: t('errors.empty'),
  busy: t('errors.busy'),
  'too-long': t('errors.tooLong'),
  'invalid-bot-id': t('errors.configuredBot'),
  'open-failed': t('errors.open'),
  'no-agent': t('prompt.openbot.pick'),
  'hermes-missing': t('prompt.hermes.missing'),
  'openbot-not-set-up': t('openbot.state.notSetUp'),
  'openbot-unreachable': t('openbot.state.unreachable'),
  'openbot-not-local': t('openbot.state.notLocal'),
  'openbot-agent-missing': t('openbot.agentMissing'),
  'openbot-failed': t('errors.openbotFailed'),
  'openbot-stopped': t('errors.openbotStopped'),
};
const OPENBOT_STATES = {
  'not-set-up': 'openbot.state.notSetUp',
  'no-agents': 'openbot.state.noAgents',
  unreachable: 'openbot.state.unreachable',
  'not-local': 'openbot.state.notLocal',
  error: 'openbot.state.error',
};
const assistantNoticeBox = document.getElementById('assistant-notice');
const assistantNoticeText = document.getElementById('assistant-notice-text');
const assistantNoticeSteps = document.getElementById('assistant-notice-steps');
const assistantNoticeOpen = document.getElementById('assistant-notice-open');
const openBotButton = document.getElementById('open-bot');
const openOpenBot = () => window.grokbot.openOpenBot().catch(() => {});
assistantNoticeOpen.addEventListener('click', openOpenBot);
let submitting = false;
let resizeFrame;
let showVersion = 0;
const response = document.getElementById('response');
const responseBody = document.getElementById('response-body');
const responseTime = document.getElementById('response-time');
const responseName = document.getElementById('response-name');
const responseAvatar = document.getElementById('response-avatar');
const conversationToggle = document.getElementById('conversation-toggle');
const expandResponse = document.getElementById('expand-response');
const emptyState = document.getElementById('empty-state');
const emptyMessage = document.getElementById('empty-message');
let grokBotFound = true;
const waitingArea = document.getElementById('waiting-area');
let conversation = { ok: false };
let waiting = false;
// A reply already arrived and the app is watching for more messages from the same turn.
let partial = false;
let timedOut = false;
let notDelivered = false;
let awaitingDelivery = false;
let sent;
let conversationView = false;
let expanded = false;
let relativeTimer;
const pickerContainer = document.getElementById('destination-picker');
let history = [];
let historyIndex = null;
let copyTimer;
let rosterVersion = 0;
const picker = BotPicker.create({
  container: pickerContainer,
  compact: true,
  async onSelect(value) {
    if (submitting) { setBot(destinationDetails); return; }
    const version = showVersion;
    try {
      const selected = await window.grokbot.selectBot({ botId: value.botId, botName: value.botName });
      if (version !== showVersion) return;
      if (!selected.ok) { setBot(destinationDetails); showError(t('errors.selectBot')); return; }
      setBot(selected.bot);
      conversation = selected.conversation;
      waiting = Boolean(selected.waiting);
      partial = false;
      timedOut = false;
      assistantError = selected.assistantError;
      sent = selected.sent;
      renderAssistantNotice();
      conversationView = false;
      expanded = false;
      renderConversation();
      textarea.focus();
    } catch { setBot(destinationDetails); showError(t('errors.selectBot')); }
  },
});
pickerContainer.addEventListener('botpicker:toggle', updateLayout);

function configurePicker() {
  picker.configure(assistant === 'openbot'
    ? { includeDefault: false, heading: t('picker.agentsHeading'), empty: t('picker.noAgents'), badgeFirst: false }
    : assistant === 'hermes'
      ? { includeDefault: false, heading: t('picker.hermesHeading'), empty: t('picker.empty'), badgeFirst: false }
      : { includeDefault: true, heading: t('picker.heading'), empty: t('picker.empty'), badgeFirst: true });
}

function setBot(details) {
  destinationDetails = details;
  const next = ['openbot', 'hermes'].includes(details.assistant) ? details.assistant : 'grokbot';
  if (next !== assistant) {
    assistant = next;
    if (assistant !== 'grokbot') grokBotFound = true;
    openbotStatus = null;
    hermesState = 'ready';
    picker.setBots([]);
    configurePicker();
    loadPickerBots();
  }
  if (Number.isInteger(details.maxLength) && details.maxLength > 0) maxLength = details.maxLength;
  if (assistant === 'grokbot') {
    picker.setValue({ mode: details.botId ? 'list' : 'default', botId: details.botId || '', botName: details.botName || '' });
  } else picker.setValue({ mode: 'list', botId: details.botId || '', botName: details.botName || '' });
  const name = details.botName || 'OpenBot';
  textarea.placeholder = assistant === 'grokbot' ? t('prompt.placeholder') : t('prompt.assistant.placeholder', { bot: name });
  textarea.setAttribute('aria-label', assistant === 'grokbot' ? t('prompt.message') : t('prompt.assistant.message', { bot: name }));
  openBotButton.hidden = assistant === 'hermes';
  const openLabel = assistant === 'openbot' ? t('openbot.open') : t('prompt.openConversation');
  openBotButton.title = openLabel;
  openBotButton.setAttribute('aria-label', openLabel);
}

// A note above the reply when OpenBot or Hermes can't be used yet: OpenBot closed or without agents with
// Local scripts, no agent picked, the picked agent gone, or hermes.exe not found.
function assistantNotice() {
  if (assistant === 'hermes') return hermesState === 'missing' ? { text: t('prompt.hermes.missing') } : null;
  if (assistant !== 'openbot' || !openbotStatus) return null;
  const { state, agents } = openbotStatus;
  if (state !== 'ready') {
    return { text: t(OPENBOT_STATES[state] || OPENBOT_STATES.error),
      steps: state === 'not-set-up' || state === 'no-agents',
      open: state === 'not-set-up' || state === 'no-agents' || state === 'unreachable' };
  }
  if (!destinationDetails.botId) return { text: t('prompt.openbot.pick') };
  if (!agents.some((agent) => agent.id === destinationDetails.botId)) return { text: t('openbot.agentMissing'), steps: true, open: true };
  return null;
}

function renderAssistantNotice() {
  const notice = assistantNotice();
  assistantNoticeBox.hidden = !notice;
  assistantNoticeText.textContent = notice ? notice.text : '';
  assistantNoticeSteps.hidden = !notice?.steps;
  assistantNoticeOpen.hidden = !notice?.open;
  updateLayout();
}

// While the prompt is open with OpenBot as the destination and something is missing, the agent list is
// read again every 3 s, so the note goes away by itself once Local scripts is on. Nothing runs while hidden.
function scheduleAgentPoll() {
  clearTimeout(agentPoll);
  agentPoll = undefined;
  if (document.hidden || assistant !== 'openbot' || !assistantNotice()) return;
  agentPoll = setTimeout(loadPickerBots, 3000);
}

function setUsage(data) {
  usage = data || {};
  usageWarning.hidden = !usage.blocked;
  usageWarning.textContent = usage.blocked ? t('prompt.usageBlocked', { reset: usage.resetText }) : '';
  usageIndicator.hidden = usage.blocked || !(usage.percentUsed >= 80);
  usageIndicator.textContent = usageIndicator.hidden ? '' : t('prompt.usage', { percent: usage.percentUsed });
}

function textButton(label, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'text-button';
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
}

async function loadPickerBots() {
  const version = ++rosterVersion;
  const forAssistant = assistant;
  try {
    const result = await window.grokbot.bots();
    if (version !== rosterVersion || forAssistant !== assistant || (result.assistant || 'grokbot') !== assistant) return;
    if (assistant === 'grokbot') {
      grokBotFound = result.ok;
      picker.setBots(result.ok ? result.bots : []);
    } else {
      grokBotFound = true;
      const bots = Array.isArray(result.bots) ? result.bots : [];
      picker.setBots(bots);
      if (assistant === 'openbot') openbotStatus = { state: result.state, agents: bots };
      else hermesState = result.state;
    }
    renderAssistantNotice();
    renderConversation();
  } catch {
    if (version !== rosterVersion) return;
    grokBotFound = assistant !== 'grokbot';
    picker.setBots([]);
    if (assistant === 'openbot') openbotStatus = { state: 'error', agents: [] };
    renderAssistantNotice();
    renderConversation();
  } finally {
    if (version === rosterVersion) scheduleAgentPoll();
  }
}

document.getElementById('copy-response').addEventListener('click', async () => {
  if (!conversation.latest) return;
  try {
    const result = await window.grokbot.copy(conversation.latest.text);
    if (!result.ok) return;
    clearTimeout(copyTimer);
    document.getElementById('copy-icon').setAttribute('hidden', '');
    document.getElementById('copy-check').removeAttribute('hidden');
    copyTimer = setTimeout(() => {
      document.getElementById('copy-icon').removeAttribute('hidden');
      document.getElementById('copy-check').setAttribute('hidden', '');
    }, 1200);
  } catch { showError(t('errors.copy')); }
});
document.getElementById('open-bot').addEventListener('click', async () => {
  try {
    const result = await window.grokbot.openBot();
    if (!result.ok) showError(errors['open-failed']);
  } catch { showError(errors['open-failed']); }
});

function measureResponse() {
  if (userSized) {
    expandResponse.hidden = true;
    responseBody.classList.remove('collapsed', 'expanded', 'overflowing');
    return;
  }
  if (response.hidden || conversationView) {
    expandResponse.hidden = true;
    responseBody.classList.remove('overflowing');
    return;
  }
  // Always measure at the collapsed height, even after expanding.
  responseBody.classList.remove('expanded');
  responseBody.classList.add('collapsed');
  const overflowing = responseBody.scrollHeight > responseBody.clientHeight;
  responseBody.classList.toggle('collapsed', !expanded);
  responseBody.classList.toggle('expanded', expanded);
  responseBody.classList.toggle('overflowing', overflowing && !expanded);
  expandResponse.hidden = !overflowing;
}
window.addEventListener('resize', updateLayout);

function renderInline(parent, nodes) {
  const tags = { text: 'span', break: 'br', code: 'code', strong: 'strong', em: 'em', link: 'a' };
  for (const node of nodes) {
    const element = document.createElement(tags[node.type] || 'span');
    if (node.children) renderInline(element, node.children);
    else if (node.text) element.textContent = node.text;
    if (node.type === 'link') {
      element.href = node.href;
      element.addEventListener('click', (event) => {
        event.preventDefault();
        window.grokbot.openLink(node.href).catch(() => {});
      });
    }
    parent.append(element);
  }
}

function renderMarkdown(parent, text) {
  for (const block of parseMarkdown(text)) {
    const tag = block.type === 'heading' ? `h${block.level}` : block.type === 'list'
      ? (block.ordered ? 'ol' : 'ul') : { paragraph: 'p', quote: 'blockquote', code: 'pre' }[block.type];
    const element = document.createElement(tag || 'p');
    if (block.type === 'code') {
      const code = document.createElement('code');
      code.textContent = block.text;
      element.append(code);
    } else if (block.type === 'list') {
      for (const item of block.items) {
        const li = document.createElement('li');
        renderInline(li, item);
        element.append(li);
      }
    } else renderInline(element, block.children || []);
    parent.append(element);
  }
}

function timeElement(timestampMs) {
  const time = document.createElement('small');
  time.dataset.timestamp = String(timestampMs);
  time.textContent = relativeTime(timestampMs, Date.now());
  return time;
}

function bubble(entry) {
  const element = document.createElement('div');
  element.className = `bubble ${entry.role === 'user' ? 'user' : 'bot'}`;
  renderMarkdown(element, entry.text);
  element.append(timeElement(entry.timestampMs));
  return element;
}

function updateTimes() {
  if (conversation.latest) responseTime.textContent = t('prompt.responseTime', { time: relativeTime(conversation.latest.timestampMs, Date.now()) });
  for (const time of document.querySelectorAll('[data-timestamp]')) {
    time.textContent = relativeTime(Number(time.dataset.timestamp), Date.now());
  }
  updateLayout();
}

function startRelativeTimer() {
  clearInterval(relativeTimer);
  relativeTimer = undefined;
  if (!document.hidden) relativeTimer = setInterval(updateTimes, 30000);
}

function renderConversation(animate = false) {
  response.hidden = !conversation.ok || !conversation.latest;
  responseBody.replaceChildren();
  responseName.textContent = destinationDetails.botName || (destinationDetails.botId ? t('bot.fallback', { id: destinationDetails.botId.slice(0, 8) }) : t('bot.default'));
  emptyState.hidden = !response.hidden || waiting || timedOut || notDelivered || Boolean(assistantError);
  emptyMessage.textContent = grokBotFound ? t('prompt.empty', { bot: responseName.textContent }) : t('prompt.notFound');
  responseAvatar.textContent = destinationDetails.botInitial || 'G';
  responseAvatar.style.backgroundColor = destinationDetails.botColor || '#1080f3';
  conversationToggle.textContent = conversationView ? t('prompt.latest') : t('prompt.conversation');
  conversationToggle.setAttribute('aria-pressed', String(conversationView));
  responseBody.classList.toggle('collapsed', !userSized && !expanded && !conversationView);
  responseBody.classList.toggle('expanded', !userSized && (expanded || conversationView));
  expandResponse.hidden = userSized || conversationView;
  expandResponse.textContent = expanded ? t('prompt.less') : t('prompt.more');
  expandResponse.setAttribute('aria-expanded', String(expanded));
  if (!response.hidden) {
    if (conversationView) {
      for (const entry of conversation.entries || []) responseBody.append(bubble(entry));
      // Open at the latest messages, as in a chat.
      requestAnimationFrame(() => { responseBody.scrollTop = responseBody.scrollHeight; });
    } else renderMarkdown(responseBody, conversation.latest.text);
  }
  responseBody.classList.remove('new-reply');
  if (animate && !document.hidden) {
    void responseBody.offsetWidth;
    responseBody.classList.add('new-reply');
  }
  waitingArea.replaceChildren();
  waitingArea.hidden = !waiting && !timedOut && !notDelivered && !assistantError;
  if (waiting) {
    if (sent && !partial) waitingArea.append(bubble(sent));
    const status = document.createElement('p');
    status.className = 'waiting-status';
    status.append(partial ? t('prompt.moreComing', { bot: responseName.textContent })
      : awaitingDelivery ? t('prompt.awaitingDelivery')
        : t('prompt.waiting', { bot: responseName.textContent }));
    const dots = document.createElement('span');
    dots.className = 'waiting-dots';
    dots.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 3; index += 1) {
      const dot = document.createElement('span');
      dot.textContent = '.';
      dots.append(dot);
    }
    if (!awaitingDelivery) status.append(dots);
    status.append(textButton(t('prompt.stop'), async () => {
      try { await window.grokbot.stopWaiting(); }
      catch { showError(t('errors.stop')); }
    }));
    waitingArea.append(status);
  } else if (notDelivered) {
    if (sent) {
      const failed = bubble(sent);
      const indicator = document.createElement('small');
      indicator.className = 'delivery-failure';
      indicator.textContent = '\u26a0';
      indicator.setAttribute('aria-label', t('prompt.deliveryFailed'));
      failed.append(indicator);
      waitingArea.append(failed);
    }
    const status = document.createElement('p');
    status.className = 'waiting-status';
    status.textContent = t('prompt.deliveryMessage', { detail: usage.blocked
      ? t('prompt.deliveryLimit', { reset: usage.resetText })
      : t('prompt.deliveryHelp') });
    const retryText = sent?.text;
    const force = usage.blocked === true;
    status.append(textButton(t('prompt.retry'), () => {
      if (typeof retryText === 'string') submit(force, retryText);
    }));
    waitingArea.append(status);
  } else if (assistantError) {
    const status = document.createElement('p');
    status.className = 'waiting-status';
    status.textContent = assistantError.message;
    if (assistantError.detail) {
      const detail = document.createElement('small');
      detail.className = 'assistant-detail';
      detail.textContent = assistantError.detail;
      status.append(detail);
    }
    if (assistantError.steps) {
      const steps = document.createElement('small');
      steps.className = 'assistant-detail assistant-steps';
      steps.textContent = t('openbot.steps');
      status.append(steps);
    }
    if (assistantError.openOpenBot) status.append(textButton(t('openbot.open'), openOpenBot));
    const retryText = sent?.text;
    if (assistantError.retry && typeof retryText === 'string') {
      status.append(textButton(t('prompt.retry'), () => submit(false, retryText)));
    }
    waitingArea.append(status);
  } else if (timedOut) {
    const status = document.createElement('p');
    status.className = 'waiting-status';
    status.textContent = t('prompt.timeout');
    waitingArea.append(status);
  }
  updateTimes();
}

conversationToggle.addEventListener('click', () => {
  conversationView = !conversationView;
  renderConversation();
});
expandResponse.addEventListener('click', () => {
  expanded = !expanded;
  renderConversation();
});
document.addEventListener('visibilitychange', () => {
  startRelativeTimer();
  scheduleAgentPoll();
  if (!document.hidden) updateTimes();
});
window.grokbot.onConversation((data) => {
  if (data.bot) {
    setBot(data.bot);
    conversationView = false;
    expanded = false;
    renderAssistantNotice();
  }
  const changed = data.latest && (data.latest.id !== conversation.latest?.id || data.latest.text !== conversation.latest?.text);
  conversation = data;
  assistantError = data.assistantError && typeof data.assistantError.message === 'string' ? data.assistantError : undefined;
  waiting = Boolean(data.waiting);
  partial = waiting && Boolean(data.partial);
  timedOut = Boolean(data.timedOut);
  notDelivered = Boolean(data.notDelivered);
  awaitingDelivery = Boolean(data.awaitingDelivery);
  if (data.usage) setUsage(data.usage);
  sent = data.sent;
  renderConversation(Boolean(changed && (!waiting || partial)));
});

function updateLayout() {
  send.disabled = submitting || !textarea.value.trim();
  const length = [...textarea.value].length;
  counter.textContent = t('prompt.counter', { length, max: maxLength });
  counter.hidden = length < maxLength * 0.8;
  counter.classList.toggle('over-limit', length > maxLength);
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(192, textarea.scrollHeight)}px`;
    measureResponse();
    if (userSized) return;
    const popover = pickerContainer.querySelector('.bot-picker-popover');
    const bottom = popover.hidden ? 0 : popover.getBoundingClientRect().bottom + 14;
    // Measure natural height without the stretched window height.
    const fixedHeight = [...card.children].filter((element) => element !== content && !element.hidden)
      .reduce((total, element) => {
        const style = getComputedStyle(element);
        const height = element === textarea ? Math.min(192, textarea.scrollHeight) : element.offsetHeight;
        return total + height + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
      }, 28);
    const contentHeight = [...content.children].filter((element) => !element.hidden)
      .reduce((total, element) => total + element.offsetHeight + parseFloat(getComputedStyle(element).marginBottom), 0);
    window.grokbot.resize(Math.ceil(Math.max(fixedHeight + contentHeight, bottom))).catch(() => {});
  });
}

// A quiet status line, for things that aren't errors (like a selection that was cut to fit).
let partsNoticeShown = false;
function showNotice(message) {
  partsNoticeShown = false;
  noticeArea.textContent = message;
  noticeArea.hidden = !message;
  updateLayout();
}

function showError(message) {
  errorArea.textContent = message;
  errorArea.hidden = !message;
  updateLayout();
}

function showPartsProgress({ part, total }) {
  noticeArea.replaceChildren(t('prompt.parts.progress', { part, total }), textButton(t('prompt.parts.cancel'), () => {
    window.grokbot.cancelParts().catch(() => {});
  }));
  noticeArea.hidden = false;
  partsNoticeShown = true;
  updateLayout();
}
// The draft being sent in parts, to clear it (and add it to history) once every part arrived.
let partsDraft;
window.grokbot.onPartsProgress((data) => {
  if (data?.done) {
    // Handled here rather than where submitParts awaits, so the outcome isn't lost if the prompt was
    // hidden, reopened or reloaded while the parts were going out.
    if (partsNoticeShown) showNotice('');
    const result = data.result && typeof data.result === 'object' ? data.result : { ok: false, error: 'unexpected' };
    const draft = partsDraft;
    partsDraft = undefined;
    submitting = true;
    if (result.ok) succeedSubmit(result, draft ?? '', textarea.value === draft ? undefined : '');
    else failSubmit(result, (forced) => submitParts(forced, draft ?? textarea.value), draft ?? textarea.value);
  } else if (Number.isInteger(data?.part) && Number.isInteger(data?.total)) showPartsProgress(data);
});

function failSubmit(result, retry, draft) {
  if (result.error === 'limit') {
    setUsage({ blocked: true, resetText: result.resetText, percentUsed: result.percentUsed });
    showError(t('prompt.limit', { reset: result.resetText }));
    errorArea.append(textButton(t('prompt.sendAnyway'), () => retry(true)));
  } else if (result.error === 'too-long' && Number.isInteger(result.max)) {
    showError(t('errors.tooLongMax', { max: result.max }));
  } else if (result.error === 'too-long' && Number.isInteger(result.parts) && result.parts > 1
      && result.parts <= result.maxParts) {
    showError(errors['too-long']);
    errorArea.append(textButton(t('prompt.parts.send', { count: result.parts }), () => submitParts(false, draft)));
  } else if (result.error === 'too-many-parts' || (result.error === 'too-long' && result.parts > result.maxParts)) {
    showError(t('prompt.parts.tooMany', { max: result.maxParts }));
  } else if (result.error === 'part-failed') {
    showError(t('prompt.parts.failed', { part: result.part, total: result.total }));
  } else if (result.error === 'cancelled') {
    showNotice(Number.isInteger(result.pendingPart)
      ? t('prompt.parts.cancelledPending', { sent: result.sentParts, total: result.total, part: result.pendingPart })
      : t('prompt.parts.cancelled', { sent: result.sentParts, total: result.total }));
  } else {
    showError(errors[result.error] || t('errors.unexpected'));
    if (['openbot-not-set-up', 'openbot-unreachable', 'openbot-agent-missing'].includes(result.error)) {
      errorArea.append(textButton(t('openbot.open'), openOpenBot));
      // Refresh the note above, which has the steps to turn Local scripts on.
      loadPickerBots();
    }
  }
  submitting = false;
  send.disabled = !textarea.value.trim();
}

// Sends the draft split into numbered parts, after the user clicked "Send in N parts".
async function submitParts(force, draft = textarea.value) {
  if (submitting || typeof draft !== 'string') return;
  const version = showVersion;
  const submittedText = draft;
  submitting = true;
  send.disabled = true;
  showError('');
  showNotice('');
  partsDraft = submittedText;
  try {
    const result = await window.grokbot.submitParts(submittedText, { force: force === true });
    // Once sending started, the outcome arrives as a progress event (see onPartsProgress).
    if (result.finished || version !== showVersion) return;
    partsDraft = undefined;
    failSubmit(result, (forced) => submitParts(forced, submittedText), submittedText);
  } catch {
    if (version !== showVersion) return;
    partsDraft = undefined;
    failSubmit({ error: 'unexpected' });
  }
}

function succeedSubmit(result, submittedText, retryText) {
  const text = submittedText.trim();
  if (text) history = [...history.filter((item) => item !== text), text].slice(-50);
  historyIndex = null;
  // A retry resends an earlier message; keep whatever the user is typing now.
  if (retryText === undefined) textarea.value = '';
  send.setAttribute('aria-label', t('prompt.sent'));
  send.title = t('prompt.sent');
  send.classList.add('sent');
  if (result.afterSend === 'wait') {
    submitting = false;
    send.disabled = !textarea.value.trim();
    send.setAttribute('aria-label', t('prompt.send'));
    send.title = t('prompt.send');
    send.classList.remove('sent');
    textarea.focus();
  }
  updateLayout();
}

async function submit(force = false, retryText) {
  if (submitting) return;
  const version = showVersion;
  const submittedText = retryText === undefined ? textarea.value : retryText;
  submitting = true;
  send.disabled = true;
  showError('');
  showNotice('');
  try {
    const result = await window.grokbot.submit(submittedText, { force: force === true });
    if (version !== showVersion) return;
    if (result.ok) succeedSubmit(result, submittedText, retryText);
    // Splitting is offered only for the draft, never for a retry of an earlier message.
    else failSubmit(retryText === undefined ? result : { ...result, parts: undefined },
      (forced) => submit(forced, submittedText), submittedText);
  } catch {
    if (version !== showVersion) return;
    showError(t('errors.unexpected'));
    submitting = false;
    send.disabled = !textarea.value.trim();
  }
}

function setTemplates(list) {
  templates = Array.isArray(list) ? list.filter((item) => typeof item?.name === 'string' && typeof item?.text === 'string') : [];
  templatesButton.hidden = templates.length === 0;
  closeTemplates(false);
}

function closeTemplates(focusMessage = true) {
  if (templateMenu.hidden) return;
  templateMenu.hidden = true;
  templateMenu.replaceChildren();
  templatesButton.setAttribute('aria-expanded', 'false');
  updateLayout();
  if (focusMessage) textarea.focus();
}

function insertTemplate(template) {
  closeTemplates();
  textarea.value = applyTemplate(textarea.value, template.text);
  historyIndex = null;
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  updateLayout();
}

function openTemplates() {
  if (!templates.length) {
    showNotice(t('prompt.templates.none'));
    return;
  }
  picker.close();
  templateMenu.replaceChildren(...templates.map((template) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.tabIndex = -1;
    const name = document.createElement('strong');
    name.textContent = template.name;
    const preview = document.createElement('span');
    preview.textContent = template.text;
    item.append(name, preview);
    item.addEventListener('click', () => insertTemplate(template));
    return item;
  }));
  templateMenu.hidden = false;
  templatesButton.setAttribute('aria-expanded', 'true');
  updateLayout();
  templateMenu.firstElementChild.focus();
}

templatesButton.addEventListener('click', () => (templateMenu.hidden ? openTemplates() : closeTemplates()));
// Moving focus anywhere else (clicking the message, tabbing away) closes the menu.
document.addEventListener('focusin', (event) => {
  if (!templateMenu.hidden && !templateMenu.contains(event.target) && event.target !== templatesButton) closeTemplates(false);
});
templateMenu.addEventListener('keydown', (event) => {
  const items = [...templateMenu.children];
  const index = items.indexOf(document.activeElement);
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(index + step + items.length) % items.length].focus();
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    event.stopPropagation();
    items[event.key === 'Home' ? 0 : items.length - 1].focus();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeTemplates();
  } else if (event.key === 'Tab') {
    closeTemplates(false);
  }
});

send.addEventListener('click', () => submit());
document.getElementById('settings').addEventListener('click', () => window.grokbot.openSettings());
textarea.addEventListener('input', () => { historyIndex = null; updateLayout(); });
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key.toLowerCase() === 'k' && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    closeTemplates(false);
    picker.open();
  } else if (event.ctrlKey && event.key.toLowerCase() === 't' && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    if (templateMenu.hidden) openTemplates();
    else closeTemplates();
  } else if (event.target === textarea && !event.isComposing && !event.ctrlKey && !event.altKey && !event.shiftKey
      && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && (textarea.value === '' || historyIndex !== null)) {
    event.preventDefault();
    const index = historyIndex === null ? history.length : historyIndex;
    historyIndex = Math.max(0, Math.min(history.length, index + (event.key === 'ArrowUp' ? -1 : 1)));
    textarea.value = history[historyIndex] || '';
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    updateLayout();
  } else if (event.ctrlKey && event.key === ',' && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    window.grokbot.openSettings();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    window.grokbot.hide();
  } else if (event.target === textarea && event.key === 'Enter' && !event.shiftKey && event.isComposing === false) {
    event.preventDefault();
    submit();
  }
});

window.grokbot.onShow(({ botId, botName, botColor, botInitial, history: savedHistory, conversation: data, waiting: isWaiting, sent: sentMessage,
  partial: isPartial, usage: usageData, notDelivered: failedDelivery, awaitingDelivery: awaitingReceipt, pinned: isPinned, userSized: isUserSized,
  prefill, parts: partsProgress, templates: savedTemplates, assistant: destination, maxLength: limit, assistantError: failure }) => {
  if (Number.isInteger(limit) && limit > 0) maxLength = limit;
  showPinned(Boolean(isPinned));
  setUserSized(isUserSized);
  setTemplates(savedTemplates);
  picker.close();
  loadPickerBots();
  const navigatingHistory = historyIndex !== null;
  history = savedHistory || [];
  const previousIndex = history.indexOf(textarea.value);
  historyIndex = navigatingHistory && previousIndex !== -1 ? previousIndex : null;
  // Text selected in another app fills the prompt (the main process already cut it to the limit).
  // A draft already there is kept, with the selection added after it.
  const selected = prefill && typeof prefill.text === 'string' ? prefill : null;
  if (selected?.text) {
    const text = [...selected.text].slice(0, maxLength).join('');
    textarea.value = textarea.value.trim() ? `${textarea.value.trimEnd()}\n\n${text}` : text;
    historyIndex = null;
  }
  showVersion += 1;
  // While parts are still going out, keep sending blocked until their outcome arrives.
  submitting = Boolean(partsProgress);
  send.disabled = submitting || !textarea.value.trim();
  send.setAttribute('aria-label', t('prompt.send'));
  send.title = t('prompt.send');
  send.classList.remove('sent');
  setBot({ assistant: destination, maxLength: limit, botId, botName, botColor, botInitial });
  assistantError = failure && typeof failure.message === 'string' ? failure : undefined;
  conversation = data || { ok: false };
  waiting = Boolean(isWaiting);
  partial = waiting && Boolean(isPartial);
  timedOut = false;
  notDelivered = Boolean(failedDelivery);
  awaitingDelivery = Boolean(awaitingReceipt);
  setUsage(usageData);
  sent = sentMessage;
  conversationView = false;
  expanded = false;
  renderConversation();
  startRelativeTimer();
  showError('');
  showNotice(!selected ? '' : selected.empty ? t('prompt.selection.empty')
    : selected.clipped ? t('prompt.selection.clipped', { max: maxLength }) : '');
  if (partsProgress) showPartsProgress(partsProgress);
  document.body.classList.remove('opening');
  void document.body.offsetWidth;
  document.body.classList.add('opening');
  textarea.focus();
  if (selected) textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  else textarea.select();
});
