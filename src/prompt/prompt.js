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
const destinationButton = document.getElementById('destination-button');
const botMenu = document.getElementById('bot-menu');
let currentBotId = '';
let history = [];
let historyIndex = null;
let menuVersion = 0;
let copyTimer;

function setBot({ botId, botName, botColor, botInitial }) {
  currentBotId = botId;
  destination.textContent = botName || (botId ? `bot ${botId.slice(0, 8)}` : 'bot padrão');
  avatar.textContent = botInitial;
  avatar.style.backgroundColor = botColor;
}

function closeBotMenu(focus = false) {
  menuVersion += 1;
  botMenu.hidden = true;
  destinationButton.setAttribute('aria-expanded', 'false');
  if (focus) destinationButton.focus();
  updateLayout();
}

async function openBotMenu() {
  if (!botMenu.hidden) { closeBotMenu(true); return; }
  const version = ++menuVersion;
  try {
    const result = await window.grokbot.bots();
    if (version !== menuVersion) return;
    const options = result.ok ? [...result.bots] : [];
    options.push({ id: '', name: 'Bot padrão do Grok Bot', avatar: { color: '#1080f3', initial: 'G' } });
    botMenu.replaceChildren();
    for (const bot of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(bot.id === currentBotId));
      button.tabIndex = bot.id === currentBotId ? 0 : -1;
      const image = document.createElement('span');
      image.className = 'avatar';
      image.textContent = bot.avatar.initial;
      image.style.backgroundColor = bot.avatar.color;
      image.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'menu-name';
      name.textContent = bot.name;
      const check = document.createElement('span');
      check.textContent = bot.id === currentBotId ? '✓' : '';
      check.setAttribute('aria-hidden', 'true');
      button.append(image, name, check);
      button.addEventListener('click', async () => {
        if (submitting) return;
        try {
          const selected = await window.grokbot.selectBot({ botId: bot.id, botName: bot.name });
          if (!selected.ok) { showError('Não foi possível trocar de bot.'); return; }
          setBot(selected.bot);
          conversation = selected.conversation;
          waiting = false;
          timedOut = false;
          sent = undefined;
          conversationView = false;
          expanded = false;
          closeBotMenu();
          renderConversation();
          textarea.focus();
        } catch { showError('Não foi possível trocar de bot.'); }
      });
      botMenu.append(button);
    }
    botMenu.hidden = false;
    destinationButton.setAttribute('aria-expanded', 'true');
    (botMenu.querySelector('[aria-selected="true"]') || botMenu.firstElementChild)?.focus();
    updateLayout();
  } catch { showError('Não foi possível carregar os bots.'); }
}

destinationButton.addEventListener('click', openBotMenu);
botMenu.addEventListener('keydown', (event) => {
  const items = [...botMenu.children];
  const index = items.indexOf(document.activeElement);
  let next;
  if (event.key === 'ArrowDown') next = (index + 1) % items.length;
  else if (event.key === 'ArrowUp') next = (index + items.length - 1) % items.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = items.length - 1;
  else return;
  event.preventDefault();
  for (const item of items) item.tabIndex = -1;
  items[next].tabIndex = 0;
  items[next].focus();
});
document.addEventListener('pointerdown', (event) => {
  if (!botMenu.contains(event.target) && !destinationButton.contains(event.target)) closeBotMenu();
});
document.addEventListener('focusin', (event) => {
  if (!botMenu.hidden && !botMenu.contains(event.target) && event.target !== destinationButton) closeBotMenu();
});
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
  } catch { showError('Não foi possível copiar a resposta.'); }
});
document.getElementById('open-bot').addEventListener('click', async () => {
  try {
    const result = await window.grokbot.openBot();
    if (!result.ok) showError(errors['open-failed']);
  } catch { showError(errors['open-failed']); }
});

function measureResponse() {
  if (response.hidden || conversationView) {
    expandResponse.hidden = true;
    responseBody.classList.remove('overflowing');
    return;
  }
  // Mede sempre na altura recolhida, inclusive depois de expandir.
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
  if (data.bot) {
    setBot(data.bot);
    conversationView = false;
    expanded = false;
  }
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
    measureResponse();
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
  const submittedText = textarea.value;
  submitting = true;
  send.disabled = true;
  showError('');
  try {
    const result = await window.grokbot.submit(submittedText);
    if (version !== showVersion) return;
    if (result.ok) {
      const text = submittedText.trim();
      if (text) history = [...history.filter((item) => item !== text), text].slice(-50);
      historyIndex = null;
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
textarea.addEventListener('input', () => { historyIndex = null; updateLayout(); });
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key.toLowerCase() === 'k' && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    openBotMenu();
  } else if (event.key === 'Escape' && !botMenu.hidden) {
    event.preventDefault();
    closeBotMenu(true);
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

window.grokbot.onShow(({ botId, botName, botColor, botInitial, history: savedHistory, conversation: data, waiting: isWaiting, sent: sentMessage }) => {
  closeBotMenu();
  const navigatingHistory = historyIndex !== null;
  history = savedHistory || [];
  const previousIndex = history.indexOf(textarea.value);
  historyIndex = navigatingHistory && previousIndex !== -1 ? previousIndex : null;
  showVersion += 1;
  submitting = false;
  send.disabled = false;
  send.textContent = 'Enviar ↵';
  send.classList.remove('sent');
  setBot({ botId, botName, botColor, botInitial });
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
