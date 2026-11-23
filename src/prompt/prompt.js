const textarea = document.getElementById('message');
const destination = document.getElementById('destination');
const avatar = document.getElementById('avatar');
const card = document.getElementById('card');
const counter = document.getElementById('counter');
const errorArea = document.getElementById('error');
const send = document.getElementById('send');
const MAX_TEXT_LENGTH = 1000;
const errors = {
  empty: 'Digite uma mensagem.',
  'too-long': 'A mensagem passa de 1000 caracteres.',
  'invalid-bot-id': 'O bot configurado é inválido. Ajuste nas configurações.',
  'open-failed': 'Não foi possível abrir o Grok Bot.',
};
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
const waitingArea = document.getElementById('waiting-area');
let conversation = { ok: false };
let waiting = false;
let timedOut = false;
let sent;
let conversationView = false;
let expanded = false;
let relativeTimer;

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
  if (conversation.latest) responseTime.textContent = `· ${relativeTime(conversation.latest.timestampMs, Date.now())}`;
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
  responseName.textContent = destination.textContent;
  responseAvatar.textContent = avatar.textContent;
  responseAvatar.style.backgroundColor = avatar.style.backgroundColor;
  conversationToggle.textContent = conversationView ? 'Última resposta' : 'Conversa';
  conversationToggle.setAttribute('aria-pressed', String(conversationView));
  responseBody.classList.toggle('collapsed', !expanded && !conversationView);
  responseBody.classList.toggle('expanded', expanded || conversationView);
  expandResponse.hidden = conversationView;
  expandResponse.textContent = expanded ? 'Ver menos' : 'Ver mais';
  expandResponse.setAttribute('aria-expanded', String(expanded));
  if (!response.hidden) {
    if (conversationView) {
      for (const entry of conversation.entries || []) responseBody.append(bubble(entry));
      // Como num chat, abre já nas mensagens mais recentes.
      requestAnimationFrame(() => { responseBody.scrollTop = responseBody.scrollHeight; });
    } else renderMarkdown(responseBody, conversation.latest.text);
  }
  responseBody.classList.remove('new-reply');
  if (animate && !document.hidden) {
    void responseBody.offsetWidth;
    responseBody.classList.add('new-reply');
  }
  waitingArea.replaceChildren();
  waitingArea.hidden = !waiting && !timedOut;
  if (waiting) {
    if (sent) waitingArea.append(bubble(sent));
    const status = document.createElement('p');
    status.className = 'waiting-status';
    status.append(`${destination.textContent} está respondendo`);
    const dots = document.createElement('span');
    dots.className = 'waiting-dots';
    dots.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 3; index += 1) {
      const dot = document.createElement('span');
      dot.textContent = '.';
      dots.append(dot);
    }
    status.append(dots);
    waitingArea.append(status);
  } else if (timedOut) {
    const status = document.createElement('p');
    status.className = 'waiting-status';
    status.textContent = 'A resposta está demorando. Confira no Grok Bot.';
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
  if (!document.hidden) updateTimes();
});
window.grokbot.onConversation((data) => {
  const changed = data.latest && (data.latest.id !== conversation.latest?.id || data.latest.text !== conversation.latest?.text);
  conversation = data;
  waiting = Boolean(data.waiting);
  timedOut = Boolean(data.timedOut);
  sent = data.sent;
  renderConversation(Boolean(changed && !waiting));
});

function updateLayout() {
  const length = [...textarea.value].length;
  counter.textContent = `${length}/${MAX_TEXT_LENGTH}`;
  counter.hidden = length < 800;
  counter.classList.toggle('over-limit', length > MAX_TEXT_LENGTH);
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(192, textarea.scrollHeight)}px`;
    window.grokbot.resize(card.offsetHeight + 40).catch(() => {});
  });
}

function showError(message) {
  errorArea.textContent = message;
  errorArea.hidden = !message;
  updateLayout();
}

async function submit() {
  if (submitting) return;
  const version = showVersion;
  submitting = true;
  send.disabled = true;
  showError('');
  try {
    const result = await window.grokbot.submit(textarea.value);
    if (version !== showVersion) return;
    if (result.ok) {
      textarea.value = '';
      send.textContent = 'Enviado ✓';
      send.classList.add('sent');
      if (result.afterSend === 'wait') {
        submitting = false;
        send.disabled = false;
        send.textContent = 'Enviar ↵';
        send.classList.remove('sent');
        textarea.focus();
      }
      updateLayout();
    } else {
      showError(errors[result.error] || 'Erro inesperado.');
      submitting = false;
      send.disabled = false;
    }
  } catch {
    if (version !== showVersion) return;
    showError('Erro inesperado.');
    submitting = false;
    send.disabled = false;
  }
}

send.addEventListener('click', submit);
document.getElementById('settings').addEventListener('click', () => window.grokbot.openSettings());
textarea.addEventListener('input', updateLayout);
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key === ',' && !event.altKey && !event.shiftKey) {
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

window.grokbot.onShow(({ botId, botName, botColor, botInitial, conversation: data, waiting: isWaiting, sent: sentMessage }) => {
  showVersion += 1;
  submitting = false;
  send.disabled = false;
  send.textContent = 'Enviar ↵';
  send.classList.remove('sent');
  destination.textContent = botName || (botId ? `bot ${botId.slice(0, 8)}` : 'bot padrão');
  avatar.textContent = botInitial;
  avatar.style.backgroundColor = botColor;
  conversation = data || { ok: false };
  waiting = Boolean(isWaiting);
  timedOut = false;
  sent = sentMessage;
  conversationView = false;
  expanded = false;
  renderConversation();
  startRelativeTimer();
  showError('');
  card.classList.remove('opening');
  void card.offsetWidth;
  card.classList.add('opening');
  textarea.focus();
  textarea.select();
});
